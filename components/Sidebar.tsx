"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loadModules, DEFAULT_MODULES, type ModuleEntry } from "./ModuleLauncher";
import UserMenu from "./UserMenu";
import { useTheme, ThemeToggle } from "./NavBar";
import { useBackgroundTasks } from "@/contexts/BackgroundTasksContext";
import { useRouter } from "next/navigation";

// ── Background tasks pill ─────────────────────────────────────────────────────
function TasksPill() {
  const router = useRouter();
  const { notifs, setNotifs } = useBackgroundTasks();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (notifs.length === 0) return null;
  const running = notifs.filter((n) => n.status === "parsing").length;

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          height: 28, padding: "0 10px", borderRadius: 20,
          border: "1px solid var(--border)",
          backgroundColor: running > 0 ? "rgba(59,130,246,0.1)" : "rgba(74,222,128,0.08)",
          color: running > 0 ? "var(--accent-blue)" : "#4ade80",
          cursor: "pointer", fontSize: 12, fontWeight: 500,
        }}
      >
        {running > 0 ? (
          <div style={{ width: 8, height: 8, borderRadius: "50%", border: "1.5px solid", borderColor: "var(--accent-blue) transparent transparent transparent" }} />
        ) : (
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
            <polyline points="2,7 5.5,10.5 12,3.5" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {notifs.length}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          width: 260, zIndex: 200,
          backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
          borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>Tasks</span>
            {notifs.some((n) => n.status === "done") && (
              <button onClick={() => setNotifs((p) => p.filter((n) => n.status !== "done"))} style={{ fontSize: 11, color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer" }}>Clear done</button>
            )}
          </div>
          <div style={{ padding: "4px 0" }}>
            {notifs.map((n) => (
              <button key={n.id}
                onClick={() => { if (n.status === "done") { setOpen(false); setNotifs((p) => p.filter((x) => x.id !== n.id)); router.push("/receipts/review"); } }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px", background: "none", border: "none", cursor: n.status === "done" ? "pointer" : "default", textAlign: "left" }}
                onMouseEnter={(e) => { if (n.status === "done") (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-elevated)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <span style={{ flexShrink: 0, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {n.status === "parsing" && <div style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid", borderColor: "rgba(99,179,237,0.9) transparent transparent transparent" }} />}
                  {n.status === "done" && <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><polyline points="2,7 5.5,10.5 12,3.5" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  {n.status === "error" && <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><line x1="2" y1="2" x2="12" y2="12" stroke="#f87171" strokeWidth="2" strokeLinecap="round" /><line x1="12" y1="2" x2="2" y2="12" stroke="#f87171" strokeWidth="2" strokeLinecap="round" /></svg>}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: n.status === "done" ? "#4ade80" : n.status === "error" ? "#f87171" : "var(--text-primary)" }}>{n.label}</p>
                  {n.status === "done" && <p style={{ fontSize: 11, margin: 0, color: "var(--text-secondary)" }}>Tap to review</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab ───────────────────────────────────────────────────────────────────────
function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        display: "flex", alignItems: "center",
        height: "100%", padding: "0 14px",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        borderBottom: active ? "2px solid var(--accent-blue)" : "2px solid transparent",
        whiteSpace: "nowrap", flexShrink: 0,
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
    >
      {label}
    </Link>
  );
}

// ── Sidebar (tab bar) ─────────────────────────────────────────────────────────
export default function Sidebar() {
  const path = usePathname();
  const { theme, toggle: toggleTheme } = useTheme();
  // Start with DEFAULT_MODULES so tabs are visible immediately on first paint
  const [modules, setModules] = useState<ModuleEntry[]>(DEFAULT_MODULES);

  useEffect(() => {
    // Overwrite with any user customisations from localStorage
    const saved = loadModules();
    if (saved.length > 0) setModules(saved);
    document.documentElement.style.setProperty("--nav-h", "52px");
    document.documentElement.style.setProperty("--sidebar-w", "0px");
  }, []);

  const visibleModules = modules.filter((m) => !m.hidden);

  return (
    <nav
      style={{
        position: "fixed", top: 0, left: 0, right: 0, height: 52, zIndex: 40,
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center",
      }}
    >
      {/* Logo */}
      <Link href="/" style={{
        textDecoration: "none", flexShrink: 0,
        padding: "0 16px", height: "100%",
        display: "flex", alignItems: "center",
      }}>
        <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.03em", color: "var(--accent-blue)" }}>
          CORPO
        </span>
      </Link>

      <div style={{ width: 1, height: 24, backgroundColor: "var(--border)", flexShrink: 0 }} />

      {/* Tabs — horizontally scrollable */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center",
        overflowX: "auto", overflowY: "hidden",
        height: "100%",
        scrollbarWidth: "none",
      }}>
        <Tab href="/" label="Home" active={path === "/"} />
        {visibleModules.map((mod) => (
          <Tab
            key={mod.id}
            href={mod.href}
            label={mod.label}
            active={path === mod.href || path.startsWith(mod.href + "/")}
          />
        ))}
      </div>

      {/* Right controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", flexShrink: 0 }}>
        <TasksPill />
        {/* Settings — always pinned */}
        <Link href="/settings" style={{ textDecoration: "none" }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            backgroundColor: path.startsWith("/settings") ? "rgba(59,130,246,0.12)" : "var(--bg-elevated)",
            border: `1px solid ${path.startsWith("/settings") ? "rgba(59,130,246,0.35)" : "var(--border)"}`,
            color: path.startsWith("/settings") ? "var(--accent-blue)" : "var(--text-secondary)",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
        </Link>
        <ThemeToggle theme={theme} toggle={toggleTheme} />
        <UserMenu />
      </div>
    </nav>
  );
}
