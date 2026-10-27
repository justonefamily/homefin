"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { getDaysInMonth, startOfMonth } from "date-fns";
import { Check } from "lucide-react";
import { useHome } from "@/store/useHome";
import { useToday } from "@/components/hooks";
import { PeriodToggle } from "@/components/PeriodToggle";
import { BillForm } from "@/components/BillForm";
import { Button, Card, Eyebrow, Segmented, SectionTitle, Stat, cx, fmt, money } from "@/components/ui";
import { billStatuses, currentPeriod, inPeriod, periodLabel, weeklyProjection, yearProjection } from "@/lib/projections";
import { monthKey } from "@/lib/strategies";
import type { Bill } from "@/lib/types";
import { autoMarkPaid, detectRecurring, suggestionToBill, type Suggestion } from "@/lib/detect";
import { uid } from "@/lib/storage/adapter";
import { Sparkles } from "lucide-react";

type View = "month" | "weeks" | "year";

export default function BillsPage() {
  const params = useSearchParams();
  const { data: d, update } = useHome();
  const data = d!;
  const today = useToday();
  const [view, setView] = useState<View>((params.get("view") as View) || "month");
  const [period, setPeriod] = useState(() => currentPeriod(today, data.pay.splitDay));
  const [editing, setEditing] = useState<Bill | "new" | null>(null);
  const dim = getDaysInMonth(today);
  const month = monthKey(today);

  const statuses = billStatuses(data, today);
  const periodBills = statuses.filter((s) => inPeriod(s.dueDate.getDate(), period, data.pay.splitDay));
  const periodTotal = periodBills.reduce((s, b) => s + b.bill.amount, 0);

  const togglePaid = (bill: Bill, paid: boolean) =>
    update((h) => ({ ...h, payments: paid ? h.payments.filter((p) => !(p.billId === bill.id && p.month === month)) : [...h.payments, { billId: bill.id, month, paidAt: new Date().toISOString(), amount: bill.amount }] }),
      paid ? `unmarked ${bill.name}` : `marked ${bill.name} paid`);

  const suggestions = detectRecurring(data, today);
  const confirmSuggestion = (sg: Suggestion) => update((h) => {
    const bill = suggestionToBill(sg, uid());
    const next = { ...h, bills: [...h.bills, bill] };
    return { ...next, payments: [...next.payments, ...autoMarkPaid(next)] };
  }, `added bill ${sg.name} from transactions`);
  const dismissSuggestion = (sg: Suggestion) => update((h) => ({ ...h, settings: { ...h.settings, dismissedSuggestions: [...(h.settings.dismissedSuggestions ?? []), sg.key] } }), `not a bill: ${sg.name}`);

  const saveBill = (b: Bill) => update((h) => ({ ...h, bills: h.bills.some((x) => x.id === b.id) ? h.bills.map((x) => (x.id === b.id ? b : x)) : [...h.bills, b] }), `saved bill ${b.name}`);
  const deleteBill = (id: string) => update((h) => ({ ...h, bills: h.bills.filter((b) => b.id !== id), payments: h.payments.filter((p) => p.billId !== id) }), "deleted bill");

  // Calendar cells
  const first = startOfMonth(today);
  const cells: { day: number | null }[] = [...Array(first.getDay()).fill({ day: null }), ...Array.from({ length: dim }, (_, i) => ({ day: i + 1 }))];

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Bills</h1>
        <div className="text-[13px] text-muted">{view === "year" ? today.getFullYear() : today.toLocaleString("en-US", { month: "long", year: "numeric" })}</div>
      </div>
      <div className="md:max-w-sm"><Segmented value={view} onChange={setView} options={[{ id: "month", label: "Month" }, { id: "weeks", label: "Weeks" }, { id: "year", label: "Year" }]} /></div>

      {view === "month" && suggestions.length > 0 && (
        <Card className="p-4 flex flex-col gap-3 border-accent-line bg-accent-bg/40">
          <div className="flex items-center gap-2"><Sparkles size={16} className="text-accent" /><div className="text-sm font-semibold">Looks like these are bills</div><div className="text-xs text-muted">· found in your transactions</div></div>
          <div className="flex flex-col gap-2">
            {suggestions.slice(0, 8).map((sg) => (
              <div key={sg.key} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-[12px] bg-card border border-line px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate">{sg.name}</div>
                  <div className="text-[11px] text-muted">{money(sg.amount)} {sg.cadence === "monthly" ? `around the ${sg.dueDay}${ord(sg.dueDay)}` : sg.cadence} · seen {sg.occurrences}× since {new Date(sg.firstSeen).toLocaleDateString("en-US", { month: "short", year: "numeric" })} · {data.budgets.find((b) => b.id === sg.category)?.name ?? "uncategorized"}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => confirmSuggestion(sg)} className="h-9 px-3 rounded-[10px] bg-accent text-white text-xs font-semibold hover:bg-accent-deep">Yes, it&apos;s a bill</button>
                  <button onClick={() => dismissSuggestion(sg)} className="h-9 px-3 rounded-[10px] border border-chip bg-card text-xs font-semibold hover:border-field">Not a bill</button>
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-muted">Confirming adds the bill and marks every month it was already paid. Edit the amount, due day or category afterwards by tapping the bill.</div>
        </Card>
      )}

      {view === "month" && (
        <div className="md:grid md:grid-cols-12 md:gap-6 flex flex-col gap-4">
          <div className="md:col-span-5 flex flex-col gap-4">
            <PeriodToggle value={period} onChange={setPeriod} splitDay={data.pay.splitDay} daysInMonth={dim} size="sm" />
            <Card className="p-3.5 flex flex-col gap-2">
              <div className="grid grid-cols-7 gap-1">{["S", "M", "T", "W", "T", "F", "S"].map((w, i) => <div key={i} className="text-center text-[11px] font-semibold text-muted">{w}</div>)}</div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((c, i) => {
                  if (!c.day) return <div key={i} />;
                  const day = c.day;
                  const bills = statuses.filter((s) => s.dueDate.getDate() === day);
                  const isToday = day === today.getDate();
                  const sel = inPeriod(day, period, data.pay.splitDay);
                  const isPay = data.pay.payDays.includes(day);
                  return (
                    <button key={i} onClick={() => setPeriod(day <= data.pay.splitDay ? "a" : "b")} aria-label={`${today.toLocaleString("en-US", { month: "long" })} ${day}${bills.length ? `, ${bills.length} bill${bills.length > 1 ? "s" : ""}` : ""}`}
                      className={cx("h-11 md:h-14 rounded-[10px] flex flex-col items-center justify-center gap-0.5 text-[13px]", isToday ? "bg-ink text-white font-bold" : sel ? "bg-accent-soft font-medium" : "font-medium hover:bg-surface")}>
                      <div>{day}</div>
                      <div className="flex gap-0.5 h-1.5">
                        {bills.slice(0, 3).map((b) => <div key={b.bill.id} className={cx("w-1.5 h-1.5 rounded-full", b.paid ? "bg-green" : "bg-amber")} />)}
                        {isPay && <div className="w-1.5 h-1.5 rounded-full bg-teal" />}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3.5 text-[11px] text-muted pt-1">
                <Legend className="bg-accent-soft w-2.5 h-2.5 rounded-[3px]">Selected period</Legend>
                <Legend className="bg-amber">Bill due</Legend>
                <Legend className="bg-green">Paid</Legend>
                <Legend className="bg-teal">Payday</Legend>
              </div>
            </Card>
          </div>

          <div className="md:col-span-7 flex flex-col gap-4">
            <SectionTitle action={<span className="text-xs text-muted">tap to mark paid</span>}>{periodLabel(today, period, data.pay.splitDay)} · {money(periodTotal)}</SectionTitle>
            <Card>
              {periodBills.length === 0 && <div className="p-4 text-sm text-muted">No bills due in this period.</div>}
              {periodBills.map((s) => (
                <div key={s.bill.id} className="flex items-center gap-3 px-4 py-3 border-b border-line-soft last:border-b-0 min-h-16">
                  <button onClick={() => togglePaid(s.bill, s.paid)} aria-label={s.paid ? `Mark ${s.bill.name} unpaid` : `Mark ${s.bill.name} paid`} aria-pressed={s.paid}
                    className={cx("w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0", s.paid ? "bg-green border-green" : "border-field bg-card")}>
                    {s.paid && <Check size={13} className="text-white" strokeWidth={3} />}
                  </button>
                  <button onClick={() => setEditing(s.bill)} className="flex-1 min-w-0 flex flex-col gap-0.5 text-left">
                    <div className="text-sm font-semibold truncate">{s.bill.name}</div>
                    <div className="text-xs text-muted truncate">Due {s.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {data.accounts.find((a) => a.id === s.bill.accountId)?.institution ?? data.budgets.find((b) => b.id === s.bill.category)?.name} · autopay {s.bill.autopay ? "on" : "off"}</div>
                  </button>
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="text-sm font-semibold">{money(s.bill.amount)}</div>
                    <div className={cx("text-[11px] font-semibold", s.paid ? "text-green" : s.overdue ? "text-red" : "text-amber")}>{s.paid ? "Paid" : s.overdue ? "Overdue" : "Due"}</div>
                  </div>
                </div>
              ))}
            </Card>
            <Button variant="dashed" onClick={() => setEditing("new")}>+ Add a bill</Button>
          </div>
        </div>
      )}

      {view === "weeks" && <WeeksView />}
      {view === "year" && <YearView />}

      {editing && <BillForm open onClose={() => setEditing(null)} data={data} bill={editing === "new" ? undefined : editing} onSave={saveBill} onDelete={deleteBill} />}
    </>
  );
}

const ord = (n: number) => (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

const Legend = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-1.5"><div className={cx("w-1.5 h-1.5 rounded-full", className)} />{children}</div>
);

function WeeksView() {
  const data = useHome((s) => s.data)!;
  const today = useToday();
  const weeks = weeklyProjection(data, today);
  const max = Math.max(1, ...weeks.map((w) => Math.abs(w.endBalance)));
  return (
    <div className="md:grid md:grid-cols-12 md:gap-6 flex flex-col gap-4">
      <div className="md:col-span-5 flex flex-col gap-4">
        <div className="text-[13px] text-muted leading-snug">Forward-looking: paychecks in, bills out, and what should be left in checking at the end of each week (Sun–Sat). Everyday spending is spread evenly from your monthly estimate.</div>
        <Card className="p-4 flex flex-col gap-2.5">
          <Eyebrow>Ending balance by week</Eyebrow>
          <div className="grid gap-2 items-end h-[140px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((w) => (
              <div key={w.index} className="flex flex-col items-center justify-end gap-1 h-full">
                <div className="text-[10px] font-semibold">{money(w.endBalance)}</div>
                <div className={cx("w-full rounded-t-[6px]", w.endBalance < 0 ? "bg-red" : w.state === "current" ? "bg-ink" : w.state === "past" ? "bg-accent" : "bg-teal-soft")} style={{ height: `${Math.max(4, (Math.abs(w.endBalance) / max) * 100)}px` }} />
              </div>
            ))}
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((w) => <div key={w.index} className={cx("text-center text-[10px] font-semibold", w.state === "current" ? "text-ink" : "text-muted")}>W{w.index + 1}</div>)}
          </div>
        </Card>
      </div>
      <Card className="md:col-span-7">
        {weeks.map((w) => (
          <div key={w.index} className={cx("flex flex-col gap-2 px-4 py-3 border-b border-line-soft last:border-b-0", w.state === "current" && "bg-accent-bg/50")}>
            <div className="flex items-center justify-between"><div className="text-sm font-semibold">{w.label}</div><div className={cx("text-[11px] font-semibold uppercase", w.state === "current" ? "text-accent" : "text-muted")}>{w.state === "current" ? "This week" : w.state}</div></div>
            <div className="grid grid-cols-4 gap-1.5">
              <Mini label="Start" value={money(w.startBalance)} />
              <Mini label="In" value={`+${money(w.income)}`} cls="text-green" />
              <Mini label="Out" value={`−${money(w.bills + w.everyday)}`} cls="text-red" />
              <Mini label="End" value={money(w.endBalance)} cls={cx("font-bold", w.endBalance < 0 && "text-red")} />
            </div>
            <div className="text-[11px] text-muted">{w.billNames.length ? w.billNames.join(", ") : "No bills"} + {money(w.everyday)} everyday spend</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

const Mini = ({ label, value, cls }: { label: string; value: string; cls?: string }) => (
  <div className="flex flex-col gap-0.5 min-w-0"><div className="text-[10px] text-muted">{label}</div><div className={cx("text-[13px] font-semibold truncate", cls)}>{value}</div></div>
);

function YearView() {
  const data = useHome((s) => s.data)!;
  const today = useToday();
  const months = yearProjection(data, today);
  const inc = months.reduce((s, m) => s + m.income, 0);
  const bills = months.reduce((s, m) => s + m.bills, 0);
  const net = months.reduce((s, m) => s + m.net, 0);
  const max = Math.max(1, ...months.map((m) => Math.abs(m.net)));
  return (
    <div className="flex flex-col gap-4">
      <div className="text-[13px] text-muted leading-snug">Past months use what was actually recorded; the rest are projected from your current bills, income, everyday spending and extra debt payment.</div>
      <div className="grid grid-cols-3 gap-2.5 md:max-w-xl">
        <Stat dark label="Income (year)" value={money(inc)} />
        <Stat label="Bills (year)" value={money(bills)} />
        <Stat label="Left over (year)" value={money(net)} tone={net >= 0 ? "green" : "red"} />
      </div>
      <div className="md:grid md:grid-cols-12 md:gap-6 flex flex-col gap-4">
        <Card className="md:col-span-5 p-4 flex flex-col gap-2.5">
          <Eyebrow>Left over each month</Eyebrow>
          <div className="grid grid-cols-12 gap-1 items-end h-[120px]">
            {months.map((m) => (
              <div key={m.key} className="flex flex-col justify-end h-full">
                <div className={cx("w-full rounded-t-[4px]", m.net < 0 ? "bg-red" : m.state === "future" ? "bg-teal-soft" : m.state === "current" ? "bg-ink" : "bg-accent")} style={{ height: `${Math.max(3, (Math.abs(m.net) / max) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-12 gap-1">{months.map((m) => <div key={m.key} className={cx("text-center text-[9px] font-semibold", m.state === "current" ? "text-ink" : "text-muted")}>{m.name[0]}</div>)}</div>
          <div className="flex gap-3.5 text-[11px] text-muted"><Legend className="bg-accent">Actual</Legend><Legend className="bg-teal-soft">Projected</Legend></div>
        </Card>
        <div className="md:col-span-7 grid grid-cols-3 md:grid-cols-4 gap-2">
          {months.map((m) => (
            <div key={m.key} className={cx("rounded-[14px] border p-3 flex flex-col gap-1", m.state === "current" ? "bg-ink border-ink text-white" : m.state === "future" ? "bg-card border-accent-line" : "bg-card border-line")}>
              <div className="flex items-center justify-between"><div className="text-xs font-bold">{m.name}</div><div className={cx("text-[9px] font-semibold", m.state === "current" ? "text-muted-3" : "text-accent")}>{m.state === "future" ? "PROJ" : m.state === "current" ? "NOW" : ""}</div></div>
              <div className={cx("text-[10px]", m.state === "current" ? "text-muted-3" : "text-muted")}>bills ${fmt(m.bills)}</div>
              <div className={cx("text-[13px] font-bold", m.net < 0 ? "text-red" : m.state === "current" ? "text-teal" : "text-green")}>{money(m.net)}{m.state === "future" ? " est." : ""}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
