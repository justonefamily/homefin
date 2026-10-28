import type { Bill, HomeData, MerchantPref, Transaction } from "./types";
import { legacyMerchantKey, merchantKey, p2pLabel } from "./detect";
import { parseNature } from "./nature";

/**
 * Where the money goes, by merchant, across every account — and the complete in/out picture
 * for any date range. Merchants are identified by merchantKey(description); the household can
 * merge keys that are really the same place, rename them, or mark them as transfers.
 */

export const prefFor = (data: HomeData, key: string): MerchantPref => data.settings.merchants?.[key] ?? {};

/** Follow merges to the canonical key (guards against cycles). */
export function resolveKey(data: HomeData, key: string): string {
  const seen = new Set<string>();
  let k = key;
  while (!seen.has(k)) { seen.add(k); const next = data.settings.merchants?.[k]?.mergedInto; if (!next || next === k) break; k = next; }
  return k;
}

export const txKey = (data: HomeData, t: Transaction) => resolveKey(data, t.merchantOverride ?? merchantKey(t.description));

/** How a transaction counts: a bill payment, a transfer, ignored, or plain spending. */
export type TxKind = "bill" | "transfer" | "ignore" | "spend" | "reimbursable";

/** Is this category one where the money comes back? */
export const isReimbursable = (data: HomeData, category: string | undefined) => !!category && data.budgets.find((b) => b.id === category)?.bucket === "reimbursable";

export function classify(data: HomeData, t: Transaction, billKeys: Map<string, Bill>): { kind: TxKind; key: string; bill?: Bill } {
  const key = txKey(data, t);
  const pref = prefFor(data, key);
  if (pref.kind === "ignore") return { kind: "ignore", key };
  if (pref.kind === "transfer") return { kind: "transfer", key };
  const bill = billKeys.get(key);
  if (bill) return { kind: "bill", key, bill };
  if (t.transfer && pref.kind !== "spend") return { kind: "transfer", key };
  // The parser's read of the description decides the default: a move between your own accounts isn't spending.
  if (!pref.kind && parseNature(t.description).defaultKind === "transfer") return { kind: "transfer", key };
  if (isReimbursable(data, pref.category ?? t.category)) return { kind: "reimbursable", key };
  return { kind: "spend", key };
}

/** Money paid toward a tracked loan/card (merchants marked "pays down"), optionally within a date range. */
export function debtPaymentsFor(data: HomeData, accountId: string, from?: string, to?: string): { total: number; count: number; last?: string } {
  const bills = billKeyMap(data);
  let total = 0, count = 0, last: string | undefined;
  for (const t of data.transactions) {
    if (t.amount <= 0 || (from && t.date < from) || (to && t.date > to)) continue;
    const c = classify(data, t, bills);
    if (c.kind === "ignore") continue;
    if (prefFor(data, c.key).paysDownAccountId !== accountId) continue;
    total += t.amount; count++; if (!last || t.date > last) last = t.date;
  }
  return { total, count, last };
}

/** Split every transaction with this exact statement wording out of `fromKey` into its own merchant. */
export function splitStatementName(data: HomeData, fromKey: string, description: string, label?: string): HomeData {
  const slug = "split:" + description.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const transactions = data.transactions.map((t) => (t.description === description && txKey(data, t) === fromKey ? { ...t, merchantOverride: slug } : t));
  const pref = data.settings.merchants?.[slug] ?? {};
  return { ...data, transactions, settings: { ...data.settings, merchants: { ...(data.settings.merchants ?? {}), [slug]: { ...pref, name: pref.name ?? label } } } };
}

/** Move one transaction to another merchant (or, with `tx:<id>`, make it stand on its own). Pass undefined to put it back. */
export const moveTransaction = (data: HomeData, txId: string, toKey: string | undefined): HomeData =>
  ({ ...data, transactions: data.transactions.map((t) => (t.id === txId ? { ...t, merchantOverride: toKey } : t)) });

/**
 * When the key rules improve, decisions made under the old keys (names, categories, merges, transfer flags) would be
 * stranded. Carry each one over to the key its transactions have now. Returns null when nothing moved.
 */
