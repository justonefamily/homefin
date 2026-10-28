"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, Merge, Search, Receipt, Shuffle, Undo2 } from "lucide-react";
import { addDays, addMonths, endOfMonth, getDaysInMonth, startOfMonth, startOfWeek } from "date-fns";
import { useHome } from "@/store/useHome";
import { Button, Card, Eyebrow, Segmented, cx, inputCls, money } from "./ui";
import { flowFor, merchantSummaries, mergeMerchants, similarMerchants, type FlowLine, type MerchantSummary } from "@/lib/merchants";
import { ItemSheet } from "./ItemSheet";
import { ymd } from "@/lib/calendar";
import { currentPeriodRange, shiftPeriod } from "@/lib/projections";
import type { HomeData } from "@/lib/types";
import { brandColorFor } from "@/lib/brands";

type Range = "week" | "period" | "month";

/** Date range for an offset of weeks / pay periods / months from today. */
function rangeFor(data: HomeData, today: Date, kind: Range, offset: number): { from: Date; to: Date; label: string } {
  if (kind === "week") {
    const from = addDays(startOfWeek(today), offset * 7);
    const to = addDays(from, 6);
    return { from, to, label: `${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${to.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` };
  }
  if (kind === "month") {
    const m = addMonths(startOfMonth(today), offset);
    return { from: m, to: endOfMonth(m), label: m.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
  }
  // pay period: anchored to paydays (or month halves), may run into next month
  const r = shiftPeriod(data, currentPeriodRange(data, today), offset);
  return { from: r.from, to: r.to, label: r.label };
}

export function MoneyView({ today }: { today: Date }) {
  const [tab, setTab] = useState<"flow" | "everyday" | "merchants">(typeof location !== "undefined" && location.hash === "#everyday" ? "everyday" : "flow");
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Money</h1>
        <div className="w-full sm:w-80"><Segmented size="sm" value={tab} onChange={setTab} options={[{ id: "flow", label: "In & out" }, { id: "everyday", label: "Everyday" }, { id: "merchants", label: "Merchants" }]} /></div>
      </div>
      {tab === "flow" && <FlowView today={today} />}
      {tab === "everyday" && <EverydayView today={today} />}
      {tab === "merchants" && <MerchantsView today={today} />}
    </>
  );
}

/* ------------------------------ In & out ------------------------------ */

