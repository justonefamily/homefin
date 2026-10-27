"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

function Accept() {
  const token = useSearchParams().get("token");
  const [msg, setMsg] = useState("Joining the home…");
  useEffect(() => {
    (async () => {
      if (!token || !supabaseConfigured()) { setMsg("Invalid invite link."); return; }
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { location.href = `/login?next=${encodeURIComponent(`/invite?token=${token}`)}`; return; }
      const { error } = await sb.rpc("accept_invite", { p_token: token, p_display_name: user.user_metadata?.name ?? null });
      if (error) { setMsg(error.message); return; }
      location.href = "/";
    })();
  }, [token]);
  return <div className="flex-1 flex items-center justify-center p-6 text-sm text-muted">{msg}</div>;
}

export default function InvitePage() { return <Suspense><Accept /></Suspense>; }
