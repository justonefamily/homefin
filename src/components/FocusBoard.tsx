"use client";
import { useState } from "react";
import { useItem } from "@/store/useItem";
import { merchantKey } from "@/lib/detect";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useHome } from "@/store/useHome";
import { Button, Card, Eyebrow, Field, Modal, cx, inputCls, money, selectCls } from "./ui";
import { SCALARS, SERIES, defaultDashboard, defaultTitle, isScalarKind, runScalar, runSeries, runTarget, scalar, series, type Widget, type WidgetKind } from "@/lib/widgets";
import type { HomeData } from "@/lib/types";
import { uid } from "@/lib/storage/adapter";

const KINDS: { id: WidgetKind; label: string; hint: string }[] = [
  { id: "kpi", label: "Number card", hint: "One big figure, optional change vs. last year" },
  { id: "gauge", label: "Gauge / slider", hint: "A value against a target" },
  { id: "bar", label: "Bar chart", hint: "Compare items side by side" },
  { id: "donut", label: "Donut chart", hint: "Share of a whole" },
  { id: "list", label: "List", hint: "Rows with amounts" },
];

const fmtVal = (v: number, f: string) => (f === "money" ? money(v) : f === "months" ? `${Math.round(v)} mo` : f === "pct" ? `${Math.round(v)}%` : Math.round(v).toLocaleString());

export function FocusBoard({ today }: { today: Date }) {
  const { data: d, update } = useHome();
  const data = d!;
  const widgets = data.dashboard?.widgets ?? defaultDashboard().widgets;
  const [editing, setEditing] = useState<Widget | "new" | null>(null);
  const [arrange, setArrange] = useState(false);

  const setWidgets = (ws: Widget[], note: string) => update((h) => ({ ...h, dashboard: { widgets: ws } }), note);
  const save = (w: Widget) => setWidgets(widgets.some((x) => x.id === w.id) ? widgets.map((x) => (x.id === w.id ? w : x)) : [...widgets, w], "edited Focus board");
  const remove = (id: string) => setWidgets(widgets.filter((x) => x.id !== id), "removed a widget");
  const move = (id: string, dir: -1 | 1) => { const i = widgets.findIndex((x) => x.id === id); const j = i + dir; if (j < 0 || j >= widgets.length) return; const ws = widgets.slice(); [ws[i], ws[j]] = [ws[j], ws[i]]; setWidgets(ws, "rearranged Focus board"); };
  const resize = (id: string) => setWidgets(widgets.map((x) => (x.id === id ? { ...x, w: (x.w === 3 ? 1 : x.w + 1) as 1 | 2 | 3 } : x)), "resized a widget");

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] text-muted">Your own grid of what matters. Any number, chart or list from your data.</div>
        <div className="flex gap-2 shrink-0">
          <Button variant={arrange ? "primary" : "secondary"} onClick={() => setArrange(!arrange)} className="h-9 px-3 text-xs">{arrange ? "Done" : "Arrange"}</Button>
          <Button onClick={() => setEditing("new")} className="h-9 px-3 text-xs"><Plus size={14} className="inline -mt-0.5 mr-1" />Widget</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 md:auto-rows-[minmax(150px,auto)]">
        {widgets.map((w) => (
          <div key={w.id} className={cx("relative min-w-0", w.w === 3 ? "md:col-span-3" : w.w === 2 ? "md:col-span-2" : "")}>
            <WidgetView w={w} data={data} today={today} />
            {arrange && (
              <div className="absolute top-2 right-2 flex gap-1 bg-card/95 border border-line rounded-[10px] p-1">
                <Tool label="Move up" onClick={() => move(w.id, -1)}><ArrowUp size={14} /></Tool>
                <Tool label="Move down" onClick={() => move(w.id, 1)}><ArrowDown size={14} /></Tool>
                <Tool label={`Width ${w.w} of 3 — click to change`} onClick={() => resize(w.id)}><span className="text-[11px] font-bold px-0.5">{w.w}×</span></Tool>
                <Tool label="Edit" onClick={() => setEditing(w)}><Pencil size={14} /></Tool>
                <Tool label="Remove" onClick={() => remove(w.id)} danger><Trash2 size={14} /></Tool>
              </div>
            )}
          </div>
        ))}
        <button onClick={() => setEditing("new")} className="min-h-[120px] rounded-[16px] border border-dashed border-field text-accent text-[13px] font-semibold hover:bg-accent-bg flex items-center justify-center gap-1.5"><Plus size={16} /> Add a widget</button>
      </div>
      {editing && <WidgetEditor data={data} widget={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={save} />}
    </>
  );
}

