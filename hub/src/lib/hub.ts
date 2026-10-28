"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import type { HubApp, Me } from "./types";

/** Who's signed in, whether they're invited (a member of any home) and whether they curate the store (owner). */
export function useMe() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setMe(null); return; }
      const { data: rows } = await sb.from("home_members").select("role");
      const roles = (rows ?? []).map((r) => r.role as string);
      setMe({ id: user.id, name: user.user_metadata?.name ?? user.email?.split("@")[0] ?? "you", email: user.email ?? "", member: roles.length > 0, owner: roles.includes("owner") });
    })();
  }, []);
  return me;
}

export function useApps() {
  const [apps, setApps] = useState<HubApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const { data, error } = await createClient().from("hub_apps").select("*").order("sort").order("name");
    if (error) setError(error.message); else setApps(data as HubApp[]);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  return { apps, error, reload };
}

export const signOut = async () => { await createClient().auth.signOut(); location.href = "/login"; };
