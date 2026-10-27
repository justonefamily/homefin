# HomeFin

Bills, budget and debt payoff for your home. Mobile-first PWA (Next.js 16 · TypeScript · Tailwind 4), deployed on Vercel, data in Supabase (or a local file / Google Drive / OneDrive).

## What's inside

| Area | What it does |
| --- | --- |
| **Home** | Pay-period view (1st–15th / 16th–end), left to pay, week-by-week ending balance, bills due, current plan |
| **Bills** | Month calendar + tap-to-pay list · **Weeks** forward cash-flow · **Year** actual vs. projected per month |
| **Plan** | Strategy dropdown — Debt Snowball, Avalanche, Ramsey Baby Steps (7-step chart), 50/30/20, 6 Cans (50/10/10/10/10/10) — all computed from the same data · payoff timeline + balance curve · **Budget** tab with pace marker |
| **Insights** | This time vs. last year (income, bills, spending, debt) and a *Make your own comparison* widget (metric × period type × any two periods) |
| **Accounts** | Plaid Link (banks, cards, loans — persistent tokens, background sync, liabilities give APR + minimums), manual accounts, billers |
| **Settings** | Household: members, roles, invite links · Version history: rolling 7 days, one-tap restore · Storage picker · Export/Import JSON · Pay schedule |

Phones get a bottom tab bar; ≥768px gets a sidebar and multi-column layouts.

## Architecture

- `src/lib/types.ts` — the whole home is **one JSON document** (`HomeData`). That is what every storage backend saves and what rollback restores.
- `src/lib/strategies.ts`, `projections.ts`, `insights.ts` — pure functions, unit-tested (`npm test`).
- `src/lib/storage/*` — `StorageAdapter` interface with `local`, `supabase`, `gdrive`, `onedrive` implementations. All support `listSnapshots()` / `restore()`.
- `src/store/useHome.ts` — zustand store: edit → debounce → `adapter.save()` (every save snapshots the previous version).
- `supabase/migrations/0001_homes.sql` — homes, members, invites, `home_data`, `home_snapshots` (trigger keeps a rolling 7 days), `plaid_items` (service-role only), RLS, RPCs `create_home`, `accept_invite`, `restore_home_snapshot`.
- `src/app/api/plaid/*` — link token, token exchange, sync (balances, liabilities, transactions via `/transactions/sync`).

Without Supabase env vars the app runs **local-only** (browser storage, snapshots included) — useful for trying it, and the fallback for people who never want a cloud account.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Plaid keys
npm run dev
```

1. **Supabase** — create a project, run `supabase/migrations/0001_homes.sql` in the SQL editor (or `supabase db push`). Copy URL, anon key and service-role key into `.env.local`. Enable Email auth (password and/or magic link).
2. **Plaid** — create a sandbox app at dashboard.plaid.com, enable Transactions + Liabilities, add keys. Sandbox login is `user_good` / `pass_good`.
3. **Vercel** — import the repo, add the same env vars, deploy. For background refresh add a Vercel Cron hitting `POST /api/plaid/sync` (or point `PLAID_WEBHOOK_URL` at it).
4. **Google Drive / OneDrive** (optional) — register an OAuth client, set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_MS_CLIENT_ID`; adapters are in `src/lib/storage/cloud-file.ts`.

## Scripts

- `npm run dev` / `npm run build` / `npm start`
- `npm test` — vitest (strategy engine, projections, insights)
- `npm run lint`

## Demo tips

- `?date=2026-10-27` on any route pins "today" (handy for screenshots).
- First run offers *Try it with sample data*; real data never ships in the bundle.

## Roadmap / not yet built

- Biller logins (AT&T, Xfinity…) — no public APIs; plan is bill-email parsing (forward to an inbox → parser → bill update) or a scraping provider.
- Push reminders (`reminderDays` is stored; needs a notification worker).
- Drive/OneDrive OAuth buttons in Settings (adapters are written; UI needs the OAuth client IDs).
- CSV transaction import.
