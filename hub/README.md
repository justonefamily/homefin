# Just One Family — the family app store

The gated launcher at **justonefamily.app**. Sign in once (Supabase auth, shared with every app on a subdomain via a `.justonefamily.app` cookie) and open any of the family's apps.

- `src/app/page.tsx` — the store (members only; "invited" = a row in `home_members`)
- `src/app/admin` — owners add / edit / reorder apps (`hub_apps` table, see `supabase/migrations`)
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.justonefamily.app`
