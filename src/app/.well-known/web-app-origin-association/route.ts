import { NextResponse } from "next/server";

/**
 * Lets the installed "Just One Family" app (the hub) treat every app subdomain as part of itself, so opening
 * HomeFin from the store doesn't show Chrome's "you've left the app" URL bar. Pairs with `scope_extensions`
 * in hub.webmanifest. Served on every host, since one deployment answers for all of them.
 */
export function GET() {
  const hub = process.env.NEXT_PUBLIC_HUB_HOST ?? "justonefamily.app";
  return NextResponse.json(
    { web_apps: [{ web_app_identity: `https://www.${hub}/` }, { web_app_identity: `https://${hub}/` }] },
    { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } },
  );
}
