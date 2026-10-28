"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { Shell } from "@/components/hub/Shell";
import { AppTile, AppMark } from "@/components/hub/AppTile";
import { HUB_ICONS } from "@/lib/hubIcons";
import { useApps } from "@/lib/hub";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Modal, cx, inputCls, selectCls } from "@/components/ui";
import type { HubApp } from "@/lib/hubTypes";

const blank: Omit<HubApp, "id"> = { slug: "", name: "", tagline: "", description: "", url: "https://", icon: "sparkles", color: "#0e6b74", status: "soon", sort: 100 };

export default function AdminPage() {
  const { apps, reload } = useApps();
  const [editing, setEditing] = useState<HubApp | "new" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const move = async (a: HubApp, dir: -1 | 1) => {
    if (!apps) return;
    const i = apps.indexOf(a), j = i + dir; if (j < 0 || j >= apps.length) return;
    const b = apps[j]; const sb = createClient();
    await sb.from("hub_apps").update({ sort: b.sort === a.sort ? b.sort + dir : b.sort }).eq("id", a.id);
    await sb.from("hub_apps").update({ sort: a.sort }).eq("id", b.id);
    reload();
  };
  return (
    <Shell admin>
      {() => (
        <>
          <div className="flex items-center justify-between gap-2">
            <div><h1 className="text-2xl font-extrabold tracking-tight">Manage apps</h1><div className="text-sm text-muted">What shows up on the family store, and in what order. <Link href="/" className="text-accent font-semibold">Back to the store</Link></div></div>
            <Button onClick={() => setEditing("new")}><Plus size={14} className="inline -mt-0.5 mr-1" />Add an app</Button>
          </div>
          {err && <Card className="p-3 text-sm text-red">{err}</Card>}
          <div className="flex flex-col gap-3">
            {(apps ?? []).map((a) => (
              <div key={a.id} className="flex items-stretch gap-2">
                <div className="flex-1 min-w-0"><button className="w-full text-left" onClick={() => setEditing(a)}><AppTileStatic app={a} /></button></div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => move(a, -1)} aria-label="Move up" className="flex-1 w-9 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field"><ArrowUp size={14} /></button>
                  <button onClick={() => move(a, 1)} aria-label="Move down" className="flex-1 w-9 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field"><ArrowDown size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          {editing && <AppForm app={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} onError={setErr} />}
        </>
      )}
    </Shell>
  );
}

/** Tile without the link, so the whole thing is one edit button. */
function AppTileStatic({ app }: { app: HubApp }) {
  return <div className="pointer-events-none"><AppTile app={{ ...app, status: app.status === "hidden" ? "hidden" : "soon" }} /></div>;
}

function AppForm({ app, onClose, onSaved, onError }: { app?: HubApp; onClose: () => void; onSaved: () => void; onError: (e: string | null) => void }) {
  const [f, setF] = useState<Omit<HubApp, "id">>(app ? { ...app } : blank);
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); onError(null);
    const sb = createClient();
    const row = { ...f, slug: f.slug || f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") };
    const { error } = app ? await sb.from("hub_apps").update(row).eq("id", app.id) : await sb.from("hub_apps").insert(row);
    setBusy(false);
    if (error) onError(error.message); else onSaved();
  };
  const remove = async () => { if (!app) return; const { error } = await createClient().from("hub_apps").delete().eq("id", app.id); if (error) onError(error.message); else onSaved(); };
  return (
    <Modal open onClose={onClose} title={app ? `Edit ${app.name}` : "Add an app"}>
      <div className="flex items-center gap-4">
        <AppMark app={f} size={64} />
        <Field label="Color"><div className="flex gap-2 items-center"><input type="color" value={f.color} onChange={(e) => set({ color: e.target.value })} className="h-11 w-14 rounded-[10px] border border-chip bg-card p-1" /><input className={cx(inputCls, "flex-1")} value={f.color} onChange={(e) => set({ color: e.target.value })} /></div></Field>
      </div>
      <Field label="Icon">
        <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5">
          {Object.entries(HUB_ICONS).map(([name, Icon]) => (
            <button key={name} type="button" onClick={() => set({ icon: name })} aria-label={name} className={cx("h-10 rounded-[10px] border flex items-center justify-center", f.icon === name ? "border-ink bg-ink text-white" : "border-line bg-card hover:border-field")}><Icon size={18} /></button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input autoFocus className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Status"><select className={selectCls} value={f.status} onChange={(e) => set({ status: e.target.value as HubApp["status"] })}><option value="live">Live</option><option value="beta">Beta</option><option value="soon">Coming soon</option><option value="hidden">Hidden</option></select></Field>
      </div>
      <Field label="One line"><input className={inputCls} value={f.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="What it does, in a sentence" /></Field>
      <Field label="Description"><textarea className={cx(inputCls, "h-auto py-2")} rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      <Field label="Opens at (URL)" hint="Apps on a subdomain of justonefamily.app share this login automatically."><input className={inputCls} value={f.url} onChange={(e) => set({ url: e.target.value })} /></Field>
      <div className="flex gap-2 pt-1">
        {app && <Button variant="danger" onClick={remove}>Remove</Button>}
        <Button className="flex-1" disabled={busy || !f.name.trim() || !f.url.trim()} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </Modal>
  );
}