export function migrateMerchantKeys(data: HomeData): HomeData | null {
  const prefs = data.settings.merchants ?? {};
  const have = new Set(data.transactions.map((t) => merchantKey(t.description)));
  const next: Record<string, MerchantPref> = { ...prefs };
  let moved = 0;
  for (const [key, pref] of Object.entries(prefs)) {
    if (have.has(key) || key.startsWith("tx:")) continue;
    const targets = new Set(data.transactions.filter((t) => legacyMerchantKey(t.description) === key).map((t) => merchantKey(t.description)));
    if (targets.size !== 1) continue;
    const to = [...targets][0];
    next[to] = { ...pref, ...(next[to] ?? {}) };
    delete next[key];
    for (const [k, p] of Object.entries(next)) if (p.mergedInto === key) next[k] = { ...p, mergedInto: to };
    moved++;
  }
  if (!moved) return null;
  const bills = data.bills.map((b) => {
    if (!b.merchant || have.has(b.merchant)) return b;
    const targets = new Set(data.transactions.filter((t) => legacyMerchantKey(t.description) === b.merchant).map((t) => merchantKey(t.description)));
    return targets.size === 1 ? { ...b, merchant: [...targets][0] } : b;
  });
  return { ...data, bills, settings: { ...data.settings, merchants: next } };
}

export const billKeyMap = (data: HomeData) => {
  const m = new Map<string, Bill>();
  for (const b of [...data.bills].sort((x, y) => (x.endedOn ? 1 : 0) - (y.endedOn ? 1 : 0))) { const k = resolveKey(data, b.merchant ?? merchantKey(b.name)); if (k.length >= 3 && !m.has(k)) m.set(k, b); }
  return m;
};

export interface MerchantSummary {
  key: string;
  name: string;
  total: number;
  count: number;
  firstSeen: string;
  lastSeen: string;
  /** Average per calendar month over the months it appeared. */
  perMonth: number;
  months: number;
  accountIds: string[];
  category: string;
  kind: TxKind;
  bill?: Bill;
  /** Looks recurring: ≥3 months with roughly monthly gaps. */
  recurring: boolean;
  medianAmount: number;
  medianDay: number;
  /** Keys that were merged into this one. */
  merged: string[];
  /** Marked "not an everyday spend". */
  occasional: boolean;
}

const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

export function merchantSummaries(data: HomeData, from?: string, to?: string): MerchantSummary[] {
  const bills = billKeyMap(data);
  const groups = new Map<string, Transaction[]>();
  for (const t of data.transactions) {
    if (t.amount <= 0) continue;
    if (from && t.date < from) continue;
    if (to && t.date > to) continue;
    const k = txKey(data, t);
    if (k.length < 2) continue;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  const mergedInto = new Map<string, string[]>();
  for (const [k, p] of Object.entries(data.settings.merchants ?? {})) if (p.mergedInto) { const r = resolveKey(data, k); (mergedInto.get(r) ?? mergedInto.set(r, []).get(r)!).push(k); }
  const out: MerchantSummary[] = [];
  for (const [key, txs] of groups) {
    const sorted = txs.slice().sort((a, b) => a.date.localeCompare(b.date));
    const pref = prefFor(data, key);
    const c = classify(data, sorted[sorted.length - 1], bills);
    const monthSet = new Set(sorted.map((t) => t.date.slice(0, 7)));
    const total = sorted.reduce((s, t) => s + t.amount, 0);
    const byMonth = [...monthSet].sort();
    let recurring = false;
    if (byMonth.length >= 3) {
      const idx = byMonth.map((m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)));
      const consecutive = idx.slice(1).filter((v, i) => v - idx[i] === 1).length;
      recurring = consecutive / (idx.length - 1) >= 0.6;
    }
    const counts = new Map<string, number>();
    for (const t of sorted) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    const topCat = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
    out.push({
      key, name: pref.name ?? c.bill?.name ?? p2pLabel(sorted[sorted.length - 1].description) ?? sorted[sorted.length - 1].description, total: Math.round(total * 100) / 100, count: sorted.length,
      firstSeen: sorted[0].date, lastSeen: sorted[sorted.length - 1].date, perMonth: Math.round(total / Math.max(1, monthSet.size)), months: monthSet.size,
      accountIds: [...new Set(sorted.map((t) => t.accountId).filter(Boolean) as string[])],
      category: pref.category ?? c.bill?.category ?? topCat, kind: c.kind, bill: c.bill, recurring,
      medianAmount: Math.round(median(sorted.map((t) => t.amount)) * 100) / 100,
      medianDay: Math.max(1, Math.min(28, Math.round(median(sorted.map((t) => Number(t.date.slice(8, 10))))))),
      merged: mergedInto.get(key) ?? [],
      occasional: !!pref.occasional,
    });
  }
  return out.sort((a, b) => b.total - a.total);
}

