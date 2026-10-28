import { spendItems } from "./actuals";
import { getDaysInMonth } from "date-fns";
import type { HomeData } from "./types";
import { budgetRows, debtsFromAccounts, monthKey, simulatePayoff, splitRows, strategyMeta } from "./strategies";
import { activeBills, billStatuses, billsInRange, currentPeriodRange, weeklyProjection, yearProjection } from "./projections";
import { compare, periodFor, sameTimeLastYear } from "./insights";

/**
 * The Focus board: a grid of widgets the household composes itself.
 * A widget = a visual (kpi / bar / donut / gauge / list) + a data source + a size.
 * Sources are a registry of named queries over HomeData, so new ones are one entry here.
 */

export type WidgetKind = "kpi" | "bar" | "donut" | "gauge" | "list";

export interface Widget {
  id: string;
  kind: WidgetKind;
  source: string;       // ScalarSource id (kpi/gauge) or SeriesSource id (bar/donut/list)
  param?: string;       // e.g. a category id or account id when the source needs one
  target?: string;      // gauge only: a scalar source id for the target, or a number as string
  title?: string;
  w: 1 | 2 | 3;         // desktop columns
}

export interface Dashboard { widgets: Widget[] }

export interface Point { id: string; label: string; value: number; sub?: string; color?: string }
export interface ScalarResult { value: number; format: "money" | "number" | "months" | "pct"; sub?: string; delta?: number }
export interface SeriesResult { points: Point[]; format: "money" | "number" }

interface ParamOption { id: string; label: string }
interface SourceDef<T> {
  id: string;
  name: string;
  group: string;
  /** When set, the source needs a parameter chosen from these. */
  params?: (d: HomeData) => ParamOption[];
  run: (d: HomeData, today: Date, param?: string) => T;
}

const PALETTE = ["#0e6b74", "#b45309", "#4fb3bc", "#7a8294", "#141821", "#d9a066", "#1e7a3c", "#9cd3d8", "#b42318"];
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const cats = (d: HomeData) => d.budgets.map((b) => ({ id: b.id, label: b.name }));
const accts = (d: HomeData) => d.accounts.filter((a) => a.kind !== "credit-score").map((a) => ({ id: a.id, label: a.name }));

/* ------------------------------ scalar sources ------------------------------ */

