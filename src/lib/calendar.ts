import { addDays, startOfWeek } from "date-fns";
import type { CalendarItem, Course, HomeData, MealSlot } from "./types";

export const COURSES: Course[] = ["main", "side", "meat", "veggie", "dessert", "drink"];
export const COURSE_LABEL: Record<Course, string> = { main: "Main dish", side: "Sides", meat: "Meats", veggie: "Veggies", dessert: "Desserts", drink: "Drinks" };
export const COURSE_SINGULAR: Record<Course, string> = { main: "main", side: "side", meat: "meat", veggie: "veggie", dessert: "dessert", drink: "drink" };

/** "Tacos · sides: rice, beans · meats: ground beef · desserts: churros" */
export function describeMeal(data: HomeData, item: CalendarItem): { main: string; parts: { course: Course; names: string[] }[] } {
  const name = (id: string) => (data.dishes ?? []).find((d) => d.id === id)?.name ?? "?";
  const parts = COURSES.filter((c) => c !== "main").map((course) => ({ course, names: (item.components ?? []).filter((x) => x.course === course).map((x) => name(x.dishId)) })).filter((p) => p.names.length);
  return { main: item.title, parts };
}

export const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
export const SLOT_LABEL: Record<MealSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseYmd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

/** The 7 days (Sun–Sat) of the week containing `d`, offset by `weeks`. */
export const weekDays = (d: Date, weeks = 0) => { const start = addDays(startOfWeek(d, { weekStartsOn: 0 }), weeks * 7); return Array.from({ length: 7 }, (_, i) => addDays(start, i)); };

export const itemsOn = (data: HomeData, date: string) => (data.calendar ?? []).filter((c) => c.date === date);
export const mealAt = (data: HomeData, date: string, slot: MealSlot) => itemsOn(data, date).find((c) => c.kind === "meal" && c.slot === slot);

/** Copy one week's items to another week (same weekday), skipping slots already filled. */
export function copyWeek(data: HomeData, from: Date[], to: Date[], newId: () => string): CalendarItem[] {
  const out: CalendarItem[] = [];
  from.forEach((src, i) => {
    const dst = ymd(to[i]);
    for (const it of itemsOn(data, ymd(src))) {
      const exists = it.kind === "meal" ? !!mealAt(data, dst, it.slot!) : itemsOn(data, dst).some((x) => x.kind === it.kind && x.title === it.title);
      if (!exists) out.push({ ...it, id: newId(), date: dst, done: false });
    }
  });
  return out;
}

/** How many times each dish was planned in the last N days — for "haven't had in a while" nudges. */
export function dishFrequency(data: HomeData, today: Date, days = 28): Record<string, number> {
  const since = ymd(addDays(today, -days));
  const f: Record<string, number> = {};
  for (const c of data.calendar ?? []) if (c.kind === "meal" && c.dishId && c.date >= since && c.date <= ymd(today)) f[c.dishId] = (f[c.dishId] ?? 0) + 1;
  return f;
}

/* ------------------------------ Grocery list ------------------------------ */

export interface GroceryLine { key: string; name: string; dishes: string[]; checked: boolean; custom?: boolean }

/** Roll up ingredients for every meal planned in `days` (mains + all components), deduped, with the dishes that need each. */
export function groceryFor(data: HomeData, days: Date[], normalize: (s: string) => string): GroceryLine[] {
  const weekKey = ymd(days[0]);
  const state = data.grocery?.[weekKey] ?? { checked: [], extras: [] };
  const checked = new Set(state.checked);
  const map = new Map<string, { name: string; dishes: Set<string> }>();
  const dish = (id?: string) => (data.dishes ?? []).find((d) => d.id === id);
  for (const day of days) for (const it of itemsOn(data, ymd(day))) {
    if (it.kind !== "meal") continue;
    const parts = [dish(it.dishId), ...(it.components ?? []).map((c) => dish(c.dishId))];
    for (const d of parts) for (const ing of d?.ingredients ?? []) {
      const k = normalize(ing); if (!k) continue;
      const e = map.get(k) ?? map.set(k, { name: ing, dishes: new Set() }).get(k)!;
      e.dishes.add(d!.name);
    }
  }
  const lines: GroceryLine[] = [...map.entries()].map(([key, v]) => ({ key, name: v.name, dishes: [...v.dishes], checked: checked.has(key) }));
  for (const x of state.extras) { const k = "extra:" + normalize(x); lines.push({ key: k, name: x, dishes: [], checked: checked.has(k), custom: true }); }
  return lines.sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name));
}
