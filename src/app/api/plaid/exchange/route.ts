import { NextResponse } from "next/server";
import { plaid, plaidError } from "@/lib/plaid";
import { adminClient } from "@/lib/supabase/server";
import { requireHome } from "../_shared";

export async function POST(req: Request) {
  const ctx = await requireHome();
  if ("error" in ctx) return ctx.error;
  const { public_token, institution } = await req.json();
  try {
    const r = await plaid().itemPublicTokenExchange({ public_token });
    // Access tokens live only in plaid_items, reachable only with the service role.
    const { error } = await adminClient().from("plaid_items").upsert({ home_id: ctx.homeId, item_id: r.data.item_id, access_token: r.data.access_token, institution: institution ?? null }, { onConflict: "item_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const pe = plaidError(e);
    console.error("plaid", pe);
    return NextResponse.json({ error: `Plaid: ${pe.message} (${pe.code})` }, { status: 500 });
  }
}
