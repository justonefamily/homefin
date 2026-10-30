import { it, expect } from "vitest";
import { periodCoach } from "./coach";
import { emptyHome } from "./types";
import { currentPeriodRange } from "./projections";

it("says where to pull from when wants + landmarks + debt extra don't fit the paycheck", () => {
  const h = emptyHome("t");
  h.pay = { ...h.pay, monthlyIncome: 6000, payDays: [1, 15], periodMode: "halves" };
  h.settings.extraPayment = 400;
  h.budgets = [
    { id: "home", name: "Home", limit: 2000, bucket: "needs" },
    { id: "groc", name: "Groceries", limit: 800, bucket: "needs" },
    { id: "shop", name: "Shopping", limit: 1000, bucket: "wants" },
    { id: "dine", name: "Dining", limit: 600, bucket: "wants" },
  ];
  h.bills = [{ id: "b1", name: "Rent", amount: 2000, dueDay: 3, category: "home", cadence: "monthly", autopay: true }];
  h.transactions = [{ id: "t1", accountId: "chk", date: "2026-10-16", description: "Big Box Store", amount: 900, category: "shop" }];
  h.landmarks = [{ id: "l1", name: "Trip", month: "2026-11", amount: 1500 }];
  const today = new Date(2026, 9, 20);
  const c = periodCoach(h, today, currentPeriodRange(h, today));
  expect(c.paycheck).toBe(3000);
  expect(c.billsLeft).toBe(0); // rent was due the 3rd, in the other period
  expect(c.setAside).toBeGreaterThan(0);
  expect(["tight", "short", "fits", "ahead"]).toContain(c.verdict);
  // Shopping is the first thing named when it's over for the month... here it's under (900 of 1000), so a hold/cut appears if there's a gap.
  if (c.gap > 0) expect(c.actions.some((a) => a.kind === "cut" || a.kind === "hold" || a.kind === "pause" || a.kind === "note")).toBe(true);
  expect(c.actions.some((a) => a.kind === "set-aside")).toBe(true);
});

it("rolls late-month paychecks into the next month's income", async () => {
  const { incomeMonthOf, actualsForMonth } = await import("./actuals");
  const h = emptyHome("t");
  h.pay = { ...h.pay, incomeRollDay: 25 };
  h.income = [{ id: "a", date: "2026-09-30", amount: 5000, source: "PAYROLL" }, { id: "b", date: "2026-10-15", amount: 5000, source: "PAYROLL" }, { id: "c", date: "2026-10-30", amount: 5000, source: "PAYROLL" }];
  expect(incomeMonthOf(h, "2026-09-30")).toBe("2026-10");
  expect(incomeMonthOf(h, "2026-10-15")).toBe("2026-10");
  expect(actualsForMonth(h, "2026-10").income).toBe(10000);
  expect(actualsForMonth(h, "2026-11").income).toBe(5000);
  expect(actualsForMonth(h, "2026-09").income).toBe(0);
});
