import type { HomeData, Snapshot } from "../types";

export type StorageKind = "local" | "supabase" | "gdrive" | "onedrive";

/**
 * Every place a home's data can live implements this. The whole home is one JSON
 * document, so "save to Drive", "save locally" and "save to Supabase" are the same
 * operation pointed at a different place — and rollback is just loading an older copy.
 */
export interface StorageAdapter {
  kind: StorageKind;
  label: string;
  load(): Promise<HomeData | null>;
  save(data: HomeData, note?: string): Promise<void>;
  listSnapshots(): Promise<Snapshot[]>;
  restore(snapshotId: string): Promise<HomeData>;
}

export const SNAPSHOT_DAYS = 7;

export const pruneSnapshots = <T extends { takenAt: string }>(snaps: T[], now = Date.now()) =>
  snaps.filter((s) => now - new Date(s.takenAt).getTime() <= SNAPSHOT_DAYS * 86_400_000);

export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
