"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import CorpoMark from "@/components/CorpoMark";

// ── Shared input ───────────────────────────────────────────────────────────────

function Input({
  label, type = "text", value, onChange, placeholder, autoComplete,
}: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; autoComplete?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={{
        display: "block", fontSize: 11, fontWeight: 600,
        color: "var(--text-secondary)", marginBottom: 6,
        textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "0.72rem 1rem",
          borderRadius: 12, boxSizing: "border-box",
          border: `1.5px solid ${focused ? "rgba(59,72,255,0.5)" : "var(--border)"}`,
          backgroundColor: "var(--bg-elevated)",
          color: "var(--text-primary)", fontSize: 14,
          outline: "none",
          boxShadow: focused ? "0 0 0 3px rgba(59,72,255,0.08)" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
      />
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: "0.6rem 0.9rem", borderRadius: 10,
      backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)",
      fontSize: 13, color: "#f87171",
    }}>
      {msg}
    </div>
  );
}

// ── OAuth buttons ──────────────────────────────────────────────────────────────

const OAUTH = [
  {
    id: "google",
    label: "Continue with Google",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
    bg: "var(--bg-elevated)", color: "var(--text-primary)", border: "var(--border)",
  },
  {
    id: "apple",
    label: "Continue with Apple",
    icon: (
      <svg width="15" height="18" viewBox="0 0 814 1000" aria-hidden="true">
        <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-42.4-148.3-96.7C82.6 763.6 37 659.6 37 560c0-196.3 127.7-300.6 256.4-300.6 67.3 0 123.4 44.4 165.7 44.4 40.6 0 103.7-47 181.5-47 29.2 0 108.2 2.6 168.1 80.8zm-126.5-89.6c-8.3-35.9-29.2-78.5-66.2-109.8-29.9-25.9-73-48-116.3-48-6.4 0-12.8.6-19.2 1.9 2.6-40.8 24.3-80.5 50.9-105.5 28.3-26.6 75.1-47 116.3-47 3.2 0 6.4.3 9.6.6-3.9 46.8-23.4 86.2-50.3 113.7-24.3 25.3-67.3 44.4-124.9 44.4z" fill="currentColor"/>
      </svg>
    ),
    bg: "#000", color: "#fff", border: "rgba(255,255,255,0.1)",
  },
  {
    id: "microsoft-entra-id",
    label: "Continue with Microsoft",
    icon: (
      <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
        <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
        <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
      </svg>
    ),
    bg: "var(--bg-elevated)", color: "var(--text-primary)", border: "var(--border)",
  },
];

function OAuthButtons() {
  const [loading, setLoading] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {OAUTH.map(o => (
        <button
          key={o.id}
          type="button"
          disabled={!!loading}
          onClick={async () => {
            setLoading(o.id);
            await signIn(o.id, { callbackUrl: "/" });
          }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            width: "100%", padding: "0.72rem 1rem",
            borderRadius: 12, border: `1.5px solid ${o.border}`,
            backgroundColor: o.bg, color: o.color,
            fontSize: 14, fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading && loading !== o.id ? 0.45 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {o.icon}
          {loading === o.id ? "Connecting…" : o.label}
        </button>
      ))}
    </div>
  );
}

function Divider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
      <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500, letterSpacing: "0.05em" }}>OR</span>
      <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
    </div>
  );
}

// ── Sign in ────────────────────────────────────────────────────────────────────

