import type { Account, BudgetCategory, HomeData, StrategyId, Transaction } from "./types";

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export interface StrategyMeta {
  id: StrategyId;
  name: string;
  headline: string;
  description: string;
  kind: "payoff" | "split";
}

export const STRATEGIES: StrategyMeta[] = [
  { id: "snowball", name: "Debt Snowball", headline: "Smallest balance first", kind: "payoff",
    description: "Pay minimums on everything and throw every extra dollar at the smallest balance. Quick wins keep you motivated; each payoff rolls into the next." },
  { id: "avalanche", name: "Avalanche", headline: "Highest interest first", kind: "payoff",
    description: "Same rollover, but attack the highest APR first. Mathematically the cheapest — you pay the least interest overall." },
  { id: "baby", name: "Baby Steps (Ramsey)", headline: "7 Baby Steps", kind: "payoff",
    description: "Starter emergency fund → snowball all debt → 3–6 months of expenses → 15% to retirement → college fund → pay off the house → build wealth and give." },
  { id: "503020", name: "50 / 30 / 20", headline: "Needs · Wants · Savings", kind: "split",
    description: "Split take-home pay: 50% needs, 30% wants, 20% savings and extra debt payments." },
  { id: "sixcans", name: "6 Cans", headline: "Six purpose cans", kind: "split",
    description: "Every paycheck is divided into six cans: 50% necessities, 10% play, 10% education, 10% long-term savings, 10% financial freedom, 10% give (tithe)." },
];

export const strategyMeta = (id: StrategyId) => STRATEGIES.find((s) => s.id === id)!;

/* ------------------------------------------------------------------ */
/* Debt payoff simulation                                              */
/* ------------------------------------------------------------------ */

export interface DebtInput { id: string; name: string; balance: number; apr: number; min: number; }

export interface DebtResult extends DebtInput { rank: number; paidOffMonth: number; interestPaid: number; }

export interface PayoffPlan {
  order: DebtResult[];
  months: number;
  totalInterest: number;
  totalDebt: number;
  /** Balance remaining at the end of each month, index 0 = today. */
  curve: number[];
}

export const debtsFromAccounts = (accounts: Account[], includeMortgage = false): DebtInput[] =>
  accounts
    .filter((a) => a.kind === "credit" || a.kind === "loan" || (includeMortgage && a.kind === "mortgage"))
    .filter((a) => a.balance > 0)
    .map((a) => ({ id: a.id, name: a.name, balance: a.balance, apr: a.apr ?? 0, min: a.minPayment ?? Math.max(25, a.balance * 0.02) }));

export function orderDebts(debts: DebtInput[], strategy: StrategyId): DebtInput[] {
  const d = debts.slice();
  if (strategy === "avalanche") return d.sort((a, b) => b.apr - a.apr || a.balance - b.balance);
  // snowball, baby steps, and the split strategies all default to smallest-first
  return d.sort((a, b) => a.balance - b.balance || b.apr - a.apr);
}

/**
 * Month-by-month rollover simulation. Minimums on everything; `extra` plus any
 * freed-up minimums go to the first unpaid debt in `order`.
 */
export function simulatePayoff(debts: DebtInput[], strategy: StrategyId, extra: number): PayoffPlan {
  const order = orderDebts(debts, strategy);
  const ds = order.map((d) => ({ ...d, bal: d.balance, paidOffMonth: 0, interestPaid: 0 }));
  const totalDebt = ds.reduce((s, d) => s + d.balance, 0);
  const curve = [totalDebt];
  let months = 0;
  let totalInterest = 0;

  while (ds.some((d) => d.bal > 0.005) && months < 600) {
    months++;
    let free = extra;
    for (const d of ds) {
      if (d.bal <= 0) continue;
      const i = d.bal * (d.apr / 100 / 12);
      d.interestPaid += i;
      totalInterest += i;
      d.bal += i;
      const pay = Math.min(d.bal, d.min);
      d.bal -= pay;
      if (d.bal <= 0.005) { d.bal = 0; free += d.min - pay; d.paidOffMonth = months; }
    }
    for (const d of ds) {
      if (d.bal <= 0 || free <= 0) continue;
      const pay = Math.min(d.bal, free);
      d.bal -= pay;
      free -= pay;
      if (d.bal <= 0.005) { d.bal = 0; d.paidOffMonth = months; }
    }
    curve.push(ds.reduce((s, d) => s + d.bal, 0));
  }

  return {
    order: ds.map((d, i) => ({ id: d.id, name: d.name, balance: d.balance, apr: d.apr, min: d.min, rank: i + 1, paidOffMonth: d.paidOffMonth, interestPaid: d.interestPaid })),
    months,
    totalInterest,
    totalDebt,
    curve,
  };
}

/* ------------------------------------------------------------------ */
/* Baby Steps                                                          */
/* ------------------------------------------------------------------ */

export interface BabyStep { n: number; name: string; progress: number; detail: string; status: "done" | "current" | "upcoming"; }

