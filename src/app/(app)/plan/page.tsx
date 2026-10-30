"use client";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { getDaysInMonth } from "date-fns";
import { useHome } from "@/store/useHome";
import { accountFromCredit, payoffCandidates } from "@/lib/credit/toAccounts";
import Link from "next/link";
import { useToday } from "@/components/hooks";
import { Button, Card, Eyebrow, Field, Modal, ProgressBar, Segmented, SectionTitle, Stat, cx, fmt, inputCls, money, selectCls, byName } from "@/components/ui";
import { STRATEGIES, babySteps, budgetRows, debtsFromAccounts, monthKey, simulatePayoff, splitRows, strategyMeta } from "@/lib/strategies";
import type { BudgetCategory, StrategyId } from "@/lib/types";
import { uid } from "@/lib/storage/adapter";
import { applyRecommendations, quarterOf, recommendBudgets } from "@/lib/detect";
import { Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { YearPlanView } from "@/components/YearPlanView";
import { actualsForMonth, spendItems } from "@/lib/actuals";
import { expectedMonthlyIncome } from "@/lib/detect";
import { useItem } from "@/store/useItem";

const SPLIT_COLORS = ["bg-accent", "bg-amber", "bg-teal", "bg-muted-2", "bg-ink", "bg-gold"];
const SPLIT_HEX = ["#0e6b74", "#b45309", "#4fb3bc", "#7a8294", "#141821", "#d9a066"];

export default function PlanPage() {
  const params = useSearchParams();
  const { data: d, update } = useHome();
  const data = d!;
  const today = useToday();
  const [view, setView] = useState<"strategy" | "budget" | "year">((["budget", "year"].includes(params.get("view") ?? "") ? params.get("view") : "strategy") as "strategy");
  const strat = strategyMeta(data.settings.strategy);
  const setStrategy = (s: StrategyId) => update((h) => ({ ...h, settings: { ...h.settings, strategy: s } }), `switched strategy to ${strategyMeta(s).name}`);
  const setExtra = (n: number) => update((h) => ({ ...h, settings: { ...h.settings, extraPayment: n } }), "changed extra payment");

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Plan</h1>
      <div className="md:max-w-md"><Segmented value={view} onChange={setView} options={[{ id: "strategy", label: "Strategy" }, { id: "budget", label: "Budget" }, { id: "year", label: "Planner" }]} /></div>

      {view === "strategy" && (
        <div className="md:grid md:grid-cols-12 md:gap-6 flex flex-col gap-4">
          <div className="md:col-span-4 flex flex-col gap-4">
            <Field label="Strategy">
              <select className={cx(selectCls, "h-[52px] text-[15px] font-semibold rounded-[14px]")} value={data.settings.strategy} onChange={(e) => setStrategy(e.target.value as StrategyId)}>
                {[...STRATEGIES].sort(byName).map((s) => <option key={s.id} value={s.id}>{s.name} — {s.headline}</option>)}
              </select>
            </Field>
            <Card className="p-4 flex flex-col gap-1"><div className="text-sm font-semibold">{strat.headline}</div><div className="text-xs text-muted leading-relaxed">{strat.description}</div></Card>
            {strat.kind === "payoff" && <AddFromCredit />}
            {strat.kind === "payoff" && (
              <Card className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between"><div className="text-sm font-semibold">Extra toward debt</div><div className="text-sm font-bold">${fmt(data.settings.extraPayment)}/mo</div></div>
                <input type="range" min={0} max={3000} step={25} value={data.settings.extraPayment} onChange={(e) => setExtra(Number(e.target.value))} className="w-full accent-[#0e6b74]" aria-label="Extra monthly payment toward debt" />
                <div className="text-[11px] text-muted">On top of every minimum. Freed-up minimums roll into the next debt automatically.</div>
              </Card>
            )}
          </div>
          <div className="md:col-span-8 flex flex-col gap-4">
            {strat.kind === "payoff" ? <PayoffView /> : <SplitView />}
          </div>
        </div>
      )}

      {view === "budget" && <BudgetView today={today} />}
      {view === "year" && <YearPlanView today={today} />}
    </>
  );
}

