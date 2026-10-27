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
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}${next}` } });
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
