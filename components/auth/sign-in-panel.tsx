"use client";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

type Method = "email" | "phone";
export function SignInPanel() {
  const [method, setMethod] = useState<Method>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Use an account created by your school administrator.");
  const submit = async (event: FormEvent) => { event.preventDefault(); setMessage("Signing in…"); try { const client = getSupabaseBrowserClient(); const result = await client.auth.signInWithPassword(method === "email" ? { email: identifier, password } : { phone: identifier, password }); setMessage(result.error ? result.error.message : "Signed in. You may now open your smartboard."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to sign in."); } };
  return <form className="sign-in" onSubmit={submit}><div className="tabs"><button type="button" className={method === "email" ? "active" : ""} onClick={() => setMethod("email")}>Email</button><button type="button" className={method === "phone" ? "active" : ""} onClick={() => setMethod("phone")}>Phone</button></div><label>{method === "email" ? "Email address" : "Phone number"}<input required type={method === "email" ? "email" : "tel"} value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={method === "email" ? "teacher@school.edu" : "+91…"} /></label><label>Password<input required type="password" value={password} onChange={e => setPassword(e.target.value)} /></label><button className="primary" type="submit">Sign in</button><p aria-live="polite">{message}</p><small>There is no public sign-up. Ask your school administrator for access.</small></form>;
}
