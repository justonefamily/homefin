import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { plaid, plaidError } from "@/lib/plaid";
import { requireHome } from "../_shared";

export const PLAID_MAX_HISTORY_DAYS = 730;

export async function POST(req: Request) {
  const ctx = await requireHome();
  if ("error" in ctx) return ctx.error;
  let days = PLAID_MAX_HISTORY_DAYS;
  try { const b = await req.json(); if (Number.isFinite(b?.days)) days = Math.max(30, Math.min(PLAID_MAX_HISTORY_DAYS, Math.round(b.days))); } catch { /* no body */ }
  try {
    const r = await plaid().linkTokenCreate({
      user: { client_user_id: ctx.user.id },
      client_name: "HomeFin",
      // Transactions is required; Liabilities (card APRs, loan terms) only where the bank has one — asking for it as a
      // required product makes Plaid refuse banks where you only hold checking/savings ("No liability accounts").
      products: [Products.Transactions],
      optional_products: [Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: "en",
      transactions: { days_requested: days },
      webhook: process.env.PLAID_WEBHOOK_URL,
      // OAuth banks (Bank of America, Chase, Capital One, Wells Fargo…) send the user to the bank's site and back here.
      // The same URI must be on the allow-list in the Plaid dashboard (Developers → API → Allowed redirect URIs).
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
    });
    return NextResponse.json({ link_token: r.data.link_token });
  } catch (e) {
    const pe = plaidError(e);
    console.error("plaid", pe);
    return NextResponse.json({ error: `Plaid: ${pe.message} (${pe.code})` }, { status: 500 });
  }
}
