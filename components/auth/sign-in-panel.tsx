"use client";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

type Method = "email" | "phone";
type AuthMode = "signIn" | "signUp";

export function SignInPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [method, setMethod] = useState<Method>("email");
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(mode === "signUp" ? "Creating account…" : "Signing in…");
    try {
      const client = getSupabaseBrowserClient();

      if (mode === "signUp") {
        const result = await client.auth.signUp(
          method === "email"
            ? { email: identifier, password, options: { data: { full_name: fullName } } }
            : { phone: identifier, password, options: { data: { full_name: fullName } } }
        );
        if (result.error) {
          setMessage(result.error.message);
          return;
        }
        if (result.data.session) {
          const next = searchParams.get("next") ?? "/dashboard";
          router.push(next);
          router.refresh();
        } else {
          setMessage("Account created! Check your email inbox to confirm your account, then sign in.");
        }
      } else {
        const result = await client.auth.signInWithPassword(
          method === "email" ? { email: identifier, password } : { phone: identifier, password }
        );
        if (result.error) {
          setMessage(result.error.message);
          return;
        }
        const next = searchParams.get("next") ?? "/dashboard";
        router.push(next);
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication request failed.");
    }
  };

  return (
    <form className="sign-in" onSubmit={submit}>
      <div className="tabs" style={{ display: "flex", gap: "0.5rem", marginBottom: "0.25rem" }}>
        <button
          type="button"
          className={mode === "signIn" ? "active" : ""}
          onClick={() => { setMode("signIn"); setMessage(""); }}
          style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", fontWeight: "bold" }}
        >
          Sign In
        </button>
        <button
          type="button"
          className={mode === "signUp" ? "active" : ""}
          onClick={() => { setMode("signUp"); setMessage(""); }}
          style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", fontWeight: "bold" }}
        >
          Sign Up
        </button>
      </div>

      <div className="tabs">
        <button type="button" className={method === "email" ? "active" : ""} onClick={() => setMethod("email")}>
          Email
        </button>
        <button type="button" className={method === "phone" ? "active" : ""} onClick={() => setMethod("phone")}>
          Phone
        </button>
      </div>

      {mode === "signUp" && (
        <label>
          Full name / Teacher name
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="e.g. Sarah Jenkins"
          />
        </label>
      )}

      <label>
        {method === "email" ? "Email address" : "Phone number"}
        <input
          required
          type={method === "email" ? "email" : "tel"}
          value={identifier}
          onChange={e => setIdentifier(e.target.value)}
          placeholder={method === "email" ? "teacher@school.edu" : "+91…"}
        />
      </label>

      <label>
        Password
        <input
          required
          type="password"
          minLength={6}
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </label>

      <button className="primary" type="submit">
        {mode === "signUp" ? "Create Account" : "Sign in"}
      </button>

      {message && <p aria-live="polite">{message}</p>}

      <div style={{ marginTop: "0.5rem", textAlign: "center", fontSize: "0.85rem" }}>
        {mode === "signIn" ? (
          <span>
            Need an account?{" "}
            <button
              type="button"
              style={{ background: "none", border: "none", color: "#2563eb", textDecoration: "underline", cursor: "pointer", font: "inherit", padding: 0 }}
              onClick={() => { setMode("signUp"); setMessage(""); }}
            >
              Sign up here
            </button>
          </span>
        ) : (
          <span>
            Already have an account?{" "}
            <button
              type="button"
              style={{ background: "none", border: "none", color: "#2563eb", textDecoration: "underline", cursor: "pointer", font: "inherit", padding: 0 }}
              onClick={() => { setMode("signIn"); setMessage(""); }}
            >
              Sign in here
            </button>
          </span>
        )}
      </div>
    </form>
  );
}
