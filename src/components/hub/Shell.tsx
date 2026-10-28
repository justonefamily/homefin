"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings2, Loader2 } from "lucide-react";
import { signOut, useMe } from "@/lib/hub";
import { Button } from "@/components/ui";

export function Shell({ children, admin }: { children: (me: NonNullable<ReturnType<typeof useMe>>) => React.ReactNode; admin?: boolean }) {
  const me = useMe();
  const router = useRouter();
  const go = me === null ? "/login" : admin && me && !me.owner ? "/" : null;
  useEffect(() => { if (go) router.replace(go); }, [go, router]);
  if (me === undefined || me === null || go) return <div className="flex-1 flex items-center justify-center text-muted gap-2 text-sm"><Loader2 className="animate-spin" size={18} /> One moment…</div>;
  if (!me.member) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm text-center flex flex-col gap-3">
          <div className="text-4xl">🔒</div>
          <div className="text-lg font-bold">This is a family space</div>
          <div className="text-sm text-muted">You&apos;re signed in as <b>{me.email}</b>, but that account hasn&apos;t been invited yet. Ask Abraham or Ledalis for an invite link, then come back.</div>
          <Button variant="secondary" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-10 bg-surface/85 backdrop-blur border-b border-line">
        <div className="mx-auto w-full max-w-5xl px-5 h-14 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/hub-icon.svg" alt="" className="w-8 h-8 rounded-[9px]" />
            <div className="font-extrabold tracking-tight text-[15px]">Just One Family</div>
          </Link>
          <div className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
            <span className="hidden sm:inline">{me.name}</span>
            {me.owner && <Link href="/hub/admin" className="w-9 h-9 rounded-[10px] flex items-center justify-center hover:bg-card" aria-label="Manage apps"><Settings2 size={17} /></Link>}
            <button onClick={signOut} className="w-9 h-9 rounded-[10px] flex items-center justify-center hover:bg-card" aria-label="Sign out"><LogOut size={17} /></button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-5 py-6 md:py-10 flex flex-col gap-6">{children(me)}</main>
    </div>
  );
}