/** Pull balances off the credit report into the payoff plan — only the ones you pick. */
function AddFromCredit() {
  const { data: d, update } = useHome();
  const data = d!;
  const candidates = payoffCandidates(data);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const hasReport = (data.credit?.reports?.length ?? 0) > 0;
  const add = () => {
    update((h) => ({ ...h, accounts: [...h.accounts, ...candidates.filter((c) => picked.has(c.account.id)).map((c) => accountFromCredit(c.account, uid()))] }), `added ${picked.size} debt${picked.size === 1 ? "" : "s"} from the credit report`);
    setPicked(new Set()); setOpen(false);
  };
  return (
    <>
      <Card className="p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold">Debts on your credit report</div>{hasReport && candidates.length > 0 && <Button variant="secondary" onClick={() => setOpen(true)} className="h-8 px-3 text-xs">+ Add to payoff</Button>}</div>
        <div className="text-[11px] text-muted">{!hasReport ? <>Import a report under <Link href="/accounts#credit" className="text-accent font-semibold">Accounts → Credit</Link> and any balances still owed can be added here.</> : candidates.length === 0 ? "Every balance on the report is already in your accounts." : `${candidates.length} balance${candidates.length === 1 ? "" : "s"} on the report ${candidates.length === 1 ? "isn't" : "aren't"} in your accounts yet — pick the ones worth paying down here.`}</div>
      </Card>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Add debts from the credit report">
          <div className="text-[12px] text-muted">Tick the ones you want in the payoff plan. Balances come from the report; set the APR afterwards under Accounts so the math is right. Skip anything that&apos;s wrong, disputed or already covered.</div>
          <div className="flex flex-col gap-1.5 max-h-[55vh] overflow-y-auto">
            {candidates.map(({ account: a, report: r }) => (
              <label key={a.id} className={cx("flex items-start gap-3 rounded-[12px] border p-3 cursor-pointer", picked.has(a.id) ? "border-accent bg-accent-bg" : "border-line", a.adverse && "border-l-4 border-l-red")}>
                <input type="checkbox" checked={picked.has(a.id)} onChange={() => { const n = new Set(picked); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); setPicked(n); }} className="mt-0.5 w-4 h-4 accent-[#0e6b74]" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate">{a.creditor} <span className="text-muted font-normal">{a.accountMask.slice(-6)}</span></div>
                  <div className="text-[11px] text-muted truncate">{[a.loanType ?? a.accountType, a.payStatus, r.person !== "" ? r.person : null].filter(Boolean).join(" · ")}{a.monthlyPayment ? ` · ${money(a.monthlyPayment)}/mo` : ""}</div>
                </div>
                <div className="text-[13px] font-semibold shrink-0">{money(a.balance ?? 0)}</div>
              </label>
            ))}
          </div>
          <Button disabled={picked.size === 0} onClick={add}>Add {picked.size || ""} to payoff plan</Button>
        </Modal>
      )}
    </>
  );
}

