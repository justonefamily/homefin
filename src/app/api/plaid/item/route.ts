import { NextResponse } from "next/server";
import { plaid, plaidError } from "@/lib/plaid";
import { adminClient } from "@/lib/supabase/server";
import type { HomeData } from "@/lib/types";
import { requireHome } from "../_shared";

/** List the home's bank connections (no tokens). */
export async function GET() {
  const ctx = await requireHome();
  if ("error" in ctx) return ctx.error;
  const { data, error } = await adminClient().from("plaid_items").select("item_id, institution, created_at").eq("home_id", ctx.homeId).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

/**
 * Disconnect a bank: tell Plaid to remove the item (stops billing and data access), delete our
 * token row, and drop that link's accounts, transactions, balance history and income from the home.
 */
export async function DELETE(req: Request) {
  const ctx = await requireHome();
  if ("error" in ctx) return ctx.error;
  const { item_id } = await req.json();
  if (!item_id) return NextResponse.json({ error: "item_id required" }, { status: 400 });
  const admin = adminClient();
  const { data: it } = await admin.from("plaid_items").select("*").eq("home_id", ctx.homeId).eq("item_id", item_id).maybeSingle();
  if (!it) return NextResponse.json({ error: "Connection not found." }, { status: 404 });

  try { await plaid().itemRemove({ access_token: it.access_token }); }
  catch (e) { const pe = plaidError(e); if (pe.code !== "ITEM_NOT_FOUND") console.warn("plaid itemRemove", pe); }

  const { error: delErr } = await admin.from("plaid_items").delete().eq("id", it.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { data: row } = await ctx.sb.from("home_data").select("data").eq("home_id", ctx.homeId).single();
  if (row) {
    const home = row.data as HomeData;
    const gone = new Set(home.accounts.filter((a) => a.plaidItemId === item_id).map((a) => a.id));
    const next: HomeData = {
      ...home,
      accounts: home.accounts.filter((a) => !gone.has(a.id)),
      transactions: home.transactions.filter((t) => !t.accountId || !gone.has(t.accountId)),
      balanceHistory: (home.balanceHistory ?? []).filter((b) => !gone.has(b.accountId)),
      income: (home.income ?? []).filter((e) => !e.accountId || !gone.has(e.accountId)),
      bills: home.bills.map((b) => (b.accountId && gone.has(b.accountId) ? { ...b, accountId: undefined } : b)),
    };
    const { error } = await ctx.sb.from("home_data").update({ data: next, note: `disconnected ${it.institution ?? "bank"}` }).eq("home_id", ctx.homeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ removedAccounts: gone.size });
  }
  return NextResponse.json({ removedAccounts: 0 });
}
