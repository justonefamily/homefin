import { NextResponse } from "next/server";
import { mergeAccounts, mergeTransactions, plaid } from "@/lib/plaid";
import { adminClient } from "@/lib/supabase/server";
import type { HomeData } from "@/lib/types";
import { requireHome } from "../_shared";

/**
 * Pull balances + transactions for every Plaid item on the home and merge them into
 * home_data. Called from the Accounts screen, and safe to call from a cron / webhook.
 */
export async function POST() {
  const ctx = await requireHome();
  if ("error" in ctx) return ctx.error;
  const admin = adminClient();
  const { data: items } = await admin.from("plaid_items").select("*").eq("home_id", ctx.homeId);
  const { data: row } = await ctx.sb.from("home_data").select("data").eq("home_id", ctx.homeId).single();
  let home = row!.data as HomeData;
  let txCount = 0, acctCount = 0;
  try {
    for (const it of items ?? []) {
      const client = plaid();
      const accts = await client.accountsGet({ access_token: it.access_token });
      home = mergeAccounts(home, it.item_id, it.institution ?? accts.data.item.institution_id ?? "Bank", accts.data.accounts);
      acctCount += accts.data.accounts.length;
      // Liabilities give APR + minimum payment for cards and loans.
      try {
        const li = await client.liabilitiesGet({ access_token: it.access_token });
        for (const c of li.data.liabilities.credit ?? []) { const a = home.accounts.find((x) => x.id === c.account_id); if (a) { a.apr = c.aprs?.[0]?.apr_percentage ?? a.apr; a.minPayment = c.minimum_payment_amount ?? a.minPayment; } }
        for (const s of li.data.liabilities.student ?? []) { const a = home.accounts.find((x) => x.id === s.account_id); if (a) { a.apr = s.interest_rate_percentage ?? a.apr; a.minPayment = s.minimum_payment_amount ?? a.minPayment; } }
        for (const m of li.data.liabilities.mortgage ?? []) { const a = home.accounts.find((x) => x.id === m.account_id); if (a) { a.apr = m.interest_rate?.percentage ?? a.apr; a.minPayment = m.next_monthly_payment ?? a.minPayment; } }
      } catch { /* liabilities not available for this institution */ }
      let cursor = it.cursor ?? undefined;
      let more = true;
      while (more) {
        const r = await client.transactionsSync({ access_token: it.access_token, cursor });
        const merged = mergeTransactions(home, r.data.added, r.data.removed.map((x) => x.transaction_id!));
        home = merged.home; txCount += merged.added;
        cursor = r.data.next_cursor; more = r.data.has_more;
      }
      await admin.from("plaid_items").update({ cursor }).eq("id", it.id);
    }
    const { error } = await ctx.sb.from("home_data").update({ data: home, note: "synced accounts" }).eq("home_id", ctx.homeId);
    if (error) throw error;
    return NextResponse.json({ accounts: acctCount, transactions: txCount });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
