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

describe("recurring-bill detection", () => {
  it("finds a monthly merchant and ignores one-offs", async () => {
    const { detectRecurring, autoMarkPaid, suggestionToBill, merchantKey } = await import("./detect");
    const h = sampleHome(new Date(2026, 9, 27));
    const tx = [...h.transactions];
    for (const m of ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]) tx.push({ id: "n" + m, accountId: "chk", date: `${m}-14`, description: "NETFLIX.COM 8005851234", amount: 22.99, category: "subs" });
    tx.push({ id: "one", accountId: "chk", date: "2026-08-02", description: "Best Buy #1234", amount: 899, category: "wants" });
    const data = { ...h, transactions: tx, bills: h.bills.filter((b) => b.name !== "Xfinity") };
    const s = detectRecurring(data, new Date(2026, 9, 27));
    const nf = s.find((x) => x.key === merchantKey("NETFLIX.COM 8005851234"));
    expect(nf).toBeTruthy();
    expect(nf!.cadence).toBe("monthly");
    expect(nf!.dueDay).toBe(14);
    expect(nf!.amount).toBeCloseTo(22.99);
    expect(s.find((x) => x.name.includes("Best Buy"))).toBeUndefined();
    // Confirm it, then payments are marked retroactively
    const bill = suggestionToBill(nf!, "bill-nf");
    const withBill = { ...data, bills: [...data.bills, bill] };
    const paid = autoMarkPaid(withBill);
    expect(paid.filter((p) => p.billId === "bill-nf").map((p) => p.month).sort()).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    // Dismissed keys are not suggested again
    const dismissed = { ...data, settings: { ...data.settings, dismissedSuggestions: [nf!.key] } };
    expect(detectRecurring(dismissed, new Date(2026, 9, 27)).find((x) => x.key === nf!.key)).toBeUndefined();
  });
});

describe("income detection", () => {
  it("spots a semi-monthly paycheck", async () => {
    const { detectIncome } = await import("./detect");
    const h = sampleHome(new Date(2026, 9, 27));
    const income = [] as NonNullable<typeof h.income>;
    for (const m of ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]) { income.push({ id: "a" + m, date: `${m}-01`, amount: 3200, source: "DAYSTAR MINISTRIES PAYROLL" }); income.push({ id: "b" + m, date: `${m}-16`, amount: 3200, source: "DAYSTAR MINISTRIES PAYROLL" }); }
    income.push({ id: "gift", date: "2026-08-20", amount: 500, source: "Zelle from Mom" });
    const s = detectIncome({ ...h, income }, new Date(2026, 9, 27));
    expect(s).toHaveLength(1);
    expect(s[0].cadence).toBe("semimonthly");
    expect(s[0].payDays).toEqual([1, 16]);
    expect(s[0].monthly).toBe(6400);
  });
  it("spots biweekly pay", async () => {
    const { detectIncome } = await import("./detect");
    const h = sampleHome(new Date(2026, 9, 27));
    const income = [] as NonNullable<typeof h.income>;
    let d = new Date(2026, 4, 1);
    for (let i = 0; i < 12; i++) { income.push({ id: "p" + i, date: d.toISOString().slice(0, 10), amount: 1500, source: "ACME CORP DIRECT DEP" }); d = new Date(d.getTime() + 14 * 86400000); }
    const s = detectIncome({ ...h, income }, new Date(2026, 9, 27));
    expect(s[0].cadence).toBe("biweekly");
    expect(s[0].monthly).toBe(3250);
  });
});

describe("period options respect data range", () => {
  it("stops at the earliest month with data", async () => {
    const { periodOptions, earliestDataMonth } = await import("./insights");
    const h = sampleHome(new Date(2026, 9, 27));
    expect(earliestDataMonth(h)).toBe("2025-10");
    const months = periodOptions("month", new Date(2026, 9, 27), earliestDataMonth(h));
    expect(months[0].key).toBe("2026-10");
    expect(months[months.length - 1].key).toBe("2025-10");
    expect(months).toHaveLength(13);
    expect(periodOptions("year", new Date(2026, 9, 27), "2025-10").map((o) => o.key)).toEqual(["2026", "2025"]);
    expect(periodOptions("month", new Date(2026, 9, 27), null)).toHaveLength(1);
  });
});

