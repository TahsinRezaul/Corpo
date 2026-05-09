"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { loadAll, saveAll, DEFAULT_MODULES, type ModuleEntry } from "./ModuleLauncher";

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPANDED_W = 220;
const COLLAPSED_W = 52;

// ── Module icons & colors ─────────────────────────────────────────────────────

const ICONS: Record<string, React.ReactNode> = {
  "/receipts": (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 3 21 3"/><path d="M3 9h18M3 15h18M3 21l3-3 3 3 3-3 3 3 3-3 3 3"/>
    </svg>
  ),
  "/invoices": (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
    </svg>
  ),
  "/income": (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
    </svg>
  ),
  "/mileage": (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  "/hst": (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
    </svg>
  ),
  "/money": (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
    </svg>
  ),
  "/loan": (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  "/tax": (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
    </svg>
  ),
  "/accountant": (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    </svg>
  ),
};

const ICON_COLOR: Record<string, string> = {
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

const GROUPS = [
  { label: "Track & Record",   ids: ["/receipts", "/invoices", "/mileage"] },
  { label: "Money & Finances", ids: ["/income", "/money", "/loan"] },
  { label: "Tax & Compliance", ids: ["/hst", "/tax", "/accountant"] },
];

// ── Small reusable pieces ─────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0 }}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function IconBtn({ onClick, title, children, active }: {
  onClick: () => void; title: string; children: React.ReactNode; active?: boolean;
}) {
  return (
    <button onClick={onClick} title={title}
      style={{
        width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: active ? "rgba(59,130,246,0.15)" : "transparent",
        color: active ? "var(--accent-blue)" : "var(--text-secondary)",
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-elevated)"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
    >
      {children}
    </button>
  );
}

// ── NavItem ───────────────────────────────────────────────────────────────────

function NavItem({ href, label, active, icon, iconColor, collapsed, onNavigate }: {
  href: string; label: string; active: boolean;
  icon?: React.ReactNode; iconColor?: string;
  collapsed: boolean; onNavigate?: () => void;
}) {
  return (
    <Link href={href} title={collapsed ? label : undefined}
      onClick={onNavigate}
      style={{
        display: "flex", alignItems: "center",
        gap: collapsed ? 0 : 8,
        justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? "7px 0" : "5px 10px 5px 20px",
        borderRadius: 6, textDecoration: "none",
        backgroundColor: active ? "rgba(59,130,246,0.15)" : "transparent",
        color: active ? "var(--accent-blue)" : "var(--text-secondary)",
        fontSize: 13, fontWeight: active ? 600 : 400,
        transition: "background-color 0.1s, color 0.1s",
        userSelect: "none", position: "relative",
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-elevated)";
          (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
        }
      }}
    >
      <span style={{ color: active ? "var(--accent-blue)" : (iconColor ?? "var(--text-secondary)"), flexShrink: 0, display: "flex" }}>
        {icon}
      </span>
      {!collapsed && (
        <>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{label}</span>
          {active && <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "var(--accent-blue)", flexShrink: 0 }} />}
        </>
      )}
      {collapsed && active && (
        <span style={{
          position: "absolute", left: 3, top: "50%", transform: "translateY(-50%)",
          width: 3, height: 18, borderRadius: 2, backgroundColor: "var(--accent-blue)",
        }} />
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
      <button onClick={onToggle} style={{
        display: "flex", alignItems: "center", gap: 4, width: "100%",
        padding: "5px 10px", background: "none", border: "none", cursor: "pointer",
        color: "var(--text-secondary)", fontSize: 10, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 10,
      }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "var(--text-primary)")}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
      >
        <Chevron open={open} />
        {label}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ── Edit panel ────────────────────────────────────────────────────────────────

function EditPanel({ modules, onMove, onToggleHidden, autoHide, onToggleAutoHide, onDone }: {
  modules: ModuleEntry[];
  onMove: (i: number, dir: -1 | 1) => void;
  onToggleHidden: (id: string) => void;
  autoHide: boolean;
  onToggleAutoHide: () => void;
  onDone: () => void;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "10px 10px 6px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-secondary)" }}>Edit Sidebar</span>
        <button onClick={onDone} style={{
          fontSize: 11, padding: "2px 8px", borderRadius: 5, border: "1px solid var(--border)",
          background: "none", cursor: "pointer", color: "var(--accent-blue)", fontWeight: 600,
        }}>Done</button>
      </div>

      {/* Module list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 6px" }}>
        {modules.map((mod, i) => (
          <div key={mod.id} style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 4px", borderRadius: 6, marginBottom: 2,
            backgroundColor: mod.hidden ? "transparent" : "var(--bg-elevated)",
            opacity: mod.hidden ? 0.45 : 1,
          }}>
            {/* Visibility toggle */}
            <button onClick={() => onToggleHidden(mod.id)} title={mod.hidden ? "Show" : "Hide"}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 4, color: mod.hidden ? "var(--text-secondary)" : "var(--accent-blue)", display: "flex", flexShrink: 0 }}>
              {mod.hidden ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>

            {/* Icon */}
            <span style={{ color: ICON_COLOR[mod.id] ?? "var(--text-secondary)", display: "flex", flexShrink: 0 }}>
              {ICONS[mod.id] ?? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>}
            </span>

            {/* Label */}
            <span style={{ flex: 1, fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {mod.label}
            </span>

            {/* Up/down */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
              <button onClick={() => onMove(i, -1)} disabled={i === 0}
                style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", padding: 1, opacity: i === 0 ? 0.25 : 1, color: "var(--text-secondary)", display: "flex" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
              <button onClick={() => onMove(i, 1)} disabled={i === modules.length - 1}
                style={{ background: "none", border: "none", cursor: i === modules.length - 1 ? "default" : "pointer", padding: 1, opacity: i === modules.length - 1 ? 0.25 : 1, color: "var(--text-secondary)", display: "flex" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Auto-hide toggle */}
      <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 12, color: "var(--text-primary)", margin: 0, fontWeight: 500 }}>Auto-hide</p>
          <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: 0 }}>Collapse after navigating</p>
        </div>
        <button onClick={onToggleAutoHide} style={{
          width: 36, height: 20, borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer",
          backgroundColor: autoHide ? "var(--accent-blue)" : "var(--bg-elevated)",
          position: "relative", transition: "background-color 0.15s", flexShrink: 0,
        }}>
          <span style={{
            position: "absolute", top: 2, borderRadius: "50%", width: 14, height: 14,
            backgroundColor: autoHide ? "#fff" : "var(--text-secondary)",
            left: autoHide ? 19 : 2, transition: "left 0.15s",
          }} />
        </button>
      </div>
    </div>
  );
}

