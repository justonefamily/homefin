import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Email an invite link. Uses Resend when RESEND_API_KEY is set; otherwise reports that no email went out so the
 * app shows the link to share by hand.
 */
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { email, link, homeName } = (await req.json()) as { email: string; link: string; homeName: string };
  if (!email || !link) return NextResponse.json({ error: "Missing email or link" }, { status: 400 });
  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ sent: false, reason: "Email isn't set up yet (no RESEND_API_KEY)." });
  const from = process.env.INVITE_FROM ?? "HomeFin <invites@justonehome.app>";
  const who = user.user_metadata?.name ?? user.email ?? "Someone";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from, to: [email], subject: `${who} invited you to “${homeName}” on HomeFin`,
      html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#141821">
        <h2 style="margin:0 0 8px">You're invited to “${homeName}”</h2>
        <p style="color:#5b6270;line-height:1.5">${who} added you to their home on HomeFin — bills, budget, the plan and the calendar, shared.</p>
        <p style="margin:24px 0"><a href="${link}" style="background:#0e6b74;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:600;display:inline-block">Join the home</a></p>
        <p style="color:#7a8294;font-size:12px;line-height:1.5">Sign in with Google or your email using <b>${email}</b> — the invite is tied to that address, so you'll land in the home automatically. The link works once.</p>
      </div>`,
      text: `${who} invited you to "${homeName}" on HomeFin. Join here (sign in with ${email}): ${link}`,
    }),
  });
  if (!r.ok) return NextResponse.json({ sent: false, reason: `Email failed: ${(await r.text()).slice(0, 200)}` });
  return NextResponse.json({ sent: true });
}
