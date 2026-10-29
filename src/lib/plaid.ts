import { Configuration, PlaidApi, PlaidEnvironments, type AccountBase, type Transaction as PlaidTx } from "plaid";
import type { Account, AccountKind, HomeData, Transaction } from "./types";
import { brandColorFor } from "./brands";

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
export interface Branding { color?: string | null; logo?: string | null }

export function mergeAccounts(home: HomeData, itemId: string, institution: string, accounts: AccountBase[], now = new Date(), brand: Branding = {}): HomeData {
  const date = now.toISOString().slice(0, 10);
  const next = home.accounts.slice();
  const history = (home.balanceHistory ?? []).slice();
  const hidden = new Set(home.settings.hiddenAccounts ?? []);
  for (const a of accounts) {
    if (hidden.has(a.account_id)) continue;
    const kind = kindOf(a);
    const balance = kind === "checking" || kind === "savings" ? a.balances.current ?? 0 : a.balances.current ?? 0;
    const existing = next.find((x) => x.id === a.account_id);
    const merged: Account = {
      ...(existing ?? { id: a.account_id, source: "plaid" as const, name: cleanName(a.official_name) || cleanName(a.name) || "Account", institution: cleanName(institution) || "Bank", kind }),
      balance, mask: a.mask ?? existing?.mask, plaidItemId: itemId, lastSyncedAt: now.toISOString(),
      apr: existing?.apr, minPayment: existing?.minPayment,
      brandColor: brand.color ?? existing?.brandColor ?? brandColorFor(institution),
      logo: brand.logo ? `data:image/png;base64,${brand.logo}` : existing?.logo,
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
  const tracksCards = home.accounts.some((a) => a.kind === "credit");
  // Money moving between your own accounts is not spending: bank transfers, and credit-card payments when we track a card
  // (if no card is linked, the payment is the only place that spending shows up, so it stays as spending).
  const isTransfer = (t: PlaidTx) => {
    const prim = t.personal_finance_category?.primary ?? "", det = t.personal_finance_category?.detailed ?? "";
    return prim === "TRANSFER_OUT" || (det === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" && tracksCards);
  };
  const fresh: Transaction[] = added
    .filter((t) => !existing.has(t.transaction_id) && t.amount > 0 && !t.pending)
    .map((t) => ({ id: t.transaction_id, accountId: t.account_id, date: t.date, description: cleanName(t.merchant_name) || cleanName(t.name) || "Transaction", amount: t.amount, category: catFor(t), pfc: t.personal_finance_category?.detailed ?? undefined, ...(isTransfer(t) ? { transfer: true } : {}) }));
  const income = (home.income ?? []).slice();
  const credits = (home.credits ?? []).slice();
  const creditIds = new Set(credits.map((c) => c.id));
  const liability = new Set(home.accounts.filter((a) => a.kind === "credit" || a.kind === "loan" || a.kind === "mortgage").map((a) => a.id));
  const SKIP_DEPOSITS = new Set(["TRANSFER_IN", "LOAN_PAYMENTS", "BANK_FEES"]);
  for (const t of added) {
    if (t.amount >= 0 || t.pending) continue;
    // A credit on a loan or card is a payment arriving — keep it so the paying side can be told where it went.
    if (liability.has(t.account_id)) {
      if (!creditIds.has(t.transaction_id)) credits.push({ id: t.transaction_id, accountId: t.account_id, date: t.date, amount: -t.amount, description: cleanName(t.merchant_name) || cleanName(t.name) || "Payment" });
      continue;
    }
    if (income.some((i) => i.id === t.transaction_id)) continue;
    const prim = t.personal_finance_category?.primary ?? "";
    if (SKIP_DEPOSITS.has(prim)) continue;
    income.push({ id: t.transaction_id, date: t.date, amount: -t.amount, source: cleanName(t.merchant_name) || cleanName(t.name) || "Deposit", accountId: t.account_id });
  }
  return { home: { ...home, transactions: [...home.transactions.filter((t) => !removedSet.has(t.id)), ...fresh], income, credits: credits.filter((c) => !removedSet.has(c.id)) }, added: fresh.length };
}
