"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, Merge, Search, Receipt, Shuffle, EyeOff, Undo2 } from "lucide-react";
import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek } from "date-fns";
import { useHome } from "@/store/useHome";
import { Button, Card, Eyebrow, Field, Modal, Segmented, cx, inputCls, money, selectCls } from "./ui";
import { flowFor, merchantSummaries, merchantToBill, mergeMerchants, setMerchantPref, similarMerchants, type FlowLine, type MerchantSummary } from "@/lib/merchants";
import { autoMarkPaid } from "@/lib/detect";
import { ymd } from "@/lib/calendar";
import { uid } from "@/lib/storage/adapter";
import { brandColorFor } from "@/lib/brands";
import type { Bill } from "@/lib/types";

type Range = "week" | "period" | "month";

/** Date range for an offset of weeks / pay periods / months from today. */
function rangeFor(today: Date, kind: Range, offset: number, splitDay: number): { from: Date; to: Date; label: string } {
  if (kind === "week") {
    const from = addDays(startOfWeek(today), offset * 7);
    const to = addDays(from, 6);
    return { from, to, label: `${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${to.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` };
  }
  if (kind === "month") {
    const m = addMonths(startOfMonth(today), offset);
    return { from: m, to: endOfMonth(m), label: m.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
  }
  // pay period: 1st–splitDay, (splitDay+1)–end
  const idx = (today.getDate() <= splitDay ? 0 : 1) + offset;
  const m = addMonths(startOfMonth(today), Math.floor(idx / 2));
  const second = ((idx % 2) + 2) % 2 === 1;
  const from = second ? addDays(m, splitDay) : m;
  const to = second ? endOfMonth(m) : addDays(m, splitDay - 1);
  return { from, to, label: `${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${to.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` };
}

export function MoneyView({ today }: { today: Date }) {
  const [tab, setTab] = useState<"flow" | "merchants">("flow");
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Money</h1>
        <div className="w-56"><Segmented size="sm" value={tab} onChange={setTab} options={[{ id: "flow", label: "In & out" }, { id: "merchants", label: "Merchants" }]} /></div>
      </div>
      {tab === "flow" ? <FlowView today={today} /> : <MerchantsView today={today} />}
    </>
  );
}

/* ------------------------------ In & out ------------------------------ */

