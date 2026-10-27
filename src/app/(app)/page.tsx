"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FocusBoard } from "@/components/FocusBoard";
import { Segmented } from "@/components/ui";
import Link from "next/link";
import { getDaysInMonth } from "date-fns";
import { useHome } from "@/store/useHome";
import { useToday } from "@/components/hooks";
import { PeriodToggle } from "@/components/PeriodToggle";
import { Card, Mark, Row, SectionTitle, cx, fmt, money } from "@/components/ui";
import { billStatuses, currentPeriod, inPeriod, periodLabel, weeklyProjection } from "@/lib/projections";
import { debtsFromAccounts, simulatePayoff, strategyMeta } from "@/lib/strategies";
import { CreditCard, BarChart3, CalendarDays, Sparkles } from "lucide-react";
import { detectIncome, detectRecurring } from "@/lib/detect";

export default function HomePage() {
  const { data: d, update } = useHome();
  const data = d!;
  const today = useToday();
  const params = useSearchParams();
  const [tab, setTab] = useState<"today" | "focus">(params.get("view") === "focus" ? "focus" : "today");
  const [period, setPeriod] = useState(() => currentPeriod(today, data.pay.splitDay));
  const dim = getDaysInMonth(today);

  const statuses = billStatuses(data, today).filter((s) => inPeriod(s.dueDate.getDate(), period, data.pay.splitDay));
  const total = statuses.reduce((s, b) => s + b.bill.amount, 0);
  const paid = statuses.filter((s) => s.paid).reduce((s, b) => s + b.bill.amount, 0);
  const pct = total ? Math.round((paid / total) * 100) : 0;
  const paycheck = data.pay.monthlyIncome / Math.max(1, data.pay.payDays.length);
  const weeks = weeklyProjection(data, today);
  const strat = strategyMeta(data.settings.strategy);
  const plan = simulatePayoff(debtsFromAccounts(data.accounts), data.settings.strategy, data.settings.extraPayment);
  const upcoming = [...statuses.filter((s) => !s.paid), ...statuses.filter((s) => s.paid)].slice(0, 4);
  const initials = data.homeName.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^the$/i.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "H";

  return (
    <>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[13px] text-muted">{today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · {data.homeName}</div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting(today)}</h1>
        </div>
        <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center text-sm font-semibold">{initials}</div>
      </div>
      <div className="md:max-w-xs"><Segmented value={tab} onChange={setTab} options={[{ id: "today", label: "Today" }, { id: "focus", label: "Focus board" }]} /></div>

      {tab === "focus" && <FocusBoard today={today} />}
      {tab === "today" && (<>
      {(() => {
        const inc = detectIncome(data, today);
        const top = inc[0];
        const already = top && data.pay.monthlyIncome === top.monthly && data.pay.payDays.join() === top.payDays.join();
        const billSg = detectRecurring(data, today).length;
        if (!top || already) return billSg > 0 ? (
          <Link href="/bills" className="block"><Card className="p-3.5 flex items-center gap-2.5 border-accent-line bg-accent-bg/40 hover:border-accent"><Sparkles size={16} className="text-accent shrink-0" /><div className="text-[13px]"><b>{billSg} recurring payment{billSg > 1 ? "s" : ""}</b> in your transactions look like bills — review them on Bills.</div><div className="ml-auto text-xs text-accent font-semibold">Review ›</div></Card></Link>
        ) : null;
        return (
          <Card className="p-4 flex flex-col gap-2.5 border-accent-line bg-accent-bg/40">
            <div className="flex items-center gap-2"><Sparkles size={16} className="text-accent" /><div className="text-sm font-semibold">Looks like this is your paycheck</div></div>
            <div className="text-[13px]"><b>{top.source}</b> · {money(top.perPaycheck)} {top.cadence === "semimonthly" ? `on the ${top.payDays.join(" and ")}` : top.cadence} · about <b>{money(top.monthly)}/mo</b>{inc.length > 1 ? ` (+${inc.length - 1} other source${inc.length > 2 ? "s" : ""})` : ""}</div>
            <div className="flex gap-2">
              <button onClick={() => update((h) => ({ ...h, pay: { ...h.pay, monthlyIncome: inc.reduce((s, x) => s + x.monthly, 0), payDays: top.payDays } }), "set pay schedule from transactions")} className="h-9 px-3 rounded-[10px] bg-accent text-white text-xs font-semibold hover:bg-accent-deep">Use this as my pay schedule</button>
              <Link href="/settings" className="h-9 px-3 rounded-[10px] border border-chip bg-card text-xs font-semibold flex items-center hover:border-field">Edit manually</Link>
            </div>
            {billSg > 0 && <div className="text-[11px] text-muted">Also found {billSg} recurring payment{billSg > 1 ? "s" : ""} that look like bills — <Link href="/bills" className="text-accent font-semibold">review on Bills</Link>.</div>}
          </Card>
        );
      })()}
      {(data.pay.monthlyIncome === 0 || data.bills.length === 0 || data.budgets.length === 0) && (
        <Card className="p-4 flex flex-col gap-3">
          <div className="text-[15px] font-semibold">Set up {data.homeName}</div>
          <div className="text-[13px] text-muted">Three things make everything else light up:</div>
          <div className="flex flex-col gap-2">
            <SetupRow done={data.pay.monthlyIncome > 0} href="/settings" label="Enter your take-home pay and paydays" sub="Settings → Pay schedule" />
            <SetupRow done={data.bills.length > 0} href="/bills" label="Add your bills with due days" sub="Bills → + Add a bill (or connect a biller later)" />
            <SetupRow done={data.budgets.length > 0} href="/plan?view=budget" label="Create budget categories" sub="Plan → Budget → + Add a budget category" />
            <SetupRow done={data.accounts.length > 0} href="/accounts" label="Connect or add your accounts" sub="Accounts → Connect a bank (Plaid) or + Add" optional />
          </div>
        </Card>
      )}

      <div className="md:grid md:grid-cols-12 md:gap-6 flex flex-col gap-4">
        <div className="md:col-span-5 flex flex-col gap-4">
          <PeriodToggle value={period} onChange={setPeriod} splitDay={data.pay.splitDay} daysInMonth={dim} />
          <Card dark className="p-5 flex flex-col gap-3.5">
            <div className="text-[11px] uppercase tracking-[0.06em] text-muted-3">This pay period · {periodLabel(today, period, data.pay.splitDay)}</div>
            <div className="flex items-baseline gap-2"><div className="text-[34px] font-bold tracking-tight">{money(total - paid)}</div><div className="text-[13px] text-muted-3">left to pay</div></div>
            <div className="h-2 rounded-full bg-ink-2 overflow-hidden"><div className="h-2 rounded-full bg-teal" style={{ width: `${pct}%` }} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><div className="text-[11px] text-muted-3">Paycheck</div><div className="text-[15px] font-semibold">{money(paycheck)}</div></div>
              <div><div className="text-[11px] text-muted-3">Bills due</div><div className="text-[15px] font-semibold">{money(total)}</div></div>
              <div><div className="text-[11px] text-muted-3">Paid so far</div><div className="text-[15px] font-semibold">{money(paid)}</div></div>
            </div>
          </Card>

          <SectionTitle action={<Link href="/bills?view=weeks" className="text-[13px] font-semibold text-accent">Details</Link>}>Week by week</SectionTitle>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((w) => (
              <div key={w.index} className={cx("rounded-[12px] border px-1.5 py-2.5 flex flex-col items-center gap-1", w.state === "current" ? "bg-ink border-ink text-white" : "bg-card border-line")}>
                <div className={cx("text-[10px] font-semibold", w.state === "current" ? "text-muted-3" : "text-muted")}>W{w.index + 1}</div>
                <div className={cx("text-[13px] font-bold", w.endBalance < 0 ? "text-red" : "")}>${short(w.endBalance)}</div>
                <div className={cx("text-[9px]", w.state === "current" ? "text-muted-3" : "text-muted")}>end bal</div>
              </div>
            ))}
          </div>
        </div>

        <div className="md:col-span-7 flex flex-col gap-4">
          <SectionTitle action={<Link href="/bills" className="text-[13px] font-semibold text-accent">See calendar</Link>}>Due in this period</SectionTitle>
          <Card>
            {upcoming.length === 0 && <div className="p-4 text-sm text-muted">No bills in this period.</div>}
            {upcoming.map((s) => (
              <Row key={s.bill.id} left={<Mark>{s.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Mark>} title={s.bill.name}
                sub={data.accounts.find((a) => a.id === s.bill.accountId)?.institution ?? data.budgets.find((b) => b.id === s.bill.category)?.name ?? ""}
                right={money(s.bill.amount)} rightSub={s.paid ? "Paid" : s.overdue ? "Overdue" : "Due"} rightTone={s.paid ? "text-green" : s.overdue ? "text-red" : "text-amber"} />
            ))}
          </Card>

          <SectionTitle>Your plan</SectionTitle>
          <Link href="/plan" className="block">
            <Card className="p-4 flex flex-col gap-2 hover:border-field">
              <div className="flex items-center justify-between"><div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-accent">{strat.name}</div><div className="text-xs text-muted">Change ›</div></div>
              <div className="text-[15px] font-semibold">{strat.headline}</div>
              <div className="text-[13px] text-muted leading-snug">
                {strat.kind === "payoff" && plan.months > 0
                  ? `Debt-free in ${plan.months} months with $${fmt(data.settings.extraPayment)}/mo extra · next target: ${plan.order[0]?.name}`
                  : strat.kind === "payoff" ? "No debts tracked — add credit or loan accounts to see a payoff plan." : `Target split of $${fmt(data.pay.monthlyIncome)}/mo — see where you land.`}
              </div>
            </Card>
          </Link>

          <div className="grid grid-cols-3 gap-2.5">
            <Quick href="/accounts" icon={<CreditCard size={20} className="text-accent" />} label="Accounts" />
            <Quick href="/plan?view=budget" icon={<BarChart3 size={20} className="text-accent" />} label="Budget" />
            <Quick href="/bills?view=year" icon={<CalendarDays size={20} className="text-accent" />} label="Year view" />
          </div>
        </div>
      </div>
      </>)}
    </>
  );
}

const SetupRow = ({ done, href, label, sub, optional }: { done: boolean; href: string; label: string; sub: string; optional?: boolean }) => (
  <Link href={href} className={cx("flex items-center gap-3 rounded-[12px] border px-3 py-2.5 hover:border-field", done ? "border-line-soft bg-surface/60" : "border-line bg-card")}>
    <div className={cx("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0", done ? "bg-green border-green" : "border-field")}>{done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>}</div>
    <div className="flex-1 min-w-0"><div className={cx("text-[13px] font-semibold", done && "line-through text-muted")}>{label}{optional && !done && <span className="text-muted font-normal"> (optional)</span>}</div><div className="text-[11px] text-muted">{sub}</div></div>
    <div className="text-xs text-muted">›</div>
  </Link>
);

const Quick = ({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) => (
  <Link href={href} className="h-[72px] rounded-[14px] border border-line bg-card flex flex-col items-center justify-center gap-1.5 text-xs font-semibold hover:border-field">{icon}{label}</Link>
);

const short = (n: number) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(Math.round(n)));
const greeting = (d: Date) => (d.getHours() < 12 ? "Good morning" : d.getHours() < 18 ? "Good afternoon" : "Good evening");
