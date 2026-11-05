import { NextResponse } from "next/server";
import { mergeAccounts, mergeTransactions, plaid, plaidError } from "@/lib/plaid";
import { autoMarkPaid, matchIncomeEvents } from "@/lib/detect";
import { dedupeIncome, matchPaymentsToCredits, rematchInternalTransfers } from "@/lib/merchants";
import { adminClient } from "@/lib/supabase/server";
import { CountryCode } from "plaid";
import type { HomeData } from "@/lib/types";
import { requireHome } from "../_shared";

/**
 * Bank sync, in resumable pieces so no single request has to finish everything:
 *
 *   GET  /api/plaid/sync                      → { items: [{ id, institution, needsHistory }] }   what to sync
 *   POST { itemId, phase: "accounts" }        → balances + liabilities for one bank (saved)
 *   POST { itemId, phase: "transactions" }    → a few pages of transactions for one bank (saved, cursor saved); returns hasMore
 *   POST { phase: "finalize" }                → dedupe, transfer/payment matching, auto-paid bills (saved)
 *
 * The client runs these in order, bank by bank, and keeps calling the transactions phase until hasMore is false — that
 * is what the per-bank progress bar is tracking. Every piece saves what it fetched, so a dropped connection loses nothing.
 * The old one-shot POST {} still works (used by nothing now, kept for safety).
 */
export const maxDuration = 60;
const PAGE_BUDGET_MS = 20_000; // stop a transactions chunk after this long and let the client call again
const MAX_PAGES = 12;

type Phase = "accounts" | "transactions" | "finalize";

export async function GET() {
  const ctx = await requireHome();
  if ("error" in ctx) return ctx.error;
  const admin = adminClient();
  const { data: items, error } = await admin.from("plaid_items").select("id, institution, item_id").eq("home_id", ctx.homeId);
  if (error) return NextResponse.json({ error: `Could not read linked items: ${error.message}` }, { status: 500 });
  const { data: row } = await ctx.sb.from("home_data").select("data").eq("home_id", ctx.homeId).single();
  const home = row?.data as HomeData | undefined;
  return NextResponse.json({ items: (items ?? []).map((i) => ({ id: i.id, itemId: i.item_id, institution: i.institution ?? "Bank" })), needsHistory: !home?.settings.creditsBackfilledAt });
}

