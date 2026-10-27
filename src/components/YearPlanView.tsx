"use client";
import { useState } from "react";
import { Flag, Plus } from "lucide-react";
import { useHome } from "@/store/useHome";
import { Button, Card, Eyebrow, Field, Modal, cx, inputCls, money, selectCls } from "./ui";
import { buildYearPlan } from "@/lib/yearplan";
import type { Landmark } from "@/lib/types";
import { uid } from "@/lib/storage/adapter";

export function YearPlanView({ today }: { today: Date }) {
  const { data: d, update } = useHome();
  const data = d!;
  const [year, setYear] = useState(today.getFullYear() + 1);
  const [withStart, setWithStart] = useState(true);
  const [editing, setEditing] = useState<Landmark | "new" | null>(null);
  const yp = buildYearPlan(data, year, today, withStart);
  const t = yp.totals;
  const maxAbs = Math.max(1, ...yp.months.map((m) => Math.abs(m.pocket)));

  const save = (l: Landmark) => update((h) => ({ ...h, landmarks: (h.landmarks ?? []).some((x) => x.id === l.id) ? (h.landmarks ?? []).map((x) => (x.id === l.id ? l : x)) : [...(h.landmarks ?? []), l] }), `saved ${year} landmark ${l.name}`);
  const remove = (id: string) => update((h) => ({ ...h, landmarks: (h.landmarks ?? []).filter((x) => x.id !== id) }), "removed a landmark");

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
      <div className="text-[13px] text-muted leading-snug">Today&apos;s income, bills, everyday spending and extra debt payment applied to every month of {year}, plus the landmarks you add. Expected income: {money(yp.months[0].income)}/mo · bills {money(yp.months[0].bills)}/mo · everyday {money(yp.months[0].everyday)}/mo.</div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <Kpi dark label={`In your pocket · end of ${year}`} value={money(t.pocketEnd)} sub={withStart ? `starts from ${money(yp.startBalance)} checking` : "from $0"} tone={t.pocketEnd < 0 ? "red" : undefined} />
        <Kpi label="Income" value={money(t.income)} sub={`${money(t.income / 12)}/mo expected`} />
        <Kpi label="Spending" value={money(t.spending)} sub={`bills ${money(t.bills)} · everyday ${money(t.everyday)}`} />
        <Kpi label={`Debt remaining · Dec ${year}`} value={money(t.debtEnd)} sub={t.debtStart > 0 ? `${money(t.debtPaid)} paid down from ${money(t.debtStart)}` : "no debt tracked"} tone={t.debtEnd === 0 && t.debtStart > 0 ? "green" : undefined} />
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
                <td className="px-3 py-2"><div className="font-semibold">{m.name} {year}</div>{m.landmarks.map((l) => <button key={l.id} onClick={() => setEditing(l)} className="block text-[11px] text-amber font-semibold hover:underline text-left">⚑ {l.name} · {l.amount < 0 ? "+" : ""}{money(Math.abs(l.amount))}{l.amount < 0 ? " in" : ""}</button>)}</td>
                <td className="px-3 py-2 text-right text-green">{money(m.income)}</td>
                <td className="px-3 py-2 text-right">{money(m.bills + m.everyday)}</td>
                <td className="px-3 py-2 text-right">{m.debtExtra ? money(m.debtExtra) : "—"}</td>
                <td className={cx("px-3 py-2 text-right", m.landmarkTotal > 0 ? "text-amber font-semibold" : m.landmarkTotal < 0 ? "text-green font-semibold" : "text-muted")}>{m.landmarkTotal ? money(m.landmarkTotal) : "—"}</td>
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

      {editing && <LandmarkForm year={year} lm={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={save} onRemove={remove} />}
    </div>
  );
}

const short = (n: number) => (Math.abs(n) >= 1000 ? `${n < 0 ? "−" : ""}$${(Math.abs(n) / 1000).toFixed(1).replace(/\.0$/, "")}k` : money(n));

const Kpi = ({ label, value, sub, dark, tone }: { label: string; value: string; sub?: string; dark?: boolean; tone?: "red" | "green" | "amber" }) => (
  <div className={cx("rounded-[14px] border p-3 flex flex-col gap-0.5 min-w-0", dark ? "bg-ink border-ink text-white" : "bg-card border-line")}>
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
