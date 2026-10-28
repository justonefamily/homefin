"use client";
import { useInstallDiagnostics } from "@/components/PWA";
import { Button, Card, Eyebrow } from "@/components/ui";

/** /install — shows why the browser will or won't offer "Install app", with a reset. Public (no sign-in needed). */
export default function InstallPage() {
  const { d, reset, promptInstall } = useInstallDiagnostics();
  const canPrompt = d["Install prompt captured (beforeinstallprompt)"] === "true";
  return (
    <div className="mx-auto w-full max-w-lg p-6 flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Install HomeFin</h1>
      <Card className="p-4 flex flex-col gap-3">
        {canPrompt ? <Button onClick={promptInstall}>Install app now</Button> : (
          <div className="text-[13px] text-muted leading-relaxed">
            <b className="text-ink">If you don&apos;t see an Install button here:</b><br />
            • <b>Chrome / Edge on Windows or Mac</b>: click the install icon at the right end of the address bar (a monitor with a down-arrow), or ⋮ menu → <i>Cast, save, and share</i> → <i>Install page as app</i>. If it says <i>Create shortcut</i> instead, press <b>Reset &amp; reload</b> below, wait 5 seconds, and check the menu again.<br />
            • <b>Android (Chrome)</b>: ⋮ menu → <i>Add to Home screen</i> → <i>Install</i>.<br />
            • <b>iPhone / iPad (Safari)</b>: Share → <i>Add to Home Screen</i>.<br />
            • <b>Firefox</b> and desktop Safari don&apos;t install web apps; use Chrome or Edge.
          </div>
        )}
        <Button variant="secondary" onClick={reset}>Reset &amp; reload (clears old app files)</Button>
      </Card>
      <Eyebrow>What this browser reports</Eyebrow>
      <Card>
        {Object.entries(d).map(([k, v]) => (
          <div key={k} className="flex gap-3 px-4 py-2 border-b border-line-soft last:border-b-0 text-[12px]"><div className="w-48 shrink-0 text-muted">{k}</div><div className={v.startsWith("FAILED") ? "text-red font-semibold" : "font-medium break-all"}>{v}</div></div>
        ))}
        {Object.keys(d).length === 0 && <div className="px-4 py-3 text-xs text-muted">Checking…</div>}
      </Card>
      <div className="text-[11px] text-muted">Screenshot this page and send it over if installing still doesn&apos;t work.</div>
    </div>
  );
}