function FlowView({ today }: { today: Date }) {
  const data = useHome((s) => s.data)!;
  const [kind, setKind] = useState<Range>("week");
  const [offset, setOffset] = useState(0);
  const r = rangeFor(today, kind, offset, data.pay.splitDay);
  const flow = useMemo(() => flowFor(data, ymd(r.from), ymd(r.to)), [data, r.from, r.to]);
  const [pick, setPick] = useState<FlowLine | null>(null);
  const acctName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? (id === "manual" ? "Manual" : "Removed account");
  const acctColor = (id: string) => { const a = data.accounts.find((x) => x.id === id); return a?.brandColor ?? brandColorFor(a?.institution ?? "") ?? "#9aa3b2"; };

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(offset - 1)} aria-label="Earlier" className="w-10 h-10 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field"><ChevronLeft size={16} /></button>
          <button onClick={() => setOffset(0)} className={cx("h-10 px-3 rounded-[10px] border text-[13px] font-semibold", offset === 0 ? "bg-ink text-white border-ink" : "bg-card border-line hover:border-field")}>{r.label}</button>
          <button onClick={() => setOffset(offset + 1)} aria-label="Later" className="w-10 h-10 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field"><ChevronRight size={16} /></button>
        </div>
        <div className="w-64"><Segmented size="sm" value={kind} onChange={(k) => { setKind(k); setOffset(0); }} options={[{ id: "week", label: "Week" }, { id: "period", label: "Pay period" }, { id: "month", label: "Month" }]} /></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Card className="p-3"><div className="text-[11px] text-muted">Came in</div><div className="text-[17px] font-bold text-green">{money(flow.income)}</div><div className="text-[11px] text-muted">{flow.incomeLines.length} deposit{flow.incomeLines.length === 1 ? "" : "s"}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted">Bills</div><div className="text-[17px] font-bold">{money(flow.bills)}</div><div className="text-[11px] text-muted">{flow.billLines.length} paid{flow.unpaidBills.length ? ` · ${flow.unpaidBills.length} still due` : ""}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted">Everything else</div><div className="text-[17px] font-bold">{money(flow.spending)}</div><div className="text-[11px] text-muted">{flow.spendLines.length} place{flow.spendLines.length === 1 ? "" : "s"}</div></Card>
        <Card className={cx("p-3", flow.net < 0 && "border-red/40")}><div className="text-[11px] text-muted">Left over</div><div className={cx("text-[17px] font-bold", flow.net < 0 ? "text-red" : "text-green")}>{money(flow.net)}</div><div className="text-[11px] text-muted">in − bills − everything else</div></Card>
      </div>

      {flow.byAccount.length > 0 && (
        <Card className="p-3.5 flex flex-col gap-2">
          <Eyebrow>By account</Eyebrow>
          <div className="flex flex-col gap-1.5">
            {flow.byAccount.map((a) => (
              <div key={a.accountId} className="flex items-center gap-2 text-[12px]">
                <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: acctColor(a.accountId) }} />
                <div className="flex-1 truncate">{acctName(a.accountId)}</div>
                {a.in > 0 && <span className="text-green font-semibold">+{money(a.in)}</span>}
                {a.out > 0 && <span className="font-semibold">−{money(a.out)}</span>}
              </div>
            ))}
          </div>
          <div className="text-[10px] text-muted">Deposits are counted at the household level (not per account) until you link the account they land in.</div>
        </Card>
      )}

      <Section title="Came in" icon={<ArrowDownLeft size={14} className="text-green" />} lines={flow.incomeLines} tone="green" empty="No deposits in this range." onPick={setPick} acctName={acctName} />
      <Section title="Bills" icon={<Receipt size={14} className="text-accent" />} lines={flow.billLines} empty="No bill payments in this range." onPick={setPick} acctName={acctName}
        extra={flow.unpaidBills.length > 0 && <div className="px-4 py-2 text-[11px] text-amber border-t border-line-soft">Still due: {flow.unpaidBills.map((u) => `${u.bill.name} (${money(u.bill.amount)}, ${new Date(u.dueDate + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})`).join(" · ")}</div>} />
      <Section title="Everything else" icon={<ArrowUpRight size={14} className="text-red" />} lines={flow.spendLines} empty="Nothing else spent in this range." onPick={setPick} acctName={acctName} hint="Tap a line to make it a bill, mark it a transfer, or merge it." />
      {flow.transferLines.length > 0 && <Section title="Transfers between your accounts" icon={<Shuffle size={14} className="text-muted" />} lines={flow.transferLines} muted empty="" onPick={setPick} acctName={acctName} hint="Card payments and moves to savings — not counted as spending." />}

      {pick && <MerchantActions line={pick} onClose={() => setPick(null)} />}
    </>
  );
}

function Section({ title, icon, lines, tone, muted, empty, extra, hint, onPick, acctName }: { title: string; icon: React.ReactNode; lines: FlowLine[]; tone?: "green"; muted?: boolean; empty: string; extra?: React.ReactNode; hint?: string; onPick: (l: FlowLine) => void; acctName: (id: string) => string }) {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between"><div className="flex items-center gap-1.5 text-sm font-semibold">{icon}{title}</div><div className={cx("text-sm font-bold", tone === "green" && "text-green", muted && "text-muted")}>{tone === "green" ? "+" : ""}{money(total)}</div></div>
      {hint && <div className="text-[11px] text-muted -mt-1">{hint}</div>}
      <Card>
        {lines.length === 0 && empty && <div className="px-4 py-3 text-xs text-muted">{empty}</div>}
        {lines.map((l) => (
          <button key={l.key} onClick={() => onPick(l)} className={cx("w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-line-soft last:border-b-0 hover:bg-surface/60", muted && "opacity-70")}>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold truncate">{l.name}{l.unreviewed && <span className="ml-2 text-[10px] font-semibold text-amber bg-amber/10 rounded px-1.5 py-0.5">unreviewed</span>}</div>
              <div className="text-[11px] text-muted truncate">{l.count > 1 ? `${l.count}× · ` : ""}{new Date(l.date + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}{l.accountIds.length ? ` · ${l.accountIds.map(acctName).join(", ")}` : ""}</div>
            </div>
            <div className={cx("text-[13px] font-bold", tone === "green" && "text-green")}>{tone === "green" ? "+" : ""}{money(l.amount)}</div>
          </button>
        ))}
        {extra}
      </Card>
    </div>
  );
}

