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

/* ------------------------------------------------------------------ */
/* Pay periods as real date ranges (can cross into the next month)      */
/* ------------------------------------------------------------------ */

export interface PeriodRange { period: Period; from: Date; to: Date; label: string; anchor: Date }

/** The explicit period definitions in effect: from Settings ("custom"), or derived from paydays / halves. */
export function periodDefs(data: HomeData): { payDay: number; from: number; to: number }[] {
  if (data.pay.periodMode === "custom" && data.pay.periods?.length) {
    return data.pay.periods.slice(0, 2).map((p) => ({ payDay: Math.max(1, Math.min(31, p.payDay)), from: Math.max(1, Math.min(31, p.from)), to: Math.max(1, Math.min(31, p.to)) })).sort((a, b) => a.from - b.from);
  }
  const [s1, s2] = periodStarts(data);
  if (s2 <= s1) return [{ payDay: s1, from: s1, to: s1 === 1 ? 31 : s1 - 1 }];
  return [{ payDay: s1, from: s1, to: s2 - 1 }, { payDay: s2, from: s2, to: s1 === 1 ? 31 : s1 - 1 }];
}

/** The two days of the month a period starts on: [1, split+1] for halves, or the paydays (first two) when periods follow paychecks. */
export function periodStarts(data: HomeData): [number, number] {
  if (data.pay.periodMode === "custom" && data.pay.periods?.length) {
    const d = data.pay.periods.map((p) => p.from).sort((a, b) => a - b);
    return d.length >= 2 ? [d[0], d[1]] : [d[0], d[0]];
  }
  if (data.pay.periodMode === "paydays") {
    // The paydays typed in Settings win (they're the contract dates); detected deposit days are the fallback, since
    // deposits often post a day early and would shift every period.
    const typed = (data.pay.payDays ?? []).filter((d) => d >= 1 && d <= 31);
    const days = [...new Set(typed.length ? typed : expectedPayDays(data))].filter((d) => d >= 1 && d <= 31).sort((a, b) => a - b);
    if (days.length >= 2) return [days[0], days[1]];
    if (days.length === 1) return [days[0], days[0]]; // one payday a month: a single period (b is empty)
  }
  return [1, Math.min(28, data.pay.splitDay) + 1];
}

const clampDay = (y: number, m: number, d: number) => new Date(y, m, Math.min(d, getDaysInMonth(new Date(y, m, 1))));
const fmtRange = (from: Date, to: Date) => `${from.toLocaleString("en-US", { month: "short" })} ${from.getDate()} – ${to.getMonth() !== from.getMonth() ? to.toLocaleString("en-US", { month: "short" }) + " " : ""}${to.getDate()}`;

/** The period that starts in `anchor`'s month: "a" runs from the first start to the day before the second; "b" from the second start to the day before next month's first start. */
export function periodRangeFor(data: HomeData, anchor: Date, period: Period): PeriodRange {
  const defs = periodDefs(data);
  const def = period === "a" || defs.length < 2 ? defs[0] : defs[1];
  const y = anchor.getFullYear(), m = anchor.getMonth();
  const from = clampDay(y, m, def.from);
  // `to` before `from` → the period runs into next month; `to` = 31 means "end of month" whatever its length.
  const to = def.to >= def.from ? (def.to >= 31 ? endOfMonth(from) : clampDay(y, m, def.to)) : clampDay(y, m + 1, def.to);
  return { period: defs.length < 2 ? "a" : period, from, to, label: fmtRange(from, to), anchor: new Date(y, m, 1) };
}

/** Total of the monthly budget limits that count as spending (reimbursable left out). */
export const budgetTotal = (data: HomeData) => data.budgets.filter((b) => b.bucket !== "reimbursable").reduce((s, b) => s + b.limit, 0);
/**
 * Planned everyday spending for a month. With planBasis "budget", the budget is the plan: everything budgeted that isn't
 * a bill that month. Otherwise the everyday estimate from Settings.
 */
export function plannedEveryday(data: HomeData, month: string): number {
  if (data.settings.planBasis !== "budget") return data.settings.everydaySpend;
  const bills = activeBills(data, month).reduce((s, b) => s + b.amount, 0);
  return Math.max(0, budgetTotal(data) - bills);
}

/** Which pay period a calendar day (1–31) belongs to: "a" (first) or "b" (second). Single-period schedules are always "a". */
export function periodOfDay(data: HomeData, day: number): Period {
  const defs = periodDefs(data);
  if (defs.length < 2) return "a";
  const inside = (d: { from: number; to: number }) => (d.to >= d.from ? day >= d.from && day <= d.to : day >= d.from || day <= d.to);
  return inside(defs[0]) ? "a" : "b";
}
/** Short label for a period definition, e.g. "30th – 14th". */
export function periodDefLabel(d: { from: number; to: number }): string {
  const ord = (n: number) => n >= 31 ? "end" : `${n}${[, "st", "nd", "rd"][(n % 10 > 3 || Math.floor(n % 100 / 10) === 1) ? 0 : n % 10] ?? "th"}`;
  return `${ord(d.from)} – ${ord(d.to)}`;
}

