"use client";

import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  bulkAddSaved, bulkAddIncome, bulkAddMileage, bulkAddLoan,
  CATEGORIES,
  type SavedReceipt, type IncomeEntry, type MileageTrip, type LoanEntry,
} from "@/lib/storage";

// ── Types ──────────────────────────────────────────────────────────────────────

type SheetType = "receipts" | "income" | "mileage" | "loan" | "ignore";

interface ParsedSheet {
  name: string;
  rows: Record<string, string>[];
  headers: string[];
  detectedType: SheetType;
  confidence: number;
}

interface ColumnMap {
  [fieldKey: string]: string; // fieldKey → header name in sheet
}

interface ImportResult {
  sheet: string;
  type: SheetType;
  imported: number;
  skipped: number;
}

// ── Column detection ───────────────────────────────────────────────────────────

const FIELD_ALIASES: Record<string, Record<string, string[]>> = {
  receipts: {
    date:             ["date", "transaction date", "txn date", "receipt date"],
    vendor:           ["vendor", "merchant", "payee", "supplier", "name", "description"],
    category:         ["category", "type", "expense type", "account"],
    subtotal:         ["subtotal", "net", "amount excl", "amount before tax", "pre-tax", "net amount"],
    tax:              ["tax", "gst", "hst", "vat", "gst/hst", "tax amount", "hst amount"],
    total:            ["total", "amount", "gross", "total amount", "charged", "cost"],
    business_purpose: ["business purpose", "purpose", "memo", "note", "description", "details"],
    notes:            ["notes", "note", "comments", "additional info"],
    shareholder_loan: ["shareholder loan", "shareholder", "loan"],
  },
  income: {
    date:          ["date", "invoice date", "date submitted", "issue date"],
    dateReceived:  ["date received", "payment date", "paid date", "received"],
    client:        ["client", "customer", "payee", "contact", "name", "company"],
    invoiceNo:     ["invoice #", "invoice no", "invoice number", "inv #", "inv no", "#"],
    amount:        ["income", "amount", "revenue", "subtotal", "net", "amount excl hst", "fee"],
    hstCollected:  ["hst charged", "hst collected", "hst", "gst/hst", "tax", "vat", "gst"],
    notes:         ["notes", "note", "memo", "comments"],
  },
  mileage: {
    date:         ["date"],
    from:         ["from", "origin", "start", "departure", "start location"],
    to:           ["to", "destination", "end", "arrival", "end location"],
    startMileage: ["starting mileage", "start mileage", "odometer start", "start odometer", "opening km", "from km"],
    endMileage:   ["ending mileage", "end mileage", "odometer end", "end odometer", "closing km", "to km"],
    km:           ["km", "km driven", "km traveled", "distance", "miles", "kms"],
    purpose:      ["business purpose", "purpose", "description", "reason", "memo"],
    notes:        ["notes", "note", "comments"],
  },
  loan: {
    date:        ["date"],
    description: ["description", "memo", "details", "transaction", "item", "note"],
    debit:       ["debit", "dr", "debit amount", "borrowed", "expense"],
    credit:      ["credit", "cr", "credit amount", "repayment", "payment"],
  },
};

const TYPE_SIGNALS: Record<SheetType, string[]> = {
  receipts: ["vendor", "merchant", "receipt", "gst", "hst", "subtotal", "category", "expense"],
  income:   ["invoice", "client", "customer", "revenue", "income log", "hst charged"],
  mileage:  ["mileage", "odometer", "km driven", "starting mileage", "km", "trip"],
  loan:     ["debit", "credit", "balance", "shareholder", "loan", "running balance"],
  ignore:   [],
};

