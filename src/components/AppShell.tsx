"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CalendarDays, CalendarCheck, CreditCard, Home, Settings, TrendingUp, Cloud, CloudOff, Loader2, Wallet } from "lucide-react";
import { useHome } from "@/store/useHome";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";
import { SupabaseAdapter } from "@/lib/storage/supabase";
import { LocalAdapter } from "@/lib/storage/local";
import { Button, Card, cx } from "./ui";
import { importJson } from "@/lib/storage/local";
import { applyRecommendations, quarterOf, recommendBudgets } from "@/lib/detect";
import { dedupeIncome, matchInternalTransfers } from "@/lib/merchants";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/bills", label: "Bills", icon: CalendarDays },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/plan", label: "Plan", icon: TrendingUp },
  { href: "/calendar", label: "Calendar", icon: CalendarCheck },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/accounts", label: "Accounts", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data, status, adapter, setAdapter, load, onboarded, update } = useHome();
  // Quarter rollover: when auto-apply is on and this quarter hasn't been applied yet, reset budgets to last quarter's averages.
  useEffect(() => {
    if (!data?.settings.autoApplyBudgetRecommendations) return;
    const q = quarterOf(new Date());
    if (data.settings.budgetsAppliedForQuarter === q) return;
    const recs = recommendBudgets(data, new Date());
    update((h) => ({ ...applyRecommendations(h, recs), settings: { ...h.settings, budgetsAppliedForQuarter: q } }), `auto-reset budgets for ${q}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.settings.autoApplyBudgetRecommendations, data?.settings.budgetsAppliedForQuarter]);
  // Pair deposits with matching outflows across accounts (internal transfers) for data synced before this existed.
  useEffect(() => {
    if (!data) return;
    const deduped = dedupeIncome(data);
    const next = matchInternalTransfers(deduped ?? data) ?? deduped;
    if (next) update(() => next, deduped ? "removed duplicate deposits" : "matched transfers between your accounts");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.transactions.length, data?.income?.length]);
  const [booted, setBooted] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  // Pick the storage adapter once: Supabase when configured + signed in, else local.
  useEffect(() => {
    (async () => {
      if (supabaseConfigured()) {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { router.replace("/login"); return; }
        setUserName(user.user_metadata?.name ?? user.email ?? "you");
        const { data: members, error: mErr } = await sb.from("home_members").select("home_id").limit(1);
        if (mErr) { setBootError(`Couldn't read your home: ${mErr.message}`); setBooted(true); return; }
        let homeId = members?.[0]?.home_id as string | undefined;
        if (!homeId) {
          const { data: created, error: cErr } = await sb.rpc("create_home", { p_name: "My home", p_display_name: user.user_metadata?.name ?? null });
          if (cErr) { setBootError(`Couldn't create a home: ${cErr.message}`); setBooted(true); return; }
          homeId = created as string;
        }
        await setAdapter(new SupabaseAdapter(sb, homeId!));
      } else {
        await setAdapter(new LocalAdapter());
      }
      setBooted(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (bootError) {
    return <div className="flex-1 flex items-center justify-center p-6 text-sm text-red text-center max-w-md mx-auto">{bootError}<br /><span className="text-muted">Try reloading; if it persists, check Supabase RLS / function grants.</span></div>;
  }
  if (!booted || (status === "loading" && !data)) {
    return <div className="flex-1 flex items-center justify-center text-muted gap-2 text-sm"><Loader2 className="animate-spin" size={18} /> Loading your home…</div>;
  }

  if (!data || !onboarded) {
    return <Onboarding reload={load} />;
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-r border-line bg-card px-4 py-6 gap-6 sticky top-0 h-screen">
        <Link href="/" className="flex items-center gap-2.5 px-2">
          <div className="w-8 h-8 rounded-[9px] bg-ink flex items-center justify-center"><Home size={16} className="text-teal" /></div>
          <div className="font-bold text-[15px] tracking-tight">HomeFin</div>
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link key={href} href={href} className={cx("flex items-center gap-3 h-11 px-3 rounded-[12px] text-sm font-semibold", active ? "bg-accent-bg text-accent" : "text-muted hover:bg-surface hover:text-ink")}>
                <Icon size={18} /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2 text-xs text-muted flex flex-col gap-1">
          <div className="font-semibold text-ink truncate">{data.homeName}</div>
          <div className="flex items-center gap-1.5">{adapter.kind === "local" ? <CloudOff size={13} /> : <Cloud size={13} />} {adapter.label}{userName ? ` · ${userName}` : ""}</div>
          <SaveStatus />
          <div className="text-[10px] text-muted-3">build {process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}</div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <div className="mx-auto w-full max-w-md md:max-w-6xl px-5 pt-6 pb-28 md:px-10 md:py-8 flex flex-col gap-4 md:gap-6">{children}</div>
      </main>

      {/* Mobile bottom tabs */}
      <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-line grid grid-cols-8 px-0.5 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href} className={cx("flex flex-col items-center justify-center gap-0.5 h-12 text-[9px] font-semibold", active ? "text-accent" : "text-muted")}>
              <Icon size={20} /> {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function SaveStatus() {
  const { status, savedAt, error } = useHome();
  if (status === "saving") return <span className="text-muted-2">Saving…</span>;
  if (status === "error") return <span className="text-red">Save failed: {error}</span>;
  if (savedAt) return <span className="text-muted-2">Saved {new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>;
  return null;
}

function Onboarding({ reload }: { reload: () => Promise<void> }) {
  const { loadSample, startFresh, replace, adapter, data, status, error } = useHome();
  const [name, setName] = useState(data?.homeName && data.homeName !== "My home" ? data.homeName : "My home");
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-[12px] bg-ink flex items-center justify-center"><Home size={20} className="text-teal" /></div>
          <div><div className="text-xl font-bold tracking-tight">Welcome to HomeFin</div><div className="text-sm text-muted">Data is saved to: {adapter.label}</div></div>
        </div>
        <Card className="p-5 flex flex-col gap-3">
          <div className="text-sm font-semibold">Start a new home</div>
          <input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-[12px] border border-chip px-3 text-sm" aria-label="Home name" />
          <Button onClick={() => startFresh(name)} disabled={status === "saving"}>{status === "saving" ? "Creating…" : `Create “${name}”`}</Button>
          {status === "error" && <div className="text-xs text-red">Couldn&apos;t save: {error}</div>}
        </Card>
        <Card className="p-5 flex flex-col gap-3">
          <div className="text-sm font-semibold">Or bring your own data</div>
          <label className="h-11 rounded-[12px] border border-line bg-card text-[13px] font-semibold flex items-center justify-center cursor-pointer hover:border-field">
            Import a HomeFin JSON file
            <input type="file" accept="application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { await replace(await importJson(f), "imported file"); await reload(); } }} />
          </label>
          <Button variant="secondary" onClick={loadSample}>Try it with sample data</Button>
        </Card>
      </div>
    </div>
  );
}
