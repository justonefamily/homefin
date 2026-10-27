"use client";
import { useEffect, useState } from "react";
import { Home, RotateCcw } from "lucide-react";
import { useHome } from "@/store/useHome";
import { Button, Card, Eyebrow, Field, Modal, Row, cx, inputCls, selectCls } from "@/components/ui";
import { exportJson, importJson } from "@/lib/storage/local";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";
import { STRATEGIES } from "@/lib/strategies";
import type { HomeMember, Invite, StrategyId } from "@/lib/types";

export default function SettingsPage() {
  const { data: d, update, replace, adapter, snapshots, restore, restoredNote, load } = useHome();
  const data = d!;
  const [members, setMembers] = useState<HomeMember[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const cloud = supabaseConfigured() && adapter.kind === "supabase";
  const homeId = cloud ? (adapter as unknown as { homeId: string }).homeId : null;

  const loadMembers = async () => {
    if (!cloud) return;
    const sb = createClient();
    const { data: m } = await sb.from("home_members").select("user_id, role, display_name");
    const { data: inv } = await sb.from("home_invites").select("id, email, role, created_at").is("accepted_at", null);
    setMembers((m ?? []).map((x) => ({ userId: x.user_id, name: x.display_name ?? "Member", email: "", role: x.role })));
    setInvites((inv ?? []).map((x) => ({ id: x.id, email: x.email, role: x.role, createdAt: x.created_at })));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { void loadMembers(); }, [cloud]);

  const invite = async (email: string, role: "editor" | "viewer") => {
    const sb = createClient();
    const { data: row, error } = await sb.from("home_invites").insert({ home_id: homeId, email, role, invited_by: (await sb.auth.getUser()).data.user?.id }).select("token").single();
    if (error) { alert(error.message); return; }
    setInviteLink(`${location.origin}/invite?token=${row.token}`);
    loadMembers();
  };

  const signOut = async () => { await createClient().auth.signOut(); location.href = "/login"; };

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      {restoredNote && (
        <Card className="bg-accent-bg border-accent-line p-3.5 flex items-center gap-2.5 text-[13px] text-accent-deep">
          <RotateCcw size={16} className="shrink-0" /><div><b>Restored the version from {restoredNote}.</b> Everyone in the home now sees it.</div>
        </Card>
      )}

      <div className="md:grid md:grid-cols-2 md:gap-6 flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          <Eyebrow>Home</Eyebrow>
          <Card>
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line-soft">
              <div className="w-10 h-10 rounded-[12px] bg-ink flex items-center justify-center shrink-0"><Home size={18} className="text-white" /></div>
              <div className="flex-1 min-w-0">
                <input value={data.homeName} onChange={(e) => update((h) => ({ ...h, homeName: e.target.value }), "renamed home")} className="text-[15px] font-semibold bg-transparent w-full outline-none focus:bg-surface rounded px-1 -mx-1" aria-label="Home name" />
                <div className="text-xs text-muted">{cloud ? `${members.length} member${members.length === 1 ? "" : "s"} · ${invites.length} invite${invites.length === 1 ? "" : "s"} pending` : "Sign in to share this home with family"}</div>
              </div>
            </div>
            {members.map((m) => <Row key={m.userId} left={<Avatar text={m.name} />} title={m.name} sub={m.role === "owner" ? "owner · full control" : m.role === "editor" ? "can edit bills, budget and plan" : "view only"} rightSub={m.role} rightTone={m.role === "owner" ? "text-accent" : "text-muted"} />)}
            {invites.map((i) => <Row key={i.id} left={<Avatar text="+" dashed />} title={i.email} sub={`invite sent ${new Date(i.createdAt).toLocaleDateString()}`} rightSub="pending" rightTone="text-amber" />)}
            <div className="p-3 flex gap-2">
              <Button className="flex-1" disabled={!cloud} onClick={() => setInviteOpen(true)}>Invite by email or link</Button>
              {cloud && <Button variant="secondary" onClick={signOut}>Sign out</Button>}
            </div>
          </Card>

          <div className="flex items-baseline justify-between pt-1.5"><Eyebrow>Version history</Eyebrow><div className="text-[11px] text-muted">rolling 7 days{cloud ? ", saved to the cloud" : ", on this device"}</div></div>
          <Card>
            <Row left={<Dot on />} title="Current version" sub={`${adapter.label}`} rightSub="current" rightTone="text-green" />
            {snapshots.length === 0 && <div className="px-4 py-3 text-xs text-muted">No earlier versions yet — one is kept every time something changes.</div>}
            {snapshots.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b border-line-soft last:border-b-0">
                <Dot />
                <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold">{new Date(s.takenAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div><div className="text-[11px] text-muted truncate">{s.by} · {s.note}</div></div>
                <button onClick={() => { if (confirm(`Restore the version from ${new Date(s.takenAt).toLocaleString()}? The current version is kept in history too.`)) restore(s.id); }} className="h-9 px-3 rounded-[10px] border border-chip bg-card text-xs font-semibold hover:border-field">Restore</button>
              </div>
            ))}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Eyebrow>Where your data lives</Eyebrow>
          <Card>
            <Row left={<Radio on />} title={adapter.label} sub={adapter.kind === "supabase" ? "Hosted database · shared with your home · 7-day history" : "Encrypted in this browser only · export to keep a copy"} rightSub={adapter.kind === "supabase" ? "recommended" : "offline"} />
            <Row left={<Radio />} title="Google Drive" sub={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? "JSON file in your Drive app folder" : "Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable"} rightSub="free" />
            <Row left={<Radio />} title="OneDrive" sub={process.env.NEXT_PUBLIC_MS_CLIENT_ID ? "JSON file in your OneDrive app folder" : "Set NEXT_PUBLIC_MS_CLIENT_ID to enable"} rightSub="free" />
          </Card>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={() => exportJson(data)}>Export JSON</Button>
            <label className="h-11 rounded-[12px] border border-line bg-card text-[13px] font-semibold flex items-center justify-center cursor-pointer hover:border-field">
              Import file<input type="file" accept="application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f && confirm("Replace this home's data with the file? The current version is kept in history.")) { await replace(await importJson(f), "imported file"); await load(); } }} />
            </label>
          </div>

          <Eyebrow className="pt-1.5">Preferences</Eyebrow>
          <Card>
            <Row onClick={() => setPayOpen(true)} title="Pay schedule" sub={`$${data.pay.monthlyIncome.toLocaleString()}/mo · paid on the ${data.pay.payDays.join(" & ")} · split at the ${data.pay.splitDay}th`} rightSub="edit ›" />
            <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft"><div className="text-sm">Bill reminders</div>
              <select className={cx(selectCls, "w-36 h-9 text-xs")} value={data.settings.reminderDays} onChange={(e) => update((h) => ({ ...h, settings: { ...h.settings, reminderDays: Number(e.target.value) } }), "changed reminders")}>{[1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{n} day{n > 1 ? "s" : ""} before</option>)}</select></div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft"><div className="text-sm">Default strategy</div>
              <select className={cx(selectCls, "w-44 h-9 text-xs")} value={data.settings.strategy} onChange={(e) => update((h) => ({ ...h, settings: { ...h.settings, strategy: e.target.value as StrategyId } }), "changed strategy")}>{STRATEGIES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="flex items-center justify-between px-4 py-3"><div className="text-sm">Everyday spending estimate</div>
              <div className="flex items-center gap-1 text-sm">$<input type="number" className={cx(inputCls, "w-24 h-9 text-xs")} value={data.settings.everydaySpend || ""} onChange={(e) => update((h) => ({ ...h, settings: { ...h.settings, everydaySpend: Number(e.target.value) } }), "changed everyday spend")} aria-label="Everyday spending per month" />/mo</div></div>
          </Card>
        </div>
      </div>

      {inviteOpen && <InviteModal onClose={() => { setInviteOpen(false); setInviteLink(null); }} onInvite={invite} link={inviteLink} />}
      {payOpen && <PayModal onClose={() => setPayOpen(false)} />}
    </>
  );
}

