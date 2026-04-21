"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getInvoices, addInvoice, updateInvoice, deleteInvoice,
  getBusinessProfile, saveBusinessProfile,
  getTemplates, saveTemplate, deleteTemplate,
  getSettings,
  type Invoice, type InvoiceLineItem, type BusinessProfile, type CustomColumn, type InvoiceTemplate, type AppSettings,
} from "@/lib/storage";
import AddressInput from "@/components/AddressInput";
import PageHelp from "@/components/PageHelp";
import { PAGE_HELP } from "@/lib/page-help-content";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

// Validate that a YYYY-MM-DD string is a real calendar date
function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return false;
  const [y, m, day] = iso.split("-").map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
}

// Parse flexible date strings → "YYYY-MM-DD". Returns "" if invalid/unparseable.
function parseFlexibleDate(input: string): string {
  const s = input.trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isValidIsoDate(s) ? s : "";
  const yr = new Date().getFullYear();
  const months: Record<string, string> = {
    jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
    jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
  };
  // "april 1" / "apr 1 2026"
  const txt = s.match(/^([a-z]+)\s+(\d{1,2})(?:[,\s]+(\d{4}))?$/i);
  if (txt) {
    const m = months[txt[1].toLowerCase().slice(0, 3)];
    if (m) {
      const result = `${txt[3] ?? yr}-${m}-${txt[2].padStart(2,"0")}`;
      return isValidIsoDate(result) ? result : "";
    }
  }
  // "4/1" / "4/1/26" / "4/1/2026" / "04-01" / "10.03" etc.
  const slsh = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?$/);
  if (slsh) {
    const m = slsh[1].padStart(2,"0");
    const d = slsh[2].padStart(2,"0");
    const y = slsh[3] ? (slsh[3].length === 2 ? `20${slsh[3]}` : slsh[3]) : String(yr);
    const result = `${y}-${m}-${d}`;
    return isValidIsoDate(result) ? result : "";
  }
  return "";
}

// Format a YYYY-MM-DD string for display according to user's setting
function formatDateDisplay(iso: string, fmt: AppSettings["invoiceDateFormat"]): string {
  if (!iso || !isValidIsoDate(iso)) return iso;
  const [y, m, d] = iso.split("-");
  if (fmt === "MM/DD/YYYY") return `${m}/${d}/${y}`;
  if (fmt === "DD/MM/YYYY") return `${d}/${m}/${y}`;
  return iso; // YYYY-MM-DD
}

// Simple smart date input: text box that auto-formats on blur, shows ⚠ if invalid
function SmartDateInput({ value, onChange, dateFormat, placeholder, className, style }: {
  value: string;
  onChange: (v: string) => void;
  dateFormat: AppSettings["invoiceDateFormat"];
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const displayValue = editing
    ? editText
    : (isValidIsoDate(value) ? formatDateDisplay(value, dateFormat) : value);

  const hasIssue = !!value && !isValidIsoDate(value);

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        value={displayValue}
        placeholder={placeholder}
        className={className}
        style={{ ...style, paddingRight: hasIssue ? "1.6rem" : undefined }}
        onFocus={() => {
          setEditText(isValidIsoDate(value) ? formatDateDisplay(value, dateFormat) : value);
          setEditing(true);
        }}
        onChange={(e) => setEditText(e.target.value)}
        onBlur={(e) => {
          setEditing(false);
          const raw = e.target.value.trim();
          if (!raw) { onChange(""); return; }
          const parsed = parseFlexibleDate(raw);
          onChange(parsed || raw); // store parsed ISO or raw (to allow ⚠ to show)
        }}
      />
      {hasIssue && (
        <span className="absolute right-2 pointer-events-none" title="Invalid date"
          style={{ color: "#f59e0b", fontSize: "12px", lineHeight: 1 }}>⚠</span>
      )}
    </div>
  );
}

// Detect issues on a saved invoice for ⚠ flagging in the list
function getInvoiceIssues(inv: Invoice): string[] {
  const issues: string[] = [];
  if (!inv.dateIssued || !isValidIsoDate(inv.dateIssued)) issues.push("Invalid issue date");
  if (inv.dateDue && !isValidIsoDate(inv.dateDue)) issues.push("Invalid due date");
  if (!inv.clientName?.trim()) issues.push("Missing client name");
  inv.lineItems.forEach((l, i) => {
    if (!l.description?.trim()) issues.push(`Line ${i + 1}: missing description`);
  });
  // Check custom date values
  (inv.customColumns ?? []).filter(c => c.type === "date").forEach(col => {
    inv.lineItems.forEach((l, i) => {
      const v = l.customValues?.[col.id];
      if (v && !isValidIsoDate(v)) issues.push(`Line ${i + 1}: invalid ${col.label}`);
    });
  });
  return issues;
}

// Preset columns available in the "Add Column" picker
const PRESET_COLUMNS = [
  { id: "qty",   label: "Qty",            type: "number" as const, note: "Auto-adds Rate" },
  { id: "rate",  label: "Rate",           type: "number" as const, note: "Auto-adds Qty" },
  { id: "_date", label: "Date",           type: "date"   as const, note: "" },
  { id: "_sku",  label: "SKU / Item Code",type: "text"   as const, note: "" },
  { id: "_hours",label: "Hours",          type: "number" as const, note: "" },
  { id: "_unit", label: "Unit",           type: "text"   as const, note: "" },
  { id: "_notes",label: "Notes",          type: "text"   as const, note: "" },
] as const;

