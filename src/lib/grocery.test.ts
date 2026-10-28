import { describe, expect, it } from "vitest";
import { guessDish, normalizeIngredient, parseDishList } from "./ingredients";
import { groceryFor, weekDays, ymd } from "./calendar";
import { emptyHome } from "./types";

describe("dish import", () => {
  it("parses lines, commas and bullets", () => {
    expect(parseDishList("- Tacos\n2. Jerk chicken, Rice and peas\n\n• Brownies")).toEqual(["Tacos", "Jerk chicken", "Rice and peas", "Brownies"]);
  });
  it("guesses tacos", () => {
    const g = guessDish("Beef Tacos");
    expect(g.course).toBe("main");
    expect(g.ingredients).toContain("tortillas");
    expect(g.ingredients).toContain("onion");
  });
  it("normalizes ingredients for dedupe", () => {
    expect(normalizeIngredient("Onions")).toBe("onion");
    expect(normalizeIngredient("2 cups rice")).toBe("rice");
    expect(normalizeIngredient("tomatoes")).toBe("tomato");
  });
});

describe("grocery rollup", () => {
  it("dedupes across dishes and keeps checks per week", () => {
    const h = emptyHome();
    const days = weekDays(new Date(2027, 0, 5), 0);
    h.dishes = [
      { id: "t", name: "Tacos", course: "main", ingredients: ["tortillas", "onion", "tomato"] },
      { id: "s", name: "Salsa", course: "side", ingredients: ["Onions", "tomatoes", "cilantro"] },
    ];
    h.calendar = [{ id: "m", date: ymd(days[1]), kind: "meal", slot: "dinner", dishId: "t", components: [{ course: "side", dishId: "s" }], title: "Tacos" }];
    h.grocery = { [ymd(days[0])]: { checked: ["onion"], extras: ["paper towels"] } };
    const lines = groceryFor(h, days, normalizeIngredient);
    expect(lines.map((l) => l.key).sort()).toEqual(["cilantro", "extra:paper towel", "onion", "tomato", "tortilla"]);
    expect(lines.find((l) => l.key === "onion")).toMatchObject({ checked: true, dishes: ["Tacos", "Salsa"] });
    expect(lines.find((l) => l.custom)?.name).toBe("paper towels");
  });
});
