"use client";
import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
import { RefreshCw } from "lucide-react";
import { useHome } from "@/store/useHome";
import { Button, Card, Eyebrow, Field, Mark, Modal, Row, cx, fmt, inputCls, money, selectCls } from "@/components/ui";
import type { Account, AccountKind } from "@/lib/types";
import { uid } from "@/lib/storage/adapter";

const GROUPS: { title: string; kinds: AccountKind[] }[] = [
  { title: "Banks", kinds: ["checking", "savings"] },
  { title: "Credit & loans", kinds: ["credit", "loan", "mortgage"] },
  { title: "Bills & utilities", kinds: ["biller"] },
  { title: "Credit health", kinds: ["credit-score"] },
];

const ago = (iso?: string) => {
  if (!iso) return "manual";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 60 ? `synced ${m}m` : m < 1440 ? `synced ${Math.round(m / 60)}h` : `synced ${Math.round(m / 1440)}d`;
};

declare global { interface Window { Plaid?: { create: (cfg: { token: string; onSuccess: (publicToken: string, meta: { institution?: { name: string } }) => void }) => { open: () => void } } } }

export default function AccountsPage() {
  const { data: d, update, adapter, load } = useHome();
  const data = d!;
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const plaidEnabled = adapter.kind === "supabase";
  const live = data.accounts.filter((a) => a.source === "plaid").length;

  const save = (a: Account) => update((h) => ({ ...h, accounts: h.accounts.some((x) => x.id === a.id) ? h.accounts.map((x) => (x.id === a.id ? a : x)) : [...h.accounts, a] }), `saved account ${a.name}`);
  const remove = (id: string) => update((h) => ({ ...h, accounts: h.accounts.filter((a) => a.id !== id), bills: h.bills.map((b) => (b.accountId === id ? { ...b, accountId: undefined } : b)) }), "removed account");

  const sync = useCallback(async () => {
    setSyncing(true); setMsg(null);
    try {
      const r = await fetch("/api/plaid/sync", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "sync failed");
      await load();
      setMsg(`Synced ${j.accounts} accounts, ${j.transactions} new transactions.`);
    } catch (e) { setMsg((e as Error).message); }
    setSyncing(false);
  }, [load]);

  const connect = useCallback(async () => {
    setMsg(null);
    try {
      const r = await fetch("/api/plaid/create-link-token", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not start Plaid");
      if (!window.Plaid) throw new Error("Plaid Link is still loading — try again in a second.");
      window.Plaid.create({
        token: j.link_token,
        onSuccess: async (publicToken, meta) => {
          const ex = await fetch("/api/plaid/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ public_token: publicToken, institution: meta.institution?.name }) });
          if (!ex.ok) { setMsg((await ex.json()).error ?? "exchange failed"); return; }
          await sync();
        },
      }).open();
    } catch (e) { setMsg((e as Error).message); }
  }, [sync]);

  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 6000); return () => clearTimeout(t); } }, [msg]);

  return (
    <>
      {plaidEnabled && <Script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js" strategy="afterInteractive" />}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <div className="flex gap-2">
          {plaidEnabled && live > 0 && <Button variant="secondary" onClick={sync} disabled={syncing}><RefreshCw size={14} className={cx("inline mr-1", syncing && "animate-spin")} /> Sync</Button>}
          <Button onClick={() => setEditing("new")} className="rounded-full">+ Add</Button>
        </div>
      </div>

      <Card className="bg-accent-bg border-accent-line p-3.5 flex items-start gap-2.5">
        <div className={cx("w-2.5 h-2.5 rounded-full mt-1 shrink-0", live ? "bg-green" : "bg-field")} />
        <div className="text-[13px] text-accent-deep leading-snug">
          {plaidEnabled
            ? live ? <><b>{live} live connection{live > 1 ? "s" : ""}.</b> Links persist and refresh in the background — no re-login, no manual refresh.</> : <><b>No live connections yet.</b> Connect a bank or card with Plaid and balances, bills and transactions sync automatically.</>
            : <><b>Bank linking needs cloud storage.</b> Sign in with Supabase to connect banks through Plaid; on this device you can add accounts manually or import a CSV.</>}
        </div>
      </Card>
      {msg && <div className="text-xs text-muted">{msg}</div>}
      {plaidEnabled && <Button variant="dashed" onClick={connect}>Connect a bank, card or loan (Plaid)</Button>}

      <div className="md:grid md:grid-cols-2 md:gap-6 flex flex-col gap-4">
        {GROUPS.map((g) => {
          const items = data.accounts.filter((a) => g.kinds.includes(a.kind));
          if (!items.length) return null;
          return (
            <div key={g.title} className="flex flex-col gap-2">
              <Eyebrow className="pt-1.5">{g.title}</Eyebrow>
              <Card>
                {items.map((a) => (
                  <Row key={a.id} onClick={() => setEditing(a)} left={<Mark>{a.institution.replace(/[^A-Za-z0-9& ]/g, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</Mark>}
                    title={a.name} sub={[a.mask ? `••${a.mask}` : null, a.apr ? `${a.apr}% APR` : null, a.minPayment ? `min $${fmt(a.minPayment)}` : null, a.kind === "biller" ? "bill" : null].filter(Boolean).join(" · ") || a.institution}
                    right={a.kind === "credit-score" ? String(a.balance) : money(a.balance)} rightSub={<span className="flex items-center gap-1"><i className={cx("w-1.5 h-1.5 rounded-full inline-block", a.source === "plaid" ? "bg-green" : "bg-field")} />{a.source === "plaid" ? ago(a.lastSyncedAt) : a.source}</span>} rightTone={a.source === "plaid" ? "text-green" : "text-muted"} />
                ))}
              </Card>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-muted leading-relaxed">Banks, cards and loans connect through Plaid (persistent tokens, background refresh). Billers like AT&amp;T and Xfinity rarely offer APIs — add them manually with a due day, or forward their bill emails to the parser address once that&apos;s set up. Tokens are stored server-side, never in the app.</div>

      {editing && <AccountForm acct={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />}
    </>
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
        <option value="checking">Checking</option><option value="savings">Savings</option><option value="credit">Credit card</option><option value="loan">Loan</option><option value="mortgage">Mortgage</option><option value="biller">Biller (utility, phone, internet…)</option><option value="credit-score">Credit score</option>
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
      <div className="flex gap-2 pt-1">
        {acct && <Button variant="danger" onClick={() => { onDelete(acct.id); onClose(); }}>Remove</Button>}
        <Button className="flex-1" disabled={!name} onClick={() => { onSave({ ...(acct ?? { id: uid(), source: "manual" as const }), name, institution: institution || name, kind, balance, apr: isDebt ? apr : undefined, minPayment: isDebt ? min : undefined }); onClose(); }}>Save</Button>
      </div>
    </Modal>
  );
}
