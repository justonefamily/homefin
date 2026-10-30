"use client";
import { useState } from "react";
import Link from "next/link";
import { Compass, ChevronRight, AlertTriangle, Pause, Scissors, Hand, PiggyBank, Flag, Info, CheckSquare, Square, Check } from "lucide-react";
import { useHome } from "@/store/useHome";
import { Card, cx, money } from "./ui";
import { periodCoach, type CoachAction } from "@/lib/coach";
import { currentPeriodRange, type PeriodRange } from "@/lib/projections";
import { ymd } from "@/lib/calendar";
import type { Commitment, HomeData } from "@/lib/types";
import { uid } from "@/lib/storage/adapter";

const ICON: Record<CoachAction["kind"], typeof Compass> = { over: AlertTriangle, cut: Scissors, hold: Hand, pause: Pause, surplus: PiggyBank, "set-aside": Flag, note: Info };
const TONE: Record<string, string> = { over: "text-red bg-red/10", cut: "text-amber bg-amber-bg", hold: "text-amber bg-amber-bg", pause: "text-amber bg-amber-bg", surplus: "text-green bg-green/10", "set-aside": "text-accent bg-accent-bg", note: "text-muted bg-surface" };

const commitmentsFor = (data: HomeData, period: PeriodRange) => (data.commitments ?? []).filter((c) => c.periodFrom === ymd(period.from));

/** The full playbook for the current pay period, with a checkbox on every move: what's ticked is what the home agreed to. */
export function PeriodCoach({ today, period: given }: { today: Date; period?: PeriodRange }) {
  const { data: d, update } = useHome();
  const data = d!;
  const period = given ?? currentPeriodRange(data, today);
  const c = periodCoach(data, today, period);
  const [showMath, setShowMath] = useState(false);
  const committed = commitmentsFor(data, period);
  const isOn = (a: CoachAction) => committed.some((x) => x.ref === a.ref);
  const toggle = (a: CoachAction) => update((h) => {
    const list = h.commitments ?? [];
    const key = ymd(period.from);
    const exists = list.find((x) => x.periodFrom === key && x.ref === a.ref);
    return { ...h, commitments: exists ? list.filter((x) => x !== exists) : [...list, { id: uid(), periodFrom: key, ref: a.ref, kind: a.kind, title: a.title, detail: a.detail, amount: a.amount, href: a.href, at: new Date().toISOString() } satisfies Commitment] };
  }, isOn(a) ? `dropped: ${a.title}` : `we'll do this: ${a.title}`);
  const headline = c.verdict === "ahead" ? `This period has ${money(c.room - c.wantsLeft)} more than the plan needs.`
    : c.verdict === "fits" ? "This period fits the plan — spend the wants budget and the landmarks still get funded."
    : c.verdict === "tight" ? `Tight: ${money(c.gap)} of the wants budget has to give to keep the landmarks and the debt plan.`
    : `This period doesn't fit: ${money(c.gap)} short even with no wants spending.`;
  const tone = c.verdict === "ahead" || c.verdict === "fits" ? "border-green/40 bg-green/5" : c.verdict === "tight" ? "border-amber-line bg-amber-bg/40" : "border-red/40 bg-red/5";
  return (
    <Card className={cx("p-4 flex flex-col gap-3", tone)}>
      <div className="flex items-center gap-2 flex-wrap"><Compass size={16} className="text-accent" /><div className="text-sm font-semibold">What to do this period</div><div className="text-[11px] text-muted">· {period.label}</div>{committed.length > 0 && <div className="ml-auto text-[11px] font-semibold text-accent">{committed.length} on the Today list</div>}</div>
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
          <div className="text-[11px] text-muted">Tick the ones we&apos;re actually going to do — those show up on Home under Today.</div>
          {c.actions.map((a) => { const I = ICON[a.kind]; const on = isOn(a); return (
            <div key={a.ref} className={cx("flex items-start gap-2.5 rounded-[12px] bg-card border px-3 py-2", on ? "border-accent" : "border-line")}>
              <button onClick={() => toggle(a)} aria-pressed={on} aria-label={on ? "We'll do this (on)" : "We'll do this"} className={cx("mt-0.5 shrink-0", on ? "text-accent" : "text-muted-3 hover:text-ink")}>{on ? <CheckSquare size={18} /> : <Square size={18} />}</button>
              <div className={cx("w-7 h-7 rounded-full flex items-center justify-center shrink-0", TONE[a.kind])}><I size={14} /></div>
              <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold leading-snug">{a.title}</div><div className="text-[11px] text-muted leading-snug">{a.detail}</div></div>
              {a.href && <Link href={a.href} aria-label="Open" className="shrink-0 mt-1 text-muted-3 hover:text-ink"><ChevronRight size={14} /></Link>}
            </div>); })}
        </div>
      )}
      {c.lines.some((l) => l.flexible) && (
        <div className="text-[11px] text-muted">Wants this period: {c.lines.filter((l) => l.flexible).sort((a, b) => b.spent - a.spent).slice(0, 5).map((l) => `${l.category.name} ${money(l.spent)}/${money(l.allowance)}`).join(" · ")}</div>
      )}
    </Card>
  );
}