function PayoffView() {
  const data = useHome((s) => s.data)!;
  const debts = debtsFromAccounts(data.accounts);
  const plan = simulatePayoff(debts, data.settings.strategy, data.settings.extraPayment);
  const isBaby = data.settings.strategy === "baby";
  const steps = isBaby ? babySteps(data) : [];
  if (debts.length === 0) return <Card className="p-5 text-sm text-muted">No debts tracked. Add credit cards or loans under Accounts and the payoff plan appears here.</Card>;
  return (
    <>
      <div className="grid grid-cols-3 gap-2.5">
        <Stat dark label="Total debt" value={money(plan.totalDebt)} />
        <Stat label="Debt-free in" value={`${plan.months} mo`} />
        <Stat label="Interest paid" value={money(plan.totalInterest)} />
      </div>

      {isBaby && (
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between"><Eyebrow>7 Baby Steps</Eyebrow><div className="text-xs font-semibold text-amber">On step {steps.find((s) => s.status === "current")?.n ?? 7}</div></div>
          <div className="grid grid-cols-7 gap-1 items-end h-[90px]">
            {steps.map((s) => (
              <div key={s.n} className="flex flex-col items-center justify-end gap-1 h-full">
                <div className={cx("text-[9px] font-bold", s.status === "current" ? "text-amber" : "text-muted")}>{Math.round(s.progress * 100)}%</div>
                <div className="w-full h-[70px] rounded-t-[6px] bg-line-soft flex flex-col justify-end overflow-hidden"><div className={cx("w-full", s.status === "current" ? "bg-amber" : "bg-accent")} style={{ height: `${s.progress * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">{steps.map((s) => <div key={s.n} className="flex justify-center"><StepNum s={s} /></div>)}</div>
          <div className="flex flex-col gap-1.5 pt-1">
            {steps.map((s) => (
              <div key={s.n} className="flex items-center gap-2.5 text-xs">
                <StepNum s={s} small />
                <div className={cx("flex-1", s.status === "current" ? "font-semibold text-ink" : s.status === "done" ? "text-green" : "text-muted")}>{s.name}</div>
                <div className={cx("text-[11px] font-semibold", s.status === "current" ? "text-amber" : "text-muted")}>{s.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between"><Eyebrow>Payoff timeline</Eyebrow><div className="text-xs text-muted">extra ${fmt(data.settings.extraPayment)}/mo rolls down</div></div>
        {plan.order.map((dd, i) => (
          <div key={dd.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5"><div className={cx("w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold", i === 0 ? "bg-accent text-white" : "bg-line-soft text-ink-3")}>{dd.rank}</div><div className="font-semibold">{dd.name}</div></div>
              <div className="text-muted">${fmt(dd.balance)} · {dd.apr}% · min ${fmt(dd.min)}</div>
            </div>
            <div className="relative h-[18px] rounded-[5px] bg-line-soft overflow-hidden">
              <div className="absolute inset-y-0 left-0 rounded-[5px]" style={{ width: `${(dd.paidOffMonth / Math.max(1, plan.months)) * 100}%`, background: ["#0e6b74", "#4fb3bc", "#9cd3d8", "#c9e3e6", "#d8eef0"][Math.min(i, 4)] }} />
              <div className="absolute inset-y-0 right-2 flex items-center text-[10px] font-semibold text-ink-3">paid off month {dd.paidOffMonth}</div>
            </div>
          </div>
        ))}
        <div className="flex justify-between text-[10px] text-muted"><span>Today</span><span>{plan.months} months</span></div>
      </Card>

      <Card className="p-4 flex flex-col gap-2">
        <Eyebrow>Balance over time</Eyebrow>
        <Sparkline points={plan.curve} />
        <div className="flex justify-between text-[10px] text-muted"><span>${fmt(plan.totalDebt)} today</span><span>$0 in {plan.months} mo</span></div>
      </Card>
    </>
  );
}

const StepNum = ({ s, small }: { s: { n: number; status: string }; small?: boolean }) => (
  <div className={cx("rounded-full flex items-center justify-center font-bold", small ? "w-[18px] h-[18px] text-[10px]" : "w-6 h-6 text-[11px]", s.status === "current" ? "bg-amber text-white" : s.status === "done" ? "bg-green text-white" : "bg-line-soft text-ink-3")}>{s.n}</div>
);

function Sparkline({ points }: { points: number[] }) {
  const w = 600, h = 120;
  const max = Math.max(1, ...points);
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / max) * (h - 8) - 4).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[120px]" role="img" aria-label="Total debt balance declining to zero over the payoff period">
      <path d={`${path} L${w},${h} L0,${h} Z`} fill="#d8eef0" />
      <path d={path} fill="none" stroke="#0e6b74" strokeWidth="2.5" />
    </svg>
  );
}

/** What's behind one slice of 50/30/20 or 6 Cans: the categories in its buckets, each with this month's lines. */
function SliceSheet({ row, month, monthLabel, onClose }: { row: ReturnType<typeof splitRows>[number]; month: string; monthLabel: string; onClose: () => void }) {
  const data = useHome((s) => s.data)!;
  const items = spendItems(data, [month]);
  const cats = data.budgets.filter((b) => row.buckets.includes(b.bucket)).map((b) => ({ ...b, spent: items.filter((i) => i.category === b.id).reduce((s, i) => s + i.amount, 0) })).sort((a, b) => b.spent - a.spent);
  const total = cats.reduce((s, c) => s + c.spent, 0);
  const bucketName: Record<BudgetCategory["bucket"], string> = { needs: "Needs", wants: "Wants", savings: "Savings & debt", giving: "Giving", education: "Education", play: "Play", reimbursable: "Reimbursable" };
  return (
    <Modal open onClose={onClose} title={`${row.name} · ${monthLabel}`}>
      <div className="text-[12px] text-muted -mt-1">{row.what}. Counts every budget category whose “Counts toward” is {row.buckets.map((b) => bucketName[b]).join(" or ")}. Target {money(row.target)} ({row.pct}% of income) · actual {money(row.actual)}.</div>
      {row.id === "ffa" && <div className="rounded-[12px] bg-surface px-3 py-2 text-[12px]">This slice is the <b>extra toward debt</b> you set on this page ({money(data.settings.extraPayment)}/mo), not spending from the bank. Raise or lower it under Extra payment.</div>}
      {row.id !== "ffa" && cats.length === 0 && <div className="text-[12px] text-muted">No budget category counts toward this yet. Edit a category under Plan → Budget and set “Counts toward”.</div>}
      {row.id !== "ffa" && cats.map((c) => (
        <div key={c.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-[13px]"><div className="font-semibold">{c.name} <span className="text-[11px] font-normal text-muted">· {bucketName[c.bucket]} · limit {money(c.limit)}</span></div><div className="font-semibold">{money(c.spent)}</div></div>
          <Feeding categoryId={c.id} month={month} monthLabel={monthLabel} onClose={onClose} />
        </div>
      ))}
      {row.id !== "ffa" && cats.length > 0 && <div className="flex items-baseline justify-between text-[13px] border-t border-line pt-2"><div className="font-semibold">Total</div><div className="font-bold">{money(total)}</div></div>}
    </Modal>
  );
}

function SplitView() {
  const data = useHome((s) => s.data)!;
  const today = useToday();
  const rows = splitRows(data, data.settings.strategy as "503020" | "sixcans", monthKey(today));
  const income = data.pay.monthlyIncome || 1;
  const [open, setOpen] = useState<string | null>(null);
  const openRow = rows.find((r) => r.id === open);
  return (
    <Card className="p-4 flex flex-col gap-3">
      <Eyebrow>Target vs actual · ${fmt(data.pay.monthlyIncome)}/mo</Eyebrow>
      <div className="flex flex-col gap-1">
        <div className="text-[10px] text-muted">Target</div>
        <div className="flex h-4 rounded-[6px] overflow-hidden">{rows.map((r, i) => <div key={r.id} style={{ width: `${r.pct}%`, background: SPLIT_HEX[i] }} />)}</div>
        <div className="text-[10px] text-muted pt-1">Actual</div>
        <div className="flex h-4 rounded-[6px] overflow-hidden bg-line-soft">{rows.map((r, i) => <div key={r.id} style={{ width: `${Math.min(100, (r.actual / income) * 100)}%`, background: SPLIT_HEX[i] }} />)}</div>
      </div>
      <div className="flex flex-col">
        {rows.map((r, i) => {
          const diff = r.actual - r.target;
          return (
            <button key={r.id} onClick={() => setOpen(r.id)} className="flex items-center gap-2.5 py-2.5 border-t border-line-soft text-left hover:bg-surface/60 -mx-2 px-2 rounded-[8px]">
              <div className={cx("w-3 h-3 rounded-[4px]", SPLIT_COLORS[i])} />
              <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold">{r.name} · {r.pct}%</div><div className="text-[11px] text-muted">{r.what} · <span className="text-accent font-semibold">what&apos;s feeding this</span></div></div>
              <div className="flex flex-col items-end gap-0.5"><div className="text-[13px] font-semibold">{money(r.actual)} / {money(r.target)}</div><div className={cx("text-[11px] font-semibold", diff > 0 ? "text-red" : "text-green")}>{diff > 0 ? `+${money(diff)} over` : `${money(-diff)} under`}</div></div>
            </button>
          );
        })}
      </div>
      {openRow && <SliceSheet row={openRow} month={monthKey(today)} monthLabel={today.toLocaleString("en-US", { month: "long" })} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function BudgetView({ today }: { today: Date }) {
  const { data: d, update } = useHome();
  const data = d!;
  // Step through months or whole years to see how the current budget stacks against earlier periods.
  const [scale, setScale] = useState<"month" | "year">("month");
  const [offset, setOffset] = useState(0);
  const anchor = scale === "month" ? new Date(today.getFullYear(), today.getMonth() + offset, 1) : new Date(today.getFullYear() + offset, 0, 1);
  const isCurrent = offset === 0;
  const monthsOf = (y: number) => Array.from({ length: y === today.getFullYear() ? today.getMonth() + 1 : 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
  const window_ = scale === "month" ? [monthKey(anchor)] : monthsOf(anchor.getFullYear());
  const limitMonths = scale === "month" ? 1 : window_.length;
  // "Day of" the window: today for the current period, the end for past ones.
  const dimAnchor = getDaysInMonth(scale === "month" ? anchor : new Date(anchor.getFullYear(), window_.length - 1, 1));
  const dayOf = isCurrent ? today.getDate() : dimAnchor;
  const dim = dimAnchor;
  const rows = budgetRows(data, scale === "month" ? window_[0] : window_, dayOf, dim, limitMonths);
  const total = rows.reduce((s, r) => s + r.limit, 0);
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  const pace = isCurrent ? Math.round((scale === "month" ? today.getDate() / dim : (today.getMonth() + today.getDate() / dim) / limitMonths) * 100) : 100;
  const label = scale === "month" ? anchor.toLocaleString("en-US", { month: "long", year: "numeric" }) : String(anchor.getFullYear());
  const periodLabel = scale === "month" ? anchor.toLocaleString("en-US", { month: "short" }) : label;
  const hasHistory = data.transactions.some((t) => window_.includes(t.date.slice(0, 7)));
  // Did the money actually come in for this window? Counted deposits in the period vs what's budgeted for it.
  const incomeIn = window_.reduce((s, m) => s + actualsForMonth(data, m).income, 0);
  const expectedIn = expectedMonthlyIncome(data) * limitMonths;
  const incomeGap = total - incomeIn;
  const incomeTone: "red" | "amber" | "green" = incomeGap > 0 && (!isCurrent || pace >= 100 || total > expectedIn) ? "red" : incomeGap > 0 ? "amber" : "green";
  const incomeSub = incomeGap > 0 ? `budget is ${money(incomeGap)} more than came in${isCurrent && total > expectedIn ? ` · ${money(total - expectedIn)} over expected` : isCurrent ? " so far" : ""}` : `covers the budget · ${money(-incomeGap)} to spare`;
  const [editing, setEditing] = useState<BudgetCategory | "new" | null>(null);
  const recs = recommendBudgets(data, today);
  const actionable = recs.filter((r) => r.basis !== "none" && Math.round(r.recommended) !== Math.round(r.current));
  const thisQ = quarterOf(today);
  const applyAll = () => update((h) => ({ ...applyRecommendations(h, recs), settings: { ...h.settings, budgetsAppliedForQuarter: thisQ } }), `applied ${recs[0]?.quarter ?? "quarter"} budget recommendations`);
  const applyOne = (id: string) => update((h) => applyRecommendations(h, recs, [id]), "applied a budget recommendation");
  const toggleAuto = () => update((h) => ({ ...h, settings: { ...h.settings, autoApplyBudgetRecommendations: !h.settings.autoApplyBudgetRecommendations } }), "toggled auto budget reset");
  const save = (c: BudgetCategory) => update((h) => ({ ...h, budgets: h.budgets.some((x) => x.id === c.id) ? h.budgets.map((x) => (x.id === c.id ? c : x)) : [...h.budgets, c] }), `saved budget ${c.name}`);
  const remove = (id: string) => update((h) => ({ ...h, budgets: h.budgets.filter((b) => b.id !== id) }), "deleted budget category");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(offset - 1)} aria-label="Earlier" className="w-10 h-10 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field"><ChevronLeft size={16} /></button>
          <button onClick={() => setOffset(0)} className={cx("h-10 px-3 rounded-[10px] border text-[13px] font-semibold", isCurrent ? "bg-ink text-white border-ink" : "bg-card border-line hover:border-field")}>{label}</button>
          <button onClick={() => setOffset(offset + 1)} disabled={isCurrent} aria-label="Later" className="w-10 h-10 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
        <div className="w-44"><Segmented size="sm" value={scale} onChange={(s) => { setScale(s); setOffset(0); }} options={[{ id: "month", label: "Month" }, { id: "year", label: "Year" }]} /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:max-w-3xl">
        <Stat dark label={scale === "year" ? `Budgeted · ${limitMonths} mo` : "Budgeted"} value={money(total)} />
        <Stat label={`Income received (${periodLabel})`} value={money(incomeIn)} tone={incomeTone} sub={incomeSub} />
        <Stat label={`Spent (${periodLabel})`} value={money(spent)} />
        <Stat label={isCurrent ? "Remaining" : "Ended"} value={money(total - spent)} tone={total - spent < 0 ? "red" : spent / Math.max(1, total) > pace / 100 + 0.03 ? "amber" : "green"} sub={total > 0 ? `${Math.round((spent / total) * 100)}% of budget${spent > total ? " · over" : isCurrent ? ` · pace ${pace}%` : " · under"}` : undefined} />
      </div>
      {!isCurrent && <div className="text-xs text-muted">Showing {label} against <b>today&apos;s</b> limits{scale === "year" ? ` × ${limitMonths} months` : ""} — the budget doesn&apos;t keep a history of its own, so this is how that period would have stacked up under the current budget.{hasHistory ? "" : " No bank activity recorded for this period."}</div>}
      {isCurrent && scale === "month" && <div className="text-xs text-muted">Day {today.getDate()} of {dim} · you should be at about {pace}% of each budget (the dark marker).</div>}
      {isCurrent && scale === "year" && <div className="text-xs text-muted">{limitMonths} month{limitMonths === 1 ? "" : "s"} into {label} · limits × {limitMonths} · you should be at about {pace}% (the dark marker).</div>}

      {isCurrent && scale === "month" && recs.length > 0 && (
        <Card className="p-4 flex flex-col gap-2.5 border-accent-line bg-accent-bg/40">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2"><Sparkles size={16} className="text-accent" /><div className="text-sm font-semibold">Recommended for {thisQ}</div><div className="text-xs text-muted">· based on your {recs[0].quarter} averages</div></div>
            {actionable.length > 0 && <Button onClick={applyAll} className="h-9 px-3 text-xs">Apply all ({actionable.length})</Button>}
          </div>
          <div className="text-[12px] text-muted">Each quarter the recommendation resets to the previous quarter&apos;s average monthly spend per category. Categories with no history use their default limit.{data.settings.budgetsAppliedForQuarter === thisQ ? " Applied for this quarter." : ""}</div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!data.settings.autoApplyBudgetRecommendations} onChange={toggleAuto} className="w-4 h-4 accent-[#0e6b74]" /> Reset my budgets to the recommendations automatically at the start of each quarter</label>
        </Card>
      )}
      <Card className="md:grid md:grid-cols-2">
        {rows.map((r) => (
          <button key={r.id} onClick={() => setEditing(data.budgets.find((b) => b.id === r.id)!)} className="flex flex-col gap-1.5 px-4 py-3 border-b border-line-soft text-left hover:bg-surface/60 md:[&:nth-child(odd)]:border-r">
            <div className="flex items-baseline justify-between"><div className="text-sm font-semibold">{r.name}</div><div className="text-xs text-muted">{money(r.spent)} of {money(r.limit)}</div></div>
            <ProgressBar pct={r.pct} color={r.state === "over" ? "bg-red" : r.state === "ahead" ? "bg-amber" : "bg-accent"} marker={pace} />
            <div className="flex items-center justify-between gap-2">
              <div className={cx("text-[11px] font-semibold", r.state === "over" ? "text-red" : r.state === "ahead" ? "text-amber" : "text-accent")}>
                {r.state === "over" ? `${money(r.spent - r.limit)} over budget` : r.state === "ahead" ? `ahead of pace — ${money(r.limit - r.spent)} left` : `${money(r.limit - r.spent)} left · on track`}
              </div>
              {(() => { const rc = recs.find((x) => x.categoryId === r.id); if (!rc || rc.basis === "none" || Math.round(rc.recommended) === Math.round(rc.current)) return null; return (
                <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); applyOne(r.id); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); applyOne(r.id); } }} className="text-[11px] font-semibold text-accent bg-accent-bg border border-accent-line rounded-[8px] px-2 py-0.5 hover:bg-accent-soft">{rc.basis === "quarter" ? `avg ${money(rc.avg)} → set ${money(rc.recommended)}` : `default ${money(rc.recommended)}`}</span>
              ); })()}
            </div>
          </button>
        ))}
      </Card>
      <Button variant="dashed" onClick={() => setEditing("new")}>+ Add a budget category</Button>
      {editing && <CategoryForm cat={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={save} onDelete={remove} feeding={editing === "new" ? undefined : <Feeding categoryId={editing.id} month={scale === "month" ? window_[0] : window_} monthLabel={label} onClose={() => setEditing(null)} />} />}
    </div>
  );
}

/** What's actually counted against a budget this month: every line, grouped by item, each one opening its item page. */
function Feeding({ categoryId, month, monthLabel, onClose }: { categoryId: string; month: string | string[]; monthLabel: string; onClose: () => void }) {
  const data = useHome((s) => s.data)!;
  const openItem = useItem((s) => s.openItem);
  const [open, setOpen] = useState(false);
  const items = spendItems(data, Array.isArray(month) ? month : [month]).filter((i) => i.category === categoryId);
  const groups = new Map<string, { key?: string; name: string; total: number; count: number; kind: "bill" | "spend"; last: string }>();
  for (const i of items) { const k = i.key ?? i.name ?? "?"; const g = groups.get(k) ?? { key: i.key, name: i.name ?? "Item", total: 0, count: 0, kind: i.kind, last: i.date }; g.total += i.amount; g.count++; if (i.date > g.last) g.last = i.date; groups.set(k, g); }
  const rows = [...groups.values()].sort((a, b) => b.total - a.total);
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div className="rounded-[12px] border border-line overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center gap-2 px-3 py-2 text-left bg-surface hover:bg-surface/70">
        <div className="flex-1 text-[12px] font-semibold">What&apos;s feeding this · {monthLabel}</div>
        <div className="text-[12px] font-bold">{money(total)}</div>
        <span className="text-[11px] text-accent font-semibold">{open ? "hide" : `show ${rows.length}`}</span>
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto">
          {rows.length === 0 && <div className="px-3 py-3 text-[12px] text-muted">Nothing counted here yet this month.</div>}
          {rows.map((r) => (
            <button type="button" key={r.key ?? r.name} disabled={!r.key} onClick={() => { if (r.key) { onClose(); openItem(r.key); } }} className="w-full flex items-center gap-3 px-3 py-2 border-t border-line-soft text-left hover:bg-surface/60 disabled:cursor-default">
              <div className="flex-1 min-w-0"><div className="text-[12px] font-semibold truncate">{r.name}</div><div className="text-[11px] text-muted">{r.kind === "bill" ? "bill" : "everyday"} · {r.count}× · last {new Date(r.last + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div></div>
              <div className="text-[12px] font-semibold">{money(r.total)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryForm({ cat, onClose, onSave, onDelete, feeding }: { cat?: BudgetCategory; onClose: () => void; onSave: (c: BudgetCategory) => void; onDelete: (id: string) => void; feeding?: ReactNode }) {
  const [name, setName] = useState(cat?.name ?? "");
  const [limit, setLimit] = useState(cat?.limit ?? 0);
  const [bucket, setBucket] = useState<BudgetCategory["bucket"]>(cat?.bucket ?? "needs");
  const [defaultLimit, setDefaultLimit] = useState(cat?.defaultLimit ?? 0);
  return (
    <Modal open onClose={onClose} title={cat ? "Edit category" : "Add a budget category"}>
      {feeding}
      <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Groceries" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly limit ($)"><input className={inputCls} type="number" inputMode="decimal" value={limit || ""} onChange={(e) => setLimit(Number(e.target.value))} /></Field>
        <Field label="Default ($)" hint="Used as the recommendation when there's no spending history."><input className={inputCls} type="number" inputMode="decimal" value={defaultLimit || ""} onChange={(e) => setDefaultLimit(Number(e.target.value))} /></Field>
      </div>
      <Field label="Counts toward" hint="Used by 50/30/20 and 6 Cans to sort this category into a bucket. Reimbursable = you front it and it comes back, so it isn't spending.">
        <select className={selectCls} value={bucket} onChange={(e) => setBucket(e.target.value as BudgetCategory["bucket"])}>
          <option value="education">Education</option><option value="giving">Giving / tithe</option><option value="needs">Needs / necessities</option><option value="play">Play</option><option value="reimbursable">Reimbursable expense — money comes back</option><option value="savings">Savings & debt</option><option value="wants">Wants</option>
        </select>
      </Field>
      <div className="flex gap-2 pt-1">
        {cat && <Button variant="danger" onClick={() => { onDelete(cat.id); onClose(); }}>Delete</Button>}
        <Button className="flex-1" disabled={!name} onClick={() => { onSave({ id: cat?.id ?? uid(), name, limit, bucket, defaultLimit: defaultLimit || undefined }); onClose(); }}>Save</Button>
      </div>
    </Modal>
  );
}
