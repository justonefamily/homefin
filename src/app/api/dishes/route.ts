import { NextResponse } from "next/server";
import { guessDish } from "@/lib/ingredients";
import type { Course } from "@/lib/types";

/**
 * POST { names: string[] } → { dishes: [{ name, course, ingredients, source }] }
 * Uses Claude when ANTHROPIC_API_KEY is set (any dish, any cuisine); otherwise the built-in list.
 */
export async function POST(req: Request) {
  const { names } = (await req.json()) as { names: string[] };
  const list = (names ?? []).map((n) => String(n).trim()).filter(Boolean).slice(0, 60);
  if (!list.length) return NextResponse.json({ dishes: [] });
  const fallback = list.map((name) => ({ name, ...guessDish(name), source: "builtin" as const }));

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ dishes: fallback, ai: false });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
        max_tokens: 4000,
        system: "You help a household plan meals. For each dish name, return its course and a practical grocery-list of typical ingredients (8–14 for a main, 1–6 for a side/veggie/meat/dessert/drink), as plain shopping items without quantities. Courses: main, side, meat, veggie, dessert, drink. Respect cuisines (e.g. Jamaican, Mexican, Southern US). Reply with JSON only: {\"dishes\":[{\"name\":\"...\",\"course\":\"main\",\"ingredients\":[\"...\"]}]}",
        messages: [{ role: "user", content: JSON.stringify({ dishes: list }) }],
      }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}`);
    const j = await r.json();
    const text: string = j.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "";
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { dishes: { name: string; course: Course; ingredients: string[] }[] };
    const valid = new Set<Course>(["main", "side", "meat", "veggie", "dessert", "drink"]);
    const dishes = list.map((name) => {
      const ai = parsed.dishes.find((d) => d.name.toLowerCase() === name.toLowerCase()) ?? parsed.dishes[list.indexOf(name)];
      if (!ai) return fallback[list.indexOf(name)];
      return { name, course: valid.has(ai.course) ? ai.course : guessDish(name).course, ingredients: (ai.ingredients ?? []).map(String).slice(0, 16), confident: true, source: "ai" as const };
    });
    return NextResponse.json({ dishes, ai: true });
  } catch (e) {
    console.warn("dishes ai", (e as Error).message);
    return NextResponse.json({ dishes: fallback, ai: false, error: (e as Error).message });
  }
}
