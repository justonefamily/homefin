import type { HomeData } from "./types";

/**
 * Comparisons: "this time this year vs. this time last year", or anything the user
 * builds with the comparison widget. A period is a month ("2026-10"), a quarter
 * ("2026-Q3") or a year ("2026"); a metric is one of the series below.
 */

export type Granularity = "month" | "quarter" | "year";
export type MetricId = "spending" | "bills" | "income" | "net" | "debt" | "savings";

export const METRICS: { id: MetricId; name: string; byCategory: boolean }[] = [
  { id: "spending", name: "Spending by category", byCategory: true },
  { id: "bills", name: "Bills paid", byCategory: false },
  { id: "income", name: "Income", byCategory: false },
  { id: "net", name: "Left over (income − bills − spending)", byCategory: false },
  { id: "debt", name: "Total debt balance", byCategory: false },
  { id: "savings", name: "Savings balance", byCategory: false },
];

export interface PeriodRef { granularity: Granularity; key: string; }

export const periodLabel = (p: PeriodRef) => {
  if (p.granularity === "year") return p.key;
  if (p.granularity === "quarter") return p.key.replace("-", " ");
  const [y, m] = p.key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};

/** Months (YYYY-MM) covered by a period. */
export function monthsIn(p: PeriodRef): string[] {
  if (p.granularity === "month") return [p.key];
  if (p.granularity === "year") return Array.from({ length: 12 }, (_, i) => `${p.key}-${String(i + 1).padStart(2, "0")}`);
  const [y, q] = p.key.split("-Q");
  const start = (Number(q) - 1) * 3;
  return Array.from({ length: 3 }, (_, i) => `${y}-${String(start + i + 1).padStart(2, "0")}`);
}

export const sameTimeLastYear = (p: PeriodRef): PeriodRef => {
  const y = Number(p.key.slice(0, 4)) - 1;
  return { granularity: p.granularity, key: `${y}${p.key.slice(4)}` };
};

export const periodFor = (date: Date, g: Granularity): PeriodRef => {
  const y = date.getFullYear();
  if (g === "year") return { granularity: g, key: String(y) };
  if (g === "quarter") return { granularity: g, key: `${y}-Q${Math.floor(date.getMonth() / 3) + 1}` };
  return { granularity: g, key: `${y}-${String(date.getMonth() + 1).padStart(2, "0")}` };
};

const inMonths = (date: string, months: string[]) => months.some((m) => date.startsWith(m));

/** End-of-period balance for accounts of a kind, from balanceHistory (latest reading at or before the period end). */
function balanceAtEnd(data: HomeData, months: string[], kinds: string[]): number | null {
  const last = months[months.length - 1];
  const hist = (data.balanceHistory ?? []).filter((b) => b.date.slice(0, 7) <= last);
  if (!hist.length) return null;
  const ids = data.accounts.filter((a) => kinds.includes(a.kind)).map((a) => a.id);
  let total = 0, any = false;
  for (const id of ids) {
    const pts = hist.filter((b) => b.accountId === id).sort((a, b) => b.date.localeCompare(a.date));
    if (pts[0]) { total += pts[0].balance; any = true; }
  }
  return any ? total : null;
}

export interface MetricRow { id: string; name: string; a: number; b: number; }
export interface Comparison {
  metric: MetricId;
  a: PeriodRef; b: PeriodRef;
  rows: MetricRow[];
  totalA: number; totalB: number;
  /** True when period B had no data at all — so the UI can say "no data for last year" instead of showing 0. */
  bEmpty: boolean;
}

export function compare(data: HomeData, metric: MetricId, a: PeriodRef, b: PeriodRef): Comparison {
  const mA = monthsIn(a), mB = monthsIn(b);
  const rows: MetricRow[] = [];
  const spend = (months: string[], cat?: string) => data.transactions.filter((t) => inMonths(t.date, months) && (!cat || t.category === cat)).reduce((s, t) => s + t.amount, 0);
  const billsPaid = (months: string[]) => data.payments.filter((p) => months.includes(p.month)).reduce((s, p) => s + p.amount, 0);
  const income = (months: string[]) => {
    const ev = (data.income ?? []).filter((i) => inMonths(i.date, months));
    return ev.length ? ev.reduce((s, i) => s + i.amount, 0) : data.pay.monthlyIncome * months.length;
  };
  const hasAny = (months: string[]) =>
    data.transactions.some((t) => inMonths(t.date, months)) || data.payments.some((p) => months.includes(p.month)) || (data.income ?? []).some((i) => inMonths(i.date, months)) || (data.balanceHistory ?? []).some((p) => inMonths(p.date, months));

  if (metric === "spending") {
    for (const c of data.budgets) rows.push({ id: c.id, name: c.name, a: spend(mA, c.id), b: spend(mB, c.id) });
    const known = new Set(data.budgets.map((c) => c.id));
    const otherA = data.transactions.filter((t) => inMonths(t.date, mA) && !known.has(t.category)).reduce((s, t) => s + t.amount, 0);
    const otherB = data.transactions.filter((t) => inMonths(t.date, mB) && !known.has(t.category)).reduce((s, t) => s + t.amount, 0);
    if (otherA || otherB) rows.push({ id: "other", name: "Other", a: otherA, b: otherB });
  } else if (metric === "bills") {
    rows.push({ id: "bills", name: "Bills paid", a: billsPaid(mA), b: billsPaid(mB) });
  } else if (metric === "income") {
    rows.push({ id: "income", name: "Income", a: income(mA), b: income(mB) });
  } else if (metric === "net") {
    rows.push({ id: "income", name: "Income", a: income(mA), b: income(mB) });
    rows.push({ id: "bills", name: "Bills", a: -billsPaid(mA), b: -billsPaid(mB) });
    rows.push({ id: "spend", name: "Everyday spending", a: -spend(mA), b: -spend(mB) });
  } else if (metric === "debt") {
    rows.push({ id: "debt", name: "Total debt", a: balanceAtEnd(data, mA, ["credit", "loan", "mortgage"]) ?? 0, b: balanceAtEnd(data, mB, ["credit", "loan", "mortgage"]) ?? 0 });
  } else if (metric === "savings") {
    rows.push({ id: "savings", name: "Savings", a: balanceAtEnd(data, mA, ["savings"]) ?? 0, b: balanceAtEnd(data, mB, ["savings"]) ?? 0 });
  }

  const totalA = rows.reduce((s, r) => s + r.a, 0);
  const totalB = rows.reduce((s, r) => s + r.b, 0);
  return { metric, a, b, rows: rows.filter((r) => r.a || r.b), totalA, totalB, bEmpty: !hasAny(mB) };
}

/** Period options for the pickers, going back `years` years from `today`. */
export function periodOptions(g: Granularity, today: Date, years = 2): PeriodRef[] {
  const out: PeriodRef[] = [];
  const y0 = today.getFullYear();
  if (g === "year") for (let y = y0; y > y0 - years - 1; y--) out.push({ granularity: g, key: String(y) });
  else if (g === "quarter") {
    for (let y = y0; y > y0 - years - 1; y--) for (let q = 4; q >= 1; q--) { if (y === y0 && q > Math.floor(today.getMonth() / 3) + 1) continue; out.push({ granularity: g, key: `${y}-Q${q}` }); }
  } else {
    for (let y = y0; y > y0 - years - 1; y--) for (let m = 12; m >= 1; m--) { if (y === y0 && m > today.getMonth() + 1) continue; out.push({ granularity: g, key: `${y}-${String(m).padStart(2, "0")}` }); }
  }
  return out;
}
