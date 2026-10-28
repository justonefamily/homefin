"use client";
import Link from "next/link";
import { Shell } from "@/components/hub/Shell";
import { AppTile } from "@/components/hub/AppTile";
import { useApps } from "@/lib/hub";
import { Card } from "@/components/ui";

const greeting = () => { const h = new Date().getHours(); return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

export default function HubPage() {
  const { apps, error } = useApps();
  const visible = (apps ?? []).filter((a) => a.status !== "hidden");
  const live = visible.filter((a) => a.status !== "soon");
  const soon = visible.filter((a) => a.status === "soon");
  return (
    <Shell hero={(me) => (
      <>
        <div className="text-[13px] text-white/50">{greeting()}, {me.name.split(" ")[0]}.</div>
        <h1 className="text-[40px] md:text-[56px] font-extrabold tracking-[-0.03em] leading-[0.95] mt-2">Everything we&apos;re<br />building, in one place.</h1>
        <div className="text-[15px] text-white/60 mt-4 max-w-md">{live.length === 0 ? "The first app is on its way." : live.length === 1 ? "One app so far. More to come." : `${live.length} apps, one login.`}</div>
      </>
    )}>
      {(me) => (
        <>
          {error && <Card className="p-4 text-sm text-red">Couldn&apos;t load the apps: {error}</Card>}
          {apps && visible.length === 0 && <Card className="p-8 text-sm text-muted text-center">Nothing here yet.{me.owner && <> <Link href="/hub/admin" className="text-accent font-semibold">Add the first app</Link>.</>}</Card>}
          {live[0] && <AppTile app={live[0]} featured />}
          {live.length > 1 && <div className="grid sm:grid-cols-2 gap-3">{live.slice(1).map((a) => <AppTile key={a.id} app={a} />)}</div>}
          {soon.length > 0 && (
            <div className="flex flex-col gap-3 mt-2">
              <div className="text-[13px] font-semibold text-muted">In the works</div>
              <div className="grid sm:grid-cols-2 gap-3">{soon.map((a) => <AppTile key={a.id} app={a} />)}</div>
            </div>
          )}
          {me.owner && <div className="text-[12px] text-muted-3 pt-6">Add or rearrange apps from <Link href="/hub/admin" className="text-accent font-semibold">Manage apps</Link>.</div>}
        </>
      )}
    </Shell>
  );
}
