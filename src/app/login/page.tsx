"use client";
import { useState } from "react";
import Link from "next/link";
import { Home } from "lucide-react";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";
import { Button, Card, Field, inputCls } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "magic">("signin");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!supabaseConfigured()) {
    return <div className="flex-1 flex items-center justify-center p-6 text-sm text-muted text-center">Supabase isn&apos;t configured, so HomeFin is running in local-only mode. <Link className="text-accent font-semibold ml-1" href="/">Open the app</Link></div>;
  }

  const google = async () => {
    setBusy(true); setMsg(null);
    const next = new URLSearchParams(location.search).get("next") ?? "/";
    const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    if (error) { setMsg(error.message); setBusy(false); }
  };

  const submit = async () => {
    setBusy(true); setMsg(null);
    const sb = createClient();
    const next = new URLSearchParams(location.search).get("next") ?? "/";
    try {
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
        if (error) throw error;
        setMsg("Check your email to confirm, then sign in.");
      } else if (mode === "magic") {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
        if (error) throw error;
        setMsg("Magic link sent — check your email.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.href = next;
      }
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-[12px] bg-ink flex items-center justify-center"><Home size={20} className="text-teal" /></div><div><div className="text-xl font-bold tracking-tight">HomeFin</div><div className="text-sm text-muted">Sign in to your home</div></div></div>
        <Card className="p-5 flex flex-col gap-3">
          <button type="button" onClick={google} disabled={busy} className="h-11 rounded-[12px] border border-line bg-card text-[13px] font-semibold flex items-center justify-center gap-2.5 hover:border-field disabled:opacity-50">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
            Continue with Google
          </button>
          <div className="flex items-center gap-3 text-[11px] text-muted"><div className="flex-1 h-px bg-line" />or with email<div className="flex-1 h-px bg-line" /></div>
          {mode === "signup" && <Field label="Your name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>}
          <Field label="Email"><input className={inputCls} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {mode !== "magic" && <Field label="Password"><input className={inputCls} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
          <Button type="submit" onClick={submit} disabled={busy || !email}>{mode === "signup" ? "Create account" : mode === "magic" ? "Email me a link" : "Sign in"}</Button>
          {msg && <div className="text-xs text-muted">{msg}</div>}
        </Card>
        <div className="flex justify-between text-xs text-muted">
          <button className="text-accent font-semibold" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>{mode === "signup" ? "Have an account? Sign in" : "Create an account"}</button>
          <button className="text-accent font-semibold" onClick={() => setMode(mode === "magic" ? "signin" : "magic")}>{mode === "magic" ? "Use a password" : "Use a magic link"}</button>
        </div>
      </div>
    </div>
  );
}
