import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/server";
import { plaid, plaidConfigured } from "@/lib/plaid";

/**
 * Daily (vercel.json): permanently delete homes whose 30-day deletion grace has passed. Disconnects their banks at
 * Plaid first so tokens don't linger, then deletes the home row — members, data, snapshots and plaid_items cascade.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = adminClient();
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: homes, error } = await admin.from("homes").select("id, name").lt("deleted_at", cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const purged: string[] = [];
  for (const h of homes ?? []) {
    if (plaidConfigured()) {
      const { data: items } = await admin.from("plaid_items").select("access_token").eq("home_id", h.id);
      for (const it of items ?? []) { try { await plaid().itemRemove({ access_token: it.access_token }); } catch { /* already gone */ } }
    }
    const { error: dErr } = await admin.from("homes").delete().eq("id", h.id);
    if (!dErr) purged.push(h.id);
  }
  return NextResponse.json({ purged: purged.length, checkedBefore: cutoff });
}