function fmt(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function addDays(date: string, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isOverdue(inv: Invoice) {
  return inv.status !== "paid" && !!inv.dateDue && inv.dateDue < TODAY;
}

function calcTotals(inv: Pick<Invoice, "lineItems" | "hstRate" | "amountPaid">) {
  const subtotal = inv.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
  const hst      = subtotal * inv.hstRate;
  const total    = subtotal + hst;
  const owing    = total - inv.amountPaid;
  return { subtotal, hst, total, owing };
}

function nextInvoiceNo(invoices: Invoice[]) {
  const year = new Date().getFullYear();
  const nums = invoices
    .map((i) => parseInt(i.invoiceNo.replace(/\D/g, ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `INV-${year}-${String(next).padStart(4, "0")}`;
}

function newLine(): InvoiceLineItem {
  return { id: crypto.randomUUID(), description: "", qty: 1, rate: 0, customValues: {} };
}

// Try to parse and normalize all date values on an invoice draft.
// Returns the draft with any parseable raw dates converted to YYYY-MM-DD.
function normalizeDates<T extends Omit<Invoice, "id" | "createdAt">>(draft: T): T {
  function tryParse(v: string | undefined): string {
    if (!v) return v ?? "";
    if (isValidIsoDate(v)) return v;
    return parseFlexibleDate(v) || v; // keep raw if unparseable (will show ⚠)
  }
  return {
    ...draft,
    dateIssued: tryParse(draft.dateIssued),
    dateDue: tryParse(draft.dateDue),
    lineItems: draft.lineItems.map(l => ({
      ...l,
      customValues: Object.fromEntries(
        Object.entries(l.customValues ?? {}).map(([colId, val]) => {
          const col = (draft.customColumns ?? []).find(c => c.id === colId);
          if (col?.type === "date") return [colId, tryParse(val)];
          return [colId, val];
        })
      ),
    })),
  };
}

// ── PDF generation (shared) ───────────────────────────────────────────────────

async function buildPDF(inv: Invoice, biz: BusinessProfile) {
  const { jsPDF } = await import("jspdf");
  const autoTable  = (await import("jspdf-autotable")).default;

  const { subtotal, hst, total, owing } = calcTotals(inv);
  const overdue = isOverdue(inv);
  const statusLabel = inv.status === "paid" ? "PAID" : overdue ? "OVERDUE" : inv.status === "partial" ? "PARTIAL" : "UNPAID";

  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const margin = 20;

  const hide = new Set(biz.pdfHideFields ?? []);

  // ── Header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(29, 78, 216); // blue
  doc.text(biz.name || "Your Business", margin, 24);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  let bizY = 30;
  if (biz.address   && !hide.has("address"))   { doc.text(biz.address,              margin, bizY); bizY += 5; }
  if (biz.email     && !hide.has("email"))     { doc.text(biz.email,                margin, bizY); bizY += 5; }
  if (biz.phone     && !hide.has("phone"))     { doc.text(biz.phone,                margin, bizY); bizY += 5; }
  if (biz.hstNumber && !hide.has("hstNumber")) { doc.text(`HST# ${biz.hstNumber}`, margin, bizY); }

  // "INVOICE" + number (right side)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(17, 24, 39);
  doc.text("INVOICE", W - margin, 24, { align: "right" });
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(inv.invoiceNo, W - margin, 31, { align: "right" });

  // Status pill
  const statusColors: Record<string, [number, number, number]> = {
    PAID: [16, 185, 129], OVERDUE: [239, 68, 68], PARTIAL: [245, 158, 11], UNPAID: [59, 130, 246],
  };
  const [sr, sg, sb] = statusColors[statusLabel];
  doc.setFillColor(sr, sg, sb);
  doc.roundedRect(W - margin - 20, 34, 20, 7, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(statusLabel, W - margin - 10, 39, { align: "center" });

  // Divider
  doc.setDrawColor(229, 231, 235);
  doc.line(margin, 48, W - margin, 48);

  // ── Bill To + Details ──
  const infoY = 54;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text("BILL TO", margin, infoY);
  doc.text("DETAILS", W / 2 + 4, infoY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(inv.clientName, margin, infoY + 6);
  if (inv.clientAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(inv.clientAddress, margin, infoY + 12, { maxWidth: W / 2 - margin - 4 });
  }

  const detailRows: [string, string][] = [
    ["Date Issued", inv.dateIssued],
    ["Due Date",    inv.dateDue || "—"],
    ...(inv.paymentDate   ? [["Paid On", inv.paymentDate] as [string, string]] : []),
    ...(inv.paymentMethod ? [["Method",  inv.paymentMethod] as [string, string]] : []),
  ];
  let dY = infoY + 6;
  for (const [label, val] of detailRows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(label, W / 2 + 4, dY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(val, W - margin, dY, { align: "right" });
    dY += 6;
  }

  // ── Line items table ──
  const tableStartY = infoY + 34;

  const customColsMap = Object.fromEntries((inv.customColumns ?? []).map(c => [c.id, c]));
  const pdfOrder = inv.columnOrder ?? ["description", ...(inv.customColumns ?? []).map(c => c.id), "qty", "rate"];
  // Always append amount at the end
  const allColIds = [...pdfOrder, "amount"];

  const pdfHeaders = allColIds.map(id => {
    if (id === "description") return "Description";
    if (id === "qty") return "Qty";
    if (id === "rate") return "Rate";
    if (id === "amount") return "Amount";
    return customColsMap[id]?.label ?? id;
  });

  const colStyles: Record<number, object> = {};
  allColIds.forEach((id, i) => {
    if (id === "description") colStyles[i] = { cellWidth: "auto" };
    else if (id === "qty")    colStyles[i] = { halign: "center", cellWidth: 20 };
    else if (id === "rate")   colStyles[i] = { halign: "right", cellWidth: 35 };
    else if (id === "amount") colStyles[i] = { halign: "right", cellWidth: 35, fontStyle: "bold" };
    else                      colStyles[i] = { halign: "center", cellWidth: 28 };
  });

  autoTable(doc, {
    startY: tableStartY,
    head: [pdfHeaders],
    body: inv.lineItems.map((l) => allColIds.map(id => {
      if (id === "description") return l.description || "—";
      if (id === "qty")         return String(l.qty);
      if (id === "rate")        return fmt(l.rate);
      if (id === "amount")      return fmt(l.qty * l.rate);
      return l.customValues?.[id] || "—";
    })),
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [243, 244, 246], textColor: [107, 114, 128], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 9, textColor: [17, 24, 39] },
    columnStyles: colStyles,
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });

  // ── Totals ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterTable = (doc as any).lastAutoTable.finalY + 8;
  const totX = W - margin - 70;

  const totRows: [string, string, boolean?][] = [
    ["Subtotal",                             fmt(subtotal)],
    [`HST (${(inv.hstRate * 100).toFixed(0)}%)`, fmt(hst)],
    ...(inv.amountPaid > 0 ? [[`Amount Paid`, `-${fmt(inv.amountPaid)}`] as [string, string]] : []),
  ];

  let totY = afterTable;
  doc.setDrawColor(229, 231, 235);
  for (const [label, val] of totRows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(label, totX, totY);
    doc.setTextColor(17, 24, 39);
    doc.text(val, W - margin, totY, { align: "right" });
    totY += 7;
  }

  // Total due row
  doc.setFillColor(29, 78, 216);
  doc.roundedRect(totX - 4, totY - 4, W - margin - totX + 4 + 4, 10, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("Total Due", totX, totY + 3);
  doc.text(fmt(owing), W - margin, totY + 3, { align: "right" });
  totY += 14;

  // ── Notes ──
  if (inv.notes) {
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, totY, W - margin, totY);
    totY += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("NOTES", margin, totY);
    totY += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(inv.notes, margin, totY, { maxWidth: W - margin * 2 });
  }

  return doc;
}

async function downloadPDF(inv: Invoice, biz: BusinessProfile) {
  const doc = await buildPDF(inv, biz);
  doc.save(`${inv.invoiceNo}.pdf`);
}

async function previewPDF(inv: Invoice, biz: BusinessProfile): Promise<string> {
  const doc = await buildPDF(inv, biz);
  return doc.output("bloburl") as string;
}

// ── Status badge (clickable) ──────────────────────────────────────────────────

const STATUS_OPTIONS: Invoice["status"][] = ["unpaid", "partial", "paid"];
const STATUS_LABELS: Record<Invoice["status"], string> = { unpaid: "Unpaid", partial: "Partial", paid: "Paid" };
const STATUS_COLORS: Record<string, string> = { paid: "#10b981", partial: "#f59e0b", unpaid: "#3b82f6", overdue: "#ef4444" };

function statusColor(inv: Invoice) {
  return isOverdue(inv) ? STATUS_COLORS.overdue : STATUS_COLORS[inv.status];
}

function StatusSelect({ inv, onChange, onAmountPaid }: {
  inv: Invoice;
  onChange: (s: Invoice["status"]) => void;
  onAmountPaid: (n: number) => void;
}) {
  const color = statusColor(inv);
  const overdue = isOverdue(inv);
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="relative inline-flex items-center">
        <select
          value={inv.status}
          onChange={(e) => onChange(e.target.value as Invoice["status"])}
          className="appearance-none rounded-full text-xs font-bold pl-2.5 pr-6 py-0.5 cursor-pointer outline-none"
          style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}44` }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2" width="8" height="8"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" style={{ color }} />
        </svg>
      </div>
      {overdue && inv.status !== "paid" && (
        <span className="text-xs font-bold leading-none" style={{ color: STATUS_COLORS.overdue }}>⚠</span>
      )}
    </div>
  );
}

// ── Empty form ─────────────────────────────────────────────────────────────────

function emptyDraft(invoices: Invoice[]): Omit<Invoice, "id" | "createdAt"> {
  return {
    invoiceNo: nextInvoiceNo(invoices),
    dateIssued: TODAY,
    dateDue: "",
    clientName: "",
    clientAddress: "",
    lineItems: [newLine()],
    customColumns: [],
    columnOrder: ["description", "rate"],
    hstRate: 0.13,
    notes: "",
    status: "unpaid",
    amountPaid: 0,
    paymentDate: "",
    paymentMethod: "",
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Filter = "all" | "unpaid" | "partial" | "paid" | "overdue";

export default function InvoicesPage() {
  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [biz, setBiz]               = useState<BusinessProfile>({ name: "", address: "", hstNumber: "", email: "", phone: "" });
  const [filter, setFilter]         = useState<Filter>("all");
  const [showForm, setShowForm]     = useState(false);
  const [showBiz, setShowBiz]       = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [draft, setDraft]           = useState<Omit<Invoice, "id" | "createdAt">>(() => emptyDraft([]));
  const [bizDraft, setBizDraft]     = useState<BusinessProfile>({ name: "", address: "", hstNumber: "", email: "", phone: "" });
  const [importing, setImporting]   = useState(false);
  const [importError, setImportError] = useState("");
  const importRef                   = useRef<HTMLInputElement>(null);
  // AI assistant
  const [showAI, setShowAI]         = useState(false);
  const [aiPrompt, setAiPrompt]     = useState("");
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiError, setAiError]       = useState("");
  // Drag-to-reorder lines
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  // Drag-to-reorder columns (use column id, not index)
  const [draggingColId, setDraggingColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  // Column picker
  const [showColPicker, setShowColPicker] = useState(false);
  const [customColName, setCustomColName] = useState("");
  const colPickerRef = useRef<HTMLDivElement>(null);
  // PDF preview
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl]   = useState("");
  const [dateFormat, setDateFormat]   = useState<AppSettings["invoiceDateFormat"]>("YYYY-MM-DD");
  // Templates
  const [templates, setTemplates]       = useState<InvoiceTemplate[]>([]);
  const [showTemplateName, setShowTemplateName] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const templatePickerRef = useRef<HTMLDivElement>(null);

  // Escape key — close invoice form (confirm if dirty), close biz modal
  const draftSnapshotRef = useRef<string>("");
  useEffect(() => {
    if (showForm) draftSnapshotRef.current = JSON.stringify(draft);
  }, [showForm]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const anyModal = showForm || showBiz;
    if (!anyModal) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showForm) {
        const dirty = JSON.stringify(draft) !== draftSnapshotRef.current;
        if (dirty) {
          if (window.confirm("You have unsaved changes. Discard and close?")) setShowForm(false);
        } else {
          setShowForm(false);
        }
      } else if (showBiz) {
        setShowBiz(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showForm, showBiz, draft]);

  useEffect(() => {
    const inv = getInvoices();
    setInvoices(inv);
    const b = getBusinessProfile();
    setBiz(b);
    setBizDraft(b);
    setTemplates(getTemplates());
    const fmt = getSettings().invoiceDateFormat;
    setDateFormat(fmt);
    // Normalize any raw date strings on all stored invoices
    const raw = getInvoices();
    let changed = false;
    raw.forEach(inv => {
      const base = { ...inv, customColumns: inv.customColumns ?? [] };
      const norm = normalizeDates(base);
      if (JSON.stringify(norm) !== JSON.stringify(base)) {
        updateInvoice(inv.id, norm);
        changed = true;
      }
    });
    if (changed) setInvoices(getInvoices());
  }, []);

  useEffect(() => {
    if (!showColPicker) return;
    function handleClick(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setShowColPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showColPicker]);

  useEffect(() => {
    if (!showTemplatePicker) return;
    function handleClick(e: MouseEvent) {
      if (templatePickerRef.current && !templatePickerRef.current.contains(e.target as Node)) {
        setShowTemplatePicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTemplatePicker]);

  // ── Computed ──

  const filtered = invoices.filter((inv) => {
    if (filter === "all")     return true;
    if (filter === "overdue") return isOverdue(inv);
    return inv.status === filter;
  });

  const totalOutstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + calcTotals(i).owing, 0);
  const totalPaid        = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + calcTotals(i).total, 0);
  const overdueCount     = invoices.filter(isOverdue).length;

  // ── Handlers ──

  function openCreate() {
    setDraft(emptyDraft(invoices));
    setEditId(null);
    setShowAI(false);
    setAiPrompt("");
    setAiError("");
    setShowForm(true);
  }

  function openEdit(inv: Invoice) {
    const base = { ...inv, customColumns: inv.customColumns ?? [] };
    const normalized = normalizeDates(base);
    // If normalization changed anything, persist it immediately
    if (JSON.stringify(normalized) !== JSON.stringify(base)) {
      updateInvoice(inv.id, normalized);
      setInvoices(getInvoices());
    }
    setDraft(normalized);
    setEditId(inv.id);
    setShowAI(false);
    setAiPrompt("");
    setAiError("");
    setShowForm(true);
  }

  function save() {
    if (!draft.clientName || !draft.dateIssued) return;
    if (editId) {
      if (!window.confirm("Save changes to this invoice?")) return;
      updateInvoice(editId, draft);
    } else {
      addInvoice({ ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    }
    setInvoices(getInvoices());
    setShowForm(false);
  }

  function del(id: string) {
    if (!window.confirm("Delete this invoice? This cannot be undone.")) return;
    deleteInvoice(id);
    setInvoices(getInvoices());
  }

  function saveBiz() {
    saveBusinessProfile(bizDraft);
    setBiz(bizDraft);
    setShowBiz(false);
  }

  async function handleImport(file: File) {
    setImporting(true);
    setImportError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch("/api/parse-invoice", { method: "POST", body: form });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Pre-fill the create form with parsed data, let user review before saving
      const current = getInvoices();
      setDraft({
        invoiceNo:     data.invoiceNo     || nextInvoiceNo(current),
        dateIssued:    data.dateIssued    || TODAY,
        dateDue:       data.dateDue       || "",
        clientName:    data.clientName    || "",
        clientAddress: data.clientAddress || "",
        lineItems:     data.lineItems?.length ? data.lineItems : [newLine()],
        customColumns: [],
        hstRate:       typeof data.hstRate === "number" ? data.hstRate : 0.13,
        notes:         data.notes         || "",
        status:        data.status        || "unpaid",
        amountPaid:    data.amountPaid    || 0,
        paymentDate:   data.paymentDate   || "",
        paymentMethod: data.paymentMethod || "",
      });
      setEditId(null);
      setShowForm(true);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to parse invoice");
    }
    setImporting(false);
  }

  async function runAI() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch("/api/invoice-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, draft }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDraft((d) => ({
        ...d,
        ...data.patch,
        lineItems: data.patch.lineItems
          ? data.patch.lineItems.map((l: Partial<InvoiceLineItem>) => ({ ...newLine(), ...l }))
          : d.lineItems,
      }));
      setAiPrompt("");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI request failed");
    }
    setAiLoading(false);
  }

  // Helpers for column order
  function getColOrder(d: typeof draft) {
    return d.columnOrder ?? ["description", ...(d.customColumns ?? []).map(c => c.id), "qty", "rate"];
  }

  function addPresetCol(presetId: string, customLabel?: string) {
    setDraft((d) => {
      const order = [...getColOrder(d)];

      if (presetId === "qty") {
        if (order.includes("qty")) return d;
        // Insert qty before rate if rate exists, else at end
        const ri = order.indexOf("rate");
        if (ri >= 0) order.splice(ri, 0, "qty");
        else order.push("qty");
        // Auto-add rate if missing
        if (!order.includes("rate")) order.push("rate");
        return { ...d, columnOrder: order };
      }

      if (presetId === "rate") {
        if (order.includes("rate")) return d;
        // Auto-add qty too
        if (!order.includes("qty")) order.push("qty");
        order.push("rate");
        return { ...d, columnOrder: order };
      }

      // Custom or preset non-builtin column
      const preset = PRESET_COLUMNS.find(p => p.id === presetId);
      const label = customLabel ?? preset?.label ?? "Column";
      const type: CustomColumn["type"] = preset?.type === "date" ? "date" : preset?.type === "number" ? "number" : "text";
      const col: CustomColumn = { id: crypto.randomUUID(), label, type };

      // Date goes at the very beginning (position 0, left of description)
      if (presetId === "_date") {
        order.splice(0, 0, col.id);
        return { ...d, customColumns: [...(d.customColumns ?? []), col], columnOrder: order };
      }

      // Hours or Unit → auto-add Rate (they're quantity-like multipliers)
      let extraOrder = order;
      if ((presetId === "_hours" || presetId === "_unit") && !order.includes("rate")) {
        if (!order.includes("qty") && !order.includes("rate")) {
          // add rate at the end
          extraOrder = [...order, "rate"];
        } else if (!order.includes("rate")) {
          extraOrder = [...order, "rate"];
        }
      }

      // Insert before qty/rate if they exist, otherwise at end
      const qi = extraOrder.indexOf("qty");
      const ri = extraOrder.indexOf("rate");
      const insertBefore = qi >= 0 ? qi : ri >= 0 ? ri : extraOrder.length;
      extraOrder.splice(insertBefore, 0, col.id);
      return { ...d, customColumns: [...(d.customColumns ?? []), col], columnOrder: extraOrder };
    });
    setShowColPicker(false);
    setCustomColName("");
  }

  function updateCustomColLabel(id: string, label: string) {
    setDraft((d) => ({
      ...d,
      customColumns: (d.customColumns ?? []).map((c) => c.id === id ? { ...c, label } : c),
    }));
  }

  function removeCustomCol(id: string) {
    setDraft((d) => ({
      ...d,
      customColumns: (d.customColumns ?? []).filter((c) => c.id !== id),
      columnOrder: getColOrder(d).filter(cid => cid !== id),
      lineItems: d.lineItems.map((l) => {
        const cv = { ...l.customValues };
        delete cv[id];
        return { ...l, customValues: cv };
      }),
    }));
  }

  // Remove built-in columns (qty/rate) from columnOrder
  function removeBuiltinCol(id: "qty" | "rate") {
    setDraft((d) => {
      let order = getColOrder(d).filter(cid => cid !== id);
      // If removing rate, also remove qty (qty without rate is meaningless)
      if (id === "rate") order = order.filter(cid => cid !== "qty");
      return { ...d, columnOrder: order };
    });
  }

  function moveCol(id: string, dir: -1 | 1) {
    setDraft((d) => {
      const order = [...getColOrder(d)];
      const idx = order.indexOf(id);
      if (idx < 0) return d;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= order.length) return d;
      [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
      return { ...d, columnOrder: order };
    });
  }

  function reorderCol(fromId: string, toId: string) {
    if (fromId === toId) return;
    setDraft((d) => {
      const order = [...getColOrder(d)];
      const fi = order.indexOf(fromId);
      const ti = order.indexOf(toId);
      if (fi < 0 || ti < 0) return d;
      order.splice(fi, 1);
      order.splice(ti, 0, fromId);
      return { ...d, columnOrder: order };
    });
  }

  function setLine(idx: number, patch: Partial<InvoiceLineItem>) {
    setDraft((d) => {
      const lineItems = d.lineItems.map((l, i) => i === idx ? { ...l, ...patch } : l);
      return { ...d, lineItems };
    });
  }

  function addLine() {
    setDraft((d) => ({ ...d, lineItems: [...d.lineItems, newLine()] }));
  }

  function removeLine(idx: number) {
    setDraft((d) => ({ ...d, lineItems: d.lineItems.filter((_, i) => i !== idx) }));
  }

  function moveLine(from: number, to: number) {
    if (from === to) return;
    setDraft((d) => {
      const items = [...d.lineItems];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...d, lineItems: items };
    });
  }

  async function handlePreview() {
    const url = await previewPDF(draft as Invoice, biz);
    setPreviewUrl(url);
    setShowPreview(true);
  }

  function handleSaveTemplate() {
    if (!templateName.trim()) return;
    const t: InvoiceTemplate = {
      id: crypto.randomUUID(),
      name: templateName.trim(),
      createdAt: new Date().toISOString(),
      columnOrder: draft.columnOrder ?? ["description", "rate"],
      customColumns: draft.customColumns ?? [],
      lineItems: draft.lineItems,
      hstRate: draft.hstRate,
      notes: draft.notes,
      clientName: draft.clientName,
      clientAddress: draft.clientAddress,
    };
    saveTemplate(t);
    setTemplates(getTemplates());
    setTemplateName("");
    setShowTemplateName(false);
  }

  function applyTemplate(t: InvoiceTemplate) {
    setDraft(d => ({
      ...d,
      columnOrder: t.columnOrder,
      customColumns: t.customColumns,
      lineItems: t.lineItems.map(l => ({ ...l, id: crypto.randomUUID() })),
      hstRate: t.hstRate,
      notes: t.notes,
      clientName: t.clientName ?? d.clientName,
      clientAddress: t.clientAddress ?? d.clientAddress,
    }));
    setShowTemplatePicker(false);
  }

  function handleDeleteTemplate(id: string) {
    deleteTemplate(id);
    setTemplates(getTemplates());
  }

  const { subtotal, hst, total, owing } = calcTotals(draft);

  // ── Column order helpers ───────────────────────────────────────────────────────
  const colOrder = draft.columnOrder ?? ["description"];
  const hasRateCol = colOrder.includes("rate");
  const hasQtyCol  = colOrder.includes("qty");
  // When no rate column, amount is directly editable (sets line.rate, qty fixed at 1)
  const amountEditable = !hasRateCol;

  function colWidth(id: string) {
    if (id === "description") return "1fr";
    if (id === "qty") return "60px";
    if (id === "rate") return "90px";
    return "96px";
  }
  function colLabel(id: string) {
    if (id === "description") return "Description";
    if (id === "qty") return "Qty";
    if (id === "rate") return "Rate";
    return (draft.customColumns ?? []).find(c => c.id === id)?.label ?? id;
  }
  function colAlign(id: string): "left" | "center" | "right" {
    if (id === "description") return "left";
    if (id === "qty") return "center";
    if (id === "rate") return "right";
    return "center";
  }

  const gridTemplate = `18px ${colOrder.map(colWidth).join(" ")} ${amountEditable ? "96px" : "80px"} 28px`;

  // ── Render ────────────────────────────────────────────────────────────────────

  const filterTabs: { key: Filter; label: string }[] = [
    { key: "all",     label: "All" },
    { key: "unpaid",  label: "Unpaid" },
    { key: "partial", label: "Partial" },
    { key: "overdue", label: "Overdue" },
    { key: "paid",    label: "Paid" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-5 py-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Invoices</h1>
            <PageHelp content={PAGE_HELP.invoices} />
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Create, track, and export invoices for your Ontario corporation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setBizDraft(biz); setShowBiz(true); }}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            Business Info
          </button>
          {/* Hidden file input for import */}
          <input ref={importRef} type="file" accept=".pdf,image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }} />
          <button onClick={() => importRef.current?.click()} disabled={importing}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: importing ? "var(--text-secondary)" : "var(--text-primary)" }}>
            {importing ? "Parsing…" : "↑ Import Invoice"}
          </button>
          <button onClick={openCreate}
            className="px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>
            + New Invoice
          </button>
        </div>
        {importError && (
          <p className="text-xs mt-1 text-right" style={{ color: "#ef4444" }}>{importError}</p>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {[
          { label: "Outstanding", value: fmt(totalOutstanding), color: "#f59e0b" },
          { label: "Collected (all time)", value: fmt(totalPaid), color: "#10b981" },
          { label: "Overdue", value: overdueCount > 0 ? `${overdueCount} invoice${overdueCount !== 1 ? "s" : ""}` : "None", color: overdueCount > 0 ? "#ef4444" : "var(--text-secondary)" },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl px-5 py-4"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{c.label}</div>
            <div className="text-xl font-bold" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + list */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
          {filterTabs.map((t) => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className="px-3 py-1 rounded-lg text-xs transition-colors"
              style={{
                fontWeight: filter === t.key ? 600 : 400,
                backgroundColor: filter === t.key ? "var(--bg-elevated)" : "transparent",
                color: filter === t.key ? "var(--text-primary)" : "var(--text-secondary)",
              }}>
              {t.label}
              {t.key === "overdue" && overdueCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs" style={{ backgroundColor: "#ef444422", color: "#ef4444" }}>{overdueCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            No invoices yet.{" "}
            <button onClick={openCreate} style={{ color: "var(--accent-blue)", fontWeight: 600 }}>Create one</button>
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ backgroundColor: "var(--bg-base)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
                  {["Invoice #", "Client", "Issued / Due", "Total", "Owing", "Status", "Paid", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium" style={{ whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const t = calcTotals(inv);
                  const issues = getInvoiceIssues(inv);
                  return (
                    <tr key={inv.id} style={{ borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-elevated)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold" style={{ color: "var(--accent-blue)" }}>
                        <div className="flex items-center gap-1.5">
                          {inv.invoiceNo}
                          {issues.length > 0 && (
                            <span title={issues.join("\n")} style={{ color: "#f59e0b", fontSize: "12px", cursor: "default" }}>⚠</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>{inv.clientName}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ whiteSpace: "nowrap" }}>
                        <span style={{ color: isValidIsoDate(inv.dateIssued) ? "var(--text-secondary)" : "#f59e0b" }}>
                          {isValidIsoDate(inv.dateIssued) ? formatDateDisplay(inv.dateIssued, dateFormat) : (inv.dateIssued || "—")}
                        </span>
                        {inv.dateDue && (
                          <span style={{ color: !isValidIsoDate(inv.dateDue) ? "#f59e0b" : isOverdue(inv) ? "#ef4444" : "var(--text-secondary)", opacity: 0.8 }}>
                            {" · "}{isValidIsoDate(inv.dateDue) ? formatDateDisplay(inv.dateDue, dateFormat) : inv.dateDue}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{fmt(t.total)}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: t.owing > 0 ? "#f59e0b" : "#10b981" }}>{fmt(t.owing)}</td>
                      <td className="px-4 py-2.5">
                        <StatusSelect inv={inv}
                          onChange={(s) => { updateInvoice(inv.id, { status: s, amountPaid: s === "paid" ? calcTotals(inv).total : s === "unpaid" ? 0 : inv.amountPaid }); setInvoices(getInvoices()); }}
                          onAmountPaid={(n) => { updateInvoice(inv.id, { amountPaid: n }); setInvoices(getInvoices()); }}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        {inv.status === "partial" ? (
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={inv.amountPaid || ""}
                            placeholder="$ paid"
                            onChange={(e) => { updateInvoice(inv.id, { amountPaid: parseFloat(e.target.value) || 0 }); setInvoices(getInvoices()); }}
                            className="outline-none text-xs w-20 rounded-md px-2 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            style={{ color: "#f59e0b", backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)", fontWeight: 400 }}
                          />
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => downloadPDF(inv, biz)} className="text-xs px-2 py-0.5 rounded"
                            style={{ color: "#10b981", backgroundColor: "rgba(16,185,129,0.1)" }}>↓ PDF</button>
                          <button onClick={() => openEdit(inv)} className="text-xs px-2 py-0.5 rounded"
                            style={{ color: "var(--accent-blue)", backgroundColor: "rgba(59,130,246,0.1)" }}>Edit</button>
                          <button onClick={() => del(inv.id)} className="text-xs px-2 py-0.5 rounded"
                            style={{ color: "#f87171", backgroundColor: "rgba(248,113,113,0.1)" }}>Del</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Invoice form modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-2xl rounded-2xl flex flex-col max-h-[92vh]"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                {editId ? "Edit Invoice" : "New Invoice"}
              </h2>
              <div className="flex items-center gap-2">
                {/* Template picker */}
                <div className="relative" ref={templatePickerRef}>
                  <button onClick={() => setShowTemplatePicker(v => !v)}
                    className="text-xs px-2.5 py-1 rounded"
                    style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                    Templates {templates.length > 0 && `(${templates.length})`}
                  </button>
                  {showTemplatePicker && (
                    <div className="absolute right-0 top-full mt-1 z-30 rounded-xl shadow-xl min-w-56"
                      style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                      <div className="px-3 py-2 text-xs font-semibold" style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
                        Saved Templates
                      </div>
                      {templates.length === 0 ? (
                        <div className="px-3 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>No templates yet. Save one below.</div>
                      ) : (
                        <div className="py-1 max-h-48 overflow-y-auto">
                          {templates.map(t => (
                            <div key={t.id} className="flex items-center justify-between px-3 py-1.5 gap-2 group">
                              <button onClick={() => applyTemplate(t)}
                                className="flex-1 text-left text-xs" style={{ color: "var(--text-primary)" }}>
                                {t.name}
                              </button>
                              <button onClick={() => handleDeleteTemplate(t.id)}
                                className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ color: "#f87171" }}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Save current as template */}
                      <div className="px-3 py-2" style={{ borderTop: "1px solid var(--border)" }}>
                        {showTemplateName ? (
                          <div className="flex gap-1.5">
                            <input
                              autoFocus
                              value={templateName}
                              onChange={(e) => setTemplateName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleSaveTemplate(); if (e.key === "Escape") setShowTemplateName(false); }}
                              placeholder="Template name…"
                              className="flex-1 rounded px-2 py-1 text-xs outline-none"
                              style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                            />
                            <button onClick={handleSaveTemplate} disabled={!templateName.trim()}
                              className="px-2 py-1 rounded text-xs font-medium"
                              style={{ backgroundColor: "var(--accent-blue)", color: "#fff", opacity: templateName.trim() ? 1 : 0.4 }}>
                              Save
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setShowTemplateName(true)}
                            className="w-full text-left text-xs"
                            style={{ color: "var(--accent-blue)" }}>
                            + Save current as template
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={() => setShowForm(false)} style={{ color: "var(--text-secondary)" }}>✕</button>
              </div>
            </div>

            <div className="overflow-y-auto overflow-x-hidden flex-1 px-5 py-4 flex flex-col gap-4">

              {/* Invoice # + Dates */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Invoice #</label>
                  <input type="text" value={draft.invoiceNo}
                    onChange={(e) => setDraft((d) => ({ ...d, invoiceNo: e.target.value }))}
                    className="rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                </div>
                {(["dateIssued", "dateDue"] as const).map((key) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                      {key === "dateIssued" ? "Date Issued *" : "Due Date"}
                    </label>
                    <SmartDateInput
                      value={(draft[key] as string) ?? ""}
                      onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                      dateFormat={dateFormat}
                      placeholder={dateFormat === "MM/DD/YYYY" ? "mm/dd/yyyy" : dateFormat === "DD/MM/YYYY" ? "dd/mm/yyyy" : "yyyy-mm-dd"}
                      className="rounded-lg px-3 py-2 text-sm outline-none w-full"
                      style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>
                ))}
              </div>

              {/* Client */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Client Name *</label>
                  <input value={draft.clientName} onChange={(e) => setDraft((d) => ({ ...d, clientName: e.target.value }))}
                    placeholder="Acme Inc." className="rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Client Address</label>
                  <AddressInput
                    value={draft.clientAddress}
                    onChange={(v) => setDraft((d) => ({ ...d, clientAddress: v }))}
                    onSelect={(p) => setDraft((d) => ({ ...d, clientAddress: p.label }))}
                    placeholder="123 Main St, Toronto, ON"
                  />
                </div>
              </div>

              {/* Line items */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Line Items</label>
                  <div className="flex gap-1.5 items-center relative" ref={colPickerRef}>
                    <button onClick={() => { setShowColPicker(v => !v); setCustomColName(""); }}
                      className="text-xs px-2.5 py-1 rounded"
                      style={{ color: "var(--accent-blue)", backgroundColor: showColPicker ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.1)", border: showColPicker ? "1px solid rgba(59,130,246,0.4)" : "1px solid transparent" }}>
                      + Add Column
                    </button>
                    <button onClick={addLine} className="text-xs px-2.5 py-1 rounded"
                      style={{ color: "var(--accent-blue)", backgroundColor: "rgba(59,130,246,0.1)" }}>+ Add Line</button>

                    {/* Column picker dropdown */}
                    {showColPicker && (
                      <div className="absolute right-0 top-full mt-1 z-20 rounded-xl shadow-xl min-w-52"
                        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                        <div className="px-3 py-2 text-xs font-semibold" style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
                          Add Column
                        </div>
                        <div className="py-1">
                          {PRESET_COLUMNS.map(p => {
                            const alreadyAdded = (p.id === "qty" && hasQtyCol) || (p.id === "rate" && hasRateCol);
                            return (
                              <button key={p.id} onClick={() => !alreadyAdded && addPresetCol(p.id)}
                                disabled={alreadyAdded}
                                className="w-full text-left px-3 py-1.5 text-xs"
                                style={{ color: alreadyAdded ? "var(--text-secondary)" : "var(--text-primary)", opacity: alreadyAdded ? 0.4 : 1 }}>
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="px-3 py-2" style={{ borderTop: "1px solid var(--border)" }}>
                          <div className="flex gap-1.5">
                            <input
                              value={customColName}
                              onChange={(e) => setCustomColName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter" && customColName.trim()) addPresetCol("_custom", customColName.trim()); }}
                              placeholder="Custom column name…"
                              className="flex-1 rounded px-2 py-1 text-xs outline-none"
                              style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                            />
                            <button onClick={() => { if (customColName.trim()) addPresetCol("_custom", customColName.trim()); }}
                              disabled={!customColName.trim()}
                              className="px-2 py-1 rounded text-xs font-medium"
                              style={{ backgroundColor: "var(--accent-blue)", color: "#fff", opacity: customColName.trim() ? 1 : 0.4 }}>
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl scroll-x" style={{ border: "1px solid var(--border)" }}>
                  {/* Header — all columns are draggable */}
                  <div className="grid px-3 py-1.5 text-xs font-medium"
                    onDragOver={(e) => e.preventDefault()}
                    style={{ gridTemplateColumns: gridTemplate, gap: 8, minWidth: Math.max(360, colOrder.length * 88 + 200), backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
                    <span />
                    {colOrder.map((id, colIdx) => {
                      const isCustom = id !== "description" && id !== "qty" && id !== "rate";
                      const isBuiltin = id === "qty" || id === "rate";
                      const customCol = isCustom ? (draft.customColumns ?? []).find(c => c.id === id) : null;
                      const align = colAlign(id);
                      const canMoveLeft  = colIdx > 0;
                      const canMoveRight = colIdx < colOrder.length - 1;
                      const canDelete    = isBuiltin || isCustom;
                      const textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";
                      return (
                        <div key={id}
                          draggable
                          onDragStart={() => setDraggingColId(id)}
                          onDragOver={(e) => { e.preventDefault(); setDragOverColId(id); }}
                          onDrop={() => { if (draggingColId) reorderCol(draggingColId, id); setDraggingColId(null); setDragOverColId(null); }}
                          onDragEnd={() => { setDraggingColId(null); setDragOverColId(null); }}
                          className="relative group min-w-0 flex items-center"
                          style={{
                            opacity: draggingColId === id ? 0.4 : 1,
                            backgroundColor: dragOverColId === id && draggingColId !== id ? "rgba(59,130,246,0.12)" : "transparent",
                            cursor: "grab",
                          }}>
                          {/* Label — always fills cell and respects alignment */}
                          {isCustom && customCol ? (
                            <input
                              value={customCol.label}
                              onChange={(e) => updateCustomColLabel(id, e.target.value)}
                              onFocus={(e) => e.target.select()}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="w-full min-w-0 text-xs outline-none bg-transparent font-medium truncate"
                              style={{ color: "var(--text-primary)", cursor: "text", textAlign }}
                            />
                          ) : (
                            <span className="w-full truncate font-medium" style={{ textAlign, display: "block" }}>{colLabel(id)}</span>
                          )}
                          {/* Controls — absolutely positioned, appear on hover, don't affect layout */}
                          <div className="absolute inset-0 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); moveCol(id, -1); }}
                              disabled={!canMoveLeft}
                              className="pointer-events-auto leading-none px-0.5"
                              style={{ color: canMoveLeft ? "var(--accent-blue)" : "transparent", fontSize: "10px" }}>‹</button>
                            <div className="flex items-center gap-0.5 pointer-events-auto">
                              {canDelete && (
                                <button onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); isBuiltin ? removeBuiltinCol(id as "qty"|"rate") : removeCustomCol(id); }}
                                  className="leading-none" style={{ color: "#f87171", fontSize: "11px" }}>×</button>
                              )}
                              <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); moveCol(id, 1); }}
                                disabled={!canMoveRight}
                                className="leading-none px-0.5"
                                style={{ color: canMoveRight ? "var(--accent-blue)" : "transparent", fontSize: "10px" }}>›</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <span className="text-right font-medium">Amount</span>
                    <span />
                  </div>

                  {/* Rows */}
                  {draft.lineItems.map((line, idx) => (
                    <div key={line.id}
                      draggable
                      onDragStart={() => setDraggingIdx(idx)}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                      onDrop={() => { if (draggingIdx !== null) moveLine(draggingIdx, idx); setDraggingIdx(null); setDragOverIdx(null); }}
                      onDragEnd={() => { setDraggingIdx(null); setDragOverIdx(null); }}
                      className="grid px-3 py-2 items-center group"
                      style={{
                        gridTemplateColumns: gridTemplate,
                        gap: 8,
                        minWidth: Math.max(360, colOrder.length * 88 + 200),
                        borderBottom: idx < draft.lineItems.length - 1 ? "1px solid var(--border)" : "none",
                        opacity: draggingIdx === idx ? 0.4 : 1,
                        backgroundColor: dragOverIdx === idx && draggingIdx !== idx ? "rgba(59,130,246,0.06)" : "transparent",
                        transition: "background-color 0.1s",
                      }}>
                      <span className="flex items-center justify-center cursor-grab select-none opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-secondary)", fontSize: "12px", lineHeight: 1 }}>⠿</span>
                      {colOrder.map((id) => {
                        if (id === "description") return (
                          <input key="desc" value={line.description} onChange={(e) => setLine(idx, { description: e.target.value })}
                            placeholder="Service description" className="rounded px-2 py-1 text-xs outline-none"
                            style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                        );
                        if (id === "qty") return (
                          <input key="qty" type="number" min="0" step="0.01"
                            value={line.qty === 0 ? "" : line.qty}
                            placeholder="1"
                            onChange={(e) => setLine(idx, { qty: parseFloat(e.target.value) || 0 })}
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => setLine(idx, { qty: Math.round((parseFloat(e.target.value) || 0) * 100) / 100 })}
                            className="rounded px-2 py-1 text-xs outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                        );
                        if (id === "rate") return (
                          <input key="rate" type="number" min="0" step="0.01"
                            value={line.rate === 0 ? "" : line.rate}
                            placeholder="0.00"
                            onChange={(e) => setLine(idx, { rate: parseFloat(e.target.value) || 0 })}
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => setLine(idx, { rate: Math.round((parseFloat(e.target.value) || 0) * 100) / 100 })}
                            className="rounded px-2 py-1 text-xs outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                        );
                        const col = (draft.customColumns ?? []).find(c => c.id === id);
                        if (!col) return null;
                        if (col.type === "date") {
                          const dateVal = line.customValues?.[id] ?? "";
                          const dateInvalid = !!dateVal && !isValidIsoDate(dateVal);
                          return (
                            <div key={id} className="relative flex items-center">
                              <input
                                type="text"
                                value={dateVal}
                                onChange={(e) => setLine(idx, { customValues: { ...line.customValues, [id]: e.target.value } })}
                                onBlur={(e) => {
                                  const raw = e.target.value.trim();
                                  if (!raw) return;
                                  const parsed = parseFlexibleDate(raw);
                                  setLine(idx, { customValues: { ...line.customValues, [id]: parsed || raw } });
                                }}
                                placeholder={col.label}
                                className="rounded px-2 py-1 text-xs outline-none text-center w-full"
                                style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", paddingRight: dateInvalid ? "1.4rem" : undefined }} />
                              {dateInvalid && (
                                <span className="absolute right-1.5 pointer-events-none" title="Invalid date"
                                  style={{ color: "#f59e0b", fontSize: "11px" }}>⚠</span>
                              )}
                            </div>
                          );
                        }
                        if (col.type === "number") return (
                          <input key={id}
                            type="number" min="0" step="0.01"
                            value={line.customValues?.[id] ?? ""}
                            placeholder="0"
                            onChange={(e) => setLine(idx, { customValues: { ...line.customValues, [id]: e.target.value } })}
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => {
                              const v = Math.round((parseFloat(e.target.value) || 0) * 100) / 100;
                              setLine(idx, { customValues: { ...line.customValues, [id]: String(v) } });
                            }}
                            className="rounded px-2 py-1 text-xs outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                        );
                        return (
                          <input key={id}
                            type="text"
                            value={line.customValues?.[id] ?? ""}
                            placeholder={col.label}
                            onChange={(e) => setLine(idx, { customValues: { ...line.customValues, [id]: e.target.value } })}
                            className="rounded px-2 py-1 text-xs outline-none text-center"
                            style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                        );
                      })}
                      {amountEditable ? (
                        <input
                          type="number" min="0" step="0.01"
                          value={line.rate}
                          onChange={(e) => setLine(idx, { rate: parseFloat(e.target.value) || 0, qty: 1 })}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => setLine(idx, { rate: Math.round((parseFloat(e.target.value) || 0) * 100) / 100, qty: 1 })}
                          className="rounded px-2 py-1 text-xs outline-none text-right font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--accent-blue)" }} />
                      ) : (
                        <span className="text-xs text-right font-semibold" style={{ color: "var(--accent-blue)" }}>{fmt(line.qty * line.rate)}</span>
                      )}
                      <button onClick={() => removeLine(idx)} disabled={draft.lineItems.length <= 1}
                        className="text-xs flex items-center justify-center w-6 h-6 rounded"
                        style={{ color: draft.lineItems.length <= 1 ? "var(--border)" : "#f87171" }}>×</button>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="flex justify-end">
                  <div className="flex flex-col gap-1 min-w-48">
                    <div className="flex justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
                      <span>Subtotal</span><span className="font-medium" style={{ color: "var(--text-primary)" }}>{fmt(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                      <span>HST</span>
                      <div className="flex items-center gap-1">
                        <select value={draft.hstRate} onChange={(e) => setDraft((d) => ({ ...d, hstRate: parseFloat(e.target.value) }))}
                          className="rounded px-1 py-0.5 text-xs outline-none"
                          style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                          <option value={0.13}>13% (ON)</option>
                          <option value={0.15}>15% (NS/NB/NL/PEI)</option>
                          <option value={0.05}>5% (GST only)</option>
                          <option value={0}>0% (exempt)</option>
                        </select>
                        <span className="font-medium" style={{ color: "var(--text-primary)" }}>{fmt(hst)}</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm font-bold pt-1" style={{ borderTop: "1px solid var(--border)", color: "var(--accent-blue)" }}>
                      <span>Total</span><span>{fmt(total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Payment Status</label>
                  <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as Invoice["status"] }))}
                    className="rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partially Paid</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                {(draft.status === "partial" || draft.status === "paid") && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Amount Received</label>
                    <input type="number" min="0" step="0.01" value={draft.amountPaid || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, amountPaid: parseFloat(e.target.value) || 0 }))}
                      placeholder="0.00" className="rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  </div>
                )}
              </div>

              {(draft.status === "partial" || draft.status === "paid") && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Payment Date</label>
                    <SmartDateInput
                      value={draft.paymentDate ?? ""}
                      onChange={(v) => setDraft((d) => ({ ...d, paymentDate: v }))}
                      dateFormat={dateFormat}
                      placeholder={dateFormat === "MM/DD/YYYY" ? "mm/dd/yyyy" : dateFormat === "DD/MM/YYYY" ? "dd/mm/yyyy" : "yyyy-mm-dd"}
                      className="rounded-lg px-3 py-2 text-sm outline-none w-full"
                      style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Payment Method</label>
                    <select value={draft.paymentMethod ?? ""} onChange={(e) => setDraft((d) => ({ ...d, paymentMethod: e.target.value }))}
                      className="rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      <option value="">Select…</option>
                      <option>E-Transfer</option>
                      <option>Cheque</option>
                      <option>Wire Transfer</option>
                      <option>Credit Card</option>
                      <option>Cash</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Notes</label>
                <textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  placeholder="Payment terms, bank info, thank you message…" rows={2}
                  className="rounded-lg px-3 py-2 text-sm outline-none resize-none"
                  style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>

              {/* AI Assistant */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <button onClick={() => setShowAI((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium"
                  style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-primary)" }}>
                  <span style={{ color: "#a78bfa" }}>✦ Ask AI to fill this invoice</span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.7rem" }}>{showAI ? "▲" : "▼"}</span>
                </button>
                {showAI && (
                  <div className="px-4 py-3 flex flex-col gap-2" style={{ backgroundColor: "var(--bg-base)" }}>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      Describe what you need — AI will fill in the client, dates, line items, etc.
                    </p>
                    <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder={`e.g. "Web development invoice for Acme Corp, 8 hours at $200/hr, due in 30 days"`}
                      rows={2}
                      className="rounded-lg px-3 py-2 text-sm outline-none resize-none"
                      style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runAI(); } }} />
                    {aiError && <p className="text-xs" style={{ color: "#ef4444" }}>{aiError}</p>}
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: "var(--text-secondary)", opacity: 0.5 }}>Press Enter to submit · Shift+Enter for new line</span>
                      <button onClick={runAI} disabled={aiLoading || !aiPrompt.trim()}
                        className="px-4 py-1.5 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: "#7c3aed", color: "#fff", opacity: aiLoading || !aiPrompt.trim() ? 0.5 : 1 }}>
                        {aiLoading ? "Thinking…" : "✦ Fill Invoice"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Total: <strong style={{ color: "var(--accent-blue)" }}>{fmt(total)}</strong>
                {owing < total && <> · Owing: <strong style={{ color: "#f59e0b" }}>{fmt(owing)}</strong></>}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm"
                  style={{ color: "var(--text-secondary)" }}>Cancel</button>
                <button onClick={handlePreview}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                  Preview PDF
                </button>
                <button onClick={save}
                  disabled={!draft.clientName || !draft.dateIssued}
                  className="px-5 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: "var(--accent-blue)", color: "#fff", opacity: (!draft.clientName || !draft.dateIssued) ? 0.5 : 1 }}>
                  {editId ? "Save Changes" : "Create Invoice"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Business profile modal ── */}
      {showBiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-md rounded-2xl flex flex-col"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Business Info</h2>
              <button onClick={() => setShowBiz(false)} style={{ color: "var(--text-secondary)" }}>✕</button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>This appears on your exported PDF invoices.</p>
              {([
                { label: "Business / Corp Name", key: "name" as const, placeholder: "1234567 Ontario Inc." },
                { label: "HST Registration #", key: "hstNumber" as const, placeholder: "123456789 RT0001" },
                { label: "Email", key: "email" as const, placeholder: "billing@corp.ca" },
                { label: "Phone", key: "phone" as const, placeholder: "416-555-0100" },
              ] as const).map(({ label, key, placeholder }) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
                  <input value={bizDraft[key]} onChange={(e) => setBizDraft((b) => ({ ...b, [key]: e.target.value }))}
                    placeholder={placeholder} className="rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Address</label>
                <AddressInput
                  value={bizDraft.address}
                  onChange={(v) => setBizDraft((b) => ({ ...b, address: v }))}
                  onSelect={(p) => setBizDraft((b) => ({ ...b, address: p.label }))}
                  placeholder="123 Main St, Toronto, ON M5V 1A1"
                />
              </div>
              {/* PDF visibility toggles */}
              <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Hide from PDF</p>
                <div className="flex flex-wrap gap-2">
                  {(["address", "email", "phone", "hstNumber"] as const).map((field) => {
                    const hidden = (bizDraft.pdfHideFields ?? []).includes(field);
                    const labels: Record<string, string> = { address: "Address", email: "Email", phone: "Phone", hstNumber: "HST #" };
                    return (
                      <button key={field}
                        onClick={() => setBizDraft((b) => ({
                          ...b,
                          pdfHideFields: hidden
                            ? (b.pdfHideFields ?? []).filter((f) => f !== field)
                            : [...(b.pdfHideFields ?? []), field],
                        }))}
                        className="px-3 py-1 rounded-full text-xs"
                        style={{
                          backgroundColor: hidden ? "rgba(239,68,68,0.1)" : "var(--bg-elevated)",
                          color: hidden ? "#ef4444" : "var(--text-secondary)",
                          border: `1px solid ${hidden ? "rgba(239,68,68,0.3)" : "var(--border)"}`,
                          textDecoration: hidden ? "line-through" : "none",
                        }}>
                        {labels[field]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)", opacity: 0.6 }}>
                  Strikethrough = hidden in PDF
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
              <button onClick={() => setShowBiz(false)} className="px-4 py-2 rounded-lg text-sm"
                style={{ color: "var(--text-secondary)" }}>Cancel</button>
              <button onClick={saveBiz} className="px-5 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PDF Preview modal ── */}
      {showPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-3xl rounded-2xl flex flex-col" style={{ height: "88vh", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>PDF Preview</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadPDF(draft as Invoice, biz)}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: "#10b981", color: "#fff" }}>
                  ↓ Download PDF
                </button>
                <button onClick={() => { setShowPreview(false); URL.revokeObjectURL(previewUrl); }} style={{ color: "var(--text-secondary)" }}>✕</button>
              </div>
            </div>
            <iframe src={previewUrl} className="flex-1 w-full rounded-b-2xl" style={{ border: "none" }} />
          </div>
        </div>
      )}

    </div>
  );
}