describe("income sources: expected vs actual", () => {
  it("projection uses sources; deposits attach and count", async () => {
    const { expectedMonthlyIncome, expectedPayDays, matchIncomeEvents, receivedInMonth, suggestionToSource, detectIncome } = await import("./detect");
    const h = sampleHome(new Date(2026, 9, 27));
    const income = [] as NonNullable<typeof h.income>;
    for (const m of ["2026-07", "2026-08", "2026-09", "2026-10"]) { income.push({ id: "a" + m, date: `${m}-01`, amount: 3150, source: "DAYSTAR MINISTRIES PAYROLL" }); income.push({ id: "b" + m, date: `${m}-16`, amount: 3150, source: "DAYSTAR MINISTRIES PAYROLL" }); }
    income.push({ id: "z", date: "2026-10-20", amount: 250, source: "Zelle from Mom" });
    let data = { ...h, income, incomeSources: [] as NonNullable<typeof h.incomeSources> };
    expect(expectedMonthlyIncome(data)).toBe(6400); // falls back to settings
    const sg = detectIncome(data, new Date(2026, 9, 27))[0];
    data = { ...data, incomeSources: [suggestionToSource({ ...sg, perPaycheck: 3200 }, "s1", "paycheck")] };
    expect(expectedMonthlyIncome(data)).toBe(6400);
    expect(expectedPayDays(data)).toEqual([1, 16]);
    const matched = matchIncomeEvents(data)!;
    expect(matched.filter((e) => e.sourceId === "s1")).toHaveLength(8);
    data = { ...data, income: matched };
    expect(receivedInMonth(data, "2026-10")).toBe(6300); // actual, not projected
    data = { ...data, income: data.income.map((e) => (e.id === "z" ? { ...e, status: "counted" as const } : e)) };
    expect(receivedInMonth(data, "2026-10")).toBe(6550);
    expect(detectIncome(data, new Date(2026, 9, 27))).toHaveLength(0); // known source not re-suggested
  });
});

describe("budget recommendations", () => {
  it("averages last quarter and rounds; falls back to default", async () => {
    const { recommendBudgets, previousQuarterMonths, applyRecommendations } = await import("./detect");
    expect(previousQuarterMonths(new Date(2026, 9, 27))).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(previousQuarterMonths(new Date(2026, 1, 1))).toEqual(["2025-10", "2025-11", "2025-12"]);
    const h = sampleHome(new Date(2026, 9, 27));
    const tx = [...h.transactions,
      { id: "g1", date: "2026-07-05", description: "Publix", amount: 610, category: "groceries" },
      { id: "g2", date: "2026-08-05", description: "Publix", amount: 690, category: "groceries" },
      { id: "g3", date: "2026-09-05", description: "Publix", amount: 650, category: "groceries" }];
    const budgets = h.budgets.map((b) => (b.id === "subs" ? { ...b, defaultLimit: 60 } : b));
    const data = { ...h, transactions: tx, budgets, payments: h.payments.filter((p) => p.month === "2026-10") };
    const recs = recommendBudgets(data, new Date(2026, 9, 27));
    const g = recs.find((r) => r.categoryId === "groceries")!;
    expect(g.basis).toBe("quarter"); expect(g.monthsWithData).toBe(3); expect(g.recommended).toBe(650); // avg 650 is on the $25 step
    const subs = recs.find((r) => r.categoryId === "subs")!;
    expect(subs.basis).toBe("default"); expect(subs.recommended).toBe(60);
    const applied = applyRecommendations(data, recs, ["groceries"]);
    expect(applied.budgets.find((b) => b.id === "groceries")!.limit).toBe(650);
    expect(applied.budgets.find((b) => b.id === "subs")!.limit).toBe(120);
  });
});

describe("year plan", () => {
  it("projects 12 months with landmarks and a running pocket", async () => {
    const { buildYearPlan } = await import("./yearplan");
    const h = sampleHome(new Date(2026, 9, 27));
    const data = { ...h, landmarks: [{ id: "l1", name: "Family trip", month: "2027-06", amount: 2500 }, { id: "l2", name: "Tax refund", month: "2027-03", amount: -1200 }, { id: "old", name: "last year", month: "2026-05", amount: 999 }] };
    const yp = buildYearPlan(data, 2027, new Date(2026, 9, 27));
    expect(yp.months).toHaveLength(12);
    expect(yp.totals.landmarkCount).toBe(2);
    expect(yp.totals.landmarks).toBe(1300);
    expect(yp.months[5].landmarkTotal).toBe(2500);
    expect(yp.months[11].cumulative).toBeCloseTo(yp.months.reduce((s, m) => s + m.net, 0), 6);
    expect(yp.totals.pocketEnd).toBeCloseTo(yp.startBalance + yp.totals.net, 6);
    expect(yp.totals.debtEnd).toBeLessThan(yp.totals.debtStart);
    expect(yp.months[0].income).toBe(6400);
  });
});