function SignIn({ onSwitch }: { onSwitch: () => void }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const result = await signIn("email", { email, password, redirect: false, callbackUrl: "/" });
    if (result?.error) { setError("Incorrect email or password."); setLoading(false); }
    else if (result?.url) window.location.href = result.url;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <OAuthButtons />
      <Divider />
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
        <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" autoComplete="current-password" />
        {error && <ErrorBox msg={error} />}
        <button
          type="submit"
          disabled={loading || !email || !password}
          style={{
            width: "100%", padding: "0.78rem",
            borderRadius: 12, border: "none",
            background: "linear-gradient(135deg, #3B48FF 0%, #2738F4 100%)",
            color: "#fff", fontSize: 14, fontWeight: 600,
            cursor: loading || !email || !password ? "not-allowed" : "pointer",
            opacity: loading || !email || !password ? 0.55 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
      <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
        No account?{" "}
        <button onClick={onSwitch} style={{ background: "none", border: "none", color: "#3B48FF", fontWeight: 600, cursor: "pointer", fontSize: 13, padding: 0 }}>
          Create one
        </button>
      </p>
    </div>
  );
}

// ── Create account ─────────────────────────────────────────────────────────────

function CreateAccount({ onSwitch }: { onSwitch: () => void }) {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [done, setDone]         = useState(false);

  function validatePassword(pw: string) {
    if (pw.length < 8)            return "At least 8 characters required.";
    if (!/[A-Z]/.test(pw))        return "Include at least one uppercase letter.";
    if (!/[0-9]/.test(pw))        return "Include at least one number.";
    if (!/[^A-Za-z0-9]/.test(pw)) return "Include at least one special character.";
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don't match."); return; }
    const pwErr = validatePassword(password);
    if (pwErr) { setError(pwErr); return; }
    setLoading(true);
    const res  = await fetch("/api/auth/signup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Something went wrong."); setLoading(false); return; }
    const result = await signIn("email", { email, password, redirect: false, callbackUrl: "/" });
    if (result?.url) window.location.href = result.url;
    else { setDone(true); setLoading(false); }
  }

  if (done) {
    return (
      <div style={{ textAlign: "center", padding: "2rem 0" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Account created!</p>
        <button onClick={onSwitch} style={{ marginTop: 12, background: "none", border: "none", color: "#3B48FF", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
          Sign in →
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <OAuthButtons />
      <Divider />
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input label="Full Name" value={name} onChange={setName} placeholder="Your name" autoComplete="name" />
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
        <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Min. 8 chars, uppercase, number, symbol" autoComplete="new-password" />
        <Input label="Confirm Password" type="password" value={confirm} onChange={setConfirm} placeholder="••••••••" autoComplete="new-password" />
        {error && <ErrorBox msg={error} />}
        <button
          type="submit"
          disabled={loading || !name || !email || !password || !confirm}
          style={{
            width: "100%", padding: "0.78rem",
            borderRadius: 12, border: "none",
            background: "linear-gradient(135deg, #16C8BC 0%, #00A99D 100%)",
            color: "#fff", fontSize: 14, fontWeight: 600,
            cursor: loading || !name || !email || !password || !confirm ? "not-allowed" : "pointer",
            opacity: loading || !name || !email || !password || !confirm ? 0.55 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {loading ? "Creating account…" : "Create Account"}
        </button>
      </form>
      <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
        Already have an account?{" "}
        <button onClick={onSwitch} style={{ background: "none", border: "none", color: "#3B48FF", fontWeight: 600, cursor: "pointer", fontSize: 13, padding: 0 }}>
          Sign in
        </button>
      </p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: "var(--bg-base)", padding: "1.5rem",
    }}>
      {/* Background glow */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 50% at 50% 20%, rgba(59,72,255,0.06) 0%, transparent 70%)",
      }} />

      <div style={{
        width: "100%", maxWidth: 400, position: "relative",
        backgroundColor: "var(--bg-surface)",
        borderRadius: 24, border: "1px solid var(--border)",
        padding: "2.25rem 2rem",
        boxShadow: "0 32px 80px rgba(0,0,0,0.45)",
      }}>
        {/* Brand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28, gap: 10 }}>
          <CorpoMark size={52} isDark={true} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.18em", textAlign: "center" }}>
              CORPO
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center", marginTop: 2 }}>
              {tab === "signin" ? "Sign in to your account" : "Create your account"}
            </div>
          </div>
        </div>

        {tab === "signin"
          ? <SignIn onSwitch={() => setTab("signup")} />
          : <CreateAccount onSwitch={() => setTab("signin")} />
        }
      </div>
    </div>
  );
}
