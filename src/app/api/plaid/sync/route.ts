import { NextResponse } from "next/server";
import { mergeAccounts, mergeTransactions, plaid, plaidError } from "@/lib/plaid";
import { adminClient } from "@/lib/supabase/server";
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

  for (const it of items ?? []) {
    const label = it.institution ?? "Bank";
    // 1) Accounts + balances
    try {
      const accts = await client.accountsGet({ access_token: it.access_token });
      home = mergeAccounts(home, it.item_id, it.institution ?? accts.data.item.institution_id ?? "Bank", accts.data.accounts);
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
      for (const c of li.data.liabilities.credit ?? []) { const a = home.accounts.find((x) => x.id === c.account_id); if (a) { a.apr = c.aprs?.[0]?.apr_percentage ?? a.apr; a.minPayment = c.minimum_payment_amount ?? a.minPayment; } }
      for (const s of li.data.liabilities.student ?? []) { const a = home.accounts.find((x) => x.id === s.account_id); if (a) { a.apr = s.interest_rate_percentage ?? a.apr; a.minPayment = s.minimum_payment_amount ?? a.minPayment; } }
      for (const m of li.data.liabilities.mortgage ?? []) { const a = home.accounts.find((x) => x.id === m.account_id); if (a) { a.apr = m.interest_rate?.percentage ?? a.apr; a.minPayment = m.next_monthly_payment ?? a.minPayment; } }
    } catch (e) {
      console.warn("plaid liabilitiesGet", label, plaidError(e).code);
    }
    // 3) Transactions — may not be ready yet on a brand-new item
    try {
      let cursor = it.cursor ?? undefined;
      let more = true;
      while (more) {
        const r = await client.transactionsSync({ access_token: it.access_token, cursor });
        const merged = mergeTransactions(home, r.data.added, r.data.removed.map((x) => x.transaction_id!));
        home = merged.home; txCount += merged.added;
        cursor = r.data.next_cursor; more = r.data.has_more;
      }
      await admin.from("plaid_items").update({ cursor }).eq("id", it.id);
    } catch (e) {
      const pe = plaidError(e);
      if (pe.code === "PRODUCT_NOT_READY") pending.push(label);
      else { console.error("plaid transactionsSync", label, pe); problems.push(`${label} transactions: ${pe.message}`); }
    }
  }

  const { error } = await ctx.sb.from("home_data").update({ data: home, note: "synced accounts" }).eq("home_id", ctx.homeId);
  if (error) return NextResponse.json({ error: `Saved nothing: ${error.message}` }, { status: 500 });
  return NextResponse.json({ accounts: acctCount, transactions: txCount, pending, problems });
}
