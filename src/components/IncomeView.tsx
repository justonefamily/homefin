"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useHome } from "@/store/useHome";
import { DepositSheet } from "./ItemSheet";
import { Button, Card, Eyebrow, Field, Modal, Stat, cx, inputCls, money, selectCls } from "./ui";
import { detectIncome, expectedMonthlyIncome, groupDeposits, matchIncomeEvents, merchantKey, monthlyOf, receivedInMonth, suggestionToSource, unreviewedDeposits, type IncomeSuggestion } from "@/lib/detect";
import { monthKey } from "@/lib/strategies";
import type { IncomeEvent, IncomeSource } from "@/lib/types";
import { uid } from "@/lib/storage/adapter";

const CADENCE_LABEL: Record<IncomeSource["cadence"], string> = { weekly: "weekly", biweekly: "every 2 weeks", semimonthly: "twice a month", monthly: "monthly" };

export function IncomeView({ today }: { today: Date }) {
  const { data: d, update } = useHome();
  const data = d!;
  const month = monthKey(today);
  const sources = data.incomeSources ?? [];
  const suggestions = detectIncome(data, today);
  const pending = unreviewedDeposits(data);
  const expected = expectedMonthlyIncome(data);
  const received = receivedInMonth(data, month);
  const [editing, setEditing] = useState<IncomeSource | "new" | null>(null);

  const addSource = (sg: IncomeSuggestion, kind: IncomeSource["kind"]) => update((h) => {
    const next = { ...h, incomeSources: [...(h.incomeSources ?? []), suggestionToSource(sg, uid(), kind)] };
    return { ...next, income: matchIncomeEvents(next) ?? next.income };
  }, `added income source ${sg.source}`);
  const ignoreSuggestion = (sg: IncomeSuggestion) => update((h) => ({ ...h, settings: { ...h.settings, dismissedIncome: [...(h.settings.dismissedIncome ?? []), sg.key] }, income: (h.income ?? []).map((e) => (merchantKey(e.source) === sg.key && !e.sourceId ? { ...e, status: "ignored" as const } : e)) }), `ignored ${sg.source}`);
  const setEvent = (id: string, status: IncomeEvent["status"]) => update((h) => ({ ...h, income: (h.income ?? []).map((e) => (e.id === id ? { ...e, status } : e)) }), status ? `${status} deposit` : "unreviewed deposit");
  const setMany = (ids: string[], status: NonNullable<IncomeEvent["status"]>, alwaysIgnoreKey?: string) => update((h) => ({
    ...h,
    income: (h.income ?? []).map((e) => (ids.includes(e.id) ? { ...e, status } : e)),
    settings: alwaysIgnoreKey ? { ...h.settings, dismissedIncome: [...new Set([...(h.settings.dismissedIncome ?? []), alwaysIgnoreKey])] } : h.settings,
  }), `${status} ${ids.length} deposits`);
  const saveSource = (s: IncomeSource) => update((h) => { const next = { ...h, incomeSources: (h.incomeSources ?? []).some((x) => x.id === s.id) ? (h.incomeSources ?? []).map((x) => (x.id === s.id ? s : x)) : [...(h.incomeSources ?? []), s] }; return { ...next, income: matchIncomeEvents(next) ?? next.income }; }, `saved income ${s.name}`);
  const removeSource = (id: string, alsoIgnore: boolean) => update((h) => {
    const src = (h.incomeSources ?? []).find((x) => x.id === id);
    return { ...h, incomeSources: (h.incomeSources ?? []).filter((x) => x.id !== id), income: (h.income ?? []).map((e) => (e.sourceId === id ? { ...e, sourceId: undefined, status: alsoIgnore ? "ignored" as const : undefined } : e)),
      settings: alsoIgnore && src?.merchant ? { ...h.settings, dismissedIncome: [...(h.settings.dismissedIncome ?? []), src.merchant] } : h.settings };
  }, "removed income source");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2.5 md:max-w-xl">
        <Stat dark label="Expected / month" value={money(expected)} />
        <Stat label={`Received (${today.toLocaleString("en-US", { month: "short" })})`} value={money(received)} tone={received >= expected ? "green" : undefined} />
        <Stat label="Still expected" value={money(Math.max(0, expected - received))} />
      </div>
      <div className="text-xs text-muted">Expected is your projection; received is what actually landed. The number in Settings is only used until you add a source here.</div>

      {suggestions.length > 0 && (
        <Card className="p-4 flex flex-col gap-3 border-accent-line bg-accent-bg/40">
          <div className="flex items-center gap-2"><Sparkles size={16} className="text-accent" /><div className="text-sm font-semibold">Looks like regular income</div></div>
          {suggestions.map((sg) => (
            <div key={sg.key} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-[12px] bg-card border border-line px-3 py-2.5">
              <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate">{sg.source}</div><div className="text-[11px] text-muted">{money(sg.perPaycheck)} {CADENCE_LABEL[sg.cadence]}{sg.cadence === "semimonthly" || sg.cadence === "monthly" ? ` on the ${sg.payDays.join(" & ")}` : ""} · about {money(sg.monthly)}/mo · seen {sg.occurrences}×</div></div>
              <div className="flex gap-1.5 shrink-0 flex-wrap">
                <button onClick={() => addSource(sg, "paycheck")} className="h-9 px-3 rounded-[10px] bg-accent text-white text-xs font-semibold hover:bg-accent-deep">Paycheck</button>
                <button onClick={() => addSource(sg, "other")} className="h-9 px-3 rounded-[10px] border border-chip bg-card text-xs font-semibold hover:border-field">Other income</button>
                <button onClick={() => ignoreSuggestion(sg)} className="h-9 px-3 rounded-[10px] text-xs font-semibold text-muted hover:bg-surface">Ignore</button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div className="flex items-center justify-between"><Eyebrow>Expected income</Eyebrow><button onClick={() => setEditing("new")} className="text-xs font-semibold text-accent">+ Add manually</button></div>
      <Card>
        {sources.length === 0 && <div className="p-4 text-sm text-muted">No income sources yet. Confirm one above, or add one manually.</div>}
        {sources.map((s) => {
          const got = (data.income ?? []).filter((e) => e.sourceId === s.id && e.date.startsWith(month));
          const gotSum = got.reduce((a, e) => a + e.amount, 0);
          const expMonth = monthlyOf(s.expected, s.cadence);
          return (
            <button key={s.id} onClick={() => setEditing(s)} className="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-line-soft last:border-b-0 hover:bg-surface/60">
              <div className={cx("w-2 h-2 rounded-full shrink-0", s.kind === "paycheck" ? "bg-accent" : "bg-gold")} />
              <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{s.name}</div><div className="text-[11px] text-muted">{s.kind === "paycheck" ? "Paycheck" : "Other income"} · {money(s.expected)} {CADENCE_LABEL[s.cadence]}{s.cadence === "semimonthly" || s.cadence === "monthly" ? ` on the ${s.payDays.join(" & ")}` : ""}</div></div>
              <div className="text-right"><div className="text-sm font-semibold">{money(gotSum)} <span className="text-muted font-normal">/ {money(expMonth)}</span></div><div className={cx("text-[11px] font-semibold", gotSum >= expMonth ? "text-green" : got.length ? "text-amber" : "text-muted")}>{got.length ? `${got.length} deposit${got.length > 1 ? "s" : ""} this month` : "nothing yet this month"}</div></div>
            </button>
          );
        })}
      </Card>

      {pending.length > 0 && (
        <>
          <div className="flex items-center justify-between"><Eyebrow>Money in — needs a decision</Eyebrow><div className="text-[11px] text-muted">{pending.length} deposit{pending.length === 1 ? "" : "s"}</div></div>
          <div className="flex flex-col gap-3">
            {groupDeposits(pending).map((g) => (
              <Card key={g.key}>
                {g.items.length > 1 && (
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line bg-surface/60 flex-wrap">
                    <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate">{g.label}</div><div className="text-[11px] text-muted">{g.items.length} deposits{g.sameAmount ? ` · same amount ${money(g.items[0].amount)}` : ""} · {money(g.total)} total</div></div>
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => setMany(g.items.map((e) => e.id), "counted")} className="h-8 px-2.5 rounded-[8px] bg-accent text-white text-[11px] font-semibold">Count all {g.items.length}</button>
                      <button onClick={() => setMany(g.items.map((e) => e.id), "refund")} title="A merchant giving money back — offsets spending, isn't income" className="h-8 px-2.5 rounded-[8px] border border-chip bg-card text-[11px] font-semibold hover:border-field">All refunds</button>
                      <button onClick={() => setMany(g.items.map((e) => e.id), "ignored")} className="h-8 px-2.5 rounded-[8px] border border-chip bg-card text-[11px] font-semibold hover:border-field">Ignore all {g.items.length}</button>
                      <button onClick={() => setMany(g.items.map((e) => e.id), "ignored", g.key)} title="Ignore these and never ask about this payer again" className="h-8 px-2.5 rounded-[8px] text-[11px] font-semibold text-muted hover:bg-surface">Always ignore</button>
                    </div>
                  </div>
                )}
                {g.items.slice(0, 12).map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-line-soft last:border-b-0">
                    <div className="flex-1 min-w-0"><div className={cx("text-[13px] truncate", g.items.length > 1 ? "text-muted" : "font-semibold")}>{g.items.length > 1 ? new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : e.source}</div>{g.items.length === 1 && <div className="text-[11px] text-muted">{new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>}</div>
                    <div className="text-sm font-semibold mr-1">{money(e.amount)}</div>
                    <button onClick={() => setEvent(e.id, "counted")} className="h-8 px-2.5 rounded-[8px] bg-accent text-white text-[11px] font-semibold">{g.items.length > 1 ? "Count" : "Count as income"}</button>
                    <button onClick={() => setEvent(e.id, "refund")} title="A merchant giving money back — offsets spending, isn't income" className="h-8 px-2.5 rounded-[8px] text-[11px] font-semibold text-muted hover:bg-surface">Refund</button>
                    <button onClick={() => setEvent(e.id, "ignored")} className="h-8 px-2.5 rounded-[8px] text-[11px] font-semibold text-muted hover:bg-surface">Ignore</button>
                  </div>
                ))}
                {g.items.length > 12 && <div className="px-4 py-2 text-[11px] text-muted">+{g.items.length - 12} more from this payer — use the buttons above to decide them all at once.</div>}
              </Card>
            ))}
          </div>
          <div className="text-[11px] text-muted">Transfers between your own accounts, refunds and reimbursements are usually &quot;Ignore&quot;. Gifts, side work and one-off payments are &quot;Count as income&quot;.</div>
        </>
      )}

      <Reviewed data={data} month={month} setEvent={setEvent} />

      {editing && <SourceForm src={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={saveSource} onRemove={removeSource} />}
    </div>
  );
}

function Reviewed({ data, month, setEvent }: { data: ReturnType<typeof useHome.getState>["data"] & object; month: string; setEvent: (id: string, s: IncomeEvent["status"]) => void }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<IncomeEvent | null>(null);
  const items = (data.income ?? []).filter((e) => e.date.startsWith(month) && (e.status || e.sourceId)).sort((a, b) => b.date.localeCompare(a.date));
  if (!items.length) return null;
  // One row per payer: "FLORA payroll · 2× · $9,500", expandable to the individual deposits.
  const groups = groupDeposits(items).map((g) => {
    const src = g.items.find((e) => e.sourceId) ? data.incomeSources?.find((s) => s.id === g.items.find((e) => e.sourceId)!.sourceId) : undefined;
    const counted = g.items.filter((e) => e.status !== "ignored" && e.status !== "refund");
    const refunds = g.items.filter((e) => e.status === "refund");
    return { ...g, label: src?.name ?? g.label, countedTotal: counted.reduce((s, e) => s + e.amount, 0), allIgnored: counted.length === 0, allRefunds: refunds.length === g.items.length, latest: g.items[0] };
  });
  return (
    <div className="flex flex-col gap-2">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between text-left"><Eyebrow>Received this month ({groups.length} payer{groups.length === 1 ? "" : "s"} · {items.length} deposit{items.length === 1 ? "" : "s"})</Eyebrow><span className="text-xs text-accent font-semibold">{open ? "Hide" : "Show"}</span></button>
      {open && (
        <Card>
          {groups.map((g) => (
            <div key={g.key} className="border-b border-line-soft last:border-b-0">
              <div className="flex items-center gap-3 px-4 py-2.5">
                <button onClick={() => setExpanded(expanded === g.key ? null : g.key)} aria-expanded={expanded === g.key} className="flex-1 min-w-0 text-left">
                  <div className="text-[13px] font-semibold truncate">{g.label}</div>
                  <div className="text-[11px] text-muted">{g.items.length}× · {g.allRefunds ? "refunds" : g.allIgnored ? "ignored" : g.items.some((e) => e.status !== "counted" && !e.sourceId) ? `${g.items.filter((e) => e.status !== "ignored" && e.status !== "refund").length} counted` : "counted"} · <span className="text-accent font-semibold">{expanded === g.key ? "hide" : "see each"}</span></div>
                </button>
                <div className={cx("text-sm font-semibold", g.allRefunds ? "text-amber" : g.allIgnored && "line-through text-muted")}>{g.allRefunds ? `↩ ${money(g.total)}` : money(g.allIgnored ? g.total : g.countedTotal)}</div>
              </div>
              {expanded === g.key && g.items.map((e) => (
                <div key={e.id} className="flex items-center gap-3 pl-8 pr-4 py-2 bg-surface/50 border-t border-line-soft">
                  <button onClick={() => setDetail(e)} className="flex-1 min-w-0 text-left"><div className="text-[12px] text-muted">{new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {e.internal ? "transfer" : e.sourceId ? data.incomeSources?.find((s) => s.id === e.sourceId)?.name ?? "source" : e.status} · <span className="text-accent font-semibold">details</span></div></button>
                  <div className={cx("text-[13px] font-semibold", e.status === "ignored" && "line-through text-muted", e.status === "refund" && "text-amber")}>{e.status === "refund" ? "↩ " : ""}{money(e.amount)}</div>
                  <select aria-label="Status" className="h-7 rounded-[8px] border border-line bg-card text-[11px] font-semibold px-1" value={e.sourceId ? "counted" : e.status ?? ""} onChange={(ev) => setEvent(e.id, (ev.target.value || undefined) as IncomeEvent["status"])}>
                    <option value="counted">Counted</option><option value="refund">Refund</option><option value="ignored">Ignored</option><option value="">Unreviewed</option>
                  </select>
                </div>
              ))}
            </div>
          ))}
        </Card>
      )}
      {detail && <DepositSheet event={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function SourceForm({ src, onClose, onSave, onRemove }: { src?: IncomeSource; onClose: () => void; onSave: (s: IncomeSource) => void; onRemove: (id: string, alsoIgnore: boolean) => void }) {
  const [name, setName] = useState(src?.name ?? "");
  const [kind, setKind] = useState<IncomeSource["kind"]>(src?.kind ?? "paycheck");
  const [expected, setExpected] = useState(src?.expected ?? 0);
  const [cadence, setCadence] = useState<IncomeSource["cadence"]>(src?.cadence ?? "semimonthly");
  const [days, setDays] = useState((src?.payDays ?? [1, 16]).join(", "));
  return (
    <Modal open onClose={onClose} title={src ? "Edit income" : "Add expected income"}>
      <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Employer payroll" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type"><select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as IncomeSource["kind"])}><option value="paycheck">Paycheck</option><option value="other">Other income</option></select></Field>
        <Field label="Amount per deposit ($)"><input className={inputCls} type="number" inputMode="decimal" value={expected || ""} onChange={(e) => setExpected(Number(e.target.value))} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="How often"><select className={selectCls} value={cadence} onChange={(e) => setCadence(e.target.value as IncomeSource["cadence"])}><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="semimonthly">Twice a month</option><option value="monthly">Monthly</option></select></Field>
        <Field label="Days of month" hint="e.g. 1, 16"><input className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
      </div>
      <div className="text-[11px] text-muted">Deposits from the same payer attach to this automatically; the real amount updates &quot;received&quot; while this stays the projection.</div>
      <div className="flex gap-2 pt-1 flex-wrap">
        {src && <Button variant="danger" onClick={() => { onRemove(src.id, false); onClose(); }}>Remove</Button>}
        {src?.merchant && <Button variant="secondary" onClick={() => { onRemove(src.id, true); onClose(); }}>Not income — ignore payer</Button>}
        <Button className="flex-1" disabled={!name || expected <= 0} onClick={() => { const payDays = days.split(/[,\s]+/).map(Number).filter((n) => n >= 1 && n <= 31); onSave({ id: src?.id ?? uid(), name, kind, merchant: src?.merchant ?? merchantKey(name), expected, cadence, payDays: payDays.length ? payDays : [1] }); onClose(); }}>Save</Button>
      </div>
    </Modal>
  );
}
