"use client";
import { useMemo, useState } from "react";
import { addMonths, startOfMonth, endOfMonth } from "date-fns";
import { Search, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useHome } from "@/store/useHome";
import { Card, Segmented, cx, inputCls, money, selectCls } from "./ui";
import { ItemSheet, DepositSheet } from "./ItemSheet";
import { ledgerEntries, ledgerKindLabel, ledgerTotals, type LedgerEntry } from "@/lib/ledger";
import { ymd } from "@/lib/calendar";
import { currentPeriodRange, shiftPeriod } from "@/lib/projections";
import type { IncomeEvent } from "@/lib/types";

type Span = "month" | "period" | "3m" | "12m" | "all" | "custom";

const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const dayLong = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export function LedgerView({ today }: { today: Date }) {
  const data = useHome((s) => s.data)!;
  const [span, setSpan] = useState<Span>("month");
  const [offset, setOffset] = useState(0);
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: ymd(startOfMonth(today)), to: ymd(today) });
  const [accountId, setAccountId] = useState("");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [kind, setKind] = useState<"" | LedgerEntry["kind"]>("");
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<LedgerEntry["open"]>(null);

  // The window: a month or pay period you can step through, a trailing span, everything, or your own dates.
  const range = useMemo(() => {
    if (span === "month") { const m = addMonths(startOfMonth(today), offset); return { from: ymd(m), to: ymd(endOfMonth(m)), label: m.toLocaleString("en-US", { month: "long", year: "numeric" }) }; }
    if (span === "period") { let r = currentPeriodRange(data, today); for (let i = 0; i < Math.abs(offset); i++) r = shiftPeriod(data, r, offset < 0 ? -1 : 1); return { from: ymd(r.from), to: ymd(r.to), label: r.label }; }
    if (span === "3m") return { from: ymd(addMonths(today, -3)), to: ymd(today), label: "Last 3 months" };
    if (span === "12m") return { from: ymd(addMonths(today, -12)), to: ymd(today), label: "Last 12 months" };
    if (span === "custom") return { from: custom.from, to: custom.to, label: `${custom.from} – ${custom.to}` };
    return { from: undefined, to: undefined, label: "All time" };
  }, [span, offset, custom, data, today]);

  const rows = useMemo(() => ledgerEntries(data, { from: range.from, to: range.to, accountId: accountId || undefined, direction: direction === "all" ? undefined : direction, kind: kind || undefined, q: q || undefined }), [data, range, accountId, direction, kind, q]);
  const totals = ledgerTotals(rows);
  const accounts = [...data.accounts].sort((a, b) => `${a.institution} ${a.name}`.localeCompare(`${b.institution} ${b.name}`));
  const acctLabel = (id?: string) => { const a = id ? data.accounts.find((x) => x.id === id) : undefined; return a ? `${a.institution} · ${a.name}${a.mask ? ` ···${a.mask}` : ""}` : id === undefined ? "Manual" : "Removed account"; };
  const steppable = span === "month" || span === "period";

  // Group by day for scanning.
  const days = useMemo(() => { const m = new Map<string, LedgerEntry[]>(); for (const r of rows) (m.get(r.date) ?? m.set(r.date, []).get(r.date)!).push(r); return [...m.entries()]; }, [rows]);
  const [limit, setLimit] = useState(60);
  let shown = 0;

  const kinds: { id: "" | LedgerEntry["kind"]; label: string }[] = [{ id: "", label: "Everything" }, { id: "income", label: "Income" }, { id: "spend", label: "Everyday" }, { id: "bill", label: "Bills" }, { id: "transfer", label: "Transfers" }, { id: "payment-received", label: "Payments received" }, { id: "refund", label: "Refunds" }, { id: "reimbursable", label: "Coming back" }, { id: "ignore", label: "Hidden" }];

  return (
    <>
      <div className="text-[13px] text-muted leading-snug max-w-2xl">Every dollar in and out of every account, one line each. Green is money in, red is money out. Where a payment went to one of your own loans or cards, the line says which. Tap a line for its item page.</div>

      <Card className="p-3 flex flex-col gap-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => setOffset(offset - 1)} disabled={!steppable} aria-label="Earlier" className="w-9 h-9 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field disabled:opacity-40"><ChevronLeft size={15} /></button>
            <button onClick={() => setOffset(0)} className={cx("h-9 px-3 rounded-[10px] border text-[12px] font-semibold whitespace-nowrap", offset === 0 ? "bg-ink text-white border-ink" : "bg-card border-line hover:border-field")}>{range.label}</button>
            <button onClick={() => setOffset(offset + 1)} disabled={!steppable} aria-label="Later" className="w-9 h-9 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
          <div className="flex-1"><Segmented size="sm" value={span} onChange={(s) => { setSpan(s); setOffset(0); }} options={[{ id: "month", label: "Month" }, { id: "period", label: "Pay period" }, { id: "3m", label: "3 mo" }, { id: "12m", label: "12 mo" }, { id: "all", label: "All" }, { id: "custom", label: "Dates…" }]} /></div>
        </div>
        {span === "custom" && (
          <div className="flex items-center gap-2 text-[12px]"><input type="date" className={cx(inputCls, "h-9 text-[12px]")} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /><span className="text-muted">to</span><input type="date" className={cx(inputCls, "h-9 text-[12px]")} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
          <select className={cx(selectCls, "h-9 text-[12px]")} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.institution} · {a.name}{a.mask ? ` ···${a.mask}` : ""}</option>)}
          </select>
          <select className={cx(selectCls, "h-9 text-[12px]")} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {kinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <div className="w-full sm:w-48"><Segmented size="sm" value={direction} onChange={setDirection} options={[{ id: "all", label: "Both" }, { id: "in", label: "In" }, { id: "out", label: "Out" }]} /></div>
        </div>
        <div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-muted" /><input className={cx(inputCls, "h-9 pl-9 text-[12px]")} placeholder="Search item, statement wording, account, or amount…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </Card>

      <div className="grid grid-cols-3 gap-2.5">
        <Card className="p-3"><div className="text-[11px] text-muted flex items-center gap-1"><ArrowDownLeft size={12} className="text-green" /> In</div><div className="text-[17px] font-bold text-green">+{money(totals.in)}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted flex items-center gap-1"><ArrowUpRight size={12} className="text-red" /> Out</div><div className="text-[17px] font-bold text-red">−{money(totals.out)}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted">Net · {rows.length} line{rows.length === 1 ? "" : "s"}</div><div className={cx("text-[17px] font-bold", totals.net >= 0 ? "text-green" : "text-red")}>{totals.net >= 0 ? "+" : "−"}{money(Math.abs(totals.net))}</div></Card>
      </div>

      {rows.length === 0 && <Card className="p-4 text-sm text-muted">Nothing in this window with these filters.</Card>}

      {rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="hidden md:grid grid-cols-[7.5rem_1.4fr_1.2fr_1fr_6.5rem] gap-3 px-4 py-2 text-[11px] font-semibold text-muted bg-surface border-b border-line">
            <div>Date</div><div>Item</div><div>Merchant / account</div><div>On account</div><div className="text-right">Amount</div>
          </div>
          {days.map(([date, items]) => {
            if (shown >= limit) return null;
            const dayTotal = ledgerTotals(items);
            return (
              <div key={date}>
                <div className="flex items-center gap-3 px-4 py-1.5 text-[11px] font-semibold text-muted bg-surface/60 border-b border-line-soft md:hidden"><span className="flex-1">{dayLong(date)}</span><span className={cx(dayTotal.net >= 0 ? "text-green" : "text-red")}>{dayTotal.net >= 0 ? "+" : "−"}{money(Math.abs(dayTotal.net))}</span></div>
                {items.map((r) => {
                  if (shown >= limit) return null; shown++;
                  const dim = r.kind === "ignore";
                  const badge = <span className={cx("text-[10px] font-semibold rounded px-1.5 py-0.5", r.kind === "income" ? "bg-green/10 text-green" : r.kind === "transfer" || r.kind === "payment-received" ? "bg-accent-bg text-accent" : r.kind === "bill" ? "bg-ink/5 text-ink" : r.kind === "refund" || r.kind === "reimbursable" ? "bg-amber-bg text-amber" : "bg-surface text-muted")}>{ledgerKindLabel(r.kind)}</span>;
                  const extras = <>{r.category && r.direction === "out" && r.kind !== "transfer" && <span className="text-[10px] text-muted">{r.category}</span>}{r.details.map((d, i) => <span key={i} className="text-[10px] text-muted">· {d}</span>)}</>;
                  const amt = <span className={cx("font-bold", r.amount >= 0 ? "text-green" : "text-red")}>{r.amount >= 0 ? "+" : "−"}{money(Math.abs(r.amount))}</span>;
                  const other = r.counterpart ? <span className="text-ink">{r.direction === "out" ? "→ " : "← "}{r.counterpart}</span> : <span className="text-muted">{r.kind === "transfer" ? "—" : r.item}</span>;
                  return (
                    <button key={r.id} onClick={() => r.open && setPick(r.open)} className={cx("w-full text-left border-b border-line-soft last:border-b-0 hover:bg-surface/60", dim && "opacity-60", !r.open && "cursor-default")}>
                      {/* Desktop: one row per line */}
                      <div className="hidden md:grid grid-cols-[7.5rem_1.4fr_1.2fr_1fr_6.5rem] gap-3 px-4 py-2.5 items-start">
                        <div className="text-[12px] text-muted">{day(r.date)}</div>
                        <div className="min-w-0"><div className="text-[13px] font-semibold truncate">{r.item}</div>{r.description !== r.item && <div className="text-[11px] text-muted truncate">{r.description}</div>}<div className="flex flex-wrap gap-1 mt-0.5">{badge}{extras}</div></div>
                        <div className="text-[12px] min-w-0 truncate">{other}</div>
                        <div className="text-[12px] text-muted min-w-0 truncate">{acctLabel(r.accountId)}</div>
                        <div className="text-right text-[13px]">{amt}</div>
                      </div>
                      {/* Phone: stacked */}
                      <div className="md:hidden px-4 py-2.5 flex flex-col gap-0.5">
                        <div className="flex items-start gap-3"><div className="flex-1 min-w-0 text-[13px] font-semibold truncate">{r.item}</div><div className="text-[13px]">{amt}</div></div>
                        {r.description !== r.item && <div className="text-[11px] text-muted truncate">{r.description}</div>}
                        <div className="text-[11px] text-muted truncate">{r.counterpart ? `${r.direction === "out" ? "→" : "←"} ${r.counterpart} · ` : ""}{acctLabel(r.accountId)}</div>
                        <div className="flex flex-wrap gap-1 mt-0.5">{badge}{extras}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {rows.length > limit && <button onClick={() => setLimit(limit + 100)} className="w-full text-left px-4 py-2.5 text-[12px] font-semibold text-accent">Show more · {rows.length - limit} left</button>}
        </Card>
      )}

      {pick && "merchantKey" in pick && <ItemSheet merchantKey={pick.merchantKey} onClose={() => setPick(null)} />}
      {pick && "deposit" in pick && <DepositSheet event={pick.deposit as IncomeEvent} onClose={() => setPick(null)} />}
    </>
  );
}