function detectSheetType(headers: string[], sheetName: string): { type: SheetType; confidence: number } {
  const lower = headers.map((h) => h.toLowerCase());
  const nameLower = sheetName.toLowerCase();

  // Name-based fast path
  if (nameLower.includes("mileage") || nameLower.includes("trip"))        return { type: "mileage", confidence: 0.95 };
  if (nameLower.includes("receipt") || nameLower.includes("expense"))     return { type: "receipts", confidence: 0.95 };
  if (nameLower.includes("income") || nameLower.includes("invoice"))      return { type: "income",   confidence: 0.95 };
  if (nameLower.includes("loan") || nameLower.includes("balance sheet") ||
      nameLower.includes("shareholder"))                                   return { type: "loan",     confidence: 0.95 };

  // Score by column overlap
  const scores = (Object.entries(TYPE_SIGNALS) as [SheetType, string[]][]).map(([type, signals]) => {
    if (type === "ignore") return { type, score: 0 };
    const hits = signals.filter((s) => lower.some((h) => h.includes(s))).length;
    return { type, score: hits / signals.length };
  });

  scores.sort((a, b) => b.score - a.score);
  if (scores[0].score === 0) return { type: "ignore", confidence: 0 };
  return { type: scores[0].type, confidence: Math.min(scores[0].score, 1) };
}

function autoMapColumns(headers: string[], type: SheetType): ColumnMap {
  const aliases = FIELD_ALIASES[type] ?? {};
  const map: ColumnMap = {};
  for (const [field, aliasList] of Object.entries(aliases)) {
    const match = headers.find((h) =>
      aliasList.some((a) => h.toLowerCase().trim() === a || h.toLowerCase().trim().includes(a))
    );
    if (match) map[field] = match;
  }
  return map;
}

// ── Value helpers ──────────────────────────────────────────────────────────────

function cell(row: Record<string, string>, col: string | undefined): string {
  if (!col) return "";
  return String(row[col] ?? "").trim();
}

function parseDollar(s: string): number {
  return parseFloat(s.replace(/[^0-9.-]/g, "")) || 0;
}

function fmtMoney(n: number): string {
  return n === 0 ? "" : `$${n.toFixed(2)}`;
}

