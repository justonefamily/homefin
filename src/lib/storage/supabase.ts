import type { SupabaseClient } from "@supabase/supabase-js";
import type { HomeData, Snapshot } from "../types";
import type { StorageAdapter } from "./adapter";

/**
 * Supabase: one row per home in `home_data`, a trigger copies the previous
 * version into `home_snapshots` on every save and prunes anything older than 7 days.
 * Row-level security keys everything off `home_members`.
 */
export class SupabaseAdapter implements StorageAdapter {
  kind = "supabase" as const;
  label = "Supabase cloud";

  constructor(private sb: SupabaseClient, private homeId: string) {}

  async load() {
    const { data, error } = await this.sb.from("home_data").select("data").eq("home_id", this.homeId).maybeSingle();
    if (error) throw error;
    return (data?.data as HomeData) ?? null;
  }

  async save(data: HomeData, note = "edit") {
    const { error } = await this.sb.from("home_data").upsert({ home_id: this.homeId, data, note, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async listSnapshots() {
    const { data, error } = await this.sb
      .from("home_snapshots")
      .select("id, taken_at, by_name, note")
      .eq("home_id", this.homeId)
      .order("taken_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id as string, takenAt: r.taken_at as string, by: (r.by_name as string) ?? "auto-save", note: (r.note as string) ?? "" })) as Snapshot[];
  }

  async restore(snapshotId: string) {
    const { data, error } = await this.sb.rpc("restore_home_snapshot", { p_snapshot_id: snapshotId });
    if (error) throw error;
    return data as HomeData;
  }
}
