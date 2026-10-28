import { describe, expect, it } from "vitest";
import { emptyHome } from "./types";
import { billsInRange, currentPeriodRange, periodRangeFor, shiftPeriod } from "./projections";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("pay periods anchored to paydays", () => {
  const h = emptyHome();
  h.pay = { monthlyIncome: 8000, payDays: [15, 30], splitDay: 15, periodMode: "paydays" };
  h.bills = [{ id: "b1", name: "Rent", amount: 2000, dueDay: 1, category: "housing", autopay: true, cadence: "monthly" }, { id: "b2", name: "Car", amount: 400, dueDay: 20, category: "transport", autopay: true, cadence: "monthly" }];

  it("15th → 29th, then 30th → 14th of next month", () => {
    const a = periodRangeFor(h, new Date(2026, 9, 1), "a");
    expect([ymd(a.from), ymd(a.to)]).toEqual(["2026-10-15", "2026-10-29"]);
    const b = periodRangeFor(h, new Date(2026, 9, 1), "b");
    expect([ymd(b.from), ymd(b.to)]).toEqual(["2026-10-30", "2026-11-14"]);
    expect(b.label).toBe("Oct 30 – Nov 14");
  });
  it("finds the period today sits in, including early-month days that belong to last month's second period", () => {
    expect(currentPeriodRange(h, new Date(2026, 10, 5)).label).toBe("Oct 30 – Nov 14");
    expect(currentPeriodRange(h, new Date(2026, 9, 20)).label).toBe("Oct 15 – 29");
    expect(currentPeriodRange(h, new Date(2026, 9, 31)).label).toBe("Oct 30 – Nov 14");
  });
  it("steps forward and back", () => {
    const cur = currentPeriodRange(h, new Date(2026, 9, 20));
    expect(shiftPeriod(h, cur, 1).label).toBe("Oct 30 – Nov 14");
    expect(shiftPeriod(h, cur, 2).label).toBe("Nov 15 – 29");
    expect(shiftPeriod(h, cur, -1).label).toBe("Sep 30 – Oct 14");
  });
  it("bills in a period that crosses the month line", () => {
    const b = periodRangeFor(h, new Date(2026, 9, 1), "b");
    const names = billsInRange(h, b, new Date(2026, 10, 5)).map((s) => `${s.bill.name} ${ymd(s.dueDate)}`);
    expect(names).toEqual(["Rent 2026-11-01"]);
  });
  it("halves mode still means 1–15 / 16–end", () => {
    const g = emptyHome(); g.pay = { monthlyIncome: 1, payDays: [1, 16], splitDay: 15 };
    expect(periodRangeFor(g, new Date(2026, 9, 1), "a").label).toBe("Oct 1 – 15");
    expect(periodRangeFor(g, new Date(2026, 9, 1), "b").label).toBe("Oct 16 – 31");
    expect(currentPeriodRange(g, new Date(2026, 9, 3)).label).toBe("Oct 1 – 15");
  });
  it("February clamps the 30th", () => {
    expect(periodRangeFor(h, new Date(2026, 1, 1), "b").label).toBe("Feb 28 – Mar 14");
  });
});

describe("periods touching a month", () => {
  it("October with 15/30 paydays: Sep 30 – Oct 14, Oct 15 – 29, Oct 30 – Nov 14", async () => {
    const { periodsTouching } = await import("./projections");
    const h = emptyHome(); h.pay = { monthlyIncome: 1, payDays: [15, 30], splitDay: 15, periodMode: "paydays" };
    expect(periodsTouching(h, new Date(2026, 9, 28)).map((r) => r.label)).toEqual(["Sep 30 – Oct 14", "Oct 15 – 29", "Oct 30 – Nov 14"]);
    const g = emptyHome(); g.pay = { monthlyIncome: 1, payDays: [1, 16], splitDay: 15 };
    expect(periodsTouching(g, new Date(2026, 9, 28)).map((r) => r.label)).toEqual(["Oct 1 – 15", "Oct 16 – 31"]);
  });
});

describe("custom paycheck ranges", () => {
  it("uses the exact days typed, wrapping into next month when 'through' is before 'from'", () => {
    const h = emptyHome();
    h.pay = { monthlyIncome: 1, payDays: [15, 30], splitDay: 15, periodMode: "custom", periods: [{ payDay: 15, from: 15, to: 29 }, { payDay: 30, from: 30, to: 14 }] };
    expect(periodRangeFor(h, new Date(2026, 9, 1), "a").label).toBe("Oct 15 – 29");
    expect(periodRangeFor(h, new Date(2026, 9, 1), "b").label).toBe("Oct 30 – Nov 14");
    expect(currentPeriodRange(h, new Date(2026, 10, 3)).label).toBe("Oct 30 – Nov 14");
    const one = emptyHome(); one.pay = { monthlyIncome: 1, payDays: [25], splitDay: 15, periodMode: "custom", periods: [{ payDay: 25, from: 25, to: 24 }] };
    expect(periodRangeFor(one, new Date(2026, 9, 1), "a").label).toBe("Oct 25 – Nov 24");
  });
});