export const SCALARS: SourceDef<ScalarResult>[] = [
  { id: "income", name: "Monthly income", group: "Cash flow", run: (d) => ({ value: d.pay.monthlyIncome, format: "money" }) },
  { id: "bills-total", name: "Bills per month", group: "Cash flow", run: (d, t) => ({ value: sum(activeBills(d, monthKey(t)).map((b) => b.amount)), format: "money" }) },
  { id: "left-to-pay", name: "Left to pay this period", group: "Cash flow", run: (d, t) => { const s = billsInRange(d, currentPeriodRange(d, t), t); return { value: sum(s.filter((x) => !x.paid).map((x) => x.bill.amount)), format: "money", sub: `${s.filter((x) => x.paid).length} of ${s.length} paid` }; } },
  { id: "overdue", name: "Overdue bills", group: "Cash flow", run: (d, t) => { const s = billStatuses(d, t).filter((x) => x.overdue); return { value: sum(s.map((x) => x.bill.amount)), format: "money", sub: `${s.length} bill${s.length === 1 ? "" : "s"}` }; } },
  { id: "spend-month", name: "Everyday spending this month", group: "Cash flow", run: (d, t) => { const m = monthKey(t); const c = compare(d, "spending", periodFor(t, "month"), sameTimeLastYear(periodFor(t, "month"))); return { value: sum(spendItems(d, [m]).filter((i) => i.kind === "spend").map((i) => i.amount)), format: "money", delta: c.bEmpty ? undefined : c.totalA - c.totalB, sub: c.bEmpty ? undefined : "vs same month last year" }; } },
  { id: "left-over", name: "Projected left over this month", group: "Cash flow", run: (d, t) => { const m = yearProjection(d, t)[t.getMonth()]; return { value: m.net, format: "money" }; } },
  { id: "week-end", name: "End of this week balance", group: "Cash flow", run: (d, t) => { const w = weeklyProjection(d, t).find((x) => x.state === "current"); return { value: w?.endBalance ?? 0, format: "money", sub: w?.label }; } },
  { id: "checking", name: "Checking balance", group: "Accounts", run: (d) => ({ value: sum(d.accounts.filter((a) => a.kind === "checking").map((a) => a.balance)), format: "money" }) },
  { id: "savings", name: "Savings balance", group: "Accounts", run: (d) => ({ value: sum(d.accounts.filter((a) => a.kind === "savings").map((a) => a.balance)), format: "money" }) },
  { id: "debt", name: "Total debt (excl. mortgage)", group: "Debt", run: (d) => ({ value: sum(debtsFromAccounts(d.accounts).map((x) => x.balance)), format: "money" }) },
  { id: "debt-all", name: "Total debt (incl. mortgage)", group: "Debt", run: (d) => ({ value: sum(debtsFromAccounts(d.accounts, true).map((x) => x.balance)), format: "money" }) },
  { id: "net-worth", name: "Net worth", group: "Accounts", run: (d) => ({ value: sum(d.accounts.filter((a) => a.kind === "checking" || a.kind === "savings").map((a) => a.balance)) - sum(debtsFromAccounts(d.accounts, true).map((x) => x.balance)), format: "money" }) },
  { id: "months-free", name: "Months to debt-free", group: "Debt", run: (d) => ({ value: simulatePayoff(debtsFromAccounts(d.accounts), d.settings.strategy, d.settings.extraPayment).months, format: "months", sub: strategyMeta(d.settings.strategy).name }) },
  { id: "interest", name: "Interest until debt-free", group: "Debt", run: (d) => ({ value: simulatePayoff(debtsFromAccounts(d.accounts), d.settings.strategy, d.settings.extraPayment).totalInterest, format: "money" }) },
  { id: "budget-left", name: "Budget remaining", group: "Budget", run: (d, t) => { const r = budgetRows(d, monthKey(t), t.getDate(), getDaysInMonth(t)); return { value: sum(r.map((x) => x.limit)) - sum(r.map((x) => x.spent)), format: "money", sub: `${r.filter((x) => x.state === "over").length} over` }; } },
  { id: "credit-score", name: "Credit score", group: "Accounts", run: (d) => ({ value: d.accounts.find((a) => a.kind === "credit-score")?.balance ?? 0, format: "number" }) },
  { id: "cat-spent", name: "Spent in a category", group: "Budget", params: cats, run: (d, t, p) => { const r = budgetRows(d, monthKey(t), t.getDate(), getDaysInMonth(t)).find((x) => x.id === p); return { value: r?.spent ?? 0, format: "money", sub: r ? `of $${Math.round(r.limit).toLocaleString()}` : undefined }; } },
  { id: "cat-limit", name: "Budget limit of a category", group: "Budget", params: cats, run: (d, _t, p) => ({ value: d.budgets.find((b) => b.id === p)?.limit ?? 0, format: "money" }) },
  { id: "acct-balance", name: "Balance of an account", group: "Accounts", params: accts, run: (d, _t, p) => ({ value: d.accounts.find((a) => a.id === p)?.balance ?? 0, format: "money" }) },
  { id: "starter-goal", name: "Starter fund goal", group: "Goals", run: (d) => ({ value: d.settings.starterFundGoal, format: "money" }) },
  { id: "ef-goal", name: "Emergency fund goal", group: "Goals", run: (d, t) => ({ value: (sum(activeBills(d, monthKey(t)).map((b) => b.amount)) + d.settings.everydaySpend) * d.settings.emergencyMonths, format: "money" }) },
  { id: "debt-paid-ytd", name: "Debt paid down this year", group: "Debt", run: (d, t) => { const y = String(t.getFullYear()); const h = (d.balanceHistory ?? []).filter((p) => p.date < y); const ids = debtsFromAccounts(d.accounts, true).map((x) => x.id); let start = 0, any = false; for (const id of ids) { const pts = h.filter((p) => p.accountId === id).sort((a, b) => b.date.localeCompare(a.date)); if (pts[0]) { start += pts[0].balance; any = true; } } return { value: any ? start - sum(debtsFromAccounts(d.accounts, true).map((x) => x.balance)) : 0, format: "money", sub: any ? `since Jan 1` : "needs balance history" }; } },
];

