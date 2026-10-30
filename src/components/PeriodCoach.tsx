"use client";
import { useState } from "react";
import Link from "next/link";
import { Compass, ChevronRight, AlertTriangle, Pause, Scissors, Hand, PiggyBank, Flag, Info } from "lucide-react";
import { useHome } from "@/store/useHome";
import { Card, cx, money } from "./ui";
import { periodCoach, type CoachAction } from "@/lib/coach";
import type { PeriodRange } from "@/lib/projections";

const ICON: Record<CoachAction["kind"], typeof Compass> = { over: AlertTriangle, cut: Scissors, hold: Hand, pause: Pause, surplus: PiggyBank, "set-aside": Flag, note: Info };
const TONE: Record<CoachAction["kind"], string> = { over: "text-red bg-red/10", cut: "text-amber bg-amber-bg", hold: "text-amber bg-amber-bg", pause: "text-amber bg-amber-bg", surplus: "text-green bg-green/10", "set-aside": "text-accent bg-accent-bg", note: "text-muted bg-surface" };

/** "What can we do this period?" — the plan's verdict for the current pay period and the moves that make it fit. */
export function PeriodCoach({ today, period }: { today: Date; period: PeriodRange }) {
  const data = useHome((s) => s.data)!;
  const c = periodCoach(data, today, period);
  const [showMath, setShowMath] = useState(false);
  const headline = c.verdict === "ahead" ? `This period has ${money(c.room - c.wantsLeft)} more than the plan needs.`
    : c.verdict === "fits" ? "This period fits the plan — spend the wants budget and the landmarks still get funded."
    : c.verdict === "tight" ? `Tight: ${money(c.gap)} of the wants budget has to give to keep the landmarks and the debt plan.`
    : `This period doesn't fit: ${money(c.gap)} short even with no wants spending.`;
  const tone = c.verdict === "ahead" || c.verdict === "fits" ? "border-green/40 bg-green/5" : c.verdict === "tight" ? "border-amber-line bg-amber-bg/40" : "border-red/40 bg-red/5";
  return (
    <Card className={cx("p-4 flex flex-col gap-3", tone)}>
      <div className="flex items-center gap-2"><Compass size={16} className="text-accent" /><div className="text-sm font-semibold">What to do this period</div><div className="text-[11px] text-muted">· {period.label}</div></div>
      <div className="text-[13px] leading-snug">{headline}</div>
      <button onClick={() => setShowMath(!showMath)} className="text-[11px] text-accent font-semibold text-left">{showMath ? "hide the math" : "show the math"}</button>
      {showMath && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 text-[12px] rounded-[12px] bg-card/70 border border-line p-3">
          <div><div className="text-[10px] text-muted">Paycheck</div><div className="font-semibold">{money(c.paycheck)}</div></div>
          <div><div className="text-[10px] text-muted">Bills still due</div><div className="font-semibold">− {money(c.billsLeft)}</div></div>
          <div><div className="text-[10px] text-muted">Needs left in budget</div><div className="font-semibold">− {money(c.needsLeft)}</div></div>
          <div><div className="text-[10px] text-muted">Set aside for landmarks</div><div className="font-semibold">− {money(c.setAside)}</div></div>
          <div><div className="text-[10px] text-muted">Extra toward debt</div><div className="font-semibold">− {money(c.debtExtra)}</div></div>
          <div><div className="text-[10px] text-muted">Room for wants</div><div className={cx("font-semibold", c.room < 0 && "text-red")}>= {money(c.room)}</div></div>
          <div className="col-span-2 sm:col-span-3 text-[11px] text-muted border-t border-line-soft pt-1.5">The budget still allows <b>{money(c.wantsLeft)}</b> of wants this period (wants categories × the period&apos;s share of the month, minus what&apos;s spent). {c.gap > 0 ? <>That&apos;s <b className="text-red">{money(c.gap)}</b> more than there&apos;s room for.</> : <>Room covers it.</>}</div>
        </div>
      )}
      {c.actions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {c.actions.map((a, i) => { const I = ICON[a.kind]; const inner = (
            <div className="flex items-start gap-2.5 rounded-[12px] bg-card border border-line px-3 py-2 hover:border-field">
              <div className={cx("w-7 h-7 rounded-full flex items-center justify-center shrink-0", TONE[a.kind])}><I size={14} /></div>
              <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold leading-snug">{a.title}</div><div className="text-[11px] text-muted leading-snug">{a.detail}</div></div>
              {a.href && <ChevronRight size={14} className="text-muted-3 shrink-0 mt-1.5" />}
            </div>); return a.href ? <Link key={i} href={a.href}>{inner}</Link> : <div key={i}>{inner}</div>; })}
        </div>
      )}
      {c.lines.some((l) => l.flexible) && (
        <div className="text-[11px] text-muted">Wants this period: {c.lines.filter((l) => l.flexible).sort((a, b) => b.spent - a.spent).slice(0, 5).map((l) => `${l.category.name} ${money(l.spent)}/${money(l.allowance)}`).join(" · ")}</div>
      )}
    </Card>
  );
}
