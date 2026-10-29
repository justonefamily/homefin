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
