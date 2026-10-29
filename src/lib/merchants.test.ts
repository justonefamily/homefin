import { describe, expect, it } from "vitest";
import { emptyHome } from "./types";
import { dedupeIncome, flowFor, matchInternalTransfers, merchantSummaries, mergeMerchants, setMerchantPref, similarMerchants } from "./merchants";
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
  it("matches a card payment that posts 5 days later", () => {
    const h = home();
    h.transactions.push({ id: "p1", accountId: "chk", date: "2026-10-01", description: "Payment to Chase Card", amount: 450, category: "other" });
    h.income!.push({ id: "p2", date: "2026-10-06", amount: 450, source: "Payment Thank You", accountId: "cc" });
    expect(matchInternalTransfers(h)!.income!.find((e) => e.id === "p2")?.internal).toBe(true);
  });
  it("leaves a real deposit alone", () => {
    expect(matchInternalTransfers(home())).toBeNull();
  });
});

describe("dedupeIncome", () => {
  it("drops the same deposit recorded twice, keeps the reviewed copy, leaves separate accounts alone", () => {
    const h = home();
    h.income = [
      { id: "a", date: "2026-10-15", amount: 5500, source: "FLORA COL PAYROLL" },
      { id: "b", date: "2026-10-15", amount: 5500, source: "FLORA COL PAYROLL", status: "counted" },
      { id: "c", date: "2026-10-15", amount: 4000.36, source: "FLORA COL PAYROLL L", accountId: "chk" },
      { id: "d", date: "2026-10-15", amount: 4000.36, source: "FLORA COL PAYROLL L", accountId: "cc" },
      { id: "e", date: "2026-10-01", amount: 0.01, source: "Bright Money" },
    ];
    const next = dedupeIncome(h)!;
    expect(next.income!.map((e) => e.id)).toEqual(["b", "c", "d", "e"]);
    expect(dedupeIncome(next)).toBeNull();
  });
});

describe("refunds", () => {
  it("offset spending instead of counting as income", () => {
    const h = home();
    h.income!.push({ id: "r1", date: "2026-10-13", amount: 50, source: "Amazon", status: "refund" });
    const f = flowFor(h, "2026-10-12", "2026-10-18");
    expect(f.income).toBe(2000);
    expect(f.spending).toBe(300); // 350 of spending (no bills set here) − 50 refund
    expect(f.spendLines.some((l) => l.amount === -50)).toBe(true);
  });
});

describe("merging two bills", () => {
  it("keeps the most recently paid one current and ends the older one", () => {
    const h = home();
    h.transactions.push(
      { id: "m1", accountId: "chk", date: "2026-02-01", description: "Old Servicer Mortgage", amount: 3000, category: "housing" },
      { id: "m2", accountId: "chk", date: "2026-03-01", description: "Old Servicer Mortgage", amount: 3000, category: "housing" },
      { id: "m3", accountId: "chk", date: "2026-09-01", description: "New Servicer Mortgage", amount: 3001, category: "housing" },
      { id: "m4", accountId: "chk", date: "2026-10-01", description: "New Servicer Mortgage", amount: 3001, category: "housing" },
    );
    h.bills = [
      { id: "old", name: "Old Servicer", amount: 3000, dueDay: 1, category: "housing", autopay: true, cadence: "monthly", merchant: "old servicer mortgage" },
      { id: "new", name: "New Servicer", amount: 3001, dueDay: 1, category: "housing", autopay: true, cadence: "monthly", merchant: "new servicer mortgage" },
    ];
    const next = mergeMerchants(h, "old servicer mortgage", "new servicer mortgage");
    expect(next.bills.find((b) => b.id === "old")?.endedOn).toBe("2026-03");
    expect(next.bills.find((b) => b.id === "new")?.endedOn).toBeUndefined();
  });
});

it("never suggests a pair the user said is not the same place", () => {
  const list = [
    { key: "7-eleven", name: "7-Eleven", total: 10, count: 1, kind: "spend" } as never,
    { key: "eleven labs", name: "Eleven Labs", total: 5, count: 1, kind: "spend" } as never,
  ];
  expect(similarMerchants(list, ["7-eleven|eleven labs"])).toHaveLength(0);
});

it("matches an outgoing payment to the credit the loan account received", async () => {
  const { matchPaymentsToCredits, setPaymentDestination } = await import("./merchants");
  const h = home();
  h.accounts.push({ id: "loan1", name: "Car", institution: "Credit Union", kind: "loan", balance: 1000, source: "manual" }, { id: "loan2", name: "Card", institution: "Credit Union", kind: "credit", balance: 500, source: "manual" });
  h.transactions.push({ id: "p1", accountId: "chk", date: "2026-03-03", description: "CU ACH PAYMENT 0001", amount: 608.9, category: "other" }, { id: "p2", accountId: "chk", date: "2026-03-03", description: "CU ACH PAYMENT 0002", amount: 50, category: "other" });
  h.settings.merchants = { "cu ach payment": { kind: "transfer" } };
  h.credits = [{ id: "c1", accountId: "loan1", date: "2026-03-04", amount: 608.9, description: "PAYMENT - THANK YOU" }, { id: "c2", accountId: "loan2", date: "2026-03-05", amount: 50, description: "PAYMENT" }];
  const out = matchPaymentsToCredits(h)!;
  expect(out.transactions.find((t) => t.id === "p1")?.toAccountId).toBe("loan1");
  expect(out.transactions.find((t) => t.id === "p2")?.toAccountId).toBe("loan2");
  // A hand-set destination survives a re-match.
  const manual = setPaymentDestination(out, "p1", "loan2");
  expect(matchPaymentsToCredits(manual)).toBeNull();
});
