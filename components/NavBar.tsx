"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ModuleLauncher, { loadModules, type ModuleEntry } from "./ModuleLauncher";
import UserMenu from "./UserMenu";
import { useBackgroundTasks } from "@/contexts/BackgroundTasksContext";

// ── Theme hook ─────────────────────────────────────────────────────────────────

export function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("corpo-theme") as "dark" | "light" | null;
    const resolved = stored === "light" ? "light" : "dark";
    setTheme(resolved);
    if (resolved === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("corpo-theme", next);
    fetch("/api/userdata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "corpo-theme", value: next }) }).catch(() => {});
    if (next === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  }

  return { theme, toggle };
}

// ── Theme toggle button ────────────────────────────────────────────────────────

export function ThemeToggle({ theme, toggle }: { theme: "dark" | "light"; toggle: () => void }) {
  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center rounded-xl"
      style={{ width: 34, height: 34, backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", flexShrink: 0 }}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

// ── Tasks tray (background activity indicator) ────────────────────────────────

function TasksTray() {
  const router = useRouter();
  const { notifs, setNotifs } = useBackgroundTasks();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const running = notifs.filter((n) => n.status === "parsing").length;
  const done    = notifs.filter((n) => n.status === "done").length;

  if (notifs.length === 0) return null;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center rounded-xl relative"
        style={{
          width: 34, height: 34,
          backgroundColor: open ? "rgba(59,130,246,0.12)" : "var(--bg-elevated)",
          border: `1px solid ${open ? "rgba(59,130,246,0.35)" : "var(--border)"}`,
          color: running > 0 ? "var(--accent-blue)" : done > 0 ? "#4ade80" : "var(--text-secondary)",
        }}
        aria-label="Background tasks"
      >
        {/* Activity icon */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        {/* Count badge */}
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-white font-bold"
          style={{
            width: 14, height: 14, fontSize: 8,
            backgroundColor: running > 0 ? "var(--accent-blue)" : "#4ade80",
          }}
        >
          {notifs.length}
        </span>
        {/* Pulsing ring when running */}
        {running > 0 && (
          <span
            className="absolute inset-0 rounded-xl animate-ping"
            style={{ backgroundColor: "rgba(59,130,246,0.15)" }}
          />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 rounded-2xl shadow-xl overflow-hidden"
          style={{
            top: "100%", width: 260, zIndex: 100,
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              Background Tasks
            </span>
            {done > 0 && (
              <button
                onClick={() => setNotifs((prev) => prev.filter((n) => n.status !== "done"))}
                className="text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                Clear done
              </button>
            )}
          </div>
          <div className="py-1.5">
            {notifs.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (n.status === "done") {
                    setOpen(false);
                    setNotifs((prev) => prev.filter((x) => x.id !== n.id));
                    router.push("/receipts/review");
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                style={{
                  cursor: n.status === "done" ? "pointer" : "default",
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => { if (n.status === "done") (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-elevated)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <span className="flex-shrink-0 flex items-center justify-center" style={{ width: 22, height: 22 }}>
                  {n.status === "parsing" && (
                    <div className="w-4 h-4 rounded-full border-2 animate-spin"
                      style={{ borderColor: "rgba(99,179,237,0.9) transparent transparent transparent" }} />
                  )}
                  {n.status === "done" && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <polyline points="2,7 5.5,10.5 12,3.5" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {n.status === "error" && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <line x1="2" y1="2" x2="12" y2="12" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
                      <line x1="12" y1="2" x2="2" y2="12" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{
                    color: n.status === "done" ? "#4ade80" : n.status === "error" ? "#f87171" : "var(--text-primary)",
                  }}>
                    {n.label}
                  </p>
                  {n.status === "done" && (
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Tap to review</p>
                  )}
                  {n.status === "error" && (
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Couldn't read receipt</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── NAV_TABS (backward-compat export — home page uses this) ────────────────────

export const NAV_TABS = [
  { label: "Receipts",             href: "/receipts" },
  { label: "Invoices",             href: "/invoices" },
  { label: "Income & P&L",         href: "/income" },
  { label: "Mileage Log",          href: "/mileage" },
  { label: "HST Report",           href: "/hst" },
  { label: "Money Mgmt",           href: "/money" },
  { label: "Shareholder Loan",     href: "/loan" },
  { label: "Tax Planner",          href: "/tax" },
  { label: "Accountant Reports",   href: "/accountant" },
  { label: "Settings",             href: "/settings" },
];

// ── Settings icon ──────────────────────────────────────────────────────────────

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

// ── Waffle / grid icon ─────────────────────────────────────────────────────────

function WaffleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="1" width="4" height="4" rx="1"/>
      <rect x="6" y="1" width="4" height="4" rx="1"/>
      <rect x="11" y="1" width="4" height="4" rx="1"/>
      <rect x="1" y="6" width="4" height="4" rx="1"/>
      <rect x="6" y="6" width="4" height="4" rx="1"/>
      <rect x="11" y="6" width="4" height="4" rx="1"/>
      <rect x="1" y="11" width="4" height="4" rx="1"/>
      <rect x="6" y="11" width="4" height="4" rx="1"/>
      <rect x="11" y="11" width="4" height="4" rx="1"/>
    </svg>
  );
}

// ── NavBar ─────────────────────────────────────────────────────────────────────

export default function NavBar() {
  const path = usePathname();
  const { theme, toggle } = useTheme();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [modules, setModules] = useState<ModuleEntry[]>([]);

  // Refresh module list whenever launcher closes (user may have renamed/reordered)
  useEffect(() => {
    setModules(loadModules());
  }, [launcherOpen]);

  if (path === "/") return null;

  const currentMod = modules.find(m => path.startsWith(m.href)) ?? NAV_TABS.find(t => path.startsWith(t.href));
  const isSettings = path.startsWith("/settings");

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-40"
        style={{ height: 52, backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="h-full px-4 flex items-center gap-3">

          {/* Waffle button */}
          <button
            onClick={() => setLauncherOpen(true)}
            className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{ width: 34, height: 34, backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            aria-label="Open module launcher"
          >
            <WaffleIcon />
          </button>

          {/* Logo */}
          <Link
            href="/"
            className="text-sm font-black tracking-tight flex-shrink-0"
            style={{ color: "var(--accent-blue)", letterSpacing: "-0.03em" }}
          >
            CORPO
          </Link>

          {/* Current module name */}
          <div className="flex-1 flex items-center">
            {currentMod && (
              <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                {currentMod.label}
              </span>
            )}
          </div>

          {/* Home button (always top-right) */}
          <Link
            href="/"
            className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{ width: 34, height: 34, backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            aria-label="Home"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </Link>

          {/* Settings (pinned, always visible) */}
          <Link
            href="/settings"
            className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{
              width: 34, height: 34,
              backgroundColor: isSettings ? "rgba(59,130,246,0.12)" : "var(--bg-elevated)",
              border: `1px solid ${isSettings ? "rgba(59,130,246,0.35)" : "var(--border)"}`,
              color: isSettings ? "var(--accent-blue)" : "var(--text-secondary)",
            }}
            aria-label="Settings"
          >
            <SettingsIcon />
          </Link>

          {/* Background tasks tray */}
          <TasksTray />

          {/* Theme toggle */}
          <ThemeToggle theme={theme} toggle={toggle} />

          {/* User avatar + dropdown */}
          <UserMenu />
        </div>
      </nav>

      <ModuleLauncher open={launcherOpen} onClose={() => setLauncherOpen(false)} />
    </>
  );
}