/** What to do with a merchant: make it a bill, call it a transfer, merge it into another, rename, categorize. */
function MerchantActions({ line, onClose }: { line: FlowLine; onClose: () => void }) {
  const { data: d, update } = useHome();
  const data = d!;
  const isIncome = line.category === "income";
  const all = useMemo(() => merchantSummaries(data), [data]);
  const me = all.find((m) => m.key === line.key);
  const [name, setName] = useState(line.name);
  const [category, setCategory] = useState(line.category);
  const [mergeInto, setMergeInto] = useState("");
  const [query, setQuery] = useState("");
  if (isIncome) return <Modal open onClose={onClose} title={line.name}><div className="text-sm text-muted">Deposits are reviewed on <b>Bills → Income</b>: count them, ignore them, or attach them to a paycheck.</div></Modal>;
  const candidates = all.filter((m) => m.key !== line.key && m.kind !== "ignore" && (!query || m.name.toLowerCase().includes(query.toLowerCase()) || m.key.includes(query.toLowerCase()))).slice(0, 8);
  const makeBill = () => { if (!me) return; update((h) => { const b: Bill = merchantToBill(me, uid(), category); const next = { ...h, bills: [...h.bills, b] }; return { ...next, payments: [...next.payments, ...autoMarkPaid(next)] }; }, `bill from merchant: ${me.name}`); onClose(); };
  const setKind = (kind: "transfer" | "ignore" | "spend") => { update((h) => setMerchantPref(h, line.key, { kind }), `${line.name}: ${kind}`); onClose(); };
  const save = () => { update((h) => setMerchantPref(h, line.key, { name: name.trim() || undefined, category }), `updated ${line.name}`); onClose(); };
  const merge = () => { if (!mergeInto) return; update((h) => mergeMerchants(h, line.key, mergeInto), `merged ${line.name}`); onClose(); };
  return (
    <Modal open onClose={onClose} title={line.name}>
      {me && <div className="text-[12px] text-muted">{money(me.total)} across {me.count} transaction{me.count === 1 ? "" : "s"} since {new Date(me.firstSeen + "T12:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })} · about {money(me.perMonth)}/mo{me.recurring ? " · looks recurring" : ""}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Show as"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Category"><select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>{data.budgets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}<option value="other">Other</option></select></Field>
      </div>
      <div className="flex gap-2 flex-wrap">
        {!line.bill && <Button onClick={makeBill} className="h-10 px-3 text-xs"><Receipt size={13} className="inline -mt-0.5 mr-1" />Make this a bill{me ? ` · ${money(me.medianAmount)} around the ${me.medianDay}th` : ""}</Button>}
        {line.bill && <div className="text-xs text-muted self-center">Already the bill <b>{line.bill.name}</b> — edit it on the Bills page.</div>}
        <Button variant="secondary" onClick={() => setKind("transfer")} className="h-10 px-3 text-xs"><Shuffle size={13} className="inline -mt-0.5 mr-1" />It&apos;s a transfer</Button>
        <Button variant="secondary" onClick={() => setKind("ignore")} className="h-10 px-3 text-xs"><EyeOff size={13} className="inline -mt-0.5 mr-1" />Hide it</Button>
        {data.settings.merchants?.[line.key]?.kind && data.settings.merchants[line.key].kind !== "spend" && <Button variant="secondary" onClick={() => setKind("spend")} className="h-10 px-3 text-xs"><Undo2 size={13} className="inline -mt-0.5 mr-1" />Count as spending again</Button>}
      </div>
      <Field label="Merge into another merchant" hint="Same place showing up under two names? Pick the one to keep.">
        <div className="relative"><Search size={14} className="absolute left-3 top-3.5 text-muted" /><input className={cx(inputCls, "pl-9")} placeholder="Search merchants…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="flex flex-col gap-1 mt-2 max-h-40 overflow-y-auto">
          {candidates.map((m) => <button key={m.key} onClick={() => setMergeInto(m.key)} className={cx("text-left text-[12px] px-3 py-2 rounded-[10px] border", mergeInto === m.key ? "border-accent bg-accent-bg" : "border-line hover:border-field")}><b>{m.name}</b> <span className="text-muted">· {money(m.total)} · {m.count}×</span></button>)}
        </div>
      </Field>
      <div className="flex gap-2 pt-1">
        {mergeInto && <Button onClick={merge} className="flex-1"><Merge size={13} className="inline -mt-0.5 mr-1" />Merge into {all.find((m) => m.key === mergeInto)?.name}</Button>}
        <Button variant={mergeInto ? "secondary" : "primary"} className="flex-1" onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}

/* ------------------------------ Merchants ------------------------------ */

function MerchantsView({ today }: { today: Date }) {
  const { data: d, update } = useHome();
  const data = d!;
  const [span, setSpan] = useState<"3m" | "12m" | "all">("12m");
  const [filter, setFilter] = useState<"all" | "spend" | "bill" | "transfer" | "ignore">("all");
  const [q, setQ] = useState("");
  const from = span === "all" ? undefined : ymd(addMonths(today, span === "3m" ? -3 : -12));
  const all = useMemo(() => merchantSummaries(data, from), [data, from]);
  const similar = useMemo(() => similarMerchants(all), [all]);
  const list = all.filter((m) => (filter === "all" ? m.kind !== "ignore" : m.kind === filter) && (!q || m.name.toLowerCase().includes(q.toLowerCase()) || m.key.includes(q.toLowerCase())));
  const total = list.filter((m) => m.kind !== "transfer").reduce((s, m) => s + m.total, 0);
  const max = Math.max(1, ...list.map((m) => m.total));
  const [pick, setPick] = useState<MerchantSummary | null>(null);
  const catName = (id: string) => data.budgets.find((b) => b.id === id)?.name ?? "Other";
  const acctName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "—";
  const merge = (from: string, into: string) => update((h) => mergeMerchants(h, from, into), "merged merchants");

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="w-56"><Segmented size="sm" value={span} onChange={setSpan} options={[{ id: "3m", label: "3 mo" }, { id: "12m", label: "12 mo" }, { id: "all", label: "All" }]} /></div>
        <div className="relative flex-1 min-w-[180px] max-w-xs"><Search size={14} className="absolute left-3 top-3 text-muted" /><input className={cx(inputCls, "h-10 pl-9")} placeholder="Find a merchant…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="flex gap-1.5 flex-wrap text-[11px]">
        {(["all", "spend", "bill", "transfer", "ignore"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={cx("h-8 px-3 rounded-full border font-semibold", filter === f ? "bg-ink text-white border-ink" : "bg-card border-line text-muted hover:border-field")}>{{ all: "Everything", spend: "Spending", bill: "Bills", transfer: "Transfers", ignore: "Hidden" }[f]}</button>)}
        <div className="ml-auto self-center text-muted">{list.length} merchants · {money(total)}</div>
      </div>

      {similar.length > 0 && (
        <Card className="p-4 flex flex-col gap-2 border-accent-line bg-accent-bg/40">
          <div className="flex items-center gap-2"><Merge size={15} className="text-accent" /><div className="text-sm font-semibold">These might be the same place</div></div>
          {similar.map(([a, b]) => (
            <div key={a.key + b.key} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-[12px] bg-card border border-line px-3 py-2">
              <div className="flex-1 text-[12px] min-w-0"><b>{a.name}</b> <span className="text-muted">({money(a.total)})</span> &amp; <b>{b.name}</b> <span className="text-muted">({money(b.total)})</span></div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => merge(b.key, a.key)} className="h-8 px-2.5 rounded-[8px] bg-accent text-white text-[11px] font-semibold">Keep “{a.name.slice(0, 18)}”</button>
                <button onClick={() => merge(a.key, b.key)} className="h-8 px-2.5 rounded-[8px] bg-accent text-white text-[11px] font-semibold">Keep “{b.name.slice(0, 18)}”</button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card>
        {list.length === 0 && <div className="px-4 py-3 text-xs text-muted">No merchants yet — link a bank or add transactions.</div>}
        {list.map((m) => (
          <button key={m.key} onClick={() => setPick(m)} className="w-full text-left px-4 py-2.5 border-b border-line-soft last:border-b-0 hover:bg-surface/60">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate flex items-center gap-1.5">{m.name}
                  {m.kind === "bill" && <span className="text-[10px] font-semibold text-accent bg-accent-bg rounded px-1.5 py-0.5">bill</span>}
                  {m.kind === "transfer" && <span className="text-[10px] font-semibold text-muted bg-surface rounded px-1.5 py-0.5">transfer</span>}
                  {m.kind === "spend" && m.recurring && <span className="text-[10px] font-semibold text-amber bg-amber/10 rounded px-1.5 py-0.5">recurring · not a bill yet</span>}
                  {m.merged.length > 0 && <span className="text-[10px] text-muted">+{m.merged.length} merged</span>}
                </div>
                <div className="text-[11px] text-muted truncate">{m.count}× · {money(m.perMonth)}/mo over {m.months} mo · {catName(m.category)} · {m.accountIds.map(acctName).join(", ")}</div>
              </div>
              <div className="text-[13px] font-bold shrink-0">{money(m.total)}</div>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-line-soft overflow-hidden"><div className={cx("h-full rounded-full", m.kind === "bill" ? "bg-accent" : m.kind === "transfer" ? "bg-chip" : "bg-ink")} style={{ width: `${Math.max(2, (m.total / max) * 100)}%` }} /></div>
          </button>
        ))}
      </Card>
      {pick && <MerchantActions line={{ key: pick.key, name: pick.name, amount: pick.total, count: pick.count, accountIds: pick.accountIds, date: pick.lastSeen, bill: pick.bill, category: pick.category }} onClose={() => setPick(null)} />}
    </>
  );
}
