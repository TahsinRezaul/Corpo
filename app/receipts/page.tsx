"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSaved, deleteSaved, updateSaved, getDismissedNotifs, dismissNotif, CATEGORIES, categoryStyle, EMPTY_FORM, getSettings, parseIntervalDays, intervalLabel, type SavedReceipt, type ReceiptForm } from "@/lib/storage";
import IntervalPicker from "@/components/IntervalPicker";
import * as XLSX from "xlsx";
import PageHelp from "@/components/PageHelp";
import { PAGE_HELP } from "@/lib/page-help-content";
import ImageLightbox from "@/components/ImageLightbox";

type Filters = {
  search: string;
  category: string;
  dateFrom: string;
  dateTo: string;
};

type SortBy = "date" | "total" | "vendor" | "category" | "subscription" | null;
type SortOrder = "asc" | "desc";
type ViewMode = "list" | "medium" | "large";

type AgentMessage = { role: "user" | "assistant"; content: string };
type AgentAction =
  | { type: "filter"; filters: Partial<Filters> }
  | { type: "sort"; by: SortBy; order: SortOrder }
  | { type: "highlight"; ids: string[] }
  | { type: "clear" }
  | { type: "edit"; id: string; changes: Partial<SavedReceipt> }
  | { type: "bulkEdit"; ids: string[]; changes: Partial<SavedReceipt> }
  | { type: "delete"; ids: string[] }
  | null;

const EMPTY_FILTERS: Filters = { search: "", category: "", dateFrom: "", dateTo: "" };

type DupPair = {
  key: string;
  idA: string; idB: string;
  vendor: string; total: string;
  dateA: string; dateB: string;
};

// ── Icons ──────────────────────────────────────────────────────────────────────

function DocIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      style={{ color: "var(--text-secondary)" }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ListViewIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>
      <rect x="1" y="2" width="14" height="2.5" rx="1" fill="currentColor" opacity="0.4" />
      <rect x="1" y="6.75" width="14" height="2.5" rx="1" fill="currentColor" />
      <rect x="1" y="11.5" width="14" height="2.5" rx="1" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

function MediumViewIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function LargeViewIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>
      <rect x="1" y="1" width="6.5" height="8" rx="1.5" fill="currentColor" />
      <rect x="8.5" y="1" width="6.5" height="8" rx="1.5" fill="currentColor" />
      <rect x="1" y="10.5" width="6.5" height="4.5" rx="1.5" fill="currentColor" opacity="0.4" />
      <rect x="8.5" y="10.5" width="6.5" height="4.5" rx="1.5" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RecordsPage() {
  const router = useRouter();
  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("large");
  const [sortBy, setSortBy] = useState<SortBy>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());

  // Agent state
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentInput, setAgentInput] = useState("");
  const [agentHistory, setAgentHistory] = useState<AgentMessage[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentProMode, setAgentProMode] = useState(false);
  const agentInputRef = useRef<HTMLInputElement>(null);

  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);

  // ── Multi-select state ─────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectMode = selectedIds.size > 0;

  // ── Edit state ─────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<ReceiptForm>({ ...EMPTY_FORM });

  // ── Fullscreen image viewer ────────────────────────────────────────────────
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null);

  // ── Notification state ─────────────────────────────────────────────────────
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [notifOpen, setNotifOpen] = useState(false);

  const [notifSettings, setNotifSettings] = useState({ subs: true, dups: true, incomplete: true });

  useEffect(() => {
    setReceipts(getSaved());
    const saved = localStorage.getItem("recordsView") as ViewMode | null;
    if (saved === "list" || saved === "medium" || saved === "large") setView(saved);
    setDismissedKeys(getDismissedNotifs());
    const s = getSettings();
    setAgentProMode(s.aiProMode);
    setNotifSettings({
      subs: s.notif_subscriptionReminders ?? true,
      dups: s.notif_duplicateWarnings ?? true,
      incomplete: s.notif_incompleteReceipts ?? true,
    });
  }, []);

  // Escape key exits select mode
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") exitSelectMode(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function changeView(v: ViewMode) {
    setView(v);
    localStorage.setItem("recordsView", v);
  }

  function setFilter(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function handleDelete(id: string) {
    deleteSaved(id);
    setReceipts(getSaved());
    if (selectedId === id) setSelectedId(null);
  }

  function startEditing(r: SavedReceipt) {
    setEditForm({
      vendor:             r.vendor,
      date:               r.date,
      subtotal:           r.subtotal,
      tax:                r.tax,
      total:              r.total,
      category:           r.category,
      business_purpose:   r.business_purpose,
      notes:              r.notes ?? "",
      shareholder_loan:   r.shareholder_loan,
      recurring:          r.recurring ?? false,
      recurringInterval:  (r.recurringInterval as ReceiptForm["recurringInterval"]) ?? "",
    });
    setIsEditing(true);
  }

  function saveEdits(id: string) {
    updateSaved(id, { ...editForm });
    setReceipts(getSaved());
    setIsEditing(false);
  }

  function handleDismiss(key: string) {
    dismissNotif(key);
    setDismissedKeys((prev) => new Set([...prev, key]));
  }

  function applyAgentAction(action: AgentAction) {
    if (!action) return;
    if (action.type === "filter") {
      setFilters((f) => ({ ...f, ...action.filters }));
      setHighlightIds(new Set());
    } else if (action.type === "sort") {
      setSortBy(action.by ?? null);
      setSortOrder(action.order ?? "desc");
    } else if (action.type === "highlight") {
      setHighlightIds(new Set(action.ids));
    } else if (action.type === "clear") {
      setFilters(EMPTY_FILTERS);
      setSortBy(null);
      setSortOrder("desc");
      setHighlightIds(new Set());
    } else if (action.type === "edit") {
      updateSaved(action.id, action.changes);
      setReceipts(getSaved());
    } else if (action.type === "bulkEdit") {
      action.ids.forEach((id) => updateSaved(id, action.changes));
      setReceipts(getSaved());
    } else if (action.type === "delete") {
      action.ids.forEach((id) => deleteSaved(id));
      setReceipts(getSaved());
      if (selectedId && action.ids.includes(selectedId)) setSelectedId(null);
    }
  }

  async function askAgent(query: string) {
    if (!query.trim() || agentLoading) return;
    const userMsg: AgentMessage = { role: "user", content: query };
    const newHistory = [...agentHistory, userMsg];
    setAgentHistory(newHistory);
    setAgentInput("");
    setAgentLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          receipts,
          history: agentHistory.map((m) => ({ role: m.role, content: m.content })),
          proMode: agentProMode,
        }),
      });
      const data = await res.json();
      const answer = data.answer ?? "I couldn't process that.";
      setAgentHistory([...newHistory, { role: "assistant", content: answer }]);
      if (data.action) applyAgentAction(data.action as AgentAction);
    } catch {
      setAgentHistory([...newHistory, { role: "assistant", content: "Something went wrong. Try again." }]);
    } finally {
      setAgentLoading(false);
      setTimeout(() => agentInputRef.current?.focus(), 50);
    }
  }

  const baseFiltered = receipts.filter((r) => {
    if (filters.search && !r.vendor.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.category && r.category !== filters.category) return false;
    if (filters.dateFrom && r.date < filters.dateFrom) return false;
    if (filters.dateTo && r.date > filters.dateTo) return false;
    return true;
  });

  // If agent highlighted specific ids, show only those (within other filters)
  const highlightFiltered = highlightIds.size > 0
    ? baseFiltered.filter((r) => highlightIds.has(r.id))
    : baseFiltered;

  const filtered = [...highlightFiltered].sort((a, b) => {
    if (!sortBy) return 0;
    if (sortBy === "subscription") {
      const aV = a.recurring ? 1 : 0;
      const bV = b.recurring ? 1 : 0;
      return sortOrder === "asc" ? aV - bV : bV - aV;
    }
    if (sortBy === "total") {
      const na = parseFloat(a.total.replace(/[^0-9.]/g, "")) || 0;
      const nb = parseFloat(b.total.replace(/[^0-9.]/g, "")) || 0;
      return sortOrder === "asc" ? na - nb : nb - na;
    }
    let va = "", vb = "";
    if (sortBy === "date")     { va = a.date;     vb = b.date; }
    if (sortBy === "vendor")   { va = a.vendor;   vb = b.vendor; }
    if (sortBy === "category") { va = a.category; vb = b.category; }
    return sortOrder === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const selected = selectedId ? receipts.find((r) => r.id === selectedId) ?? null : null;

  // ── Export (all filtered) ──────────────────────────────────────────────────
  function exportExcel() {
    const rows = filtered.map((r) => ({
      Date:               r.date,
      Vendor:             r.vendor,
      Subtotal:           r.subtotal,
      Tax:                r.tax,
      Total:              r.total,
      Category:           r.category,
      "Business Purpose": r.business_purpose,
      Notes:              r.notes,
      "Shareholder Loan": r.shareholder_loan ? "Yes" : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Receipts");
    XLSX.writeFile(wb, "receipts.xlsx");
  }

  // ── Multi-select helpers ───────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectedIds(new Set());
  }

  function selectAll() {
    setSelectedIds(new Set(filtered.map((r) => r.id)));
  }

  function deleteSelected() {
    const count = selectedIds.size;
    if (!window.confirm(`Delete ${count} receipt${count !== 1 ? "s" : ""}?`)) return;
    selectedIds.forEach((id) => deleteSaved(id));
    setReceipts(getSaved());
    exitSelectMode();
  }

  function exportSelected() {
    const toExport = receipts.filter((r) => selectedIds.has(r.id));
    const rows = toExport.map((r) => ({
      Date:               r.date,
      Vendor:             r.vendor,
      Subtotal:           r.subtotal,
      Tax:                r.tax,
      Total:              r.total,
      Category:           r.category,
      "Business Purpose": r.business_purpose,
      Notes:              r.notes,
      "Shareholder Loan": r.shareholder_loan ? "Yes" : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Receipts");
    XLSX.writeFile(wb, "receipts-selected.xlsx");
  }

  function recategorizeSelected(category: string) {
    const all = getSaved();
    const updated = all.map((r) =>
      selectedIds.has(r.id) ? { ...r, category } : r
    );
    localStorage.setItem("savedReceipts", JSON.stringify(updated));
    setReceipts(getSaved());
    exitSelectMode();
  }

  function toggleShareholderLoanSelected(value: boolean) {
    const all = getSaved();
    const updated = all.map((r) =>
      selectedIds.has(r.id) ? { ...r, shareholder_loan: value } : r
    );
    localStorage.setItem("savedReceipts", JSON.stringify(updated));
    setReceipts(getSaved());
    exitSelectMode();
  }

  // Determine current shareholder loan state of selected items
  const selectedReceipts = receipts.filter((r) => selectedIds.has(r.id));
  const allSelectedHaveLoan = selectedReceipts.length > 0 && selectedReceipts.every((r) => r.shareholder_loan);

  // ── Duplicate detection ───────────────────────────────────────────────────
  const allDupPairs: DupPair[] = [];
  for (let i = 0; i < receipts.length; i++) {
    for (let j = i + 1; j < receipts.length; j++) {
      const a = receipts[i], b = receipts[j];
      if (!a.vendor || !b.vendor || !a.total || !b.total) continue;
      if (a.vendor.toLowerCase() !== b.vendor.toLowerCase()) continue;
      if (a.total !== b.total) continue;
      const diff = Math.abs(new Date(a.date || "").getTime() - new Date(b.date || "").getTime());
      if (diff <= 31 * 24 * 60 * 60 * 1000) {
        const [sid1, sid2] = [a.id, b.id].sort();
        allDupPairs.push({ key: `dup::${sid1}::${sid2}`, idA: a.id, idB: b.id, vendor: a.vendor, total: a.total, dateA: a.date, dateB: b.date });
      }
    }
  }
  const activeDupPairs = allDupPairs.filter((p) => !dismissedKeys.has(p.key));
  const duplicateIds = new Set(activeDupPairs.flatMap((p) => [p.idA, p.idB]));
  // Map receipt ID → { tooltip text, pair key } for inline warning icons
  const dupInfo = new Map<string, { tooltip: string; pairKey: string }>();
  activeDupPairs.forEach((p) => {
    const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "?";
    if (!dupInfo.has(p.idA)) dupInfo.set(p.idA, { tooltip: `Same charge on ${fmtDate(p.dateB)}`, pairKey: p.key });
    if (!dupInfo.has(p.idB)) dupInfo.set(p.idB, { tooltip: `Same charge on ${fmtDate(p.dateA)}`, pairKey: p.key });
  });

  // ── Subscription due detection ────────────────────────────────────────────
  const today = new Date();
  const allDueSubs: Array<{ vendor: string; interval: string; daysSince: number; key: string }> = [];
  const seenVendors = new Set<string>();
  const recurringReceipts = receipts.filter((r) => r.recurring && r.recurringInterval);
  const vendorGroups = new Map<string, SavedReceipt[]>();
  recurringReceipts.forEach((r) => {
    const vk = `${r.vendor.toLowerCase()}::${r.recurringInterval}`;
    if (!vendorGroups.has(vk)) vendorGroups.set(vk, []);
    vendorGroups.get(vk)!.push(r);
  });
  vendorGroups.forEach((group, vk) => {
    const latest = group.sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest.date) return;
    const daysSince = Math.floor((today.getTime() - new Date(latest.date).getTime()) / (24 * 60 * 60 * 1000));
    const threshold = parseIntervalDays(latest.recurringInterval) || 30;
    const subKey = `sub::${vk}`;
    if (daysSince >= threshold && !seenVendors.has(vk)) {
      seenVendors.add(vk);
      allDueSubs.push({ vendor: latest.vendor, interval: latest.recurringInterval!, daysSince, key: subKey });
    }
  });

  // ── Subscription auto-detection ───────────────────────────────────────────
  const SUB_KEYWORDS = [
    "netflix", "spotify", "apple", "disney", "hulu", "amazon prime", "youtube",
    "dropbox", "google one", "microsoft", "office 365", "adobe", "figma", "notion",
    "slack", "zoom", "github", "aws", "digitalocean", "vercel", "netlify", "shopify",
    "quickbooks", "openai", "anthropic", "cloudflare", "1password", "lastpass",
    "mcafee", "norton", "dashlane", "vpn", "antivirus", "domain", "hosting",
  ];
  const suggestedSubIds = new Set(
    receipts
      .filter((r) => !r.recurring)
      .filter((r) => SUB_KEYWORDS.some((kw) => r.vendor.toLowerCase().includes(kw)))
      .map((r) => r.id)
  );
  // Also suggest repeated-same-total vendors (2+ receipts, same total)
  const totalByVendor = new Map<string, SavedReceipt[]>();
  receipts.filter((r) => !r.recurring && r.vendor && r.total).forEach((r) => {
    const k = `${r.vendor.toLowerCase()}::${r.total}`;
    if (!totalByVendor.has(k)) totalByVendor.set(k, []);
    totalByVendor.get(k)!.push(r);
  });
  totalByVendor.forEach((group) => {
    if (group.length >= 2) group.forEach((r) => suggestedSubIds.add(r.id));
  });
  const activeDueSubs    = notifSettings.subs       ? allDueSubs.filter((s) => !dismissedKeys.has(s.key))     : [];
  const visibleDupPairs  = notifSettings.dups       ? activeDupPairs                                           : [];
  const visibleDupIds    = notifSettings.dups       ? duplicateIds                                             : new Set<string>();
  const visibleDupInfo   = notifSettings.dups       ? dupInfo                                                  : new Map<string, { tooltip: string; pairKey: string }>();

  const totalNotifCount = visibleDupPairs.length + activeDueSubs.length;

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  };

  const editInputStyle: React.CSSProperties = {
    backgroundColor: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  };

  return (
    <main
      className="min-h-screen px-4 py-8"
      style={{ backgroundColor: "var(--bg-base)", paddingBottom: selectedIds.size > 0 ? "96px" : undefined }}
      onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; swipeStartY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - swipeStartX.current;
        const dy = e.changedTouches[0].clientY - swipeStartY.current;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dx > 0) router.push("/");
      }}
    >
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
              {selectMode ? (
                <span className="text-xl">{selectedIds.size} selected</span>
              ) : (
                <>
                  Records
                  {receipts.length > 0 && (
                    <span className="ml-2 text-base font-normal" style={{ color: "var(--text-secondary)" }}>
                      {receipts.length}
                    </span>
                  )}
                </>
              )}
            </h1>
            {!selectMode && <PageHelp content={PAGE_HELP.receipts} />}
          </div>

          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <button onClick={exitSelectMode} className="text-sm font-medium px-3 py-1.5 rounded-lg"
                  style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  Unselect All
                </button>
                <button onClick={selectAll} className="text-sm font-medium px-3 py-1.5 rounded-lg"
                  style={{ color: "var(--accent-blue)", backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  Select All
                </button>
              </>
            ) : (
              <>
                {/* Notification bell */}
                <div className="relative">
                  <button
                    onClick={() => setNotifOpen((o) => !o)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg"
                    style={{ backgroundColor: notifOpen ? "var(--bg-elevated)" : "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", position: "relative" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    {totalNotifCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white"
                        style={{ backgroundColor: "#ef4444", fontSize: 9, fontWeight: 700, lineHeight: 1 }}>
                        {totalNotifCount > 9 ? "9+" : totalNotifCount}
                      </span>
                    )}
                  </button>

                  {/* Notification panel */}
                  {notifOpen && (
                    <>
                      {/* Backdrop */}
                      <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                      <div
                        className="absolute right-0 z-50 w-80 rounded-xl overflow-hidden"
                        style={{ top: "calc(100% + 8px)", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
                      >
                        <div className="flex items-center justify-between px-4 py-3"
                          style={{ borderBottom: "1px solid var(--border)" }}>
                          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Notifications</span>
                          {totalNotifCount === 0 && (
                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>All clear</span>
                          )}
                        </div>

                        <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
                          {totalNotifCount === 0 ? (
                            <div className="px-4 py-8 text-center">
                              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No notifications</p>
                            </div>
                          ) : (
                            <>
                              {/* Subscription reminders */}
                              {activeDueSubs.length > 0 && (
                                <div>
                                  <p className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wider"
                                    style={{ color: "var(--text-secondary)" }}>SUBSCRIPTIONS DUE</p>
                                  {activeDueSubs.map((sub) => (
                                    <div key={sub.key}
                                      className="flex items-start gap-3 px-4 py-3"
                                      style={{ borderBottom: "1px solid var(--border)" }}>
                                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                                        style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                          strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-amber)" }}>
                                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                                        </svg>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{sub.vendor}</p>
                                        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                          {intervalLabel(sub.interval)} — {sub.daysSince} days since last upload
                                        </p>
                                        <button onClick={() => { setFilter("search", sub.vendor); setNotifOpen(false); }}
                                          className="text-xs mt-1.5"
                                          style={{ color: "var(--accent-blue)" }}>
                                          View receipts →
                                        </button>
                                      </div>
                                      <button onClick={() => handleDismiss(sub.key)}
                                        className="w-6 h-6 flex items-center justify-center rounded-md text-base leading-none flex-shrink-0"
                                        style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)" }}>
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Duplicate warnings */}
                              {visibleDupPairs.length > 0 && (
                                <div>
                                  <p className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wider"
                                    style={{ color: "var(--text-secondary)" }}>POSSIBLE DUPLICATES</p>
                                  {visibleDupPairs.map((pair) => {
                                    const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "?";
                                    return (
                                      <div key={pair.key}
                                        className="flex items-start gap-3 px-4 py-3"
                                        style={{ borderBottom: "1px solid var(--border)" }}>
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                                          style={{ backgroundColor: "rgba(251,191,36,0.12)" }}>
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2"
                                            strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                          </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{pair.vendor}</p>
                                          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                            {pair.total} · {fmtDate(pair.dateA)} and {fmtDate(pair.dateB)}
                                          </p>
                                        </div>
                                        <button onClick={() => handleDismiss(pair.key)}
                                          className="w-6 h-6 flex items-center justify-center rounded-md text-base leading-none flex-shrink-0"
                                          style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)" }}>
                                          ×
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {receipts.length > 0 && (
                  <button
                    onClick={() => { setAgentOpen(true); setTimeout(() => agentInputRef.current?.focus(), 80); }}
                    className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
                    style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                  >
                    ✦ Ask AI
                  </button>
                )}
                {receipts.length > 0 && (
                  <button
                    onClick={exportExcel}
                    className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
                    style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Export
                  </button>
                )}
                <Link
                  href="/import"
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}
                >
                  + Upload
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Subscription due reminders */}
        {activeDueSubs.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {activeDueSubs.map((sub) => (
              <div key={sub.key}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm"
                style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-amber)", flexShrink: 0 }}>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span className="truncate" style={{ color: "var(--accent-amber)" }}>
                    <strong>{sub.vendor}</strong> — {intervalLabel(sub.interval)}, {sub.daysSince}d overdue
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => setFilter("search", sub.vendor)}
                    className="text-xs px-2.5 py-1 rounded-lg"
                    style={{ backgroundColor: "rgba(245,158,11,0.15)", color: "var(--accent-amber)" }}>
                    View
                  </button>
                  <button onClick={() => handleDismiss(sub.key)}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-base leading-none"
                    style={{ color: "var(--accent-amber)", backgroundColor: "rgba(245,158,11,0.1)" }}>
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {receipts.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-xl py-24 text-center"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-elevated)" }}>
              <DocIcon />
            </div>
            <div>
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>No receipts yet</p>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                Upload your first receipt to get started.
              </p>
            </div>
            <Link href="/import" className="px-5 py-2 rounded-lg text-sm font-medium mt-2"
              style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>
              Upload a Receipt
            </Link>
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <SummaryBar receipts={filtered} />

            {/* Filter bar + view toggle */}
            <div
              className="flex flex-wrap gap-3 mb-4 p-4 rounded-xl"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
            >
              <input
                type="text"
                placeholder="Search vendor…"
                value={filters.search}
                onChange={(e) => setFilter("search", e.target.value)}
                className="flex-1 min-w-40 px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
              <select
                value={filters.category}
                onChange={(e) => setFilter("category", e.target.value)}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{ ...inputStyle, color: filters.category ? "var(--text-primary)" : "var(--text-secondary)" }}
              >
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input type="date" value={filters.dateFrom}
                onChange={(e) => setFilter("dateFrom", e.target.value)}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{ ...inputStyle, color: filters.dateFrom ? "var(--text-primary)" : "var(--text-secondary)" }}
              />
              <input type="date" value={filters.dateTo}
                onChange={(e) => setFilter("dateTo", e.target.value)}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{ ...inputStyle, color: filters.dateTo ? "var(--text-primary)" : "var(--text-secondary)" }}
              />
              {(filters.search || filters.category || filters.dateFrom || filters.dateTo) && (
                <button onClick={() => setFilters(EMPTY_FILTERS)}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)" }}>
                  Clear
                </button>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* View toggle */}
              <div
                className="flex items-center rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--border)", backgroundColor: "var(--bg-elevated)" }}
              >
                {(["list", "medium", "large"] as ViewMode[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => changeView(v)}
                    className="px-2.5 py-2 flex items-center justify-center transition-colors"
                    title={v.charAt(0).toUpperCase() + v.slice(1)}
                    style={{
                      backgroundColor: view === v ? "var(--accent-blue)" : "transparent",
                      borderRight: v !== "large" ? "1px solid var(--border)" : undefined,
                    }}
                  >
                    {v === "list"   && <ListViewIcon   active={view === v} />}
                    {v === "medium" && <MediumViewIcon active={view === v} />}
                    {v === "large"  && <LargeViewIcon  active={view === v} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort controls */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Sort:</span>
              {(["date", "vendor", "total", "category", "subscription"] as SortBy[]).map((s) => (
                <button key={s} onClick={() => { if (sortBy === s) setSortOrder(o => o === "asc" ? "desc" : "asc"); else { setSortBy(s); setSortOrder(s === "date" || s === "total" || s === "subscription" ? "desc" : "asc"); } }}
                  className="text-xs px-2.5 py-1 rounded-lg"
                  style={{ backgroundColor: sortBy === s ? "var(--accent-blue)" : "var(--bg-elevated)", color: sortBy === s ? "#fff" : "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  {s === "date" ? "Date" : s === "vendor" ? "A–Z" : s === "total" ? "Amount" : s === "category" ? "Category" : "⟳ Subscription"}
                  {sortBy === s && (sortOrder === "asc" ? " ↑" : " ↓")}
                </button>
              ))}
              {sortBy && <button onClick={() => { setSortBy(null); setSortOrder("desc"); }} className="text-xs px-2 py-1 rounded-lg" style={{ color: "var(--text-secondary)" }}>✕</button>}
            </div>

            {/* Results count */}
            {(filters.search || filters.category || filters.dateFrom || filters.dateTo) && (
              <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </p>
            )}

            {/* Incomplete entries banner */}
            {notifSettings.incomplete && (() => {
              const incompleteIds = receipts.filter((r) => !r.vendor && !r.total && !r.date).map((r) => r.id);
              if (incompleteIds.length === 0) return null;
              return (
                <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm"
                  style={{ backgroundColor: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <span style={{ color: "#f87171" }}>
                    <strong>{incompleteIds.length}</strong> blank receipt{incompleteIds.length !== 1 ? "s" : ""} with no data
                  </span>
                  <button
                    onClick={() => {
                      if (!window.confirm(`Delete ${incompleteIds.length} blank receipt${incompleteIds.length !== 1 ? "s" : ""}?`)) return;
                      incompleteIds.forEach((id) => deleteSaved(id));
                      setReceipts(getSaved());
                    }}
                    className="text-xs px-2.5 py-1 rounded-lg font-medium flex-shrink-0"
                    style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#f87171" }}>
                    Delete All
                  </button>
                </div>
              );
            })()}

            {filtered.length === 0 ? (
              <p className="text-center py-16 text-sm" style={{ color: "var(--text-secondary)" }}>
                No receipts match your filters.
              </p>
            ) : view === "list" ? (
              <ListGrid
                receipts={filtered}
                onSelect={(id) => { if (!selectMode) setSelectedId(id); }}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggle={toggleSelect}
                duplicateIds={visibleDupIds}
                dupInfo={visibleDupInfo}
                onDismissDup={handleDismiss}
                suggestedSubIds={suggestedSubIds}
                onMarkSub={(id) => { updateSaved(id, { recurring: true, recurringInterval: "1m" }); setReceipts(getSaved()); }}
              />
            ) : (
              <CardGrid
                receipts={filtered}
                onSelect={(id) => { if (!selectMode) setSelectedId(id); }}
                onZoom={(src) => setFullscreenImg(src)}
                view={view}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggle={toggleSelect}
                duplicateIds={visibleDupIds}
                dupInfo={visibleDupInfo}
                onDismissDup={handleDismiss}
                suggestedSubIds={suggestedSubIds}
                onMarkSub={(id) => { updateSaved(id, { recurring: true, recurringInterval: "1m" }); setReceipts(getSaved()); }}
              />
            )}
          </>
        )}
      </div>

      {/* Detail / Edit modal — only in non-select mode */}
      {selected && !selectMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setSelectedId(null); setIsEditing(false); } }}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--border)" }}>
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {isEditing ? "Edit Receipt" : (selected.vendor || "Receipt")}
              </p>
              <button
                onClick={() => { setSelectedId(null); setIsEditing(false); }}
                className="w-7 h-7 flex items-center justify-center rounded-md text-lg leading-none"
                style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)" }}
              >
                ×
              </button>
            </div>

            {/* Thumbnail — only in view mode */}
            {!isEditing && selected.thumbnail.startsWith("data:") && (
              <div
                className="flex items-center justify-center p-4 group/thumb relative cursor-zoom-in"
                style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-elevated)" }}
                onClick={() => setFullscreenImg(selected.thumbnail)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.thumbnail} alt="Receipt" className="max-w-full rounded-lg"
                  style={{ maxHeight: "300px", objectFit: "contain" }} />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity rounded-b"
                  style={{ backgroundColor: "rgba(0,0,0,0.25)" }}>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff", backdropFilter: "blur(8px)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                    </svg>
                    Full screen
                  </div>
                </div>
              </div>
            )}

            {/* VIEW mode */}
            {!isEditing && (
              <div className="px-5 py-4 flex flex-col gap-3">
                {duplicateIds.has(selected.id) && (() => {
                  const info = dupInfo.get(selected.id);
                  return (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs"
                      style={{ backgroundColor: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24" }}>
                      <div className="flex items-center gap-2">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                          strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <span>{info?.tooltip ?? "Possible duplicate — same vendor and total within 31 days"}</span>
                      </div>
                      <button
                        onClick={() => info && handleDismiss(info.pairKey)}
                        className="flex-shrink-0 text-xs px-2 py-0.5 rounded-md font-medium"
                        style={{ backgroundColor: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}
                      >
                        Not a duplicate
                      </button>
                    </div>
                  );
                })()}
                <Row label="Date"             value={selected.date} />
                <Row label="Vendor"           value={selected.vendor} />
                <Row label="Subtotal"         value={selected.subtotal} />
                <Row label="Tax"              value={selected.tax} />
                <Row label="Total"            value={selected.total} />
                {selected.category && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Category</span>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: categoryStyle(selected.category).bg, color: categoryStyle(selected.category).text }}>
                      {selected.category}
                    </span>
                  </div>
                )}
                <Row label="Business Purpose" value={selected.business_purpose} />
                {selected.notes && <Row label="Notes" value={selected.notes} />}
                {selected.shareholder_loan && (
                  <div className="text-xs px-3 py-2 rounded-lg"
                    style={{ backgroundColor: "rgba(245,158,11,0.1)", color: "var(--accent-amber)" }}>
                    Shareholder Loan
                  </div>
                )}
                {selected.recurring && (
                  <div className="text-xs px-3 py-2 rounded-lg"
                    style={{ backgroundColor: "rgba(16,185,129,0.1)", color: "var(--accent-green)" }}>
                    Recurring — {selected.recurringInterval}
                  </div>
                )}
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Saved {new Date(selected.savedAt).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}
                </p>
              </div>
            )}

            {/* EDIT mode */}
            {isEditing && (
              <div className="px-5 py-4 flex flex-col gap-4">
                <EditField label="Vendor">
                  <input type="text" value={editForm.vendor}
                    onChange={(e) => setEditForm(f => ({ ...f, vendor: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={editInputStyle} />
                </EditField>
                <EditField label="Date">
                  <input type="date" value={editForm.date}
                    onChange={(e) => setEditForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={editInputStyle} />
                </EditField>
                <div className="grid grid-cols-3 gap-3">
                  <EditField label="Subtotal">
                    <input type="text" value={editForm.subtotal} placeholder="$0.00"
                      onChange={(e) => setEditForm(f => ({ ...f, subtotal: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={editInputStyle} />
                  </EditField>
                  <EditField label="Tax">
                    <input type="text" value={editForm.tax} placeholder="$0.00"
                      onChange={(e) => setEditForm(f => ({ ...f, tax: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={editInputStyle} />
                  </EditField>
                  <EditField label="Total">
                    <input type="text" value={editForm.total} placeholder="$0.00"
                      onChange={(e) => setEditForm(f => ({ ...f, total: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={editInputStyle} />
                  </EditField>
                </div>
                <EditField label="Category">
                  <select value={editForm.category}
                    onChange={(e) => setEditForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ ...editInputStyle, color: editForm.category ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    <option value="">Select category</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </EditField>
                <EditField label="Business Purpose">
                  <input type="text" value={editForm.business_purpose}
                    onChange={(e) => setEditForm(f => ({ ...f, business_purpose: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={editInputStyle} />
                </EditField>
                <EditField label="Notes">
                  <textarea value={editForm.notes}
                    onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2} className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={editInputStyle} />
                </EditField>
                {/* Shareholder Loan toggle */}
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-lg pressable"
                  style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                  onClick={() => setEditForm(f => ({ ...f, shareholder_loan: !f.shareholder_loan }))}
                >
                  <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: editForm.shareholder_loan ? "var(--accent-blue)" : "transparent",
                      border: `1.5px solid ${editForm.shareholder_loan ? "var(--accent-blue)" : "var(--border)"}` }}>
                    {editForm.shareholder_loan && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>Shareholder Loan</span>
                </div>
                {/* Recurring toggle */}
                <div>
                  <div
                    className="flex items-center gap-3 px-4 py-3 rounded-lg pressable"
                    style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                    onClick={() => setEditForm(f => ({ ...f, recurring: !f.recurring, recurringInterval: f.recurring ? "" : f.recurringInterval }))}
                  >
                    <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: editForm.recurring ? "var(--accent-green)" : "transparent",
                        border: `1.5px solid ${editForm.recurring ? "var(--accent-green)" : "var(--border)"}` }}>
                      {editForm.recurring && (
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>Recurring / Subscription</span>
                  </div>
                  {editForm.recurring && (
                    <IntervalPicker
                      value={editForm.recurringInterval || "1m"}
                      onChange={(v) => setEditForm(f => ({ ...f, recurringInterval: v }))}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-4 flex justify-between"
              style={{ borderTop: "1px solid var(--border)" }}>
              {isEditing ? (
                <>
                  <button onClick={() => setIsEditing(false)}
                    className="text-sm px-3 py-1.5 rounded-lg"
                    style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                    Cancel
                  </button>
                  <button onClick={() => saveEdits(selected.id)}
                    className="text-sm px-5 py-1.5 rounded-lg font-medium"
                    style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>
                    Save Changes
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => handleDelete(selected.id)}
                    className="text-sm px-3 py-1.5 rounded-lg"
                    style={{ color: "#f87171", backgroundColor: "rgba(248,113,113,0.1)" }}>
                    Delete
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEditing(selected)}
                      className="text-sm px-4 py-1.5 rounded-lg font-medium"
                      style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                      Edit
                    </button>
                    <button onClick={() => setSelectedId(null)}
                      className="text-sm px-4 py-1.5 rounded-lg"
                      style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)" }}>
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating action bar — visible when items are selected */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 gap-3 flex-wrap"
          style={{
            backgroundColor: "var(--bg-elevated)",
            borderTop: "1px solid var(--border)",
          }}
        >
          {/* Left: count */}
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {selectedIds.size} selected
          </span>

          {/* Right: actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Export */}
            <button
              onClick={exportSelected}
              className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5"
              style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export
            </button>

            {/* Category dropdown */}
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  recategorizeSelected(e.target.value);
                  e.target.value = "";
                }
              }}
              className="px-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              <option value="" disabled>Change category…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Shareholder Loan toggle */}
            <button
              onClick={() => toggleShareholderLoanSelected(!allSelectedHaveLoan)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: allSelectedHaveLoan ? "rgba(245,158,11,0.15)" : "var(--bg-surface)",
                color: allSelectedHaveLoan ? "var(--accent-amber)" : "var(--text-secondary)",
                border: `1px solid ${allSelectedHaveLoan ? "var(--accent-amber)" : "var(--border)"}`,
              }}
            >
              {allSelectedHaveLoan ? "Remove Shareholder Loan" : "Shareholder Loan"}
            </button>

            {/* Delete */}
            <button
              onClick={deleteSelected}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ backgroundColor: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {/* Fullscreen image viewer */}
      {fullscreenImg && (
        <ImageLightbox src={fullscreenImg} onClose={() => setFullscreenImg(null)} />
      )}

      {/* Agent panel */}
      {agentOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setAgentOpen(false); }}>
          <div className="w-full max-w-2xl mx-auto rounded-t-2xl flex flex-col"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", maxHeight: "70vh" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <span style={{ color: "var(--accent-blue)", fontSize: 16 }}>✦</span>
                <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>AI Assistant</span>
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                  {receipts.length} receipts
                </span>
                {agentProMode && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "var(--accent-blue)", border: "1px solid rgba(59,130,246,0.3)" }}>
                    Pro
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {agentHistory.length > 0 && (
                  <button onClick={() => { setAgentHistory([]); applyAgentAction({ type: "clear" }); }}
                    className="text-xs px-2 py-1 rounded-lg"
                    style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)" }}>
                    Reset
                  </button>
                )}
                <button onClick={() => setAgentOpen(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-md"
                  style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)" }}>
                  ×
                </button>
              </div>
            </div>

            {/* Conversation */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-0">
              {agentHistory.length === 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {agentProMode
                      ? "Pro mode: I can read and edit your receipts. Try:"
                      : "Ask me anything about your receipts. For example:"}
                  </p>
                  {(agentProMode ? [
                    "Change the category of the last receipt to Office Expenses",
                    "Fix all motor vehicle receipts to use the correct subcategory",
                    "Delete all receipts under $5",
                    "How much did I spend on meals this year?",
                    "Sort by total, highest first",
                  ] : [
                    "How much did I spend on meals this year?",
                    "Show me all Anthropic receipts",
                    "Sort by total, highest first",
                    "Filter receipts from last month",
                    "What's my total HST paid?",
                  ]).map((s) => (
                    <button key={s} onClick={() => askAgent(s)}
                      className="text-left text-xs px-3 py-2 rounded-lg"
                      style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {agentHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[85%] px-4 py-2.5 rounded-2xl text-sm"
                    style={{
                      backgroundColor: msg.role === "user" ? "var(--accent-blue)" : "var(--bg-elevated)",
                      color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                      borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {agentLoading && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl flex items-center gap-1.5"
                    style={{ backgroundColor: "var(--bg-elevated)", borderRadius: "18px 18px 18px 4px" }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{ backgroundColor: "var(--text-secondary)", animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-4 py-4 flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
              <form onSubmit={(e) => { e.preventDefault(); askAgent(agentInput); }}
                className="flex items-center gap-2">
                <input
                  ref={agentInputRef}
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  placeholder={agentProMode ? "Ask or tell me what to change…" : "Ask about your receipts…"}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  disabled={agentLoading}
                />
                <button type="submit" disabled={!agentInput.trim() || agentLoading}
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: agentInput.trim() && !agentLoading ? "var(--accent-blue)" : "var(--bg-elevated)",
                    color: agentInput.trim() && !agentLoading ? "#fff" : "var(--text-secondary)",
                  }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ── List view ──────────────────────────────────────────────────────────────────

function ListGrid({
  receipts,
  onSelect,
  selectMode,
  selectedIds,
  onToggle,
  duplicateIds,
  dupInfo,
  onDismissDup,
  suggestedSubIds,
  onMarkSub,
}: {
  receipts: SavedReceipt[];
  onSelect: (id: string) => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  duplicateIds: Set<string>;
  dupInfo: Map<string, { tooltip: string; pairKey: string }>;
  onDismissDup: (key: string) => void;
  suggestedSubIds: Set<string>;
  onMarkSub: (id: string) => void;
}) {
  const colTemplate = "32px 36px 1fr 100px minmax(120px,200px) 70px";

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      {/* Header row */}
      <div
        className="grid text-xs font-medium px-3 py-2"
        style={{
          gridTemplateColumns: colTemplate,
          gap: "12px",
          backgroundColor: "var(--bg-elevated)",
          color: "var(--text-secondary)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span />
        <span />
        <span>Vendor</span>
        <span>Date</span>
        <span>Category</span>
        <span className="text-right">Total</span>
      </div>

      {receipts.map((r, i) => {
        const cs = categoryStyle(r.category);
        const hasThumbnail = r.thumbnail.startsWith("data:");
        const isSelected = selectedIds.has(r.id);
        return (
          <div
            key={r.id}
            onClick={() => selectMode ? onToggle(r.id) : onSelect(r.id)}
            className="grid items-center px-3 py-2 pressable"
            style={{
              gridTemplateColumns: colTemplate,
              gap: "12px",
              backgroundColor: isSelected
                ? "rgba(59,130,246,0.08)"
                : i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-base)",
              borderBottom: i < receipts.length - 1 ? "1px solid var(--border)" : undefined,
              cursor: "pointer",
            }}
          >
            {/* Checkbox — always visible */}
            <div className="flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); onToggle(r.id); }}>
              <div style={{
                width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0,
                border: isSelected ? "none" : "2px solid var(--border)",
                backgroundColor: isSelected ? "var(--accent-blue)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {isSelected && (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>

            {/* Tiny thumbnail */}
            <div className="w-9 h-9 rounded-md overflow-hidden flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "var(--bg-elevated)" }}>
              {hasThumbnail
                ? <img src={r.thumbnail} alt="" className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                : <DocIcon size={16} />}
            </div>

            {/* Vendor */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                  {r.vendor || "Unknown vendor"}
                </p>
                {duplicateIds.has(r.id) && (() => {
                  const info = dupInfo.get(r.id);
                  return (
                    <div className="relative group/dup flex-shrink-0" style={{ cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); if (info) onDismissDup(info.pairKey); }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      {/* Tooltip */}
                      <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 z-50 hidden group-hover/dup:block"
                        style={{ transform: "translateX(-50%)" }}>
                        <div className="rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap"
                          style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}>
                          {info?.tooltip ?? "Possible duplicate"}
                          <div style={{ color: "var(--text-secondary)", fontSize: 10, marginTop: 1 }}>Click to dismiss</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              {r.shareholder_loan && (
                <span className="text-xs" style={{ color: "var(--accent-amber)" }}>Shareholder Loan</span>
              )}
              {suggestedSubIds.has(r.id) && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkSub(r.id); }}
                  className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                  style={{ backgroundColor: "rgba(16,185,129,0.12)", color: "var(--accent-green)", border: "1px solid rgba(16,185,129,0.25)" }}
                >
                  ⟳ Mark subscription?
                </button>
              )}
              <p className="text-xs" style={{ color: "var(--text-tertiary)", marginTop: 1 }}>
                Uploaded {fmtUploaded(r.savedAt)}
              </p>
            </div>

            {/* Date */}
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{r.date || "—"}</p>

            {/* Category pill */}
            {r.category
              ? <span className="text-xs px-2 py-0.5 rounded-full truncate"
                  style={{ backgroundColor: cs.bg, color: cs.text, maxWidth: "fit-content" }}>
                  {r.category}
                </span>
              : <span />}

            {/* Total */}
            <p className="text-sm font-medium text-right" style={{ color: "var(--text-primary)" }}>
              {r.total || "—"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Card grid (medium + large) ─────────────────────────────────────────────────

function CardGrid({
  receipts,
  onSelect,
  onZoom,
  view,
  selectMode,
  selectedIds,
  onToggle,
  duplicateIds,
  dupInfo,
  onDismissDup,
  suggestedSubIds,
  onMarkSub,
}: {
  receipts: SavedReceipt[];
  onSelect: (id: string) => void;
  onZoom: (src: string) => void;
  view: "medium" | "large";
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  duplicateIds: Set<string>;
  dupInfo: Map<string, { tooltip: string; pairKey: string }>;
  onDismissDup: (key: string) => void;
  suggestedSubIds: Set<string>;
  onMarkSub: (id: string) => void;
}) {
  const isLarge = view === "large";
  const thumbHeight = isLarge ? 140 : 90;
  const minCardWidth = isLarge ? 260 : 160;

  return (
    <div className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minCardWidth}px, 1fr))` }}>
      {receipts.map((r) => {
        const cs = categoryStyle(r.category);
        const hasThumbnail = r.thumbnail.startsWith("data:");
        const isSelected = selectedIds.has(r.id);
        return (
          <div
            key={r.id}
            onClick={() => selectMode ? onToggle(r.id) : onSelect(r.id)}
            className="rounded-xl overflow-hidden pressable"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: isSelected ? "2px solid var(--accent-blue)" : "1px solid var(--border)",
              cursor: "pointer",
              position: "relative",
            }}
          >
            {/* Thumbnail */}
            <div className="flex items-center justify-center group/card-thumb"
              style={{
                height: `${thumbHeight}px`,
                backgroundColor: "var(--bg-elevated)",
                borderBottom: "1px solid var(--border)",
                position: "relative",
              }}
            >
              {hasThumbnail
                ? <img src={r.thumbnail} alt={r.vendor} className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                : <DocIcon size={isLarge ? 32 : 22} />}

              {/* Zoom button — shows on hover when there's an image */}
              {hasThumbnail && (
                <button
                  onClick={(e) => { e.stopPropagation(); onZoom(r.thumbnail); }}
                  className="absolute opacity-0 group-hover/card-thumb:opacity-100 transition-opacity flex items-center justify-center rounded-full"
                  style={{
                    top: "8px", right: "8px", zIndex: 10,
                    width: "26px", height: "26px",
                    backgroundColor: "rgba(0,0,0,0.5)", color: "#fff",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                  </svg>
                </button>
              )}

              {/* Checkbox overlay — always visible */}
              <div
                onClick={(e) => { e.stopPropagation(); onToggle(r.id); }}
                style={{
                  position: "absolute", top: "8px", left: "8px",
                  width: "22px", height: "22px", borderRadius: "50%", zIndex: 10,
                  border: isSelected ? "none" : "2px solid rgba(255,255,255,0.8)",
                  backgroundColor: isSelected ? "var(--accent-blue)" : "rgba(0,0,0,0.35)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                {isSelected && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>

            {/* Info */}
            <div className={isLarge ? "px-4 py-3" : "px-3 py-2"}>
              <div className="flex items-start justify-between gap-1">
                <div className="flex items-center gap-1 min-w-0">
                  <p className={`font-medium truncate ${isLarge ? "text-sm" : "text-xs"}`}
                    style={{ color: "var(--text-primary)" }}>
                    {r.vendor || "Unknown vendor"}
                  </p>
                  {duplicateIds.has(r.id) && (() => {
                    const info = dupInfo.get(r.id);
                    return (
                      <div className="relative group/dup flex-shrink-0" style={{ cursor: "pointer" }}
                        onClick={(e) => { e.stopPropagation(); if (info) onDismissDup(info.pairKey); }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2"
                          strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 z-50 hidden group-hover/dup:block"
                          style={{ transform: "translateX(-50%)" }}>
                          <div className="rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap"
                            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}>
                            {info?.tooltip ?? "Possible duplicate"}
                            <div style={{ color: "var(--text-secondary)", fontSize: 10, marginTop: 1 }}>Click to dismiss</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <p className={`font-semibold flex-shrink-0 ${isLarge ? "text-sm" : "text-xs"}`}
                  style={{ color: "var(--text-primary)" }}>
                  {r.total || "—"}
                </p>
              </div>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {r.date || "No date"}
              </p>
              {isLarge && (
                <>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {r.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: cs.bg, color: cs.text }}>
                        {r.category}
                      </span>
                    )}
                    {r.shareholder_loan && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(245,158,11,0.15)", color: "var(--accent-amber)" }}>
                        Shareholder Loan
                      </span>
                    )}
                    {r.recurring && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(16,185,129,0.12)", color: "var(--accent-green)" }}>
                        ⟳ Subscription
                      </span>
                    )}
                  </div>
                  {suggestedSubIds.has(r.id) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onMarkSub(r.id); }}
                      className="text-xs px-2 py-0.5 rounded-full font-medium mt-1.5"
                      style={{ backgroundColor: "rgba(16,185,129,0.12)", color: "var(--accent-green)", border: "1px solid rgba(16,185,129,0.25)" }}
                    >
                      ⟳ Mark subscription?
                    </button>
                  )}
                  <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>
                    Uploaded {fmtUploaded(r.savedAt)}
                  </p>
                </>
              )}
              {!isLarge && r.category && (
                <span className="inline-block text-xs px-1.5 py-0.5 rounded-full mt-1.5"
                  style={{ backgroundColor: cs.bg, color: cs.text, fontSize: "10px" }}>
                  {r.category.split(" ")[0]}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Summary bar ────────────────────────────────────────────────────────────────

function parseAmt(s: string): number {
  return parseFloat(s.replace(/[^0-9.]/g, "")) || 0;
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtUploaded(savedAt: string): string {
  if (!savedAt) return "—";
  try {
    const d = new Date(savedAt);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString("en-CA", {
      month: "short", day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  } catch { return "—"; }
}

function fmtDateRange(dates: string[]): string {
  const valid = dates.filter(Boolean).sort();
  if (valid.length === 0) return "—";
  const fmt = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("en-CA", { month: "short", year: "numeric" });
    } catch { return d; }
  };
  if (valid.length === 1) return fmt(valid[0]);
  const first = fmt(valid[0]);
  const last  = fmt(valid[valid.length - 1]);
  return first === last ? first : `${first} – ${last}`;
}

function SummaryBar({ receipts }: { receipts: SavedReceipt[] }) {
  if (receipts.length === 0) return null;

  const totalSpend = receipts.reduce((s, r) => s + parseAmt(r.total), 0);
  const totalTax   = receipts.reduce((s, r) => s + parseAmt(r.tax),   0);
  const period     = fmtDateRange(receipts.map((r) => r.date));

  const topCategory = (() => {
    const byCategory: Record<string, number> = {};
    receipts.forEach((r) => {
      if (r.category) byCategory[r.category] = (byCategory[r.category] ?? 0) + parseAmt(r.total);
    });
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? null;
  })();

  const tiles = [
    { label: "Receipts",    value: String(receipts.length), sub: null },
    { label: "Total Spend", value: fmtMoney(totalSpend),    sub: null },
    { label: "HST / Tax",   value: fmtMoney(totalTax),      sub: null },
    { label: "Period",      value: period,                   sub: null },
    ...(topCategory ? [{ label: "Top Category", value: topCategory.split(" — ")[0].split(" (")[0], sub: null }] : []),
  ];

  return (
    <div
      className="grid mb-4 rounded-xl overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${tiles.length}, 1fr)`,
        border: "1px solid var(--border)",
        backgroundColor: "var(--border)",
        gap: "1px",
      }}
    >
      {tiles.map((t) => (
        <div
          key={t.label}
          className="flex flex-col px-4 py-3"
          style={{ backgroundColor: "var(--bg-surface)" }}
        >
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{t.label}</span>
          <span className="text-sm font-semibold mt-0.5 truncate" style={{ color: "var(--text-primary)" }}>{t.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs font-medium flex-shrink-0" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="text-sm text-right" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
      {children}
    </div>
  );
}
