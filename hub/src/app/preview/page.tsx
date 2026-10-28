"use client";
import { AppTile } from "@/components/AppTile";
import type { HubApp } from "@/lib/types";
/** Design preview with sample apps — no login. Remove before launch or leave; it's harmless. */
const S: HubApp[] = [
  { id: "1", slug: "homefin", name: "HomeFin", tagline: "Bills, budget, debt payoff & the home calendar", description: "Every account in one place: what came in, what went out, what's due, the plan to be debt-free, and the week's meals and groceries.", url: "#", icon: "💸", color: "#0e6b74", status: "live", sort: 1 },
  { id: "2", slug: "recipes", name: "Family Recipes", tagline: "The dishes we actually make", description: "", url: "#", icon: "🍲", color: "#b45309", status: "beta", sort: 2 },
  { id: "3", slug: "chores", name: "Chores", tagline: "Who's on what this week", description: "", url: "#", icon: "🧹", color: "#1e7a3c", status: "soon", sort: 3 },
];
export default function Preview() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 flex flex-col gap-6">
      <div><div className="text-[13px] text-muted">Good morning, Abraham.</div><h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-1">Our apps</h1><div className="text-sm text-muted mt-1">Everything we&apos;ve built for the family, one login for all of it.</div></div>
      <div className="flex flex-col gap-3"><AppTile app={S[0]} large /><div className="grid sm:grid-cols-2 gap-3"><AppTile app={S[1]} /></div></div>
      <div className="flex flex-col gap-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">In the works</div><div className="grid sm:grid-cols-2 gap-3"><AppTile app={S[2]} /></div></div>
    </div>
  );
}