const Avatar = ({ text, dashed }: { text: string; dashed?: boolean }) => (
  <div className={cx("w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0", dashed ? "border border-dashed border-field text-muted" : "bg-ink text-white")}>{text.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</div>
);
const Dot = ({ on }: { on?: boolean }) => <div className={cx("w-2 h-2 rounded-full shrink-0", on ? "bg-green" : "bg-field")} />;
const Radio = ({ on }: { on?: boolean }) => <div className={cx("w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center shrink-0", on ? "border-accent" : "border-field")}>{on && <div className="w-3 h-3 rounded-full bg-accent" />}</div>;

function InviteModal({ onClose, onInvite, link }: { onClose: () => void; onInvite: (email: string, role: "editor" | "viewer") => Promise<void>; link: string | null }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  return (
    <Modal open onClose={onClose} title="Invite to your home">
      {link ? (
        <>
          <div className="text-sm text-muted">Send this link to {email || "them"}. It works once and signs them straight into this home.</div>
          <input readOnly className={inputCls} value={link} onFocus={(e) => e.target.select()} />
          <Button onClick={() => navigator.clipboard?.writeText(link)}>Copy link</Button>
        </>
      ) : (
        <>
          <Field label="Email"><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="spouse@example.com" /></Field>
          <Field label="Role"><select className={selectCls} value={role} onChange={(e) => setRole(e.target.value as "editor")}><option value="editor">Editor — can change bills, budget, plan</option><option value="viewer">Viewer — read only</option></select></Field>
          <Button disabled={!email.includes("@")} onClick={() => onInvite(email, role)}>Create invite</Button>
        </>
      )}
    </Modal>
  );
}

function PayModal({ onClose }: { onClose: () => void }) {
  const { data: d, update } = useHome();
  const data = d!;
  const [income, setIncome] = useState(data.pay.monthlyIncome);
  const [days, setDays] = useState(data.pay.payDays.join(", "));
  const [split, setSplit] = useState(data.pay.splitDay);
  return (
    <Modal open onClose={onClose} title="Pay schedule">
      <Field label="Take-home income per month ($)"><input className={inputCls} type="number" inputMode="decimal" value={income || ""} onChange={(e) => setIncome(Number(e.target.value))} /></Field>
      <Field label="Paydays (days of month)" hint="Comma-separated. Twice a month = 1, 16. Monthly = 1."><input className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
      <Field label="Pay-period split day" hint="Bills on or before this day belong to the first half of the month."><input className={inputCls} type="number" min={1} max={28} value={split} onChange={(e) => setSplit(Number(e.target.value))} /></Field>
      <Button onClick={() => { const payDays = days.split(/[,\s]+/).map(Number).filter((n) => n >= 1 && n <= 31); update((h) => ({ ...h, pay: { monthlyIncome: income, payDays: payDays.length ? payDays : [1], splitDay: Math.max(1, Math.min(28, split)) } }), "updated pay schedule"); onClose(); }}>Save</Button>
    </Modal>
  );
}