/** The period `date` falls in — may be the "b" period that started last month. */
export function currentPeriodRange(data: HomeData, date: Date): PeriodRange {
  const [s1, s2] = periodStarts(data);
  const d = date.getDate();
  if (d >= s2 && s2 > s1) return periodRangeFor(data, date, "b");
  if (d >= s1) return periodRangeFor(data, date, "a");
  // Before this month's first start: still inside last month's second period.
  const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return periodRangeFor(data, prev, s2 > s1 ? "b" : "a");
}

/** Step a period forward/back by whole periods. */
export function shiftPeriod(data: HomeData, r: PeriodRange, by: number): PeriodRange {
  const [s1, s2] = periodStarts(data);
  const single = s2 <= s1;
  let { period, anchor } = r;
  let n = by;
  while (n !== 0) {
    if (single) { anchor = new Date(anchor.getFullYear(), anchor.getMonth() + Math.sign(n), 1); }
    else if (n > 0) { if (period === "a") period = "b"; else { period = "a"; anchor = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1); } }
    else { if (period === "b") period = "a"; else { period = "b"; anchor = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1); } }
    n -= Math.sign(n);
  }
  return periodRangeFor(data, anchor, period);
}

export const inRange = (d: Date, r: { from: Date; to: Date }) => d >= r.from && d <= r.to;

/** Every pay period that touches `month` (the one covering the 1st, then each one starting inside the month) — 2 or 3 of them. */
export function periodsTouching(data: HomeData, month: Date): PeriodRange[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = endOfMonth(first);
  const out: PeriodRange[] = [currentPeriodRange(data, first)];
  for (let i = 0; i < 4; i++) { const next = shiftPeriod(data, out[out.length - 1], 1); if (next.from > last) break; out.push(next); }
  return out;
}

/** Bills due inside a date range, with paid/overdue judged against the month each due date lands in. */
export function billsInRange(data: HomeData, r: { from: Date; to: Date }, today: Date): BillStatus[] {
  const out: BillStatus[] = [];
  const months = new Set<string>();
  for (let d = new Date(r.from.getFullYear(), r.from.getMonth(), 1); d <= r.to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.add(monthKey(d));
  for (const key of months) {
    const [y, m] = key.split("-").map(Number);
    const monthDate = new Date(y, m - 1, 1);
    const dim = getDaysInMonth(monthDate);
    for (const bill of activeBills(data, key)) {
      const dueDate = new Date(y, m - 1, Math.min(bill.dueDay, dim));
      if (!inRange(dueDate, r)) continue;
      const paid = isPaid(data, bill, key);
      out.push({ bill, paid, overdue: !paid && dueDate < new Date(today.getFullYear(), today.getMonth(), today.getDate()), dueDate });
    }
  }
  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/** Is this bill in effect for the month? Ended bills (a mortgage that moved to a new servicer) stay for history but stop being due. */
export const billActive = (b: Bill, month: string) => (!b.startedOn || month >= b.startedOn) && (!b.endedOn || month <= b.endedOn);
export const activeBills = (data: HomeData, month: string) => data.bills.filter((b) => billActive(b, month));

export const isPaid = (data: HomeData, bill: Bill, month: string) => data.payments.some((p) => p.billId === bill.id && p.month === month);

export interface BillStatus { bill: Bill; paid: boolean; overdue: boolean; dueDate: Date; }

export function billStatuses(data: HomeData, date: Date): BillStatus[] {
  const month = monthKey(date);
  const dim = getDaysInMonth(date);
  return activeBills(data, month)
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
  const everydayPerDay = plannedEveryday(data, monthKey(today)) / dim;
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
      for (const n of dayBillNames(d)) if (!billNames.includes(n)) billNames.push(n);
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
  return Array.from({ length: 12 }, (_, m) => {
    const d = new Date(year, m, 1);
    const key = monthKey(d);
    const monthlyBills = activeBills(data, key).reduce((s, b) => s + b.amount, 0);
    const state: MonthRow["state"] = m < today.getMonth() ? "past" : m === today.getMonth() ? "current" : "future";
    // Past months: use recorded transactions + bills paid that month if any; otherwise fall back to the template.
    const act = actualsForMonth(data, key);
    const bills = state === "past" && act.hasData ? act.bills : monthlyBills;
    const everyday = state === "past" && act.hasData ? act.spend : plannedEveryday(data, key);
    const monthlyIncome = state === "past" && act.hasData ? act.income : expectedMonthlyIncome(data);
    const net = monthlyIncome - bills - everyday - (state === "past" ? 0 : data.settings.extraPayment);
    return { month: m, name: d.toLocaleString("en-US", { month: "short" }), key, income: monthlyIncome, bills, net, state };
  });
}