// ── LeftSidebar ───────────────────────────────────────────────────────────────

export default function LeftSidebar() {
  const path = usePathname();
  const [modules, setModules] = useState<ModuleEntry[]>(DEFAULT_MODULES);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "Track & Record": true, "Money & Finances": true, "Tax & Compliance": true,
  });
  const [collapsed, setCollapsed] = useState(false);
  const [autoHide, setAutoHide]   = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [editMode, setEditMode]   = useState(false);

  // In auto-hide mode the sidebar is a hover-reveal overlay;
  // editMode always keeps the sidebar expanded so the user can interact with it.
  const isExpanded = autoHide ? (hoverOpen || editMode) : !collapsed;
  const w = isExpanded ? EXPANDED_W : COLLAPSED_W;

  useEffect(() => {
    const { modules: m } = loadAll();
    setModules(m.length ? m : DEFAULT_MODULES);
    const c = localStorage.getItem("corpo-sidebar-collapsed") === "1";
    const a = localStorage.getItem("corpo-sidebar-autohide")  === "1";
    setCollapsed(c);
    setAutoHide(a);
    document.documentElement.style.setProperty("--sidebar-w", `${c ? COLLAPSED_W : EXPANDED_W}px`);
  }, []);

  // Keep --sidebar-w in sync: auto-hide always reserves only COLLAPSED_W
  useEffect(() => {
    if (autoHide) {
      document.documentElement.style.setProperty("--sidebar-w", `${COLLAPSED_W}px`);
    } else {
      document.documentElement.style.setProperty("--sidebar-w", `${collapsed ? COLLAPSED_W : EXPANDED_W}px`);
    }
  }, [autoHide, collapsed]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    if (next) setEditMode(false);
    localStorage.setItem("corpo-sidebar-collapsed", next ? "1" : "0");
  }

  function handleMouseEnter() {
    if (autoHide) setHoverOpen(true);
  }

  function handleMouseLeave() {
    if (autoHide && !editMode) { setHoverOpen(false); }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleNavigate() { /* navigation handled by Link, no collapse-on-click needed */ }

  function toggleAutoHide() {
    const next = !autoHide;
    setAutoHide(next);
    if (next) setHoverOpen(false);
    localStorage.setItem("corpo-sidebar-autohide", next ? "1" : "0");
  }

  function moveModule(i: number, dir: -1 | 1) {
    const next = [...modules];
    const t = i + dir;
    if (t < 0 || t >= next.length) return;
    [next[i], next[t]] = [next[t], next[i]];
    setModules(next);
    const { folders, grid } = loadAll();
    saveAll(next, folders, grid);
  }

  function toggleHidden(id: string) {
    const next = modules.map(m => m.id === id ? { ...m, hidden: !m.hidden } : m);
    setModules(next);
    const { folders, grid } = loadAll();
    saveAll(next, folders, grid);
  }

  function isActive(href: string) {
    return path === href || path.startsWith(href + "/");
  }

  const modMap = Object.fromEntries(modules.map(m => [m.id, m]));
  const visible = modules.filter(m => !m.hidden);

  return (
    <nav
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "fixed", top: 52, left: 0, bottom: 0, width: w, zIndex: 40,
        backgroundColor: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        transition: "width 0.2s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: autoHide && hoverOpen ? "4px 0 24px rgba(0,0,0,0.35)" : "none",
      }}
    >

      {/* ── Top strip: collapse toggle OR pin button ── */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "flex-end",
        padding: "4px 6px", gap: 2,
        borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        {autoHide && isExpanded && (
          /* Pin button — click to disable auto-hide and keep sidebar open */
          <button onClick={toggleAutoHide} title="Pin sidebar open (disable auto-hide)"
            style={{
              width: 24, height: 24, borderRadius: 5, border: "none", cursor: "pointer",
              backgroundColor: "transparent", color: "var(--text-secondary)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-elevated)"; (e.currentTarget as HTMLElement).style.color = "var(--accent-blue)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
            </svg>
          </button>
        )}
        {!autoHide && (
          /* Manual collapse arrow */
          <button onClick={toggleCollapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              width: 24, height: 24, borderRadius: 5, border: "none", cursor: "pointer",
              backgroundColor: "transparent", color: "var(--text-secondary)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-elevated)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: collapsed ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Edit mode ── */}
      {editMode && isExpanded ? (
        <EditPanel
          modules={modules}
          onMove={moveModule}
          onToggleHidden={toggleHidden}
          autoHide={autoHide}
          onToggleAutoHide={toggleAutoHide}
          onDone={() => setEditMode(false)}
        />
      ) : (
        <>
          {/* ── Nav items ── */}
          <div style={{ flex: 1, padding: isExpanded ? "6px" : "6px 4px", overflowY: "auto", overflowX: "hidden" }}>

            {/* Home */}
            <NavItem href="/" label="Home" active={path === "/"} collapsed={!isExpanded} onNavigate={handleNavigate}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              }
              iconColor="var(--text-secondary)"
            />

            {!isExpanded ? (
              /* Icon-only flat list */
              <div style={{ marginTop: 4 }}>
                {visible.map(mod => (
                  <NavItem key={mod.id} href={mod.href} label={mod.label}
                    active={isActive(mod.href)} collapsed={true} onNavigate={handleNavigate}
                    icon={ICONS[mod.id]} iconColor={ICON_COLOR[mod.id]}
                  />
                ))}
              </div>
            ) : (
              /* Grouped expanded list */
              <>
                {GROUPS.map(group => {
                  const groupMods = group.ids.map(id => modMap[id]).filter((m): m is ModuleEntry => !!m && !m.hidden);
                  if (groupMods.length === 0) return null;
                  return (
                    <Group key={group.label} label={group.label}
                      open={openGroups[group.label] ?? true}
                      onToggle={() => setOpenGroups(o => ({ ...o, [group.label]: !(o[group.label] ?? true) }))}>
                      {groupMods.map(mod => (
                        <NavItem key={mod.id} href={mod.href} label={mod.label}
                          active={isActive(mod.href)} collapsed={false} onNavigate={handleNavigate}
                          icon={ICONS[mod.id]} iconColor={ICON_COLOR[mod.id]}
                        />
                      ))}
                    </Group>
                  );
                })}
                {/* Any modules not in a predefined group */}
                {(() => {
                  const groupedIds = GROUPS.flatMap(g => g.ids);
                  const extras = visible.filter(m => !groupedIds.includes(m.id));
                  if (extras.length === 0) return null;
                  return (
                    <Group label="More" open={openGroups["More"] ?? true}
                      onToggle={() => setOpenGroups(o => ({ ...o, More: !(o["More"] ?? true) }))}>
                      {extras.map(mod => (
                        <NavItem key={mod.id} href={mod.href} label={mod.label}
                          active={isActive(mod.href)} collapsed={false} onNavigate={handleNavigate}
                          icon={ICONS[mod.id]} iconColor={ICON_COLOR[mod.id]}
                        />
                      ))}
                    </Group>
                  );
                })()}
              </>
            )}
          </div>

          {/* ── Bottom: edit button only ── */}
          {isExpanded && (
            <div style={{ borderTop: "1px solid var(--border)", padding: "6px 8px", flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
              <IconBtn onClick={() => setEditMode(true)} title="Edit sidebar" active={editMode}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </IconBtn>
            </div>
          )}
        </>
      )}
    </nav>
  );
}
