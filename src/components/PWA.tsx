"use client";
import { useEffect, useState } from "react";
import { Download, RefreshCw, Share } from "lucide-react";
import { Button, Card } from "./ui";

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
let deferred: BIPEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; window.dispatchEvent(new Event("homefin:installable")); });
}

/**
 * Registers the service worker and watches for new releases. When a new worker is installed and
 * waiting, an "Update available" toast appears. "Update now" activates it and reloads; "Later" hides
 * the toast for this session only — the waiting worker is still there on the next refresh, so it asks again.
 */
export function RegisterSW() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let reg: ServiceWorkerRegistration | undefined;
    const onWaiting = (r: ServiceWorkerRegistration) => { if (r.waiting && navigator.serviceWorker.controller) setWaiting(r.waiting); };
    navigator.serviceWorker.register("/sw.js").then((r) => {
      reg = r;
      onWaiting(r);
      r.addEventListener("updatefound", () => { const nw = r.installing; nw?.addEventListener("statechange", () => { if (nw.state === "installed") onWaiting(r); }); });
    }).catch(() => undefined);
    // Check for a new release when the tab comes back and every 15 minutes.
    const check = () => reg?.update().catch(() => undefined);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(check, 15 * 60_000);
    // When the new worker takes over, reload once so every tab runs the same release.
    let reloading = false;
    const onCtrl = () => { if (reloading) return; reloading = true; location.reload(); };
    navigator.serviceWorker.addEventListener("controllerchange", onCtrl);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(t); navigator.serviceWorker.removeEventListener("controllerchange", onCtrl); };
  }, []);
  if (!waiting || dismissed) return null;
  return (
    <div role="status" className="fixed z-[60] left-4 right-4 md:left-auto md:right-6 bottom-24 md:bottom-6 md:w-[380px] rounded-[16px] bg-ink text-white shadow-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-[10px] bg-ink-2 flex items-center justify-center shrink-0"><RefreshCw size={16} className="text-teal" /></div>
      <div className="flex-1 min-w-0"><div className="text-sm font-semibold">Update available</div><div className="text-[12px] text-muted-3">A new version of HomeFin is ready. Updating takes a second.</div></div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button onClick={() => waiting.postMessage("SKIP_WAITING")} className="h-8 px-3 rounded-[9px] bg-teal text-ink text-xs font-semibold">Update now</button>
        <button onClick={() => setDismissed(true)} className="h-8 px-3 rounded-[9px] text-xs font-semibold text-muted-3 hover:text-white">Later</button>
      </div>
    </div>
  );
}

/** "Install app" card: native prompt on Chrome/Edge/Android, step-by-step on iOS and desktop Safari. Hidden once installed. */
export function InstallCard() {
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent));
    const on = () => setCanPrompt(true);
    window.addEventListener("homefin:installable", on);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("homefin:installable", on);
  }, []);
  if (installed) return null;
  const install = async () => { if (!deferred) return; await deferred.prompt(); const { outcome } = await deferred.userChoice; if (outcome === "accepted") setInstalled(true); deferred = null; setCanPrompt(false); };
  return (
    <Card className="p-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2"><Download size={16} className="text-accent" /><div className="text-sm font-semibold">Install HomeFin as an app</div></div>
      {canPrompt ? (
        <>
          <div className="text-[13px] text-muted">Runs in its own window with an icon on your home screen or desktop — no browser bar.</div>
          <Button onClick={install}>Install app</Button>
        </>
      ) : ios ? (
        <div className="text-[13px] text-muted leading-relaxed">On iPhone/iPad: tap the <Share size={13} className="inline -mt-0.5" /> <b>Share</b> button in Safari, then <b>Add to Home Screen</b>, then <b>Add</b>. It installs as a full-screen app.</div>
      ) : (
        <div className="text-[13px] text-muted leading-relaxed">In Chrome or Edge, click the <b>install icon</b> at the right end of the address bar (or the ⋮ menu → <b>Install HomeFin</b>). If you only see &quot;Create shortcut&quot;, reload once — the app install becomes available after the first visit.</div>
      )}
    </Card>
  );
}
