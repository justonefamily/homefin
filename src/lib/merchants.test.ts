import { describe, expect, it } from "vitest";
import { emptyHome } from "./types";
import { flowFor, matchInternalTransfers, merchantSummaries, mergeMerchants, setMerchantPref, similarMerchants } from "./merchants";
import { detectRecurring } from "./detect";

const home = () => {
  const h = emptyHome();
  h.budgets = [{ id: "utilities", name: "Utilities", limit: 300, bucket: "needs" }, { id: "groceries", name: "Groceries", limit: 600, bucket: "needs" }];
  h.accounts = [{ id: "chk", name: "Checking", institution: "Wells Fargo", kind: "checking", balance: 0, source: "manual" }, { id: "cc", name: "Visa", institution: "Chase", kind: "credit", balance: 0, source: "manual" }];
  h.transactions = [
    { id: "1", accountId: "chk", date: "2026-08-14", description: "Duke Energy", amount: 180, category: "utilities" },
    { id: "2", accountId: "chk", date: "2026-09-15", description: "Duke Energy", amount: 240, category: "utilities" },
    { id: "3", accountId: "chk", date: "2026-10-14", description: "Duke Energy", amount: 150, category: "utilities" },
    { id: "4", accountId: "cc", date: "2026-10-12", description: "Walmart Supercenter", amount: 120, category: "groceries" },
    { id: "5", accountId: "chk", date: "2026-10-13", description: "Wal-Mart Neighborhood", amount: 80, category: "groceries" },
    { id: "6", accountId: "chk", date: "2026-10-15", description: "Chase Credit Card Payment", amount: 500, category: "other", transfer: true },
  ];
  h.income = [{ id: "i1", date: "2026-10-15", amount: 2000, source: "ACME PAYROLL" }];
  return h;
};

describe("merchants", () => {
  it("sums across accounts and merges", () => {
    let h = home();
    expect(merchantSummaries(h).find((m) => m.key === "duke energy")).toMatchObject({ total: 570, count: 3, recurring: true, accountIds: ["chk"] });
    h = mergeMerchants(h, "wal mart neighborhood", "walmart supercenter");
    const w = merchantSummaries(h).find((m) => m.key === "walmart supercenter")!;
    expect(w.total).toBe(200);
    expect(w.accountIds.sort()).toEqual(["cc", "chk"]);
    expect(w.merged).toEqual(["wal mart neighborhood"]);
  });
  it("flags similar names", () => {
    const pairs = similarMerchants(merchantSummaries(home()));
    expect(pairs.length).toBe(0); // "walmart" vs "wal" first words differ; user merges by hand
  });
  it("wide-band detection catches a swinging utility", () => {
    expect(detectRecurring(home(), new Date(2026, 9, 28)).some((s) => s.key === "duke energy")).toBe(true);
  });
  it("flow splits income / bills / spending / transfers", () => {
    let h = home();
    h.bills = [{ id: "b1", name: "Duke Energy", amount: 190, dueDay: 14, category: "utilities", autopay: true, cadence: "monthly", merchant: "duke energy" }];
    const f = flowFor(h, "2026-10-12", "2026-10-18");
    expect(f.income).toBe(2000);
    expect(f.bills).toBe(150);
    expect(f.spending).toBe(200);
    expect(f.transfers).toBe(500);
    expect(f.net).toBe(1650);
    expect(f.byAccount.find((a) => a.accountId === "chk")?.out).toBe(230);
    h = setMerchantPref(h, "chase card", { kind: "spend" });
    expect(flowFor(h, "2026-10-12", "2026-10-18").spending).toBe(700);
  });
});

describe("internal transfers", () => {
  it("pairs a deposit with the matching outflow and ignores both", () => {
    const h = home();
    h.transactions.push({ id: "z1", accountId: "chk", date: "2026-10-20", description: "Zelle to Ledalis", amount: 300, category: "other" });
    h.income!.push({ id: "z2", date: "2026-10-21", amount: 300, source: "Zelle from Abraham", accountId: "chk" });
    const next = matchInternalTransfers(h)!;
    expect(next).not.toBeNull();
    expect(next.transactions.find((t) => t.id === "z1")?.transfer).toBe(true);
    expect(next.income!.find((e) => e.id === "z2")).toMatchObject({ status: "ignored", internal: true });
    const f = flowFor(next, "2026-10-19", "2026-10-22");
    expect(f.income).toBe(0); expect(f.spending).toBe(0); expect(f.transfers).toBe(300); expect(f.internalDeposits).toBe(1);
    expect(matchInternalTransfers(next)).toBeNull();
  });
  it("leaves a real deposit alone", () => {
    expect(matchInternalTransfers(home())).toBeNull();
  });
});
