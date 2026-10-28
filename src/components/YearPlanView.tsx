"use client";
import { useState } from "react";
import { Flag, Plus, Target } from "lucide-react";
import { STRATEGIES } from "@/lib/strategies";
import { useHome } from "@/store/useHome";
import { Button, Card, Eyebrow, Field, Modal, cx, inputCls, money, selectCls } from "./ui";
import { buildYearPlan, type PlanMonth } from "@/lib/yearplan";
import { PlanBreakdown, type BreakdownKind } from "./PlanBreakdown";
import type { Landmark, StrategyId, YearTargets } from "@/lib/types";
import { uid } from "@/lib/storage/adapter";

export function YearPlanView({ today }: { today: Date }) {
  const { data: d, update } = useHome();
  const data = d!;
  const [year, setYear] = useState(today.getFullYear());
  const [withStart, setWithStart] = useState(true);
  const [editing, setEditing] = useState<Landmark | "new" | null>(null);
  const [breakdown, setBreakdown] = useState<{ month: PlanMonth; kind: BreakdownKind } | null>(null);
  const cell = (m: PlanMonth, kind: BreakdownKind, cls: string, label: string) => <td className={cx("px-0 py-0", cls)}><button onClick={() => setBreakdown({ month: m, kind })} className="w-full h-full px-3 py-2 text-right hover:bg-surface/70 underline decoration-dotted decoration-line underline-offset-2">{label}</button></td>;
  const yp = buildYearPlan(data, year, today, withStart);
  const t = yp.totals;
  const maxAbs = Math.max(1, ...yp.months.map((m) => Math.abs(m.pocket)));

  const save = (l: Landmark) => update((h) => ({ ...h, landmarks: (h.landmarks ?? []).some((x) => x.id === l.id) ? (h.landmarks ?? []).map((x) => (x.id === l.id ? l : x)) : [...(h.landmarks ?? []), l] }), `saved ${year} landmark ${l.name}`);
  const remove = (id: string) => update((h) => ({ ...h, landmarks: (h.landmarks ?? []).filter((x) => x.id !== id) }), "removed a landmark");
  const targets: YearTargets = data.settings.yearTargets?.[String(year)] ?? {};
  const setTarget = (patch: Partial<YearTargets>) => update((h) => ({ ...h, settings: { ...h.settings, yearTargets: { ...(h.settings.yearTargets ?? {}), [String(year)]: { ...(h.settings.yearTargets?.[String(year)] ?? {}), ...patch } } } }), `${year} targets`);
  const setStrategy = (strategy: StrategyId) => update((h) => ({ ...h, settings: { ...h.settings, strategy } }), `strategy: ${strategy}`);
  const setExtra = (extraPayment: number) => update((h) => ({ ...h, settings: { ...h.settings, extraPayment } }), `extra payment ${extraPayment}`);
  const isThisYear = year === today.getFullYear();
  const gap = (target: number | undefined, value: number, goodWhenHigher: boolean) => target === undefined ? undefined : (goodWhenHigher ? value >= target : value <= target) ? "green" : "red";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-accent">Year plan</div>
          <div className="text-[34px] font-bold tracking-tight leading-none">{year}</div>
        </div>
        <div className="flex items-center gap-2">
          <select className={cx(selectCls, "w-28 h-10")} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[0, 1, 2].map((i) => <option key={i} value={today.getFullYear() + i}>{today.getFullYear() + i}</option>)}
          </select>
          <Button onClick={() => setEditing("new")} className="h-10"><Plus size={14} className="inline -mt-0.5 mr-1" />Landmark</Button>
        </div>
      </div>
      <div className="text-[13px] text-muted leading-snug">{isThisYear ? <>Months that already happened use what the bank recorded ({yp.toDate.months} so far: {money(yp.toDate.income)} in, {money(yp.toDate.spending)} out). The rest of {year} is the plan: </> : <>Every month of {year} uses the plan: </>}<button onClick={() => setBreakdown({ month: yp.months[11], kind: "income" })} className="text-accent font-semibold underline decoration-dotted">income {money(yp.months[11].income)}/mo</button> · <button onClick={() => setBreakdown({ month: yp.months[11], kind: "outgo" })} className="text-accent font-semibold underline decoration-dotted">bills {money(yp.months[11].bills)}/mo + everyday {money(yp.months[11].everyday)}/mo</button> · <button onClick={() => setBreakdown({ month: yp.months[11], kind: "debt" })} className="text-accent font-semibold underline decoration-dotted">extra toward debt {money(data.settings.extraPayment)}/mo</button>, plus your landmarks. Tap any number to see what&apos;s behind it.</div>

      {/* Strategy + targets: how you want the year to go */}
      <Card className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2"><Target size={15} className="text-accent" /><div className="text-sm font-semibold">How we want {year} to go</div></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Debt strategy" hint={STRATEGIES.find((x) => x.id === data.settings.strategy)?.headline}><select className={selectCls} value={data.settings.strategy} onChange={(e) => setStrategy(e.target.value as StrategyId)}>{STRATEGIES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Extra toward debt each month ($)"><input className={inputCls} type="number" inputMode="decimal" value={data.settings.extraPayment || ""} onChange={(e) => setExtra(Number(e.target.value) || 0)} /></Field>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Target · in pocket, Dec"><input className={inputCls} type="number" inputMode="decimal" value={targets.pocket ?? ""} placeholder="e.g. 10000" onChange={(e) => setTarget({ pocket: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field>
          <Field label="Target · debt left, Dec"><input className={inputCls} type="number" inputMode="decimal" value={targets.debt ?? ""} placeholder="0 = debt-free" onChange={(e) => setTarget({ debt: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field>
          <Field label="Target · income, year"><input className={inputCls} type="number" inputMode="decimal" value={targets.income ?? ""} onChange={(e) => setTarget({ income: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field>
          <Field label="Target · spending cap, year"><input className={inputCls} type="number" inputMode="decimal" value={targets.spending ?? ""} onChange={(e) => setTarget({ spending: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field>
        </div>
        <div className="text-[11px] text-muted">The strategy and extra payment drive the debt curve below; targets show green when the plan gets there and red when it doesn&apos;t.</div>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <Kpi dark label={`In your pocket · end of ${year}`} value={money(t.pocketEnd)} sub={targets.pocket !== undefined ? `target ${money(targets.pocket)} · ${t.pocketEnd >= targets.pocket ? "on track" : `${money(targets.pocket - t.pocketEnd)} short`}` : withStart ? `starts from ${money(yp.startBalance)} checking` : "from $0"} tone={t.pocketEnd < 0 ? "red" : gap(targets.pocket, t.pocketEnd, true)} />
        <Kpi onClick={() => setBreakdown({ month: yp.months[Math.max(0, isThisYear ? today.getMonth() : 0)], kind: "income" })} label="Income" value={money(t.income)} sub={targets.income !== undefined ? `target ${money(targets.income)}` : isThisYear ? `${money(yp.toDate.income)} so far` : `${money(t.income / 12)}/mo expected`} tone={gap(targets.income, t.income, true)} />
        <Kpi onClick={() => setBreakdown({ month: yp.months[Math.max(0, isThisYear ? today.getMonth() : 0)], kind: "outgo" })} label="Spending" value={money(t.spending)} sub={targets.spending !== undefined ? `cap ${money(targets.spending)}` : `bills ${money(t.bills)} · everyday ${money(t.everyday)}`} tone={gap(targets.spending, t.spending, false)} />
        <Kpi label={`Debt remaining · Dec ${year}`} value={money(t.debtEnd)} sub={targets.debt !== undefined ? `target ${money(targets.debt)}` : t.debtStart > 0 ? `${money(t.debtPaid)} paid down from ${money(t.debtStart)}` : "no debt tracked"} tone={t.debtEnd === 0 && t.debtStart > 0 ? "green" : gap(targets.debt, t.debtEnd, false)} />
        <Kpi label="Purposed" value={money(t.landmarks)} sub={`${t.landmarkCount} landmark${t.landmarkCount === 1 ? "" : "s"} you set`} tone="amber" />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={withStart} onChange={(e) => setWithStart(e.target.checked)} className="w-4 h-4 accent-[#0e6b74]" /> Start &quot;in your pocket&quot; from today&apos;s checking balance</label>

      {/* Accumulation chart */}
      <Card className="p-4 flex flex-col gap-2.5">
        <Eyebrow>In your pocket, month over month</Eyebrow>
        <div className="grid grid-cols-12 gap-1 items-end h-[150px]">
          {yp.months.map((m) => (
            <div key={m.key} className="flex flex-col items-center justify-end h-full gap-1">
              <div className="text-[9px] font-semibold text-muted hidden md:block">{short(m.pocket)}</div>
              <div className={cx("w-full rounded-t-[5px]", m.pocket < 0 ? "bg-red" : m.landmarks.length ? "bg-amber" : "bg-accent")} style={{ height: `${Math.max(3, (Math.abs(m.pocket) / maxAbs) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-12 gap-1">{yp.months.map((m) => <div key={m.key} className="text-center text-[9px] font-semibold text-muted flex items-center justify-center gap-0.5">{m.name[0]}{m.landmarks.length > 0 && <Flag size={8} className="text-amber" />}</div>)}</div>
        <div className="flex gap-3.5 text-[11px] text-muted"><span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px] bg-accent inline-block" />regular month</span><span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px] bg-amber inline-block" />month with a landmark</span><span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px] bg-red inline-block" />below zero</span></div>
      </Card>

      {/* Month-by-month table */}
      <Card className="overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead><tr className="text-left text-muted border-b border-line-soft"><th className="px-3 py-2 font-semibold">Month</th><th className="px-3 py-2 font-semibold text-right">Income</th><th className="px-3 py-2 font-semibold text-right">Bills + everyday</th><th className="px-3 py-2 font-semibold text-right">Debt extra</th><th className="px-3 py-2 font-semibold text-right">Landmarks</th><th className="px-3 py-2 font-semibold text-right">Net</th><th className="px-3 py-2 font-semibold text-right">In pocket</th><th className="px-3 py-2 font-semibold text-right">Debt left</th></tr></thead>
          <tbody>
            {yp.months.map((m) => (
              <tr key={m.key} className="border-b border-line-soft last:border-b-0 align-top">
                <td className="px-3 py-2"><div className="font-semibold">{m.name} {year} {m.source === "actual" && <span className="text-[9px] font-semibold text-accent bg-accent-bg rounded px-1 py-0.5 align-middle">actual</span>}{m.source === "blend" && <span className="text-[9px] font-semibold text-amber bg-amber-bg rounded px-1 py-0.5 align-middle">so far + plan</span>}</div>{m.landmarks.map((l) => <button key={l.id} onClick={() => setEditing(l)} className="block text-[11px] text-amber font-semibold hover:underline text-left">⚑ {l.name} · {l.amount < 0 ? "+" : ""}{money(Math.abs(l.amount))}{l.amount < 0 ? " in" : ""}</button>)}</td>
                {cell(m, "income", "text-green", money(m.income))}
                {cell(m, "outgo", "", money(m.bills + m.everyday))}
                {cell(m, "debt", "", m.debtExtra ? money(m.debtExtra) : "—")}
                {cell(m, "landmarks", m.landmarkTotal > 0 ? "text-amber font-semibold" : m.landmarkTotal < 0 ? "text-green font-semibold" : "text-muted", m.landmarkTotal ? money(m.landmarkTotal) : "—")}
                <td className={cx("px-3 py-2 text-right font-semibold", m.net < 0 ? "text-red" : "")}>{money(m.net)}</td>
                <td className={cx("px-3 py-2 text-right font-bold", m.pocket < 0 ? "text-red" : "")}>{money(m.pocket)}</td>
                <td className="px-3 py-2 text-right text-muted">{money(m.debtRemaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between"><Eyebrow>Landmarks in {year}</Eyebrow><div className="text-[11px] text-muted">things that will need money</div></div>
      <Card>
        {yp.months.flatMap((m) => m.landmarks).length === 0 && <div className="p-4 text-sm text-muted">Nothing yet. Add the trip, the tuition, the car repair, the wedding gift — anything {year} is going to ask of you.</div>}
        {yp.months.flatMap((m) => m.landmarks).map((l) => (
          <button key={l.id} onClick={() => setEditing(l)} className="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-line-soft last:border-b-0 hover:bg-surface/60">
            <div className="w-10 h-10 rounded-[10px] bg-amber-bg border border-amber-line flex items-center justify-center text-[11px] font-bold text-amber shrink-0">{new Date(Number(l.month.slice(0, 4)), Number(l.month.slice(5, 7)) - 1, 1).toLocaleString("en-US", { month: "short" })}</div>
            <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{l.name}</div>{l.note && <div className="text-[11px] text-muted truncate">{l.note}</div>}</div>
            <div className={cx("text-sm font-semibold", l.amount < 0 ? "text-green" : "")}>{l.amount < 0 ? "+" : ""}{money(Math.abs(l.amount))}</div>
          </button>
        ))}
      </Card>
      <Button variant="dashed" onClick={() => setEditing("new")}>+ Add a landmark for {year}</Button>

      {breakdown && <PlanBreakdown month={breakdown.month} kind={breakdown.kind} onClose={() => setBreakdown(null)} onEditLandmark={(id) => { const l = (data.landmarks ?? []).find((x) => x.id === id); if (l) setEditing(l); }} />}
      {editing && <LandmarkForm year={year} lm={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={save} onRemove={remove} />}
    </div>
  );
}

const short = (n: number) => (Math.abs(n) >= 1000 ? `${n < 0 ? "−" : ""}$${(Math.abs(n) / 1000).toFixed(1).replace(/\.0$/, "")}k` : money(n));

const Kpi = ({ label, value, sub, dark, tone, onClick }: { label: string; value: string; sub?: string; dark?: boolean; tone?: "red" | "green" | "amber"; onClick?: () => void }) => (
  <div role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={(e) => onClick && e.key === "Enter" && onClick()} className={cx("rounded-[14px] border p-3 flex flex-col gap-0.5 min-w-0", dark ? "bg-ink border-ink text-white" : "bg-card border-line", onClick && "cursor-pointer hover:border-field")}>
    <div className={cx("text-[11px]", dark ? "text-muted-3" : "text-muted")}>{label}</div>
    <div className={cx("text-[18px] font-bold truncate", tone === "red" && "text-red", tone === "green" && "text-green", tone === "amber" && "text-amber")}>{value}</div>
    {sub && <div className={cx("text-[10px] truncate", dark ? "text-muted-3" : "text-muted")}>{sub}</div>}
  </div>
);

function LandmarkForm({ year, lm, onClose, onSave, onRemove }: { year: number; lm?: Landmark; onClose: () => void; onSave: (l: Landmark) => void; onRemove: (id: string) => void }) {
  const [name, setName] = useState(lm?.name ?? "");
  const [month, setMonth] = useState(lm?.month ?? `${year}-01`);
  const [amount, setAmount] = useState(Math.abs(lm?.amount ?? 0));
  const [direction, setDirection] = useState<"out" | "in">((lm?.amount ?? 1) < 0 ? "in" : "out");
  const [note, setNote] = useState(lm?.note ?? "");
  return (
    <Modal open onClose={onClose} title={lm ? "Edit landmark" : `Add a ${year} landmark`}>
      <Field label="What"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Family trip to Jamaica" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Month"><select className={selectCls} value={month} onChange={(e) => setMonth(e.target.value)}>{Array.from({ length: 12 }, (_, i) => { const k = `${year}-${String(i + 1).padStart(2, "0")}`; return <option key={k} value={k}>{new Date(year, i, 1).toLocaleString("en-US", { month: "long" })} {year}</option>; })}</select></Field>
        <Field label="Amount ($)"><input className={inputCls} type="number" inputMode="decimal" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
      </div>
      <Field label="Direction"><select className={selectCls} value={direction} onChange={(e) => setDirection(e.target.value as "out")}><option value="out">Money out (a cost)</option><option value="in">Money in (a refund, bonus, gift)</option></select></Field>
      <Field label="Note (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="flex gap-2 pt-1">
        {lm && <Button variant="danger" onClick={() => { onRemove(lm.id); onClose(); }}>Remove</Button>}
        <Button className="flex-1" disabled={!name || amount <= 0} onClick={() => { onSave({ id: lm?.id ?? uid(), name, month, amount: direction === "in" ? -amount : amount, note: note || undefined }); onClose(); }}>Save</Button>
      </div>
    </Modal>
  );
}
