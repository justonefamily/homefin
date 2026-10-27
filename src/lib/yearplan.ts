import type { HomeData, Landmark } from "./types";
import { debtsFromAccounts, simulatePayoff } from "./strategies";
import { expectedMonthlyIncome } from "./detect";

/**
 * Year plan: today's income, bills, everyday spending and extra debt payment, applied to every
 * month of `year`, plus the dated landmarks the household enters. Cumulative "in your pocket"
 * starts from current checking (optional) and rolls month over month.
 */
export interface PlanMonth {
  key: string; name: string; index: number;
  income: number; bills: number; everyday: number; debtExtra: number;
  landmarks: Landmark[]; landmarkTotal: number;
  net: number; cumulative: number; pocket: number;
  debtRemaining: number;
}
export interface YearPlan {
  year: number;
  months: PlanMonth[];
  startBalance: number;
  totals: { income: number; spending: number; bills: number; everyday: number; landmarks: number; debtPaid: number; net: number; pocketEnd: number; debtStart: number; debtEnd: number; landmarkCount: number };
}

export function buildYearPlan(data: HomeData, year: number, today = new Date(), includeStartBalance = true): YearPlan {
  const income = expectedMonthlyIncome(data);
  const bills = data.bills.reduce((s, b) => s + b.amount, 0);
  const everyday = data.settings.everydaySpend;
  const extra = data.settings.extraPayment;
  const startBalance = includeStartBalance ? data.accounts.filter((a) => a.kind === "checking").reduce((s, a) => s + a.balance, 0) : 0;
  const landmarks = (data.landmarks ?? []).filter((l) => l.month.startsWith(String(year)));

  // Debt curve from today, indexed by months from now.
  const debts = debtsFromAccounts(data.accounts);
  const plan = simulatePayoff(debts, data.settings.strategy, extra);
  const monthsFromNow = (y: number, m: number) => (y - today.getFullYear()) * 12 + (m - today.getMonth());
  const debtAt = (y: number, m: number) => { const i = Math.max(0, monthsFromNow(y, m)); return i < plan.curve.length ? plan.curve[i] : 0; };
  // Minimums stop once a debt is paid off — approximate with the min sum while debt remains.
  const minSum = debts.reduce((s, d) => s + d.min, 0);

  let cumulative = 0;
  const months: PlanMonth[] = Array.from({ length: 12 }, (_, m) => {
    const key = `${year}-${String(m + 1).padStart(2, "0")}`;
    const lm = landmarks.filter((l) => l.month === key);
    const landmarkTotal = lm.reduce((s, l) => s + l.amount, 0);
    const remaining = debtAt(year, m);
    const debtExtra = remaining > 0 ? extra : 0;
    // Bills already include minimum payments when they're set up as bills; avoid double counting by not adding minSum.
    void minSum;
    const net = income - bills - everyday - debtExtra - landmarkTotal;
    cumulative += net;
    return { key, name: new Date(year, m, 1).toLocaleString("en-US", { month: "short" }), index: m, income, bills, everyday, debtExtra, landmarks: lm, landmarkTotal, net, cumulative, pocket: startBalance + cumulative, debtRemaining: remaining };
  });
  const sum = (f: (x: PlanMonth) => number) => months.reduce((s, x) => s + f(x), 0);
  const debtStart = debtAt(year, 0);
  const debtEnd = months[11].debtRemaining;
  return {
    year, months, startBalance,
    totals: { income: sum((x) => x.income), bills: sum((x) => x.bills), everyday: sum((x) => x.everyday), landmarks: sum((x) => x.landmarkTotal), debtPaid: Math.max(0, debtStart - debtEnd), spending: sum((x) => x.bills + x.everyday + x.debtExtra + x.landmarkTotal), net: cumulative, pocketEnd: startBalance + cumulative, debtStart, debtEnd, landmarkCount: landmarks.length },
  };
}