function parseDate(s: string): string {
  if (!s) return "";
  // Excel serial number
  const num = parseFloat(s);
  if (!isNaN(num) && num > 1000) {
    const d = XLSX.SSF.parse_date_code(num);
    if (d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  // Try to parse various date formats
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return s;
}

function normalizeCategory(raw: string): string {
  if (!raw) return "Office Expenses";
  const lower = raw.toLowerCase();
  // Common mappings from QuickBooks/Xero/Sheets
  if (lower.includes("meal") || lower.includes("food") || lower.includes("restaurant") || lower.includes("dining"))
    return "Meals & Entertainment (50% deductible)";
  if (lower.includes("gas") || lower.includes("fuel") || lower.includes("petrol"))
    return "Motor Vehicle Expenses — Fuel";
  if (lower.includes("car") && lower.includes("insur")) return "Motor Vehicle Expenses — Insurance";
  if (lower.includes("car") || lower.includes("vehicle")) return "Motor Vehicle Expenses — Repairs & Maintenance";
  if (lower.includes("park")) return "Motor Vehicle Expenses — Parking & Tolls";
  if (lower.includes("phone") || lower.includes("telecom") || lower.includes("internet") || lower.includes("rogers") || lower.includes("bell"))
    return "Telephone & Utilities";
  if (lower.includes("rent") || lower.includes("lease")) return "Rent";
  if (lower.includes("office") || lower.includes("supplies") || lower.includes("stationary"))
    return "Office Expenses";
  if (lower.includes("software") || lower.includes("saas") || lower.includes("subscription") || lower.includes("chatgpt"))
    return "CCA — Class 12 (Software / Tools under $500)";
  if (lower.includes("computer") || lower.includes("hardware") || lower.includes("laptop"))
    return "CCA — Class 50 (Computers & Hardware)";
  if (lower.includes("legal") || lower.includes("accounting") || lower.includes("bookkeep"))
    return "Legal & Accounting Fees";
  if (lower.includes("advertising") || lower.includes("marketing"))
    return "Advertising";
  if (lower.includes("travel") || lower.includes("hotel") || lower.includes("flight") || lower.includes("airfare"))
    return "Travel";
  if (lower.includes("salary") || lower.includes("payroll") || lower.includes("wage"))
    return "Salaries & Wages";
  if (lower.includes("bank") || lower.includes("interest") || lower.includes("fee"))
    return "Interest & Bank Charges";
  if (lower.includes("repair") || lower.includes("maintenance"))
    return "Repairs & Maintenance";
  if (lower.includes("insurance")) return "Insurance";
  // Try direct match with CATEGORIES
  const direct = CATEGORIES.find((c) => c.toLowerCase() === lower);
  if (direct) return direct;
  return "Office Expenses";
}

// ── Row converters ─────────────────────────────────────────────────────────────

function rowToReceipt(row: Record<string, string>, map: ColumnMap): SavedReceipt | null {
  const total = cell(row, map.total);
  const date  = parseDate(cell(row, map.date));
  if (!total && !date) return null;
  const subtotal = cell(row, map.subtotal);
  const tax      = cell(row, map.tax);
  const slRaw    = cell(row, map.shareholder_loan).toLowerCase();
  return {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    date,
    vendor:           cell(row, map.vendor),
    category:         normalizeCategory(cell(row, map.category)),
    subtotal:         subtotal ? fmtMoney(parseDollar(subtotal)) : "",
    tax:              tax      ? fmtMoney(parseDollar(tax))      : "",
    total:            total    ? fmtMoney(parseDollar(total))    : "",
    business_purpose: cell(row, map.business_purpose),
    notes:            cell(row, map.notes),
    shareholder_loan: slRaw === "yes" || slRaw === "true" || slRaw === "1" || slRaw === "✓" || slRaw === "x",
    tax_deductible:   true,
    thumbnail:        "",
    recurring:        false,
    recurringInterval: "",
  };
}

function rowToIncome(row: Record<string, string>, map: ColumnMap): IncomeEntry | null {
  const amount = cell(row, map.amount);
  const client = cell(row, map.client);
  if (!amount && !client) return null;
  return {
    id:           crypto.randomUUID(),
    date:         parseDate(cell(row, map.date)),
    dateReceived: parseDate(cell(row, map.dateReceived)) || undefined,
    client,
    description:  cell(row, map.description ?? ""),
    amount:       fmtMoney(parseDollar(amount)),
    hstCollected: fmtMoney(parseDollar(cell(row, map.hstCollected))),
    invoiceNo:    cell(row, map.invoiceNo),
    paid:         !!cell(row, map.dateReceived),
    notes:        cell(row, map.notes) || undefined,
  };
}

function rowToMileage(row: Record<string, string>, map: ColumnMap): MileageTrip | null {
  const startRaw = cell(row, map.startMileage);
  const endRaw   = cell(row, map.endMileage);
  const kmRaw    = cell(row, map.km);
  const start    = parseFloat(startRaw) || 0;
  const end      = parseFloat(endRaw)   || 0;
  const km       = end > start ? end - start : (parseFloat(kmRaw) || 0);
  if (!km && !cell(row, map.date)) return null;
  return {
    id:           crypto.randomUUID(),
    date:         parseDate(cell(row, map.date)),
    from:         cell(row, map.from),
    to:           cell(row, map.to),
    purpose:      cell(row, map.purpose),
    notes:        cell(row, map.notes) || undefined,
    km,
    startMileage: start || undefined,
    endMileage:   end   || undefined,
    roundTrip:    false,
  };
}

function rowToLoan(row: Record<string, string>, map: ColumnMap): LoanEntry | null {
  const debit  = parseDollar(cell(row, map.debit));
  const credit = parseDollar(cell(row, map.credit));
  const desc   = cell(row, map.description);
  if (!debit && !credit && !desc) return null;
  return {
    id:          crypto.randomUUID(),
    date:        parseDate(cell(row, map.date)),
    description: desc,
    debit,
    credit,
    source:      "manual",
  };
}

// ── UI components ──────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<SheetType, string> = {
  receipts: "Receipts / Expenses",
  income:   "Income Log",
  mileage:  "Mileage Log",
  loan:     "Shareholder Loan",
  ignore:   "Skip",
};

const TYPE_COLORS: Record<SheetType, string> = {
  receipts: "#3b82f6",
  income:   "#10b981",
  mileage:  "#a855f7",
  loan:     "#f59e0b",
  ignore:   "var(--text-secondary)",
};

const SHEET_FIELDS: Record<SheetType, string[]> = {
  receipts: ["date","vendor","category","subtotal","tax","total","business_purpose","notes","shareholder_loan"],
  income:   ["date","dateReceived","client","invoiceNo","amount","hstCollected","notes"],
  mileage:  ["date","from","to","startMileage","endMileage","km","purpose","notes"],
  loan:     ["date","description","debit","credit"],
  ignore:   [],
};

const FIELD_LABELS: Record<string, string> = {
  date: "Date", vendor: "Vendor", category: "Category", subtotal: "Subtotal",
  tax: "Tax/HST", total: "Total", business_purpose: "Business Purpose",
  notes: "Notes", shareholder_loan: "Shareholder Loan",
  dateReceived: "Date Received", client: "Client", invoiceNo: "Invoice #",
  amount: "Amount (excl HST)", hstCollected: "HST Collected", description: "Description",
  from: "From", to: "To", startMileage: "Start Odometer", endMileage: "End Odometer",
  km: "KM Driven", purpose: "Business Purpose", debit: "Debit", credit: "Credit",
};

// ── Main page ──────────────────────────────────────────────────────────────────

type Step = "upload" | "map" | "preview" | "done";

export default function MigratePage() {
  const [step, setStep]           = useState<Step>("upload");
  const [dragOver, setDragOver]   = useState(false);
  const [sheets, setSheets]       = useState<ParsedSheet[]>([]);
  const [typeMaps, setTypeMaps]   = useState<Record<string, SheetType>>({});
  const [colMaps, setColMaps]     = useState<Record<string, ColumnMap>>({});
  const [results, setResults]     = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);

  function parseFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data  = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb    = XLSX.read(data, { type: "array", cellDates: false });
      const parsed: ParsedSheet[] = [];

      for (const name of wb.SheetNames) {
        const ws   = wb.Sheets[name];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", raw: false });
        if (!json.length) continue;
        const headers = Object.keys(json[0]);
        const { type, confidence } = detectSheetType(headers, name);
        parsed.push({ name, rows: json, headers, detectedType: type, confidence });
      }

      const initTypes: Record<string, SheetType>   = {};
      const initCols:  Record<string, ColumnMap>   = {};
      for (const s of parsed) {
        initTypes[s.name] = s.detectedType;
        initCols[s.name]  = autoMapColumns(s.headers, s.detectedType);
      }

      setSheets(parsed);
      setTypeMaps(initTypes);
      setColMaps(initCols);
      setStep("map");
    };
    reader.readAsArrayBuffer(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) parseFile(f);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
  }

  function setSheetType(name: string, type: SheetType) {
    setTypeMaps((m) => ({ ...m, [name]: type }));
    setColMaps((m) => ({
      ...m,
      [name]: autoMapColumns(sheets.find((s) => s.name === name)!.headers, type),
    }));
  }

  function setColMapping(sheetName: string, field: string, header: string) {
    setColMaps((m) => ({ ...m, [sheetName]: { ...m[sheetName], [field]: header } }));
  }

  async function runImport() {
    setImporting(true);
    const res: ImportResult[] = [];

    for (const sheet of sheets) {
      const type = typeMaps[sheet.name];
      if (type === "ignore") continue;
      const map  = colMaps[sheet.name] ?? {};

      let imported = 0;
      let skipped  = 0;

      if (type === "receipts") {
        const rows = sheet.rows.map((r) => rowToReceipt(r, map)).filter(Boolean) as SavedReceipt[];
        imported = bulkAddSaved(rows);
        skipped  = rows.length - imported;
      } else if (type === "income") {
        const rows = sheet.rows.map((r) => rowToIncome(r, map)).filter(Boolean) as IncomeEntry[];
        imported = bulkAddIncome(rows);
        skipped  = rows.length - imported;
      } else if (type === "mileage") {
        const rows = sheet.rows.map((r) => rowToMileage(r, map)).filter(Boolean) as MileageTrip[];
        imported = bulkAddMileage(rows);
        skipped  = rows.length - imported;
      } else if (type === "loan") {
        const rows = sheet.rows.map((r) => rowToLoan(r, map)).filter(Boolean) as LoanEntry[];
        imported = bulkAddLoan(rows);
        skipped  = rows.length - imported;
      }

      res.push({ sheet: sheet.name, type, imported, skipped });
    }

    setResults(res);
    setImporting(false);
    setStep("done");
  }

  const activeSheets = sheets.filter((s) => typeMaps[s.name] !== "ignore");
  const totalRows    = activeSheets.reduce((s, sh) => s + sh.rows.length, 0);

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 flex flex-col gap-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Import from Spreadsheet</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Migrate from Google Sheets, Xero, QuickBooks, or any Excel/CSV export. Supports .xlsx, .xls, .csv
        </p>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-2 text-sm">
        {(["upload","map","preview","done"] as Step[]).map((s, i) => {
          const labels = ["Upload","Map Columns","Preview","Done"];
          const active = step === s;
          const done   = ["upload","map","preview","done"].indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px" style={{ backgroundColor: "var(--border)" }} />}
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    backgroundColor: done ? "#10b981" : active ? "var(--accent-blue)" : "var(--bg-elevated)",
                    color: done || active ? "#fff" : "var(--text-secondary)",
                  }}>
                  {done ? "✓" : i + 1}
                </span>
                <span style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: active ? 600 : 400 }}>
                  {labels[i]}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <label
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed py-20 gap-5 cursor-pointer transition-all"
          style={{
            borderColor: dragOver ? "var(--accent-blue)" : "var(--border)",
            backgroundColor: dragOver ? "rgba(59,130,246,0.05)" : "var(--bg-surface)",
          }}
        >
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "var(--bg-elevated)" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-blue)" }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div className="text-center">
            <p className="font-semibold text-lg" style={{ color: "var(--text-primary)" }}>
              {dragOver ? "Drop to import" : "Drop your spreadsheet here"}
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Google Sheets export · Xero · QuickBooks · Any .xlsx / .xls / .csv
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {["Google Sheets", "Xero", "QuickBooks", "Excel", "CSV"].map((src) => (
              <span key={src} className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                {src}
              </span>
            ))}
          </div>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleInput} />
        </label>
      )}

      {/* ── Step 2: Column mapping ── */}
      {step === "map" && (
        <div className="flex flex-col gap-5">
          <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <p style={{ color: "var(--text-secondary)" }}>
              Found <strong style={{ color: "var(--text-primary)" }}>{sheets.length} sheet{sheets.length !== 1 ? "s" : ""}</strong>.
              CORPO auto-detected each sheet type and mapped its columns.
              Review below and adjust if needed, then click <strong style={{ color: "var(--text-primary)" }}>Preview Import</strong>.
            </p>
          </div>

          {sheets.map((sheet) => {
            const type = typeMaps[sheet.name];
            const map  = colMaps[sheet.name] ?? {};
            const fields = SHEET_FIELDS[type] ?? [];
            return (
              <div key={sheet.name} className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {/* Sheet header */}
                <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-2"
                  style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                      {sheet.name}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                      {sheet.rows.length} rows
                    </span>
                    {sheet.confidence > 0.7 && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                        auto-detected
                      </span>
                    )}
                  </div>
                  <select value={type} onChange={(e) => setSheetType(sheet.name, e.target.value as SheetType)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium"
                    style={{
                      backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)",
                      color: TYPE_COLORS[type],
                    }}>
                    {(Object.entries(TYPE_LABELS) as [SheetType, string][]).map(([t, label]) => (
                      <option key={t} value={t}>{label}</option>
                    ))}
                  </select>
                </div>

                {type !== "ignore" && (
                  <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3" style={{ backgroundColor: "var(--bg-base)" }}>
                    {fields.map((field) => (
                      <div key={field} className="flex flex-col gap-1">
                        <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                          {FIELD_LABELS[field] ?? field}
                        </label>
                        <select
                          value={map[field] ?? ""}
                          onChange={(e) => setColMapping(sheet.name, field, e.target.value)}
                          className="rounded-lg px-2 py-1.5 text-xs outline-none"
                          style={{ backgroundColor: "var(--bg-surface)", border: `1px solid ${map[field] ? "var(--accent-blue)" : "var(--border)"}`, color: "var(--text-primary)" }}
                        >
                          <option value="">— not mapped —</option>
                          {sheet.headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                {type === "ignore" && (
                  <div className="px-5 py-4 text-sm" style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-base)" }}>
                    This sheet will be skipped during import.
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex gap-3 justify-end">
            <button onClick={() => setStep("upload")} className="px-4 py-2 rounded-lg text-sm"
              style={{ color: "var(--text-secondary)" }}>← Back</button>
            <button onClick={() => setStep("preview")} className="px-6 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>
              Preview Import →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ── */}
      {step === "preview" && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {activeSheets.map((sheet) => {
              const type = typeMaps[sheet.name];
              return (
                <div key={sheet.name} className="rounded-2xl p-4 flex flex-col gap-1"
                  style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <p className="text-xs" style={{ color: TYPE_COLORS[type] }}>{TYPE_LABELS[type]}</p>
                  <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{sheet.rows.length}</p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{sheet.name}</p>
                </div>
              );
            })}
          </div>

          {activeSheets.map((sheet) => {
            const type = typeMaps[sheet.name];
            const map  = colMaps[sheet.name] ?? {};
            const preview = sheet.rows.slice(0, 5);
            const mappedHeaders = Object.entries(map).filter(([, h]) => h);

            return (
              <div key={sheet.name} className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <div className="px-5 py-3 flex items-center gap-3"
                  style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
                  <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{sheet.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: "var(--bg-elevated)", color: TYPE_COLORS[type] }}>
                    {TYPE_LABELS[type]}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    First 5 of {sheet.rows.length} rows
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ backgroundColor: "var(--bg-base)" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        {mappedHeaders.map(([field, h]) => (
                          <th key={field} className="px-3 py-2 text-left font-medium whitespace-nowrap"
                            style={{ color: "var(--text-secondary)" }}>
                            {FIELD_LABELS[field] ?? field}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          {mappedHeaders.map(([field, h]) => (
                            <td key={field} className="px-3 py-2 whitespace-nowrap max-w-xs truncate"
                              style={{ color: "var(--text-primary)" }}>
                              {cell(row, h) || <span style={{ color: "var(--text-secondary)" }}>—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <div className="rounded-xl px-4 py-3 text-sm"
            style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
            <p style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "#f59e0b" }}>Duplicate protection:</strong> Rows matching existing records (same date + vendor + amount for receipts, same invoice # for income) will be skipped.
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={() => setStep("map")} className="px-4 py-2 rounded-lg text-sm"
              style={{ color: "var(--text-secondary)" }}>← Back</button>
            <button onClick={runImport} disabled={importing}
              className="px-6 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: "var(--accent-blue)", color: "#fff", opacity: importing ? 0.7 : 1 }}>
              {importing ? "Importing…" : `Import ${totalRows} rows →`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Done ── */}
      {step === "done" && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(16,185,129,0.15)", border: "2px solid #10b981" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Import Complete</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Your data has been migrated into CORPO.</p>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-5 py-3" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Import Summary</p>
            </div>
            <table className="w-full text-sm" style={{ backgroundColor: "var(--bg-base)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Sheet","Imported As","Imported","Skipped (duplicates)"].map((h) => (
                    <th key={h} className="px-5 py-2 text-left font-medium" style={{ color: "var(--text-secondary)", fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.sheet} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-5 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{r.sheet}</td>
                    <td className="px-5 py-3" style={{ color: TYPE_COLORS[r.type] }}>{TYPE_LABELS[r.type]}</td>
                    <td className="px-5 py-3 font-semibold" style={{ color: "#10b981" }}>{r.imported}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text-secondary)" }}>{r.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 flex-wrap">
            {[
              { label: "View Receipts",    href: "/receipts" },
              { label: "View Income",      href: "/income" },
              { label: "View Mileage",     href: "/mileage" },
              { label: "View Loan Ledger", href: "/loan" },
            ].map((l) => (
              <a key={l.href} href={l.href}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                {l.label} →
              </a>
            ))}
            <button onClick={() => { setStep("upload"); setSheets([]); setResults([]); }}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ color: "var(--text-secondary)" }}>
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