/** Pairs of merchants that look like the same place: shared first word, or one key contains the other. */
export function similarMerchants(list: MerchantSummary[]): [MerchantSummary, MerchantSummary][] {
  const pairs: [MerchantSummary, MerchantSummary][] = [];
  const first = (k: string) => k.split(" ")[0];
  const GENERIC = new Set(["the", "www", "sq", "tst", "pp", "amzn", "amazon", "paypal", "apple", "google", "walmart", "target", "zelle", "cash", "venmo", "money", "transfer", "payment", "online", "mobile", "interest", "authorized"]);
  // Person-to-person payments are never "the same place" as each other — different recipients are different people.
  const isP2P = (k: string) => /^(zelle|cash app|venmo|paypal|apple cash) to /.test(k);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.kind === "ignore" || b.kind === "ignore") continue;
    if (isP2P(a.key) || isP2P(b.key)) continue;
    const fa = first(a.key), fb = first(b.key);
    const like = (fa === fb && fa.length >= 4 && !GENERIC.has(fa)) || (a.key.length >= 5 && b.key.includes(a.key)) || (b.key.length >= 5 && a.key.includes(b.key));
    if (like) pairs.push([a, b]);
  }
  return pairs.slice(0, 12);
}

/* ------------------------------ Money flow ------------------------------ */

export interface FlowLine { key: string; name: string; amount: number; count: number; accountIds: string[]; date: string; bill?: Bill; category: string; unreviewed?: boolean; paysDown?: string }
export interface Flow {
  from: string; to: string;
  income: number; bills: number; spending: number; transfers: number; reimbursable: number; net: number;
  incomeLines: FlowLine[]; billLines: FlowLine[]; spendLines: FlowLine[]; transferLines: FlowLine[]; reimbursableLines: FlowLine[];
  byAccount: { accountId: string; in: number; out: number }[];
  /** Bills due in the range with no matching payment yet. */
  unpaidBills: { bill: Bill; dueDate: string }[];
  /** Deposits in range that were matched to an outflow from another of your accounts (ignored). */
  internalDeposits: number;
}

