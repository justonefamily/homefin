"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings2, Loader2, Lock } from "lucide-react";
import { signOut, useMe } from "@/lib/hub";
import { Button } from "@/components/ui";
import type { Me } from "@/lib/hubTypes";

/** The family's mark — the same house as the HomeFin icon. */
export const FamilyMark = ({ size = 36 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden><rect width="64" height="64" rx="14" fill="#141821" /><path d="M14 32l18-15 18 15v17a2 2 0 0 1-2 2H37V39H27v12H16a2 2 0 0 1-2-2z" fill="none" stroke="#4fb3bc" strokeWidth="3.5" strokeLinejoin="round" /></svg>
);

export function Shell({ children, admin, hero }: { children: (me: Me) => React.ReactNode; admin?: boolean; hero?: (me: Me) => React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const go = me === null ? "/login?next=/" : admin && me && !me.owner ? "/" : null;
  useEffect(() => { if (go) router.replace(go); }, [go, router]);
  if (me === undefined || me === null || go) return <div className="flex-1 flex items-center justify-center text-muted gap-2 text-sm bg-ink text-white/60"><Loader2 className="animate-spin" size={18} /> One moment…</div>;
  if (!me.member) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-ink text-white">
        <div className="max-w-sm text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-[16px] bg-white/10 flex items-center justify-center"><Lock size={22} className="text-teal" /></div>
          <div className="text-xl font-extrabold tracking-tight">This space is just for the family</div>
          <div className="text-sm text-white/60">You&apos;re signed in as <b className="text-white">{me.email}</b>, but that account hasn&apos;t been invited. Ask Abraham or Ledalis for an invite link, then come back.</div>
          <Button variant="secondary" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col bg-surface">
      <div className="bg-ink text-white">
        <div className="mx-auto w-full max-w-3xl px-5">
          <header className="h-16 flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded-lg">
              <FamilyMark size={32} />
              <span className="font-extrabold tracking-tight text-[15px]">Just One Family</span>
            </Link>
            <div className="ml-auto flex items-center gap-1 text-[12px] text-white/60">
              <span className="hidden sm:inline mr-1">{me.name}</span>
              {me.owner && <Link href="/hub/admin" className="w-9 h-9 rounded-[10px] flex items-center justify-center hover:bg-white/10 hover:text-white" aria-label="Manage apps"><Settings2 size={17} /></Link>}
              <button onClick={signOut} className="w-9 h-9 rounded-[10px] flex items-center justify-center hover:bg-white/10 hover:text-white" aria-label="Sign out"><LogOut size={17} /></button>
            </div>
          </header>
          {hero && <div className="pt-6 pb-16 md:pt-10 md:pb-20">{hero(me)}</div>}
        </div>
      </div>
      <main className={`mx-auto w-full max-w-3xl px-5 pb-16 flex flex-col gap-6 ${hero ? "-mt-10 md:-mt-12" : "pt-8"}`}>{children(me)}</main>
    </div>
  );
}
