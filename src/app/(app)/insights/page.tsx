"use client";
import { useMemo, useState } from "react";
import { useHome } from "@/store/useHome";
import { useToday } from "@/components/hooks";
import { Card, Eyebrow, Field, Segmented, Stat, cx, money, selectCls } from "@/components/ui";
import { METRICS, compare, periodFor, periodLabel, periodOptions, sameTimeLastYear, type Granularity, type MetricId, type PeriodRef } from "@/lib/insights";

export default function InsightsPage() {
  const data = useHome((s) => s.data)!;
  const today = useToday();
  const [g, setG] = useState<Granularity>("month");
  const thisPeriod = periodFor(today, g);
  const lastYear = sameTimeLastYear(thisPeriod);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
        <div className="w-44"><Segmented size="sm" value={g} onChange={setG} options={[{ id: "month", label: "Month" }, { id: "quarter", label: "Qtr" }, { id: "year", label: "Year" }]} /></div>
      </div>

      <section className="flex flex-col gap-3">
        <div><h2 className="text-base font-semibold">This time vs. last year</h2><div className="text-xs text-muted">{periodLabel(thisPeriod)} side by side with {periodLabel(lastYear)}</div></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {(["income", "bills", "spending", "debt"] as MetricId[]).map((m) => {
            const c = compare(data, m, thisPeriod, lastYear);
            const diff = c.totalA - c.totalB;
            const goodWhenDown = m !== "income";
            const tone = c.bEmpty ? undefined : diff === 0 ? undefined : (diff < 0) === goodWhenDown ? "green" : "red";
            return (
              <Card key={m} className="p-3 flex flex-col gap-1">
                <div className="text-[11px] text-muted">{METRICS.find((x) => x.id === m)!.name.replace(" by category", "")}</div>
                <div className="text-[17px] font-bold">{money(c.totalA)}</div>
                <div className={cx("text-[11px] font-semibold", tone === "green" ? "text-green" : tone === "red" ? "text-red" : "text-muted")}>
                  {c.bEmpty ? "no data last year" : `${diff >= 0 ? "+" : "−"}${money(Math.abs(diff))} vs ${money(c.totalB)}`}
                </div>
              </Card>
            );
          })}
        </div>
        <ComparisonTable data={data} metric="spending" a={thisPeriod} b={lastYear} />
      </section>

      <CustomComparison today={today} />
    </>
  );
}

function ComparisonTable({ data, metric, a, b }: { data: ReturnType<typeof useHome.getState>["data"] & object; metric: MetricId; a: PeriodRef; b: PeriodRef }) {
  const c = compare(data, metric, a, b);
  const max = Math.max(1, ...c.rows.flatMap((r) => [Math.abs(r.a), Math.abs(r.b)]));
  const byCat = METRICS.find((m) => m.id === metric)!.byCategory;
  if (c.rows.length === 0) return <Card className="p-4 text-sm text-muted">Nothing recorded for either period yet.</Card>;
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap"><Eyebrow>{METRICS.find((m) => m.id === metric)!.name}</Eyebrow>
        <div className="flex gap-3 text-[11px] text-muted"><span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-[3px] bg-ink inline-block" />{periodLabel(a)}</span><span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-[3px] bg-teal-soft inline-block" />{periodLabel(b)}</span></div>
      </div>
      {c.rows.map((r) => {
        const diff = r.a - r.b;
        return (
          <div key={r.id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between text-xs"><div className="font-semibold">{r.name}</div>
              <div className="flex gap-3"><span className="font-semibold">{money(r.a)}</span><span className="text-muted">{money(r.b)}</span><span className={cx("font-semibold w-16 text-right", c.bEmpty ? "text-muted" : diff > 0 ? "text-red" : diff < 0 ? "text-green" : "text-muted")}>{c.bEmpty ? "—" : `${diff >= 0 ? "+" : "−"}${money(Math.abs(diff))}`}</span></div></div>
            <div className="flex flex-col gap-0.5">
              <div className="h-2 rounded-full bg-line-soft"><div className="h-2 rounded-full bg-ink" style={{ width: `${(Math.abs(r.a) / max) * 100}%` }} /></div>
              <div className="h-2 rounded-full bg-line-soft"><div className="h-2 rounded-full bg-teal-soft" style={{ width: `${(Math.abs(r.b) / max) * 100}%` }} /></div>
            </div>
          </div>
        );
      })}
      {byCat && <div className="flex justify-between border-t border-line-soft pt-2 text-xs"><div className="font-semibold">Total</div><div className="flex gap-3"><span className="font-semibold">{money(c.totalA)}</span><span className="text-muted">{money(c.totalB)}</span><span className={cx("font-semibold w-16 text-right", c.totalA - c.totalB > 0 ? "text-red" : "text-green")}>{c.bEmpty ? "—" : `${c.totalA - c.totalB >= 0 ? "+" : "−"}${money(Math.abs(c.totalA - c.totalB))}`}</span></div></div>}
    </Card>
  );
}

function CustomComparison({ today }: { today: Date }) {
  const data = useHome((s) => s.data)!;
  const [metric, setMetric] = useState<MetricId>("spending");
  const [g, setG] = useState<Granularity>("month");
  const options = useMemo(() => periodOptions(g, today, 3), [g, today]);
  const [aKey, setAKey] = useState(options[0].key);
  const [bKey, setBKey] = useState(sameTimeLastYear({ granularity: g, key: options[0].key }).key);
  const a: PeriodRef = { granularity: g, key: options.some((o) => o.key === aKey) ? aKey : options[0].key };
  const b: PeriodRef = { granularity: g, key: options.some((o) => o.key === bKey) ? bKey : (options[1] ?? options[0]).key };
  const c = compare(data, metric, a, b);
  const diff = c.totalA - c.totalB;
  return (
    <section className="flex flex-col gap-3">
      <div><h2 className="text-base font-semibold">Make your own comparison</h2><div className="text-xs text-muted">Pick any metric and any two periods from your data.</div></div>
      <Card className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="Metric"><select className={selectCls} value={metric} onChange={(e) => setMetric(e.target.value as MetricId)}>{METRICS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          <Field label="Period type"><select className={selectCls} value={g} onChange={(e) => { const ng = e.target.value as Granularity; setG(ng); const o = periodOptions(ng, today, 3); setAKey(o[0].key); setBKey(sameTimeLastYear(o[0]).key); }}><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option></select></Field>
          <Field label="Compare"><select className={selectCls} value={a.key} onChange={(e) => setAKey(e.target.value)}>{options.map((o) => <option key={o.key} value={o.key}>{periodLabel(o)}</option>)}</select></Field>
          <Field label="Against"><select className={selectCls} value={b.key} onChange={(e) => setBKey(e.target.value)}>{options.map((o) => <option key={o.key} value={o.key}>{periodLabel(o)}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <Stat dark label={periodLabel(a)} value={money(c.totalA)} />
          <Stat label={periodLabel(b)} value={c.bEmpty ? "no data" : money(c.totalB)} />
          <Stat label="Difference" value={c.bEmpty ? "—" : `${diff >= 0 ? "+" : "−"}${money(Math.abs(diff))}`} tone={c.bEmpty ? undefined : (diff < 0) === (metric !== "income" && metric !== "savings" && metric !== "net") ? "green" : "red"} />
        </div>
      </Card>
      <ComparisonTable data={data} metric={metric} a={a} b={b} />
    </section>
  );
}
