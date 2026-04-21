"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import Link from "next/link";

// ── Shared components ─────────────────────────────────────────────────────────

function Input({
  label, type = "text", value, onChange, placeholder, autoComplete,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          width: "100%", padding: "0.7rem 0.875rem",
          borderRadius: "0.875rem", border: "1px solid var(--border)",
          backgroundColor: "var(--bg-elevated)",
          color: "var(--text-primary)", fontSize: 14,
          outline: "none", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: "0.6rem 0.875rem", borderRadius: "0.75rem",
      backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
      fontSize: 12, color: "#f87171",
    }}>
      {msg}
    </div>
  );
}

// ── Sign In tab ───────────────────────────────────────────────────────────────

function SignInTab({ onSwitch }: { onSwitch: () => void }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState<string | null>(null);
  const [error,    setError]    = useState("");

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading("email");
    const result = await signIn("email", { email, password, redirect: false, callbackUrl: "/" });
    if (result?.error) {
      setError("Incorrect email or password.");
      setLoading(null);
    } else if (result?.url) {
      window.location.href = result.url;
    }
  }

  async function handleGuest() {
    setLoading("guest");
    await signIn("guest", { callbackUrl: "/" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
      {/* Email + password */}
      <form onSubmit={handleEmail} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
        <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" autoComplete="current-password" />
        {error && <ErrorBox msg={error} />}
        <button
          type="submit"
          disabled={loading === "email" || !email || !password}
          style={{
            width: "100%", padding: "0.75rem",
            borderRadius: "0.875rem", border: "none",
            backgroundColor: "var(--accent-blue)", color: "#fff",
            fontSize: 14, fontWeight: 600,
            cursor: loading === "email" || !email || !password ? "not-allowed" : "pointer",
            opacity: loading === "email" || !email || !password ? 0.6 : 1,
          }}
        >
          {loading === "email" ? "Signing in…" : "Sign In"}
        </button>
      </form>

      {/* No account */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          type="button"
          onClick={onSwitch}
          style={{ background: "none", border: "none", fontSize: 12, color: "var(--accent-blue)", cursor: "pointer", padding: 0 }}
        >
          Create an account
        </button>
        <button
          type="button"
          onClick={handleGuest}
          disabled={loading === "guest"}
          style={{ background: "none", border: "none", fontSize: 12, color: "var(--text-secondary)", cursor: "pointer", padding: 0, opacity: 0.55 }}
        >
          {loading === "guest" ? "Loading…" : "Continue as guest"}
        </button>
      </div>
    </div>
  );
}

// ── Create Account tab ────────────────────────────────────────────────────────

function CreateAccountTab({ onSwitch }: { onSwitch: () => void }) {
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [done,     setDone]     = useState(false);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters."); return; }

    setLoading(true);
    const res  = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    // Account created — auto sign in
    const result = await signIn("email", { email, password, redirect: false, callbackUrl: "/" });
    if (result?.url) {
      window.location.href = result.url;
    } else {
      setDone(true);
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div style={{ textAlign: "center", padding: "1rem 0" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Account created!</p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
          <button onClick={onSwitch} style={{ background: "none", border: "none", color: "var(--accent-blue)", cursor: "pointer", fontSize: 13 }}>
            Sign in now →
          </button>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSignUp} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <Input label="Full Name" value={name} onChange={setName} placeholder="Tahsin" autoComplete="name" />
      <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
      <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Min. 6 characters" autoComplete="new-password" />
      <Input label="Confirm Password" type="password" value={confirm} onChange={setConfirm} placeholder="••••••••" autoComplete="new-password" />

      {error && <ErrorBox msg={error} />}

      <button
        type="submit"
        disabled={loading || !name || !email || !password || !confirm}
        style={{
          width: "100%", padding: "0.75rem",
          borderRadius: "0.875rem", border: "none",
          backgroundColor: "#10b981", color: "#fff",
          fontSize: 14, fontWeight: 600,
          cursor: loading || !name || !email || !password || !confirm ? "not-allowed" : "pointer",
          opacity: loading || !name || !email || !password || !confirm ? 0.6 : 1,
          marginTop: 4,
        }}
      >
        {loading ? "Creating account…" : "Create Account"}
      </button>

      <button
        type="button"
        onClick={onSwitch}
        style={{ background: "none", border: "none", fontSize: 12, color: "var(--text-secondary)", cursor: "pointer", opacity: 0.6 }}
      >
        Already have an account? Sign in
      </button>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      backgroundColor: "var(--bg-base)", padding: "1.5rem",
    }}>
      {/* Subtle glow */}
      <div style={{
        position: "fixed", top: "15%", left: "50%", transform: "translateX(-50%)",
        width: 500, height: 300, pointerEvents: "none",
        background: "radial-gradient(ellipse, rgba(59,130,246,0.07) 0%, transparent 70%)",
      }} />

      <div style={{
        width: "100%", maxWidth: 400,
        backgroundColor: "var(--bg-surface)",
        borderRadius: "1.75rem", border: "1px solid var(--border)",
        padding: "2rem", boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
        position: "relative",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 48, height: 48, borderRadius: 13,
            backgroundColor: "rgba(59,130,246,0.12)", border: "1.5px solid rgba(59,130,246,0.25)",
            marginBottom: "0.625rem",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.04em" }}>CORPO</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>Canadian business finances, simplified.</div>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", borderRadius: "0.875rem", overflow: "hidden",
          border: "1px solid var(--border)", marginBottom: "1.5rem",
        }}>
          {(["signin", "signup"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "0.5rem",
                fontSize: 13, fontWeight: 600,
                border: "none", cursor: "pointer",
                backgroundColor: tab === t ? "var(--accent-blue)" : "transparent",
                color: tab === t ? "#fff" : "var(--text-secondary)",
                transition: "all 0.15s",
              }}
            >
              {t === "signin" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "signin"
          ? <SignInTab onSwitch={() => setTab("signup")} />
          : <CreateAccountTab onSwitch={() => setTab("signin")} />
        }

        {/* Admin link */}
        <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
          <Link href="/admin/login" style={{ fontSize: 11, color: "var(--text-secondary)", opacity: 0.3, textDecoration: "none" }}>
            Admin access
          </Link>
        </div>
      </div>
    </div>
  );
}
