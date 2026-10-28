import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions } from "@/lib/supabase/cookies";

/** Keeps the Supabase session cookie fresh and sends signed-out users to /login (only when Supabase is configured). */
export async function proxy(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(url, key, { cookieOptions: cookieOptions(), cookies: { getAll: () => req.cookies.getAll(), setAll: (all) => { all.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); all.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); } } });
  const { data: { user } } = await sb.auth.getUser();
  const p = req.nextUrl.pathname;
  if (!user && !p.startsWith("/login") && !p.startsWith("/invite") && !p.startsWith("/api") && !p.startsWith("/auth") && !p.startsWith("/install")) {
    const to = req.nextUrl.clone(); to.pathname = "/login"; to.searchParams.set("next", p); return NextResponse.redirect(to);
  }
  return res;
}
export const config = { matcher: ["/((?!_next|sw.js|offline.html|manifest.webmanifest|favicon.ico|icon.*\\.png|screenshot.*\\.png|apple-touch-icon.png|icon.svg).*)"] };