function FlowView({ today }: { today: Date }) {
  const data = useHome((s) => s.data)!;
  const [kind, setKind] = useState<Range>("week");
  const [offset, setOffset] = useState(0);
  const r = rangeFor(data, today, kind, offset);
  const flow = useMemo(() => flowFor(data, ymd(r.from), ymd(r.to)), [data, r.from, r.to]);
  const [pick, setPick] = useState<FlowLine | null>(null);
  const acctName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? (id === "manual" ? "Manual" : "Removed account");
  const acctColor = (id: string) => { const a = data.accounts.find((x) => x.id === id); return a?.brandColor ?? brandColorFor(a?.institution ?? "") ?? "#9aa3b2"; };

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(offset - 1)} aria-label="Earlier" className="w-10 h-10 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field"><ChevronLeft size={16} /></button>
          <button onClick={() => setOffset(0)} className={cx("h-10 px-3 rounded-[10px] border text-[13px] font-semibold", offset === 0 ? "bg-ink text-white border-ink" : "bg-card border-line hover:border-field")}>{r.label}</button>
          <button onClick={() => setOffset(offset + 1)} aria-label="Later" className="w-10 h-10 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field"><ChevronRight size={16} /></button>
        </div>
        <div className="w-64"><Segmented size="sm" value={kind} onChange={(k) => { setKind(k); setOffset(0); }} options={[{ id: "week", label: "Week" }, { id: "period", label: "Pay period" }, { id: "month", label: "Month" }]} /></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Card className="p-3"><div className="text-[11px] text-muted">Came in</div><div className="text-[17px] font-bold text-green">{money(flow.income)}</div><div className="text-[11px] text-muted">{flow.incomeLines.length} deposit{flow.incomeLines.length === 1 ? "" : "s"}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted">Bills</div><div className="text-[17px] font-bold">{money(flow.bills)}</div><div className="text-[11px] text-muted">{flow.billLines.length} paid{flow.unpaidBills.length ? ` · ${flow.unpaidBills.length} still due` : ""}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted">Everything else</div><div className="text-[17px] font-bold">{money(flow.spending)}</div><div className="text-[11px] text-muted">{flow.spendLines.length} place{flow.spendLines.length === 1 ? "" : "s"}</div></Card>
        <Card className={cx("p-3", flow.net < 0 && "border-red/40")}><div className="text-[11px] text-muted">Left over</div><div className={cx("text-[17px] font-bold", flow.net < 0 ? "text-red" : "text-green")}>{money(flow.net)}</div><div className="text-[11px] text-muted">in − bills − everything else{flow.reimbursable ? ` − ${money(flow.reimbursable)} fronted` : ""}</div></Card>
      </div>

      {flow.byAccount.length > 0 && (
        <Card className="p-3.5 flex flex-col gap-2">
          <Eyebrow>By account</Eyebrow>
          <div className="flex flex-col gap-1.5">
            {flow.byAccount.map((a) => (
              <div key={a.accountId} className="flex items-center gap-2 text-[12px]">
                <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: acctColor(a.accountId) }} />
                <div className="flex-1 truncate">{acctName(a.accountId)}</div>
                {a.in > 0 && <span className="text-green font-semibold">+{money(a.in)}</span>}
                {a.out > 0 && <span className="font-semibold">−{money(a.out)}</span>}
              </div>
            ))}
          </div>
          <div className="text-[10px] text-muted">Deposits are counted at the household level (not per account) until you link the account they land in.</div>
        </Card>
      )}

      <Section title="Came in" icon={<ArrowDownLeft size={14} className="text-green" />} lines={flow.incomeLines} tone="green" empty="No deposits in this range." onPick={setPick} acctName={acctName} />
      <Section title="Bills" icon={<Receipt size={14} className="text-accent" />} lines={flow.billLines} empty="No bill payments in this range." onPick={setPick} acctName={acctName}
        extra={flow.unpaidBills.length > 0 && <div className="px-4 py-2 text-[11px] text-amber border-t border-line-soft">Still due: {flow.unpaidBills.map((u) => `${u.bill.name} (${money(u.bill.amount)}, ${new Date(u.dueDate + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})`).join(" · ")}</div>} />
      <Section title="Everything else" icon={<ArrowUpRight size={14} className="text-red" />} lines={flow.spendLines} empty="Nothing else spent in this range." onPick={setPick} acctName={acctName} hint="Tap a line to make it a bill, mark it a transfer, or merge it." />
      {flow.reimbursableLines.length > 0 && <Section title="Fronted — coming back" icon={<Undo2 size={14} className="text-amber" />} lines={flow.reimbursableLines} empty="" onPick={setPick} acctName={acctName} hint="Reimbursable expenses: out of pocket now, counted as income when the money lands." />}
      {(flow.transferLines.length > 0 || flow.internalDeposits > 0) && <Section title="Transfers between your accounts" icon={<Shuffle size={14} className="text-muted" />} lines={flow.transferLines} muted empty="" onPick={setPick} acctName={acctName} hint={`Card payments, moves to savings, money sent to each other on the shared account — left out of income and spending.${flow.internalDeposits ? ` ${flow.internalDeposits} matching deposit${flow.internalDeposits === 1 ? "" : "s"} ignored too.` : ""}`} />}

      {pick && (pick.category === "income" ? null : <ItemSheet merchantKey={pick.key} onClose={() => setPick(null)} />)}
    </>
  );
}

function Section({ title, icon, lines, tone, muted, empty, extra, hint, onPick, acctName }: { title: string; icon: React.ReactNode; lines: FlowLine[]; tone?: "green"; muted?: boolean; empty: string; extra?: React.ReactNode; hint?: string; onPick: (l: FlowLine) => void; acctName: (id: string) => string }) {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between"><div className="flex items-center gap-1.5 text-sm font-semibold">{icon}{title}</div><div className={cx("text-sm font-bold", tone === "green" && "text-green", muted && "text-muted")}>{tone === "green" ? "+" : ""}{money(total)}</div></div>
      {hint && <div className="text-[11px] text-muted -mt-1">{hint}</div>}
      <Card>
        {lines.length === 0 && empty && <div className="px-4 py-3 text-xs text-muted">{empty}</div>}
        {lines.map((l) => (
          <button key={l.key} onClick={() => onPick(l)} className={cx("w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-line-soft last:border-b-0 hover:bg-surface/60", muted && "opacity-70")}>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold truncate">{l.name}{l.unreviewed && <span className="ml-2 text-[10px] font-semibold text-amber bg-amber/10 rounded px-1.5 py-0.5">unreviewed</span>}</div>
              <div className="text-[11px] text-muted truncate">{l.count > 1 ? `${l.count}× · ` : ""}{new Date(l.date + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}{l.accountIds.length ? ` · ${l.accountIds.map(acctName).join(", ")}` : ""}</div>
            </div>
            <div className={cx("text-[13px] font-bold", tone === "green" && "text-green")}>{tone === "green" ? "+" : ""}{money(l.amount)}</div>
          </button>
        ))}
        {extra}
      </Card>
    </div>
  );
}

