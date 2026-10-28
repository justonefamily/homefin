import { describe, expect, it } from "vitest";
import { emptyHome } from "./types";
import { actualsForMonth } from "./actuals";
import { weeklyProjection } from "./projections";
import { buildYearPlan } from "./yearplan";

const home = () => {
  const h = emptyHome();
  h.pay = { monthlyIncome: 8000, payDays: [1, 16], splitDay: 15 };
  h.settings.everydaySpend = 1200;
  h.accounts = [{ id: "chk", name: "Checking", institution: "Bank", kind: "checking", balance: 5000, source: "manual" }];
  h.bills = [{ id: "b1", name: "Rent", amount: 2000, dueDay: 1, category: "housing", autopay: true, cadence: "monthly", merchant: "rent co" }];
  h.income = [
    { id: "i1", date: "2026-10-01", amount: 3100, source: "ACME PAYROLL", status: "counted", accountId: "chk" },
    { id: "i2", date: "2026-10-16", amount: 2900, source: "ACME PAYROLL", status: "counted", accountId: "chk" },
    { id: "i3", date: "2026-10-10", amount: 300, source: "Zelle", status: "ignored", internal: true, accountId: "chk" },
  ];
  h.transactions = [
    { id: "t1", accountId: "chk", date: "2026-10-01", description: "Rent Co", amount: 2000, category: "housing" },
    { id: "t2", accountId: "chk", date: "2026-10-05", description: "Publix", amount: 150, category: "groceries" },
    { id: "t3", accountId: "chk", date: "2026-10-12", description: "Card payment", amount: 400, category: "other", transfer: true },
  ];
  return h;
};

describe("actuals", () => {
  it("counts real deposits and spending, skips transfers and ignored", () => {
    const a = actualsForMonth(home(), "2026-10");
    expect(a).toMatchObject({ income: 6000, bills: 2000, spend: 150, hasData: true });
  });
  it("weekly view uses actuals for days that passed and the plan after", () => {
    const weeks = weeklyProjection(home(), new Date(2026, 9, 20));
    expect(weeks[0].income).toBe(3100);          // Oct 1–3 actual
    expect(weeks[1].income).toBe(0);             // Oct 4–10: nothing landed
    expect(weeks[3].income).toBe(0);             // Oct 18–24 ahead: no pay day → 0
    expect(weeks[0].bills).toBe(2000);
    expect(Math.round(weeks[1].everyday)).toBe(150);
  });
  it("year plan marks past months actual and this month blended", () => {
    const yp = buildYearPlan(home(), 2026, new Date(2026, 9, 20));
    expect(yp.months[9].source).toBe("blend");
    expect(yp.months[10].source).toBe("plan");
    expect(yp.months[9].income).toBeGreaterThan(6000); // actual so far + plan for the rest
    expect(yp.months[0].source).toBe("plan"); // no data in Jan → plan
  });
});
