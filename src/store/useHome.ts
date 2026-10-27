"use client";
import { create } from "zustand";
import type { HomeData, Snapshot } from "@/lib/types";
import { emptyHome } from "@/lib/types";
import type { StorageAdapter } from "@/lib/storage/adapter";
import { LocalAdapter } from "@/lib/storage/local";
import { sampleHome } from "@/lib/sample-data";

interface HomeStore {
  adapter: StorageAdapter;
  data: HomeData | null;
  snapshots: Snapshot[];
  status: "idle" | "loading" | "saving" | "error";
  error?: string;
  savedAt?: string;
  restoredNote?: string;
  /** Mutations are "edit, then persist"; every save snapshots the previous version. */
  setAdapter(a: StorageAdapter): Promise<void>;
  load(): Promise<void>;
  update(fn: (d: HomeData) => HomeData, note?: string): Promise<void>;
  replace(d: HomeData, note?: string): Promise<void>;
  loadSample(): Promise<void>;
  startFresh(name: string): Promise<void>;
  refreshSnapshots(): Promise<void>;
  restore(id: string): Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useHome = create<HomeStore>((set, get) => ({
  adapter: new LocalAdapter(),
  data: null,
  snapshots: [],
  status: "idle",

  async setAdapter(adapter) {
    set({ adapter, data: null });
    await get().load();
  },

  async load() {
    set({ status: "loading", error: undefined });
    try {
      const data = await get().adapter.load();
      set({ data, status: "idle" });
      await get().refreshSnapshots();
    } catch (e) {
      set({ status: "error", error: (e as Error).message });
    }
  },

  async update(fn, note = "edit") {
    const cur = get().data;
    if (!cur) return;
    const next = fn(cur);
    set({ data: next, status: "saving" });
    // Debounce rapid edits into one save (and one snapshot).
    if (saveTimer) clearTimeout(saveTimer);
    await new Promise<void>((resolve) => {
      saveTimer = setTimeout(async () => {
        try {
          await get().adapter.save(get().data!, note);
          set({ status: "idle", savedAt: new Date().toISOString() });
          await get().refreshSnapshots();
        } catch (e) {
          set({ status: "error", error: (e as Error).message });
        }
        resolve();
      }, 400);
    });
  },

  async replace(d, note = "import") {
    set({ data: d, status: "saving" });
    try {
      await get().adapter.save(d, note);
      set({ status: "idle", savedAt: new Date().toISOString() });
      await get().refreshSnapshots();
    } catch (e) {
      set({ status: "error", error: (e as Error).message });
    }
  },

  loadSample: () => get().replace(sampleHome(), "loaded sample data"),
  startFresh: (name) => get().replace(emptyHome(name), "created home"),

  async refreshSnapshots() {
    try { set({ snapshots: await get().adapter.listSnapshots() }); } catch { /* non-fatal */ }
  },

  async restore(id) {
    set({ status: "loading" });
    try {
      const snap = get().snapshots.find((s) => s.id === id);
      const data = await get().adapter.restore(id);
      set({ data, status: "idle", restoredNote: snap ? new Date(snap.takenAt).toLocaleString() : "snapshot" });
      await get().refreshSnapshots();
    } catch (e) {
      set({ status: "error", error: (e as Error).message });
    }
  },
}));
