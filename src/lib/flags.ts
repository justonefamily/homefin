import type { Flag, HomeData } from "./types";

/** Flag queue helpers: toggle a flag on something, find it, resolve it. */
export const findFlag = (data: HomeData, kind: Flag["kind"], ref: string) => (data.flags ?? []).find((f) => f.kind === kind && f.ref === ref && !f.done);

export function toggleFlag(data: HomeData, kind: Flag["kind"], ref: string, label: string, id: string, note?: string): HomeData {
  const existing = findFlag(data, kind, ref);
  const flags = existing ? (data.flags ?? []).filter((f) => f !== existing) : [...(data.flags ?? []), { id, kind, ref, label, note, at: new Date().toISOString() }];
  return { ...data, flags };
}

export const setFlagNote = (data: HomeData, id: string, note: string): HomeData => ({ ...data, flags: (data.flags ?? []).map((f) => (f.id === id ? { ...f, note } : f)) });
export const resolveFlag = (data: HomeData, id: string, done = true): HomeData => ({ ...data, flags: (data.flags ?? []).map((f) => (f.id === id ? { ...f, done } : f)) });
export const removeFlag = (data: HomeData, id: string): HomeData => ({ ...data, flags: (data.flags ?? []).filter((f) => f.id !== id) });
export const openFlags = (data: HomeData) => (data.flags ?? []).filter((f) => !f.done).sort((a, b) => b.at.localeCompare(a.at));
