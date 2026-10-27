import { SW_SOURCE } from "./source";

/**
 * Serves the service worker with the current build ID baked in. A new deployment changes
 * the file's bytes, which is what makes browsers detect "an update is available".
 */
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 10) ?? process.env.NEXT_PUBLIC_BUILD_ID ?? `dev-${Date.now()}`;

export function GET() {
  const src = SW_SOURCE.replaceAll("__BUILD_ID__", BUILD_ID);
  return new Response(src, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache, max-age=0, must-revalidate", "Service-Worker-Allowed": "/" } });
}
