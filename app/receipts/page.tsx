"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSaved, deleteSaved, updateSaved, getDismissedNotifs, dismissNotif, CATEGORIES, categoryStyle, EMPTY_FORM, getSettings, parseIntervalDays, intervalLabel, getOfficeLocation, addMileage, type SavedReceipt, type ReceiptForm, type MileageTrip, type OfficeLocation } from "@/lib/storage";
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

type QuickFilter = "unconfirmed" | "flagged" | "shareholder_loan" | "has_address" | "this_month" | "no_category";

type SortBy = "date" | "total" | "vendor" | "category" | "subscription" | null;
type SortOrder = "asc" | "desc";
type ViewMode = "row" | "icon" | "spreadsheet";

type AgentMessage = { role: "user" | "assistant"; content: string };

type MileageCalcState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; km: number; minutes: number; toFormatted: string; fromLat?: number; fromLng?: number; toLat?: number; toLng?: number; logged: boolean }
  | { status: "error"; errorMsg: string };
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

function RowViewIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>
      <rect x="1" y="2" width="14" height="2.5" rx="1" fill="currentColor" opacity="0.4" />
      <rect x="1" y="6.75" width="14" height="2.5" rx="1" fill="currentColor" />
      <rect x="1" y="11.5" width="14" height="2.5" rx="1" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

function IconViewIcon({ active }: { active: boolean }) {
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

function SpreadsheetViewIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>
      <rect x="1" y="1" width="14" height="3" rx="1" fill="currentColor" />
      <rect x="1" y="5.5" width="14" height="2" rx="0.5" fill="currentColor" opacity="0.5" />
      <rect x="1" y="9" width="14" height="2" rx="0.5" fill="currentColor" opacity="0.5" />
      <rect x="1" y="12.5" width="14" height="2" rx="0.5" fill="currentColor" opacity="0.5" />
      <line x1="5.5" y1="1" x2="5.5" y2="15" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
      <line x1="10" y1="1" x2="10" y2="15" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
    </svg>
  );
}

