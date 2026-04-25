"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ModuleEntry = {
  id: string;
  href: string;
  label: string;
  emoji: string | null;
  hidden: boolean;
  custom: boolean;
};

export type Folder = {
  id: string;
  label: string;
  moduleIds: string[];
};

export type GridEntry = {
  type: "module" | "folder";
  id: string;
};

// ═══════════════════════════════════════════════════════════════
// BUILT-IN SVG ICONS
// ═══════════════════════════════════════════════════════════════

type IP = { size?: number };

function IReceipt({ size = 26 }: IP) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2h16v20l-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1V2z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>;
}
function IInvoice({ size = 26 }: IP) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>;
}
function IIncome({ size = 26 }: IP) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>;
}
function IMileage({ size = 26 }: IP) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>;
}
function IHst({ size = 26 }: IP) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>;
}
function IMoney({ size = 26 }: IP) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>;
}
function ILoan({ size = 26 }: IP) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function ITax({ size = 26 }: IP) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>;
}

const BUILT_IN_ICONS: Record<string, (p: IP) => React.ReactElement> = {
  "/receipts": IReceipt, "/invoices": IInvoice, "/income": IIncome,
  "/mileage": IMileage, "/hst": IHst, "/money": IMoney, "/loan": ILoan, "/tax": ITax,
};

// ═══════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_MODULES: ModuleEntry[] = [
  { id: "/receipts", href: "/receipts", label: "Receipts",          emoji: null, hidden: false, custom: false },
  { id: "/invoices", href: "/invoices", label: "Invoices",          emoji: null, hidden: false, custom: false },
  { id: "/income",   href: "/income",   label: "Income & P&L",      emoji: null, hidden: false, custom: false },
  { id: "/mileage",  href: "/mileage",  label: "Mileage Log",       emoji: null, hidden: false, custom: false },
  { id: "/hst",      href: "/hst",      label: "HST Report",        emoji: null, hidden: false, custom: false },
  { id: "/money",    href: "/money",    label: "Money Mgmt",        emoji: null, hidden: false, custom: false },
  { id: "/loan",     href: "/loan",     label: "Shareholder Loan",  emoji: null, hidden: false, custom: false },
  { id: "/tax",      href: "/tax",      label: "Tax Planner",       emoji: null, hidden: false, custom: false },
];

// ═══════════════════════════════════════════════════════════════
// CATEGORY SECTIONS  (used by the browse / non-edit view)
// ═══════════════════════════════════════════════════════════════

type CatItem = {
  id: string;          // built-in module id (e.g. "/receipts") OR a unique key for custom/soon items
  label: string;
  href?: string;       // navigation target; falls back to id if id starts with "/"
  emoji?: string;
  badge?: "download" | "soon";
};
type CatSection = {
  id: string;
  label: string;
  desc?: string;
  accent?: boolean;    // green tint for accountant section
  items: CatItem[];
};

