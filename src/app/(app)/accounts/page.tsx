"use client";
import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { runSync, type SyncProgress, type BankProgress } from "@/lib/syncClient";
import { useHome } from "@/store/useHome";
import { Button, Card, Eyebrow, Field, Mark, Modal, Segmented, cx, inputCls, money, selectCls } from "@/components/ui";
import { CreditView } from "@/components/CreditView";
import type { Account, AccountKind } from "@/lib/types";
import { uid } from "@/lib/storage/adapter";
import { brandColorFor, onBrand } from "@/lib/brands";
import { debtPaymentsFor } from "@/lib/merchants";

const GROUPS: { title: string; kinds: AccountKind[] }[] = [
  { title: "Banks", kinds: ["checking", "savings"] },
  { title: "Credit & loans", kinds: ["credit", "loan", "mortgage"] },
  { title: "Bills & utilities", kinds: ["biller"] },
  { title: "Credit health", kinds: ["credit-score"] },
];

/** More than a day and a half since this account last refreshed — worth a look. */
const stale = (iso?: string) => !iso || Date.now() - new Date(iso).getTime() > 36 * 3600_000;
const ago = (iso?: string) => {
  if (!iso) return "manual";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 60 ? `synced ${m}m` : m < 1440 ? `synced ${Math.round(m / 60)}h` : `synced ${Math.round(m / 1440)}d`;
};

type PlaidExitError = { error_code?: string; error_message?: string; display_message?: string | null } | null;
declare global { interface Window { Plaid?: { create: (cfg: { token: string; receivedRedirectUri?: string; onSuccess: (publicToken: string, meta: { institution?: { name: string } }) => void; onExit?: (err: PlaidExitError, meta: { institution?: { name: string } | null; status?: string }) => void }) => { open: () => void } } } }
const LINK_TOKEN_KEY = "homefin.plaid.link_token";

