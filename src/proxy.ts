import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions } from "@/lib/supabase/cookies";

/** Keeps the Supabase session cookie fresh and sends signed-out users to /login (only when Supabase is configured). */
export async function proxy(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return routeHost(req, NextResponse.next({ request: req }), true);
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(url, key, { cookieOptions: cookieOptions(), cookies: { getAll: () => req.cookies.getAll(), setAll: (all) => { all.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); all.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); } } });
  const { data: { user } } = await sb.auth.getUser();
  return routeHost(req, res, !!user);
}

const isShared = (p: string) => p.startsWith("/login") || p.startsWith("/auth") || p.startsWith("/api") || p.startsWith("/invite");

/** One deployment, two front doors: the apex domain is the family app store (/hub/*), the subdomain is HomeFin. */
function routeHost(req: NextRequest, res: NextResponse, signedIn: boolean) {
  const p = req.nextUrl.pathname;
  const host = req.headers.get("host") ?? "";
  const hubHost = process.env.NEXT_PUBLIC_HUB_HOST; // "justonefamily.app" in production
  const onHub = !!hubHost && (host === hubHost || host === `www.${hubHost}`);
  const shared = isShared(p);
  if (!signedIn && !shared && !p.startsWith("/install")) {
    const to = req.nextUrl.clone(); to.pathname = "/login"; to.searchParams.set("next", p); return NextResponse.redirect(to);
  }
  if (onHub) {
    // (apex vs www is settled by the Vercel domain redirect; both hosts serve the store)
    if (!shared && !p.startsWith("/hub")) {
      const to = req.nextUrl.clone(); to.pathname = p === "/" ? "/hub" : `/hub${p}`;
      const r = NextResponse.rewrite(to, { request: req }); res.cookies.getAll().forEach((c) => r.cookies.set(c)); return r;
    }
  } else if (p.startsWith("/hub") && hubHost) {
    const to = req.nextUrl.clone(); to.host = hubHost; to.pathname = p.replace(/^\/hub/, "") || "/"; return NextResponse.redirect(to);
  }
  return res;
}
export const config = { matcher: ["/((?!_next|sw.js|offline.html|manifest.webmanifest|hub.webmanifest|\\.well-known|pdfjs|favicon.ico|icon.*\\.png|hub-icon.*|screenshot.*\\.png|apple-touch-icon.png|icon.svg).*)"] };
