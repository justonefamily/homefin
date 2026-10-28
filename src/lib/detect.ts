import type { Bill, BillPayment, HomeData, IncomeEvent, IncomeSource, Transaction } from "./types";
import { resolveKey } from "./merchants";
import { parseNature, stripBoilerplate } from "./nature";

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

/**
 * Person-to-person payments (Zelle, Cash App, Venmo, PayPal, Apple Cash) all look alike to a bank — the only thing that
 * tells them apart is who the money went to. Pull that name out so each recipient is its own merchant.
 * Returns { platform, who } or null when the description isn't a P2P payment.
 */
export function p2pParty(desc: string): { platform: string; who: string } | null {
  const d = desc.replace(/\s+/g, " ").trim();
  const clean = (w: string) => w.replace(/\b(conf|ref|on|id|xxxx\w*|oakland|oaklan|ca|ny|fl|tx|il|wa|inc|llc)\b.*$/i, "").replace(/[#*].*$/, "").replace(/\b\d[\d/]*\b.*$/, "").replace(/[^a-z&' ]/gi, " ").replace(/\b(zelle|cash app|venmo|paypal|apple cash|db|cr|payment|pmnt|sent)\b/gi, " ").replace(/\s+/g, " ").trim().toLowerCase().split(" ").filter((w, i, a) => a.indexOf(w) === i).slice(0, 3).filter((w, i, a) => !(i === a.length - 1 && /^(of|the|and|to|for|at)$/.test(w))).join(" ");
  let m: RegExpMatchArray | null;
  if ((m = d.match(/zelle(?: payment)?(?: hard post)?(?:\s*-\s*zelle)?\s+(?:to|from|db|cr)\s+(.+)/i))) { const who = clean(m[1]); if (who) return { platform: "zelle", who }; }
  if (/zelle/i.test(d)) { const who = clean(d.replace(/.*zelle/i, "")); return { platform: "zelle", who: who || "unknown" }; }
  if ((m = d.match(/cash app\*\s*(.+)/i))) { const who = clean(m[1]); if (who) return { platform: "cash app", who }; }
  if ((m = d.match(/cash app\s+(.+?)\s+\d{6}\s/i))) { const who = clean(m[1]); if (who) return { platform: "cash app", who }; }
  if (/cash app/i.test(d)) return { platform: "cash app", who: clean(d.replace(/.*cash app/i, "")) || "unknown" };
  if ((m = d.match(/venmo\s*(?:payment|\*)?\s*(?:to|from)?\s*(.+)/i))) { const who = clean(m[1]); return { platform: "venmo", who: who || "unknown" }; }
  if ((m = d.match(/apple cash\s*(?:to|from|sent to)?\s*(.*)/i))) { const who = clean(m[1]); return { platform: "apple cash", who: who || "unknown" }; }
  if ((m = d.match(/paypal\s*(?:\*|transfer|inst xfer|purchase)?\s*(.+)/i))) { const who = clean(m[1].replace(/^\d+\s*/, "")); if (who && !/^(inst|xfer|transfer|purchase)$/.test(who)) return { platform: "paypal", who }; }
  return null;
}

/** "Zelle → Daystar Ministries" — a readable name for a P2P payment, or null. */
export const p2pLabel = (desc: string) => { const p = p2pParty(desc); if (!p) return null; const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase()); return `${cap(p.platform)} → ${cap(p.who)}`; };

export const merchantKey = (s: string) => {
  const p2p = p2pParty(s);
  if (p2p) return `${p2p.platform} to ${p2p.who}`;
  const n = parseNature(s);
  if (n.nature === "wire" && n.party) return `wire to ${n.party}`;
  if (n.nature === "ach" && n.party) return `ach to ${n.party}`;
  if (n.nature === "transfer") return n.party ? `transfer to ${n.party}` : "transfer between accounts";
  if (n.nature === "interest") return "interest charge";
  if (n.nature === "atm") return "atm cash";
  return genericKey(stripBoilerplate(s));
};

/** The key the app used before the parser existed — kept so old decisions can be carried over. */
export const legacyMerchantKey = (s: string) => { const p2p = p2pParty(s); return p2p ? `${p2p.platform} to ${p2p.who}` : genericKey(s); };

const genericKey = (s: string) =>
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
  const existingKeys = new Set(data.bills.map((b) => resolveKey(data, b.merchant ?? merchantKey(b.name))));
  const groups = new Map<string, Transaction[]>();
  for (const t of data.transactions) {
    if (t.amount <= 0) continue;
    const k = resolveKey(data, merchantKey(t.description));
    if (k.length < 3) continue;
    const pref = data.settings.merchants?.[k];
    if (pref?.kind === "transfer" || pref?.kind === "ignore" || (t.transfer && pref?.kind !== "spend")) continue;
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
      if (beatRatio < 0.5) continue;
      // Utilities and variable-rate loans swing a lot month to month; a wide band keeps them in.
      const amtStable = amounts.filter((a) => Math.abs(a - amt) <= Math.max(15, amt * 0.4)).length / amounts.length;
      if (amtStable < 0.5) continue;
      // Still active? Last seen within ~1.5 cadences of today.
      const sinceLast = daysBetween(pts[pts.length - 1].date, today.toISOString().slice(0, 10));
      if (sinceLast > c.days * 1.6 + c.tol) continue;
      const name = data.settings.merchants?.[key]?.name ?? pts[pts.length - 1].description;
      const lower = (name + " " + key).toLowerCase();
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
    const key = resolveKey(data, b.merchant ?? merchantKey(b.name));
    if (key.length < 3) continue;
    for (const t of data.transactions) {
      if (t.amount <= 0 || resolveKey(data, merchantKey(t.description)) !== key) continue;
      if (Math.abs(t.amount - b.amount) > Math.max(15, b.amount * 0.4)) continue;
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
  const known = new Set([...(data.incomeSources ?? []).map((s) => s.merchant ?? ""), ...(data.settings.dismissedIncome ?? [])]);
  for (const i of data.income ?? []) {
    if (i.status === "ignored" || i.status === "refund") continue;
    const k = merchantKey(i.source);
    if (k.length < 3 || i.amount < 50 || known.has(k)) continue;
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

/* ------------------------------------------------------------------ */
/* Income sources: expected vs actual                                  */
/* ------------------------------------------------------------------ */

export const monthlyOf = (expected: number, cadence: IncomeSource["cadence"]) =>
  cadence === "weekly" ? expected * 52 / 12 : cadence === "biweekly" ? expected * 26 / 12 : cadence === "semimonthly" ? expected * 2 : expected;

/** Projected monthly income: the sum of expected sources when any exist, else the number in Settings. */
export const expectedMonthlyIncome = (data: HomeData) => {
  const src = data.incomeSources ?? [];
  return src.length ? src.reduce((s, x) => s + monthlyOf(x.expected, x.cadence), 0) : data.pay.monthlyIncome;
};

/** Paydays for projections: from paycheck sources when any exist, else Settings. */
export const expectedPayDays = (data: HomeData) => {
  const days = [...new Set((data.incomeSources ?? []).filter((s) => s.kind === "paycheck").flatMap((s) => s.payDays))].sort((a, b) => a - b);
  return days.length ? days : data.pay.payDays;
};

/** Attach deposits to sources by merchant key and mark them counted. Returns the updated events (only when something changed). */
export function matchIncomeEvents(data: HomeData): IncomeEvent[] | null {
  const sources = data.incomeSources ?? [];
  const dismissed = new Set(data.settings.dismissedIncome ?? []);
  let changed = false;
  const out = (data.income ?? []).map((e) => {
    if (e.sourceId || e.status) return e;
    const k = merchantKey(e.source);
    const src = sources.find((s) => s.merchant === k);
    if (src) { changed = true; return { ...e, sourceId: src.id, status: "counted" as const }; }
    if (dismissed.has(k)) { changed = true; return { ...e, status: "ignored" as const }; }
    return e;
  });
  return changed ? out : null;
}

/** Pending deposits grouped by payer (merchant key), largest group first. */
export function groupDeposits(events: IncomeEvent[]): { key: string; label: string; items: IncomeEvent[]; total: number; sameAmount: boolean }[] {
  const g = new Map<string, IncomeEvent[]>();
  for (const e of events) { const k = merchantKey(e.source) || e.source.toLowerCase(); (g.get(k) ?? g.set(k, []).get(k)!).push(e); }
  return [...g.entries()].map(([key, items]) => ({ key, label: items[0].source, items, total: items.reduce((s, e) => s + e.amount, 0), sameAmount: items.every((e) => Math.abs(e.amount - items[0].amount) < 0.005) }))
    .sort((a, b) => b.items.length - a.items.length || b.total - a.total);
}

export const suggestionToSource = (s: IncomeSuggestion, id: string, kind: IncomeSource["kind"]): IncomeSource =>
  ({ id, name: s.source, kind, merchant: s.key, expected: s.perPaycheck, cadence: s.cadence, payDays: s.payDays });

/** Income received in a month: counted events (attached or explicitly counted). */
export const receivedInMonth = (data: HomeData, month: string) =>
  (data.income ?? []).filter((e) => e.date.startsWith(month) && (e.status === "counted" || e.sourceId)).reduce((s, e) => s + e.amount, 0);

/** Deposits nobody has decided on yet (not attached to a source, not counted, not ignored). */
export const unreviewedDeposits = (data: HomeData) => (data.income ?? []).filter((e) => !e.sourceId && !e.status).sort((a, b) => b.date.localeCompare(a.date));

/* ------------------------------------------------------------------ */
/* Budget recommendations: last quarter's average, reset each quarter  */
/* ------------------------------------------------------------------ */

export const quarterOf = (d: Date) => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;

/** The three months of the quarter before the one `today` is in. */
export function previousQuarterMonths(today: Date): string[] {
  const q = Math.floor(today.getMonth() / 3);
  const y = q === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const startM = q === 0 ? 9 : (q - 1) * 3;
  return [0, 1, 2].map((i) => `${y}-${String(startM + i + 1).padStart(2, "0")}`);
}

export interface BudgetRecommendation {
  categoryId: string;
  current: number;
  recommended: number;
  basis: "quarter" | "default" | "none";
  /** Months in the previous quarter that had any spend in this category. */
  monthsWithData: number;
  avg: number;
  quarter: string;
}

/**
 * For each category: average monthly spend (bills + transactions) over the previous quarter.
 * Only months with recorded activity count toward the average. With no history the category's
 * `defaultLimit` is recommended; with neither, the current limit stands.
 */
export function recommendBudgets(data: HomeData, today = new Date()): BudgetRecommendation[] {
  const months = previousQuarterMonths(today);
  const prevQ = quarterOf(new Date(Number(months[0].slice(0, 4)), Number(months[0].slice(5, 7)) - 1, 1));
  return data.budgets.map((c) => {
    const perMonth = months.map((m) => {
      const bills = data.bills.filter((b) => b.category === c.id && data.payments.some((p) => p.billId === b.id && p.month === m)).reduce((s, b) => s + (data.payments.find((p) => p.billId === b.id && p.month === m)?.amount ?? b.amount), 0);
      const tx = data.transactions.filter((t) => t.category === c.id && t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0);
      return bills + tx;
    });
    const withData = perMonth.filter((v) => v > 0);
    if (withData.length) {
      const avg = withData.reduce((s, v) => s + v, 0) / withData.length;
      // Round to a friendly number: nearest $10 under $500, nearest $25 above.
      const step = avg < 500 ? 10 : 25;
      return { categoryId: c.id, current: c.limit, recommended: Math.ceil(avg / step) * step, basis: "quarter", monthsWithData: withData.length, avg, quarter: prevQ };
    }
    if (c.defaultLimit) return { categoryId: c.id, current: c.limit, recommended: c.defaultLimit, basis: "default", monthsWithData: 0, avg: 0, quarter: prevQ };
    return { categoryId: c.id, current: c.limit, recommended: c.limit, basis: "none", monthsWithData: 0, avg: 0, quarter: prevQ };
  });
}

/** Apply recommendations to the budgets (all, or a subset of category ids). */
export function applyRecommendations(data: HomeData, recs: BudgetRecommendation[], only?: string[]): HomeData {
  const pick = new Set(only ?? recs.map((r) => r.categoryId));
  return { ...data, budgets: data.budgets.map((c) => { const r = recs.find((x) => x.categoryId === c.id); return r && pick.has(c.id) && r.basis !== "none" ? { ...c, limit: r.recommended } : c; }) };
}