const Tool = ({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
  <button onClick={onClick} aria-label={label} title={label} className={cx("w-8 h-8 rounded-[8px] flex items-center justify-center hover:bg-surface", danger ? "text-red" : "text-ink")}>{children}</button>
);

/* ------------------------------ renderers ------------------------------ */

export function WidgetView({ w, data, today }: { w: Widget; data: HomeData; today: Date }) {
  const openItem = useItem((s) => s.openItem);
  /** List/bar points that are bills open the bill's item page. */
  const billKeyFor = (id: string) => { const b = data.bills.find((x) => x.id === id); return b ? b.merchant ?? merchantKey(b.name) : null; };
  const title = w.title || defaultTitle(w, data);
  if (w.kind === "kpi") {
    const r = runScalar(data, today, w.source, w.param);
    const good = r.delta === undefined ? undefined : (r.delta <= 0) === !["income", "savings", "checking", "net-worth", "credit-score", "left-over", "budget-left", "debt-paid-ytd"].includes(w.source);
    return (
      <Card className={cx("p-4 h-full flex flex-col gap-1", w.source === widgetsHero(data) && "bg-ink border-ink text-white")}>
        <Eyebrow className={w.source === widgetsHero(data) ? "text-muted-3" : ""}>{title}</Eyebrow>
        <div className="text-[28px] font-bold tracking-tight leading-tight">{fmtVal(r.value, r.format)}</div>
        {(r.sub || r.delta !== undefined) && <div className={cx("text-[11px] font-semibold", r.delta === undefined ? "text-muted" : good ? "text-green" : "text-red")}>{r.delta !== undefined ? `${r.delta >= 0 ? "+" : "−"}${money(Math.abs(r.delta))} ` : ""}{r.sub}</div>}
      </Card>
    );
  }
  if (w.kind === "gauge") {
    const r = runScalar(data, today, w.source, w.param);
    const target = runTarget(data, today, w.target, w.param);
    const pct = target ? Math.min(100, Math.max(0, (r.value / target) * 100)) : 0;
    return (
      <Card className="p-4 h-full flex flex-col gap-2 justify-center">
        <Eyebrow>{title}</Eyebrow>
        <div className="flex items-baseline justify-between"><div className="text-[22px] font-bold tracking-tight">{fmtVal(r.value, r.format)}</div><div className="text-xs text-muted">of {fmtVal(target, r.format)}</div></div>
        <div className="relative h-3 rounded-full bg-line-soft"><div className={cx("h-3 rounded-full", pct >= 100 ? "bg-green" : "bg-accent")} style={{ width: `${pct}%` }} /><div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-card border-2 border-accent shadow-sm" style={{ left: `calc(${pct}% - 10px)` }} aria-hidden /></div>
        <div className="text-[11px] text-muted">{Math.round(pct)}% · {target > r.value ? `${fmtVal(target - r.value, r.format)} to go` : "goal reached"}</div>
      </Card>
    );
  }
  const s = runSeries(data, today, w.source, w.param);
  if (s.points.length === 0) return <Card className="p-4 h-full flex flex-col gap-1"><Eyebrow>{title}</Eyebrow><div className="text-sm text-muted">Nothing to show yet.</div></Card>;
  if (w.kind === "bar") {
    const max = Math.max(1, ...s.points.map((p) => Math.abs(p.value)));
    return (
      <Card className="p-4 h-full flex flex-col gap-2">
        <Eyebrow>{title}</Eyebrow>
        <div className="flex flex-col gap-1.5">
          {s.points.slice(0, 10).map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-xs">
              <div className="w-24 md:w-32 truncate text-muted shrink-0">{p.label}</div>
              <div className="flex-1 h-3 rounded-full bg-line-soft"><div className="h-3 rounded-full" style={{ width: `${(Math.abs(p.value) / max) * 100}%`, background: p.color ?? "#0e6b74" }} /></div>
              <div className="w-16 text-right font-semibold shrink-0">{fmtVal(p.value, s.format)}</div>
            </div>
          ))}
        </div>
      </Card>
    );
  }
  if (w.kind === "donut") {
    const pts = s.points.filter((p) => p.value > 0).slice(0, 8);
    const total = pts.reduce((a, p) => a + p.value, 0) || 1;
    const R = 40, C = 2 * Math.PI * R;
    const arcs = pts.reduce<{ p: typeof pts[number]; len: number; off: number }[]>((a, p) => { const off = a.reduce((s, x) => s + x.len, 0); return [...a, { p, len: (p.value / total) * C, off }]; }, []);
    return (
      <Card className="p-4 h-full flex flex-col gap-2">
        <Eyebrow>{title}</Eyebrow>
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0" role="img" aria-label={`${title}: ${pts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(", ")}`}>
            {arcs.map(({ p, len, off }) => <circle key={p.id} cx="50" cy="50" r={R} fill="none" stroke={p.color ?? "#0e6b74"} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 50 50)" />)}
            <text x="50" y="54" textAnchor="middle" fontSize="13" fontWeight="700" fill="#141821">{s.format === "money" ? `$${Math.round(total / 1000) >= 10 ? Math.round(total / 1000) + "k" : Math.round(total).toLocaleString()}` : Math.round(total)}</text>
          </svg>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            {pts.map((p) => <div key={p.id} className="flex items-center gap-1.5 text-[11px]"><i className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: p.color }} /><span className="truncate text-muted flex-1">{p.label}</span><span className="font-semibold">{Math.round((p.value / total) * 100)}%</span></div>)}
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="h-full flex flex-col">
      <div className="px-4 pt-3 pb-1"><Eyebrow>{title}</Eyebrow></div>
      {s.points.slice(0, 8).map((p) => { const k = billKeyFor(p.id); return (
        <div key={p.id} role={k ? "button" : undefined} tabIndex={k ? 0 : undefined} onClick={() => k && openItem(k)} onKeyDown={(e) => k && e.key === "Enter" && openItem(k)} className={cx("flex items-center gap-2.5 px-4 py-2 border-t border-line-soft text-xs", k && "cursor-pointer hover:bg-surface/60")}>
          <i className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color ?? "#0e6b74" }} />
          <div className="flex-1 min-w-0"><div className="font-semibold truncate">{p.label}</div>{p.sub && <div className="text-[11px] text-muted truncate">{p.sub}</div>}</div>
          <div className="font-semibold">{fmtVal(p.value, s.format)}</div>
        </div>
      ); })}
    </Card>
  );
}

