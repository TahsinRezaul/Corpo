"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const name  = session?.user?.name  ?? "Account";
  const email = session?.user?.email ?? "";
  const image = session?.user?.image;
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  function handleSignOut() {
    localStorage.clear();
    sessionStorage.clear();
    signOut({ callbackUrl: "/login" });
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Account menu"
        style={{
          width: 34, height: 34, borderRadius: "50%",
          border: open ? "1.5px solid var(--accent-blue)" : "1.5px solid var(--border)",
          backgroundColor: "var(--bg-elevated)",
          cursor: "pointer", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, padding: 0,
        }}
      >
        {image
          ? <img src={image} alt={name} width={34} height={34} style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
          : <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-blue)", letterSpacing: "-0.02em" }}>{initials}</span>
        }
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 220, zIndex: 100,
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "1rem",
          boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}>
          {/* User info */}
          <div style={{ padding: "0.875rem 1rem", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {name}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {email}
            </div>
          </div>

          {/* Menu items */}
          <div style={{ padding: "0.375rem" }}>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              style={{
                display: "flex", alignItems: "center", gap: 9,
                padding: "0.5rem 0.625rem", borderRadius: "0.625rem",
                fontSize: 13, color: "var(--text-primary)", textDecoration: "none",
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--bg-elevated)")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Settings
            </Link>

            <div style={{ height: 1, backgroundColor: "var(--border)", margin: "0.25rem 0" }} />

            <button
              onClick={handleSignOut}
              style={{
                display: "flex", alignItems: "center", gap: 9, width: "100%",
                padding: "0.5rem 0.625rem", borderRadius: "0.625rem",
                fontSize: 13, color: "#f87171", background: "none", border: "none", cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
