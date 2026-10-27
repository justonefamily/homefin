import { Configuration, PlaidApi, PlaidEnvironments, type AccountBase, type Transaction as PlaidTx } from "plaid";
import type { Account, AccountKind, HomeData, Transaction } from "./types";

/** Plaid errors arrive as axios errors; pull out Plaid's own code and message. */
export function plaidError(e: unknown): { code: string; message: string } {
  const r = (e as { response?: { data?: { error_code?: string; error_message?: string; display_message?: string | null } } })?.response?.data;
  if (r?.error_code) return { code: r.error_code, message: r.display_message ?? r.error_message ?? r.error_code };
  return { code: "UNKNOWN", message: (e as Error)?.message ?? String(e) };
}

export const plaidConfigured = () => !!process.env.PLAID_CLIENT_ID && !!process.env.PLAID_SECRET;

export const plaid = () =>
  new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[(process.env.PLAID_ENV as "sandbox" | "development" | "production") ?? "sandbox"],
    baseOptions: { headers: { "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!, "PLAID-SECRET": process.env.PLAID_SECRET! } },
  }));

/** Strip control/replacement characters and bank-export noise so names read cleanly in the UI. */
export const cleanName = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\ufffd?]+/g, " ")
    .replace(/[^\p{L}\p{N}\p{P}\p{Zs}$&]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const kindOf = (a: AccountBase): AccountKind => {
  if (a.type === "depository") return a.subtype === "savings" ? "savings" : "checking";
  if (a.type === "credit") return "credit";
  if (a.type === "loan") return a.subtype === "mortgage" ? "mortgage" : "loan";
  return "checking";
};

/** Merge Plaid accounts into the home: update existing (matched by plaid account id), add new. Appends a balance point per account. */
export function mergeAccounts(home: HomeData, itemId: string, institution: string, accounts: AccountBase[], now = new Date()): HomeData {
  const date = now.toISOString().slice(0, 10);
  const next = home.accounts.slice();
  const history = (home.balanceHistory ?? []).slice();
  for (const a of accounts) {
    const kind = kindOf(a);
    const balance = kind === "checking" || kind === "savings" ? a.balances.current ?? 0 : a.balances.current ?? 0;
    const existing = next.find((x) => x.id === a.account_id);
    const merged: Account = {
      ...(existing ?? { id: a.account_id, source: "plaid" as const, name: cleanName(a.official_name) || cleanName(a.name) || "Account", institution: cleanName(institution) || "Bank", kind }),
      balance, mask: a.mask ?? existing?.mask, plaidItemId: itemId, lastSyncedAt: now.toISOString(),
      apr: existing?.apr, minPayment: existing?.minPayment,
    };
    if (existing) next[next.indexOf(existing)] = merged; else next.push(merged);
    history.push({ accountId: a.account_id, date, balance });
  }
  return { ...home, accounts: next, balanceHistory: history };
}

/** Map Plaid transactions into HomeFin transactions, guessing a budget category from Plaid's personal-finance category. */
export function mergeTransactions(home: HomeData, added: PlaidTx[], removed: string[]): { home: HomeData; added: number } {
  const removedSet = new Set(removed);
  const catFor = (t: PlaidTx) => {
    const p = t.personal_finance_category?.primary ?? "";
    const guess: Record<string, string[]> = {
      FOOD_AND_DRINK: ["groceries", "dining"], TRANSPORTATION: ["transport"], ENTERTAINMENT: ["subs", "dining"], RENT_AND_UTILITIES: ["utilities", "housing"],
      GENERAL_MERCHANDISE: ["shopping"], PERSONAL_CARE: ["personal"], MEDICAL: ["medical"], LOAN_PAYMENTS: ["debt"], GENERAL_SERVICES: ["services"],
    };
    const detailed = t.personal_finance_category?.detailed ?? "";
    const candidates = p === "FOOD_AND_DRINK" ? (detailed.includes("GROCER") ? ["groceries", "dining"] : ["dining", "groceries"]) : guess[p] ?? [];
    return candidates.find((c) => home.budgets.some((b) => b.id === c)) ?? home.budgets[0]?.id ?? "other";
  };
  const existing = new Set(home.transactions.map((t) => t.id));
  const fresh: Transaction[] = added
    .filter((t) => !existing.has(t.transaction_id) && t.amount > 0 && !t.pending)
    .map((t) => ({ id: t.transaction_id, accountId: t.account_id, date: t.date, description: cleanName(t.merchant_name) || cleanName(t.name) || "Transaction", amount: t.amount, category: catFor(t) }));
  const income = (home.income ?? []).slice();
  for (const t of added) if (t.amount < 0 && !t.pending && !income.some((i) => i.id === t.transaction_id) && (t.personal_finance_category?.primary === "INCOME")) income.push({ id: t.transaction_id, date: t.date, amount: -t.amount, source: t.merchant_name ?? t.name });
  return { home: { ...home, transactions: [...home.transactions.filter((t) => !removedSet.has(t.id)), ...fresh], income }, added: fresh.length };
}
