"use client";

import { use, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { loadAll, TileIcon, type ModuleEntry } from "@/components/ModuleLauncher";
import {
  getSaved, getIncome, getMileage, calcMileageDeduction,
  type SavedReceipt, type IncomeEntry, type MileageTrip,
} from "@/lib/storage";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type WidgetId = "stats" | "notes" | "todos" | "links" | "receipts";

type Todo = { id: string; text: string; done: boolean };
type QuickLink = { id: string; label: string; url: string };

type ModuleData = {
  enabledWidgets: WidgetId[];
  notes: string;
  todos: Todo[];
  links: QuickLink[];
};

const WIDGET_META: { id: WidgetId; label: string; description: string; icon: string }[] = [
  { id: "stats",    label: "Quick Stats",      description: "Live summary of your financial data",  icon: "📊" },
  { id: "notes",    label: "Notes",            description: "Free-form memos and reminders",        icon: "📝" },
  { id: "todos",    label: "To-Do List",       description: "Task checklist for your business",     icon: "✅" },
  { id: "links",    label: "Quick Links",      description: "Bookmarks and external resources",     icon: "🔗" },
  { id: "receipts", label: "Recent Receipts",  description: "Last 5 uploaded receipts",             icon: "🧾" },
];

const DEFAULT_DATA: ModuleData = {
  enabledWidgets: ["stats", "notes", "todos"],
  notes: "",
  todos: [],
  links: [],
};

// ═══════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════

function storageKey(id: string) { return `corpo-custom-${id}`; }

function loadData(id: string): ModuleData {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return { ...DEFAULT_DATA };
    return { ...DEFAULT_DATA, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_DATA }; }
}

function saveData(id: string, data: ModuleData) {
  localStorage.setItem(storageKey(id), JSON.stringify(data));
}

// ═══════════════════════════════════════════════════════════════
// FORMAT HELPERS
// ═══════════════════════════════════════════════════════════════

function fmtCAD(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
}

