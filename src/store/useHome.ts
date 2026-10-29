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
  /** Set once the user has gone through the welcome screen in this session (or the home has real data). */
  onboarded: boolean;
  error?: string;
  savedAt?: string;
  restoredNote?: string;
  /** Mutations are "edit, then persist"; every save snapshots the previous version. */
  setAdapter(a: StorageAdapter): Promise<void>;
  load(): Promise<void>;
  update(fn: (d: HomeData) => HomeData, note?: string): Promise<void>;
  replace(d: HomeData, note?: string, keepHistory?: boolean): Promise<void>;
  loadSample(): Promise<void>;
  startFresh(name: string): Promise<void>;
  refreshSnapshots(): Promise<void>;
  restore(id: string): Promise<void>;
  /** True while an edit is still waiting to reach the cloud (network dropped). */
  pending: boolean;
  /** Try the pending save again now (also runs automatically when the connection comes back). */
  retrySave(): Promise<void>;
  /** Steps back through changes made in this session (what each change was is in `note`). */
  undoStack: { data: HomeData; note: string }[];
  redoStack: { data: HomeData; note: string }[];
  undo(): Promise<void>;
  redo(): Promise<void>;
}
const UNDO_LIMIT = 50;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isNetwork = (e: unknown) => /failed to fetch|load failed|networkerror|network request failed/i.test((e as Error)?.message ?? "");
/** Save with a few retries for the "Failed to fetch" family — a phone hopping networks, a tab waking up. */
async function saveWithRetry(adapter: StorageAdapter, data: HomeData, note: string) {
  for (let attempt = 0; ; attempt++) {
    try { await adapter.save(data, note); return; }
    catch (e) {
      if (!isNetwork(e) || attempt >= 3) throw e;
      await wait(600 * 2 ** attempt);
    }
  }
}
let pendingNote = "edit";

export const useHome = create<HomeStore>((set, get) => ({
  adapter: new LocalAdapter(),
  data: null,
  snapshots: [],
  status: "idle",
  onboarded: false,
  pending: false,
  undoStack: [],
  redoStack: [],

  async undo() {
    const { undoStack, data } = get();
    const last = undoStack[undoStack.length - 1];
    if (!last || !data) return;
    set({ undoStack: undoStack.slice(0, -1), redoStack: [...get().redoStack, { data, note: last.note }].slice(-UNDO_LIMIT) });
    await get().replace(last.data, `undo: ${last.note}`, true);
  },
  async redo() {
    const { redoStack, data } = get();
    const next = redoStack[redoStack.length - 1];
    if (!next || !data) return;
    set({ redoStack: redoStack.slice(0, -1), undoStack: [...get().undoStack, { data, note: next.note }].slice(-UNDO_LIMIT) });
    await get().replace(next.data, `redo: ${next.note}`, true);
  },

  async retrySave() {
    const d = get().data;
    if (!d || !get().pending) return;
    set({ status: "saving" });
    try {
      await saveWithRetry(get().adapter, d, pendingNote);
      set({ status: "idle", pending: false, error: undefined, savedAt: new Date().toISOString() });
      await get().refreshSnapshots();
    } catch (e) {
      set({ status: "error", error: (e as Error).message });
    }
  },

  async setAdapter(adapter) {
    set({ adapter, data: null });
    await get().load();
  },

  async load() {
    set({ status: "loading", error: undefined });
    try {
      const data = await get().adapter.load();
      const hasContent = !!data && (data.setupDone === true || data.bills.length > 0 || data.accounts.length > 0 || data.pay.monthlyIncome > 0);
      set({ data, status: "idle", onboarded: get().onboarded || hasContent });
      await get().refreshSnapshots();
    } catch (e) {
      set({ status: "error", error: (e as Error).message });
    }
  },

  async update(fn, note = "edit") {
    const cur = get().data;
    if (!cur) return;
    const next = fn(cur);
    if (next === cur) return;
    set({ data: next, status: "saving", pending: true, undoStack: [...get().undoStack, { data: cur, note }].slice(-UNDO_LIMIT), redoStack: [] });
    pendingNote = note;
    // Debounce rapid edits into one save (and one snapshot).
    if (saveTimer) clearTimeout(saveTimer);
    await new Promise<void>((resolve) => {
      saveTimer = setTimeout(async () => {
        try {
          await saveWithRetry(get().adapter, get().data!, note);
          set({ status: "idle", pending: false, error: undefined, savedAt: new Date().toISOString() });
          await get().refreshSnapshots();
        } catch (e) {
          set({ status: "error", error: isNetwork(e) ? "no connection — your change is kept here and will save when you're back online" : (e as Error).message });
        }
        resolve();
      }, 400);
    });
  },

  async replace(d0, note = "import", keepHistory = false) {
    const d = { ...d0, setupDone: true };
    const cur = get().data;
    set({ data: d, status: "saving", onboarded: true, pending: true, ...(keepHistory || !cur ? {} : { undoStack: [...get().undoStack, { data: cur, note }].slice(-UNDO_LIMIT), redoStack: [] }) });
    pendingNote = note;
    try {
      await saveWithRetry(get().adapter, d, note);
      set({ status: "idle", pending: false, error: undefined, savedAt: new Date().toISOString() });
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
