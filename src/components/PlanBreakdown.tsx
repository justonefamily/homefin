"use client";
import Link from "next/link";
import { useHome } from "@/store/useHome";
import { useItem } from "@/store/useItem";
import { Modal, cx, money } from "./ui";
import { flowFor } from "@/lib/merchants";
import { monthlyOf } from "@/lib/detect";
import { debtsFromAccounts, strategyMeta } from "@/lib/strategies";
import type { PlanMonth } from "@/lib/yearplan";
import { getDaysInMonth } from "date-fns";

export type BreakdownKind = "income" | "outgo" | "debt" | "landmarks";
const TITLE: Record<BreakdownKind, string> = { income: "Income", outgo: "Bills + everyday", debt: "Extra toward debt", landmarks: "Landmarks" };
const ord = (n: number) => (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

function Line({ name, sub, amount, onClick, tone }: { name: string; sub?: string; amount: number; onClick?: () => void; tone?: string }) {
  const inner = <><div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate">{name}</div>{sub && <div className="text-[11px] text-muted truncate">{sub}</div>}</div><div className={cx("text-[13px] font-semibold shrink-0", tone)}>{money(amount)}</div></>;
  const cls = "w-full flex items-center gap-3 px-3 py-2 border-b border-line-soft last:border-b-0 text-left";
  return onClick ? <button onClick={onClick} className={cx(cls, "hover:bg-surface/60")}>{inner}</button> : <div className={cls}>{inner}</div>;
}
const Group = ({ title, total, children }: { title: string; total?: number; children: React.ReactNode }) => (
  <div className="rounded-[12px] border border-line overflow-hidden">
    <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-muted bg-surface border-b border-line"><span>{title}</span>{total !== undefined && <span>{money(total)}</span>}</div>
    {children}
  </div>
);

/** What's behind a number on the year plan — the sources (plan) or the bank's lines (actual) — with a way to change each. */
export function PlanBreakdown({ month, kind, onClose, onEditLandmark }: { month: PlanMonth; kind: BreakdownKind; onClose: () => void; onEditLandmark: (id: string) => void }) {
  const data = useHome((s) => s.data)!;
  const openItem = useItem((s) => s.openItem);
  const [y, m] = month.key.split("-").map(Number);
  const dim = getDaysInMonth(new Date(y, m - 1, 1));
  const actual = month.source !== "plan" ? flowFor(data, `${month.key}-01`, `${month.key}-${String(dim).padStart(2, "0")}`) : null;
  const value = kind === "income" ? month.income : kind === "outgo" ? month.bills + month.everyday : kind === "debt" ? month.debtExtra : month.landmarkTotal;
  const sourceNote = month.source === "actual" ? "What the bank recorded this month." : month.source === "blend" ? "What the bank has recorded so far this month, plus the plan for the days left." : "What the plan assumes. Change the inputs and this number follows.";

  return (
    <Modal open onClose={onClose} title={`${TITLE[kind]} · ${new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })}`}>
      <div className="flex items-baseline justify-between -mt-1"><div className="text-[26px] font-bold tracking-tight">{money(value)}</div><span className={cx("text-[10px] font-semibold rounded px-1.5 py-0.5", month.source === "plan" ? "bg-surface text-muted" : month.source === "actual" ? "bg-accent-bg text-accent" : "bg-amber-bg text-amber")}>{month.source === "plan" ? "plan" : month.source === "actual" ? "actual" : "so far + plan"}</span></div>
      <div className="text-[12px] text-muted -mt-2">{sourceNote}</div>

      {kind === "income" && (
        <>
          {actual && <Group title="Came in (counted deposits)" total={actual.income}>
            {actual.incomeLines.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">Nothing counted yet this month.</div>}
            {actual.incomeLines.map((l) => <Line key={l.key} name={l.name} sub={`${l.count}× · ${new Date(l.date + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}${l.unreviewed ? " · unreviewed" : ""}`} amount={l.amount} tone="text-green" />)}
          </Group>}
          {month.source !== "actual" && <Group title={month.source === "blend" ? "Plan for the rest of the month" : "Expected each month"} total={month.source === "blend" ? undefined : month.income}>
            {(data.incomeSources ?? []).length === 0 && <Line name="Monthly income from Settings" sub="No income source confirmed yet — this is the manual number. Confirm a paycheck on Bills → Income to make it real." amount={data.pay.monthlyIncome} />}
            {(data.incomeSources ?? []).map((s) => <Line key={s.id} name={s.name} sub={`${money(s.expected)} ${s.cadence}${s.payDays.length ? ` · around the ${s.payDays.map((d) => d + ord(d)).join(" & ")}` : ""}`} amount={monthlyOf(s.expected, s.cadence)} tone="text-green" />)}
          </Group>}
          <div className="text-[11px] text-muted">Edit expected income on <Link href="/bills" className="text-accent font-semibold">Bills → Income</Link>.</div>
        </>
      )}

      {kind === "outgo" && (
        <>
          {actual && <>
            <Group title="Bills paid" total={actual.bills}>
              {actual.billLines.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">No bill payments recorded yet.</div>}
              {actual.billLines.map((l) => <Line key={l.key} name={l.name} sub={`${l.count}× · ${new Date(l.date + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`} amount={l.amount} onClick={() => openItem(l.key)} />)}
            </Group>
            <Group title="Everything else" total={actual.spending}>
              {actual.spendLines.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">Nothing else spent yet.</div>}
              {actual.spendLines.slice(0, 30).map((l) => <Line key={l.key} name={l.name} sub={`${l.count}× · ${data.budgets.find((b) => b.id === l.category)?.name ?? "Other"}`} amount={l.amount} onClick={() => openItem(l.key)} />)}
            </Group>
          </>}
          {month.source !== "actual" && <>
            <Group title={month.source === "blend" ? "Bills still ahead this month (plan)" : "Bills"} total={month.source === "blend" ? undefined : data.bills.reduce((s, b) => s + b.amount, 0)}>
              {data.bills.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">No bills set up yet.</div>}
              {data.bills.slice().sort((a, b) => a.dueDay - b.dueDay).map((b) => <Line key={b.id} name={b.name} sub={`Due the ${b.dueDay}${ord(b.dueDay)} · ${data.budgets.find((c) => c.id === b.category)?.name ?? "Other"}${b.autopay ? " · autopay" : ""}`} amount={b.amount} onClick={() => openItem(b.merchant ?? b.name.toLowerCase())} />)}
            </Group>
            <Group title="Everyday spending (estimate)" total={data.settings.everydaySpend}>
              <Line name="Groceries, gas, dining, the rest" sub="From Settings → everyday spending. Set it from last quarter's average on Plan → Budget." amount={data.settings.everydaySpend} />
            </Group>
          </>}
        </>
      )}

      {kind === "debt" && (
        <>
          <Group title="Settings" total={data.settings.extraPayment}>
            <Line name={`Extra toward debt each month`} sub={`Strategy: ${strategyMeta(data.settings.strategy).name} — ${strategyMeta(data.settings.strategy).headline}`} amount={data.settings.extraPayment} />
          </Group>
          <Group title="Debts it goes toward (balances today)">
            {debtsFromAccounts(data.accounts).length === 0 && <div className="px-3 py-2 text-[12px] text-muted">No debts tracked.</div>}
            {debtsFromAccounts(data.accounts).map((d) => <Line key={d.id} name={d.name} sub={`${d.apr}% APR · minimum ${money(d.min)}`} amount={d.balance} tone="text-red" />)}
          </Group>
          <div className="text-[11px] text-muted">{month.debtExtra === 0 && month.source !== "actual" ? "Zero here means the plan has every debt paid off by this month." : "Minimum payments are counted in Bills when they're set up as bills; this is only the extra."}</div>
        </>
      )}

      {kind === "landmarks" && (
        <Group title="Landmarks this month" total={month.landmarkTotal}>
          {month.landmarks.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">None this month.</div>}
          {month.landmarks.map((l) => <Line key={l.id} name={l.name} sub={`${l.amount < 0 ? "money in" : "money out"}${l.note ? ` · ${l.note}` : ""}`} amount={Math.abs(l.amount)} tone={l.amount < 0 ? "text-green" : "text-amber"} onClick={() => { onClose(); onEditLandmark(l.id); }} />)}
        </Group>
      )}
    </Modal>
  );
}
