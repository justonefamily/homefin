import type { HomeData, Snapshot } from "../types";
import { pruneSnapshots, type StorageAdapter, type StorageKind } from "./adapter";

/**
 * Google Drive and OneDrive both store the home as a JSON file in an app folder,
 * with snapshots as sibling files `homefin-snapshot-<iso>.json`.
 *
 * Both need an OAuth access token obtained in the browser:
 *   Google: Google Identity Services, scope https://www.googleapis.com/auth/drive.appdata
 *   OneDrive: MSAL, scope Files.ReadWrite.AppFolder
 * Set NEXT_PUBLIC_GOOGLE_CLIENT_ID / NEXT_PUBLIC_MS_CLIENT_ID and the Settings
 * screen will offer the connect buttons.
 */
export type TokenProvider = () => Promise<string>;

interface Driver {
  find(name: string): Promise<{ id: string } | null>;
  read(id: string): Promise<string>;
  write(name: string, body: string, id?: string): Promise<string>;
  list(prefix: string): Promise<{ id: string; name: string }[]>;
  remove(id: string): Promise<void>;
}

const FILE = "homefin.json";
const SNAP_PREFIX = "homefin-snapshot-";

class CloudFileAdapter implements StorageAdapter {
  constructor(public kind: StorageKind, public label: string, private d: Driver) {}

  async load() {
    const f = await this.d.find(FILE);
    return f ? (JSON.parse(await this.d.read(f.id)) as HomeData) : null;
  }

  async save(data: HomeData, note = "edit") {
    const existing = await this.d.find(FILE);
    if (existing) {
      const prev = await this.d.read(existing.id);
      await this.d.write(`${SNAP_PREFIX}${new Date().toISOString()}__${encodeURIComponent(note)}.json`, prev);
      // prune > 7 days
      const snaps = await this.d.list(SNAP_PREFIX);
      for (const s of snaps) {
        const takenAt = s.name.slice(SNAP_PREFIX.length).split("__")[0];
        if (pruneSnapshots([{ takenAt }]).length === 0) await this.d.remove(s.id);
      }
    }
    await this.d.write(FILE, JSON.stringify(data), existing?.id);
  }

  async listSnapshots(): Promise<Snapshot[]> {
    const snaps = await this.d.list(SNAP_PREFIX);
    return snaps
      .map((s) => {
        const [takenAt, rest = ""] = s.name.slice(SNAP_PREFIX.length).replace(/\.json$/, "").split("__");
        return { id: s.id, takenAt, by: "you", note: decodeURIComponent(rest) };
      })
      .filter((s) => pruneSnapshots([s]).length)
      .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  }

  async restore(id: string) {
    const data = JSON.parse(await this.d.read(id)) as HomeData;
    await this.save(data, "restored");
    return data;
  }
}

/* ---------------- Google Drive (appDataFolder) ---------------- */

const gdrive = (token: TokenProvider): Driver => {
  const api = async (path: string, init: RequestInit = {}) => {
    const t = await token();
    const r = await fetch(path, { ...init, headers: { Authorization: `Bearer ${t}`, ...(init.headers ?? {}) } });
    if (!r.ok) throw new Error(`Drive ${r.status}`);
    return r;
  };
  return {
    async find(name) {
      const r = await api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${name}'&fields=files(id,name)`);
      const j = await r.json();
      return j.files?.[0] ?? null;
    },
    async read(id) { return (await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).text(); },
    async write(name, body, id) {
      const meta = { name, parents: id ? undefined : ["appDataFolder"] };
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
      form.append("file", new Blob([body], { type: "application/json" }));
      const url = id ? `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart` : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
      const r = await api(url, { method: id ? "PATCH" : "POST", body: form });
      return (await r.json()).id;
    },
    async list(prefix) {
      const r = await api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name contains '${prefix}'&fields=files(id,name)&pageSize=200`);
      return (await r.json()).files ?? [];
    },
    async remove(id) { await api(`https://www.googleapis.com/drive/v3/files/${id}`, { method: "DELETE" }); },
  };
};

/* ---------------- OneDrive (approot) ---------------- */

const onedrive = (token: TokenProvider): Driver => {
  const base = "https://graph.microsoft.com/v1.0/me/drive/special/approot";
  const api = async (path: string, init: RequestInit = {}) => {
    const t = await token();
    const r = await fetch(path, { ...init, headers: { Authorization: `Bearer ${t}`, ...(init.headers ?? {}) } });
    if (!r.ok && r.status !== 404) throw new Error(`OneDrive ${r.status}`);
    return r;
  };
  return {
    async find(name) {
      const r = await api(`${base}:/${name}`);
      return r.status === 404 ? null : { id: (await r.json()).id };
    },
    async read(id) { return (await api(`https://graph.microsoft.com/v1.0/me/drive/items/${id}/content`)).text(); },
    async write(name, body) {
      const r = await api(`${base}:/${name}:/content`, { method: "PUT", body, headers: { "Content-Type": "application/json" } });
      return (await r.json()).id;
    },
    async list(prefix) {
      const r = await api(`${base}/children?$select=id,name&$top=200`);
      const items: { id: string; name: string }[] = (await r.json()).value ?? [];
      return items.filter((i) => i.name.startsWith(prefix));
    },
    async remove(id) { await api(`https://graph.microsoft.com/v1.0/me/drive/items/${id}`, { method: "DELETE" }); },
  };
};

export const googleDriveAdapter = (token: TokenProvider) => new CloudFileAdapter("gdrive", "Google Drive", gdrive(token));
export const oneDriveAdapter = (token: TokenProvider) => new CloudFileAdapter("onedrive", "OneDrive", onedrive(token));
