"use client";
import { useMemo, useState } from "react";
import { EyeOff, Merge, Receipt, Search, Shuffle, Undo2, Ban, Check } from "lucide-react";
import { useHome } from "@/store/useHome";
import { useItem } from "@/store/useItem";
import { Button, Field, Modal, cx, inputCls, money, selectCls } from "./ui";
import { billKeyMap, merchantSummaries, merchantToBill, mergeMerchants, prefFor, resolveKey, setMerchantPref, txKey } from "@/lib/merchants";
import { autoMarkPaid, detectRecurring, merchantKey, suggestionToBill } from "@/lib/detect";
import { brandColorFor } from "@/lib/brands";
import { uid } from "@/lib/storage/adapter";
import type { Bill, HomeData, IncomeEvent } from "@/lib/types";

const ord = (n: number) => (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");
const day = (d: string) => new Date(d + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const monthYear = (d: string) => new Date(d + "T12:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-0.5 min-w-0"><div className="text-[10px] font-semibold text-muted">{label}</div><div className="text-[13px] font-semibold truncate">{children}</div></div>;
}

function AccountChip({ data, id }: { data: HomeData; id: string }) {
  const a = data.accounts.find((x) => x.id === id);
  const color = a?.brandColor ?? brandColorFor(a?.institution ?? "") ?? "#9aa3b2";
  return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full border border-line bg-card px-2 py-0.5"><i className="w-2 h-2 rounded-full" style={{ background: color }} />{a ? `${a.institution} · ${a.name}` : "Removed account"}</span>;
}

/**
 * The item page for anything that came out of an account: everything the bank told us (every transaction, raw
 * descriptions, accounts, dates) plus everything we decided about it (bill / not a bill / transfer, category, name,
 * merges) — and the controls to change those decisions. Open it from any line item in the app.
 */
export function ItemSheet({ merchantKey: rawKey, onClose }: { merchantKey: string; onClose: () => void }) {
  const { data: d, update } = useHome();
  const data = d!;
  const key = resolveKey(data, rawKey);
  const all = useMemo(() => merchantSummaries(data), [data]);
  const me = all.find((m) => m.key === key);
  const txs = useMemo(() => data.transactions.filter((t) => t.amount > 0 && txKey(data, t) === key).sort((a, b) => b.date.localeCompare(a.date)), [data, key]);
  const rawNames = [...new Set(txs.map((t) => t.description))];
  const pref = prefFor(data, key);
  const suggestion = useMemo(() => detectRecurring(data).find((s) => s.key === key), [data, key]);
  const dismissed = (data.settings.dismissedSuggestions ?? []).includes(key);
  const bill = me?.bill ?? billKeyMap(data).get(key);
  const displayName = pref.name ?? bill?.name ?? rawNames[0] ?? rawKey;
  const [name, setName] = useState(displayName);
  const [category, setCategory] = useState(me?.category ?? bill?.category ?? txs[0]?.category ?? "other");
  const [mergeInto, setMergeInto] = useState("");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const catName = (id: string) => data.budgets.find((b) => b.id === id)?.name ?? "Other";
  const status = pref.kind === "ignore" ? "Hidden" : pref.kind === "transfer" || (txs[0]?.transfer && pref.kind !== "spend") ? "Transfer between your accounts" : bill ? `Bill · ${bill.name}` : me?.kind === "reimbursable" ? "Reimbursable — money comes back" : dismissed ? "Not a bill (you said)" : suggestion ? "Looks like a bill — not confirmed" : "Everyday spending";

  const note = (s: string) => `${displayName}: ${s}`;
  const makeBill = () => { update((h) => {
    const b: Bill | null = suggestion ? { ...suggestionToBill(suggestion, uid()), category } : me ? merchantToBill(me, uid(), category) : null;
    if (!b) return h;
    b.name = name.trim() || b.name; // the name you gave it is the bill's name
    // A payment you call a bill is money out — even if the bank filed it as a transfer (a car note to a loan at the same bank, say).
    let next = setMerchantPref(h, key, { kind: "spend", name: name.trim() && name.trim() !== rawNames[0] ? name.trim() : pref.name, category });
    next = { ...next, bills: [...next.bills, b], settings: { ...next.settings, dismissedSuggestions: (next.settings.dismissedSuggestions ?? []).filter((k) => k !== key) } };
    return { ...next, payments: [...next.payments, ...autoMarkPaid(next)] };
  }, note("it's a bill")); onClose(); };
  const notABill = () => { update((h) => ({ ...h, bills: h.bills.filter((b) => b.id !== bill?.id), payments: h.payments.filter((p) => p.billId !== bill?.id), settings: { ...h.settings, dismissedSuggestions: [...new Set([...(h.settings.dismissedSuggestions ?? []), key])] } }), note("not a bill")); onClose(); };
  const suggestAgain = () => { update((h) => ({ ...h, settings: { ...h.settings, dismissedSuggestions: (h.settings.dismissedSuggestions ?? []).filter((k) => k !== key) } }), note("suggest again")); onClose(); };
  const setKind = (kind: "transfer" | "ignore" | "spend") => { update((h) => setMerchantPref(h, key, { kind }), note(kind)); onClose(); };
  /** One name, everywhere: the merchant pref carries it, and any bill for this merchant takes the same name. Cleared → back to the bank's name. */
  const save = () => { update((h) => {
    const custom = name.trim() && name.trim() !== rawNames[0] ? name.trim() : undefined;
    const next = setMerchantPref(h, key, { name: custom, category });
    const shown = custom ?? rawNames[0] ?? bill?.name;
    return { ...next, bills: next.bills.map((b) => (bill && b.id === bill.id && shown ? { ...b, name: shown, category } : b)) };
  }, note("renamed")); onClose(); };
  const merge = () => { if (!mergeInto) return; update((h) => mergeMerchants(h, key, mergeInto), note("merged")); onClose(); };
  const candidates = all.filter((m) => m.key !== key && m.kind !== "ignore" && (!query || m.name.toLowerCase().includes(query.toLowerCase()) || m.key.includes(query.toLowerCase()))).slice(0, 8);
  const shown = showAll ? txs : txs.slice(0, 8);

  return (
    <Modal open onClose={onClose} title={displayName}>
      {/* What the bank says */}
      {rawNames.length > 0 && <div className="text-[12px] text-muted -mt-2 leading-snug">On your statement as <span className="text-ink font-medium">{rawNames.slice(0, 3).join(" · ")}</span>{rawNames.length > 3 ? ` and ${rawNames.length - 3} more` : ""}</div>}
      <div className={cx("rounded-[12px] px-3 py-2 text-[12px] font-semibold", bill ? "bg-accent-bg text-accent" : dismissed ? "bg-surface text-muted" : suggestion ? "bg-amber-bg text-amber" : "bg-surface text-ink")}>{status}</div>
      {me && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-3">
          <Fact label="Total">{money(me.total)}</Fact>
          <Fact label="Times">{me.count}× over {me.months} month{me.months === 1 ? "" : "s"}</Fact>
          <Fact label="Per month">{money(me.perMonth)}</Fact>
          <Fact label="Typical amount">{money(me.medianAmount)}</Fact>
          <Fact label="Usually around">the {me.medianDay}{ord(me.medianDay)}</Fact>
          <Fact label="Seen">{monthYear(me.firstSeen)} – {monthYear(me.lastSeen)}</Fact>
          <Fact label="Category">{catName(me.category)}</Fact>
          {suggestion && <Fact label="Pattern">{suggestion.cadence} · {Math.round(suggestion.confidence * 100)}% sure</Fact>}
          {bill && <Fact label="Bill">{money(bill.amount)} due the {bill.dueDay}{ord(bill.dueDay)}{bill.autopay ? " · autopay" : ""}</Fact>}
        </div>
      )}
      {!me && bill && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-3">
          <Fact label="Bill">{money(bill.amount)} monthly</Fact>
          <Fact label="Due">the {bill.dueDay}{ord(bill.dueDay)}{bill.autopay ? " · autopay" : ""}</Fact>
          <Fact label="Category">{catName(bill.category)}</Fact>
          {bill.accountId && <Fact label="Paid from">{data.accounts.find((a) => a.id === bill.accountId)?.name ?? "—"}</Fact>}
          <Fact label="Paid so far">{data.payments.filter((p) => p.billId === bill.id).length} month{data.payments.filter((p) => p.billId === bill.id).length === 1 ? "" : "s"}</Fact>
        </div>
      )}
      {me && me.accountIds.length > 0 && <div className="flex flex-wrap gap-1.5">{me.accountIds.map((id) => <AccountChip key={id} data={data} id={id} />)}</div>}
      {me && me.merged.length > 0 && <div className="text-[11px] text-muted">Includes merged: {me.merged.join(", ")}</div>}

      {/* Every transaction */}
      <div className="rounded-[12px] border border-line overflow-hidden">
        <div className="px-3 py-2 text-[11px] font-semibold text-muted bg-surface border-b border-line">Every transaction · {txs.length}</div>
        <div className="max-h-56 overflow-y-auto">
          {txs.length === 0 && <div className="px-3 py-3 text-[12px] text-muted">No bank transactions matched to this yet{bill ? " — it was added by hand, or the bank hasn't shown a payment under this name" : ""}.</div>}
          {shown.map((t) => { const a = data.accounts.find((x) => x.id === t.accountId); return (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2 border-b border-line-soft last:border-b-0 text-[12px]">
              <div className="w-24 shrink-0 text-muted">{day(t.date)}</div>
              <div className="flex-1 min-w-0 truncate">{t.description}{a && <span className="text-muted"> · {a.name}</span>}</div>
              <div className="font-semibold">{money(t.amount)}</div>
            </div>); })}
          {txs.length > 8 && <button onClick={() => setShowAll(!showAll)} className="w-full text-left px-3 py-2 text-[12px] font-semibold text-accent">{showAll ? "Show fewer" : `Show all ${txs.length}`}</button>}
        </div>
      </div>

      {/* What you've decided */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Call it" hint="Your name for it — used everywhere, and for anything else from this merchant."><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Car note" /></Field>
        <Field label="Category"><select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>{data.budgets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}<option value="other">Other</option></select></Field>
      </div>
      <div className="flex gap-2 flex-wrap">
        {!bill && <Button onClick={makeBill} className="h-10 px-3 text-xs"><Receipt size={13} className="inline -mt-0.5 mr-1" />{suggestion ? "Yes, it's a bill" : "Make this a bill"}{me ? ` · ${money(suggestion?.amount ?? me.medianAmount)}` : ""}</Button>}
        {(bill || suggestion) && !dismissed && <Button variant="secondary" onClick={notABill} className="h-10 px-3 text-xs"><Ban size={13} className="inline -mt-0.5 mr-1" />Not a bill</Button>}
        {dismissed && <Button variant="secondary" onClick={suggestAgain} className="h-10 px-3 text-xs"><Check size={13} className="inline -mt-0.5 mr-1" />Suggest as a bill again</Button>}
        {pref.kind !== "transfer" && <Button variant="secondary" onClick={() => setKind("transfer")} className="h-10 px-3 text-xs"><Shuffle size={13} className="inline -mt-0.5 mr-1" />It&apos;s a transfer</Button>}
        {pref.kind !== "ignore" && <Button variant="secondary" onClick={() => setKind("ignore")} className="h-10 px-3 text-xs"><EyeOff size={13} className="inline -mt-0.5 mr-1" />Hide it</Button>}
        {pref.kind && pref.kind !== "spend" && <Button variant="secondary" onClick={() => setKind("spend")} className="h-10 px-3 text-xs"><Undo2 size={13} className="inline -mt-0.5 mr-1" />Count as spending again</Button>}
      </div>
      {bill && <div className="text-[11px] text-muted">Amount, due day and autopay for this bill are edited on the Bills page.</div>}
      <Field label="Merge into another merchant" hint="Same place under two names? Pick the one to keep.">
        <div className="relative"><Search size={14} className="absolute left-3 top-3.5 text-muted" /><input className={cx(inputCls, "pl-9")} placeholder="Search merchants…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        {(query || mergeInto) && <div className="flex flex-col gap-1 mt-2 max-h-40 overflow-y-auto">
          {candidates.map((m) => <button key={m.key} onClick={() => setMergeInto(m.key)} className={cx("text-left text-[12px] px-3 py-2 rounded-[10px] border", mergeInto === m.key ? "border-accent bg-accent-bg" : "border-line hover:border-field")}><b>{m.name}</b> <span className="text-muted">· {money(m.total)} · {m.count}×</span></button>)}
        </div>}
      </Field>
      <div className="flex gap-2 pt-1">
        {mergeInto && <Button onClick={merge} className="flex-1"><Merge size={13} className="inline -mt-0.5 mr-1" />Merge into {all.find((m) => m.key === mergeInto)?.name}</Button>}
        <Button variant={mergeInto ? "secondary" : "primary"} className="flex-1" onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}

/** The item page for a deposit: what landed, where, and what you've said about it. */
export function DepositSheet({ event, onClose }: { event: IncomeEvent; onClose: () => void }) {
  const { data: d, update } = useHome();
  const data = d!;
  const key = merchantKey(event.source);
  const siblings = (data.income ?? []).filter((e) => merchantKey(e.source) === key).sort((a, b) => b.date.localeCompare(a.date));
  const src = data.incomeSources?.find((s) => s.id === event.sourceId);
  const total = siblings.filter((e) => e.status !== "ignored").reduce((s, e) => s + e.amount, 0);
  const setStatus = (status: "counted" | "ignored" | undefined) => { update((h) => ({ ...h, income: (h.income ?? []).map((e) => (e.id === event.id ? { ...e, status, internal: undefined } : e)) }), `${event.source}: ${status ?? "unreviewed"}`); onClose(); };
  const alwaysIgnore = () => { update((h) => ({ ...h, income: (h.income ?? []).map((e) => (merchantKey(e.source) === key ? { ...e, status: "ignored" as const } : e)), settings: { ...h.settings, dismissedIncome: [...new Set([...(h.settings.dismissedIncome ?? []), key])] } }), `${event.source}: always ignore`); onClose(); };
  const status = event.internal ? "Transfer between your accounts (matched to a withdrawal)" : event.sourceId ? `Counted · ${src?.name ?? "income source"}` : event.status === "ignored" ? "Ignored (not income)" : event.status === "counted" ? "Counted as income" : "Not reviewed yet";
  return (
    <Modal open onClose={onClose} title={event.source}>
      <div className={cx("rounded-[12px] px-3 py-2 text-[12px] font-semibold -mt-1", event.status === "ignored" || event.internal ? "bg-surface text-muted" : event.status || event.sourceId ? "bg-accent-bg text-accent" : "bg-amber-bg text-amber")}>{status}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Fact label="Amount">{money(event.amount)}</Fact>
        <Fact label="Landed">{day(event.date)}</Fact>
        <Fact label="From this payer">{siblings.length}× · {money(total)} counted</Fact>
        {src && <Fact label="Expected">{money(src.expected)} {src.cadence}</Fact>}
      </div>
      {event.accountId && <div><AccountChip data={data} id={event.accountId} /></div>}
      <div className="rounded-[12px] border border-line overflow-hidden">
        <div className="px-3 py-2 text-[11px] font-semibold text-muted bg-surface border-b border-line">Every deposit from this payer · {siblings.length}</div>
        <div className="max-h-56 overflow-y-auto">
          {siblings.slice(0, 24).map((e) => (
            <div key={e.id} className={cx("flex items-center gap-3 px-3 py-2 border-b border-line-soft last:border-b-0 text-[12px]", e.id === event.id && "bg-accent-bg/40")}>
              <div className="w-24 shrink-0 text-muted">{day(e.date)}</div>
              <div className="flex-1 min-w-0 truncate text-muted">{e.internal ? "transfer" : e.sourceId ? data.incomeSources?.find((s) => s.id === e.sourceId)?.name ?? "counted" : e.status ?? "unreviewed"}</div>
              <div className={cx("font-semibold", e.status === "ignored" && "line-through text-muted")}>{money(e.amount)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {event.status !== "counted" && <Button onClick={() => setStatus("counted")} className="h-10 px-3 text-xs">Count as income</Button>}
        {event.status !== "ignored" && <Button variant="secondary" onClick={() => setStatus("ignored")} className="h-10 px-3 text-xs">Ignore this one</Button>}
        <Button variant="secondary" onClick={alwaysIgnore} className="h-10 px-3 text-xs">Always ignore this payer</Button>
        {event.status && <Button variant="secondary" onClick={() => setStatus(undefined)} className="h-10 px-3 text-xs">Back to unreviewed</Button>}
      </div>
      <div className="text-[11px] text-muted">To attach this payer to a paycheck or expected income, use the suggestions on Bills → Income.</div>
    </Modal>
  );
}

/** Mount once (AppShell): renders whichever item page is open app-wide. */
export function ItemSheetHost() {
  const { merchant, deposit, close } = useItem();
  if (merchant) return <ItemSheet merchantKey={merchant} onClose={close} />;
  if (deposit) return <DepositSheet event={deposit} onClose={close} />;
  return null;
}
