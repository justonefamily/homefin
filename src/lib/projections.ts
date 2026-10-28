import { addDays, endOfMonth, getDaysInMonth, startOfMonth } from "date-fns";
import type { Bill, HomeData } from "./types";
import { monthKey } from "./strategies";
import { expectedMonthlyIncome, expectedPayDays } from "./detect";
import { actualsByDay, actualsForMonth } from "./actuals";

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
  const payDays = expectedPayDays(data);
  const paycheck = expectedMonthlyIncome(data) / Math.max(1, payDays.length);
  const everydayPerDay = data.settings.everydaySpend / dim;
  const statuses = billStatuses(data, today);
  // Days that already happened use what the bank recorded (when there is any); days ahead use the plan.
  const actual = actualsByDay(data, monthKey(today));
  const useActual = actualsForMonth(data, monthKey(today)).hasData;
  const dayIn = (d: number) => (useActual && d <= today.getDate() ? actual[d].income : payDays.includes(d) ? paycheck : 0);
  const dayEveryday = (d: number) => (useActual && d <= today.getDate() ? actual[d].spend : everydayPerDay);
  const dayBills = (d: number) => (useActual && d <= today.getDate() ? actual[d].bills : statuses.filter((s) => s.dueDate.getDate() === d).reduce((s, x) => s + x.bill.amount, 0));
  const dayBillNames = (d: number) => (useActual && d <= today.getDate() ? actual[d].billNames : statuses.filter((s) => s.dueDate.getDate() === d).map((s) => s.bill.name));

  // Per-day net flow for the whole month.
  const flow: number[] = Array(dim + 1).fill(0);
  for (let d = 1; d <= dim; d++) flow[d] = dayIn(d) - dayEveryday(d) - dayBills(d);

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
      income += dayIn(d);
      everyday += dayEveryday(d);
      bills += dayBills(d);
      billNames.push(...dayBillNames(d));
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
    const act = actualsForMonth(data, key);
    const bills = state === "past" && act.hasData ? act.bills : monthlyBills;
    const everyday = state === "past" && act.hasData ? act.spend : data.settings.everydaySpend;
    const monthlyIncome = state === "past" && act.hasData ? act.income : expectedMonthlyIncome(data);
    const net = monthlyIncome - bills - everyday - (state === "past" ? 0 : data.settings.extraPayment);
    return { month: m, name: d.toLocaleString("en-US", { month: "short" }), key, income: monthlyIncome, bills, net, state };
  });
}
