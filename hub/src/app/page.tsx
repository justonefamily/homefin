"use client";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { AppTile } from "@/components/AppTile";
import { useApps } from "@/lib/hub";
import { Card } from "@/components/ui";

export default function HubPage() {
  const { apps, error } = useApps();
  return (
    <Shell>
      {(me) => {
        const hour = new Date().getHours();
        const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        const visible = (apps ?? []).filter((a) => a.status !== "hidden");
        const live = visible.filter((a) => a.status !== "soon");
        const soon = visible.filter((a) => a.status === "soon");
        return (
          <>
            <div>
              <div className="text-[13px] text-muted">{hello}, {me.name.split(" ")[0]}.</div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-1">Our apps</h1>
              <div className="text-sm text-muted mt-1">Everything we&apos;ve built for the family, one login for all of it.</div>
            </div>
            {error && <Card className="p-4 text-sm text-red">Couldn&apos;t load the apps: {error}</Card>}
            {apps && visible.length === 0 && <Card className="p-6 text-sm text-muted text-center">Nothing here yet.{me.owner && <> <Link href="/admin" className="text-accent font-semibold">Add the first app</Link>.</>}</Card>}
            {live.length > 0 && (
              <div className="flex flex-col gap-3">
                {live[0] && <AppTile app={live[0]} large />}
                {live.length > 1 && <div className="grid sm:grid-cols-2 gap-3">{live.slice(1).map((a) => <AppTile key={a.id} app={a} />)}</div>}
              </div>
            )}
            {soon.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">In the works</div>
                <div className="grid sm:grid-cols-2 gap-3">{soon.map((a) => <AppTile key={a.id} app={a} />)}</div>
              </div>
            )}
            <div className="text-[11px] text-muted-3 text-center pt-6">Just One Family · private</div>
          </>
        );
      }}
    </Shell>
  );
}