/** Home → Today: only what the home agreed to for this period, with a done tick. Wording refreshes from the live coach. */
export function PeriodFocus({ today, period }: { today: Date; period: PeriodRange }) {
  const { data: d, update } = useHome();
  const data = d!;
  const committed = commitmentsFor(data, period);
  const live = periodCoach(data, today, period);
  const markDone = (id: string, done: boolean) => update((h) => ({ ...h, commitments: (h.commitments ?? []).map((x) => (x.id === id ? { ...x, done } : x)) }), done ? "focus item done" : "focus item reopened");
  if (committed.length === 0) {
    return (
      <Link href="/plan" className="block"><Card className="p-3.5 flex items-center gap-2.5 hover:border-field"><Compass size={16} className="text-accent shrink-0" /><div className="text-[13px]"><b>Nothing picked for this period yet.</b> Plan → Strategy lays out what to do and lets you tick what you&apos;ll commit to.</div><div className="ml-auto text-xs text-accent font-semibold whitespace-nowrap">Plan it ›</div></Card></Link>
    );
  }
  return (
    <Card className="p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2"><Compass size={16} className="text-accent" /><div className="text-sm font-semibold">Our focus · {period.label}</div><Link href="/plan" className="ml-auto text-[11px] font-semibold text-accent">Change ›</Link></div>
      {committed.map((x) => {
        const fresh = live.actions.find((a) => a.ref === x.ref);
        const I = ICON[(x.kind as CoachAction["kind"]) in ICON ? (x.kind as CoachAction["kind"]) : "note"];
        return (
          <div key={x.id} className={cx("flex items-start gap-2.5 rounded-[12px] border px-3 py-2", x.done ? "border-line-soft opacity-60" : "border-line")}>
            <button onClick={() => markDone(x.id, !x.done)} aria-pressed={!!x.done} aria-label="Done" className={cx("mt-0.5 w-5 h-5 rounded-[6px] border flex items-center justify-center shrink-0", x.done ? "bg-accent border-accent text-white" : "border-chip text-transparent hover:border-field")}><Check size={13} /></button>
            <div className={cx("w-7 h-7 rounded-full flex items-center justify-center shrink-0", TONE[x.kind] ?? TONE.note)}><I size={14} /></div>
            <div className="flex-1 min-w-0"><div className={cx("text-[13px] font-semibold leading-snug", x.done && "line-through")}>{fresh?.title ?? x.title}</div><div className="text-[11px] text-muted leading-snug">{fresh?.detail ?? x.detail}{!fresh && <span> · no longer in the plan&apos;s list — still yours to finish</span>}</div></div>
            {(fresh?.href ?? x.href) && <Link href={fresh?.href ?? x.href!} aria-label="Open" className="shrink-0 mt-1 text-muted-3 hover:text-ink"><ChevronRight size={14} /></Link>}
          </div>
        );
      })}
    </Card>
  );
}