function parseMoney(s: string): number {
  return parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

// ═══════════════════════════════════════════════════════════════
// WIDGET: QUICK STATS
// ═══════════════════════════════════════════════════════════════

function StatsWidget() {
  const [stats, setStats] = useState<{
    receiptCount: number;
    totalExpenses: number;
    totalIncome: number;
    netProfit: number;
    totalKm: number;
    mileageDeduction: number;
    hstCollected: number;
    hstClaimable: number;
    hstPosition: number;
  } | null>(null);

  useEffect(() => {
    const receipts: SavedReceipt[] = getSaved();
    const income: IncomeEntry[]    = getIncome();
    const mileage: MileageTrip[]   = getMileage();

    const totalExpenses  = receipts.reduce((s, r) => s + parseMoney(r.total), 0);
    const hstClaimable   = receipts.reduce((s, r) => s + parseMoney(r.tax), 0);
    const totalIncome    = income.reduce((s, e) => s + parseMoney(e.amount), 0);
    const hstCollected   = income.reduce((s, e) => s + parseMoney(e.hstCollected), 0);
    const totalKm        = mileage.reduce((s, t) => s + (t.km || 0), 0);
    const mileageDeduction = calcMileageDeduction(totalKm);

    setStats({
      receiptCount: receipts.length,
      totalExpenses,
      totalIncome,
      netProfit: totalIncome - totalExpenses,
      totalKm,
      mileageDeduction,
      hstCollected,
      hstClaimable,
      hstPosition: hstCollected - hstClaimable,
    });
  }, []);

  if (!stats) return null;

  const tiles: { label: string; value: string; sub?: string; color?: string }[] = [
    { label: "Total Expenses",   value: fmtCAD(stats.totalExpenses),     sub: `${stats.receiptCount} receipts` },
    { label: "Total Income",     value: fmtCAD(stats.totalIncome),        sub: "invoiced" },
    {
      label: "Net Profit",
      value: fmtCAD(stats.netProfit),
      sub: stats.netProfit >= 0 ? "before tax" : "net loss",
      color: stats.netProfit >= 0 ? "var(--accent-green)" : "#ef4444",
    },
    { label: "Mileage",          value: `${stats.totalKm.toFixed(0)} km`, sub: `≈ ${fmtCAD(stats.mileageDeduction)} deduction` },
    {
      label: "HST Position",
      value: fmtCAD(Math.abs(stats.hstPosition)),
      sub: stats.hstPosition >= 0 ? "to remit" : "refund owing",
      color: stats.hstPosition >= 0 ? "#f59e0b" : "var(--accent-green)",
    },
    { label: "HST Claimable",    value: fmtCAD(stats.hstClaimable),      sub: "input tax credits" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
      {tiles.map(t => (
        <div key={t.label} className="rounded-xl p-4" style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{t.label}</p>
          <p className="text-lg font-bold leading-tight" style={{ color: t.color ?? "var(--text-primary)" }}>{t.value}</p>
          {t.sub && <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WIDGET: NOTES
// ═══════════════════════════════════════════════════════════════

function NotesWidget({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(v: string) {
    setSaved(false);
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(true), 800);
  }

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={e => handleChange(e.target.value)}
        placeholder="Write anything — business ideas, reminders, meeting notes…"
        rows={8}
        className="w-full rounded-xl resize-y text-sm outline-none p-3"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          lineHeight: 1.7,
          minHeight: 140,
        }}
      />
      <div className="flex items-center justify-between px-1">
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {words} word{words !== 1 ? "s" : ""}
        </span>
        <span className="text-xs" style={{ color: saved ? "var(--accent-green)" : "var(--text-secondary)" }}>
          {saved ? "✓ Saved" : "Saving…"}
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WIDGET: TO-DO LIST
// ═══════════════════════════════════════════════════════════════

function TodosWidget({ todos, onChange }: { todos: Todo[]; onChange: (t: Todo[]) => void }) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function add() {
    const text = input.trim();
    if (!text) return;
    onChange([...todos, { id: `todo-${Date.now()}`, text, done: false }]);
    setInput("");
    inputRef.current?.focus();
  }

  function toggle(id: string) {
    onChange(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }

  function remove(id: string) {
    onChange(todos.filter(t => t.id !== id));
  }

  function clearDone() {
    onChange(todos.filter(t => !t.done));
  }

  const remaining = todos.filter(t => !t.done).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Add input */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") add(); }}
          placeholder="Add a task…"
          className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="flex items-center justify-center rounded-xl px-3 text-sm font-medium"
          style={{ backgroundColor: "var(--accent-blue)", color: "white", opacity: input.trim() ? 1 : 0.4, minWidth: 40, height: 38 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      {/* List */}
      {todos.length === 0 ? (
        <p className="text-sm text-center py-4" style={{ color: "var(--text-secondary)" }}>No tasks yet — add one above</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {todos.map(todo => (
            <div
              key={todo.id}
              className="flex items-start gap-3 rounded-xl px-3 py-2.5 group"
              style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              <button
                onClick={() => toggle(todo.id)}
                className="flex-shrink-0 mt-0.5 flex items-center justify-center rounded-full"
                style={{
                  width: 18, height: 18,
                  backgroundColor: todo.done ? "var(--accent-green)" : "transparent",
                  border: `1.5px solid ${todo.done ? "var(--accent-green)" : "var(--border)"}`,
                }}
              >
                {todo.done && (
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <polyline points="1.5,5 4,7.5 8.5,2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
              <span
                className="flex-1 text-sm leading-relaxed"
                style={{ color: todo.done ? "var(--text-secondary)" : "var(--text-primary)", textDecoration: todo.done ? "line-through" : "none" }}
              >
                {todo.text}
              </span>
              <button
                onClick={() => remove(todo.id)}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0"
                style={{ color: "var(--text-secondary)", transition: "opacity 0.12s" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {todos.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {remaining} remaining
          </span>
          {todos.some(t => t.done) && (
            <button onClick={clearDone} className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Clear completed
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WIDGET: QUICK LINKS
// ═══════════════════════════════════════════════════════════════

const PRESET_LINKS: { label: string; url: string }[] = [
  { label: "CRA My Business Account", url: "https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/business-account.html" },
  { label: "CRA HST/GST Portal",      url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses.html" },
  { label: "Service Ontario",         url: "https://www.ontario.ca/page/business" },
  { label: "CRA Payroll Deductions",  url: "https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/payroll-deductions-online-calculator.html" },
  { label: "CRA NETFILE",             url: "https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/t2-corporation-internet-filing.html" },
];

function LinksWidget({ links, onChange }: { links: QuickLink[]; onChange: (l: QuickLink[]) => void }) {
  const [showForm, setShowForm]   = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [label, setLabel]         = useState("");
  const [url, setUrl]             = useState("");
  const [editId, setEditId]       = useState<string | null>(null);

  function submit() {
    if (!label.trim() || !url.trim()) return;
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    if (editId) {
      onChange(links.map(l => l.id === editId ? { ...l, label: label.trim(), url: normalized } : l));
      setEditId(null);
    } else {
      onChange([...links, { id: `link-${Date.now()}`, label: label.trim(), url: normalized }]);
    }
    setLabel(""); setUrl(""); setShowForm(false);
  }

  function startEdit(l: QuickLink) {
    setEditId(l.id); setLabel(l.label); setUrl(l.url); setShowForm(true); setShowPresets(false);
  }

  function addPreset(p: { label: string; url: string }) {
    if (links.some(l => l.url === p.url)) return;
    onChange([...links, { id: `link-${Date.now()}`, label: p.label, url: p.url }]);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Link list */}
      {links.length === 0 && !showForm && (
        <p className="text-sm text-center py-3" style={{ color: "var(--text-secondary)" }}>No links saved yet</p>
      )}

      {links.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {links.map(l => (
            <div
              key={l.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 group"
              style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              <div className="flex-shrink-0 flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, backgroundColor: "rgba(59,130,246,0.12)", color: "var(--accent-blue)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-sm font-medium truncate"
                style={{ color: "var(--accent-blue)" }}
              >
                {l.label}
              </a>
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5" style={{ transition: "opacity 0.12s" }}>
                <button onClick={() => startEdit(l)} style={{ color: "var(--text-secondary)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button onClick={() => onChange(links.filter(x => x.id !== l.id))} style={{ color: "#ef4444" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit form */}
      {showForm && (
        <div className="flex flex-col gap-2 rounded-xl p-3" style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
          <input
            autoFocus
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Label (e.g. My Bank)"
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="URL (e.g. https://…)"
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <div className="flex gap-2">
            <button onClick={submit} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: "var(--accent-blue)", color: "white" }}>
              {editId ? "Save" : "Add Link"}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); setLabel(""); setUrl(""); }} className="py-2 px-3 rounded-lg text-sm" style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Preset picker */}
      {showPresets && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <p className="text-xs px-3 py-2 font-medium" style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>Common links for Canadian businesses</p>
          {PRESET_LINKS.map(p => (
            <button
              key={p.url}
              onClick={() => { addPreset(p); setShowPresets(false); }}
              disabled={links.some(l => l.url === p.url)}
              className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-left"
              style={{
                color: links.some(l => l.url === p.url) ? "var(--text-secondary)" : "var(--text-primary)",
                borderBottom: "1px solid var(--border)",
                opacity: links.some(l => l.url === p.url) ? 0.5 : 1,
              }}
            >
              <span style={{ color: "var(--accent-blue)" }}>
                {links.some(l => l.url === p.url) ? "✓" : "+"}
              </span>
              {p.label}
            </button>
          ))}
          <button onClick={() => setShowPresets(false)} className="w-full px-3 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>Close</button>
        </div>
      )}

      {/* Action buttons */}
      {!showForm && !showPresets && (
        <div className="flex gap-2">
          <button
            onClick={() => { setShowForm(true); setShowPresets(false); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border)", backgroundColor: "var(--bg-elevated)" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Link
          </button>
          <button
            onClick={() => { setShowPresets(true); setShowForm(false); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border)", backgroundColor: "var(--bg-elevated)" }}
          >
            🇨🇦 Presets
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WIDGET: RECENT RECEIPTS
// ═══════════════════════════════════════════════════════════════

function RecentReceiptsWidget() {
  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);

  useEffect(() => {
    setReceipts(getSaved().slice(0, 6));
  }, []);

  if (receipts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6" style={{ color: "var(--text-secondary)" }}>
        <span style={{ fontSize: 32 }}>🧾</span>
        <p className="text-sm">No receipts yet</p>
        <Link href="/receipts" className="text-xs" style={{ color: "var(--accent-blue)" }}>Go to Receipts →</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {receipts.map(r => (
        <div
          key={r.id}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5"
          style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}
        >
          {/* Thumbnail */}
          <div className="flex-shrink-0 rounded-lg overflow-hidden" style={{ width: 36, height: 36, backgroundColor: "var(--bg-base)" }}>
            {r.thumbnail && r.thumbnail !== "pdf" && r.thumbnail !== "heic" ? (
              <img src={r.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ fontSize: 18 }}>
                {r.thumbnail === "pdf" ? "📄" : "🧾"}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {r.vendor || "Unknown vendor"}
            </p>
            <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
              {r.date || "—"} · {r.category || "Uncategorized"}
            </p>
          </div>

          <span className="text-sm font-semibold flex-shrink-0" style={{ color: "var(--text-primary)" }}>
            {r.total ? `$${parseMoney(r.total).toFixed(2)}` : "—"}
          </span>
        </div>
      ))}

      <Link
        href="/receipts"
        className="text-xs text-center py-2"
        style={{ color: "var(--accent-blue)" }}
      >
        View all receipts →
      </Link>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURE DRAWER
// ═══════════════════════════════════════════════════════════════

function ConfigDrawer({
  enabled, onToggle, onClose,
}: {
  enabled: WidgetId[];
  onToggle: (id: WidgetId) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="flex flex-col h-full overflow-y-auto"
        style={{
          width: 320,
          backgroundColor: "var(--bg-surface)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "-20px 0 60px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Configure Widgets</span>
          <button onClick={onClose} className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Widget list */}
        <div className="flex flex-col gap-1 p-4">
          <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
            Toggle widgets to show or hide them on this module.
          </p>
          {WIDGET_META.map(w => {
            const on = enabled.includes(w.id);
            return (
              <button
                key={w.id}
                onClick={() => onToggle(w.id)}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-left pressable"
                style={{ backgroundColor: on ? "rgba(59,130,246,0.08)" : "var(--bg-elevated)", border: `1px solid ${on ? "rgba(59,130,246,0.25)" : "var(--border)"}` }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>{w.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{w.label}</p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{w.description}</p>
                </div>
                {/* Toggle pill */}
                <div
                  className="flex-shrink-0 rounded-full relative"
                  style={{ width: 36, height: 20, backgroundColor: on ? "var(--accent-blue)" : "var(--border)", transition: "background-color 0.15s" }}
                >
                  <div
                    className="absolute top-1 rounded-full"
                    style={{
                      width: 12, height: 12,
                      backgroundColor: "white",
                      left: on ? 20 : 4,
                      transition: "left 0.15s",
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WIDGET CARD WRAPPER
// ═══════════════════════════════════════════════════════════════

function WidgetCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════

export default function CustomModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [mod, setMod]           = useState<ModuleEntry | null>(null);
  const [data, setData]         = useState<ModuleData>(DEFAULT_DATA);
  const [showConfig, setShowConfig] = useState(false);
  const [loaded, setLoaded]     = useState(false);

  useEffect(() => {
    // Find module config
    const { modules } = loadAll();
    const found = modules.find(m => m.id === id || m.href === `/custom/${id}`);
    setMod(found ?? null);

    // Load widget data
    setData(loadData(id));
    setLoaded(true);
  }, [id]);

  const persist = useCallback((next: ModuleData) => {
    setData(next);
    saveData(id, next);
  }, [id]);

  function toggleWidget(wid: WidgetId) {
    const current = data.enabledWidgets;
    const next = current.includes(wid)
      ? current.filter(w => w !== wid)
      : [...current, wid];
    persist({ ...data, enabledWidgets: next });
  }

  if (!loaded) return null;

  if (!mod) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4" style={{ color: "var(--text-secondary)" }}>
        <span style={{ fontSize: 48 }}>🔍</span>
        <p className="text-sm">Module not found.</p>
      </div>
    );
  }

  // Ordered enabled widgets
  const orderedWidgets = WIDGET_META.filter(w => data.enabledWidgets.includes(w.id));

  return (
    <>
      {showConfig && (
        <ConfigDrawer
          enabled={data.enabledWidgets}
          onToggle={toggleWidget}
          onClose={() => setShowConfig(false)}
        />
      )}

      <div className="max-w-3xl mx-auto px-5 py-8 flex flex-col gap-6">

        {/* ── Page header ──────────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <div
            className="flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ width: 56, height: 56, backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--accent-blue)", fontSize: 28 }}
          >
            <TileIcon mod={mod} size={32} />
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate" style={{ color: "var(--text-primary)" }}>{mod.label}</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {orderedWidgets.length === 0 ? "No widgets enabled" : `${orderedWidgets.length} widget${orderedWidgets.length !== 1 ? "s" : ""} active`}
            </p>
          </div>

          <button
            onClick={() => setShowConfig(true)}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl flex-shrink-0 pressable"
            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Configure
          </button>
        </div>

        {/* ── Empty state ──────────────────────────────────────── */}
        {orderedWidgets.length === 0 && (
          <div
            className="rounded-2xl p-10 flex flex-col items-center gap-4 text-center"
            style={{ border: "1.5px dashed var(--border)", color: "var(--text-secondary)" }}
          >
            <span style={{ fontSize: 40 }}>⚙️</span>
            <div>
              <p className="text-base font-medium mb-1" style={{ color: "var(--text-primary)" }}>No widgets enabled</p>
              <p className="text-sm" style={{ lineHeight: 1.7 }}>Click Configure to add widgets to this module.</p>
            </div>
            <button onClick={() => setShowConfig(true)} className="text-sm px-4 py-2 rounded-xl pressable" style={{ backgroundColor: "var(--accent-blue)", color: "white" }}>
              Configure
            </button>
          </div>
        )}

        {/* ── Widgets ──────────────────────────────────────────── */}
        {orderedWidgets.map(w => {
          switch (w.id) {
            case "stats":
              return (
                <WidgetCard key="stats" icon="📊" title="Quick Stats">
                  <StatsWidget />
                </WidgetCard>
              );
            case "notes":
              return (
                <WidgetCard key="notes" icon="📝" title="Notes">
                  <NotesWidget
                    value={data.notes}
                    onChange={notes => persist({ ...data, notes })}
                  />
                </WidgetCard>
              );
            case "todos":
              return (
                <WidgetCard key="todos" icon="✅" title="To-Do List">
                  <TodosWidget
                    todos={data.todos}
                    onChange={todos => persist({ ...data, todos })}
                  />
                </WidgetCard>
              );
            case "links":
              return (
                <WidgetCard key="links" icon="🔗" title="Quick Links">
                  <LinksWidget
                    links={data.links}
                    onChange={links => persist({ ...data, links })}
                  />
                </WidgetCard>
              );
            case "receipts":
              return (
                <WidgetCard key="receipts" icon="🧾" title="Recent Receipts">
                  <RecentReceiptsWidget />
                </WidgetCard>
              );
            default: return null;
          }
        })}
      </div>
    </>
  );
}
