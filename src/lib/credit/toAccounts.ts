import type { Account, HomeData } from "../types";
import type { CreditAccount, CreditReport } from "./types";

export const creditRef = (a: CreditAccount) => `${a.creditor}|${a.accountMask}`;

/** Accounts on the latest report that still carry a balance and aren't tracked yet — candidates for the payoff plan. */
export function payoffCandidates(data: HomeData): { account: CreditAccount; report: CreditReport }[] {
  const reports = (data.credit?.reports ?? []).slice().sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  const latestPer = new Map<string, CreditReport>();
  for (const r of reports) if (!latestPer.has(r.person + r.bureau)) latestPer.set(r.person + r.bureau, r);
  const tracked = new Set(data.accounts.map((x) => x.creditRef).filter(Boolean));
  const out: { account: CreditAccount; report: CreditReport }[] = [];
  for (const r of latestPer.values()) for (const a of r.accounts) {
    if (!a.balance || a.balance <= 0) continue;
    if (tracked.has(creditRef(a))) continue;
    // Skip what Plaid already tracks: same last-4 digits on a card/loan from a similar-named institution.
    const last4 = a.accountMask.replace(/\D/g, "").slice(-4);
    const first = a.creditor.split(/[\s/]/)[0].toLowerCase();
    if (last4 && data.accounts.some((x) => x.mask === last4 && (x.institution + " " + x.name).toLowerCase().includes(first))) continue;
    out.push({ account: a, report: r });
  }
  return out.sort((x, y) => (y.account.balance ?? 0) - (x.account.balance ?? 0));
}

export const kindFor = (a: CreditAccount): Account["kind"] =>
  /mortgage/i.test(a.accountType ?? "") ? "mortgage" : /revolving/i.test(a.accountType ?? "") ? "credit" : "loan";

/** Turn a report tradeline into a tracked account (balance from the report; APR unknown until you set it). */
export const accountFromCredit = (a: CreditAccount, id: string): Account => ({
  id, name: `${a.loanType ? a.loanType.charAt(0) + a.loanType.slice(1).toLowerCase() : a.accountType ?? "Account"} ${a.accountMask.slice(-6)}`.trim(),
  institution: a.creditor, kind: kindFor(a), balance: a.balance ?? 0, mask: a.accountMask.replace(/\D/g, "").slice(-4) || undefined,
  minPayment: a.monthlyPayment || undefined, source: "manual", creditRef: creditRef(a),
});

/** After a new import: refresh balances of accounts that came from a report. */
export function refreshFromReport(data: HomeData, report: CreditReport): HomeData {
  const byRef = new Map(report.accounts.map((a) => [creditRef(a), a]));
  return { ...data, accounts: data.accounts.map((x) => { const a = x.creditRef ? byRef.get(x.creditRef) : undefined; return a && a.balance !== undefined ? { ...x, balance: a.balance, minPayment: a.monthlyPayment || x.minPayment } : x; }) };
}