export default function AccountsPage() {
  const { data: d, update, adapter, load } = useHome();
  const data = d!;
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<"accounts" | "credit">(typeof location !== "undefined" && location.hash === "#credit" ? "credit" : "accounts");
  const [msg, setMsg] = useState<string | null>(null);
  const [links, setLinks] = useState<{ item_id: string; institution: string | null; created_at: string }[]>([]);
  const loadLinks = useCallback(async () => { if (adapter.kind !== "supabase") return; try { const r = await fetch("/api/plaid/item"); if (r.ok) setLinks((await r.json()).items ?? []); } catch { /* ignore */ } }, [adapter.kind]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadLinks(); }, [loadLinks]);
  const disconnect = async (item_id: string, label: string) => {
    if (!confirm(`Disconnect ${label}? Its accounts, transactions and history are removed from this home. You can connect it again later.`)) return;
    setMsg(null);
    const r = await fetch("/api/plaid/item", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.error ?? "Could not disconnect"); return; }
    await load(); await loadLinks();
    setMsg(`Disconnected ${label} (${j.removedAccounts} account${j.removedAccounts === 1 ? "" : "s"} removed).`);
  };
  const plaidEnabled = adapter.kind === "supabase";
  const historyDays = data.settings.historyDays ?? 730;
  const setHistory = (n: number) => update((h) => ({ ...h, settings: { ...h.settings, historyDays: n } }), "changed history depth");
  const live = data.accounts.filter((a) => a.source === "plaid").length;

  const save = (a: Account) => update((h) => ({ ...h, accounts: h.accounts.some((x) => x.id === a.id) ? h.accounts.map((x) => (x.id === a.id ? a : x)) : [...h.accounts, a] }), `saved account ${a.name}`);
  const remove = (id: string) => {
    const a = data.accounts.find((x) => x.id === id);
    if (a?.source === "plaid") {
      // Hide (sync won't re-add it) but keep the bank link; disconnecting the whole bank is a separate action.
      update((h) => ({ ...h, settings: { ...h.settings, hiddenAccounts: [...(h.settings.hiddenAccounts ?? []), id] }, accounts: h.accounts.filter((x) => x.id !== id), bills: h.bills.map((b) => (b.accountId === id ? { ...b, accountId: undefined } : b)) }), `hid account ${a.name}`);
      return;
    }
    update((h) => ({ ...h, accounts: h.accounts.filter((x) => x.id !== id), bills: h.bills.map((b) => (b.accountId === id ? { ...b, accountId: undefined } : b)) }), "removed account");
  };

  const [syncFailed, setSyncFailed] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const sync = useCallback(async (restart = false) => {
    setSyncing(true); setMsg(null); setSyncFailed(false); setProgress(null);
    const record = (ok: boolean, message: string) => update((h) => ({ ...h, settings: { ...h.settings, lastSync: { at: new Date().toISOString(), ok, message } } }), ok ? "synced" : "sync failed");
    try {
      const j = await runSync(setProgress, { restart });
      await load();
      const parts = [`Synced ${j.accounts} account${j.accounts === 1 ? "" : "s"}, ${j.transactions} new transaction${j.transactions === 1 ? "" : "s"}.`];
      if (j.autoPaid) parts.push(`Marked ${j.autoPaid} bill payment${j.autoPaid === 1 ? "" : "s"} from your transactions.`);
      if (j.pending.length) parts.push(`Transactions for ${j.pending.join(", ")} are still loading at Plaid — tap Sync again in a minute.`);
      if (j.problems.length) { parts.push(j.problems.join(" · ")); setSyncFailed(true); }
      setMsg(parts.join(" "));
      record(!j.problems.length, parts.join(" "));
    } catch (e) { const m = (e as Error).message; setMsg(m); setSyncFailed(true); record(false, m); }
    setSyncing(false);
    setTimeout(() => setProgress(null), 4000);
  }, [load, update]);

  /** Open Plaid Link. With `receivedRedirectUri`, this resumes an OAuth bank (Bank of America, Chase…) after it sent the user back to us. */
  const openLink = useCallback((token: string, receivedRedirectUri?: string) => {
    if (!window.Plaid) throw new Error("Plaid Link is still loading — try again in a second.");
    window.Plaid.create({
      token, receivedRedirectUri,
      onSuccess: async (publicToken, meta) => {
        try { sessionStorage.removeItem(LINK_TOKEN_KEY); } catch { /* ignore */ }
        const ex = await fetch("/api/plaid/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ public_token: publicToken, institution: meta.institution?.name }) });
        if (!ex.ok) { setMsg((await ex.json()).error ?? "exchange failed"); return; }
        await sync(); await loadLinks();
      },
      onExit: (err, meta) => {
        try { sessionStorage.removeItem(LINK_TOKEN_KEY); } catch { /* ignore */ }
        if (err) {
          const bank = meta?.institution?.name ? ` (${meta.institution.name})` : "";
          setMsg(`Plaid stopped${bank}: ${err.display_message ?? err.error_message ?? err.error_code ?? "unknown error"}${err.error_code ? ` [${err.error_code}]` : ""}`);
          console.warn("plaid link exit", err, meta);
        }
      },
    }).open();
  }, [sync]);

  const connect = useCallback(async () => {
    setMsg(null);
    try {
      const r = await fetch("/api/plaid/create-link-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: historyDays }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not start Plaid");
      try { sessionStorage.setItem(LINK_TOKEN_KEY, j.link_token); } catch { /* ignore */ }
      openLink(j.link_token);
    } catch (e) { setMsg((e as Error).message); }
  }, [openLink, historyDays]);

  // Coming back from an OAuth bank: Plaid appends ?oauth_state_id=… to our redirect URI. Resume Link with the same token.
  useEffect(() => {
    if (typeof window === "undefined" || !new URLSearchParams(location.search).has("oauth_state_id")) return;
    let token: string | null = null;
    try { token = sessionStorage.getItem(LINK_TOKEN_KEY); } catch { /* ignore */ }
    if (!token) { queueMicrotask(() => setMsg("The bank sent you back, but the link session was lost — tap Connect and try again.")); return; }
    const t = setInterval(() => { if (window.Plaid) { clearInterval(t); try { openLink(token!, location.href); } catch (e) { setMsg((e as Error).message); } } }, 200);
    return () => clearInterval(t);
  }, [openLink]);

  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 15000); return () => clearTimeout(t); } }, [msg]);

  return (
    <>
      {plaidEnabled && <Script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js" strategy="afterInteractive" />}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">{tab === "credit" ? "Credit" : "Accounts"}</h1>
        <div className="flex gap-2 items-center">
          <div className="w-44"><Segmented size="sm" value={tab} onChange={setTab} options={[{ id: "accounts", label: "Accounts" }, { id: "credit", label: "Credit" }]} /></div>
          {tab === "accounts" && plaidEnabled && live > 0 && <Button variant="secondary" onClick={() => sync(false)} disabled={syncing}><RefreshCw size={14} className={cx("inline mr-1", syncing && "animate-spin")} /> Sync</Button>}
          {tab === "accounts" && <Button onClick={() => setEditing("new")} className="rounded-full">+ Add</Button>}
        </div>
      </div>
      {tab === "credit" && <CreditView />}
      {tab === "accounts" && <>

      <Card className="bg-accent-bg border-accent-line p-3.5 flex items-start gap-2.5">
        <div className={cx("w-2.5 h-2.5 rounded-full mt-1 shrink-0", live ? "bg-green" : "bg-field")} />
        <div className="text-[13px] text-accent-deep leading-snug">
          {plaidEnabled
            ? live ? <><b>{live} live connection{live > 1 ? "s" : ""}.</b> Links persist and refresh in the background — no re-login, no manual refresh.</> : <><b>No live connections yet.</b> Connect a bank or card with Plaid and balances, bills and transactions sync automatically.</>
            : <><b>Bank linking needs cloud storage.</b> Sign in with Supabase to connect banks through Plaid; on this device you can add accounts manually or import a CSV.</>}
        </div>
      </Card>
      {progress && (
        <Card className="p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[12px]"><div className="font-semibold">{progress.phase === "done" ? "Sync complete" : progress.phase === "finalize" ? "Finishing up…" : progress.phase === "listing" ? "Starting…" : `Syncing ${progress.banks.filter((b) => b.state === "done" || b.state === "failed" || b.state === "pending").length} of ${progress.banks.length} banks`}</div><div className="text-muted">{Math.round(progress.overall * 100)}%</div></div>
          <div className="h-2 rounded-full bg-line-soft overflow-hidden"><div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(progress.overall * 100)}%` }} /></div>
          {progress.message && <div className="text-[11px] text-muted">{progress.message}</div>}
        </Card>
      )}
      {plaidEnabled && live > 0 && !syncing && <div className="text-[11px] text-muted -mt-2">Missing something the bank definitely has? <button onClick={() => { if (confirm("Pull every transaction from every bank again? Nothing doubles — it just takes a few minutes.")) sync(true); }} className="text-accent font-semibold">Full re-sync</button> re-reads all history.</div>}
      {msg && <Card className={cx("p-3 text-xs flex items-start gap-2", syncFailed ? "border-red/50 bg-red/5 text-red" : "text-ink")}>{syncFailed && <AlertTriangle size={14} className="shrink-0 mt-0.5" />}<div><b>{syncFailed ? "Sync failed. " : ""}</b>{msg}</div></Card>}
      {!msg && data.settings.lastSync && !data.settings.lastSync.ok && <Card className="p-3 text-xs flex items-start gap-2 border-red/50 bg-red/5 text-red"><AlertTriangle size={14} className="shrink-0 mt-0.5" /><div><b>Last sync failed</b> ({new Date(data.settings.lastSync.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}): {data.settings.lastSync.message}</div></Card>}
      {plaidEnabled && (
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <Field label="Pull history going back">
              <select className={selectCls} value={historyDays} onChange={(e) => setHistory(Number(e.target.value))}>
                <option value={90}>3 months</option><option value={180}>6 months</option><option value={365}>1 year</option><option value={730}>2 years (maximum)</option>
              </select>
            </Field>
            <Button onClick={connect} className="md:h-11 md:self-end">Connect a bank, card or loan (Plaid)</Button>
          </div>
          <div className="text-[11px] text-muted leading-relaxed">Plaid provides up to 24 months of transactions, so 2 years is the hard limit. The depth is fixed when a bank is linked — to pull deeper history for an already-linked bank, remove it and connect it again.</div>
        </Card>
      )}

      {links.length > 0 && (
        <div className="flex flex-col gap-2">
          <Eyebrow>Bank connections</Eyebrow>
          <Card>
            {links.map((l) => {
              const n = data.accounts.filter((a) => a.plaidItemId === l.item_id).length;
              const dupes = links.filter((x) => x.institution === l.institution).length > 1;
              return (
                <div key={l.item_id} className="flex items-center gap-3 px-4 py-3 border-b border-line-soft last:border-b-0">
                  <div className="w-2 h-2 rounded-full bg-green shrink-0" />
                  <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{l.institution ?? "Bank"}{dupes && <span className="ml-2 text-[11px] font-semibold text-amber">duplicate link</span>}</div><div className="text-[11px] text-muted">linked {new Date(l.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {n} account{n === 1 ? "" : "s"}</div></div>
                  <button onClick={() => disconnect(l.item_id, l.institution ?? "this bank")} className="h-9 px-3 rounded-[10px] border border-line bg-card text-xs font-semibold text-red hover:bg-red/5">Disconnect</button>
                </div>
              );
            })}
          </Card>
          {(data.settings.hiddenAccounts?.length ?? 0) > 0 && <button onClick={() => update((h) => ({ ...h, settings: { ...h.settings, hiddenAccounts: [] } }), "unhid accounts")} className="text-xs text-accent font-semibold text-left">Show {data.settings.hiddenAccounts!.length} hidden account{data.settings.hiddenAccounts!.length === 1 ? "" : "s"} again (next sync)</button>}
        </div>
      )}

      <div className="md:grid md:grid-cols-2 md:gap-6 flex flex-col gap-4">
        {GROUPS.map((g) => {
          const items = data.accounts.filter((a) => g.kinds.includes(a.kind));
          if (!items.length) return null;
          return (
            <div key={g.title} className="flex flex-col gap-2">
              <Eyebrow className="pt-1.5">{g.title}</Eyebrow>
              <Card>
                {items.map((a) => <AccountRow key={a.id} a={a} onClick={() => setEditing(a)} bank={progress?.banks.find((b) => b.itemId === a.plaidItemId)} />)}
              </Card>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-muted leading-relaxed">Banks, cards and loans connect through Plaid (persistent tokens, background refresh). Billers like AT&amp;T and Xfinity rarely offer APIs — add them manually with a due day, or forward their bill emails to the parser address once that&apos;s set up. Tokens are stored server-side, never in the app.</div>

      </>}
      {editing && <AccountForm acct={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />}
    </>
  );
}

const initials = (s: string) => s.replace(/[^A-Za-z0-9& ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "•";
const KIND_LABEL: Record<AccountKind, string> = { checking: "Checking", savings: "Savings", credit: "Credit card", loan: "Loan", mortgage: "Mortgage", biller: "Bill", "credit-score": "Credit score" };

/** Institution · product name, then the numbers that matter as callouts. */
function AccountRow({ a, onClick, bank }: { a: Account; onClick: () => void; bank?: BankProgress }) {
  const data = useHome((s) => s.data)!;
  const isDebt = a.kind === "credit" || a.kind === "loan" || a.kind === "mortgage";
  const sameName = a.name.toLowerCase().includes(a.institution.toLowerCase());
  const callouts: { label: string; value: string; tone?: string }[] = [];
  if (a.kind === "credit-score") callouts.push({ label: "Score", value: String(a.balance) });
  else callouts.push({ label: isDebt ? "Balance owed" : a.kind === "biller" ? "Typical bill" : "Balance", value: money(a.balance), tone: isDebt && a.balance > 0 ? "text-red" : undefined });
  if (a.apr !== undefined && a.apr > 0) callouts.push({ label: "APR", value: `${a.apr}%` });
  if (a.minPayment) callouts.push({ label: "Minimum", value: money(a.minPayment) });
  if (isDebt) { const paid = debtPaymentsFor(data, a.id, `${new Date().getFullYear()}-01-01`); if (paid.count) callouts.push({ label: "Paid this year", value: money(paid.total), tone: "text-green" }); }
  if (a.mask) callouts.push({ label: "Ending", value: `••${a.mask}` });
  const color = a.brandColor ?? brandColorFor(a.institution) ?? brandColorFor(a.name);
  return (
    <button onClick={onClick} className="relative flex items-start gap-3 pl-5 pr-4 py-3 border-b border-line-soft last:border-b-0 w-full text-left hover:bg-surface/60">
      <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r" style={{ background: color ?? "transparent" }} aria-hidden />
      {a.logo ? (
        <img src={a.logo} alt="" className="w-10 h-10 rounded-[10px] object-contain bg-card border border-line-soft shrink-0" />
      ) : (
        <Mark className={color ? "" : undefined}>{color ? <span className="w-full h-full rounded-[10px] flex items-center justify-center" style={{ background: color, color: onBrand(color) }}>{initials(a.institution)}</span> : initials(a.institution)}</Mark>
      )}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{sameName ? a.name : <>{a.institution} <span className="text-muted font-normal">·</span> {a.name}</>}</div>
            <div className="text-[11px] text-muted">{KIND_LABEL[a.kind]}</div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
            <div className={cx("text-[11px] font-semibold flex items-center gap-1", a.source !== "plaid" ? "text-muted" : bank && bank.state !== "done" ? "text-accent" : bank?.state === "done" ? "text-green" : stale(a.lastSyncedAt) ? "text-amber" : "text-green")}><i className={cx("w-1.5 h-1.5 rounded-full inline-block", a.source !== "plaid" ? "bg-field" : bank && bank.state !== "done" ? "bg-accent animate-pulse" : bank?.state === "done" ? "bg-green" : stale(a.lastSyncedAt) ? "bg-amber" : "bg-green")} />{a.source !== "plaid" ? a.source : bank ? (bank.state === "waiting" ? "waiting" : bank.state === "accounts" ? "balances…" : bank.state === "transactions" ? `transactions · ${bank.pages} page${bank.pages === 1 ? "" : "s"}` : bank.state === "done" ? "synced" : bank.state === "pending" ? "still loading" : "failed") : ago(a.lastSyncedAt)}</div>
            {bank && <div className="w-20 h-1 rounded-full bg-line-soft overflow-hidden"><div className={cx("h-full transition-[width] duration-300", bank.state === "failed" ? "bg-red" : bank.state === "pending" ? "bg-amber" : "bg-accent")} style={{ width: `${Math.round(bank.progress * 100)}%` }} /></div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {callouts.map((c) => (
            <div key={c.label} className="flex items-baseline gap-1 rounded-[8px] bg-surface border border-line-soft px-2 py-1"><span className="text-[10px] text-muted">{c.label}</span><span className={cx("text-xs font-semibold", c.tone)}>{c.value}</span></div>
          ))}
        </div>
      </div>
    </button>
  );
}

function AccountForm({ acct, onClose, onSave, onDelete }: { acct?: Account; onClose: () => void; onSave: (a: Account) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState(acct?.name ?? "");
  const [institution, setInstitution] = useState(acct?.institution ?? "");
  const [kind, setKind] = useState<AccountKind>(acct?.kind ?? "checking");
  const [balance, setBalance] = useState(acct?.balance ?? 0);
  const [apr, setApr] = useState(acct?.apr ?? 0);
  const [min, setMin] = useState(acct?.minPayment ?? 0);
  const isDebt = kind === "credit" || kind === "loan" || kind === "mortgage";
  return (
    <Modal open onClose={onClose} title={acct ? "Edit account" : "Add an account"}>
      <Field label="Type"><select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
        <option value="biller">Biller (utility, phone, internet…)</option><option value="checking">Checking</option><option value="credit">Credit card</option><option value="credit-score">Credit score</option><option value="loan">Loan</option><option value="mortgage">Mortgage</option><option value="savings">Savings</option>
      </select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Chase Sapphire" /></Field>
        <Field label="Institution"><input className={inputCls} value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Chase" /></Field>
      </div>
      <Field label={kind === "credit-score" ? "Score" : isDebt ? "Balance owed ($)" : kind === "biller" ? "Typical monthly bill ($)" : "Balance ($)"}><input className={inputCls} type="number" inputMode="decimal" value={balance || ""} onChange={(e) => setBalance(Number(e.target.value))} /></Field>
      {isDebt && <div className="grid grid-cols-2 gap-3">
        <Field label="APR (%)"><input className={inputCls} type="number" inputMode="decimal" step="0.1" value={apr || ""} onChange={(e) => setApr(Number(e.target.value))} /></Field>
        <Field label="Minimum payment ($)"><input className={inputCls} type="number" inputMode="decimal" value={min || ""} onChange={(e) => setMin(Number(e.target.value))} /></Field>
      </div>}
      {acct?.source === "plaid" && <div className="text-[11px] text-muted">This account comes from a bank link. <b>Hide</b> keeps the bank connected but stops showing this account. To remove the bank entirely, use <b>Disconnect</b> under Bank connections.</div>}
      <div className="flex gap-2 pt-1">
        {acct && <Button variant="danger" onClick={() => { onDelete(acct.id); onClose(); }}>{acct.source === "plaid" ? "Hide" : "Remove"}</Button>}
        <Button className="flex-1" disabled={!name} onClick={() => { onSave({ ...(acct ?? { id: uid(), source: "manual" as const }), name, institution: institution || name, kind, balance, apr: isDebt ? apr : undefined, minPayment: isDebt ? min : undefined }); onClose(); }}>Save</Button>
      </div>
    </Modal>
  );
}