type EditMeta = {
  store_address: string; store_city: string; store_postal_code: string;
  store_phone: string; hst_number: string; receipt_number: string;
  purchase_time: string; cashier: string; payment_method: string;
  card_last4: string; auth_code: string; tax_hst: string;
  tax_gst: string; tax_pst: string; tip: string; tax_rate: string;
};
const EMPTY_EDIT_META: EditMeta = {
  store_address: "", store_city: "", store_postal_code: "", store_phone: "",
  hst_number: "", receipt_number: "", purchase_time: "", cashier: "",
  payment_method: "", card_last4: "", auth_code: "",
  tax_hst: "", tax_gst: "", tax_pst: "", tip: "", tax_rate: "",
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RecordsPage() {
  const router = useRouter();
  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("icon");
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
  const [editMeta, setEditMeta] = useState<EditMeta>({ ...EMPTY_EDIT_META });

  // ── Fullscreen image viewer ────────────────────────────────────────────────
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null);

  // ── Quick filters ──────────────────────────────────────────────────────────
  const [quickFilter, setQuickFilter] = useState<QuickFilter | null>(null);

  // ── Mileage suggestion state ───────────────────────────────────────────────
  const [officeLocation, setOfficeLocation] = useState<OfficeLocation | null>(null);
  const [mileageCalc, setMileageCalc] = useState<MileageCalcState>({ status: "idle" });

  // ── Notification state ─────────────────────────────────────────────────────
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [notifOpen, setNotifOpen] = useState(false);

  const [notifSettings, setNotifSettings] = useState({ subs: true, dups: true, incomplete: true });

  useEffect(() => {
    setReceipts(getSaved());
    const saved = localStorage.getItem("recordsView") as ViewMode | null;
    if (saved === "row" || saved === "icon" || saved === "spreadsheet") setView(saved);
    setDismissedKeys(getDismissedNotifs());
    const s = getSettings();
    setAgentProMode(s.aiProMode);
    setNotifSettings({
      subs: s.notif_subscriptionReminders ?? true,
      dups: s.notif_duplicateWarnings ?? true,
      incomplete: s.notif_incompleteReceipts ?? true,
    });
    setOfficeLocation(getOfficeLocation());
  }, []);

  // Reset mileage calc when a different receipt is opened
  useEffect(() => {
    setMileageCalc({ status: "idle" });
  }, [selectedId]);

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
      business_use_pct:   r.business_use_pct ?? 100,
    });
    setEditMeta({
      store_address:     r.store_address     ?? "",
      store_city:        r.store_city        ?? "",
      store_postal_code: r.store_postal_code ?? "",
      store_phone:       r.store_phone       ?? "",
      hst_number:        r.hst_number        ?? "",
      receipt_number:    r.receipt_number    ?? "",
      purchase_time:     r.purchase_time     ?? "",
      cashier:           r.cashier           ?? "",
      payment_method:    r.payment_method    ?? "",
      card_last4:        r.card_last4        ?? "",
      auth_code:         r.auth_code         ?? "",
      tax_hst:           r.tax_hst           ?? "",
      tax_gst:           r.tax_gst           ?? "",
      tax_pst:           r.tax_pst           ?? "",
      tip:               r.tip               ?? "",
      tax_rate:          r.tax_rate          ?? "",
    });
    setIsEditing(true);
  }

  function saveEdits(id: string) {
    updateSaved(id, { ...editForm, ...editMeta });
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
      setQuickFilter(null);
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

  const thisMonthPrefix = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const baseFiltered = receipts.filter((r) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const searchable = [
        r.vendor, r.store_address, r.store_city, r.store_postal_code,
        r.store_phone, r.hst_number, r.receipt_number, r.payment_method,
        r.card_last4, r.auth_code, r.cashier, r.business_purpose, r.notes,
        r.category, r.total, r.subtotal,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    if (filters.category && r.category !== filters.category) return false;
    if (filters.dateFrom && r.date < filters.dateFrom) return false;
    if (filters.dateTo && r.date > filters.dateTo) return false;

    // Quick filters
    if (quickFilter === "unconfirmed"     && r.ai_confirmed !== false) return false;
    if (quickFilter === "flagged"         && getFlags(r).length === 0) return false;
    if (quickFilter === "shareholder_loan" && !r.shareholder_loan)     return false;
    if (quickFilter === "has_address"     && !r.store_address && !r.store_city) return false;
    if (quickFilter === "this_month"      && !r.date?.startsWith(thisMonthPrefix)) return false;
    if (quickFilter === "no_category"     && r.category) return false;

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
      Date:                r.date,
      Vendor:              r.vendor,
      "Store Address":     r.store_address ?? "",
      "Store City":        r.store_city ?? "",
      "Postal Code":       r.store_postal_code ?? "",
      "Store Phone":       r.store_phone ?? "",
      "HST #":             r.hst_number ?? "",
      "Purchase Time":     r.purchase_time ?? "",
      "Receipt #":         r.receipt_number ?? "",
      Cashier:             r.cashier ?? "",
      "Payment Method":    r.payment_method ?? "",
      "Card Last 4":       r.card_last4 ?? "",
      "Auth Code":         r.auth_code ?? "",
      Subtotal:            r.subtotal,
      HST:                 r.tax_hst ?? "",
      GST:                 r.tax_gst ?? "",
      PST:                 r.tax_pst ?? "",
      Tax:                 r.tax,
      Tip:                 r.tip ?? "",
      Total:               r.total,
      Category:            r.category,
      "Business Purpose":  r.business_purpose,
      "% Business Use":    r.business_use_pct ?? 100,
      Notes:               r.notes ?? "",
      "Shareholder Loan":  r.shareholder_loan ? "Yes" : "",
      "AI Confirmed":      r.ai_confirmed === true ? "Yes" : r.ai_confirmed === false ? "Pending" : "",
    }));

    // Line items on a separate sheet
    const lineRows: object[] = [];
    filtered.forEach((r) => {
      (r.line_items ?? []).forEach((item) => {
        lineRows.push({
          Date: r.date, Vendor: r.vendor,
          Description: item.description, SKU: item.sku ?? "",
          Qty: item.qty ?? "", "Unit Price": item.unit_price ?? "", Amount: item.amount ?? "",
        });
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Receipts");
    if (lineRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineRows), "Line Items");
    }
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

  async function calculateMileage() {
    if (!selected || !officeLocation) return;
    const dest = [selected.store_address, selected.store_city].filter(Boolean).join(", ");
    if (!dest) return;
    setMileageCalc({ status: "loading" });
    try {
      const params = new URLSearchParams({ from: officeLocation.address, to: dest });
      const res = await fetch(`/api/distance?${params}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Distance API error");
      setMileageCalc({
        status: "done",
        km: data.km,
        minutes: data.minutes,
        toFormatted: data.toFormatted,
        fromLat: data.fromLat,
        fromLng: data.fromLng,
        toLat: data.toLat,
        toLng: data.toLng,
        logged: false,
      });
    } catch (e) {
      setMileageCalc({ status: "error", errorMsg: e instanceof Error ? e.message : "Could not calculate distance" });
    }
  }

  function logMileageTrip() {
    if (!selected || mileageCalc.status !== "done" || !officeLocation) return;
    const roundKm = parseFloat((mileageCalc.km * 2).toFixed(1));
    const trip: MileageTrip = {
      id: crypto.randomUUID(),
      date: selected.date,
      from: officeLocation.address,
      to: [selected.store_address, selected.store_city].filter(Boolean).join(", "),
      fromLat: mileageCalc.fromLat,
      fromLng: mileageCalc.fromLng,
      toLat: mileageCalc.toLat,
      toLng: mileageCalc.toLng,
      purpose: selected.business_purpose || `Trip to ${selected.vendor}`,
      km: roundKm,
      roundTrip: true,
      notes: `Auto-suggested from receipt: ${selected.vendor}`,
    };
    addMileage(trip);
    setMileageCalc({ ...mileageCalc, logged: true });
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
      Date:                r.date,
      Vendor:              r.vendor,
      "Store Address":     r.store_address ?? "",
      "Store City":        r.store_city ?? "",
      "Postal Code":       r.store_postal_code ?? "",
      "HST #":             r.hst_number ?? "",
      "Purchase Time":     r.purchase_time ?? "",
      "Receipt #":         r.receipt_number ?? "",
      "Payment Method":    r.payment_method ?? "",
      "Card Last 4":       r.card_last4 ?? "",
      Subtotal:            r.subtotal,
      HST:                 r.tax_hst ?? "",
      Tax:                 r.tax,
      Total:               r.total,
      Category:            r.category,
      "Business Purpose":  r.business_purpose,
      "% Business Use":    r.business_use_pct ?? 100,
      Notes:               r.notes ?? "",
      "Shareholder Loan":  r.shareholder_loan ? "Yes" : "",
    }));
    const lineRows: object[] = [];
    toExport.forEach((r) => {
      (r.line_items ?? []).forEach((item) => {
        lineRows.push({ Date: r.date, Vendor: r.vendor, Description: item.description, SKU: item.sku ?? "", Qty: item.qty ?? "", "Unit Price": item.unit_price ?? "", Amount: item.amount ?? "" });
      });
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Receipts");
    if (lineRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineRows), "Line Items");
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

  // ── Per-receipt flags ────────────────────────────────────────────────────
  function getFlags(r: SavedReceipt): string[] {
    const flags: string[] = [];
    if (!r.vendor)    flags.push("Missing vendor");
    if (!r.total)     flags.push("Missing total");
    if (!r.date)      flags.push("Missing date");
    if (!r.category)  flags.push("No category");
    if (r.subtotal && r.tax && r.total) {
      const sub = parseFloat(r.subtotal.replace(/[^0-9.]/g, "")) || 0;
      const tax = parseFloat(r.tax.replace(/[^0-9.]/g, "")) || 0;
      if (sub > 0 && tax / sub > 0.20) flags.push("Unusually high tax");
    }
    if (visibleDupIds.has(r.id)) flags.push("Possible duplicate");
    return flags;
  }

  const unconfirmedCount = receipts.filter((r) => r.ai_confirmed === false).length;

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
              {(filters.search || filters.category || filters.dateFrom || filters.dateTo || quickFilter) && (
                <button onClick={() => { setFilters(EMPTY_FILTERS); setQuickFilter(null); }}
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
                {(["icon", "row", "spreadsheet"] as ViewMode[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => changeView(v)}
                    className="px-2.5 py-2 flex items-center justify-center transition-colors"
                    title={v.charAt(0).toUpperCase() + v.slice(1)}
                    style={{
                      backgroundColor: view === v ? "var(--accent-blue)" : "transparent",
                      borderRight: v !== "spreadsheet" ? "1px solid var(--border)" : undefined,
                    }}
                  >
                    {v === "icon"        && <IconViewIcon        active={view === v} />}
                    {v === "row"         && <RowViewIcon         active={view === v} />}
                    {v === "spreadsheet" && <SpreadsheetViewIcon active={view === v} />}
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

            {/* Quick filter chips */}
            {(() => {
              const allChips: { key: QuickFilter; label: string; count?: number }[] = [
                { key: "unconfirmed",      label: "Unconfirmed",      count: receipts.filter(r => r.ai_confirmed === false).length },
                { key: "flagged",          label: "Flagged",          count: receipts.filter(r => getFlags(r).length > 0).length },
                { key: "no_category",      label: "No category",      count: receipts.filter(r => !r.category).length },
                { key: "shareholder_loan", label: "Shareholder loan",  count: receipts.filter(r => r.shareholder_loan).length },
                { key: "has_address",      label: "Has address" },
                { key: "this_month",       label: "This month" },
              ];
              const chips = allChips.filter(c => c.count === undefined || c.count > 0);
              if (chips.length === 0) return null;
              return (
                <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                  <span className="text-xs mr-1" style={{ color: "var(--text-secondary)" }}>Filter:</span>
                  {chips.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setQuickFilter(prev => prev === c.key ? null : c.key)}
                      className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1"
                      style={{
                        backgroundColor: quickFilter === c.key ? "var(--accent-blue)" : "var(--bg-elevated)",
                        color: quickFilter === c.key ? "#fff" : "var(--text-secondary)",
                        border: `1px solid ${quickFilter === c.key ? "var(--accent-blue)" : "var(--border)"}`,
                      }}
                    >
                      {c.label}
                      {c.count !== undefined && <span style={{ opacity: 0.7 }}>{c.count}</span>}
                    </button>
                  ))}
                  {quickFilter && (
                    <button onClick={() => setQuickFilter(null)} className="text-xs px-1.5 py-1 rounded-full ml-0.5" style={{ color: "var(--text-secondary)" }}>✕</button>
                  )}
                </div>
              );
            })()}

            {/* Results count */}
            {(filters.search || filters.category || filters.dateFrom || filters.dateTo || quickFilter) && (
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

            {/* Unconfirmed receipts banner */}
            {unconfirmedCount > 0 && (
              <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm"
                style={{ backgroundColor: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)" }}>
                <div className="flex items-center gap-2.5">
                  <span style={{ fontSize: 14 }}>●</span>
                  <span style={{ color: "#ca8a04" }}>
                    <strong>{unconfirmedCount} receipt{unconfirmedCount !== 1 ? "s" : ""}</strong> have AI-generated data waiting for your review
                  </span>
                </div>
                <button
                  onClick={() => {
                    const first = filtered.find((r) => r.ai_confirmed === false);
                    if (first) setSelectedId(first.id);
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg font-medium flex-shrink-0"
                  style={{ backgroundColor: "rgba(234,179,8,0.15)", color: "#ca8a04" }}>
                  Review →
                </button>
              </div>
            )}

            {filtered.length === 0 ? (
              <p className="text-center py-16 text-sm" style={{ color: "var(--text-secondary)" }}>
                No receipts match your filters.
              </p>
            ) : view === "row" ? (
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
                getFlags={getFlags}
              />
            ) : view === "spreadsheet" ? (
              <SpreadsheetGrid
                receipts={filtered}
                onSelect={(id) => { if (!selectMode) setSelectedId(id); }}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggle={toggleSelect}
                getFlags={getFlags}
              />
            ) : (
              <CardGrid
                receipts={filtered}
                onSelect={(id) => { if (!selectMode) setSelectedId(id); }}
                onZoom={(src) => setFullscreenImg(src)}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggle={toggleSelect}
                duplicateIds={visibleDupIds}
                dupInfo={visibleDupInfo}
                onDismissDup={handleDismiss}
                suggestedSubIds={suggestedSubIds}
                onMarkSub={(id) => { updateSaved(id, { recurring: true, recurringInterval: "1m" }); setReceipts(getSaved()); }}
                getFlags={getFlags}
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

                {/* AI confirmation banner */}
                {selected.ai_confirmed === false && (() => {
                  const flags = getFlags(selected);
                  return (
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(234,179,8,0.35)" }}>
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5"
                        style={{ backgroundColor: "rgba(234,179,8,0.1)" }}>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 12 }}>●</span>
                          <span className="text-xs font-medium" style={{ color: "#ca8a04" }}>
                            AI-generated — review and confirm
                          </span>
                        </div>
                        <button
                          onClick={() => { updateSaved(selected.id, { ai_confirmed: true }); setReceipts(getSaved()); }}
                          className="text-xs px-3 py-1 rounded-lg font-semibold flex-shrink-0"
                          style={{ backgroundColor: "var(--accent-green)", color: "#fff" }}>
                          Confirm ✓
                        </button>
                      </div>
                      {flags.length > 0 && (
                        <div className="px-3 py-2 flex flex-col gap-1"
                          style={{ backgroundColor: "rgba(239,68,68,0.06)", borderTop: "1px solid rgba(239,68,68,0.15)" }}>
                          {flags.map((f) => (
                            <div key={f} className="flex items-center gap-1.5 text-xs" style={{ color: "#f87171" }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                              </svg>
                              {f}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Duplicate warning (when confirmed) */}
                {selected.ai_confirmed !== false && duplicateIds.has(selected.id) && (() => {
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
                      <button onClick={() => info && handleDismiss(info.pairKey)}
                        className="flex-shrink-0 text-xs px-2 py-0.5 rounded-md font-medium"
                        style={{ backgroundColor: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
                        Not a duplicate
                      </button>
                    </div>
                  );
                })()}

                {/* ── VENDOR ── */}
                <SectionLabel>Vendor</SectionLabel>
                <Row label="Name"           value={selected.vendor} />
                <Row label="Address"        value={selected.store_address ?? ""} />
                <Row label="City"           value={selected.store_city ?? ""} />
                <Row label="Postal Code"    value={selected.store_postal_code ?? ""} />
                <Row label="Phone"          value={selected.store_phone ?? ""} />
                <Row label="HST #"          value={selected.hst_number ?? ""} />

                {/* ── TRANSACTION ── */}
                <SectionLabel>Transaction</SectionLabel>
                <Row label="Date"           value={selected.date} />
                <Row label="Time"           value={selected.purchase_time ?? ""} />
                <Row label="Receipt #"      value={selected.receipt_number ?? ""} />
                <Row label="Cashier"        value={selected.cashier ?? ""} />

                {/* ── PAYMENT ── */}
                {(selected.payment_method || selected.card_last4 || selected.auth_code) && (
                  <>
                    <SectionLabel>Payment</SectionLabel>
                    <Row label="Method"       value={selected.payment_method ?? ""} />
                    {selected.card_last4 && <Row label="Card" value={`•••• ${selected.card_last4}`} />}
                    <Row label="Auth Code"    value={selected.auth_code ?? ""} />
                  </>
                )}

                {/* ── AMOUNTS ── */}
                <SectionLabel>Amounts</SectionLabel>
                <Row label="Subtotal"       value={selected.subtotal} />
                {selected.tax_hst  && <Row label="HST"     value={`${selected.tax_hst}${selected.tax_rate ? `  (${selected.tax_rate})` : ""}`} />}
                {selected.tax_gst  && <Row label="GST"     value={selected.tax_gst} />}
                {selected.tax_pst  && <Row label="PST"     value={selected.tax_pst} />}
                {!selected.tax_hst && !selected.tax_gst && <Row label="Tax" value={selected.tax} />}
                {selected.tip      && <Row label="Tip"     value={selected.tip} />}
                <Row label="Total"          value={selected.total} />

                {/* ── LINE ITEMS ── */}
                {selected.line_items && selected.line_items.length > 0 && (
                  <div>
                    <SectionLabel>Line Items</SectionLabel>
                    <div className="flex flex-col gap-1">
                      {selected.line_items.map((item, i) => (
                        <div key={i} className="flex items-start justify-between gap-2 text-xs px-3 py-2 rounded-lg"
                          style={{ backgroundColor: "var(--bg-elevated)" }}>
                          <div>
                            <span style={{ color: "var(--text-primary)" }}>{item.description || "—"}</span>
                            {item.sku && <span className="ml-2" style={{ color: "var(--text-secondary)" }}>SKU: {item.sku}</span>}
                          </div>
                          <div className="flex-shrink-0 text-right" style={{ color: "var(--text-secondary)" }}>
                            {item.qty && <span className="mr-2">Qty: {item.qty}</span>}
                            <span>{item.amount || item.unit_price || ""}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* ── CLASSIFICATION ── */}
                <SectionLabel>Classification</SectionLabel>
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
                <Row label="% Business Use"   value={selected.business_use_pct != null ? `${selected.business_use_pct}%` : "100%"} />
                {selected.notes && <Row label="Notes" value={selected.notes} />}
                <div className="flex gap-2 flex-wrap">
                  {selected.shareholder_loan && (
                    <div className="text-xs px-3 py-1.5 rounded-lg"
                      style={{ backgroundColor: "rgba(245,158,11,0.1)", color: "var(--accent-amber)" }}>
                      Shareholder Loan
                    </div>
                  )}
                  {selected.recurring && (
                    <div className="text-xs px-3 py-1.5 rounded-lg"
                      style={{ backgroundColor: "rgba(16,185,129,0.1)", color: "var(--accent-green)" }}>
                      ⟳ Recurring — {selected.recurringInterval}
                    </div>
                  )}
                  {selected.ai_confirmed && (
                    <div className="text-xs px-3 py-1.5 rounded-lg"
                      style={{ backgroundColor: "rgba(16,185,129,0.08)", color: "var(--accent-green)" }}>
                      ✓ Confirmed
                    </div>
                  )}
                </div>
                {/* ── FULL RECEIPT TEXT ── */}
                <SavedReceiptDetails r={selected} />

                {/* ── MILEAGE SUGGESTION ── */}
                {(() => {
                  const dest = [selected.store_address, selected.store_city].filter(Boolean).join(", ");
                  if (!dest) return null;
                  return (
                    <>
                      <SectionLabel>Mileage</SectionLabel>
                      {!officeLocation ? (
                        <div className="text-xs px-3 py-2.5 rounded-lg flex items-center gap-2"
                          style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
                          </svg>
                          <span>Set a home/office address in <Link href="/mileage" className="underline">Mileage</Link> to get mileage suggestions.</span>
                        </div>
                      ) : mileageCalc.status === "idle" ? (
                        <button
                          onClick={calculateMileage}
                          className="w-full text-left text-xs px-3 py-2.5 rounded-lg flex items-center gap-2"
                          style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-blue)", flexShrink: 0 }}>
                            <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
                          </svg>
                          Calculate round trip from {officeLocation.label || "Home"} to {selected.vendor}
                        </button>
                      ) : mileageCalc.status === "loading" ? (
                        <div className="text-xs px-3 py-2.5 rounded-lg" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                          Calculating distance…
                        </div>
                      ) : mileageCalc.status === "error" ? (
                        <div className="text-xs px-3 py-2.5 rounded-lg flex items-center justify-between gap-2"
                          style={{ backgroundColor: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                          <span>Could not calculate distance.</span>
                          <button onClick={() => setMileageCalc({ status: "idle" })} className="underline flex-shrink-0">Retry</button>
                        </div>
                      ) : mileageCalc.status === "done" ? (
                        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                          <div className="px-3 py-2.5 flex flex-col gap-1.5" style={{ backgroundColor: "var(--bg-elevated)" }}>
                            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                              {officeLocation.label || "Home"} → {mileageCalc.toFormatted} → {officeLocation.label || "Home"}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                                  {(mileageCalc.km * 2).toFixed(1)} km
                                </span>
                                <span className="text-xs ml-2" style={{ color: "var(--text-secondary)" }}>
                                  round trip · ${(mileageCalc.km * 2 * 0.70).toFixed(2)} deduction
                                </span>
                              </div>
                              {mileageCalc.logged ? (
                                <span className="text-xs px-2.5 py-1 rounded-lg font-medium"
                                  style={{ backgroundColor: "rgba(16,185,129,0.12)", color: "var(--accent-green)" }}>
                                  ✓ Logged
                                </span>
                              ) : (
                                <button
                                  onClick={logMileageTrip}
                                  className="text-xs px-2.5 py-1 rounded-lg font-medium flex-shrink-0"
                                  style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>
                                  Log Trip
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  );
                })()}

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
                <EditField label="% Business Use">
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={100}
                      value={editForm.business_use_pct ?? 100}
                      onChange={(e) => setEditForm(f => ({ ...f, business_use_pct: Math.min(100, Math.max(0, Number(e.target.value))) }))}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={editInputStyle} />
                    <span className="text-sm flex-shrink-0" style={{ color: "var(--text-secondary)" }}>%</span>
                  </div>
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
                {/* Parsed metadata (collapsible) */}
                <EditParsedDetails
                  meta={editMeta}
                  onUpdate={(f, v) => setEditMeta(prev => ({ ...prev, [f]: v }))}
                  inputStyle={editInputStyle}
                />
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
  getFlags,
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
  getFlags: (r: SavedReceipt) => string[];
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
        const flags = getFlags(r);
        const needsConfirm = r.ai_confirmed === false;
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
            <div className="w-9 h-9 rounded-md overflow-hidden flex items-center justify-center flex-shrink-0 relative"
              style={{ backgroundColor: "var(--bg-elevated)" }}>
              {hasThumbnail
                ? <img src={r.thumbnail} alt="" className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                : <DocIcon size={16} />}
              {/* Status dot overlay */}
              {(needsConfirm || flags.length > 0) && (
                <div className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                  style={{
                    backgroundColor: flags.length > 0 ? "#f87171" : "#eab308",
                    borderColor: "var(--bg-base)",
                  }} />
              )}
            </div>

            {/* Vendor */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                  {r.vendor || "Unknown vendor"}
                </p>
                {flags.length > 0 && (
                  <div className="relative group/flag flex-shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 z-50 hidden group-hover/flag:block" style={{ transform: "translateX(-50%)" }}>
                      <div className="rounded-lg px-2.5 py-1.5 text-xs" style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)", boxShadow: "0 4px 12px rgba(0,0,0,0.4)", whiteSpace: "nowrap" }}>
                        {flags.join(" · ")}
                      </div>
                    </div>
                  </div>
                )}
                {needsConfirm && flags.length === 0 && (
                  <span style={{ fontSize: 9, color: "#eab308" }}>●</span>
                )}
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
  selectMode,
  selectedIds,
  onToggle,
  duplicateIds,
  dupInfo,
  onDismissDup,
  suggestedSubIds,
  onMarkSub,
  getFlags,
}: {
  receipts: SavedReceipt[];
  onSelect: (id: string) => void;
  onZoom: (src: string) => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  duplicateIds: Set<string>;
  dupInfo: Map<string, { tooltip: string; pairKey: string }>;
  onDismissDup: (key: string) => void;
  suggestedSubIds: Set<string>;
  onMarkSub: (id: string) => void;
  getFlags: (r: SavedReceipt) => string[];
}) {
  const thumbHeight = 120;
  const minCardWidth = 180;

  return (
    <div className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minCardWidth}px, 1fr))` }}>
      {receipts.map((r) => {
        const cs = categoryStyle(r.category);
        const hasThumbnail = r.thumbnail.startsWith("data:");
        const isSelected = selectedIds.has(r.id);
        const flags = getFlags(r);
        const needsConfirm = r.ai_confirmed === false;
        const statusColor = flags.length > 0 ? "#f87171" : needsConfirm ? "#eab308" : null;
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
                : <DocIcon size={24} />}

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

              {/* Status dot — top right */}
              {statusColor && (
                <div style={{
                  position: "absolute", top: 6, right: 6, zIndex: 15,
                  width: 10, height: 10, borderRadius: "50%",
                  backgroundColor: statusColor,
                  border: "2px solid var(--bg-surface)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                }} />
              )}
            </div>

            {/* Info */}
            <div className="px-3 py-2">
              <div className="flex items-start justify-between gap-1">
                <div className="flex items-center gap-1 min-w-0">
                  <p className="font-medium truncate text-xs"
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
                <p className="font-semibold flex-shrink-0 text-xs"
                  style={{ color: "var(--text-primary)" }}>
                  {r.total || "—"}
                </p>
              </div>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {r.date || "No date"}
              </p>
              {r.category && (
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

// ── Spreadsheet column definitions ────────────────────────────────────────────

type SpreadsheetColDef = {
  key: string;
  label: string;
  width: string;
  align?: "center";
  render: (r: SavedReceipt) => React.ReactNode;
};

const SPREADSHEET_COLS: SpreadsheetColDef[] = [
  { key: "date",              label: "Date",         width: "80px",
    render: r => <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.date || "—"}</span> },
  { key: "vendor",            label: "Vendor",        width: "160px",
    render: r => <span className="text-xs truncate font-medium" style={{ color: "var(--text-primary)" }}>{r.vendor || "—"}</span> },
  { key: "subtotal",          label: "Subtotal",      width: "78px",
    render: r => <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.subtotal || "—"}</span> },
  { key: "tax",               label: "Tax",           width: "68px",
    render: r => <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.tax || "—"}</span> },
  { key: "tax_hst",           label: "HST",           width: "68px",
    render: r => <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.tax_hst || "—"}</span> },
  { key: "tax_gst",           label: "GST",           width: "68px",
    render: r => <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.tax_gst || "—"}</span> },
  { key: "tax_pst",           label: "PST",           width: "68px",
    render: r => <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.tax_pst || "—"}</span> },
  { key: "tip",               label: "Tip",           width: "60px",
    render: r => <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.tip || "—"}</span> },
  { key: "tax_rate",          label: "Tax Rate",      width: "68px",
    render: r => <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{r.tax_rate || "—"}</span> },
  { key: "total",             label: "Total",         width: "80px",
    render: r => <span className="text-xs tabular-nums font-semibold" style={{ color: "var(--text-primary)" }}>{r.total || "—"}</span> },
  { key: "category",          label: "Category",      width: "90px",
    render: r => {
      if (!r.category) return <span />;
      const cs = categoryStyle(r.category);
      const short = r.category.split(" — ")[1] ?? r.category.split(" ")[0];
      return <span className="text-xs px-1.5 py-0.5 rounded truncate block" style={{ backgroundColor: cs.bg, color: cs.text, fontSize: 10 }}>{short}</span>;
    } },
  { key: "business_purpose",  label: "Purpose",       width: "1fr",
    render: r => <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{r.business_purpose || "—"}</span> },
  { key: "business_use_pct",  label: "% Use",         width: "52px", align: "center",
    render: r => <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.business_use_pct ?? 100}%</span> },
  { key: "payment_method",    label: "Payment",       width: "80px",
    render: r => <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{r.payment_method || "—"}</span> },
  { key: "card_last4",        label: "Card",          width: "72px",
    render: r => <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.card_last4 ? `•••• ${r.card_last4}` : "—"}</span> },
  { key: "auth_code",         label: "Auth Code",     width: "72px",
    render: r => <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{r.auth_code || "—"}</span> },
  { key: "store_address",     label: "Address",       width: "160px",
    render: r => <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{r.store_address || "—"}</span> },
  { key: "store_city",        label: "City",          width: "100px",
    render: r => <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{r.store_city || "—"}</span> },
  { key: "store_postal_code", label: "Postal Code",   width: "76px",
    render: r => <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{r.store_postal_code || "—"}</span> },
  { key: "store_phone",       label: "Phone",         width: "110px",
    render: r => <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{r.store_phone || "—"}</span> },
  { key: "hst_number",        label: "HST #",         width: "130px",
    render: r => <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.hst_number || "—"}</span> },
  { key: "receipt_number",    label: "Receipt #",     width: "90px",
    render: r => <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{r.receipt_number || "—"}</span> },
  { key: "purchase_time",     label: "Time",          width: "60px",
    render: r => <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.purchase_time || "—"}</span> },
  { key: "cashier",           label: "Cashier",       width: "80px",
    render: r => <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{r.cashier || "—"}</span> },
  { key: "notes",             label: "Notes",         width: "120px",
    render: r => <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{r.notes || "—"}</span> },
  { key: "shareholder_loan",  label: "Shareholder Loan", width: "110px", align: "center",
    render: r => r.shareholder_loan
      ? <span style={{ fontSize: 9, fontWeight: 700, backgroundColor: "rgba(245,158,11,0.2)", color: "var(--accent-amber)", padding: "1px 4px", borderRadius: 3 }}>SL</span>
      : <span /> },
  { key: "recurring",         label: "Recurring",     width: "80px", align: "center",
    render: r => r.recurring ? <span style={{ color: "var(--accent-green)", fontSize: 12 }}>⟳</span> : <span /> },
  { key: "ai_confirmed",      label: "AI Status",     width: "72px", align: "center",
    render: r => r.ai_confirmed === true
      ? <span style={{ color: "var(--accent-green)", fontSize: 11 }}>✓</span>
      : r.ai_confirmed === false
        ? <span style={{ color: "#eab308", fontSize: 9 }}>●</span>
        : <span /> },
];

