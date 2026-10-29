"use client";
import { useMemo, useState } from "react";
import { EyeOff, Merge, Receipt, Search, Shuffle, Undo2, Ban, Check, Flag, Sparkles } from "lucide-react";
import { findFlag, toggleFlag } from "@/lib/flags";
import { useHome } from "@/store/useHome";
import { useItem } from "@/store/useItem";
import { Button, Field, Modal, byName, cx, inputCls, money, selectCls } from "./ui";
import { billKeyMap, destinationsFor, merchantSummaries, merchantToBill, mergeMerchants, moveTransaction, prefFor, resolveKey, setMerchantPref, setPaymentDestination, splitStatementName, txKey, unmergeMerchant } from "@/lib/merchants";
import { NATURE_LABEL, parseNature } from "@/lib/nature";
import { MoreHorizontal } from "lucide-react";
import { autoMarkPaid, detectRecurring, merchantKey, p2pLabel, suggestionToBill } from "@/lib/detect";
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
  const mergedAway = (data.settings.merchants?.[rawKey]?.mergedInto && resolveKey(data, rawKey) !== rawKey) ? rawKey : null;
  const displayName = pref.name ?? bill?.name ?? (rawNames[0] ? p2pLabel(rawNames[0]) : null) ?? rawNames[0] ?? rawKey;
  const [name, setName] = useState(displayName);
  const [category, setCategory] = useState(me?.category ?? bill?.category ?? txs[0]?.category ?? "other");
  const [mergeInto, setMergeInto] = useState("");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [moving, setMoving] = useState<string | null>(null); // transaction id being moved
  const [moveQuery, setMoveQuery] = useState("");
  const nature = rawNames[0] ? parseNature(rawNames[0]) : null;
  const liabilities = data.accounts.filter((a) => a.kind === "credit" || a.kind === "loan" || a.kind === "mortgage").sort((a, b) => `${a.institution} ${a.name}`.localeCompare(`${b.institution} ${b.name}`));
  const paysDown = pref.paysDownAccountId ? data.accounts.find((a) => a.id === pref.paysDownAccountId) : undefined;
  const acctLabel = (id?: string) => { const a = id ? data.accounts.find((x) => x.id === id) : undefined; return a ? `${a.institution} · ${a.name}${a.mask ? ` ···${a.mask}` : ""}` : "not matched yet"; };
  // Where the money landed, per destination account (matched from the receiving side, or set by hand on a transaction).
  const destinations = useMemo(() => destinationsFor(data, key), [data, key]);
  const hasDestinations = destinations.some((d) => d.accountId);
  const [destFor, setDestFor] = useState<string | null>(null); // transaction id whose destination is being picked
  // "On your statement": every distinct wording, as a checklist. Unchecked ones get split out into their own merchant on Save.
  const wordings = useMemo(() => { const m = new Map<string, { count: number; total: number; last: string }>(); for (const t of txs) { const e = m.get(t.description) ?? { count: 0, total: 0, last: t.date }; e.count++; e.total += t.amount; if (t.date > e.last) e.last = t.date; m.set(t.description, e); } return [...m.entries()].map(([desc, v]) => ({ desc, ...v })).sort((a, b) => b.count - a.count || b.total - a.total); }, [txs]);
  const [showWordings, setShowWordings] = useState(false);
  // Pull other items into this one. Anything already merged into those comes along (merges chain).
  const [showMergeIn, setShowMergeIn] = useState(false);
  const [mergeInQuery, setMergeInQuery] = useState("");
  const [mergeInPicked, setMergeInPicked] = useState<Set<string>>(new Set());
  const mergeInCandidates = all.filter((m) => m.key !== key && m.kind !== "ignore" && (mergeInPicked.has(m.key) || (mergeInQuery.length > 0 && (m.name.toLowerCase().includes(mergeInQuery.toLowerCase()) || m.key.includes(mergeInQuery.toLowerCase()))))).slice(0, 12);
  const doMergeIn = () => { update((h) => { let next = h; for (const k of mergeInPicked) next = mergeMerchants(next, k, key); return next; }, `merged ${mergeInPicked.size} into ${displayName}`); setMergeInPicked(new Set()); setMergeInQuery(""); setShowMergeIn(false); };
  const [keep, setKeep] = useState<Set<string> | null>(null); // null = everything checked
  const kept = keep ?? new Set(wordings.map((w) => w.desc));
  const toggleKeep = (desc: string) => { const n = new Set(kept); if (n.has(desc)) n.delete(desc); else n.add(desc); setKeep(n); };
  const removed = wordings.filter((w) => !kept.has(w.desc));
  const saveWordings = () => { update((h) => { let next = h; for (const w of removed) { const n = parseNature(w.desc); next = splitStatementName(next, key, w.desc, p2pLabel(w.desc) ?? (n.nature !== "other" ? n.label : undefined)); } return next; }, `split ${removed.length} wording${removed.length === 1 ? "" : "s"} out of ${displayName}`); setKeep(null); setShowWordings(false); };
  const catName = (id: string) => data.budgets.find((b) => b.id === id)?.name ?? "Other";
  const status = pref.kind === "ignore" ? "Hidden" : pref.kind === "transfer" || (txs[0]?.transfer && pref.kind !== "spend") ? "Transfer between your accounts" : bill ? `Bill · ${bill.name}${bill.endedOn ? ` (ended ${new Date(bill.endedOn + "-15").toLocaleDateString("en-US", { month: "short", year: "numeric" })})` : ""}` : me?.kind === "reimbursable" ? "Reimbursable — money comes back" : dismissed ? "Not a bill (you said)" : suggestion ? "Looks like a bill — not confirmed" : pref.occasional ? "One-off / seasonal — not everyday" : "Everyday spending";

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
      <FlagButton kind="merchant" refId={key} label={displayName} />
      {/* What the bank says */}
      {mergedAway && <div className="rounded-[12px] border border-amber-line bg-amber-bg px-3 py-2 text-[12px] flex items-center gap-2"><span className="flex-1">This is merged into <b>{displayName}</b>.</span><button onClick={() => update((h) => unmergeMerchant(h, mergedAway), `unmerged ${mergedAway}`)} className="h-7 px-2.5 rounded-[8px] bg-amber text-white text-[11px] font-semibold">Unmerge</button></div>}
      {wordings.length > 0 && (
        <div className="rounded-[12px] border border-line overflow-hidden -mt-1">
          <button onClick={() => setShowWordings(!showWordings)} aria-expanded={showWordings} className="w-full flex items-center justify-between px-3 py-2 text-[12px] bg-surface text-left">
            <span><span className="text-muted">On your statement as</span> <span className="font-medium">{wordings[0].desc.length > 48 ? wordings[0].desc.slice(0, 48) + "…" : wordings[0].desc}</span>{wordings.length > 1 && <span className="text-muted"> and {wordings.length - 1} other wording{wordings.length === 2 ? "" : "s"}</span>}</span>
            <span className="text-accent font-semibold shrink-0 ml-2">{showWordings ? "Hide" : "View & edit"}</span>
          </button>
          <div className="flex items-center gap-3 px-3 py-1.5 border-t border-line text-[12px]">
            <button onClick={() => setShowMergeIn(!showMergeIn)} aria-expanded={showMergeIn} className="inline-flex items-center gap-1 text-accent font-semibold"><Merge size={12} />{showMergeIn ? "Close merge" : "Merge other items into this"}</button>
            {me && me.merged.length > 0 && <span className="text-muted">· {me.merged.length} already merged in</span>}
          </div>
          {showMergeIn && (
            <div className="border-t border-line p-3 flex flex-col gap-2 bg-surface/60">
              <div className="text-[11px] text-muted">Search for the other items that are really <b>{displayName}</b>. Everything already merged into them comes along too.</div>
              <div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 text-muted" /><input autoFocus className={cx(inputCls, "h-8 pl-8 text-[12px]")} placeholder="Search merchants or statement wording…" value={mergeInQuery} onChange={(e) => setMergeInQuery(e.target.value)} /></div>
              {mergeInCandidates.length > 0 && <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {mergeInCandidates.map((m) => (
                  <label key={m.key} className={cx("flex items-center gap-2 px-3 py-1.5 rounded-[8px] border text-[12px] cursor-pointer", mergeInPicked.has(m.key) ? "border-accent bg-accent-bg" : "border-line bg-card hover:border-field")}>
                    <input type="checkbox" checked={mergeInPicked.has(m.key)} onChange={() => { const n = new Set(mergeInPicked); if (n.has(m.key)) n.delete(m.key); else n.add(m.key); setMergeInPicked(n); }} className="w-4 h-4 accent-[#0e6b74]" />
                    <span className="flex-1 min-w-0 truncate"><b>{m.name}</b> <span className="text-muted">· {m.count}× · {money(m.total)}{m.merged.length ? ` · +${m.merged.length} merged` : ""}</span></span>
                  </label>
                ))}
              </div>}
              {mergeInQuery && mergeInCandidates.length === 0 && <div className="text-[11px] text-muted">Nothing matches.</div>}
              {mergeInPicked.size > 0 && <Button onClick={doMergeIn} className="h-8 px-3 text-xs self-start"><Merge size={12} className="inline -mt-0.5 mr-1" />Merge {mergeInPicked.size} into {displayName}</Button>}
            </div>
          )}
          {showWordings && (
            <div className="border-t border-line">
              <div className="flex items-center justify-between px-3 py-2 text-[11px] text-muted border-b border-line-soft"><span>Checked = stays part of <b>{displayName}</b>. Uncheck what doesn&apos;t belong, then save.</span><span className="flex gap-2 shrink-0"><button onClick={() => setKeep(new Set(wordings.map((w) => w.desc)))} className="text-accent font-semibold">All</button><button onClick={() => setKeep(new Set())} className="text-accent font-semibold">None</button></span></div>
              <div className="max-h-64 overflow-y-auto">
                {wordings.map((w) => (
                  <label key={w.desc} className={cx("flex items-start gap-3 px-3 py-2 border-b border-line-soft last:border-b-0 text-[12px] cursor-pointer", !kept.has(w.desc) && "bg-amber-bg/50")}>
                    <input type="checkbox" checked={kept.has(w.desc)} onChange={() => toggleKeep(w.desc)} className="mt-0.5 w-4 h-4 accent-[#0e6b74] shrink-0" />
                    <span className="flex-1 min-w-0 break-words">{w.desc}</span>
                    <span className="shrink-0 text-right text-muted">{w.count}× · <span className="text-ink font-semibold">{money(w.total)}</span></span>
                  </label>
                ))}
              </div>
              {removed.length > 0 && <div className="flex items-center gap-2 px-3 py-2 bg-amber-bg/40 border-t border-line text-[12px]"><span className="flex-1">{removed.length} wording{removed.length === 1 ? "" : "s"} ({removed.reduce((s, w) => s + w.count, 0)} transaction{removed.reduce((s, w) => s + w.count, 0) === 1 ? "" : "s"}) will become their own items.</span><Button onClick={saveWordings} className="h-8 px-3 text-xs">Save</Button></div>}
            </div>
          )}
        </div>
      )}
      <div className={cx("rounded-[12px] px-3 py-2 text-[12px] font-semibold", bill ? "bg-accent-bg text-accent" : dismissed ? "bg-surface text-muted" : suggestion ? "bg-amber-bg text-amber" : "bg-surface text-ink")}>{status}{nature && nature.nature !== "other" && nature.nature !== "card" && <span className="font-normal text-muted"> · reads as {nature.label.toLowerCase()}</span>}{paysDown && <span className="font-normal text-muted"> · pays down <b className="text-ink">{paysDown.institution} · {paysDown.name}</b></span>}</div>
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
      {hasDestinations && (
        <div className="rounded-[12px] border border-line overflow-hidden">
          <div className="px-3 py-2 text-[11px] font-semibold text-muted bg-surface border-b border-line">Where it went · matched to the account that received it</div>
          {destinations.map((d) => (
            <div key={d.accountId ?? "none"} className="flex items-center gap-3 px-3 py-2 border-b border-line-soft last:border-b-0 text-[12px]">
              <div className={cx("flex-1 min-w-0 truncate", !d.accountId && "text-muted")}>{d.accountId ? acctLabel(d.accountId) : "Not matched yet — pick on the transaction"}</div>
              <div className="text-muted">{d.count}×</div>
              <div className="font-semibold">{money(d.total)}</div>
            </div>
          ))}
        </div>
      )}
      {me && me.merged.length > 0 && (
        <div className="rounded-[12px] border border-line overflow-hidden">
          <div className="px-3 py-2 text-[11px] font-semibold text-muted bg-surface border-b border-line">Merged into this · {me.merged.length}</div>
          {me.merged.map((k) => (
            <div key={k} className="flex items-center gap-3 px-3 py-2 border-b border-line-soft last:border-b-0 text-[12px]">
              <div className="flex-1 min-w-0 truncate">{data.settings.merchants?.[k]?.name ?? k}</div>
              <button onClick={() => update((h) => unmergeMerchant(h, k), `unmerged ${k}`)} className="h-7 px-2.5 rounded-[8px] border border-chip text-[11px] font-semibold hover:border-field">Unmerge</button>
            </div>
          ))}
        </div>
      )}

      {/* Every transaction */}
      <div className="rounded-[12px] border border-line overflow-hidden">
        <div className="px-3 py-2 text-[11px] font-semibold text-muted bg-surface border-b border-line">Every transaction · {txs.length}</div>
        <div className="max-h-56 overflow-y-auto">
          {txs.length === 0 && <div className="px-3 py-3 text-[12px] text-muted">No bank transactions matched to this yet{bill ? " — it was added by hand, or the bank hasn't shown a payment under this name" : ""}.</div>}
          {shown.map((t) => { const a = data.accounts.find((x) => x.id === t.accountId); return (
            <div key={t.id}>
            <div className={cx("flex items-center gap-2 px-3 py-2 border-b border-line-soft text-[12px]", findFlag(data, "transaction", t.id) && "bg-amber-bg/60", t.merchantOverride && "border-l-2 border-l-accent")}>
              <div className="flex-1 min-w-0"><div className="break-words leading-snug">{t.description}</div><div className="text-[11px] text-muted">{day(t.date)}{a ? ` · ${a.institution} · ${a.name}` : ""}</div>
                {(t.toAccountId || hasDestinations || liabilities.length > 0 && (pref.kind === "transfer" || paysDown)) && (
                  <button onClick={() => setDestFor(destFor === t.id ? null : t.id)} className={cx("mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", t.toAccountId ? "bg-accent-bg text-accent" : "bg-amber-bg text-amber")}>→ {t.toAccountId ? acctLabel(t.toAccountId) : "where did this go?"}{t.toAccountManual && <span className="font-normal">· by hand</span>}</button>
                )}
              </div>
              <div className="font-semibold">{money(t.amount)}</div>
              <FlagButton kind="transaction" refId={t.id} label={`${displayName} · ${money(t.amount)} · ${day(t.date)}`} compact />
              <button onClick={() => { setMoving(moving === t.id ? null : t.id); setMoveQuery(""); }} aria-label="Move this transaction" aria-expanded={moving === t.id} className={cx("w-7 h-7 rounded-full flex items-center justify-center shrink-0", moving === t.id ? "bg-ink text-white" : "text-muted-3 hover:bg-surface hover:text-ink")}><MoreHorizontal size={14} /></button>
            </div>
            {destFor === t.id && (
              <div className="px-3 py-2 bg-surface border-b border-line-soft flex flex-col gap-1.5 text-[12px]">
                <div className="text-muted">This payment went to…</div>
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                  {liabilities.map((l) => (
                    <button key={l.id} onClick={() => { update((h) => setPaymentDestination(h, t.id, l.id), `payment went to ${l.name}`); setDestFor(null); }} className={cx("text-left px-3 py-1.5 rounded-[8px] border bg-card hover:border-field", t.toAccountId === l.id ? "border-accent" : "border-line")}><b>{l.institution}</b> · {l.name}{l.mask ? <span className="text-muted"> ···{l.mask}</span> : null}</button>
                  ))}
                  {t.toAccountId && <button onClick={() => { update((h) => setPaymentDestination(h, t.id, undefined), "cleared a payment destination"); setDestFor(null); }} className="text-left px-3 py-1.5 rounded-[8px] text-muted hover:text-ink">Clear — don&apos;t know</button>}
                </div>
              </div>
            )}
            {moving === t.id && (
              <div className="px-3 py-2 bg-surface border-b border-line-soft flex flex-col gap-2 text-[12px]">
                <div className="text-muted">Move just this one {t.merchantOverride ? <>(currently moved here by hand · <button onClick={() => { update((h) => moveTransaction(h, t.id, undefined), "put a transaction back"); setMoving(null); }} className="text-accent font-semibold">put it back</button>)</> : ""}</div>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => { update((h) => { const own = `tx:${t.id}`; const n = parseNature(t.description); return setMerchantPref(moveTransaction(h, t.id, own), own, { name: p2pLabel(t.description) ?? (n.nature !== "other" ? n.label : undefined) }); }, "split a transaction out on its own"); setMoving(null); }} className="h-8 px-3 text-xs">Make it its own item</Button>
                </div>
                <div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 text-muted" /><input autoFocus className={cx(inputCls, "h-8 pl-8 text-[12px]")} placeholder="…or move it to another merchant" value={moveQuery} onChange={(e) => setMoveQuery(e.target.value)} /></div>
                {moveQuery && <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
                  {all.filter((m) => m.key !== key && m.kind !== "ignore" && (m.name.toLowerCase().includes(moveQuery.toLowerCase()) || m.key.includes(moveQuery.toLowerCase()))).slice(0, 8).map((m) => (
                    <button key={m.key} onClick={() => { update((h) => moveTransaction(h, t.id, m.key), `moved a transaction to ${m.name}`); setMoving(null); }} className="text-left px-3 py-1.5 rounded-[8px] border border-line bg-card hover:border-field"><b>{m.name}</b> <span className="text-muted">· {m.count}×</span></button>
                  ))}
                </div>}
              </div>
            )}
            </div>); })}
          {txs.length > 8 && <button onClick={() => setShowAll(!showAll)} className="w-full text-left px-3 py-2 text-[12px] font-semibold text-accent">{showAll ? "Show fewer" : `Show all ${txs.length}`}</button>}
        </div>
      </div>

      {/* What you've decided */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Call it" hint="Your name for it — used everywhere, and for anything else from this merchant."><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Car note" /></Field>
        <Field label="Category"><select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>{[...data.budgets].sort(byName).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}<option value="other">Other</option></select></Field>
      </div>
      <div className="flex gap-2 flex-wrap">
        {!bill && <Button onClick={makeBill} className="h-10 px-3 text-xs"><Receipt size={13} className="inline -mt-0.5 mr-1" />{suggestion ? "Yes, it's a bill" : "Make this a bill"}{me ? ` · ${money(suggestion?.amount ?? me.medianAmount)}` : ""}</Button>}
        {(bill || suggestion) && !dismissed && <Button variant="secondary" onClick={notABill} className="h-10 px-3 text-xs"><Ban size={13} className="inline -mt-0.5 mr-1" />Not a bill</Button>}
        {dismissed && <Button variant="secondary" onClick={suggestAgain} className="h-10 px-3 text-xs"><Check size={13} className="inline -mt-0.5 mr-1" />Suggest as a bill again</Button>}
        {!bill && pref.kind !== "transfer" && <Button variant="secondary" onClick={() => { update((h) => setMerchantPref(h, key, { occasional: !pref.occasional }), note(pref.occasional ? "back to everyday" : "not an everyday spend")); onClose(); }} className="h-10 px-3 text-xs">{pref.occasional ? <><Undo2 size={13} className="inline -mt-0.5 mr-1" />Back to everyday</> : <><Sparkles size={13} className="inline -mt-0.5 mr-1" />Not an everyday spend</>}</Button>}
        {pref.kind !== "transfer" && <Button variant="secondary" onClick={() => setKind("transfer")} className="h-10 px-3 text-xs"><Shuffle size={13} className="inline -mt-0.5 mr-1" />It&apos;s a transfer</Button>}
        {pref.kind !== "ignore" && <Button variant="secondary" onClick={() => setKind("ignore")} className="h-10 px-3 text-xs"><EyeOff size={13} className="inline -mt-0.5 mr-1" />Hide it</Button>}
        {pref.kind && pref.kind !== "spend" && <Button variant="secondary" onClick={() => setKind("spend")} className="h-10 px-3 text-xs"><Undo2 size={13} className="inline -mt-0.5 mr-1" />Count as spending again</Button>}
      </div>
      {bill && <div className="text-[11px] text-muted">Amount, due day and autopay for this bill are edited on the Bills page.</div>}
      {liabilities.length > 0 && (
        <Field label="Pays down a loan or card" hint="Money out, but it brings a balance down. Pick which one; the Accounts page and the Planner will count it.">
          <select className={selectCls} value={pref.paysDownAccountId ?? ""} onChange={(e) => update((h) => { const id = e.target.value || undefined; let next = setMerchantPref(h, key, { paysDownAccountId: id, kind: id && prefFor(h, key).kind === "transfer" ? "spend" : prefFor(h, key).kind }); if (bill && id) next = { ...next, bills: next.bills.map((b) => (b.id === bill.id ? { ...b, accountId: id } : b)) }; return next; }, `${displayName}: pays down ${data.accounts.find((a) => a.id === e.target.value)?.name ?? "nothing"}`)}>
            <option value="">Not a loan payment</option>
            {liabilities.map((a) => <option key={a.id} value={a.id}>{a.institution} · {a.name}{a.balance ? ` · ${money(a.balance)} owed` : ""}</option>)}
          </select>
        </Field>
      )}
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

/** Flag / unflag something for the review queue (Money → Flags). */
function FlagButton({ kind, refId, label, compact }: { kind: "merchant" | "transaction" | "deposit"; refId: string; label: string; compact?: boolean }) {
  const { data: d, update } = useHome();
  const data = d!;
  const on = !!findFlag(data, kind, refId);
  const toggle = () => update((h) => toggleFlag(h, kind, refId, label, uid()), on ? `unflagged ${label}` : `flagged ${label}`);
  if (compact) return <button onClick={toggle} aria-pressed={on} aria-label={on ? "Remove flag" : "Flag for later"} className={cx("w-7 h-7 rounded-full flex items-center justify-center shrink-0", on ? "bg-amber text-white" : "text-muted-3 hover:bg-surface hover:text-amber")}><Flag size={13} /></button>;
  return (
    <button onClick={toggle} aria-pressed={on} className={cx("-mt-2 self-start inline-flex items-center gap-1.5 rounded-full border text-[11px] font-semibold px-2.5 py-1", on ? "bg-amber border-amber text-white" : "border-amber-line bg-amber-bg text-amber hover:bg-amber/15")}>
      <Flag size={12} /> {on ? "Flagged — in your review queue" : "Flag for later"}
    </button>
  );
}

/** The item page for a deposit: what landed, where, and what you've said about it. */
export function DepositSheet({ event, onClose }: { event: IncomeEvent; onClose: () => void }) {
  const { data: d, update } = useHome();
  const data = d!;
  const key = merchantKey(event.source);
  const siblings = (data.income ?? []).filter((e) => merchantKey(e.source) === key).sort((a, b) => b.date.localeCompare(a.date));
  const src = data.incomeSources?.find((s) => s.id === event.sourceId);
  const total = siblings.filter((e) => e.status !== "ignored" && e.status !== "refund").reduce((s, e) => s + e.amount, 0);
  const setStatus = (status: IncomeEvent["status"]) => { update((h) => ({ ...h, income: (h.income ?? []).map((e) => (e.id === event.id ? { ...e, status, internal: undefined } : e)) }), `${event.source}: ${status ?? "unreviewed"}`); onClose(); };
  const alwaysIgnore = () => { update((h) => ({ ...h, income: (h.income ?? []).map((e) => (merchantKey(e.source) === key ? { ...e, status: "ignored" as const } : e)), settings: { ...h.settings, dismissedIncome: [...new Set([...(h.settings.dismissedIncome ?? []), key])] } }), `${event.source}: always ignore`); onClose(); };
  const status = event.internal ? "Transfer between your accounts (matched to a withdrawal)" : event.sourceId ? `Counted · ${src?.name ?? "income source"}` : event.status === "refund" ? "Refund — offsets spending, not income" : event.status === "ignored" ? "Ignored (not income)" : event.status === "counted" ? "Counted as income" : "Not reviewed yet";
  return (
    <Modal open onClose={onClose} title={event.source}>
      <FlagButton kind="deposit" refId={event.id} label={`${event.source} · ${money(event.amount)} · ${day(event.date)}`} />
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
        {event.status !== "refund" && <Button variant="secondary" onClick={() => setStatus("refund")} className="h-10 px-3 text-xs">It&apos;s a refund</Button>}
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
