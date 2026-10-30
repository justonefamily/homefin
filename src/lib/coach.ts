import { differenceInCalendarDays, getDaysInMonth } from "date-fns";
import type { BudgetCategory, HomeData, Landmark } from "./types";
import { spendItems } from "./actuals";
import { billsInRange, type PeriodRange } from "./projections";
import { expectedMonthlyIncome } from "./detect";
import { debtsFromAccounts, monthKey, simulatePayoff } from "./strategies";
import { ymd } from "./calendar";

/**
 * The pay-period playbook: given the paycheck, what's still due, what the budget allows, the landmarks coming up and the
 * debt plan, say plainly what this period can afford and — when it can't — where to pull from. The ordering of cuts is
 * the strategy: first anything already over budget this month, then the flexible wants with the most room, then
 * subscriptions that could be paused. Needs are never suggested as cuts. Surplus goes to the next debt in the payoff order.
 */

export interface CoachLine { category: BudgetCategory; allowance: number; spent: number; left: number; overMonth: number; flexible: boolean }
export interface CoachAction { kind: "cut" | "hold" | "pause" | "surplus" | "set-aside" | "over" | "note"; title: string; detail: string; amount?: number; href?: string }
export interface CoachLandmark { landmark: Landmark; periodsAway: number; perPeriod: number }
export interface PeriodCoach {
  period: PeriodRange;
  paycheck: number;
  billsLeft: number;
  needsLeft: number;
  setAside: number;
  debtExtra: number;
  /** Paycheck − bills left − needs left − set-aside − debt extra: what's actually available for wants this period. */
  room: number;
  /** What the budget would still let you spend on wants this period. */
  wantsLeft: number;
  /** Positive = the plan doesn't fit; this much has to come out of wants. */
  gap: number;
  verdict: "ahead" | "fits" | "tight" | "short";
  lines: CoachLine[];
  landmarks: CoachLandmark[];
  actions: CoachAction[];
}

const FLEX_BUCKETS = new Set<BudgetCategory["bucket"]>(["wants", "play", "education"]);
const HORIZON_MONTHS = 6;