const ALL_SECTIONS: CatSection[] = [
  {
    id: "daily",
    label: "Track & Record",
    desc: "Daily bookkeeping",
    items: [
      { id: "/receipts", label: "Receipts" },
      { id: "/invoices", label: "Invoices" },
      { id: "/mileage",  label: "Mileage Log" },
    ],
  },
  {
    id: "finance",
    label: "Money & Finances",
    desc: "Cash flow & reporting",
    items: [
      { id: "/income", label: "Income & P&L" },
      { id: "/money",  label: "Money Mgmt" },
      { id: "/loan",   label: "Shareholder Loan" },
    ],
  },
  {
    id: "tax",
    label: "Tax & Compliance",
    desc: "HST filings & tax planning",
    items: [
      { id: "/hst", label: "HST / GST Report" },
      { id: "/tax", label: "Tax Planner" },
    ],
  },
  {
    id: "accountant",
    label: "Tax Forms & Accountant View",
    desc: "Downloadable reports — send to your accountant to save them time",
    accent: true,
    items: [
      { id: "acct-summary",  href: "/accountant",             label: "Tax Year Summary",       emoji: "📊", badge: "download" },
      { id: "acct-expenses", href: "/accountant?tab=expenses", label: "Categorized Expenses",   emoji: "🧾", badge: "download" },
      { id: "acct-package",  href: "/accountant?tab=package",  label: "Full Accountant Package",emoji: "📦", badge: "download" },
      { id: "t2-prep",       label: "T2 Corp Tax Prep Sheet",  emoji: "📋", badge: "soon" },
      { id: "t4-slips",      label: "T4 Slips",                emoji: "📄", badge: "soon" },
      { id: "cra-checklist", label: "CRA Filing Checklist",    emoji: "✅", badge: "soon" },
    ],
  },
  {
    id: "tools",
    label: "Tools & Settings",
    items: [
      { id: "/migrate",  label: "Import / Migrate", emoji: "📥" },
      { id: "/settings", label: "Settings",         emoji: "⚙️" },
    ],
  },
  {
    id: "coming-soon",
    label: "Coming Soon",
    desc: "Future patch updates — in development",
    items: [
      { id: "payroll",      label: "Payroll Management",         emoji: "💼", badge: "soon" },
      { id: "corp-banking", label: "Corporate Banking",          emoji: "🏦", badge: "soon" },
      { id: "annual-ret",   label: "Annual Returns (NUANS)",     emoji: "📅", badge: "soon" },
      { id: "t2-efile",     label: "T2 E-Filing",                emoji: "📤", badge: "soon" },
      { id: "cra-mybiz",    label: "CRA My Business Account",    emoji: "🏛️", badge: "soon" },
      { id: "directors-res",label: "Director's Resolution",      emoji: "📃", badge: "soon" },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════

const MODULES_KEY = "corpo-modules";
const FOLDERS_KEY = "corpo-folders";
const GRID_KEY    = "corpo-grid";

function loadModulesBase(): ModuleEntry[] {
  try {
    const raw = localStorage.getItem(MODULES_KEY);
    if (!raw) return DEFAULT_MODULES;
    const stored: ModuleEntry[] = JSON.parse(raw);
    if (!Array.isArray(stored)) return DEFAULT_MODULES;
    const storedIds = new Set(stored.map(m => m.id));
    return [...stored, ...DEFAULT_MODULES.filter(d => !storedIds.has(d.id))];
  } catch { return DEFAULT_MODULES; }
}

function loadFolders(): Folder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (!raw) return [];
    const stored: Folder[] = JSON.parse(raw);
    return Array.isArray(stored) ? stored : [];
  } catch { return []; }
}

function buildGrid(modules: ModuleEntry[], folders: Folder[]): GridEntry[] {
  const modulesInFolders = new Set(folders.flatMap(f => f.moduleIds));
  const validFolderIds   = new Set(folders.map(f => f.id));
  const visibleModIds    = new Set(modules.filter(m => !m.hidden).map(m => m.id));

  let grid: GridEntry[] = [];
  try {
    const stored: GridEntry[] = JSON.parse(localStorage.getItem(GRID_KEY) ?? "null") ?? [];
    if (Array.isArray(stored)) {
      grid = stored.filter(g => {
        if (g.type === "module") return visibleModIds.has(g.id) && !modulesInFolders.has(g.id);
        if (g.type === "folder") return validFolderIds.has(g.id);
        return false;
      });
    }
  } catch {}

  // Add any new visible top-level modules not yet in grid
  const gridModIds = new Set(grid.filter(g => g.type === "module").map(g => g.id));
  modules
    .filter(m => !m.hidden && !modulesInFolders.has(m.id) && !gridModIds.has(m.id))
    .forEach(m => grid.push({ type: "module", id: m.id }));

  return grid;
}

export function loadAll(): { modules: ModuleEntry[]; folders: Folder[]; grid: GridEntry[] } {
  const modules = loadModulesBase();
  const folders = loadFolders();
  const grid    = buildGrid(modules, folders);
  return { modules, folders, grid };
}

function syncKey(key: string, value: unknown): void {
  fetch("/api/userdata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  }).catch(() => {});
}

export function saveAll(modules: ModuleEntry[], folders: Folder[], grid: GridEntry[]): void {
  localStorage.setItem(MODULES_KEY, JSON.stringify(modules));
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  localStorage.setItem(GRID_KEY,    JSON.stringify(grid));
  syncKey(MODULES_KEY, modules);
  syncKey(FOLDERS_KEY, folders);
  syncKey(GRID_KEY, grid);
}

// Backward-compat export
export const loadModules = loadModulesBase;

// ═══════════════════════════════════════════════════════════════
// CLIP ART
// ═══════════════════════════════════════════════════════════════

export const CLIP_ART = [
  { category: "Finance",     emojis: ["💰","💳","💵","💸","🏦","🪙","💎","💹","📈","📉","🧾","🏧","💶","💷","🤑","💱"] },
  { category: "Documents",   emojis: ["📄","📃","📋","📊","📁","📂","🗂️","📝","✍️","🗃️","📑","📌","📎","🖇️","📓","🖊️"] },
  { category: "Business",    emojis: ["💼","🏢","🤝","📞","📧","🖥️","⚙️","🔧","🔑","🏆","🎯","📣","🛒","🔨","🛠️","📡"] },
  { category: "Transport",   emojis: ["🚗","✈️","🛣️","⛽","🗺️","📍","🚕","🚙","🏁","🛞","🚌","🚂","⚓","🛥️","🏍️","🚁"] },
  { category: "Legal / Tax", emojis: ["⚖️","🏛️","📜","🔏","🔖","✅","❌","🔐","🛡️","📋","🔍","🔒","🏷️","📮"] },
  { category: "People",      emojis: ["👤","👥","🧑‍💼","👩‍💼","👨‍💼","🧑‍💻","🤵","🧑‍🔧","👷","🧑‍⚖️","🫂","👨‍👩‍👧","🧑‍🏫","🦸"] },
  { category: "Time",        emojis: ["📅","🗓️","⏰","⌚","🔔","⏱️","⌛","🕐","🌅","🌙","🌞","⏳"] },
  { category: "General",     emojis: ["🌟","⭐","💡","🎁","🔢","🏅","🌐","🧩","🎨","🧲","🔮","🎪","🏗️","🌱","🚀","🎵"] },
];

// ═══════════════════════════════════════════════════════════════
// TILE ICON
// ═══════════════════════════════════════════════════════════════

export function TileIcon({ mod, size = 28 }: { mod: ModuleEntry; size?: number }) {
  if (mod.emoji) {
    if (mod.emoji.startsWith("data:"))
      return <img src={mod.emoji} alt={mod.label} style={{ width: size, height: size, objectFit: "cover", borderRadius: 6 }} />;
    return <span style={{ fontSize: size * 0.88, lineHeight: 1 }}>{mod.emoji}</span>;
  }
  const Icon = BUILT_IN_ICONS[mod.id];
  if (Icon) return <Icon size={size} />;
  return <span style={{ fontSize: size * 0.88, lineHeight: 1 }}>📦</span>;
}

// ═══════════════════════════════════════════════════════════════
// FOLDER THUMBNAIL
// ═══════════════════════════════════════════════════════════════

function FolderThumbnail({ folder, modules, size = 48 }: { folder: Folder; modules: ModuleEntry[]; size?: number }) {
  const mods = folder.moduleIds.slice(0, 4).map(id => modules.find(m => m.id === id)).filter(Boolean) as ModuleEntry[];
  const cell = (size - 12) / 2;
  return (
    <div
      className="grid grid-cols-2 rounded-xl overflow-hidden"
      style={{ width: size, height: size, backgroundColor: "rgba(120,130,160,0.18)", padding: 4, gap: 2 }}
    >
      {Array.from({ length: 4 }).map((_, i) => {
        const m = mods[i];
        return (
          <div key={i} className="flex items-center justify-center rounded-sm" style={{ backgroundColor: "rgba(255,255,255,0.07)", width: cell, height: cell }}>
            {m && <TileIcon mod={m} size={Math.round(cell * 0.7)} />}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ICON PICKER
// ═══════════════════════════════════════════════════════════════

export function IconPicker({ current, onSelect, onClose }: { current: string | null; onSelect: (v: string | null) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"clip" | "upload">("clip");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { onSelect(ev.target?.result as string); onClose(); };
    reader.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl flex flex-col overflow-hidden" style={{ width: 380, maxHeight: "80vh", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 40px 100px rgba(0,0,0,0.6)" }}>
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Choose Icon</span>
          <button onClick={onClose} className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          {(["clip", "upload"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className="flex-1 py-2.5 text-xs font-medium" style={{ color: tab === t ? "var(--accent-blue)" : "var(--text-secondary)", borderBottom: tab === t ? "2px solid var(--accent-blue)" : "2px solid transparent" }}>
              {t === "clip" ? "Clip Art" : "Upload Image"}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {tab === "clip" ? (
            <div className="p-4 flex flex-col gap-5">
              <button onClick={() => { onSelect(null); onClose(); }} className="self-start text-xs px-3 py-1.5 rounded-lg" style={{ color: "var(--text-secondary)", border: "1px solid var(--border)", backgroundColor: "var(--bg-elevated)" }}>
                ↩ Reset to default icon
              </button>
              {CLIP_ART.map(cat => (
                <div key={cat.category}>
                  <p className="text-xs mb-2 font-medium" style={{ color: "var(--text-secondary)" }}>{cat.category}</p>
                  <div className="flex flex-wrap gap-1">
                    {cat.emojis.map(emoji => (
                      <button key={emoji} onClick={() => { onSelect(emoji); onClose(); }} className="flex items-center justify-center rounded-lg" style={{ width: 40, height: 40, fontSize: 22, backgroundColor: current === emoji ? "rgba(59,130,246,0.15)" : "transparent", border: current === emoji ? "1.5px solid var(--accent-blue)" : "1.5px solid transparent" }}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 flex flex-col items-center gap-4">
              <button onClick={() => fileRef.current?.click()} className="flex flex-col items-center justify-center gap-3 rounded-2xl w-full pressable" style={{ height: 150, border: "2px dashed var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)" }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span className="text-sm font-medium">Click to upload</span>
                <span className="text-xs" style={{ opacity: 0.55 }}>PNG, JPG, SVG, WebP</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile}/>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TILE EDIT BOTTOM SHEET (rename + icon)
// ═══════════════════════════════════════════════════════════════

export function TileEditSheet({
  mod, onClose, onRename, onOpenIconPicker,
}: { mod: ModuleEntry; onClose: () => void; onRename: (label: string) => void; onOpenIconPicker: () => void; }) {
  const [label, setLabel] = useState(mod.label);
  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={e => { if (e.target === e.currentTarget) { onRename(label); onClose(); } }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 -20px 60px rgba(0,0,0,0.4)" }}>
        {/* Module icon preview */}
        <div className="flex flex-col items-center pt-6 pb-4 gap-3">
          <div className="flex items-center justify-center rounded-2xl" style={{ width: 64, height: 64, backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--accent-blue)", fontSize: 32 }}>
            <TileIcon mod={mod} size={36} />
          </div>
          <input
            autoFocus
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { onRename(label); onClose(); } }}
            className="text-center text-base font-semibold bg-transparent outline-none"
            style={{ color: "var(--text-primary)", borderBottom: "1.5px solid var(--accent-blue)", paddingBottom: 4, width: "80%" }}
          />
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button onClick={() => { onOpenIconPicker(); }} className="flex-1 py-2.5 rounded-xl text-sm font-medium pressable" style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            Change Icon
          </button>
          <button onClick={() => { onRename(label); onClose(); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold pressable" style={{ backgroundColor: "var(--accent-blue)", color: "white" }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FOLDER VIEW  (shown when a folder tile is tapped)
// ═══════════════════════════════════════════════════════════════

function FolderView({
  folder, modules, editMode,
  onBack, onRenameFolder, onRemoveModule, onNavigate,
}: {
  folder: Folder; modules: ModuleEntry[]; editMode: boolean;
  onBack: () => void; onRenameFolder: (label: string) => void;
  onRemoveModule: (moduleId: string) => void; onNavigate: (href: string) => void;
}) {
  const [folderLabel, setFolderLabel] = useState(folder.label);
  const [renamingFolder, setRenamingFolder] = useState(false);
  const folderMods = folder.moduleIds.map(id => modules.find(m => m.id === id)).filter(Boolean) as ModuleEntry[];

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm" style={{ color: "var(--accent-blue)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          All Modules
        </button>
        {renamingFolder ? (
          <input
            autoFocus
            value={folderLabel}
            onChange={e => setFolderLabel(e.target.value)}
            onBlur={() => { setRenamingFolder(false); onRenameFolder(folderLabel); }}
            onKeyDown={e => { if (e.key === "Enter") { setRenamingFolder(false); onRenameFolder(folderLabel); } }}
            className="text-sm font-semibold bg-transparent outline-none text-center"
            style={{ color: "var(--text-primary)", borderBottom: "1.5px solid var(--accent-blue)", paddingBottom: 2, width: 160 }}
          />
        ) : (
          <button onClick={() => setRenamingFolder(true)} className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {folder.label}
          </button>
        )}
        <div style={{ width: 80 }} />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex flex-wrap gap-3 justify-center" style={{ maxWidth: 800, margin: "0 auto" }}>
          {folderMods.map((mod, idx) => (
            <div
              key={mod.id}
              className="relative flex-shrink-0"
              style={{ width: 130, animation: editMode ? `jiggle 0.18s ${(idx * 73) % 350}ms ease-in-out infinite ${idx % 2 === 0 ? "alternate" : "alternate-reverse"}` : "none" }}
            >
              {editMode && (
                <button
                  onClick={e => { e.stopPropagation(); onRemoveModule(mod.id); }}
                  className="absolute flex items-center justify-center rounded-full"
                  style={{ top: -7, left: -7, zIndex: 20, width: 22, height: 22, backgroundColor: "#3a3a3c", border: "2px solid var(--bg-base)", color: "white", cursor: "pointer" }}
                >
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><line x1="2" y1="2" x2="8" y2="8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/><line x1="8" y1="2" x2="2" y2="8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
                </button>
              )}
              <button
                onClick={() => { if (!editMode) onNavigate(mod.href); }}
                className="flex flex-col items-center justify-center gap-2.5 rounded-2xl w-full pressable"
                style={{ height: 130, backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: editMode ? "default" : "pointer" }}
              >
                <TileIcon mod={mod} size={30} />
                <span className="text-xs font-medium text-center" style={{ color: "inherit", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden", lineHeight: 1.3, maxWidth: "88%" }}>{mod.label}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODULE LAUNCHER  (main)
// ═══════════════════════════════════════════════════════════════

export default function ModuleLauncher({
  open, onClose, startInEditMode = false,
}: {
  open: boolean; onClose: () => void; startInEditMode?: boolean;
}) {
  const router   = useRouter();
  const path     = usePathname();

  // ── Data ─────────────────────────────────────────────────────
  const [modules, setModules] = useState<ModuleEntry[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [grid,    setGrid]    = useState<GridEntry[]>([]);

  // ── UI ───────────────────────────────────────────────────────
  const [editMode,        setEditMode]        = useState(false);
  const [openFolderId,    setOpenFolderId]    = useState<string | null>(null);
  const [editingTileId,   setEditingTileId]   = useState<string | null>(null);  // bottom-sheet for rename/icon
  const [iconPickerForId, setIconPickerForId] = useState<string | null>(null);

  // ── Soon-toast ───────────────────────────────────────────────
  const [soonMsg, setSoonMsg] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!soonMsg) return;
    const t = setTimeout(() => setSoonMsg(""), 2800);
    return () => clearTimeout(t);
  }, [soonMsg]);

  // ── Drag ─────────────────────────────────────────────────────
  const dragFromIdx      = useRef<number | null>(null);
  const mergeTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimeRef     = useRef<Map<number, number>>(new Map());
  const [draggingIdx,    setDraggingIdx]    = useState<number | null>(null);
  const [mergeTargetIdx, setMergeTargetIdx] = useState<number | null>(null);

  // ── Load on open ─────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      const data = loadAll();
      setModules(data.modules);
      setFolders(data.folders);
      setGrid(data.grid);
      setEditMode(startInEditMode);
      setOpenFolderId(null);
      setEditingTileId(null);
    }
  }, [open, startInEditMode]);

  // ── Keyboard ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (iconPickerForId)  { setIconPickerForId(null); return; }
      if (editingTileId)    { setEditingTileId(null);   return; }
      if (openFolderId)     { setOpenFolderId(null);     return; }
      if (editMode)         { setEditMode(false);        return; }
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, editMode, openFolderId, editingTileId, iconPickerForId, onClose]);

  // ── Body scroll lock ─────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  // ── Persist helpers ──────────────────────────────────────────
  function persist(m: ModuleEntry[], f: Folder[], g: GridEntry[]) {
    setModules(m); setFolders(f); setGrid(g);
    saveAll(m, f, g);
  }

  // ── Module operations ────────────────────────────────────────
  function renameModule(id: string, label: string) {
    persist(modules.map(m => m.id === id ? { ...m, label } : m), folders, grid);
  }
  function setModuleEmoji(id: string, emoji: string | null) {
    persist(modules.map(m => m.id === id ? { ...m, emoji } : m), folders, grid);
  }
  function hideGridItem(idx: number) {
    const item = grid[idx];
    if (!item) return;
    if (item.type === "module") {
      const newMods = modules.map(m => m.id === item.id ? { ...m, hidden: true } : m);
      persist(newMods, folders, grid.filter((_, i) => i !== idx));
    } else {
      // Delete folder — return its modules to grid
      const folder = folders.find(f => f.id === item.id);
      const newFolderIds = folder ? folder.moduleIds.map(id => ({ type: "module" as const, id })) : [];
      persist(modules, folders.filter(f => f.id !== item.id), [...grid.filter((_, i) => i !== idx), ...newFolderIds]);
      if (openFolderId === item.id) setOpenFolderId(null);
    }
  }
  function restoreModule(modId: string) {
    const newMods = modules.map(m => m.id === modId ? { ...m, hidden: false } : m);
    persist(newMods, folders, [...grid, { type: "module", id: modId }]);
  }
  function deleteModulePermanently(modId: string) {
    const newMods = modules.filter(m => m.id !== modId);
    persist(newMods, folders, grid);
  }
  function addCustomModule() {
    const id = `custom-${Date.now()}`;
    const newMod: ModuleEntry = { id, href: `/custom/${id}`, label: "New", emoji: "📦", hidden: false, custom: true };
    persist([...modules, newMod], folders, [...grid, { type: "module", id }]);
    setEditingTileId(id);
  }

  // ── Folder operations ────────────────────────────────────────
  function renameFolder(folderId: string, label: string) {
    persist(modules, folders.map(f => f.id === folderId ? { ...f, label } : f), grid);
  }
  function removeFromFolder(folderId: string, moduleId: string) {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    const remaining = folder.moduleIds.filter(id => id !== moduleId);
    if (remaining.length <= 1) {
      // Dissolve folder — remaining module (if any) goes back to grid
      const folderIdx = grid.findIndex(g => g.id === folderId && g.type === "folder");
      const newGrid = [...grid.filter(g => !(g.id === folderId && g.type === "folder"))];
      remaining.forEach(id => newGrid.push({ type: "module", id }));
      newGrid.push({ type: "module", id: moduleId });
      persist(modules, folders.filter(f => f.id !== folderId), newGrid);
      setOpenFolderId(null);
    } else {
      persist(
        modules,
        folders.map(f => f.id === folderId ? { ...f, moduleIds: remaining } : f),
        [...grid, { type: "module", id: moduleId }],
      );
    }
  }

  // ── Drag helpers ─────────────────────────────────────────────
  function reorder(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const next = [...grid];
    next.splice(toIdx, 0, next.splice(fromIdx, 1)[0]);
    persist(modules, folders, next);
  }

  function mergeItems(fromIdx: number, toIdx: number) {
    const fromItem = grid[fromIdx];
    const toItem   = grid[toIdx];
    if (!fromItem || !toItem) return;

    // Can only drag a MODULE into another item
    if (fromItem.type !== "module") { reorder(fromIdx, toIdx); return; }

    if (toItem.type === "folder") {
      // Add to existing folder
      const newFolders = folders.map(f =>
        f.id === toItem.id ? { ...f, moduleIds: [...f.moduleIds, fromItem.id] } : f
      );
      persist(modules, newFolders, grid.filter((_, i) => i !== fromIdx));
    } else {
      // Create new folder at the toIdx position
      const folderId = `folder-${Date.now()}`;
      const newFolder: Folder = { id: folderId, label: "Folder", moduleIds: [toItem.id, fromItem.id] };
      const withoutBoth  = grid.filter((_, i) => i !== fromIdx && i !== toIdx);
      const insertAt     = Math.min(fromIdx, toIdx);
      const newGrid      = [...withoutBoth.slice(0, insertAt), { type: "folder" as const, id: folderId }, ...withoutBoth.slice(insertAt)];
      persist(modules, [...folders, newFolder], newGrid);
      setOpenFolderId(folderId);
    }
  }

  function onTileDragStart(idx: number) {
    dragFromIdx.current = idx;
    setDraggingIdx(idx);
    if (mergeTimerRef.current) clearTimeout(mergeTimerRef.current);
    setMergeTargetIdx(null);
  }

  function onTileDragEnter(idx: number) {
    // Record entry time
    enterTimeRef.current.set(idx, Date.now());
    if (dragFromIdx.current === idx) return;

    // Start visual merge indicator after 600ms
    if (mergeTimerRef.current) clearTimeout(mergeTimerRef.current);
    setMergeTargetIdx(null);
    if (dragFromIdx.current !== null && grid[dragFromIdx.current]?.type === "module") {
      mergeTimerRef.current = setTimeout(() => setMergeTargetIdx(idx), 600);
    }
  }

  function onTileDrop(toIdx: number) {
    const fromIdx = dragFromIdx.current;
    dragFromIdx.current = null;
    setDraggingIdx(null);
    if (mergeTimerRef.current) clearTimeout(mergeTimerRef.current);

    if (fromIdx === null || fromIdx === toIdx) { setMergeTargetIdx(null); return; }

    // Determine merge vs reorder based on hover time AND visual indicator
    const entryTime  = enterTimeRef.current.get(toIdx) ?? Date.now();
    const hoveredFor = Date.now() - entryTime;
    const isMerge    = mergeTargetIdx === toIdx || hoveredFor >= 590;

    enterTimeRef.current.clear();
    setMergeTargetIdx(null);

    if (isMerge && grid[fromIdx]?.type === "module") {
      mergeItems(fromIdx, toIdx);
    } else {
      reorder(fromIdx, toIdx);
    }
  }

  function onTileDragEnd() {
    dragFromIdx.current = null;
    setDraggingIdx(null);
    if (mergeTimerRef.current) clearTimeout(mergeTimerRef.current);
    enterTimeRef.current.clear();
    setMergeTargetIdx(null);
  }

  // ── Derived state ─────────────────────────────────────────────
  const hiddenModules = modules.filter(m => m.hidden);
  const openFolder    = openFolderId ? folders.find(f => f.id === openFolderId) ?? null : null;
  const editingMod    = editingTileId ? modules.find(m => m.id === editingTileId) ?? null : null;
  const iconPickerMod = iconPickerForId ? modules.find(m => m.id === iconPickerForId) ?? null : null;

  // ── Search filter ─────────────────────────────────────────────
  const filteredSections = search.trim()
    ? ALL_SECTIONS.map(s => ({
        ...s,
        items: s.items.filter(i => i.label.toLowerCase().includes(search.toLowerCase())),
      })).filter(s => s.items.length > 0)
    : ALL_SECTIONS;

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "var(--bg-base)" }}>

        {/* ── Shell header ───────────────────────────────────── */}
        <div
          className="flex items-center gap-4 px-5 flex-shrink-0"
          style={{ height: 56, backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{ width: 34, height: 34, backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            aria-label="Close"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>

          {/* Search */}
          {!editMode && (
            <div className="flex-1 relative">
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", pointerEvents: "none" }}
              >
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search apps…"
                style={{
                  width: "100%", height: 34, paddingLeft: 32, paddingRight: 10,
                  borderRadius: 10, border: "1px solid var(--border)",
                  backgroundColor: "var(--bg-elevated)", color: "var(--text-primary)",
                  fontSize: 13, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          )}
          {editMode && (
            <span className="flex-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Manage Apps
            </span>
          )}

          {/* Edit / Done */}
          <button
            onClick={() => { setEditMode(!editMode); setEditingTileId(null); setSearch(""); }}
            className="text-sm font-medium px-4 py-1.5 rounded-lg flex-shrink-0"
            style={{
              color: editMode ? "var(--accent-blue)" : "var(--text-secondary)",
              backgroundColor: editMode ? "rgba(59,130,246,0.12)" : "var(--bg-elevated)",
              border: `1px solid ${editMode ? "rgba(59,130,246,0.3)" : "var(--border)"}`,
            }}
          >
            {editMode ? "Done" : "Manage"}
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {openFolder ? (
            <FolderView
              folder={openFolder}
              modules={modules}
              editMode={editMode}
              onBack={() => setOpenFolderId(null)}
              onRenameFolder={label => renameFolder(openFolder.id, label)}
              onRemoveModule={modId => removeFromFolder(openFolder.id, modId)}
              onNavigate={href => { router.push(href); onClose(); }}
            />
          ) : !editMode ? (
            /* ── Fiori browse view ── */
            <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 20px 40px" }}>
              {filteredSections.length === 0 && (
                <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13, marginTop: 48 }}>
                  No apps match &ldquo;{search}&rdquo;
                </p>
              )}
              {filteredSections.map(section => (
                <div key={section.id} style={{ marginBottom: 32 }}>
                  {/* Group header — Fiori style */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
                      color: section.accent ? "#10b981" : "var(--text-secondary)",
                      whiteSpace: "nowrap",
                    }}>
                      {section.label}
                    </span>
                    <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
                    {section.accent && (
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 999,
                        backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981",
                        border: "1px solid rgba(16,185,129,0.25)", whiteSpace: "nowrap",
                      }}>
                        Accountant
                      </span>
                    )}
                  </div>

                  {/* Tile grid */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))",
                    gap: 10,
                  }}>
                    {section.items.map(item => {
                      const isSoon     = item.badge === "soon";
                      const isDownload = item.badge === "download";
                      const builtIn    = modules.find(m => m.id === item.id);
                      const href       = item.href ?? (item.id.startsWith("/") ? item.id : undefined);
                      const activePath = href?.split("?")[0];
                      const active     = activePath ? (path === activePath || path.startsWith(activePath + "/")) : false;

                      return (
                        <button
                          key={item.id}
                          disabled={isSoon}
                          onClick={() => {
                            if (isSoon) { setSoonMsg(`${item.label} is coming soon.`); return; }
                            if (href) { router.push(href); onClose(); }
                          }}
                          style={{
                            position: "relative",
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                            gap: 8, padding: "14px 8px 12px",
                            borderRadius: 12,
                            height: 100,
                            opacity: isSoon ? 0.38 : 1,
                            cursor: isSoon ? "not-allowed" : "pointer",
                            backgroundColor: active ? "rgba(59,130,246,0.1)" : "var(--bg-surface)",
                            border: `1.5px solid ${active ? "var(--accent-blue)" : "var(--border)"}`,
                            color: active ? "var(--accent-blue)" : "var(--text-secondary)",
                            transition: "background-color 0.12s, border-color 0.12s, box-shadow 0.12s",
                            boxShadow: active ? "0 0 0 1px rgba(59,130,246,0.2)" : "none",
                          }}
                          onMouseEnter={e => {
                            if (!isSoon && !active) {
                              (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-elevated)";
                              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)";
                            }
                          }}
                          onMouseLeave={e => {
                            if (!isSoon && !active) {
                              (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-surface)";
                              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                            }
                          }}
                        >
                          {/* Icon */}
                          <div style={{ flexShrink: 0 }}>
                            {builtIn ? (
                              <TileIcon mod={builtIn} size={24} />
                            ) : item.emoji ? (
                              <span style={{ fontSize: 22, lineHeight: 1 }}>{item.emoji}</span>
                            ) : (
                              <span style={{ fontSize: 22 }}>📦</span>
                            )}
                          </div>

                          {/* Label */}
                          <span style={{
                            fontSize: 11, fontWeight: 500, lineHeight: 1.3,
                            textAlign: "center", maxWidth: "100%",
                            display: "-webkit-box", WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical" as const, overflow: "hidden",
                            color: "inherit",
                          }}>
                            {item.label}
                          </span>

                          {/* Badges */}
                          {isSoon && (
                            <span style={{
                              position: "absolute", top: 4, right: 5,
                              fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 999,
                              backgroundColor: "rgba(100,100,120,0.5)", color: "rgba(255,255,255,0.6)",
                              letterSpacing: "0.03em",
                            }}>
                              SOON
                            </span>
                          )}
                          {isDownload && (
                            <span style={{ position: "absolute", top: 5, right: 6, color: "#10b981" }}>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ── Manage / edit grid ── */
            <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 20px 40px" }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center", marginBottom: 20 }}>
                Drag to reorder · hold over a tile to merge into a folder · tap a tile to rename or change its icon
              </p>

              <div
                style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-start" }}
                onDragOver={e => e.preventDefault()}
              >
                {grid.map((item, idx) => {
                  const isDragging = draggingIdx === idx;
                  const isMergeTgt = mergeTargetIdx === idx;

                  if (item.type === "module") {
                    const mod = modules.find(m => m.id === item.id);
                    if (!mod) return null;
                    const active = path.startsWith(mod.href);

                    return (
                      <div
                        key={item.id}
                        style={{
                          position: "relative", flexShrink: 0, width: 108,
                          animation: `jiggle 0.18s ${(idx * 73) % 350}ms ease-in-out infinite ${idx % 2 === 0 ? "alternate" : "alternate-reverse"}`,
                          opacity: isDragging ? 0.3 : 1, transition: "opacity 0.12s", cursor: "grab",
                        }}
                        draggable
                        onDragStart={() => onTileDragStart(idx)}
                        onDragEnter={() => onTileDragEnter(idx)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => onTileDrop(idx)}
                        onDragEnd={onTileDragEnd}
                      >
                        <button
                          onClick={e => { e.stopPropagation(); hideGridItem(idx); }}
                          style={{
                            position: "absolute", top: -7, left: -7, zIndex: 20,
                            width: 20, height: 20, borderRadius: "50%",
                            backgroundColor: "#3a3a3c", border: "2px solid var(--bg-base)",
                            color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <svg width="7" height="7" viewBox="0 0 10 10" fill="none"><line x1="2" y1="2" x2="8" y2="8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/><line x1="8" y1="2" x2="2" y2="8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
                        </button>

                        <button
                          onClick={() => setEditingTileId(mod.id)}
                          style={{
                            width: "100%", height: 100, borderRadius: 12,
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 8px 12px",
                            backgroundColor: isMergeTgt ? "rgba(59,130,246,0.18)" : (active ? "rgba(59,130,246,0.1)" : "var(--bg-surface)"),
                            border: `1.5px solid ${isMergeTgt || active ? "var(--accent-blue)" : "var(--border)"}`,
                            color: active ? "var(--accent-blue)" : "var(--text-secondary)",
                            boxShadow: isMergeTgt ? "0 0 0 3px rgba(59,130,246,0.2)" : "none",
                            transition: "box-shadow 0.15s, background-color 0.15s",
                            cursor: "pointer",
                          }}
                        >
                          <TileIcon mod={mod} size={24} />
                          <span style={{ fontSize: 11, fontWeight: 500, textAlign: "center", color: "inherit", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden", lineHeight: 1.3, maxWidth: "100%", wordBreak: "break-word" }}>
                            {mod.label}
                          </span>
                        </button>
                      </div>
                    );
                  }

                  const folder = folders.find(f => f.id === item.id);
                  if (!folder) return null;

                  return (
                    <div
                      key={item.id}
                      style={{
                        position: "relative", flexShrink: 0, width: 108,
                        animation: `jiggle 0.18s ${(idx * 73) % 350}ms ease-in-out infinite ${idx % 2 === 0 ? "alternate" : "alternate-reverse"}`,
                        opacity: isDragging ? 0.3 : 1, transition: "opacity 0.12s", cursor: "grab",
                      }}
                      draggable
                      onDragStart={() => onTileDragStart(idx)}
                      onDragEnter={() => onTileDragEnter(idx)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => onTileDrop(idx)}
                      onDragEnd={onTileDragEnd}
                    >
                      <button
                        onClick={e => { e.stopPropagation(); hideGridItem(idx); }}
                        style={{
                          position: "absolute", top: -7, left: -7, zIndex: 20,
                          width: 20, height: 20, borderRadius: "50%",
                          backgroundColor: "#3a3a3c", border: "2px solid var(--bg-base)",
                          color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <svg width="7" height="7" viewBox="0 0 10 10" fill="none"><line x1="2" y1="2" x2="8" y2="8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/><line x1="8" y1="2" x2="2" y2="8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
                      </button>

                      <button
                        onClick={() => setOpenFolderId(folder.id)}
                        style={{
                          width: "100%", height: 100, borderRadius: 12,
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 8px 12px",
                          backgroundColor: isMergeTgt ? "rgba(59,130,246,0.18)" : "var(--bg-surface)",
                          border: `1.5px solid ${isMergeTgt ? "var(--accent-blue)" : "var(--border)"}`,
                          color: "var(--text-secondary)",
                          boxShadow: isMergeTgt ? "0 0 0 3px rgba(59,130,246,0.2)" : "none",
                          transition: "box-shadow 0.15s, background-color 0.15s", cursor: "pointer",
                        }}
                      >
                        <FolderThumbnail folder={folder} modules={modules} size={44} />
                        <span style={{ fontSize: 11, fontWeight: 500, textAlign: "center", color: "inherit", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden", lineHeight: 1.3, maxWidth: "100%" }}>
                          {folder.label}
                        </span>
                      </button>
                    </div>
                  );
                })}

                {/* + New tile */}
                <button
                  onClick={addCustomModule}
                  style={{
                    flexShrink: 0, width: 108, height: 100, borderRadius: 12,
                    border: "1.5px dashed var(--border)", color: "var(--text-secondary)",
                    backgroundColor: "transparent", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span style={{ fontSize: 11, fontWeight: 500 }}>New App</span>
                </button>
              </div>

              {/* Hidden modules */}
              {hiddenModules.length > 0 && (
                <div style={{ marginTop: 36 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      Hidden
                    </span>
                    <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {hiddenModules.map(mod => (
                      <div key={mod.id} style={{ position: "relative", flexShrink: 0, width: 108, opacity: 0.5 }}>
                        <button
                          onClick={() => restoreModule(mod.id)}
                          style={{
                            position: "absolute", top: -7, left: -7, zIndex: 20,
                            width: 20, height: 20, borderRadius: "50%",
                            backgroundColor: "#16a34a", border: "2px solid var(--bg-base)",
                            color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><line x1="5" y1="2" x2="5" y2="8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/><line x1="2" y1="5" x2="8" y2="5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
                        </button>
                        {mod.custom && (
                          <button
                            onClick={() => {
                              if (confirm(`Permanently delete "${mod.label}"?`)) deleteModulePermanently(mod.id);
                            }}
                            style={{
                              position: "absolute", top: -7, right: -7, zIndex: 20,
                              width: 20, height: 20, borderRadius: "50%",
                              backgroundColor: "#dc2626", border: "2px solid var(--bg-base)",
                              color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </button>
                        )}
                        <div style={{
                          width: "100%", height: 100, borderRadius: 12,
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 8px 12px",
                          backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)",
                        }}>
                          <TileIcon mod={mod} size={24} />
                          <span style={{ fontSize: 11, fontWeight: 500, textAlign: "center", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden", lineHeight: 1.3, maxWidth: "100%" }}>{mod.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Soon toast */}
      {soonMsg && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          zIndex: 200, backgroundColor: "rgba(20,20,24,0.94)", color: "rgba(255,255,255,0.88)",
          padding: "10px 20px", borderRadius: 12, fontSize: 13, fontWeight: 500,
          boxShadow: "0 4px 24px rgba(0,0,0,0.4)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.1)", whiteSpace: "nowrap",
          animation: "fadeInUp 0.2s ease-out",
        }}>
          🔜 {soonMsg}
        </div>
      )}

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