/** Everything that moved between `from` and `to` (inclusive, YYYY-MM-DD), across every account. */
export function flowFor(data: HomeData, from: string, to: string): Flow {
  const bills = billKeyMap(data);
  const acct = new Map<string, { in: number; out: number }>();
  const bump = (id: string | undefined, io: "in" | "out", n: number) => { const k = id ?? "manual"; const e = acct.get(k) ?? acct.set(k, { in: 0, out: 0 }).get(k)!; e[io] += n; };
  const group = (lines: Map<string, FlowLine>, key: string, name: string, t: { amount: number; accountId?: string; date: string; category?: string }, bill?: Bill) => {
    const e = lines.get(key) ?? lines.set(key, { key, name, amount: 0, count: 0, accountIds: [], date: t.date, bill, category: t.category ?? "other" }).get(key)!;
    e.amount += t.amount; e.count++; if (t.accountId && !e.accountIds.includes(t.accountId)) e.accountIds.push(t.accountId); if (t.date > e.date) e.date = t.date;
  };
  const inc = new Map<string, FlowLine>(), bl = new Map<string, FlowLine>(), sp = new Map<string, FlowLine>(), tr = new Map<string, FlowLine>(), rb = new Map<string, FlowLine>();
  let internalDeposits = 0;
  for (const e of data.income ?? []) {
    if (e.date < from || e.date > to) continue;
    if (e.internal) { internalDeposits++; continue; }
    if (e.status === "ignored") continue;
    if (e.status === "refund") { group(sp, "refund:" + merchantKey(e.source), `${e.source} (refund)`, { amount: -e.amount, date: e.date, category: "refund" }); continue; }
    const src = data.incomeSources?.find((s) => s.id === e.sourceId);
    const key = src ? `src:${src.id}` : merchantKey(e.source);
    group(inc, key, src?.name ?? e.source, { amount: e.amount, date: e.date, category: "income" });
    if (!src && !e.status) inc.get(key)!.unreviewed = true;
    bump(undefined, "in", e.amount);
  }
  for (const t of data.transactions) {
    if (t.amount <= 0 || t.date < from || t.date > to) continue;
    const c = classify(data, t, bills);
    if (c.kind === "ignore") continue;
    const pref = prefFor(data, c.key);
    const name = pref.name ?? c.bill?.name ?? p2pLabel(t.description) ?? t.description;
    const tt = { ...t, category: pref.category ?? c.bill?.category ?? t.category };
    const paysDown = pref.paysDownAccountId ? data.accounts.find((a) => a.id === pref.paysDownAccountId)?.name : undefined;
    if (c.kind === "bill") group(bl, c.key, name, tt, c.bill);
    else if (c.kind === "transfer") group(tr, c.key, name, tt);
    else if (c.kind === "reimbursable") group(rb, c.key, name, tt);
    else group(sp, c.key, name, tt);
    if (paysDown) { const l = (c.kind === "bill" ? bl : c.kind === "transfer" ? tr : c.kind === "reimbursable" ? rb : sp).get(c.key); if (l) l.paysDown = paysDown; }
    if (c.kind !== "transfer") bump(t.accountId, "out", t.amount);
  }
  const sum = (m: Map<string, FlowLine>) => [...m.values()].reduce((s, l) => s + l.amount, 0);
  const sortDesc = (m: Map<string, FlowLine>) => [...m.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  // Bills due in range but not paid
  const paid = new Set(data.payments.map((p) => `${p.billId}:${p.month}`));
  const unpaidBills: Flow["unpaidBills"] = [];
  const [fy, fm] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const [ty, tm] = [Number(to.slice(0, 4)), Number(to.slice(5, 7))];
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, m = 1) : m++) {
    const month = `${y}-${String(m).padStart(2, "0")}`;
    for (const b of data.bills) {
      const due = `${month}-${String(Math.min(b.dueDay, new Date(y, m, 0).getDate())).padStart(2, "0")}`;
      if (due < from || due > to || paid.has(`${b.id}:${month}`)) continue;
      if ([...bl.values()].some((l) => l.bill?.id === b.id)) continue;
      unpaidBills.push({ bill: b, dueDate: due });
    }
  }
  const income = sum(inc), billsTotal = sum(bl), spending = sum(sp), transfers = sum(tr), reimbursable = sum(rb);
  return {
    // Reimbursable money is out of pocket for now, so it's subtracted here; the deposit that returns it comes back in as income.
    from, to, income, bills: billsTotal, spending, transfers, reimbursable, net: income - billsTotal - spending - reimbursable,
    incomeLines: sortDesc(inc), billLines: sortDesc(bl), spendLines: sortDesc(sp), transferLines: sortDesc(tr), reimbursableLines: sortDesc(rb),
    byAccount: [...acct.entries()].map(([accountId, v]) => ({ accountId, ...v })).sort((a, b) => b.out + b.in - a.out - a.in),
    unpaidBills: unpaidBills.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    internalDeposits,
  };
}

/** Make a bill out of a merchant summary (median amount and day). */
export const merchantToBill = (m: MerchantSummary, id: string, category?: string): Bill => ({
  id, name: m.name, amount: m.medianAmount, dueDay: m.medianDay, category: category ?? m.category, accountId: m.accountIds[0], autopay: true, cadence: "monthly", merchant: m.key,
});

/** Settings updater: merge `from` into `into`. */
export const mergeMerchants = (data: HomeData, from: string, into: string): HomeData => {
  const target = resolveKey(data, into);
  if (target === from) return data;
  let next: HomeData = { ...data, settings: { ...data.settings, merchants: { ...(data.settings.merchants ?? {}), [from]: { ...prefFor(data, from), mergedInto: target } } } };
  // Two bills meeting in one merge (the old mortgage servicer and the new one): only the one paid most recently stays current;
  // the other is ended on the month of its last payment and kept for history.
  const billOf = (k: string) => next.bills.find((b) => b.merchant && resolveKey(data, b.merchant) === k && !b.endedOn);
  const a = billOf(from), b = billOf(target);
  if (a && b && a.id !== b.id) {
    const last = (k: string) => data.transactions.filter((t) => t.amount > 0 && txKey(data, t) === k).map((t) => t.date).sort().pop() ?? "";
    const [older, lastOlder] = last(from) <= last(target) ? [a, last(from)] : [b, last(target)];
    const endedOn = (lastOlder || new Date().toISOString()).slice(0, 7);
    next = { ...next, bills: next.bills.map((x) => (x.id === older.id ? { ...x, endedOn } : x)) };
  }
  return next;
};
/** Undo a merge: `key` becomes its own merchant again (its name/category/kind are kept). */
export const unmergeMerchant = (data: HomeData, key: string): HomeData => {
  const cur = { ...prefFor(data, key) }; delete cur.mergedInto;
  return { ...data, settings: { ...data.settings, merchants: { ...(data.settings.merchants ?? {}), [key]: cur } } };
};
export const setMerchantPref = (data: HomeData, key: string, patch: Partial<MerchantPref>): HomeData =>
  ({ ...data, settings: { ...data.settings, merchants: { ...(data.settings.merchants ?? {}), [key]: { ...prefFor(data, key), ...patch } } } });

