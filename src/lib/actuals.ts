import { endOfMonth, getDaysInMonth } from "date-fns";
import type { HomeData } from "./types";
import { billKeyMap, classify } from "./merchants";

/**
 * What actually happened, day by day, from the bank: counted deposits in, bill payments and everyday
 * spending out — transfers between your own accounts and ignored items left out. This is the
 * "actual" that projections defer to for days that have already passed.
 */
export interface DayActual { income: number; bills: number; spend: number; billNames: string[] }

/** The month a deposit pays for: the calendar month, unless it landed on/after the roll day — then the next month. */
export function incomeMonthOf(data: HomeData, date: string): string {
  const roll = data.pay.incomeRollDay;
  const month = date.slice(0, 7);
  if (!roll || Number(date.slice(8, 10)) < roll) return month;
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 1); // m is 1-based → next month
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

export function actualsByDay(data: HomeData, monthKey: string): DayActual[] {
  const [y, m] = monthKey.split("-").map(Number);
  const dim = getDaysInMonth(new Date(y, m - 1, 1));
  const days: DayActual[] = Array.from({ length: dim + 1 }, () => ({ income: 0, bills: 0, spend: 0, billNames: [] }));
  for (const e of data.income ?? []) {
    if (e.status === "ignored" || e.internal) continue;
    if (e.status === "refund") { if (e.date.startsWith(monthKey)) days[Number(e.date.slice(8, 10))].spend -= e.amount; continue; }
    // A paycheck that rolls into the next month lands on day 1 of that month (it's what the month starts with).
    if (incomeMonthOf(data, e.date) !== monthKey) continue;
    days[e.date.startsWith(monthKey) ? Number(e.date.slice(8, 10)) : 1].income += e.amount;
  }
  const bills = billKeyMap(data);
  for (const t of data.transactions) {
    if (!t.date.startsWith(monthKey) || t.amount <= 0) continue;
    const c = classify(data, t, bills);
    if (c.kind === "ignore" || c.kind === "transfer" || c.kind === "reimbursable") continue;
    const d = days[Number(t.date.slice(8, 10))];
    if (c.kind === "bill") { d.bills += t.amount; if (c.bill && !d.billNames.includes(c.bill.name)) d.billNames.push(c.bill.name); }
    else d.spend += t.amount;
  }
  return days;
}

/**
 * One honest list of money out for a month, for anything that rolls up spending by category or bucket:
 * every transaction with the household's decisions applied (merges, renamed, category overrides),
 * transfers / hidden / reimbursable left out, refunds as negative lines. `kind` tells bills from everyday.
 */
export interface SpendItem { category: string; amount: number; kind: "bill" | "spend"; date: string; /** merchant key (opens the item page) and the name to show */ key?: string; name?: string }
export function spendItems(data: HomeData, months: string[]): SpendItem[] {
  const set = new Set(months);
  const bills = billKeyMap(data);
  const out: SpendItem[] = [];
  for (const t of data.transactions) {
    if (t.amount <= 0 || !set.has(t.date.slice(0, 7))) continue;
    const c = classify(data, t, bills);
    if (c.kind === "ignore" || c.kind === "transfer" || c.kind === "reimbursable") continue;
    const pref = data.settings.merchants?.[c.key];
    out.push({ category: pref?.category ?? c.bill?.category ?? t.category, amount: t.amount, kind: c.kind === "bill" ? "bill" : "spend", date: t.date, key: c.key, name: pref?.name ?? c.bill?.name ?? t.description });
  }
  for (const e of data.income ?? []) if (e.status === "refund" && set.has(e.date.slice(0, 7))) out.push({ category: "refund", amount: -e.amount, kind: "spend", date: e.date });
  // Bills paid by hand (no bank transaction behind the payment) still count in their category.
  const matched = new Set(out.filter((i) => i.kind === "bill").map((i) => i.date.slice(0, 7) + ":" + i.category));
  for (const p of data.payments) {
    if (!set.has(p.month)) continue;
    const b = data.bills.find((x) => x.id === p.billId);
    if (!b) continue;
    const hasTx = data.transactions.some((t) => t.date.slice(0, 7) === p.month && classify(data, t, bills).bill?.id === b.id);
    if (!hasTx) out.push({ category: b.category, amount: p.amount, kind: "bill", date: p.paidAt.slice(0, 10), key: b.merchant, name: `${b.name} (marked paid by hand)` });
  }
  void matched;
  return out;
}

export interface MonthActual { income: number; bills: number; spend: number; days: number; hasData: boolean }

/** Totals for a month (or for the month up to `throughDay`). */
export function actualsForMonth(data: HomeData, monthKey: string, throughDay?: number): MonthActual {
  const days = actualsByDay(data, monthKey);
  const last = throughDay ?? days.length - 1;
  let income = 0, bills = 0, spend = 0;
  for (let d = 1; d <= last; d++) { income += days[d].income; bills += days[d].bills; spend += days[d].spend; }
  const hasData = (data.income ?? []).some((e) => incomeMonthOf(data, e.date) === monthKey) || data.transactions.some((t) => t.date.startsWith(monthKey));
  return { income, bills, spend, days: last, hasData };
}

export const monthEndKey = (monthKey: string) => { const [y, m] = monthKey.split("-").map(Number); return endOfMonth(new Date(y, m - 1, 1)); };