export function periodCoach(data: HomeData, today: Date, period: PeriodRange): PeriodCoach {
  const from = ymd(period.from), to = ymd(period.to);
  const dim = getDaysInMonth(period.from);
  const periodDays = differenceInCalendarDays(period.to, period.from) + 1;
  const share = Math.min(1, periodDays / dim); // what fraction of a month this period is (~0.5)
  const payDays = Math.max(1, data.pay.payDays.length || 2);
  const paycheck = expectedMonthlyIncome(data) / payDays;

  // Bills still unpaid in this period.
  const statuses = billsInRange(data, period, today);
  const billsLeft = statuses.filter((s) => !s.paid).reduce((s, b) => s + b.bill.amount, 0);
  const billCats = new Set(statuses.map((s) => s.bill.category));

  // Spending this period and this month, by category (bills excluded — they're counted above).
  const monthsTouched = [...new Set([from.slice(0, 7), to.slice(0, 7)])];
  const items = spendItems(data, monthsTouched).filter((i) => i.kind === "spend");
  const thisMonth = monthKey(today);
  const spentIn = (cat: string, lo: string, hi: string) => items.filter((i) => i.category === cat && i.date >= lo && i.date <= hi).reduce((s, i) => s + i.amount, 0);
  const monthItems = spendItems(data, [thisMonth]);
  const lines: CoachLine[] = data.budgets
    .filter((c) => c.bucket !== "reimbursable" && c.limit > 0)
    .map((c) => {
      // Allowance for everyday spend = the limit minus bills that live in this category (they're already in billsLeft).
      const billsInCat = statuses.filter((s) => s.bill.category === c.id).reduce((s, b) => s + b.bill.amount, 0);
      const allowance = Math.max(0, c.limit * share - billsInCat);
      const spent = spentIn(c.id, from, to);
      const monthSpent = monthItems.filter((i) => i.category === c.id).reduce((s, i) => s + i.amount, 0);
      return { category: c, allowance, spent, left: Math.max(0, allowance - spent), overMonth: monthSpent - c.limit, flexible: FLEX_BUCKETS.has(c.bucket) };
    })
    .filter((l) => l.allowance > 0 || l.spent > 0);
  void billCats;
  const needsLeft = lines.filter((l) => !l.flexible).reduce((s, l) => s + l.left, 0);
  const wantsLeft = lines.filter((l) => l.flexible).reduce((s, l) => s + l.left, 0);

  // Landmarks ahead: spread each one over the periods until it lands.
  const periodsPerMonth = payDays;
  const landmarks: CoachLandmark[] = (data.landmarks ?? [])
    .filter((l) => l.amount > 0 && l.month >= thisMonth && l.month <= monthKey(new Date(today.getFullYear(), today.getMonth() + HORIZON_MONTHS, 1)))
    .map((l) => {
      const [y, m] = l.month.split("-").map(Number);
      const monthsAway = (y - today.getFullYear()) * 12 + (m - 1 - today.getMonth());
      const periodsAway = Math.max(1, monthsAway * periodsPerMonth + (period.period === "a" ? 1 : 0));
      return { landmark: l, periodsAway, perPeriod: l.amount / periodsAway };
    })
    .sort((a, b) => a.landmark.month.localeCompare(b.landmark.month));
  const setAside = landmarks.reduce((s, l) => s + l.perPeriod, 0);
  const debtExtra = data.settings.extraPayment * share;

  const room = paycheck - billsLeft - needsLeft - setAside - debtExtra;
  const gap = wantsLeft - room;
  const verdict: PeriodCoach["verdict"] = gap <= 0 ? (room - wantsLeft > 200 ? "ahead" : "fits") : gap < wantsLeft ? "tight" : "short";

  const actions: CoachAction[] = [];
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

  // 1) Anything already over budget this month is the first thing to stop — whatever the gap.
  for (const l of lines.filter((x) => x.overMonth > 0).sort((a, b) => b.overMonth - a.overMonth)) {
    actions.push({ kind: "over", title: `${l.category.name} is ${money(l.overMonth)} over for ${today.toLocaleString("en-US", { month: "long" })}`, detail: l.flexible ? "Nothing more here this period — every dollar now comes out of a landmark or the debt plan." : "A need, so it can't just stop — but it's worth a look at what's in it.", amount: l.overMonth, href: "/plan?view=budget" });
  }

  if (gap > 0) {
    let need = gap;
    // 2) Pull from flexible categories with the most room, biggest first.
    for (const l of lines.filter((x) => x.flexible && x.left > 0).sort((a, b) => b.left - a.left)) {
      if (need <= 0) break;
      const cut = Math.min(l.left, need);
      need -= cut;
      actions.push({ kind: cut >= l.left - 1 ? "hold" : "cut", title: cut >= l.left - 1 ? `Hold ${l.category.name} where it is — ${money(l.spent)} spent, nothing more this period` : `Keep ${l.category.name} to ${money(l.spent + (l.left - cut))} this period (budget allows ${money(l.allowance)})`, detail: `Frees ${money(cut)}.`, amount: cut, href: "/money#everyday" });
    }
    // 3) Still short: subscriptions that could be paused, smallest sacrifice per dollar first.
    if (need > 0) {
      const subs = statuses.filter((s) => { const c = data.budgets.find((b) => b.id === s.bill.category); return c && FLEX_BUCKETS.has(c.bucket) && !s.paid; }).sort((a, b) => b.bill.amount - a.bill.amount).slice(0, 4);
      for (const s of subs) {
        if (need <= 0) break;
        need -= s.bill.amount;
        actions.push({ kind: "pause", title: `Pause ${s.bill.name} — ${money(s.bill.amount)}`, detail: "A want on autopay. Skipping one cycle covers part of the gap without touching a need.", amount: s.bill.amount, href: "/bills" });
      }
    }
    if (need > 0) {
      const next = landmarks[0];
      actions.push({ kind: "note", title: `Still ${money(need)} short after the cuts above`, detail: next ? `Either push “${next.landmark.name}” (${money(next.landmark.amount)}) out a month, or drop the extra debt payment this period (${money(debtExtra)}).` : `Drop the extra debt payment this period (${money(debtExtra)}) or let a landmark slip a month.`, amount: need, href: "/plan?view=year" });
    }
  } else if (room - wantsLeft > 0) {
    // Surplus: where it does the most good.
    const surplus = room - wantsLeft;
    const plan = simulatePayoff(debtsFromAccounts(data.accounts), data.settings.strategy, data.settings.extraPayment);
    const target = plan.order[0];
    if (target) actions.push({ kind: "surplus", title: `${money(surplus)} more than the plan needs this period`, detail: `Send it to ${target.name} (${target.apr ? `${target.apr}% APR, ` : ""}next in your ${data.settings.strategy} order). Every ${money(100)} there is about ${money(100 * (target.apr || 20) / 100)} a year you don't pay in interest.`, amount: surplus, href: "/plan" });
    else if (landmarks[0]) actions.push({ kind: "surplus", title: `${money(surplus)} more than the plan needs this period`, detail: `Put it toward “${landmarks[0].landmark.name}” — it lands in ${landmarks[0].periodsAway} period${landmarks[0].periodsAway === 1 ? "" : "s"}.`, amount: surplus, href: "/plan?view=year" });
  }

  // Always: what to set aside for the landmarks ahead.
  if (setAside > 0) actions.push({ kind: "set-aside", title: `Set aside ${money(setAside)} this period for what's coming`, detail: landmarks.slice(0, 4).map((l) => `${l.landmark.name} ${money(l.perPeriod)}`).join(" · ") + (landmarks.length > 4 ? ` · +${landmarks.length - 4} more` : ""), amount: setAside, href: "/plan?view=year" });

  return { period, paycheck, billsLeft, needsLeft, setAside, debtExtra, room, wantsLeft, gap, verdict, lines, landmarks, actions };
}