/* ------------------------------ Merchants ------------------------------ */

function MerchantsView({ today }: { today: Date }) {
  const { data: d, update } = useHome();
  const data = d!;
  const [span, setSpan] = useState<"1m" | "3m" | "12m" | "all">("1m");
  const [filter, setFilter] = useState<"all" | "spend" | "bill" | "reimbursable" | "transfer" | "ignore">("all");
  const [q, setQ] = useState("");
  const from = span === "all" ? undefined : span === "1m" ? ymd(startOfMonth(today)) : ymd(addMonths(today, span === "3m" ? -3 : -12));
  const spanLabel = span === "1m" ? `${today.toLocaleString("en-US", { month: "long" })} so far` : span === "3m" ? "last 3 months" : span === "12m" ? "last 12 months" : "all time";
  const all = useMemo(() => merchantSummaries(data, from), [data, from]);
  const similar = useMemo(() => similarMerchants(all), [all]);
  const list = all.filter((m) => (filter === "all" ? m.kind !== "ignore" : m.kind === filter) && (!q || m.name.toLowerCase().includes(q.toLowerCase()) || m.key.includes(q.toLowerCase())));
  const total = list.filter((m) => m.kind !== "transfer").reduce((s, m) => s + m.total, 0);
  const max = Math.max(1, ...list.map((m) => m.total));
  const [pick, setPick] = useState<MerchantSummary | null>(null);
  const catName = (id: string) => data.budgets.find((b) => b.id === id)?.name ?? "Other";
  const acctName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "—";
  const merge = (from: string, into: string) => update((h) => mergeMerchants(h, from, into), "merged merchants");

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="w-full sm:w-80"><Segmented size="sm" value={span} onChange={setSpan} options={[{ id: "1m", label: "This month" }, { id: "3m", label: "3 mo" }, { id: "12m", label: "12 mo" }, { id: "all", label: "All" }]} /></div>
        <div className="relative flex-1 min-w-[180px] max-w-xs"><Search size={14} className="absolute left-3 top-3 text-muted" /><input className={cx(inputCls, "h-10 pl-9")} placeholder="Find a merchant…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="flex gap-1.5 flex-wrap text-[11px]">
        {(["all", "spend", "bill", "reimbursable", "transfer", "ignore"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={cx("h-8 px-3 rounded-full border font-semibold", filter === f ? "bg-ink text-white border-ink" : "bg-card border-line text-muted hover:border-field")}>{{ all: "Everything", spend: "Spending", bill: "Bills", reimbursable: "Coming back", transfer: "Transfers", ignore: "Hidden" }[f]}</button>)}
      </div>
      <div className="text-[11px] text-muted -mt-2">{list.length} merchant{list.length === 1 ? "" : "s"} · {money(total)} · {spanLabel}{filter !== "all" ? ` · ${{ spend: "spending only", bill: "bills only", reimbursable: "coming back only", transfer: "transfers only", ignore: "hidden only" }[filter]}` : ""}</div>

      {similar.length > 0 && (
        <Card className="p-4 flex flex-col gap-2 border-accent-line bg-accent-bg/40">
          <div className="flex items-center gap-2"><Merge size={15} className="text-accent" /><div className="text-sm font-semibold">These might be the same place</div></div>
          {similar.map(([a, b]) => (
            <div key={a.key + b.key} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-[12px] bg-card border border-line px-3 py-2">
              <div className="flex-1 text-[12px] min-w-0"><b>{a.name}</b> <span className="text-muted">({money(a.total)})</span> &amp; <b>{b.name}</b> <span className="text-muted">({money(b.total)})</span></div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => merge(b.key, a.key)} className="h-8 px-2.5 rounded-[8px] bg-accent text-white text-[11px] font-semibold">Keep “{a.name.slice(0, 18)}”</button>
                <button onClick={() => merge(a.key, b.key)} className="h-8 px-2.5 rounded-[8px] bg-accent text-white text-[11px] font-semibold">Keep “{b.name.slice(0, 18)}”</button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card>
        {list.length === 0 && <div className="px-4 py-3 text-xs text-muted">No merchants yet — link a bank or add transactions.</div>}
        {list.map((m) => {
          const badge = m.kind === "bill" ? { text: "Bill", cls: "text-accent bg-accent-bg" } : m.kind === "transfer" ? { text: "Transfer", cls: "text-muted bg-surface" } : m.kind === "ignore" ? { text: "Hidden", cls: "text-muted bg-surface" } : m.kind === "reimbursable" ? { text: "Coming back", cls: "text-amber bg-amber/10" } : m.recurring ? { text: "Recurring — bill?", cls: "text-amber bg-amber/10" } : null;
          return (
            <button key={m.key} onClick={() => setPick(m)} className="w-full text-left px-4 py-3 border-b border-line-soft last:border-b-0 hover:bg-surface/60 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center">
              <div className="min-w-0 text-[14px] font-semibold truncate">{m.name}</div>
              <div className="text-[14px] font-bold text-right">{money(m.total)}</div>
              <div className="min-w-0 flex items-center gap-1.5 text-[11px] text-muted">
                {badge && <span className={cx("shrink-0 text-[10px] font-semibold rounded px-1.5 py-0.5", badge.cls)}>{badge.text}</span>}
                <span className="truncate">{catName(m.category)} · {m.accountIds.length === 1 ? acctName(m.accountIds[0]) : `${m.accountIds.length} accounts`}{m.merged.length ? ` · +${m.merged.length} merged` : ""}</span>
              </div>
              <div className="text-[11px] text-muted text-right whitespace-nowrap">{m.count}×{span === "1m" ? "" : ` · ${money(m.perMonth)}/mo`}</div>
              <div className="col-span-2 h-1 rounded-full bg-line-soft overflow-hidden"><div className={cx("h-full rounded-full", m.kind === "bill" ? "bg-accent" : m.kind === "transfer" ? "bg-chip" : "bg-ink")} style={{ width: `${Math.max(2, (m.total / max) * 100)}%` }} /></div>
            </button>
          );
        })}
      </Card>
      {pick && <ItemSheet merchantKey={pick.key} onClose={() => setPick(null)} />}
    </>
  );
}


/* ------------------------------ Everyday ------------------------------ */

/**
 * Everything that leaves your pocket that isn't a bill or a transfer — the "everyday" number the plan uses —
 * broken down by category and merchant so it can be organized until it reads true.
 */
function EverydayView({ today }: { today: Date }) {
  const { data: d, update } = useHome();
  const data = d!;
  const [span, setSpan] = useState<"1m" | "3m" | "6m" | "12m">("1m");
  const monthsBack = span === "1m" ? 0 : span === "3m" ? 3 : span === "6m" ? 6 : 12;
  // "This month" is just this month so far (no averaging). Longer spans: previous N full months plus this month so far,
  // with this month counted as the fraction that has passed.
  const end = ymd(today);
  const from = ymd(addMonths(startOfMonth(today), -monthsBack));
  const span_ = monthsBack === 0 ? 1 : monthsBack + today.getDate() / getDaysInMonth(today);
  const all = useMemo(() => merchantSummaries(data, from, end), [data, from, end]);
  const spend = all.filter((m) => m.kind === "spend");
  const total = spend.reduce((s, m) => s + m.total, 0);
  const perMonth = Math.round(total / span_);
  const estimate = data.settings.everydaySpend;
  const catName = (id: string) => data.budgets.find((b) => b.id === id)?.name ?? "Uncategorized";
  const groups = useMemo(() => {
    const g = new Map<string, MerchantSummary[]>();
    for (const m of spend) (g.get(m.category) ?? g.set(m.category, []).get(m.category)!).push(m);
    return [...g.entries()].map(([id, ms]) => ({ id, name: catName(id), total: ms.reduce((s, m) => s + m.total, 0), merchants: ms.sort((a, b) => b.total - a.total), budget: data.budgets.find((b) => b.id === id)?.limit })).sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spend]);
  const [open, setOpen] = useState<string | null>(groups[0]?.id ?? null);
  const [pick, setPick] = useState<string | null>(null);
  const setEstimate = () => update((h) => ({ ...h, settings: { ...h.settings, everydaySpend: perMonth } }), `everyday estimate set to ${perMonth}`);
  const maxCat = Math.max(1, ...groups.map((g) => g.total));

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[13px] text-muted leading-snug max-w-xl">Everything that isn&apos;t a bill or a transfer — groceries, gas, dining, shopping, the one-offs. This is what the plan calls <b>everyday spending</b>. Tap a merchant to re-categorize it, make it a bill, or call it a transfer.</div>
        <div className="w-full sm:w-80"><Segmented size="sm" value={span} onChange={setSpan} options={[{ id: "1m", label: "This month" }, { id: "3m", label: "3 mo" }, { id: "6m", label: "6 mo" }, { id: "12m", label: "12 mo" }]} /></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Card className="p-3"><div className="text-[11px] text-muted">{monthsBack === 0 ? "Spent so far this month" : "Actual, per month"}</div><div className="text-[17px] font-bold">{money(perMonth)}</div><div className="text-[11px] text-muted">{monthsBack === 0 ? `${today.toLocaleString("en-US", { month: "long" })} 1 – ${today.getDate()}` : `last ${monthsBack} months + this month so far`}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted">In the plan</div><div className="text-[17px] font-bold">{money(estimate)}</div><div className={cx("text-[11px] font-semibold", estimate < perMonth ? "text-red" : "text-green")}>{monthsBack === 0 ? (estimate >= perMonth ? `${money(estimate - perMonth)} left this month` : `${money(perMonth - estimate)} over already`) : estimate < perMonth ? `${money(perMonth - estimate)}/mo under-planned` : estimate > perMonth ? `${money(estimate - perMonth)}/mo cushion` : "matches"}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted">Places</div><div className="text-[17px] font-bold">{spend.length}</div><div className="text-[11px] text-muted">{groups.length} categor{groups.length === 1 ? "y" : "ies"}</div></Card>
        <Card className="p-3 flex flex-col justify-between"><div className="text-[11px] text-muted">Make the plan match</div><Button onClick={setEstimate} disabled={perMonth === estimate || perMonth === 0 || monthsBack === 0} className="h-9 text-xs mt-1">{monthsBack === 0 ? "Pick 3+ months to set" : `Set everyday to ${money(perMonth)}/mo`}</Button></Card>
      </div>

      {groups.length === 0 && <Card className="p-4 text-sm text-muted">No everyday spending recorded in this window yet.</Card>}
      {groups.map((g) => (
        <Card key={g.id} className="overflow-hidden">
          <button onClick={() => setOpen(open === g.id ? null : g.id)} aria-expanded={open === g.id} className="w-full text-left px-4 py-3 flex flex-col gap-1.5 hover:bg-surface/40">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{g.name}{g.id === "other" && <span className="ml-2 text-[10px] font-semibold text-amber bg-amber/10 rounded px-1.5 py-0.5">needs sorting</span>}</div><div className="text-[11px] text-muted">{g.merchants.length} place{g.merchants.length === 1 ? "" : "s"}{monthsBack === 0 ? "" : ` · ${money(Math.round(g.total / span_))}/mo`}{g.budget ? ` · budget ${money(g.budget)}/mo` : ""}</div></div>
              <div className="text-sm font-bold">{money(g.total)}</div>
              <ChevronRight size={15} className={cx("text-muted transition-transform", open === g.id && "rotate-90")} />
            </div>
            <div className="h-1.5 rounded-full bg-line-soft overflow-hidden"><div className={cx("h-full rounded-full", g.budget && g.total / span_ > g.budget ? "bg-red" : "bg-accent")} style={{ width: `${Math.max(2, (g.total / maxCat) * 100)}%` }} /></div>
          </button>
          {open === g.id && (
            <div className="border-t border-line-soft">
              {g.merchants.map((m) => (
                <button key={m.key} onClick={() => setPick(m.key)} className="w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-line-soft last:border-b-0 hover:bg-surface/60">
                  <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate">{m.name}{m.recurring && <span className="ml-2 text-[10px] font-semibold text-amber bg-amber/10 rounded px-1.5 py-0.5">recurring · bill?</span>}</div><div className="text-[11px] text-muted truncate">{m.count}×{monthsBack === 0 ? "" : ` · ${money(Math.round(m.total / span_))}/mo`} · {m.accountIds.map((id) => data.accounts.find((a) => a.id === id)?.name ?? "—").join(", ")}</div></div>
                  <div className="text-[13px] font-semibold">{money(m.total)}</div>
                </button>
              ))}
            </div>
          )}
        </Card>
      ))}
      {pick && <ItemSheet merchantKey={pick} onClose={() => setPick(null)} />}
    </>
  );
}