export async function POST(req: Request) {
  const ctx = await requireHome();
  if ("error" in ctx) return ctx.error;
  const body = (await req.json().catch(() => ({}))) as { itemId?: string; phase?: Phase; restart?: boolean };
  const admin = adminClient();

  const loadHome = async () => {
    const { data: row, error } = await ctx.sb.from("home_data").select("data").eq("home_id", ctx.homeId).single();
    if (error || !row) throw new Error(`Could not read home data: ${error?.message ?? "missing"}`);
    return row.data as HomeData;
  };
  const saveHome = async (home: HomeData, note: string) => {
    const { error } = await ctx.sb.from("home_data").update({ data: home, note }).eq("home_id", ctx.homeId);
    if (error) throw new Error(`Saved nothing: ${error.message}`);
  };

  try {
    // ---- finalize: the cross-bank passes, once everything is in.
    if (body.phase === "finalize") {
      let home = await loadHome();
      if (home.credits === undefined) home = { ...home, credits: [] };
      if (!home.settings.creditsBackfilledAt) home = { ...home, settings: { ...home.settings, creditsBackfilledAt: new Date().toISOString() } };
      home = dedupeIncome(home) ?? home;
      home = rematchInternalTransfers(home);
      home = matchPaymentsToCredits(home) ?? home;
      const matched = matchIncomeEvents(home);
      if (matched) home = { ...home, income: matched };
      const autoPaid = autoMarkPaid(home);
      if (autoPaid.length) home = { ...home, payments: [...home.payments, ...autoPaid] };
      await saveHome(home, "synced accounts");
      return NextResponse.json({ ok: true, autoPaid: autoPaid.length });
    }

    // ---- one bank
    if (!body.itemId) return NextResponse.json({ error: "Say which bank (itemId) and which phase." }, { status: 400 });
    const { data: it, error: itemErr } = await admin.from("plaid_items").select("*").eq("home_id", ctx.homeId).eq("id", body.itemId).single();
    if (itemErr || !it) return NextResponse.json({ error: "That bank link isn't on this home." }, { status: 404 });
    const label = it.institution ?? "Bank";
    const client = plaid();
    let home = await loadHome();

    if (body.phase === "accounts") {
      try {
        const accts = await client.accountsGet({ access_token: it.access_token });
        let brand: { color?: string | null; logo?: string | null } = {};
        let instName = it.institution ?? "Bank";
        if (accts.data.item.institution_id) {
          try {
            const inst = await client.institutionsGetById({ institution_id: accts.data.item.institution_id, country_codes: [CountryCode.Us], options: { include_optional_metadata: true } });
            brand = { color: inst.data.institution.primary_color, logo: inst.data.institution.logo };
            instName = it.institution ?? inst.data.institution.name;
          } catch (e) { console.warn("plaid institutionsGetById", plaidError(e).code); }
        }
        home = mergeAccounts(home, it.item_id, instName, accts.data.accounts, new Date(), brand);
        // Liabilities (APR, minimum payment) — optional; hand-entered terms win.
        try {
          const li = await client.liabilitiesGet({ access_token: it.access_token });
          for (const c of li.data.liabilities.credit ?? []) { const a = home.accounts.find((x) => x.id === c.account_id); if (a && !a.termsManual) { a.apr = c.aprs?.[0]?.apr_percentage ?? a.apr; a.minPayment = c.minimum_payment_amount ?? a.minPayment; } }
          for (const s of li.data.liabilities.student ?? []) { const a = home.accounts.find((x) => x.id === s.account_id); if (a && !a.termsManual) { a.apr = s.interest_rate_percentage ?? a.apr; a.minPayment = s.minimum_payment_amount ?? a.minPayment; } }
          for (const m of li.data.liabilities.mortgage ?? []) { const a = home.accounts.find((x) => x.id === m.account_id); if (a && !a.termsManual) { a.apr = m.interest_rate?.percentage ?? a.apr; a.minPayment = m.next_monthly_payment ?? a.minPayment; } }
        } catch (e) { console.warn("plaid liabilitiesGet", label, plaidError(e).code); }
        await saveHome(home, `synced ${label} accounts`);
        return NextResponse.json({ ok: true, accounts: accts.data.accounts.length });
      } catch (e) {
        const pe = plaidError(e);
        console.error("plaid accountsGet", label, pe);
        return NextResponse.json({ ok: false, problem: `${label}: ${pe.message}`, code: pe.code });
      }
    }

    if (body.phase === "transactions") {
      // Re-pull from the start when history is needed (credits backfill) or the client asks for a restart.
      const needsHistory = body.restart || !home.settings.creditsBackfilledAt;
      const historyStarted = home.settings.historyStarted ?? {};
      let cursor: string | undefined = needsHistory && !historyStarted[it.id] ? undefined : it.cursor ?? undefined;
      const started = Date.now();
      let pages = 0, added = 0, hasMore = true, attempts = 0;
      try {
        while (hasMore && pages < MAX_PAGES && Date.now() - started < PAGE_BUDGET_MS) {
          try {
            const r = await client.transactionsSync({ access_token: it.access_token, cursor });
            const merged = mergeTransactions(home, r.data.added, r.data.removed.map((x) => x.transaction_id!));
            home = merged.home; added += merged.added;
            cursor = r.data.next_cursor; hasMore = r.data.has_more; pages++;
            // Save after every page: the cursor and the data move together, so a cut-off never loses or doubles anything.
            home = { ...home, settings: { ...home.settings, historyStarted: { ...historyStarted, [it.id]: true } } };
            await saveHome(home, `synced ${label} transactions`);
            await admin.from("plaid_items").update({ cursor }).eq("id", it.id);
          } catch (e) {
            if (plaidError(e).code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && ++attempts < 3) { cursor = it.cursor ?? undefined; continue; }
            throw e;
          }
        }
        return NextResponse.json({ ok: true, transactions: added, pages, hasMore });
      } catch (e) {
        const pe = plaidError(e);
        if (pe.code === "PRODUCT_NOT_READY") return NextResponse.json({ ok: true, transactions: added, pages, hasMore: false, pending: true });
        console.error("plaid transactionsSync", label, pe);
        return NextResponse.json({ ok: false, transactions: added, pages, hasMore: false, problem: `${label} transactions: ${pe.message}`, code: pe.code });
      }
    }

    return NextResponse.json({ error: "Unknown phase." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
