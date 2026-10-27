"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { getDaysInMonth } from "date-fns";
import { useHome } from "@/store/useHome";
import { useToday } from "@/components/hooks";
import { Button, Card, Eyebrow, Field, Modal, ProgressBar, Segmented, SectionTitle, Stat, cx, fmt, inputCls, money, selectCls } from "@/components/ui";
import { STRATEGIES, babySteps, budgetRows, debtsFromAccounts, monthKey, simulatePayoff, splitRows, strategyMeta } from "@/lib/strategies";
import type { BudgetCategory, StrategyId } from "@/lib/types";
import { uid } from "@/lib/storage/adapter";

const SPLIT_COLORS = ["bg-accent", "bg-amber", "bg-teal", "bg-muted-2", "bg-ink", "bg-gold"];
const SPLIT_HEX = ["#0e6b74", "#b45309", "#4fb3bc", "#7a8294", "#141821", "#d9a066"];

export default function PlanPage() {
  const params = useSearchParams();
  const { data: d, update } = useHome();
  const data = d!;
  const today = useToday();
  const [view, setView] = useState<"strategy" | "budget">((params.get("view") as "budget") === "budget" ? "budget" : "strategy");
  const strat = strategyMeta(data.settings.strategy);
  const setStrategy = (s: StrategyId) => update((h) => ({ ...h, settings: { ...h.settings, strategy: s } }), `switched strategy to ${strategyMeta(s).name}`);
  const setExtra = (n: number) => update((h) => ({ ...h, settings: { ...h.settings, extraPayment: n } }), "changed extra payment");

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Plan</h1>
      <div className="md:max-w-sm"><Segmented value={view} onChange={setView} options={[{ id: "strategy", label: "Strategy" }, { id: "budget", label: "Budget" }]} /></div>

      {view === "strategy" && (
        <div className="md:grid md:grid-cols-12 md:gap-6 flex flex-col gap-4">
          <div className="md:col-span-4 flex flex-col gap-4">
            <Field label="Strategy">
              <select className={cx(selectCls, "h-[52px] text-[15px] font-semibold rounded-[14px]")} value={data.settings.strategy} onChange={(e) => setStrategy(e.target.value as StrategyId)}>
                {STRATEGIES.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.headline}</option>)}
              </select>
            </Field>
            <Card className="p-4 flex flex-col gap-1"><div className="text-sm font-semibold">{strat.headline}</div><div className="text-xs text-muted leading-relaxed">{strat.description}</div></Card>
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

function SplitView() {
  const data = useHome((s) => s.data)!;
  const today = useToday();
  const rows = splitRows(data, data.settings.strategy as "503020" | "sixcans", monthKey(today));
  const income = data.pay.monthlyIncome || 1;
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
            <div key={r.id} className="flex items-center gap-2.5 py-2.5 border-t border-line-soft">
              <div className={cx("w-3 h-3 rounded-[4px]", SPLIT_COLORS[i])} />
              <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold">{r.name} · {r.pct}%</div><div className="text-[11px] text-muted">{r.what}</div></div>
              <div className="flex flex-col items-end gap-0.5"><div className="text-[13px] font-semibold">{money(r.actual)} / {money(r.target)}</div><div className={cx("text-[11px] font-semibold", diff > 0 ? "text-red" : "text-green")}>{diff > 0 ? `+${money(diff)} over` : `${money(-diff)} under`}</div></div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function BudgetView({ today }: { today: Date }) {
  const { data: d, update } = useHome();
  const data = d!;
  const dim = getDaysInMonth(today);
  const rows = budgetRows(data, monthKey(today), today.getDate(), dim);
  const total = rows.reduce((s, r) => s + r.limit, 0);
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  const pace = Math.round((today.getDate() / dim) * 100);
  const [editing, setEditing] = useState<BudgetCategory | "new" | null>(null);
  const save = (c: BudgetCategory) => update((h) => ({ ...h, budgets: h.budgets.some((x) => x.id === c.id) ? h.budgets.map((x) => (x.id === c.id ? c : x)) : [...h.budgets, c] }), `saved budget ${c.name}`);
  const remove = (id: string) => update((h) => ({ ...h, budgets: h.budgets.filter((b) => b.id !== id) }), "deleted budget category");
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2.5 md:max-w-xl">
        <Stat dark label="Budgeted" value={money(total)} />
        <Stat label={`Spent (${today.toLocaleString("en-US", { month: "short" })})`} value={money(spent)} />
        <Stat label="Remaining" value={money(total - spent)} tone={total - spent < 0 ? "red" : "green"} />
      </div>
      <div className="text-xs text-muted">Day {today.getDate()} of {dim} · you should be at about {pace}% of each budget (the dark marker).</div>
      <Card className="md:grid md:grid-cols-2">
        {rows.map((r) => (
          <button key={r.id} onClick={() => setEditing(data.budgets.find((b) => b.id === r.id)!)} className="flex flex-col gap-1.5 px-4 py-3 border-b border-line-soft text-left hover:bg-surface/60 md:[&:nth-child(odd)]:border-r">
            <div className="flex items-baseline justify-between"><div className="text-sm font-semibold">{r.name}</div><div className="text-xs text-muted">{money(r.spent)} of {money(r.limit)}</div></div>
            <ProgressBar pct={r.pct} color={r.state === "over" ? "bg-red" : r.state === "ahead" ? "bg-amber" : "bg-accent"} marker={pace} />
            <div className={cx("text-[11px] font-semibold", r.state === "over" ? "text-red" : r.state === "ahead" ? "text-amber" : "text-accent")}>
              {r.state === "over" ? `${money(r.spent - r.limit)} over budget` : r.state === "ahead" ? `ahead of pace — ${money(r.limit - r.spent)} left` : `${money(r.limit - r.spent)} left · on track`}
            </div>
          </button>
        ))}
      </Card>
      <Button variant="dashed" onClick={() => setEditing("new")}>+ Add a budget category</Button>
      {editing && <CategoryForm cat={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />}
    </div>
  );
}

function CategoryForm({ cat, onClose, onSave, onDelete }: { cat?: BudgetCategory; onClose: () => void; onSave: (c: BudgetCategory) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState(cat?.name ?? "");
  const [limit, setLimit] = useState(cat?.limit ?? 0);
  const [bucket, setBucket] = useState<BudgetCategory["bucket"]>(cat?.bucket ?? "needs");
  return (
    <Modal open onClose={onClose} title={cat ? "Edit category" : "Add a budget category"}>
      <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Groceries" /></Field>
      <Field label="Monthly limit ($)"><input className={inputCls} type="number" inputMode="decimal" value={limit || ""} onChange={(e) => setLimit(Number(e.target.value))} /></Field>
      <Field label="Counts toward" hint="Used by 50/30/20 and 6 Cans to sort this category into a bucket.">
        <select className={selectCls} value={bucket} onChange={(e) => setBucket(e.target.value as BudgetCategory["bucket"])}>
          <option value="needs">Needs / necessities</option><option value="wants">Wants</option><option value="play">Play</option><option value="education">Education</option><option value="savings">Savings & debt</option><option value="giving">Giving / tithe</option>
        </select>
      </Field>
      <div className="flex gap-2 pt-1">
        {cat && <Button variant="danger" onClick={() => { onDelete(cat.id); onClose(); }}>Delete</Button>}
        <Button className="flex-1" disabled={!name} onClick={() => { onSave({ id: cat?.id ?? uid(), name, limit, bucket }); onClose(); }}>Save</Button>
      </div>
    </Modal>
  );
}
