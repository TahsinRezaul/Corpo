"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { loadModules, DEFAULT_MODULES, type ModuleEntry } from "./ModuleLauncher";
import UserMenu from "./UserMenu";
import { useTheme, ThemeToggle } from "./NavBar";

// ── Icons ─────────────────────────────────────────────────────────────────────

const ICONS: Record<string, React.ReactNode> = {
  "/receipts": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 3 21 3"/><path d="M3 9h18M3 15h18M3 21l3-3 3 3 3-3 3 3 3-3 3 3"/>
    </svg>
  ),
  "/invoices": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
    </svg>
  ),
  "/income": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
    </svg>
  ),
  "/mileage": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  "/hst": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
    </svg>
  ),
  "/money": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
    </svg>
  ),
  "/loan": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  "/tax": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v4H4z"/><path d="M4 12h4v8H4z"/><path d="M12 12h8v2h-8z"/><path d="M12 18h8v2h-8z"/>
    </svg>
  ),
  "/accountant": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    </svg>
  ),
};

const MODULE_ICON_COLOR: Record<string, string> = {
  "/receipts":   "#60a5fa",
  "/invoices":   "#34d399",
  "/income":     "#a78bfa",
  "/mileage":    "#fbbf24",
  "/hst":        "#f87171",
  "/money":      "#4ade80",
  "/loan":       "#fb923c",
  "/tax":        "#c084fc",
  "/accountant": "#38bdf8",
};

// ── Groups ────────────────────────────────────────────────────────────────────

const GROUPS = [
  { label: "Track & Record",    ids: ["/receipts", "/invoices", "/mileage"] },
  { label: "Money & Finances",  ids: ["/income", "/money", "/loan"] },
  { label: "Tax & Compliance",  ids: ["/hst", "/tax", "/accountant"] },
];

// ── Chevron ───────────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0 }}
    >
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

// ── NavItem ───────────────────────────────────────────────────────────────────

function NavItem({ href, label, active, icon, iconColor }: {
  href: string; label: string; active: boolean;
  icon?: React.ReactNode; iconColor?: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 10px 5px 22px",
        borderRadius: 6, textDecoration: "none",
        backgroundColor: active ? "rgba(59,130,246,0.15)" : "transparent",
        color: active ? "var(--accent-blue)" : "var(--text-secondary)",
        fontSize: 13, fontWeight: active ? 600 : 400,
        transition: "background-color 0.1s, color 0.1s",
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-elevated)";
          (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
        }
      }}
    >
      <span style={{ color: active ? "var(--accent-blue)" : (iconColor ?? "var(--text-secondary)"), flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {active && (
        <span style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", backgroundColor: "var(--accent-blue)", flexShrink: 0 }} />
      )}
    </Link>
  );
}

// ── Group ─────────────────────────────────────────────────────────────────────

function Group({ label, open, onToggle, children }: {
  label: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 4, width: "100%",
          padding: "4px 10px", background: "none", border: "none", cursor: "pointer",
          color: "var(--text-secondary)", fontSize: 11, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.07em",
          marginTop: 8,
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-primary)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
      >
        <Chevron open={open} />
        {label}
      </button>
      {open && <div style={{ paddingBottom: 2 }}>{children}</div>}
    </div>
  );
}

// ── LeftSidebar ───────────────────────────────────────────────────────────────

const SIDEBAR_W = 220;

export default function LeftSidebar() {
  const path = usePathname();
  const { theme, toggle: toggleTheme } = useTheme();
  const [modules, setModules] = useState<ModuleEntry[]>(DEFAULT_MODULES);
  const [open, setOpen] = useState<Record<string, boolean>>({
    "Track & Record": true,
    "Money & Finances": true,
    "Tax & Compliance": true,
  });

  useEffect(() => {
    const saved = loadModules();
    if (saved.length > 0) setModules(saved);
    document.documentElement.style.setProperty("--nav-h", "0px");
    document.documentElement.style.setProperty("--sidebar-w", `${SIDEBAR_W}px`);
  }, []);

  function isActive(href: string) {
    return path === href || path.startsWith(href + "/");
  }

  const modMap = Object.fromEntries(modules.map((m) => [m.id, m]));

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, bottom: 0, width: SIDEBAR_W, zIndex: 40,
      backgroundColor: "var(--bg-surface)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      overflowY: "auto", overflowX: "hidden",
    }}>

      {/* ── Logo ── */}
      <Link href="/" style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "14px 12px 10px",
        textDecoration: "none", flexShrink: 0,
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          backgroundColor: "var(--accent-blue)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em",
        }}>
          C
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-primary)" }}>
          CORPO
        </span>
      </Link>

      {/* ── Home ── */}
      <div style={{ padding: "6px 6px 0" }}>
        <NavItem
          href="/"
          label="Home"
          active={path === "/"}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          }
          iconColor="var(--text-secondary)"
        />
      </div>

      {/* ── Module groups ── */}
      <div style={{ flex: 1, padding: "0 6px", overflowY: "auto" }}>
        {GROUPS.map((group) => {
          const groupMods = group.ids
            .map((id) => modMap[id])
            .filter((m): m is ModuleEntry => !!m && !m.hidden);
          if (groupMods.length === 0) return null;
          return (
            <Group
              key={group.label}
              label={group.label}
              open={open[group.label] ?? true}
              onToggle={() => setOpen((o) => ({ ...o, [group.label]: !(o[group.label] ?? true) }))}
            >
              {groupMods.map((mod) => (
                <NavItem
                  key={mod.id}
                  href={mod.href}
                  label={mod.label}
                  active={isActive(mod.href)}
                  icon={ICONS[mod.id]}
                  iconColor={MODULE_ICON_COLOR[mod.id]}
                />
              ))}
            </Group>
          );
        })}

        {/* Any custom/extra modules not in a group */}
        {modules.filter((m) => !m.hidden && !GROUPS.flatMap((g) => g.ids).includes(m.id)).length > 0 && (
          <Group
            label="More"
            open={open["More"] ?? true}
            onToggle={() => setOpen((o) => ({ ...o, More: !(o["More"] ?? true) }))}
          >
            {modules
              .filter((m) => !m.hidden && !GROUPS.flatMap((g) => g.ids).includes(m.id))
              .map((mod) => (
                <NavItem
                  key={mod.id}
                  href={mod.href}
                  label={mod.label}
                  active={isActive(mod.href)}
                  icon={ICONS[mod.id]}
                  iconColor={MODULE_ICON_COLOR[mod.id]}
                />
              ))}
          </Group>
        )}
      </div>

      {/* ── Bottom controls ── */}
      <div style={{
        borderTop: "1px solid var(--border)",
        padding: "8px 6px",
        display: "flex", flexDirection: "column", gap: 2, flexShrink: 0,
      }}>
        <NavItem
          href="/settings"
          label="Settings"
          active={path.startsWith("/settings")}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          }
          iconColor="var(--text-secondary)"
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 10px 2px" }}>
          <ThemeToggle theme={theme} toggle={toggleTheme} />
          <UserMenu />
        </div>
      </div>
    </nav>
  );
}
