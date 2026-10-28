"use client";
import { ArrowUpRight } from "lucide-react";
import type { HubApp } from "@/lib/hubTypes";
import { HubIcon } from "@/lib/hubIcons";
import { cx } from "@/components/ui";

const BADGE: Record<HubApp["status"], string | null> = { live: null, beta: "Beta", soon: "Coming soon", hidden: "Hidden" };

/** An app's mark: its SVG icon on a square of its color — the same language as the HomeFin app icon. */
export function AppMark({ app, size = 56, className }: { app: Pick<HubApp, "icon" | "color">; size?: number; className?: string }) {
  return (
    <div className={cx("shrink-0 flex items-center justify-center", className)} style={{ width: size, height: size, borderRadius: size * 0.28, background: app.color, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08), 0 10px 24px -14px rgba(20,24,33,0.6)" }}>
      <HubIcon name={app.icon} size={size * 0.5} strokeWidth={2.25} className="text-white" />
    </div>
  );
}

export function AppTile({ app, featured }: { app: HubApp; featured?: boolean }) {
  const soon = app.status === "soon";
  const badge = BADGE[app.status];
  if (featured) {
    const body = (
      <div className="relative overflow-hidden rounded-[24px] bg-ink-2 ring-1 ring-white/15 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6)] text-white p-6 md:p-8 min-h-[220px] flex flex-col justify-between">
        {/* the app's own mark, oversized and bleeding off the corner */}
        <HubIcon name={app.icon} aria-hidden size={300} strokeWidth={1.25} className="absolute -right-16 -bottom-20 opacity-[0.08]" style={{ color: app.color === "#141821" ? "#4fb3bc" : app.color }} />
        <div className="relative flex items-start justify-between gap-4">
          <AppMark app={app} size={64} />
          {badge && <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 bg-white/10 text-white/80">{badge}</span>}
        </div>
        <div className="relative mt-8">
          <div className="text-[28px] md:text-[34px] font-extrabold tracking-tight leading-none">{app.name}</div>
          <div className="text-[15px] text-white/70 mt-2 max-w-md">{app.tagline}</div>
          {app.description && <div className="text-[13px] text-white/50 mt-3 max-w-lg leading-relaxed hidden sm:block">{app.description}</div>}
        </div>
        {!soon && <div className="relative mt-6 inline-flex items-center gap-1.5 self-start rounded-full bg-teal text-ink text-[13px] font-bold px-4 py-2 group-hover:bg-white transition-colors">Open {app.name}<ArrowUpRight size={15} strokeWidth={2.5} /></div>}
      </div>
    );
    return soon ? <div className="group">{body}</div> : <a href={app.url} className="group block focus:outline-none focus-visible:ring-4 focus-visible:ring-teal/40 rounded-[24px]">{body}</a>;
  }
  const body = (
    <div className={cx("rounded-[20px] bg-card border border-line p-4 flex items-center gap-4 transition-colors", soon ? "opacity-75" : "group-hover:border-ink")}>
      <AppMark app={app} size={52} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2"><div className="text-[16px] font-bold tracking-tight truncate">{app.name}</div>{badge && <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-surface text-muted border border-line">{badge}</span>}</div>
        <div className="text-[13px] text-muted leading-snug mt-0.5 truncate">{app.tagline}</div>
      </div>
      {!soon && <ArrowUpRight size={18} className="text-muted-3 group-hover:text-ink shrink-0" />}
    </div>
  );
  return soon ? <div className="group">{body}</div> : <a href={app.url} className="group block focus:outline-none focus-visible:ring-4 focus-visible:ring-teal/40 rounded-[20px]">{body}</a>;
}
