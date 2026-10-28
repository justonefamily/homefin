"use client";
import { useEffect, useState } from "react";
import { ChevronDown, Home, RotateCcw } from "lucide-react";
import { useHome } from "@/store/useHome";
import { Button, Card, Eyebrow, Field, Modal, Row, byName, cx, inputCls, selectCls } from "@/components/ui";
import { exportJson, importJson } from "@/lib/storage/local";
import { InstallCard } from "@/components/PWA";
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
  const [historyOpen, setHistoryOpen] = useState(false);
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

          <Card>
            <button onClick={() => setHistoryOpen(!historyOpen)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface/60">
              <Dot on />
              <div className="flex-1 min-w-0"><div className="text-sm font-semibold">Version history</div><div className="text-[11px] text-muted">{snapshots.length} earlier version{snapshots.length === 1 ? "" : "s"} in the last 7 days{snapshots[0] ? ` · latest ${new Date(snapshots[0].takenAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</div></div>
              <ChevronDown size={16} className={cx("text-muted transition-transform", historyOpen && "rotate-180")} />
            </button>
            {historyOpen && (
              <div className="border-t border-line-soft max-h-72 overflow-y-auto">
                {snapshots.length === 0 && <div className="px-4 py-3 text-xs text-muted">No earlier versions yet — one is kept every time something changes.</div>}
                {snapshots.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2 border-b border-line-soft last:border-b-0">
                    <div className="flex-1 min-w-0 text-[12px]"><span className="font-semibold">{new Date(s.takenAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span> <span className="text-muted">· {s.by} · {s.note}</span></div>
                    <button onClick={() => { if (confirm(`Restore the version from ${new Date(s.takenAt).toLocaleString()}? The current version is kept in history too.`)) restore(s.id); }} className="h-7 px-2.5 rounded-[8px] border border-chip bg-card text-[11px] font-semibold hover:border-field">Restore</button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <InstallCard />
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

          <Card className="p-4 flex flex-col gap-2">
            <div className="text-[13px] font-semibold">Your history stays yours</div>
            <div className="text-[12px] text-muted leading-relaxed">Banks hand over up to 24 months when you first connect, and from then on every new transaction is added and kept. Nothing ages out — in two years you&apos;ll have four years of history, in five you&apos;ll have seven. Export JSON any time for your own copy.</div>
          </Card>

          {adapter.kind === "supabase" && (
            <Card className="p-4 flex flex-col gap-2 border-red/30">
              <div className="text-[13px] font-semibold text-red">Delete this home</div>
              <div className="text-[12px] text-muted leading-relaxed">We hold everything for <b className="text-ink">30 days</b> — sign in during that time and tap Restore and nothing is lost. After 30 days the home, its history, settings and bank links are permanently erased from our systems.</div>
              <Button variant="danger" className="self-start h-9 text-xs" onClick={async () => {
                if (!confirm("Schedule this home for deletion? You have 30 days to restore it by signing in.")) return;
                const sb = createClient();
                const { data: members } = await sb.from("home_members").select("home_id").limit(1);
                const homeId = members?.[0]?.home_id as string | undefined;
                if (!homeId) return;
                const { error } = await sb.rpc("request_home_deletion", { p_home: homeId });
                if (error) { alert(error.message); return; }
                location.reload();
              }}>Delete home…</Button>
            </Card>
          )}

          <Eyebrow className="pt-1.5">Preferences</Eyebrow>
          <Card>
            <Row onClick={() => setPayOpen(true)} title="Pay schedule (fallback)" sub={(data.incomeSources?.length ?? 0) > 0 ? `Projections use your Income sources · split at the ${data.pay.splitDay}th` : `$${data.pay.monthlyIncome.toLocaleString()}/mo · paid on the ${data.pay.payDays.join(" & ")} · split at the ${data.pay.splitDay}th`} rightSub="edit ›" />
            <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft"><div className="text-sm">Bill reminders</div>
              <select className={cx(selectCls, "w-36 h-9 text-xs")} value={data.settings.reminderDays} onChange={(e) => update((h) => ({ ...h, settings: { ...h.settings, reminderDays: Number(e.target.value) } }), "changed reminders")}>{[1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{n} day{n > 1 ? "s" : ""} before</option>)}</select></div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft"><div className="text-sm">Default strategy</div>
              <select className={cx(selectCls, "w-44 h-9 text-xs")} value={data.settings.strategy} onChange={(e) => update((h) => ({ ...h, settings: { ...h.settings, strategy: e.target.value as StrategyId } }), "changed strategy")}>{[...STRATEGIES].sort(byName).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
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
  const [mode, setMode] = useState<"halves" | "paydays" | "custom">(data.pay.periodMode ?? "halves");
  const [periods, setPeriods] = useState<{ payDay: number; from: number; to: number }[]>(data.pay.periods?.length ? data.pay.periods : (data.pay.payDays.length >= 2 ? [{ payDay: data.pay.payDays[0], from: data.pay.payDays[0], to: data.pay.payDays[1] - 1 }, { payDay: data.pay.payDays[1], from: data.pay.payDays[1], to: data.pay.payDays[0] - 1 || 31 }] : [{ payDay: data.pay.payDays[0] ?? 1, from: data.pay.payDays[0] ?? 1, to: 31 }]));
  const setP = (i: number, patch: Partial<{ payDay: number; from: number; to: number }>) => setPeriods(periods.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const dayWord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
  return (
    <Modal open onClose={onClose} title="Pay schedule">
      <Field label="Take-home income per month ($)"><input className={inputCls} type="number" inputMode="decimal" value={income || ""} onChange={(e) => setIncome(Number(e.target.value))} /></Field>
      <Field label="Paydays (days of month)" hint="Comma-separated. Twice a month = 1, 16. Monthly = 1."><input className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
      <Field label="Pay periods" hint={mode === "paydays" ? "Each period starts on a payday and runs to the day before the next one. Paid the 15th & 30th: the Sep 30 check covers Sep 30 – Oct 14, the Oct 15 check covers Oct 15 – 29, and so on." : "Two halves: the 1st to the split day, then the split day + 1 to the end of the month."}>
        <select className={selectCls} value={mode} onChange={(e) => setMode(e.target.value as "halves" | "paydays" | "custom")}><option value="custom">Set each paycheck&apos;s dates</option><option value="paydays">Start on my paydays</option><option value="halves">Halves of the month</option></select>
      </Field>
      {mode === "custom" && (
        <div className="flex flex-col gap-2">
          {periods.map((p, i) => (
            <div key={i} className="rounded-[12px] border border-line p-3 flex flex-col gap-2">
              <div className="text-[12px] font-semibold">Paycheck {i + 1}</div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Paid on day"><input className={inputCls} type="number" min={1} max={31} value={p.payDay} onChange={(e) => setP(i, { payDay: Number(e.target.value) })} /></Field>
                <Field label="Covers from day"><input className={inputCls} type="number" min={1} max={31} value={p.from} onChange={(e) => setP(i, { from: Number(e.target.value) })} /></Field>
                <Field label="Through day"><input className={inputCls} type="number" min={1} max={31} value={p.to} onChange={(e) => setP(i, { to: Number(e.target.value) })} /></Field>
              </div>
              <div className="text-[11px] text-muted">Covers the {dayWord(p.from)} through the {dayWord(p.to)}{p.to < p.from ? " of the next month" : p.to >= 31 ? " (end of month)" : ""}.</div>
            </div>
          ))}
          <div className="flex gap-2">
            {periods.length < 2 && <Button variant="secondary" onClick={() => setPeriods([...periods, { payDay: 16, from: 16, to: 31 }])} className="h-9 text-xs">+ Second paycheck</Button>}
            {periods.length > 1 && <Button variant="secondary" onClick={() => setPeriods(periods.slice(0, 1))} className="h-9 text-xs">Just one paycheck</Button>}
          </div>
        </div>
      )}
      {mode === "halves" && <Field label="Split day" hint="Bills on or before this day belong to the first half."><input className={inputCls} type="number" min={1} max={28} value={split} onChange={(e) => setSplit(Number(e.target.value))} /></Field>}
      <Button onClick={() => { const payDays = days.split(/[,\s]+/).map(Number).filter((n) => n >= 1 && n <= 31); update((h) => ({ ...h, pay: { monthlyIncome: income, payDays: mode === "custom" ? periods.map((p) => p.payDay) : payDays.length ? payDays : [1], splitDay: Math.max(1, Math.min(28, split)), periodMode: mode, periods: mode === "custom" ? periods : h.pay.periods } }), "updated pay schedule"); onClose(); }}>Save</Button>
    </Modal>
  );
}
