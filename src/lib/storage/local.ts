import type { HomeData, Snapshot } from "../types";
import { pruneSnapshots, uid, type StorageAdapter } from "./adapter";

const KEY = "homefin:data";
const SNAP_KEY = "homefin:snapshots";

interface StoredSnap extends Snapshot { data: HomeData; }

const read = <T,>(k: string): T | null => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
};
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

/** Browser-local storage. Also what "download / import a file" round-trips through. */
export class LocalAdapter implements StorageAdapter {
  kind = "local" as const;
  label = "This device";

  async load() { return read<HomeData>(KEY); }

  async save(data: HomeData, note = "edit") {
    const prev = read<HomeData>(KEY);
    if (prev) {
      const snaps = pruneSnapshots(read<StoredSnap[]>(SNAP_KEY) ?? []);
      snaps.unshift({ id: uid(), takenAt: new Date().toISOString(), by: "you", note, data: prev });
      write(SNAP_KEY, snaps.slice(0, 200));
    }
    write(KEY, data);
  }

  async listSnapshots() {
    return pruneSnapshots(read<StoredSnap[]>(SNAP_KEY) ?? []).map((s) => ({ id: s.id, takenAt: s.takenAt, by: s.by, note: s.note }));
  }

  async restore(id: string) {
    const snap = (read<StoredSnap[]>(SNAP_KEY) ?? []).find((s) => s.id === id);
    if (!snap) throw new Error("Snapshot not found");
    await this.save(snap.data, `restored ${new Date(snap.takenAt).toLocaleString()}`);
    return snap.data;
  }
}

/* File export / import — works with any adapter. */
export const exportJson = (data: HomeData) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.homeName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const importJson = (file: File): Promise<HomeData> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(String(r.result)) as HomeData;
        if (parsed.version !== 1 || !Array.isArray(parsed.bills)) throw new Error("Not a HomeFin file");
        resolve(parsed);
      } catch (e) { reject(e); }
    };
    r.onerror = reject;
    r.readAsText(file);
  });
