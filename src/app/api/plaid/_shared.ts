import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidConfigured } from "@/lib/plaid";

/** Resolves the signed-in user and their home, or a ready-to-return error response. */
export async function requireHome() {
  if (!plaidConfigured()) return { error: NextResponse.json({ error: "Plaid is not configured (PLAID_CLIENT_ID / PLAID_SECRET)." }, { status: 503 }) };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const { data: m } = await sb.from("home_members").select("home_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!m) return { error: NextResponse.json({ error: "No home found." }, { status: 404 }) };
  if (m.role === "viewer") return { error: NextResponse.json({ error: "Viewers can't connect accounts." }, { status: 403 }) };
  return { user, homeId: m.home_id as string, sb };
}
