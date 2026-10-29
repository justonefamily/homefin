import type { HomeData, IncomeEvent, Transaction } from "./types";
import { billKeyMap, classify, merchantSummaries, txKey } from "./merchants";
import { merchantKey, p2pLabel } from "./detect";
import { parseNature } from "./nature";
import { findFlag } from "./flags";

/** One line of the ledger — every dollar in or out of any account, in one shape. */
export interface LedgerEntry {
  id: string;
  date: string;
  /** What it was: the merchant's chosen name, the deposit's source, or the counterpart account. */
  item: string;
  /** Merchant or account on the other side — "Navy Federal · Stinger" for a payment to your own loan, "Wells Fargo · Checking" for a payment received. */
  counterpart?: string;
  /** Which of your accounts it happened on. */
  accountId?: string;
  /** Signed: positive = money in, negative = money out. */
  amount: number;
  direction: "in" | "out";
  kind: "spend" | "bill" | "transfer" | "reimbursable" | "ignore" | "income" | "refund" | "payment-received";
  /** Statement wording exactly as the bank sent it. */
  description: string;
  category?: string;
  /** Short notes: "reads as wire", "flagged: …", "moved by hand", "ignored". */
  details: string[];
  /** What the row opens: a merchant item page or a deposit sheet. */
  open: { merchantKey: string } | { deposit: IncomeEvent } | null;
}

export interface LedgerFilter { from?: string; to?: string; accountId?: string; direction?: "in" | "out"; q?: string; kind?: LedgerEntry["kind"] }

const KIND_LABEL: Record<LedgerEntry["kind"], string> = {
  spend: "Everyday", bill: "Bill", transfer: "Transfer", reimbursable: "Coming back", ignore: "Hidden", income: "Income", refund: "Refund", "payment-received": "Payment received",
};
export const ledgerKindLabel = (k: LedgerEntry["kind"]) => KIND_LABEL[k];

export function ledgerEntries(data: HomeData, f: LedgerFilter = {}): LedgerEntry[] {
  const bills = billKeyMap(data);
  const acct = (id?: string) => (id ? data.accounts.find((a) => a.id === id) : undefined);
  const acctLabel = (id?: string) => { const a = acct(id); return a ? `${a.institution} · ${a.name}` : undefined; };
  const names = new Map(merchantSummaries(data).map((m) => [m.key, m.name]));
  const catName = (id?: string) => data.budgets.find((b) => b.id === id)?.name;
  const inRange = (d: string) => (!f.from || d >= f.from) && (!f.to || d <= f.to);
  const out: LedgerEntry[] = [];

  // Money out: every bank transaction.
  for (const t of data.transactions as Transaction[]) {
    if (t.amount <= 0 || !inRange(t.date)) continue;
    if (f.accountId && t.accountId !== f.accountId) continue;
    const c = classify(data, t, bills);
    const nature = parseNature(t.description);
    const details: string[] = [];
    if (nature.nature !== "other" && nature.nature !== "card") details.push(`reads as ${nature.label.toLowerCase()}`);
    if (t.merchantOverride) details.push("moved here by hand");
    if (t.toAccountManual) details.push("destination set by hand");
    const fl = findFlag(data, "transaction", t.id);
    if (fl) details.push(`flagged${fl.note ? `: ${fl.note}` : ""}`);
    const item = names.get(c.key) ?? c.bill?.name ?? p2pLabel(t.description) ?? t.description;
    const to = t.toAccountId ? acctLabel(t.toAccountId) : undefined;
    out.push({
      id: t.id, date: t.date, item, counterpart: to ?? (c.kind === "transfer" ? "one of your accounts" : undefined), accountId: t.accountId,
      amount: -t.amount, direction: "out", kind: c.kind, description: t.description, category: catName(t.category), details, open: { merchantKey: c.key },
    });
  }

  // Money in: deposits (counted, ignored, refunds, internal moves).
  for (const e of data.income ?? []) {
    if (!inRange(e.date)) continue;
    if (f.accountId && e.accountId !== f.accountId) continue;
    const details: string[] = [];
    const kind: LedgerEntry["kind"] = e.status === "refund" ? "refund" : e.internal ? "transfer" : e.status === "ignored" ? "ignore" : "income";
    if (e.internal) details.push("matched to money leaving another of your accounts");
    else if (e.status === "ignored") details.push("not counted as income");
    if (e.sourceId) { const s = (data.incomeSources ?? []).find((x) => x.id === e.sourceId); if (s) details.push(`paycheck · ${s.name}`); }
    const fl = findFlag(data, "deposit", e.id);
    if (fl) details.push(`flagged${fl.note ? `: ${fl.note}` : ""}`);
    out.push({
      id: e.id, date: e.date, item: p2pLabel(e.source) ?? names.get(merchantKey(e.source)) ?? e.source, counterpart: e.internal ? "one of your accounts" : undefined, accountId: e.accountId,
      amount: e.amount, direction: "in", kind, description: e.source, details, open: { deposit: e },
    });
  }

  // Payments arriving on your own loans and cards — the other side of a payment you sent.
  for (const c of data.credits ?? []) {
    if (!inRange(c.date)) continue;
    if (f.accountId && c.accountId !== f.accountId) continue;
    const from = data.transactions.find((t) => t.toAccountId === c.accountId && Math.abs(t.amount - c.amount) < 0.005 && Math.abs(new Date(t.date).getTime() - new Date(c.date).getTime()) <= 8 * 86400000);
    out.push({
      id: c.id, date: c.date, item: acct(c.accountId)?.name ?? "Loan payment", counterpart: from ? acctLabel(from.accountId) : undefined, accountId: c.accountId,
      amount: c.amount, direction: "in", kind: "payment-received", description: c.description, details: from ? [] : ["not matched to a payment you sent"], open: from ? { merchantKey: txKey(data, from) } : null,
    });
  }

  let rows = out;
  if (f.direction) rows = rows.filter((r) => r.direction === f.direction);
  if (f.kind) rows = rows.filter((r) => r.kind === f.kind);
  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter((r) => r.item.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || (r.counterpart ?? "").toLowerCase().includes(q) || (acctLabel(r.accountId) ?? "").toLowerCase().includes(q) || String(Math.abs(r.amount)).includes(q));
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.item.localeCompare(b.item));
}

/** Totals for a set of rows: in, out (as a positive number), net — hidden/ignored rows left out of the totals. */
export function ledgerTotals(rows: LedgerEntry[]) {
  let inn = 0, outt = 0;
  for (const r of rows) { if (r.kind === "ignore") continue; if (r.amount > 0) inn += r.amount; else outt += -r.amount; }
  return { in: inn, out: outt, net: inn - outt };
}
