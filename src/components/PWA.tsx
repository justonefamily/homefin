"use client";
import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { Button, Card } from "./ui";

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
let deferred: BIPEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; window.dispatchEvent(new Event("homefin:installable")); });
}

/** Registers the service worker once. Mount anywhere in the tree. */
export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
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
