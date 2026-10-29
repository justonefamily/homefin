import { it, expect } from "vitest";
import { ledgerEntries, ledgerTotals } from "./ledger";
import { emptyHome } from "./types";

it("lists money in and out with signs, counterparts and filters", () => {
  const h = emptyHome("t");
  h.accounts.push({ id: "chk", name: "Checking", institution: "Bank", kind: "checking", balance: 0, source: "manual" }, { id: "loan", name: "Car", institution: "CU", kind: "loan", balance: 100, source: "manual" });
  h.transactions.push({ id: "t1", accountId: "chk", date: "2026-03-03", description: "CU ACH PAYMENT 0001", amount: 300, category: "other", toAccountId: "loan" }, { id: "t2", accountId: "chk", date: "2026-03-04", description: "Corner Grocer", amount: 42, category: "groceries" });
  h.income = [{ id: "i1", accountId: "chk", date: "2026-03-01", amount: 1000, source: "ACME PAYROLL" }];
  h.credits = [{ id: "c1", accountId: "loan", date: "2026-03-04", amount: 300, description: "PAYMENT" }];
  const rows = ledgerEntries(h);
  expect(rows.map((r) => r.id)).toEqual(["c1", "t2", "t1", "i1"]);
  expect(rows.find((r) => r.id === "t1")?.counterpart).toBe("CU · Car");
  expect(rows.find((r) => r.id === "c1")?.counterpart).toBe("Bank · Checking");
  expect(rows.find((r) => r.id === "i1")?.amount).toBe(1000);
  expect(rows.find((r) => r.id === "t2")?.amount).toBe(-42);
  const chk = ledgerEntries(h, { accountId: "chk" });
  expect(chk).toHaveLength(3);
  expect(ledgerTotals(chk)).toEqual({ in: 1000, out: 342, net: 658 });
  expect(ledgerEntries(h, { direction: "in", q: "payroll" })).toHaveLength(1);
});
