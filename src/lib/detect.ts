import type { Bill, BillPayment, HomeData, Transaction } from "./types";

/**
 * Learn from what the bank already shows.
 *
 * detectRecurring(): finds merchants that get paid about once a month (or weekly / yearly)
 * with similar amounts and proposes them as bills. The user confirms or dismisses each one.
 *
 * autoMarkPaid(): for confirmed bills that came from (or were matched to) a merchant,
 * a transaction in a month marks that month's bill paid — retroactively too.
 */

export interface Suggestion {
  key: string;             // normalized merchant key
  name: string;            // display name
  amount: number;          // median amount
  dueDay: number;          // median day of month
  cadence: "monthly" | "weekly" | "yearly";
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  accountId?: string;
  category: string;        // best-guess budget category id
  confidence: number;      // 0–1
}

export const merchantKey = (s: string) =>
  s.toLowerCase()
    .replace(/\b(pos|ach|debit|credit|purchase|payment|pymt|autopay|auto pay|online|web|recurring|bill ?pay|des:|id:|ref|#)\b/g, " ")
    .replace(/\d{3,}/g, " ")           // long numbers: confirmation / account digits
    .replace(/[^a-z& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ").slice(0, 3).join(" ");  // first three words identify the merchant

const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

const CADENCES: { id: Suggestion["cadence"]; days: number; tol: number; min: number }[] = [
  { id: "weekly", days: 7, tol: 2, min: 4 },
  { id: "monthly", days: 30, tol: 6, min: 2 },
  { id: "yearly", days: 365, tol: 20, min: 2 },
];

const CATEGORY_HINTS: [RegExp, string][] = [
  [/mortgage|rocket|loancare|mr cooper|pennymac|rent\b/, "housing"],
  [/at&t|att |verizon|t ?mobile|xfinity|comcast|spectrum|cox|frontier|internet|wireless/, "utilities"],
  [/electric|energy|power|gas co|water|sewer|utilit|duke|fpl|georgia power/, "utilities"],
  [/insurance|geico|progressive|allstate|state farm|usaa/, "transport"],
  [/netflix|spotify|hulu|disney|hbo|max\b|apple\.com|youtube|prime|peacock|paramount/, "subs"],
  [/gym|fitness|planet|ymca|peloton/, "wants"],
  [/tithe|church|ministries|giving|donation/, "giving"],
  [/capital one auto|ally auto|toyota financial|honda financial|kia finance|car payment|auto loan/, "transport"],
  [/student|nelnet|navient|mohela|sallie/, "debt"],
  [/chase card|amex|american express|discover|capital one|citi card|card payment|credit card/, "debt"],
];

export function detectRecurring(data: HomeData, today = new Date()): Suggestion[] {
  const dismissed = new Set(data.settings.dismissedSuggestions ?? []);
  const existingKeys = new Set(data.bills.map((b) => merchantKey(b.merchant ?? b.name)));
  const groups = new Map<string, Transaction[]>();
  for (const t of data.transactions) {
    if (t.amount <= 0) continue;
    const k = merchantKey(t.description);
    if (k.length < 3) continue;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  const out: Suggestion[] = [];
  for (const [key, txs] of groups) {
    if (dismissed.has(key) || existingKeys.has(key)) continue;
    const sorted = txs.slice().sort((a, b) => a.date.localeCompare(b.date));
    // Collapse same-day duplicates (split payments)
    const byDay = new Map<string, Transaction>();
    for (const t of sorted) { const d = byDay.get(t.date); if (d) d.amount += t.amount; else byDay.set(t.date, { ...t }); }
    const pts = [...byDay.values()];
    if (pts.length < 2) continue;
    const gaps = pts.slice(1).map((t, i) => daysBetween(pts[i].date, t.date));
    const amounts = pts.map((t) => t.amount);
    const amt = median(amounts);
    for (const c of CADENCES) {
      if (pts.length < c.min) continue;
      const onBeat = gaps.filter((g) => Math.abs(g - c.days) <= c.tol).length;
      const beatRatio = onBeat / gaps.length;
      if (beatRatio < 0.6) continue;
      const amtStable = amounts.filter((a) => Math.abs(a - amt) <= Math.max(5, amt * 0.25)).length / amounts.length;
      if (amtStable < 0.6) continue;
      // Still active? Last seen within ~1.5 cadences of today.
      const sinceLast = daysBetween(pts[pts.length - 1].date, today.toISOString().slice(0, 10));
      if (sinceLast > c.days * 1.6 + c.tol) continue;
      const name = pts[pts.length - 1].description;
      const lower = name.toLowerCase();
      const hint = CATEGORY_HINTS.find(([re]) => re.test(lower))?.[1];
      const category = (hint && data.budgets.some((b) => b.id === hint) ? hint : undefined) ?? data.budgets.find((b) => b.bucket === "needs")?.id ?? data.budgets[0]?.id ?? "other";
      out.push({
        key, name, amount: Math.round(amt * 100) / 100,
        dueDay: Math.max(1, Math.min(28, Math.round(median(pts.map((t) => Number(t.date.slice(8, 10))))))),
        cadence: c.id, occurrences: pts.length, firstSeen: pts[0].date, lastSeen: pts[pts.length - 1].date,
        accountId: pts[pts.length - 1].accountId, category,
        confidence: Math.round(Math.min(1, 0.4 + 0.3 * beatRatio + 0.2 * amtStable + 0.02 * pts.length) * 100) / 100,
      });
      break;
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence || b.amount - a.amount);
}

/** Turn a confirmed suggestion into a Bill (monthly cadence stored; weekly/yearly normalized to a monthly amount for budgeting). */
export function suggestionToBill(s: Suggestion, id: string): Bill {
  const monthly = s.cadence === "weekly" ? s.amount * 52 / 12 : s.cadence === "yearly" ? s.amount / 12 : s.amount;
  return { id, name: s.name, amount: Math.round(monthly * 100) / 100, dueDay: s.dueDay, category: s.category, accountId: s.accountId, autopay: true, cadence: "monthly", merchant: s.key };
}

/**
 * Mark bills paid from matching transactions. A bill matches a transaction when the bill has a
 * `merchant` key (from detection) or its name normalizes to the same key, the amount is within 25%,
 * and no payment is recorded for that month yet. Returns the new payments only.
 */
export function autoMarkPaid(data: HomeData): BillPayment[] {
  const added: BillPayment[] = [];
  const have = new Set(data.payments.map((p) => `${p.billId}:${p.month}`));
  for (const b of data.bills) {
    const key = b.merchant ?? merchantKey(b.name);
    if (key.length < 3) continue;
    for (const t of data.transactions) {
      if (t.amount <= 0 || merchantKey(t.description) !== key) continue;
      if (Math.abs(t.amount - b.amount) > Math.max(5, b.amount * 0.25)) continue;
      const month = t.date.slice(0, 7);
      const k = `${b.id}:${month}`;
      if (have.has(k)) continue;
      have.add(k);
      added.push({ billId: b.id, month, paidAt: t.date, amount: t.amount });
    }
  }
  return added;
}

/* ------------------------------------------------------------------ */
/* Income: recurring deposits → suggested pay schedule                 */
/* ------------------------------------------------------------------ */

export interface IncomeSuggestion {
  source: string;
  key: string;
  cadence: "weekly" | "biweekly" | "semimonthly" | "monthly";
  perPaycheck: number;
  monthly: number;
  /** For semimonthly/monthly: the days of month. For weekly/biweekly: the two most common days as an approximation. */
  payDays: number[];
  occurrences: number;
  lastSeen: string;
  confidence: number;
}

export function detectIncome(data: HomeData, today = new Date()): IncomeSuggestion[] {
  const groups = new Map<string, { date: string; amount: number }[]>();
  for (const i of data.income ?? []) {
    const k = merchantKey(i.source);
    if (k.length < 3 || i.amount < 50) continue;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push({ date: i.date, amount: i.amount });
  }
  const out: IncomeSuggestion[] = [];
  const todayStr = today.toISOString().slice(0, 10);
  for (const [key, pts0] of groups) {
    const pts = pts0.sort((a, b) => a.date.localeCompare(b.date));
    if (pts.length < 3) continue;
    const gaps = pts.slice(1).map((p, i) => daysBetween(pts[i].date, p.date));
    const g = median(gaps);
    let cadence: IncomeSuggestion["cadence"] | null = null;
    if (g >= 5 && g <= 9) cadence = "weekly";
    else if (g >= 12 && g <= 16) cadence = "biweekly";
    else if (g >= 13 && g <= 18) cadence = "semimonthly";
    else if (g >= 26 && g <= 35) cadence = "monthly";
    if (!cadence) continue;
    // Semi-monthly pays land on the same two days each month; biweekly drifts. Decide by day-of-month spread.
    const days = pts.map((p) => Number(p.date.slice(8, 10)));
    if (cadence === "biweekly" || cadence === "semimonthly") {
      const counts = new Map<number, number>();
      for (const d of days) counts.set(d, (counts.get(d) ?? 0) + 1);
      const top2 = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
      const coverage = top2.reduce((s, [, c]) => s + c, 0) / days.length;
      cadence = coverage >= 0.7 ? "semimonthly" : "biweekly";
    }
    if (daysBetween(pts[pts.length - 1].date, todayStr) > g * 1.8 + 7) continue;
    const per = median(pts.map((p) => p.amount));
    const monthly = cadence === "weekly" ? per * 52 / 12 : cadence === "biweekly" ? per * 26 / 12 : cadence === "semimonthly" ? per * 2 : per;
    const counts = new Map<number, number>();
    for (const d of days) counts.set(d, (counts.get(d) ?? 0) + 1);
    const common = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => Math.min(28, d));
    const payDays = cadence === "monthly" ? [common[0]] : cadence === "semimonthly" ? common.slice(0, 2).sort((a, b) => a - b) : [1, 15];
    const stable = pts.filter((p) => Math.abs(p.amount - per) <= per * 0.2).length / pts.length;
    out.push({ source: pts0[0] && (data.income ?? []).find((i) => merchantKey(i.source) === key)?.source || key, key, cadence, perPaycheck: Math.round(per), monthly: Math.round(monthly), payDays, occurrences: pts.length, lastSeen: pts[pts.length - 1].date, confidence: Math.round(Math.min(1, 0.5 + 0.3 * stable + 0.02 * pts.length) * 100) / 100 });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}
