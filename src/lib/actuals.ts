import { endOfMonth, getDaysInMonth } from "date-fns";
import type { HomeData } from "./types";
import { billKeyMap, classify } from "./merchants";

/**
 * What actually happened, day by day, from the bank: counted deposits in, bill payments and everyday
 * spending out — transfers between your own accounts and ignored items left out. This is the
 * "actual" that projections defer to for days that have already passed.
 */
export interface DayActual { income: number; bills: number; spend: number; billNames: string[] }

export function actualsByDay(data: HomeData, monthKey: string): DayActual[] {
  const [y, m] = monthKey.split("-").map(Number);
  const dim = getDaysInMonth(new Date(y, m - 1, 1));
  const days: DayActual[] = Array.from({ length: dim + 1 }, () => ({ income: 0, bills: 0, spend: 0, billNames: [] }));
  for (const e of data.income ?? []) {
    if (!e.date.startsWith(monthKey) || e.status === "ignored" || e.internal) continue;
    days[Number(e.date.slice(8, 10))].income += e.amount;
  }
  const bills = billKeyMap(data);
  for (const t of data.transactions) {
    if (!t.date.startsWith(monthKey) || t.amount <= 0) continue;
    const c = classify(data, t, bills);
    if (c.kind === "ignore" || c.kind === "transfer") continue;
    const d = days[Number(t.date.slice(8, 10))];
    if (c.kind === "bill") { d.bills += t.amount; if (c.bill && !d.billNames.includes(c.bill.name)) d.billNames.push(c.bill.name); }
    else d.spend += t.amount;
  }
  return days;
}

export interface MonthActual { income: number; bills: number; spend: number; days: number; hasData: boolean }

/** Totals for a month (or for the month up to `throughDay`). */
export function actualsForMonth(data: HomeData, monthKey: string, throughDay?: number): MonthActual {
  const days = actualsByDay(data, monthKey);
  const last = throughDay ?? days.length - 1;
  let income = 0, bills = 0, spend = 0;
  for (let d = 1; d <= last; d++) { income += days[d].income; bills += days[d].bills; spend += days[d].spend; }
  const hasData = (data.income ?? []).some((e) => e.date.startsWith(monthKey)) || data.transactions.some((t) => t.date.startsWith(monthKey));
  return { income, bills, spend, days: last, hasData };
}

export const monthEndKey = (monthKey: string) => { const [y, m] = monthKey.split("-").map(Number); return endOfMonth(new Date(y, m - 1, 1)); };
