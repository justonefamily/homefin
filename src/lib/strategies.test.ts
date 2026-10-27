import { describe, expect, it } from "vitest";
import { babySteps, budgetRows, debtsFromAccounts, orderDebts, simulatePayoff, splitRows } from "./strategies";
import { weeklyProjection, yearProjection, billStatuses, inPeriod } from "./projections";
import { sampleHome } from "./sample-data";

const home = sampleHome(new Date(2026, 9, 27));
const debts = debtsFromAccounts(home.accounts);

describe("debt ordering", () => {
  it("snowball = smallest balance first", () => {
    expect(orderDebts(debts, "snowball").map((d) => d.id)).toEqual(["store", "cs", "auto", "stu"]);
  });
  it("avalanche = highest APR first", () => {
    expect(orderDebts(debts, "avalanche").map((d) => d.id)).toEqual(["store", "cs", "auto", "stu"].sort((a, b) => (b === "store" ? 1 : 0) - (a === "store" ? 1 : 0)) && ["store", "cs", "auto", "stu"]);
    expect(orderDebts(debts, "avalanche")[0].apr).toBe(27.9);
  });
});

describe("simulatePayoff", () => {
  it("pays everything off and avalanche costs less interest than snowball", () => {
    const s = simulatePayoff(debts, "snowball", 500);
    const a = simulatePayoff(debts, "avalanche", 500);
    expect(s.months).toBeGreaterThan(0);
    expect(s.order.every((d) => d.paidOffMonth > 0)).toBe(true);
    expect(s.order[0].paidOffMonth).toBeLessThanOrEqual(s.order[1].paidOffMonth);
    expect(a.totalInterest).toBeLessThanOrEqual(s.totalInterest + 1);
    expect(s.curve.at(-1)).toBeCloseTo(0, 1);
  });
  it("more extra payment = faster", () => {
    expect(simulatePayoff(debts, "snowball", 1000).months).toBeLessThan(simulatePayoff(debts, "snowball", 0).months);
  });
  it("handles no debts", () => {
    expect(simulatePayoff([], "snowball", 500).months).toBe(0);
  });
});

describe("baby steps", () => {
  it("step 1 is current at 60%", () => {
    const steps = babySteps(home);
    expect(steps[0].status).toBe("current");
    expect(steps[0].progress).toBeCloseTo(0.6);
    expect(steps.filter((s) => s.status === "current")).toHaveLength(1);
  });
});

describe("splits", () => {
  it("6 cans: 50% necessities and 10% give, totals 100", () => {
    const rows = splitRows(home, "sixcans", "2026-10");
    expect(rows.find((r) => r.id === "necessities")!.pct).toBe(50);
    expect(rows.find((r) => r.id === "give")!.pct).toBe(10);
    expect(rows.reduce((s, r) => s + r.pct, 0)).toBe(100);
    expect(rows.find((r) => r.id === "necessities")!.target).toBe(3200);
  });
  it("50/30/20 totals 100", () => {
    expect(splitRows(home, "503020", "2026-10").reduce((s, r) => s + r.pct, 0)).toBe(100);
  });
});

describe("budget", () => {
  it("flags dining as over budget", () => {
    const rows = budgetRows(home, "2026-10", 27, 31);
    expect(rows.find((r) => r.id === "dining")!.state).toBe("over");
    expect(rows.find((r) => r.id === "housing")!.spent).toBe(1850);
  });
});

describe("projections", () => {
  const today = new Date(2026, 9, 27);
  it("pay periods split at the 15th", () => {
    expect(inPeriod(15, "a", 15)).toBe(true);
    expect(inPeriod(16, "a", 15)).toBe(false);
    expect(inPeriod(16, "b", 15)).toBe(true);
  });
  it("weekly projection covers the month and is continuous", () => {
    const w = weeklyProjection(home, today);
    expect(w[0].start.getDate()).toBe(1);
    expect(w.at(-1)!.end.getDate()).toBe(31);
    for (let i = 1; i < w.length; i++) expect(w[i].startBalance).toBeCloseTo(w[i - 1].endBalance, 6);
    expect(w.filter((x) => x.state === "current")).toHaveLength(1);
    // income over the month equals monthly income
    expect(w.reduce((s, x) => s + x.income, 0)).toBeCloseTo(6400);
  });
  it("year projection has 12 months, future ones use the bill template", () => {
    const y = yearProjection(home, today);
    expect(y).toHaveLength(12);
    expect(y[10].state).toBe("future");
    expect(y[10].bills).toBe(home.bills.reduce((s, b) => s + b.amount, 0));
  });
  it("bill statuses mark paid/overdue", () => {
    const st = billStatuses(home, today);
    expect(st.find((s) => s.bill.id === "b1")!.paid).toBe(true);
    expect(st.find((s) => s.bill.id === "b6")!.overdue).toBe(true); // due 22nd, unpaid
    expect(st.find((s) => s.bill.id === "b8")!.overdue).toBe(false); // due 28th
  });
});

describe("insights", () => {
  it("compares this month to the same month last year", async () => {
    const { compare, periodFor, sameTimeLastYear, monthsIn } = await import("./insights");
    const a = periodFor(new Date(2026, 9, 27), "month");
    const b = sameTimeLastYear(a);
    expect(b.key).toBe("2025-10");
    const c = compare(home, "spending", a, b);
    expect(c.bEmpty).toBe(false);
    expect(c.rows.find((r) => r.id === "groceries")!.a).toBe(640);
    expect(c.rows.find((r) => r.id === "groceries")!.b).toBe(555);
    const debt = compare(home, "debt", a, b);
    expect(debt.totalA).toBe(900 + 4200 + 11800 + 18500 + 238400);
    expect(debt.totalB).toBeGreaterThan(debt.totalA);
    expect(monthsIn({ granularity: "quarter", key: "2026-Q4" })).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(compare(home, "income", a, b).totalA).toBe(6400);
  });
});
