import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions } from "@/lib/supabase/cookies";

/** Keeps the session cookie fresh and sends signed-out visitors to /login. The hub is members-only. */
export async function proxy(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(url, key, { cookieOptions: cookieOptions(), cookies: { getAll: () => req.cookies.getAll(), setAll: (all) => { all.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); all.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); } } });
  const { data: { user } } = await sb.auth.getUser();
  const p = req.nextUrl.pathname;
  if (!user && !p.startsWith("/login") && !p.startsWith("/auth")) {
    const to = req.nextUrl.clone(); to.pathname = "/login"; to.searchParams.set("next", p); return NextResponse.redirect(to);
  }
  return res;
}
export const config = { matcher: ["/((?!_next|favicon.ico|icon.*\\.png|apple-touch-icon.png|icon.svg|manifest.webmanifest).*)"] };