/* ------------------------------ Internal transfers ------------------------------ */

const dayDiff = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;

/**
 * Money that left one of your accounts and landed in another (Zelle to a spouse on the shared account,
 * a card payment, a move to savings, a refund) is not income and not spending. Pair each unreviewed deposit
 * with an outflow of the same amount within `windowDays` and mark both. Returns null when nothing changed.
 * Banks post at different speeds — a card payment can take most of a week to show on the card — so the
 * window is 7 days; the closest-dated match wins.
 */
export const TRANSFER_WINDOW_DAYS = 7;
export function matchInternalTransfers(data: HomeData, windowDays = TRANSFER_WINDOW_DAYS): HomeData | null {
  const income = (data.income ?? []).slice();
  const txs = data.transactions.slice();
  const usedTx = new Set<string>();
  let changed = 0;
  for (let i = 0; i < income.length; i++) {
    const e = income[i];
    if (e.status || e.sourceId || e.internal) continue;
    // Never pair against a merchant the user explicitly said is spending.
    let best = -1, bestGap = 99;
    for (let j = 0; j < txs.length; j++) {
      const t = txs[j];
      if (usedTx.has(t.id) || t.amount <= 0 || Math.abs(t.amount - e.amount) > 0.005) continue;
      const gap = dayDiff(t.date, e.date);
      if (gap > windowDays || gap >= bestGap) continue;
      if (prefFor(data, txKey(data, t)).kind === "spend") continue;
      best = j; bestGap = gap;
    }
    if (best < 0) continue;
    usedTx.add(txs[best].id);
    txs[best] = { ...txs[best], transfer: true };
    income[i] = { ...e, status: "ignored", internal: true };
    changed++;
  }
  return changed ? { ...data, income, transactions: txs } : null;
}

/* ------------------------------ Duplicate deposits ------------------------------ */

/**
 * The same deposit recorded twice — it happens when a bank was linked twice and the older link was removed
 * before deposits carried an account id, or when Plaid re-issues an id. Two deposits are the same when they
 * share date, amount and description and we can't tell they landed in different accounts. Keeps the reviewed
 * copy (attached to a source, or counted/ignored) and drops the rest. Returns null when nothing changed.
 */
export function dedupeIncome(data: HomeData): HomeData | null {
  const groups = new Map<string, number[]>();
  const income = data.income ?? [];
  income.forEach((e, i) => { const k = `${e.date}|${e.amount.toFixed(2)}|${e.source.trim().toLowerCase()}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(i); });
  const drop = new Set<number>();
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    // Different known accounts → genuinely separate deposits (same paycheck split two ways, say).
    const byAcct = new Map<string, number[]>();
    for (const i of idx) { const a = income[i].accountId ?? ""; (byAcct.get(a) ?? byAcct.set(a, []).get(a)!).push(i); }
    const pools = byAcct.has("") ? [idx] : [...byAcct.values()]; // unknown account: treat the whole group as one
    for (const pool of pools) {
      if (pool.length < 2) continue;
      const rank = (i: number) => (income[i].sourceId ? 3 : 0) + (income[i].status ? 2 : 0) + (income[i].accountId ? 1 : 0);
      const keep = pool.slice().sort((a, b) => rank(b) - rank(a))[0];
      for (const i of pool) if (i !== keep) drop.add(i);
    }
  }
  return drop.size ? { ...data, income: income.filter((_, i) => !drop.has(i)) } : null;
}
