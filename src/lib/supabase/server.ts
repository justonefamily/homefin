import { createServerClient } from "@supabase/ssr";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Per-request client that respects the signed-in user's RLS. */
export async function createClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => { try { all.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* read-only context */ } },
    },
  });
}

/** Service-role client. Server routes only — bypasses RLS (used for plaid_items). */
export const adminClient = () =>
  createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
