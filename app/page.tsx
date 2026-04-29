"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme, ThemeToggle, NAV_TABS } from "@/components/NavBar";
import UserMenu from "@/components/UserMenu";
import ModuleLauncher, {
  loadAll, saveAll,
  type ModuleEntry, type GridEntry, type Folder,
  TileIcon, TileEditSheet, IconPicker,
} from "@/components/ModuleLauncher";
import { getSaved, getIncome, getMileage } from "@/lib/storage";
import CorpoMark from "@/components/CorpoMark";

// ── Quick stats ────────────────────────────────────────────────────────────────

type Stats = { receipts: number; expenses: number; income: number; mileage: number };

function parseMoney(s: string | number | undefined): number {
  return parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

function readStats(): Stats {
  const saved = getSaved();
  const incomeEntries = getIncome();
  const trips = getMileage();
  return {
    receipts: saved.length,
    expenses: saved.reduce((s, r) => s + parseMoney(r.total), 0),
    income: incomeEntries.reduce((s, e) => s + parseMoney(e.amount), 0),
    mileage: trips.reduce((s, t) => s + (t.km || 0), 0),
  };
}

function fmt(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
}

function buildContext(stats: Stats | null): string {
  if (!stats) return "";
  return `${stats.receipts} receipts, ${fmt(stats.expenses)} expenses logged, ${fmt(stats.income)} income, ${stats.mileage.toFixed(0)} km driven`;
}

// ── Search overlay ─────────────────────────────────────────────────────────────

const SEARCH_ITEMS = [
  ...NAV_TABS,
  { label: "Import / Migrate Data", href: "/migrate" },
  { label: "Accountant Reports", href: "/accountant" },
];

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: globalThis.KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = SEARCH_ITEMS.filter(i => i.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ paddingTop: "80px", backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}
      >
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-secondary)", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search pages…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--text-primary)" }}
          />
          <kbd className="text-xs px-1.5 py-0.5 rounded" style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", fontFamily: "inherit" }}>ESC</kbd>
        </div>
        <div className="flex flex-col py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm" style={{ color: "var(--text-secondary)" }}>No results.</p>
          ) : (
            filtered.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                style={{ color: "var(--text-primary)" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--bg-elevated)")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <span style={{ color: "var(--text-secondary)" }}>→</span>
                {item.label}
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Assistant chat ─────────────────────────────────────────────────────────────

type Msg = { role: "user" | "agent"; text: string };

const SUGGESTIONS = [
  { label: "New invoice", prompt: "Make a new invoice for this month" },
  { label: "Scan receipt", prompt: "I want to scan a receipt" },
  { label: "Log mileage", prompt: "Log a mileage trip" },
  { label: "View expenses", prompt: "Show me my expenses" },
  { label: "Tax estimate", prompt: "Open the tax planner" },
  { label: "Export for accountant", prompt: "Generate accountant report" },
];

function AssistantChat({ isDark, stats }: { isDark: boolean; stats: Stats | null }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setQuery("");
    setMessages(m => [...m, { role: "user", text: q }]);
    setLoading(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, context: buildContext(stats) }),
      });
      const data = await res.json();
      const reply = data.message ?? "Done.";
      setMessages(m => [...m, { role: "agent", text: reply }]);
      if (data.action === "navigate" && data.path) {
        setTimeout(() => router.push(data.path), 600);
      }
    } catch {
      setMessages(m => [...m, { role: "agent", text: "Something went wrong — try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(query); }
  }

  // Auto-resize textarea
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setQuery(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  }

  const hasMessages = messages.length > 0;

  const borderColor   = isDark ? "rgba(255,255,255,0.1)"  : "#e5e7eb";
  const inputBg       = isDark ? "rgba(255,255,255,0.05)" : "#ffffff";
  const userBg        = isDark ? "rgba(59,130,246,0.2)"   : "rgba(37,99,235,0.08)";
  const userColor     = isDark ? "#93c5fd"                 : "#1d4ed8";
  const agentColor    = isDark ? "rgba(255,255,255,0.75)" : "#374151";
  const phColor       = isDark ? "rgba(255,255,255,0.3)"  : "#9ca3af";
  const dotColor      = isDark ? "rgba(255,255,255,0.4)"  : "#9ca3af";

  return (
    <div className="w-full flex flex-col" style={{ gap: hasMessages ? 12 : 20 }}>

      {/* Chat history */}
      {hasMessages && (
        <div
          ref={chatRef}
          className="flex flex-col gap-3 overflow-y-auto px-1"
          style={{ maxHeight: 320, scrollbarWidth: "none" }}
        >
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="text-sm px-4 py-2.5 rounded-2xl max-w-sm"
                style={{
                  backgroundColor: m.role === "user" ? userBg : "transparent",
                  color: m.role === "user" ? userColor : agentColor,
                  border: m.role === "user" ? `1px solid rgba(59,130,246,0.2)` : "none",
                  lineHeight: 1.5,
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start pl-1">
              <div className="flex items-center gap-1 px-4 py-3 rounded-2xl" style={{ backgroundColor: inputBg, border: `1px solid ${borderColor}` }}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    style={{
                      width: 5, height: 5, borderRadius: "50%",
                      backgroundColor: dotColor, display: "inline-block",
                      animation: `bounce 1s ${i * 0.15}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input box */}
      <div
        className="w-full rounded-2xl overflow-hidden"
        style={{
          backgroundColor: inputBg,
          border: `1px solid ${borderColor}`,
          boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.3)" : "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        <textarea
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onKeyDown={onKey}
          placeholder="Tell me what to do — e.g. make an invoice for June, scan a receipt, log a trip…"
          rows={2}
          className="w-full bg-transparent outline-none resize-none px-5 pt-4 pb-2 text-sm leading-relaxed"
          style={{ color: "var(--text-primary)", minHeight: 60 }}
        />
        <style>{`textarea::placeholder { color: ${phColor}; }`}</style>
        <div className="flex items-center justify-between px-4 pb-3 pt-1">
          <span className="text-xs" style={{ color: phColor }}>Enter to send · Shift+Enter for new line</span>
          <button
            onClick={() => send(query)}
            disabled={!query.trim() || loading}
            className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-xl transition-all"
            style={{
              backgroundColor: query.trim() && !loading
                ? (isDark ? "rgba(59,130,246,0.25)" : "rgba(37,99,235,0.1)")
                : "transparent",
              color: isDark ? "#60a5fa" : "#2563eb",
              opacity: query.trim() && !loading ? 1 : 0.3,
              border: `1px solid ${query.trim() && !loading ? (isDark ? "rgba(59,130,246,0.3)" : "rgba(37,99,235,0.2)") : "transparent"}`,
            }}
          >
            Send
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map(s => (
          <button
            key={s.label}
            onClick={() => send(s.prompt)}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-full transition-all"
            style={{
              backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              border: `1px solid ${borderColor}`,
              color: "var(--text-secondary)",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = isDark ? "rgba(59,130,246,0.4)" : "rgba(37,99,235,0.3)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = borderColor)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Stats strip ────────────────────────────────────────────────────────────────

function StatsStrip({ isDark, stats }: { isDark: boolean; stats: Stats | null }) {
  if (!stats) return null;

  const items = [
    { label: "Receipts",  value: String(stats.receipts),             unit: "filed" },
    { label: "Expenses",  value: fmt(stats.expenses),                unit: "" },
    { label: "Income",    value: fmt(stats.income),                   unit: "" },
    { label: "Mileage",   value: stats.mileage.toFixed(0) + " km",   unit: "" },
  ];

  const border = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  return (
    <div
      className="grid grid-cols-4 rounded-2xl overflow-hidden w-full"
      style={{ border: `1px solid ${border}`, backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)" }}
    >
      {items.map((item, idx) => (
        <div
          key={item.label}
          className="flex flex-col items-center py-4 px-2"
          style={{ borderRight: idx < items.length - 1 ? `1px solid ${border}` : "none" }}
        >
          <span className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{item.label}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Module tiles ───────────────────────────────────────────────────────────────

function HomeTiles({
  isDark, editMode, onEdit, onDoneEdit, onAllModules,
}: {
  isDark: boolean;
  editMode: boolean;
  onEdit: () => void;
  onDoneEdit: () => void;
  onAllModules: () => void;
}) {
  const router = useRouter();
  const [modules, setModules]   = useState<ModuleEntry[]>([]);
  const [grid,    setGrid]      = useState<GridEntry[]>([]);
  const [folders, setFolders]   = useState<Folder[]>([]);
  const [loaded,  setLoaded]    = useState(false);
  const [editingTileId,   setEditingTileId]   = useState<string | null>(null);
  const [iconPickerForId, setIconPickerForId] = useState<string | null>(null);
  const dragFromIdx = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  useEffect(() => {
    const data = loadAll();
    setModules(data.modules);
    setGrid(data.grid);
    setFolders(data.folders);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!editMode) { setEditingTileId(null); setIconPickerForId(null); }
  }, [editMode]);

  if (!loaded) return null;

  function persist(m: ModuleEntry[], f: Folder[], g: GridEntry[]) {
    setModules(m); setFolders(f); setGrid(g);
    saveAll(m, f, g);
  }

  const visibleEntries = grid
    .map((entry, gIdx) => ({ entry, gIdx }))
    .filter(({ entry }) => {
      if (entry.type !== "module") return false;
      const mod = modules.find(m => m.id === entry.id);
      return mod && !mod.hidden;
    });

  const hiddenModules = modules.filter(m => m.hidden);
  const editingMod    = editingTileId   ? modules.find(m => m.id === editingTileId)   ?? null : null;
  const iconPickerMod = iconPickerForId ? modules.find(m => m.id === iconPickerForId) ?? null : null;

  function hideGridEntry(gIdx: number) {
    const entry = grid[gIdx];
    if (!entry || entry.type !== "module") return;
    const newMods = modules.map(m => m.id === entry.id ? { ...m, hidden: true } : m);
    persist(newMods, folders, grid.filter((_, i) => i !== gIdx));
  }

  function restoreModule(modId: string) {
    const newMods = modules.map(m => m.id === modId ? { ...m, hidden: false } : m);
    persist(newMods, folders, [...grid, { type: "module", id: modId }]);
  }

  function deleteModulePermanently(modId: string) {
    persist(modules.filter(m => m.id !== modId), folders, grid);
  }

  function addCustomModule() {
    const id = `custom-${Date.now()}`;
    const newMod: ModuleEntry = { id, href: `/custom/${id}`, label: "New", emoji: "📦", hidden: false, custom: true };
    persist([...modules, newMod], folders, [...grid, { type: "module", id }]);
    setEditingTileId(id);
  }

  function renameModule(id: string, label: string) {
    persist(modules.map(m => m.id === id ? { ...m, label } : m), folders, grid);
  }

  function setModuleEmoji(id: string, emoji: string | null) {
    persist(modules.map(m => m.id === id ? { ...m, emoji } : m), folders, grid);
  }

  function reorderByVisibleIdx(fromVisIdx: number, toVisIdx: number) {
    if (fromVisIdx === toVisIdx) return;
    const fromGIdx = visibleEntries[fromVisIdx]?.gIdx;
    const toGIdx   = visibleEntries[toVisIdx]?.gIdx;
    if (fromGIdx === undefined || toGIdx === undefined) return;
    const next = [...grid];
    next.splice(toGIdx, 0, next.splice(fromGIdx, 1)[0]);
    persist(modules, folders, next);
  }

  return (
    <>
      <div className="w-full flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {editMode ? "Edit Modules" : "Modules"}
            </span>
            {!editMode && (
              <button onClick={onAllModules} className="text-xs" style={{ color: "var(--text-secondary)", opacity: 0.5 }}>All →</button>
            )}
          </div>
          <button
            onClick={editMode ? onDoneEdit : onEdit}
            className="text-xs px-2.5 py-1 rounded-lg"
            style={{
              color:           editMode ? "var(--accent-blue)"          : "var(--text-secondary)",
              border:          `1px solid ${editMode ? "rgba(59,130,246,0.3)" : "var(--border)"}`,
              backgroundColor: editMode ? "rgba(59,130,246,0.1)"        : "var(--bg-elevated)",
            }}
          >
            {editMode ? "Done" : "Edit"}
          </button>
        </div>

        {editMode && (
          <p className="text-xs text-center" style={{ color: "var(--text-secondary)", opacity: 0.6 }}>
            Drag to reorder · tap tile to rename / change icon · × to hide
          </p>
        )}

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
          onDragOver={e => e.preventDefault()}
        >
          {visibleEntries.map(({ entry, gIdx }, visIdx) => {
            const mod = modules.find(m => m.id === entry.id);
            if (!mod) return null;
            const isDragging = draggingIdx === visIdx;

            return (
              <div
                key={entry.id}
                className="relative"
                style={{
                  animation: editMode ? `jiggle 0.18s ${(visIdx * 73) % 350}ms ease-in-out infinite ${visIdx % 2 === 0 ? "alternate" : "alternate-reverse"}` : "none",
                  opacity: isDragging ? 0.35 : 1,
                  transition: "opacity 0.12s",
                }}
                draggable={editMode}
                onDragStart={editMode ? () => { dragFromIdx.current = visIdx; setDraggingIdx(visIdx); } : undefined}
                onDragEnter={editMode ? e => e.preventDefault() : undefined}
                onDragOver={editMode  ? e => e.preventDefault() : undefined}
                onDrop={editMode ? () => {
                  reorderByVisibleIdx(dragFromIdx.current!, visIdx);
                  dragFromIdx.current = null;
                  setDraggingIdx(null);
                } : undefined}
                onDragEnd={editMode ? () => { dragFromIdx.current = null; setDraggingIdx(null); } : undefined}
              >
                {editMode && (
                  <button
                    onClick={e => { e.stopPropagation(); hideGridEntry(gIdx); }}
                    className="absolute flex items-center justify-center rounded-full"
                    style={{ top: -8, left: -8, zIndex: 20, width: 22, height: 22, backgroundColor: "#3a3a3c", border: "2px solid var(--bg-base)", color: "white", cursor: "pointer" }}
                  >
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <line x1="2" y1="2" x2="8" y2="8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                      <line x1="8" y1="2" x2="2" y2="8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => { if (editMode) { setEditingTileId(mod.id); return; } router.push(mod.href); }}
                  className="flex flex-col items-center justify-center gap-3 rounded-2xl pressable w-full"
                  style={{
                    height: 90,
                    backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    cursor: editMode ? "default" : "pointer",
                  }}
                >
                  <TileIcon mod={mod} size={24} />
                  <span className="text-xs font-medium leading-tight text-center px-2" style={{ color: "inherit" }}>
                    {mod.label}
                  </span>
                </button>
              </div>
            );
          })}

          {editMode && (
            <button
              onClick={addCustomModule}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl pressable"
              style={{ height: 90, border: "1.5px dashed var(--border)", color: "var(--text-secondary)", backgroundColor: "transparent" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span className="text-xs font-medium">New</span>
            </button>
          )}
        </div>

        {editMode && hiddenModules.length > 0 && (
          <div className="mt-3">
            <p className="text-xs mb-3 px-1" style={{ color: "var(--text-secondary)" }}>
              Hidden — tap + to restore{hiddenModules.some(m => m.custom) ? " · 🗑 to delete permanently" : ""}
            </p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              {hiddenModules.map(mod => (
                <div key={mod.id} className="relative" style={{ opacity: 0.5 }}>
                  <button
                    onClick={() => restoreModule(mod.id)}
                    className="absolute flex items-center justify-center rounded-full"
                    style={{ top: -8, left: -8, zIndex: 20, width: 22, height: 22, backgroundColor: "var(--accent-green)", border: "2px solid var(--bg-base)", color: "white", cursor: "pointer" }}
                  >
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                      <line x1="5" y1="2" x2="5" y2="8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                      <line x1="2" y1="5" x2="8" y2="5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  </button>
                  {mod.custom && (
                    <button
                      onClick={() => { if (confirm(`Delete "${mod.label}"?`)) deleteModulePermanently(mod.id); }}
                      className="absolute flex items-center justify-center rounded-full"
                      style={{ top: -8, right: -8, zIndex: 20, width: 22, height: 22, backgroundColor: "#dc2626", border: "2px solid var(--bg-base)", color: "white", cursor: "pointer" }}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  )}
                  <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl w-full" style={{ height: 90, backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                    <TileIcon mod={mod} size={24} />
                    <span className="text-xs font-medium text-center px-2" style={{ lineHeight: 1.3 }}>{mod.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {editingMod && !iconPickerForId && (
        <TileEditSheet
          mod={editingMod}
          onClose={() => setEditingTileId(null)}
          onRename={label => { renameModule(editingMod.id, label); setEditingTileId(null); }}
          onOpenIconPicker={() => { setIconPickerForId(editingMod.id); setEditingTileId(null); }}
        />
      )}
      {iconPickerForId && iconPickerMod && (
        <IconPicker
          current={iconPickerMod.emoji}
          onSelect={val => { setModuleEmoji(iconPickerForId, val); setIconPickerForId(null); }}
          onClose={() => setIconPickerForId(null)}
        />
      )}
    </>
  );
}

// ── Home page ──────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [editMode,     setEditMode]     = useState(false);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const router = useRouter();

  useEffect(() => {
    setStats(readStats());
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
    if (isMobile) router.replace("/receipts/camera");
  }, [router]);

  const dividerColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

  return (
    <div
      className="flex flex-col"
      style={{ marginTop: "-52px", minHeight: "100vh", backgroundColor: "var(--bg-base)" }}
    >
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
      <ModuleLauncher open={launcherOpen} onClose={() => setLauncherOpen(false)} />

      {/* Top bar */}
      <header
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2.5">
          <CorpoMark size={24} isDark={isDark} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", color: "var(--text-primary)" }}>
            CORPO
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center justify-center rounded-xl"
            style={{ width: 34, height: 34, backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <Link
            href="/settings"
            className="flex items-center justify-center rounded-xl"
            style={{ width: 34, height: 34, backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </Link>
          <ThemeToggle theme={theme} toggle={toggle} />
          <UserMenu />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center px-5 py-8 gap-8 w-full max-w-2xl mx-auto">

        {/* Greeting */}
        <div className="w-full">
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            What do you need?
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Ask me anything — I&apos;ll take you there or do it for you.
          </p>
        </div>

        {/* Assistant — hero element */}
        <div className="w-full">
          <AssistantChat isDark={isDark} stats={stats} />
        </div>

        {/* Divider */}
        <div className="w-full" style={{ height: 1, backgroundColor: dividerColor }} />

        {/* Stats */}
        <StatsStrip isDark={isDark} stats={stats} />

        {/* Module tiles */}
        <HomeTiles
          isDark={isDark}
          editMode={editMode}
          onEdit={() => setEditMode(true)}
          onDoneEdit={() => setEditMode(false)}
          onAllModules={() => setLauncherOpen(true)}
        />
      </main>
    </div>
  );
}