// Date + Vendor are always frozen on the left. Everything else is configurable.
const FROZEN_KEYS  = ["date", "vendor"];
// Default scrollable columns (shown on right side of the frozen pane)
const DEFAULT_SCROLL_KEYS = ["subtotal", "tax", "total", "category", "business_purpose", "business_use_pct"];
// New key to clear any stale all-columns localStorage from before
const SPREADSHEET_COLS_KEY = "corpoSpreadsheetCols_v4";
const COL_WIDTHS_KEY       = "corpoColWidths_v1";

// ── Column picker panel ────────────────────────────────────────────────────────

function ColumnPickerPanel({
  visibleKeys,
  onClose,
  onChange,
}: {
  visibleKeys: string[];
  onClose: () => void;
  onChange: (keys: string[]) => void;
}) {
  // Exclude frozen keys — those are always shown
  const pickable = SPREADSHEET_COLS.filter(c => !FROZEN_KEYS.includes(c.key));
  const showing  = pickable.filter(c => visibleKeys.includes(c.key))
    .sort((a, b) => visibleKeys.indexOf(a.key) - visibleKeys.indexOf(b.key));
  const available = pickable.filter(c => !visibleKeys.includes(c.key));

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1" onClick={onClose} />
      <div className="flex flex-col h-full w-72"
        style={{ backgroundColor: "var(--bg-surface)", borderLeft: "1px solid var(--border)", boxShadow: "-12px 0 40px rgba(0,0,0,0.35)" }}>

        <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Columns</span>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Date + Vendor always pinned left</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-lg leading-none"
            style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)" }}>×</button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Showing → (right side of grid) */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--accent-blue)" }}>
              Showing →
            </p>
            {showing.length === 0 && (
              <p className="text-xs py-2 px-1" style={{ color: "var(--text-secondary)" }}>No extra columns. Add some below.</p>
            )}
            {showing.map(c => (
              <div key={c.key}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg mb-1.5"
                style={{ backgroundColor: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.18)" }}>
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>{c.label}</span>
                <button
                  onClick={() => onChange(visibleKeys.filter(k => k !== c.key))}
                  className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                  style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  ← Hide
                </button>
              </div>
            ))}
          </div>

          {/* Available */}
          {available.length > 0 && (
            <div className="px-4 pb-4">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2 mt-1" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
                Available
              </p>
              {available.map(c => (
                <div key={c.key}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg mb-1.5"
                  style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{c.label}</span>
                  <button
                    onClick={() => onChange([...visibleKeys, c.key])}
                    className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                    style={{ color: "var(--accent-blue)", backgroundColor: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)" }}>
                    Show →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: "1px solid var(--border)" }}>
          <button onClick={() => onChange(DEFAULT_SCROLL_KEYS)} className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Reset defaults
          </button>
          <button
            onClick={() => onChange(SPREADSHEET_COLS.filter(c => !FROZEN_KEYS.includes(c.key)).map(c => c.key))}
            className="text-xs" style={{ color: "var(--accent-blue)" }}>
            Show all
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Spreadsheet view ───────────────────────────────────────────────────────────

function SpreadsheetGrid({
  receipts,
  onSelect,
  selectMode,
  selectedIds,
  onToggle,
  getFlags,
}: {
  receipts: SavedReceipt[];
  onSelect: (id: string) => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  getFlags: (r: SavedReceipt) => string[];
}) {
  const [scrollKeys, setScrollKeys] = useState<string[]>(DEFAULT_SCROLL_KEYS);
  const [panelOpen, setPanelOpen]   = useState(false);
  const [colWidths, setColWidths]   = useState<Record<string, number>>({});
  const frozenBodyRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const resizeState   = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SPREADSHEET_COLS_KEY);
      if (saved) setScrollKeys(JSON.parse(saved));
      const savedWidths = localStorage.getItem(COL_WIDTHS_KEY);
      if (savedWidths) setColWidths(JSON.parse(savedWidths));
    } catch { /* ignore */ }
  }, []);

  // Global mouse listeners for column resize drag
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizeState.current) return;
      const delta = e.clientX - resizeState.current.startX;
      const newW  = Math.max(30, resizeState.current.startWidth + delta);
      setColWidths(prev => ({ ...prev, [resizeState.current!.key]: newW }));
    }
    function onMouseUp() {
      if (!resizeState.current) return;
      resizeState.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setColWidths(prev => { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(prev)); return prev; });
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => { document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); };
  }, []);

  function updateCols(keys: string[]) {
    setScrollKeys(keys);
    localStorage.setItem(SPREADSHEET_COLS_KEY, JSON.stringify(keys));
  }

  // Sync vertical scroll between frozen and scrollable panes
  function onScrollRight() {
    if (frozenBodyRef.current && scrollBodyRef.current)
      frozenBodyRef.current.scrollTop = scrollBodyRef.current.scrollTop;
  }
  function onScrollLeft() {
    if (frozenBodyRef.current && scrollBodyRef.current)
      scrollBodyRef.current.scrollTop = frozenBodyRef.current.scrollTop;
  }

  const frozenCols = SPREADSHEET_COLS.filter(c => FROZEN_KEYS.includes(c.key))
    .sort((a, b) => FROZEN_KEYS.indexOf(a.key) - FROZEN_KEYS.indexOf(b.key));
  const activeCols = SPREADSHEET_COLS.filter(c => scrollKeys.includes(c.key))
    .sort((a, b) => scrollKeys.indexOf(a.key) - scrollKeys.indexOf(b.key));

  // Resolve a column's current width in px (user override → default)
  function getW(col: SpreadsheetColDef): number {
    if (colWidths[col.key] !== undefined) return colWidths[col.key];
    if (col.width.includes("fr")) return 160;
    const m = col.width.match(/(\d+)/);
    return m ? parseInt(m[1]) : 100;
  }

  function startResize(e: React.MouseEvent, col: SpreadsheetColDef) {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = { key: col.key, startX: e.clientX, startWidth: getW(col) };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  // Grid templates
  const dateCol       = frozenCols.find(c => c.key === "date");
  const vendorCol     = frozenCols.find(c => c.key === "vendor");
  const dateW         = dateCol   ? getW(dateCol)   : 80;
  const vendorW       = vendorCol ? getW(vendorCol) : 160;
  const leftTemplate  = `28px 16px ${dateW}px ${vendorW}px`;
  const rightTemplate = activeCols.length > 0 ? activeCols.map(c => `${getW(c)}px`).join(" ") : "1fr";

  const rowHeight = 34;
  const maxBodyHeight = "calc(70vh - 36px)"; // 70vh minus header row

  const hdrStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-secondary)",
    backgroundColor: "var(--bg-elevated)",
    borderBottom: "1px solid var(--border)",
    height: 36,
    display: "flex",
    alignItems: "center",
    padding: "0 8px",
    gap: 8,
  };

  function RowStatus({ r }: { r: SavedReceipt }) {
    const flags       = getFlags(r);
    const needsConfirm = r.ai_confirmed === false;
    const color       = flags.length > 0 ? "#f87171" : needsConfirm ? "#eab308" : null;
    if (!color) return <span />;
    return (
      <div className="relative group/status flex items-center justify-center" style={{ width: 16 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color }} />
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 z-50 hidden group-hover/status:block" style={{ transform: "translateX(-50%)" }}>
          <div className="rounded-lg px-2 py-1 text-xs whitespace-nowrap"
            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}>
            {flags.length > 0 ? flags.join(" · ") : "Needs confirmation"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {panelOpen && (
        <ColumnPickerPanel
          visibleKeys={scrollKeys}
          onClose={() => setPanelOpen(false)}
          onChange={updateCols}
        />
      )}

      {/* Columns button */}
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
          style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          Columns
          {activeCols.length > 0 && <span style={{ opacity: 0.6 }}>+{activeCols.length}</span>}
        </button>
      </div>

      {/* Two-pane layout: frozen left + scrollable right */}
      <div className="rounded-xl overflow-hidden flex" style={{ border: "1px solid var(--border)", maxHeight: "70vh" }}>

        {/* ── LEFT: frozen pane (Date + Vendor always visible) ── */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", maxWidth: "50%",
          borderRight: activeCols.length > 0 ? "2px solid var(--border)" : undefined }}>

          {/* Header */}
          <div style={{ ...hdrStyle, display: "grid", gridTemplateColumns: leftTemplate, flexShrink: 0 }}>
            <span />
            <span />
            {frozenCols.map(c => (
              <span key={c.key} style={{ position: "relative", overflow: "visible" }}>
                {c.label}
                <div className="col-resize-handle" onMouseDown={(e) => startResize(e, c)} />
              </span>
            ))}
          </div>

          {/* Body */}
          <div ref={frozenBodyRef} onScroll={onScrollLeft}
            className="hide-scrollbar"
            style={{ overflowY: "auto", overflowX: "hidden", maxHeight: maxBodyHeight }}>
            {receipts.map((r, i) => {
              const isSelected = selectedIds.has(r.id);
              return (
                <div key={r.id}
                  onClick={() => selectMode ? onToggle(r.id) : onSelect(r.id)}
                  style={{
                    display: "grid", gridTemplateColumns: leftTemplate, gap: "8px",
                    alignItems: "center", padding: "0 8px", height: rowHeight,
                    backgroundColor: isSelected ? "rgba(59,130,246,0.08)" : i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-base)",
                    borderBottom: "1px solid var(--border)", cursor: "pointer",
                  }}
                >
                  {/* Checkbox */}
                  <div className="flex items-center justify-center"
                    onClick={(e) => { e.stopPropagation(); onToggle(r.id); }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: isSelected ? "none" : "1.5px solid var(--border)",
                      backgroundColor: isSelected ? "var(--accent-blue)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isSelected && (
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                          <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </div>
                  {/* Status */}
                  <RowStatus r={r} />
                  {/* Frozen data columns */}
                  {frozenCols.map(c => (
                    <div key={c.key} style={{ overflow: "hidden", display: "flex", alignItems: "center" }}>
                      {c.render(r)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: scrollable pane (configurable columns) ── */}
        {activeCols.length > 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            {/* Header */}
            <div style={{ ...hdrStyle, display: "grid", gridTemplateColumns: rightTemplate, flexShrink: 0, overflowX: "hidden" }}>
              {activeCols.map(c => (
                <span key={c.key} className={c.align === "center" ? "text-center" : ""}
                  style={{ position: "relative", overflow: "visible", zIndex: 1 }}>
                  {c.label}
                  <div className="col-resize-handle" onMouseDown={(e) => startResize(e, c)} />
                </span>
              ))}
            </div>
            {/* Body */}
            <div ref={scrollBodyRef} onScroll={onScrollRight}
              style={{ overflowY: "auto", overflowX: "auto", maxHeight: maxBodyHeight, flex: 1 }}>
              <div style={{ minWidth: activeCols.map(c => getW(c)).reduce((a, b) => a + b, 0) + "px" }}>
                {receipts.map((r, i) => {
                  const isSelected = selectedIds.has(r.id);
                  return (
                    <div key={r.id}
                      onClick={() => selectMode ? onToggle(r.id) : onSelect(r.id)}
                      style={{
                        display: "grid", gridTemplateColumns: rightTemplate, gap: "8px",
                        alignItems: "center", padding: "0 8px", height: rowHeight,
                        backgroundColor: isSelected ? "rgba(59,130,246,0.08)" : i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-base)",
                        borderBottom: "1px solid var(--border)", cursor: "pointer",
                      }}
                    >
                      {activeCols.map(c => (
                        <div key={c.key}
                          style={{ overflow: "hidden", display: "flex", alignItems: "center", justifyContent: c.align === "center" ? "center" : "flex-start" }}>
                          {c.render(r)}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: "var(--text-secondary)", opacity: 0.6 }}>
        {children}
      </span>
      <div className="flex-1" style={{ height: 1, backgroundColor: "var(--border)" }} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs font-medium flex-shrink-0" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="text-sm text-right" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function EditParsedDetails({
  meta, onUpdate, inputStyle,
}: {
  meta: EditMeta;
  onUpdate: (field: keyof EditMeta, value: string) => void;
  inputStyle: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  function MI({ label, k }: { label: string; k: keyof EditMeta }) {
    return (
      <div>
        <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{label}</p>
        <input type="text" value={meta[k]} placeholder="—" onChange={e => onUpdate(k, e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none" style={inputStyle} />
      </div>
    );
  }
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium"
        style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)" }}>
        <span>Parsed Details</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="p-3 flex flex-col gap-3" style={{ backgroundColor: "var(--bg-base)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Store</p>
          <div className="grid grid-cols-2 gap-2">
            <div style={{ gridColumn: "span 2" }}><MI label="Address" k="store_address" /></div>
            <MI label="City" k="store_city" />
            <MI label="Postal Code" k="store_postal_code" />
            <MI label="Phone" k="store_phone" />
            <MI label="HST Registration #" k="hst_number" />
          </div>
          <p className="text-xs font-semibold mt-1" style={{ color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Transaction</p>
          <div className="grid grid-cols-3 gap-2">
            <MI label="Receipt #" k="receipt_number" />
            <MI label="Time" k="purchase_time" />
            <MI label="Cashier" k="cashier" />
          </div>
          <p className="text-xs font-semibold mt-1" style={{ color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Payment</p>
          <div className="grid grid-cols-3 gap-2">
            <MI label="Method" k="payment_method" />
            <MI label="Card Last 4" k="card_last4" />
            <MI label="Auth Code" k="auth_code" />
          </div>
          <p className="text-xs font-semibold mt-1" style={{ color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tax Breakdown</p>
          <div className="grid grid-cols-3 gap-2">
            <MI label="HST" k="tax_hst" />
            <MI label="GST" k="tax_gst" />
            <MI label="PST" k="tax_pst" />
            <MI label="Tip" k="tip" />
            <MI label="Tax Rate" k="tax_rate" />
          </div>
        </div>
      )}
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

function pad(label: string, width = 18): string {
  return label.padEnd(width);
}

function SavedReceiptText({ r }: { r: SavedReceipt }) {
  const W = 46;
  const div = "─".repeat(W);
  const lines: string[] = [];

  lines.push("VENDOR");
  lines.push(div);
  if (r.vendor)            lines.push(`${pad("Name")}${r.vendor}`);
  if (r.store_address)     lines.push(`${pad("Address")}${r.store_address}`);
  if (r.store_city)        lines.push(`${pad("City")}${r.store_city}`);
  if (r.store_postal_code) lines.push(`${pad("Postal Code")}${r.store_postal_code}`);
  if (r.store_phone)       lines.push(`${pad("Phone")}${r.store_phone}`);
  if (r.hst_number)        lines.push(`${pad("HST #")}${r.hst_number}`);

  lines.push("");
  lines.push("TRANSACTION");
  lines.push(div);
  if (r.date)              lines.push(`${pad("Date")}${r.date}`);
  if (r.purchase_time)     lines.push(`${pad("Time")}${r.purchase_time}`);
  if (r.receipt_number)    lines.push(`${pad("Receipt #")}${r.receipt_number}`);
  if (r.cashier)           lines.push(`${pad("Cashier")}${r.cashier}`);

  if (r.payment_method || r.card_last4 || r.auth_code) {
    lines.push("");
    lines.push("PAYMENT");
    lines.push(div);
    if (r.payment_method)  lines.push(`${pad("Method")}${r.payment_method}`);
    if (r.card_last4)      lines.push(`${pad("Card")}•••• ${r.card_last4}`);
    if (r.auth_code)       lines.push(`${pad("Auth Code")}${r.auth_code}`);
  }

  if (r.line_items && r.line_items.length > 0) {
    lines.push("");
    lines.push("LINE ITEMS");
    lines.push(div);
    r.line_items.forEach((item, i) => {
      const num = `${i + 1}.`.padEnd(4);
      lines.push(`${num}${item.description || "—"}${item.amount ? "  " + item.amount : ""}`);
      const meta: string[] = [];
      if (item.qty)        meta.push(`Qty: ${item.qty}`);
      if (item.unit_price) meta.push(`@ ${item.unit_price}`);
      if (item.sku)        meta.push(`SKU: ${item.sku}`);
      if (meta.length)     lines.push(`    ${meta.join("   ")}`);
    });
  }

  lines.push("");
  lines.push("TOTALS");
  lines.push(div);
  if (r.subtotal)  lines.push(`${pad("Subtotal")}${r.subtotal}`);
  if (r.tax_hst)   lines.push(`${pad("HST")}${r.tax_hst}${r.tax_rate ? `  (${r.tax_rate})` : ""}`);
  if (r.tax_gst)   lines.push(`${pad("GST")}${r.tax_gst}`);
  if (r.tax_pst)   lines.push(`${pad("PST")}${r.tax_pst}`);
  if (!r.tax_hst && !r.tax_gst && r.tax) lines.push(`${pad("Tax")}${r.tax}${r.tax_rate ? `  (${r.tax_rate})` : ""}`);
  if (r.tip)       lines.push(`${pad("Tip")}${r.tip}`);
  lines.push(`${pad("TOTAL")}${r.total || "—"}`);

  lines.push("");
  lines.push("CLASSIFICATION");
  lines.push(div);
  if (r.category)          lines.push(`${pad("Category")}${r.category}`);
  if (r.business_purpose)  lines.push(`${pad("Purpose")}${r.business_purpose}`);
  lines.push(`${pad("% Business Use")}${r.business_use_pct ?? 100}%`);

  return <>{lines.join("\n")}</>;
}

function SavedReceiptDetails({ r }: { r: SavedReceipt }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium"
        style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)" }}
      >
        <span>Full Receipt Text</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <pre className="px-4 py-3 text-xs leading-relaxed overflow-x-auto"
          style={{
            fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace",
            color: "var(--text-primary)",
            backgroundColor: "var(--bg-base)",
            whiteSpace: "pre",
            margin: 0,
          }}>
          <SavedReceiptText r={r} />
        </pre>
      )}
    </div>
  );
}
