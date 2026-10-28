import type { CreditAccount, CreditReport } from "./types";

/** What changed between two reports for the same person & bureau. */
export interface CreditDiff {
  newAccounts: CreditAccount[];
  gone: CreditAccount[];
  closed: CreditAccount[];
  reopened: CreditAccount[];
  balanceChanges: { before: CreditAccount; after: CreditAccount; delta: number }[];
  newAdverse: CreditAccount[];
  clearedAdverse: CreditAccount[];
  newInquiries: { name: string; date: string }[];
  utilization: { before: number | null; after: number | null };
}

const sameAccount = (a: CreditAccount, b: CreditAccount) => a.creditor === b.creditor && a.accountMask === b.accountMask && (a.opened ?? "") === (b.opened ?? "");

export function diffReports(before: CreditReport, after: CreditReport): CreditDiff {
  const match = (a: CreditAccount, list: CreditAccount[]) => list.find((b) => sameAccount(a, b));
  const d: CreditDiff = { newAccounts: [], gone: [], closed: [], reopened: [], balanceChanges: [], newAdverse: [], clearedAdverse: [], newInquiries: [], utilization: { before: before.summary.utilization, after: after.summary.utilization } };
  for (const a of after.accounts) {
    const b = match(a, before.accounts);
    if (!b) { d.newAccounts.push(a); continue; }
    if (b.status === "open" && a.status === "closed") d.closed.push(a);
    if (b.status === "closed" && a.status === "open") d.reopened.push(a);
    if ((a.balance ?? 0) !== (b.balance ?? 0)) d.balanceChanges.push({ before: b, after: a, delta: (a.balance ?? 0) - (b.balance ?? 0) });
    if (a.adverse && !b.adverse) d.newAdverse.push(a);
    if (!a.adverse && b.adverse) d.clearedAdverse.push(a);
  }
  for (const b of before.accounts) if (!match(b, after.accounts)) d.gone.push(b);
  const had = new Set(before.inquiries.flatMap((q) => q.dates.map((dt) => `${q.name}|${dt}`)));
  for (const q of after.inquiries) if (q.kind === "regular") for (const dt of q.dates) if (!had.has(`${q.name}|${dt}`)) d.newInquiries.push({ name: q.name, date: dt });
  return d;
}
