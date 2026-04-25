"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

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

// ── OAuth buttons (Google + Apple) ────────────────────────────────────────────

function OAuthButtons() {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleOAuth(provider: string) {
    setLoading(provider);
    await signIn(provider, { callbackUrl: "/" });
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        <button
          type="button"
          onClick={() => handleOAuth("google")}
          disabled={!!loading}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            width: "100%", padding: "0.7rem 0.875rem",
            borderRadius: "0.875rem", border: "1px solid var(--border)",
            backgroundColor: "var(--bg-elevated)", color: "var(--text-primary)",
            fontSize: 14, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {loading === "google" ? "Connecting…" : "Continue with Google"}
        </button>

        <button
          type="button"
          onClick={() => handleOAuth("apple")}
          disabled={!!loading}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            width: "100%", padding: "0.7rem 0.875rem",
            borderRadius: "0.875rem", border: "1px solid rgba(255,255,255,0.08)",
            backgroundColor: "#000", color: "#fff",
            fontSize: 14, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <svg width="15" height="18" viewBox="0 0 814 1000" aria-hidden="true">
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-42.4-148.3-96.7C82.6 763.6 37 659.6 37 560c0-196.3 127.7-300.6 256.4-300.6 67.3 0 123.4 44.4 165.7 44.4 40.6 0 103.7-47 181.5-47 29.2 0 108.2 2.6 168.1 80.8zm-126.5-89.6c-8.3-35.9-29.2-78.5-66.2-109.8-29.9-25.9-73-48-116.3-48-6.4 0-12.8.6-19.2 1.9 2.6-40.8 24.3-80.5 50.9-105.5 28.3-26.6 75.1-47 116.3-47 3.2 0 6.4.3 9.6.6-3.9 46.8-23.4 86.2-50.3 113.7-24.3 25.3-67.3 44.4-124.9 44.4z" fill="currentColor"/>
          </svg>
          {loading === "apple" ? "Connecting…" : "Continue with Apple"}
        </button>

        <button
          type="button"
          onClick={() => handleOAuth("microsoft-entra-id")}
          disabled={!!loading}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            width: "100%", padding: "0.7rem 0.875rem",
            borderRadius: "0.875rem", border: "1px solid var(--border)",
            backgroundColor: "var(--bg-elevated)", color: "var(--text-primary)",
            fontSize: 14, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          {loading === "microsoft-entra-id" ? "Connecting…" : "Continue with Microsoft"}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
        <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>or</span>
        <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
      </div>
    </>
  );
}

// ── Sign In tab ───────────────────────────────────────────────────────────────

function SignInTab({ onSwitch }: { onSwitch: () => void }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("email", { email, password, redirect: false, callbackUrl: "/" });
    if (result?.error) {
      setError("Incorrect email or password.");
      setLoading(false);
    } else if (result?.url) {
      window.location.href = result.url;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
      <OAuthButtons />
      <form onSubmit={handleEmail} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
        <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" autoComplete="current-password" />
        {error && <ErrorBox msg={error} />}
        <button
          type="submit"
          disabled={loading || !email || !password}
          style={{
            width: "100%", padding: "0.75rem",
            borderRadius: "0.875rem", border: "none",
            backgroundColor: "var(--accent-blue)", color: "#fff",
            fontSize: 14, fontWeight: 600,
            cursor: loading || !email || !password ? "not-allowed" : "pointer",
            opacity: loading || !email || !password ? 0.6 : 1,
          }}
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <div style={{ textAlign: "center" }}>
        <button
          type="button"
          onClick={onSwitch}
          style={{ background: "none", border: "none", fontSize: 12, color: "var(--accent-blue)", cursor: "pointer", padding: 0 }}
        >
          Create an account
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

  function validatePassword(pw: string): string | null {
    if (pw.length < 8)           return "Password must be at least 8 characters.";
    if (!/[A-Z]/.test(pw))       return "Password must contain at least one uppercase letter.";
    if (!/[0-9]/.test(pw))       return "Password must contain at least one number.";
    if (!/[^A-Za-z0-9]/.test(pw)) return "Password must contain at least one special character.";
    return null;
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don't match."); return; }
    const pwErr = validatePassword(password);
    if (pwErr) { setError(pwErr); return; }

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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
      <OAuthButtons />
      <form onSubmit={handleSignUp} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <Input label="Full Name" value={name} onChange={setName} placeholder="Tahsin" autoComplete="name" />
      <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
      <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Min. 8 chars, uppercase, number, symbol" autoComplete="new-password" />
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
    </div>
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

      </div>
    </div>
  );
}