/* ------------------------------ series sources ------------------------------ */

export const SERIES: SourceDef<SeriesResult>[] = [
  { id: "spend-by-cat", name: "Spending by category (this month)", group: "Budget", run: (d, t) => ({ format: "money", points: budgetRows(d, monthKey(t), t.getDate(), getDaysInMonth(t)).filter((r) => r.spent > 0).map((r, i) => ({ id: r.id, label: r.name, value: r.spent, sub: `of $${Math.round(r.limit).toLocaleString()}`, color: PALETTE[i % PALETTE.length] })) }) },
  { id: "budget-vs-spent", name: "Budget vs spent", group: "Budget", run: (d, t) => ({ format: "money", points: budgetRows(d, monthKey(t), t.getDate(), getDaysInMonth(t)).map((r) => ({ id: r.id, label: r.name, value: r.spent, sub: `limit $${Math.round(r.limit).toLocaleString()}`, color: r.state === "over" ? "#b42318" : r.state === "ahead" ? "#b45309" : "#0e6b74" })) }) },
  { id: "debt-by-acct", name: "Debt by account", group: "Debt", run: (d) => ({ format: "money", points: debtsFromAccounts(d.accounts, true).sort((a, b) => b.balance - a.balance).map((x, i) => ({ id: x.id, label: x.name, value: x.balance, sub: `${x.apr}% APR`, color: PALETTE[i % PALETTE.length] })) }) },
  { id: "payoff-order", name: "Payoff order (current strategy)", group: "Debt", run: (d) => { const p = simulatePayoff(debtsFromAccounts(d.accounts), d.settings.strategy, d.settings.extraPayment); return { format: "number", points: p.order.map((x, i) => ({ id: x.id, label: `${x.rank}. ${x.name}`, value: x.paidOffMonth, sub: `$${Math.round(x.balance).toLocaleString()} · paid off month ${x.paidOffMonth}`, color: i === 0 ? "#0e6b74" : "#9cd3d8" })) }; } },
  { id: "bills-by-cat", name: "Bills by category", group: "Cash flow", run: (d, t) => { const m = new Map<string, number>(); for (const b of activeBills(d, monthKey(t))) m.set(b.category, (m.get(b.category) ?? 0) + b.amount); return { format: "money", points: [...m].map(([id, v], i) => ({ id, label: d.budgets.find((b) => b.id === id)?.name ?? id, value: v, color: PALETTE[i % PALETTE.length] })).sort((a, b) => b.value - a.value) }; } },
  { id: "bills-period", name: "Bills due this period", group: "Cash flow", run: (d, t) => { return { format: "money", points: billsInRange(d, currentPeriodRange(d, t), t).map((x) => ({ id: x.bill.id, label: x.bill.name, value: x.bill.amount, sub: x.paid ? "paid" : x.overdue ? "overdue" : `due ${x.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, color: x.paid ? "#1e7a3c" : x.overdue ? "#b42318" : "#b45309" })) }; } },
  { id: "weekly-balance", name: "Ending balance by week", group: "Cash flow", run: (d, t) => ({ format: "money", points: weeklyProjection(d, t).map((w) => ({ id: String(w.index), label: `W${w.index + 1}`, value: w.endBalance, sub: w.label, color: w.endBalance < 0 ? "#b42318" : w.state === "current" ? "#141821" : w.state === "past" ? "#0e6b74" : "#9cd3d8" })) }) },
  { id: "monthly-net", name: "Left over by month (year)", group: "Cash flow", run: (d, t) => ({ format: "money", points: yearProjection(d, t).map((m) => ({ id: m.key, label: m.name, value: m.net, sub: m.state === "future" ? "projected" : m.state, color: m.net < 0 ? "#b42318" : m.state === "future" ? "#9cd3d8" : m.state === "current" ? "#141821" : "#0e6b74" })) }) },
  { id: "split", name: "Strategy split: target vs actual", group: "Plan", run: (d, t) => { const s = d.settings.strategy === "sixcans" ? "sixcans" : "503020"; return { format: "money", points: splitRows(d, s, monthKey(t)).map((r, i) => ({ id: r.id, label: r.name, value: r.actual, sub: `target $${Math.round(r.target).toLocaleString()}`, color: PALETTE[i % PALETTE.length] })) }; } },
  { id: "accounts", name: "Account balances", group: "Accounts", run: (d) => ({ format: "money", points: d.accounts.filter((a) => a.kind !== "credit-score" && a.kind !== "biller").map((a, i) => ({ id: a.id, label: a.name, value: a.balance, sub: a.kind, color: PALETTE[i % PALETTE.length] })) }) },
  { id: "yoy-spend", name: "Spending: this month vs last year", group: "Insights", run: (d, t) => { const c = compare(d, "spending", periodFor(t, "month"), sameTimeLastYear(periodFor(t, "month"))); return { format: "money", points: c.rows.map((r, i) => ({ id: r.id, label: r.name, value: r.a, sub: c.bEmpty ? "no data last year" : `last year $${Math.round(r.b).toLocaleString()}`, color: PALETTE[i % PALETTE.length] })) }; } },
  { id: "acct-history", name: "Balance history of an account", group: "Accounts", params: accts, run: (d, _t, p) => ({ format: "money", points: (d.balanceHistory ?? []).filter((x) => x.accountId === p).sort((a, b) => a.date.localeCompare(b.date)).slice(-12).map((x) => ({ id: x.date, label: x.date.slice(5), value: x.balance, sub: x.date, color: "#0e6b74" })) }) },
];

export const scalar = (id: string) => SCALARS.find((s) => s.id === id);
export const series = (id: string) => SERIES.find((s) => s.id === id);
export const isScalarKind = (k: WidgetKind) => k === "kpi" || k === "gauge";

export function runScalar(d: HomeData, today: Date, id: string, param?: string): ScalarResult {
  const s = scalar(id);
  return s ? s.run(d, today, param) : { value: 0, format: "number", sub: "unknown source" };
}
export function runSeries(d: HomeData, today: Date, id: string, param?: string): SeriesResult {
  const s = series(id);
  return s ? s.run(d, today, param) : { points: [], format: "number" };
}
/** A gauge target is either another scalar source id or a literal number. */
export function runTarget(d: HomeData, today: Date, target?: string, param?: string): number {
  if (!target) return 0;
  if (/^[\d.]+$/.test(target)) return Number(target);
  return runScalar(d, today, target, param).value;
}

export const defaultTitle = (w: Widget, d: HomeData): string => {
  const src = isScalarKind(w.kind) ? scalar(w.source) : series(w.source);
  const name = src?.name ?? w.source;
  const p = src?.params?.(d).find((x) => x.id === w.param)?.label;
  return p ? `${name.replace(/ (of|in) an? (account|category)$/, "")}: ${p}` : name;
};

/** Starter board for a new home. */
export const defaultDashboard = (): Dashboard => ({
  widgets: [
    { id: "w1", kind: "kpi", source: "left-to-pay", w: 1 },
    { id: "w2", kind: "kpi", source: "net-worth", w: 1 },
    { id: "w3", kind: "kpi", source: "months-free", w: 1 },
    { id: "w4", kind: "donut", source: "spend-by-cat", w: 1 },
    { id: "w5", kind: "bar", source: "budget-vs-spent", w: 2 },
    { id: "w6", kind: "gauge", source: "savings", target: "starter-goal", title: "Starter emergency fund", w: 1 },
    { id: "w7", kind: "list", source: "bills-period", w: 2 },
  ],
});
