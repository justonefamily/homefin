import { addDays, endOfMonth, getDaysInMonth, startOfMonth } from "date-fns";
import type { Bill, HomeData } from "./types";
import { monthKey } from "./strategies";

/* ------------------------------------------------------------------ */
/* Pay periods: 1st–splitDay and (splitDay+1)–end of month             */
/* ------------------------------------------------------------------ */

export type Period = "a" | "b";

export const inPeriod = (day: number, period: Period, splitDay: number) => (period === "a" ? day <= splitDay : day > splitDay);

export const periodLabel = (date: Date, period: Period, splitDay: number) => {
  const m = date.toLocaleString("en-US", { month: "short" });
  return period === "a" ? `${m} 1 – ${splitDay}` : `${m} ${splitDay + 1} – ${getDaysInMonth(date)}`;
};

export const currentPeriod = (date: Date, splitDay: number): Period => (date.getDate() <= splitDay ? "a" : "b");

export const isPaid = (data: HomeData, bill: Bill, month: string) => data.payments.some((p) => p.billId === bill.id && p.month === month);

export interface BillStatus { bill: Bill; paid: boolean; overdue: boolean; dueDate: Date; }

export function billStatuses(data: HomeData, date: Date): BillStatus[] {
  const month = monthKey(date);
  const dim = getDaysInMonth(date);
  return data.bills
    .map((bill) => {
      const paid = isPaid(data, bill, month);
      const day = Math.min(bill.dueDay, dim);
      return { bill, paid, overdue: !paid && day < date.getDate(), dueDate: new Date(date.getFullYear(), date.getMonth(), day) };
    })
    .sort((a, b) => a.bill.dueDay - b.bill.dueDay);
}

/* ------------------------------------------------------------------ */
/* Weekly cash-flow projection (Sun–Sat weeks of the month)            */
/* ------------------------------------------------------------------ */

export interface WeekRow {
  index: number;
  start: Date;
  end: Date;
  label: string;
  startBalance: number;
  income: number;
  bills: number;
  everyday: number;
  endBalance: number;
  billNames: string[];
  state: "past" | "current" | "future";
}

/**
 * Starting from the current checking balance *today*, walk backwards/forwards so every
 * week of the month shows what the balance should be at the end of that week.
 */
export function weeklyProjection(data: HomeData, today: Date): WeekRow[] {
  const checking = data.accounts.filter((a) => a.kind === "checking").reduce((s, a) => s + a.balance, 0);
  const first = startOfMonth(today);
  const last = endOfMonth(today);
  const dim = getDaysInMonth(today);
  const paycheck = data.pay.monthlyIncome / Math.max(1, data.pay.payDays.length);
  const everydayPerDay = data.settings.everydaySpend / dim;
  const statuses = billStatuses(data, today);

  // Per-day net flow for the whole month.
  const flow: number[] = Array(dim + 1).fill(0);
  for (let d = 1; d <= dim; d++) {
    if (data.pay.payDays.includes(d)) flow[d] += paycheck;
    flow[d] -= everydayPerDay;
  }
  for (const s of statuses) flow[s.dueDate.getDate()] -= s.bill.amount;

  // Balance at start of month = today's balance minus everything that already happened.
  let startOfMonthBal = checking;
  for (let d = 1; d <= today.getDate(); d++) startOfMonthBal -= flow[d];

  const weeks: WeekRow[] = [];
  let cursor = first;
  let bal = startOfMonthBal;
  let i = 0;
  while (cursor <= last) {
    const weekEnd = addDays(cursor, 6 - cursor.getDay());
    const end = weekEnd > last ? last : weekEnd;
    const startBalance = bal;
    let income = 0, bills = 0, everyday = 0;
    const billNames: string[] = [];
    for (let d = cursor.getDate(); d <= end.getDate(); d++) {
      if (data.pay.payDays.includes(d)) income += paycheck;
      everyday += everydayPerDay;
      for (const s of statuses) if (s.dueDate.getDate() === d) { bills += s.bill.amount; billNames.push(s.bill.name); }
    }
    bal = startBalance + income - bills - everyday;
    const state: WeekRow["state"] = today > end ? "past" : today < cursor ? "future" : "current";
    weeks.push({ index: i++, start: cursor, end, label: `${cursor.toLocaleString("en-US", { month: "short" })} ${cursor.getDate()} – ${end.getDate()}`, startBalance, income, bills, everyday, endBalance: bal, billNames, state });
    cursor = addDays(end, 1);
  }
  return weeks;
}

/* ------------------------------------------------------------------ */
/* Year projection                                                     */
/* ------------------------------------------------------------------ */

export interface MonthRow { month: number; name: string; key: string; income: number; bills: number; net: number; state: "past" | "current" | "future"; }

export function yearProjection(data: HomeData, today: Date): MonthRow[] {
  const year = today.getFullYear();
  const monthlyBills = data.bills.reduce((s, b) => s + b.amount, 0);
  return Array.from({ length: 12 }, (_, m) => {
    const d = new Date(year, m, 1);
    const key = monthKey(d);
    const state: MonthRow["state"] = m < today.getMonth() ? "past" : m === today.getMonth() ? "current" : "future";
    // Past months: use recorded transactions + bills paid that month if any; otherwise fall back to the template.
    const tx = data.transactions.filter((t) => t.date.startsWith(key)).reduce((s, t) => s + t.amount, 0);
    const paidBills = data.payments.filter((p) => p.month === key).reduce((s, p) => s + p.amount, 0);
    const bills = state === "future" ? monthlyBills : paidBills || monthlyBills;
    const everyday = state === "past" && tx ? tx : data.settings.everydaySpend;
    const net = data.pay.monthlyIncome - bills - everyday - data.settings.extraPayment;
    return { month: m, name: d.toLocaleString("en-US", { month: "short" }), key, income: data.pay.monthlyIncome, bills, net, state };
  });
}