/** The first KPI on the board gets the dark hero treatment. */
const widgetsHero = (d: HomeData) => (d.dashboard?.widgets ?? defaultDashboard().widgets).find((w) => w.kind === "kpi")?.source;

/* ------------------------------ editor ------------------------------ */

function WidgetEditor({ data, widget, onClose, onSave }: { data: HomeData; widget?: Widget; onClose: () => void; onSave: (w: Widget) => void }) {
  const [kind, setKind] = useState<WidgetKind>(widget?.kind ?? "kpi");
  const [source, setSource] = useState(widget?.source ?? "left-to-pay");
  const [param, setParam] = useState(widget?.param ?? "");
  const [target, setTarget] = useState(widget?.target ?? "starter-goal");
  const [customTarget, setCustomTarget] = useState(/^[\d.]+$/.test(widget?.target ?? "") ? widget!.target! : "");
  const [title, setTitle] = useState(widget?.title ?? "");
  const [w, setW] = useState<1 | 2 | 3>(widget?.w ?? 1);
  const scalarKind = isScalarKind(kind);
  const sources = [...(scalarKind ? SCALARS : SERIES)].sort((a, b) => a.name.localeCompare(b.name));
  const def = scalarKind ? scalar(source) : series(source);
  const validSource = sources.some((s) => s.id === source) ? source : sources[0].id;
  const params = (scalarKind ? scalar(validSource) : series(validSource))?.params?.(data) ?? [];
  const groups = [...new Set(sources.map((s) => s.group))].sort();
  const preview: Widget = { id: widget?.id ?? "preview", kind, source: validSource, param: params.length ? param || params[0]?.id : undefined, target: customTarget || target, title: title || undefined, w };
  void def;
  return (
    <Modal open onClose={onClose} title={widget ? "Edit widget" : "Add a widget"}>
      <div className="grid grid-cols-5 gap-1.5">
        {KINDS.map((k) => <button key={k.id} onClick={() => { setKind(k.id); const list = isScalarKind(k.id) ? SCALARS : SERIES; if (!list.some((s) => s.id === source)) setSource(list[0].id); }} title={k.hint} className={cx("h-14 rounded-[12px] border text-[11px] font-semibold px-1", kind === k.id ? "bg-ink text-white border-ink" : "bg-card border-line text-ink hover:border-field")}>{k.label}</button>)}
      </div>
      <Field label="Data">
        <select className={selectCls} value={validSource} onChange={(e) => { setSource(e.target.value); setParam(""); }}>
          {groups.map((g) => <optgroup key={g} label={g}>{sources.filter((s) => s.group === g).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
        </select>
      </Field>
      {params.length > 0 && <Field label="Which one"><select className={selectCls} value={param || params[0].id} onChange={(e) => setParam(e.target.value)}>{params.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>}
      {kind === "gauge" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target"><select className={selectCls} value={customTarget ? "__custom" : target} onChange={(e) => { if (e.target.value === "__custom") setCustomTarget("1000"); else { setCustomTarget(""); setTarget(e.target.value); } }}>
            {[...SCALARS].filter((s) => !s.params).sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="__custom">A number I type…</option>
          </select></Field>
          {customTarget && <Field label="Target amount"><input className={inputCls} type="number" value={customTarget} onChange={(e) => setCustomTarget(e.target.value)} /></Field>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title (optional)"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle(preview, data)} /></Field>
        <Field label="Width on desktop"><select className={selectCls} value={w} onChange={(e) => setW(Number(e.target.value) as 1)}><option value={1}>1 of 3</option><option value={2}>2 of 3</option><option value={3}>Full row</option></select></Field>
      </div>
      <div className="flex flex-col gap-1.5"><Eyebrow>Preview</Eyebrow><div className="min-h-[120px]"><WidgetView w={preview} data={data} today={new Date()} /></div></div>
      <Button onClick={() => { onSave({ ...preview, id: widget?.id ?? uid() }); onClose(); }}>{widget ? "Save" : "Add to board"}</Button>
    </Modal>
  );
}
