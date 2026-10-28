"use client";
import { ArrowUpRight } from "lucide-react";
import type { HubApp } from "@/lib/types";
import { cx } from "./ui";

const BADGE: Record<HubApp["status"], string | null> = { live: null, beta: "Beta", soon: "Coming soon", hidden: "Hidden" };

export function AppTile({ app, large }: { app: HubApp; large?: boolean }) {
  const soon = app.status === "soon";
  const isImg = /^https?:\/\//.test(app.icon);
  const inner = (
    <>
      <div className="flex items-start gap-4">
        <div className={cx("shrink-0 rounded-[18px] flex items-center justify-center text-white shadow-sm", large ? "w-20 h-20 text-4xl" : "w-14 h-14 text-2xl")} style={{ background: app.color }}>
          {isImg ? <img src={app.icon} alt="" className="w-full h-full rounded-[18px] object-cover" /> : <span aria-hidden>{app.icon}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className={cx("font-bold tracking-tight truncate", large ? "text-xl" : "text-[15px]")}>{app.name}</div>
            {BADGE[app.status] && <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-surface text-muted border border-line">{BADGE[app.status]}</span>}
          </div>
          <div className="text-[13px] text-muted leading-snug mt-0.5">{app.tagline}</div>
          {large && app.description && <div className="text-[13px] text-ink-3 leading-relaxed mt-2 hidden sm:block">{app.description}</div>}
        </div>
        {!soon && <ArrowUpRight size={18} className="text-muted-3 group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />}
      </div>
    </>
  );
  const cls = cx("group block rounded-[20px] bg-card border border-line p-4 md:p-5 transition-all", soon ? "opacity-70" : "hover:border-field hover:shadow-[0_8px_30px_-12px_rgba(20,24,33,0.25)] hover:-translate-y-0.5", large && "md:p-7");
  return soon ? <div className={cls}>{inner}</div> : <a href={app.url} className={cls}>{inner}</a>;
}
