import { it, expect } from "vitest";
import { periodDefLabel, periodOfDay } from "./projections";
import { emptyHome } from "./types";
it("assigns days to pay periods that wrap the month line", () => {
  const h = emptyHome("t");
  h.pay.periodMode = "custom";
  h.pay.periods = [{ payDay: 15, from: 15, to: 29 }, { payDay: 30, from: 30, to: 14 }];
  expect(periodOfDay(h, 15)).toBe("a");
  expect(periodOfDay(h, 29)).toBe("a");
  expect(periodOfDay(h, 30)).toBe("b");
  expect(periodOfDay(h, 31)).toBe("b");
  expect(periodOfDay(h, 1)).toBe("b");
  expect(periodOfDay(h, 14)).toBe("b");
  expect(periodDefLabel({ from: 30, to: 14 })).toBe("30th – 14th");
  expect(periodDefLabel({ from: 1, to: 31 })).toBe("1st – end");
});

import { payMonthRange, periodDefsInMonthOrder } from "./projections";
it("money month runs from the wrapping period's start in the prior month", () => {
  const h = emptyHome("t");
  h.pay.periodMode = "custom";
  h.pay.periods = [{ payDay: 15, from: 15, to: 29 }, { payDay: 30, from: 30, to: 14 }];
  const r = payMonthRange(h, new Date(2026, 10, 1)); // November
  expect(r.from.toISOString().slice(0, 10)).toBe("2026-10-30");
  expect(r.to.toISOString().slice(0, 10)).toBe("2026-11-29");
  expect(periodDefsInMonthOrder(h)[0].from).toBe(30);
  const plain = emptyHome("p");
  expect(payMonthRange(plain, new Date(2026, 10, 1)).shifted).toBe(false);
});
