import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { plaid, plaidError } from "@/lib/plaid";
import { requireHome } from "../_shared";

export async function POST() {
  const ctx = await requireHome();
  if ("error" in ctx) return ctx.error;
  try {
    const r = await plaid().linkTokenCreate({
      user: { client_user_id: ctx.user.id },
      client_name: "HomeFin",
      products: [Products.Transactions, Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: process.env.PLAID_WEBHOOK_URL,
    });
    return NextResponse.json({ link_token: r.data.link_token });
  } catch (e) {
    const pe = plaidError(e);
    console.error("plaid", pe);
    return NextResponse.json({ error: `Plaid: ${pe.message} (${pe.code})` }, { status: 500 });
  }
}
