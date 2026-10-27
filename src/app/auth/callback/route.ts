import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** OAuth / magic-link landing: exchange the code for a session, then go where the user was headed. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  if (code) {
    const sb = await createClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
