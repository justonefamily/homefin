import { NextResponse } from "next/server";
import { mergeAccounts, mergeTransactions, plaid, plaidError } from "@/lib/plaid";
import { autoMarkPaid, matchIncomeEvents } from "@/lib/detect";
import { dedupeIncome, matchInternalTransfers, matchPaymentsToCredits } from "@/lib/merchants";
import { adminClient } from "@/lib/supabase/server";
import { CountryCode } from "plaid";
import type { HomeData } from "@/lib/types";
import { requireHome } from "../_shared";

/**
 * Pull balances + liabilities + transactions for every Plaid item on the home and merge them
 * into home_data. Each step is independent: a freshly linked item often returns
 * PRODUCT_NOT_READY for transactions for up to a minute — accounts still save, and the
 * response says transactions are still loading so the UI can offer a retry.
 */
export async function POST() {
  const ctx = await requireHome();
  if ("error" in ctx) return ctx.error;
  const admin = adminClient();
  const { data: items, error: itemsErr } = await admin.from("plaid_items").select("*").eq("home_id", ctx.homeId);
  if (itemsErr) return NextResponse.json({ error: `Could not read linked items: ${itemsErr.message}` }, { status: 500 });
  const { data: row, error: rowErr } = await ctx.sb.from("home_data").select("data").eq("home_id", ctx.homeId).single();
  if (rowErr || !row) return NextResponse.json({ error: `Could not read home data: ${rowErr?.message ?? "missing"}` }, { status: 500 });

  let home = row.data as HomeData;
  let txCount = 0, acctCount = 0;
  const pending: string[] = [];
  const problems: string[] = [];
  const client = plaid();

  // First sync since we started keeping loan/card credits: re-pull every bank from the start so past payments get their
  // destination too (ids are deduped, so nothing doubles). Decided once, before any bank is touched.
  const needsHistory = !home.settings.creditsBackfilledAt;
  for (const it of items ?? []) {
    const label = it.institution ?? "Bank";
    // 1) Accounts + balances
    try {
      const accts = await client.accountsGet({ access_token: it.access_token });
      // Institution branding (color + logo) — optional, cached on the accounts.
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
      acctCount += accts.data.accounts.length;
    } catch (e) {
      const pe = plaidError(e);
      console.error("plaid accountsGet", label, pe);
      problems.push(`${label}: ${pe.message}`);
      continue;
    }
    // 2) Liabilities (APR, minimum payment) — optional
    try {
      const li = await client.liabilitiesGet({ access_token: it.access_token });
      // Hand-entered terms win over what the bank reports.
      for (const c of li.data.liabilities.credit ?? []) { const a = home.accounts.find((x) => x.id === c.account_id); if (a && !a.termsManual) { a.apr = c.aprs?.[0]?.apr_percentage ?? a.apr; a.minPayment = c.minimum_payment_amount ?? a.minPayment; } }
      for (const s of li.data.liabilities.student ?? []) { const a = home.accounts.find((x) => x.id === s.account_id); if (a && !a.termsManual) { a.apr = s.interest_rate_percentage ?? a.apr; a.minPayment = s.minimum_payment_amount ?? a.minPayment; } }
      for (const m of li.data.liabilities.mortgage ?? []) { const a = home.accounts.find((x) => x.id === m.account_id); if (a && !a.termsManual) { a.apr = m.interest_rate?.percentage ?? a.apr; a.minPayment = m.next_monthly_payment ?? a.minPayment; } }
    } catch (e) {
      console.warn("plaid liabilitiesGet", label, plaidError(e).code);
    }
    // 3) Transactions — may not be ready yet on a brand-new item
    try {
      // Plaid asks us to restart from the last saved cursor if its data moves mid-pagination; do that up to 3 times.
      let attempts = 0, cursor = needsHistory ? undefined : it.cursor ?? undefined;
      for (;;) {
        try {
          let c = cursor; let more = true; let staged = home; let added = 0;
          while (more) {
            const r = await client.transactionsSync({ access_token: it.access_token, cursor: c });
            const merged = mergeTransactions(staged, r.data.added, r.data.removed.map((x) => x.transaction_id!));
            staged = merged.home; added += merged.added;
            c = r.data.next_cursor; more = r.data.has_more;
          }
          home = staged; txCount += added; cursor = c;
          break;
        } catch (e) {
          if (plaidError(e).code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && ++attempts < 3) continue;
          throw e;
        }
      }
      await admin.from("plaid_items").update({ cursor }).eq("id", it.id);
    } catch (e) {
      const pe = plaidError(e);
      if (pe.code === "PRODUCT_NOT_READY") pending.push(label);
      else { console.error("plaid transactionsSync", label, pe); problems.push(`${label} transactions: ${pe.message}`); }
    }
  }

  if (home.credits === undefined) home = { ...home, credits: [] };
  if (needsHistory && problems.length === 0 && pending.length === 0) home = { ...home, settings: { ...home.settings, creditsBackfilledAt: new Date().toISOString() } };
  home = dedupeIncome(home) ?? home;
  home = matchInternalTransfers(home) ?? home;
  home = matchPaymentsToCredits(home) ?? home;
  const matched = matchIncomeEvents(home);
  if (matched) home = { ...home, income: matched };
  const autoPaid = autoMarkPaid(home);
  if (autoPaid.length) home = { ...home, payments: [...home.payments, ...autoPaid] };
  const { error } = await ctx.sb.from("home_data").update({ data: home, note: "synced accounts" }).eq("home_id", ctx.homeId);
  if (error) return NextResponse.json({ error: `Saved nothing: ${error.message}` }, { status: 500 });
  return NextResponse.json({ accounts: acctCount, transactions: txCount, autoPaid: autoPaid.length, pending, problems });
}