export function babySteps(data: HomeData): BabyStep[] {
  const savings = data.accounts.filter((a) => a.kind === "savings").reduce((s, a) => s + a.balance, 0);
  const debts = debtsFromAccounts(data.accounts);
  const debtTotal = debts.reduce((s, d) => s + d.balance, 0);
  const mortgage = data.accounts.filter((a) => a.kind === "mortgage").reduce((s, a) => s + a.balance, 0);
  const monthlyExpenses = data.bills.reduce((s, b) => s + b.amount, 0) + data.settings.everydaySpend;
  const efGoal = monthlyExpenses * data.settings.emergencyMonths;
  const starter = Math.min(1, data.settings.starterFundGoal ? savings / data.settings.starterFundGoal : 0);

  const raw: Omit<BabyStep, "status">[] = [
    { n: 1, name: `$${fmt(data.settings.starterFundGoal)} starter emergency fund`, progress: starter, detail: `$${fmt(Math.min(savings, data.settings.starterFundGoal))} / $${fmt(data.settings.starterFundGoal)}` },
    { n: 2, name: "Pay off all debt (snowball)", progress: debtTotal === 0 ? 1 : 0, detail: debtTotal ? `$${fmt(debtTotal)} left` : "done" },
    { n: 3, name: `${data.settings.emergencyMonths}–6 months of expenses`, progress: efGoal ? Math.min(1, savings / efGoal) : 0, detail: `$${fmt(savings)} / $${fmt(efGoal)}` },
    { n: 4, name: "15% of income to retirement", progress: 0, detail: "not started" },
    { n: 5, name: "Kids' college fund", progress: 0, detail: "not started" },
    { n: 6, name: "Pay off the house", progress: mortgage === 0 ? 1 : 0, detail: mortgage ? `$${fmt(mortgage)} left` : "no mortgage" },
    { n: 7, name: "Build wealth & give", progress: 0, detail: "—" },
  ];
  let currentFound = false;
  return raw.map((s) => {
    let status: BabyStep["status"] = "upcoming";
    if (s.progress >= 1) status = "done";
    else if (!currentFound) { status = "current"; currentFound = true; }
    return { ...s, status };
  });
}

/* ------------------------------------------------------------------ */
/* Budget splits (50/30/20, 6 Cans)                                    */
/* ------------------------------------------------------------------ */

export interface SplitRow { id: string; name: string; pct: number; what: string; target: number; actual: number; }

const SPLITS: Record<"503020" | "sixcans", { id: string; name: string; pct: number; what: string; buckets: BudgetCategory["bucket"][] }[]> = {
  "503020": [
    { id: "needs", name: "Needs", pct: 50, what: "Housing, utilities, groceries, minimums", buckets: ["needs"] },
    { id: "wants", name: "Wants", pct: 30, what: "Dining, subscriptions, fun", buckets: ["wants", "play", "education"] },
    { id: "savings", name: "Savings & debt", pct: 20, what: "Emergency fund, extra payments, giving", buckets: ["savings", "giving"] },
  ],
  sixcans: [
    { id: "necessities", name: "Necessities", pct: 50, what: "Bills, food, transport", buckets: ["needs"] },
    { id: "play", name: "Play", pct: 10, what: "Guilt-free spending", buckets: ["play", "wants"] },
    { id: "education", name: "Education", pct: 10, what: "Courses, books, growth", buckets: ["education"] },
    { id: "lts", name: "Long-term savings", pct: 10, what: "Big purchases, emergencies", buckets: ["savings"] },
    { id: "ffa", name: "Financial freedom", pct: 10, what: "Investing, extra debt payoff", buckets: [] },
    { id: "give", name: "Give", pct: 10, what: "Tithe, charity", buckets: ["giving"] },
  ],
};

/** Actual monthly spend per budget bucket: bills + transactions for the month. */
export function actualByBucket(data: HomeData, month: string): Record<BudgetCategory["bucket"], number> {
  const out: Record<BudgetCategory["bucket"], number> = { needs: 0, wants: 0, savings: 0, giving: 0, education: 0, play: 0 };
  const bucketOf = (cat: string) => data.budgets.find((b) => b.id === cat)?.bucket ?? "needs";
  for (const b of data.bills) out[bucketOf(b.category)] += b.amount;
  for (const t of data.transactions) if (t.date.startsWith(month)) out[bucketOf(t.category)] += t.amount;
  return out;
}

export function splitRows(data: HomeData, strategy: "503020" | "sixcans", month: string): SplitRow[] {
  const income = data.pay.monthlyIncome;
  const actual = actualByBucket(data, month);
  return SPLITS[strategy].map((s) => ({
    id: s.id, name: s.name, pct: s.pct, what: s.what,
    target: (income * s.pct) / 100,
    actual: s.id === "ffa" ? data.settings.extraPayment : s.buckets.reduce((sum, b) => sum + actual[b], 0),
  }));
}

/* ------------------------------------------------------------------ */
/* Budget vs actual                                                    */
/* ------------------------------------------------------------------ */

export interface BudgetRow { id: string; name: string; limit: number; spent: number; pct: number; state: "over" | "ahead" | "ok"; }

export function budgetRows(data: HomeData, month: string, dayOfMonth: number, daysInMonth: number): BudgetRow[] {
  const pace = dayOfMonth / daysInMonth;
  return data.budgets.map((c) => {
    const bills = data.bills.filter((b) => b.category === c.id).reduce((s, b) => s + b.amount, 0);
    const tx = data.transactions.filter((t) => t.category === c.id && t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0);
    const spent = bills + tx;
    const ratio = c.limit ? spent / c.limit : 0;
    return { id: c.id, name: c.name, limit: c.limit, spent, pct: Math.min(100, Math.round(ratio * 100)), state: spent > c.limit ? "over" : ratio > pace ? "ahead" : "ok" };
  });
}

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export const txFor = (data: HomeData, month: string): Transaction[] => data.transactions.filter((t) => t.date.startsWith(month));
