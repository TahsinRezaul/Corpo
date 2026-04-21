export const CATEGORIES = [
  // T2 Schedule 1 — Operating Expenses
  "Advertising",
  "Meals & Entertainment (50% deductible)",
  "Insurance",
  "Interest & Bank Charges",
  "Office Expenses",
  "Legal & Accounting Fees",
  "Rent",
  "Salaries & Wages",
  "Travel",
  "Telephone & Utilities",
  "Repairs & Maintenance",
  "Subcontracting / Management Fees",
  // Motor Vehicle Expenses (operating — NOT capital)
  "Motor Vehicle Expenses — Fuel",
  "Motor Vehicle Expenses — Insurance",
  "Motor Vehicle Expenses — Repairs & Maintenance",
  "Motor Vehicle Expenses — Lease / Financing",
  "Motor Vehicle Expenses — Parking & Tolls",
  // Capital Cost Allowance (CCA)
  "CCA — Class 8 (Furniture & Equipment)",
  "CCA — Class 10 (Vehicles — purchase price)",
  "CCA — Class 12 (Software / Tools under $500)",
  "CCA — Class 50 (Computers & Hardware)",
  "CCA — Class 14.1 (Goodwill / Intangibles)",
  // Cost of Goods Sold (inventory / production costs ONLY)
  "COGS — Purchases / Inventory",
  "COGS — Direct Labour",
] as const;

export type ReceiptForm = {
  vendor: string;
  date: string;
  subtotal: string;
  tax: string;
  total: string;
  category: string;
  business_purpose: string;
  notes: string;
  shareholder_loan: boolean;
  recurring: boolean;
  recurringInterval: "monthly" | "yearly" | "";
};

export const EMPTY_FORM: ReceiptForm = {
  vendor: "",
  date: "",
  subtotal: "",
  tax: "",
  total: "",
  category: "",
  business_purpose: "",
  notes: "",
  shareholder_loan: false,
  recurring: false,
  recurringInterval: "",
};

// Normalized 0–1 bounding box of a detected field within the image
export type FieldRegion = {
  name: string;
  x: number; // left edge, 0=left 1=right
  y: number; // top edge,  0=top  1=bottom
  w: number;
  h: number;
};

// Shape returned by /api/parse-receipt
export type ParsedReceipt = {
  vendor?: string;
  date?: string;
  subtotal?: string;
  tax?: string;
  total?: string;
  category?: string;
  business_purpose?: string;
  tax_deductible?: boolean;
  _thumbnail?: string;
  _parseError?: string;
  _fields?: FieldRegion[]; // approximate positions of detected fields
};

// One item in the upload→review queue
export type PendingReceipt = {
  id: string;
  fileName: string;
  thumbnail: string; // base64 data URL, "pdf", or "heic" (sentinel for icons)
  parsed: ParsedReceipt;
};

// A fully reviewed and saved receipt
export type SavedReceipt = ReceiptForm & {
  id: string;
  savedAt: string;
  thumbnail: string;
  tax_deductible: boolean;
};

export function categoryStyle(category: string): { bg: string; text: string } {
  if (category.startsWith("CCA"))            return { bg: "rgba(245,158,11,0.15)",  text: "#f59e0b" };
  if (category.startsWith("COGS"))           return { bg: "rgba(16,185,129,0.15)",  text: "#10b981" };
  if (category.startsWith("Motor Vehicle"))  return { bg: "rgba(168,85,247,0.15)",  text: "#a855f7" };
  return                                            { bg: "rgba(59,130,246,0.15)",   text: "#3b82f6" };
}

// ── Background parse queue ────────────────────────────────────────────────────

export type BackgroundParse = {
  id: string;
  fileName: string;
  imageData: string;       // base64 jpeg data URL
  status: "parsing" | "done" | "error";
  result?: ParsedReceipt;
  capturedAt: string;
};

const BG_PARSE_KEY = "bgParseQueue";

export function getBackgroundQueue(): BackgroundParse[] {
  return readJSON<BackgroundParse[]>(BG_PARSE_KEY, []);
}

export function addToBackgroundQueue(item: BackgroundParse): void {
  const q = getBackgroundQueue();
  localStorage.setItem(BG_PARSE_KEY, JSON.stringify([...q, item]));
}

export function updateBackgroundParse(id: string, updates: Partial<BackgroundParse>): void {
  const q = getBackgroundQueue().map((item) => item.id === id ? { ...item, ...updates } : item);
  localStorage.setItem(BG_PARSE_KEY, JSON.stringify(q));
}

export function removeFromBackgroundQueue(id: string): void {
  const q = getBackgroundQueue().filter((item) => item.id !== id);
  localStorage.setItem(BG_PARSE_KEY, JSON.stringify(q));
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const PENDING_KEY = "pendingReceipts";
const SAVED_KEY   = "savedReceipts";

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; }
  catch { return fallback; }
}

export function getPending(): PendingReceipt[] {
  return readJSON<PendingReceipt[]>(PENDING_KEY, []);
}

export function setPending(queue: PendingReceipt[]): void {
  localStorage.setItem(PENDING_KEY, JSON.stringify(queue));
}

export function clearPending(): void {
  localStorage.removeItem(PENDING_KEY);
}

export function getSaved(): SavedReceipt[] {
  return readJSON<SavedReceipt[]>(SAVED_KEY, []);
}

export function addSaved(receipt: SavedReceipt): void {
  const all = getSaved();
  // Skip exact duplicates: same vendor + total + date already in storage
  const isDup = all.some(
    (r) =>
      r.vendor && receipt.vendor &&
      r.vendor.toLowerCase() === receipt.vendor.toLowerCase() &&
      r.total === receipt.total &&
      r.date === receipt.date
  );
  if (isDup) return;
  all.unshift(receipt);
  localStorage.setItem(SAVED_KEY, JSON.stringify(all));
}

export function deleteSaved(id: string): void {
  const all = getSaved().filter((r) => r.id !== id);
  localStorage.setItem(SAVED_KEY, JSON.stringify(all));
}

export function updateSaved(id: string, patch: Partial<SavedReceipt>): void {
  const all = getSaved().map((r) => r.id === id ? { ...r, ...patch } : r);
  localStorage.setItem(SAVED_KEY, JSON.stringify(all));
}

const DISMISSED_KEY = "dismissedNotifs";

export function getDismissedNotifs(): Set<string> {
  const arr = readJSON<string[]>(DISMISSED_KEY, []);
  return new Set(arr);
}

export function dismissNotif(key: string): void {
  const arr = readJSON<string[]>(DISMISSED_KEY, []);
  if (!arr.includes(key)) {
    arr.push(key);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(arr));
  }
}

// ── Income entries ─────────────────────────────────────────────────────────────

export type IncomeEntry = {
  id: string;
  date: string;           // date submitted / invoice date
  dateReceived?: string;  // date payment actually received
  client: string;
  description: string;
  amount: string;         // income excl. HST, e.g. "$7,980.00"
  hstCollected: string;   // HST charged, e.g. "$1,037.40"
  invoiceNo: string;      // e.g. "00001"
  paid: boolean;
  notes?: string;
};

const INCOME_KEY = "corpoIncome";

export function getIncome(): IncomeEntry[] {
  return readJSON<IncomeEntry[]>(INCOME_KEY, []);
}

export function addIncome(entry: IncomeEntry): void {
  const all = getIncome();
  all.unshift(entry);
  localStorage.setItem(INCOME_KEY, JSON.stringify(all));
}

export function updateIncome(id: string, patch: Partial<IncomeEntry>): void {
  const all = getIncome().map((e) => e.id === id ? { ...e, ...patch } : e);
  localStorage.setItem(INCOME_KEY, JSON.stringify(all));
}

export function deleteIncome(id: string): void {
  const all = getIncome().filter((e) => e.id !== id);
  localStorage.setItem(INCOME_KEY, JSON.stringify(all));
}

// ── Mileage trips ──────────────────────────────────────────────────────────────

export type MileageTrip = {
  id: string;
  date: string;
  from: string;
  to: string;
  fromLat?: number;
  fromLng?: number;
  toLat?: number;
  toLng?: number;
  purpose: string;
  km: number;
  kmPending?: boolean;   // true while background distance calc is running
  kmWarning?: string;    // set when distance could not be calculated
  kmImported?: number;   // original km from spreadsheet (kept as fallback)
  kmFlagged?: {          // set when calculated km differs from imported by >20%
    imported: number;
    calculated: number;
    pct: number;         // % difference (e.g. 368 = 368% off)
    resolved?: boolean;  // true once user has dismissed/resolved it
  };
  startMileage?: number;
  endMileage?: number;
  roundTrip: boolean;
  notes?: string;
  groupId?: string;      // links legs of a multi-stop trip
  legOrder?: number;     // 0-based position within group
};

const MILEAGE_KEY = "corpoMileage";

export function getMileage(): MileageTrip[] {
  return readJSON<MileageTrip[]>(MILEAGE_KEY, []);
}

export function addMileage(trip: MileageTrip): void {
  const all = getMileage();
  all.unshift(trip);
  localStorage.setItem(MILEAGE_KEY, JSON.stringify(all));
}

export function deleteMileage(id: string): void {
  const all = getMileage().filter((t) => t.id !== id);
  localStorage.setItem(MILEAGE_KEY, JSON.stringify(all));
}

// ── CRA mileage reimbursement rate (2024) ─────────────────────────────────────
// First 5,000 km: $0.70/km  |  Over 5,000 km: $0.64/km
export function calcMileageDeduction(totalKm: number): number {
  if (totalKm <= 5000) return totalKm * 0.70;
  return 5000 * 0.70 + (totalKm - 5000) * 0.64;
}

// ── Shareholder Loan Ledger ────────────────────────────────────────────────────

export type LoanEntry = {
  id: string;
  date: string;
  description: string;
  debit: number;    // company spent shareholder's money (owes shareholder more)
  credit: number;   // company repaid shareholder (owes less)
  source: "manual" | "receipt"; // "receipt" = auto-imported
  receiptId?: string;
};

const LOAN_KEY = "corpoLoan";

export function getLoanEntries(): LoanEntry[] {
  return readJSON<LoanEntry[]>(LOAN_KEY, []);
}

export function addLoanEntry(e: LoanEntry): void {
  const all = getLoanEntries();
  all.unshift(e);
  localStorage.setItem(LOAN_KEY, JSON.stringify(all));
}

export function deleteLoanEntry(id: string): void {
  const all = getLoanEntries().filter((e) => e.id !== id);
  localStorage.setItem(LOAN_KEY, JSON.stringify(all));
}

// ── Next invoice number helper ─────────────────────────────────────────────────

export function nextInvoiceNo(): string {
  const all = getIncome();
  const nums = all.map((e) => parseInt(e.invoiceNo, 10)).filter((n) => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return String(next).padStart(5, "0");
}

// ── Money management defaults ──────────────────────────────────────────────────
// Configurable tax set-aside rates (stored in localStorage)

export type TaxRates = {
  corporateTaxPct: number;  // default 15% (federal small biz rate)
  dividendsTaxPct: number;  // default 30% (approx personal div tax)
};

const TAX_RATES_KEY = "corpoTaxRates";

export function getTaxRates(): TaxRates {
  return readJSON<TaxRates>(TAX_RATES_KEY, { corporateTaxPct: 15, dividendsTaxPct: 30 });
}

export function saveTaxRates(r: TaxRates): void {
  localStorage.setItem(TAX_RATES_KEY, JSON.stringify(r));
}

// ── Bulk import (migration) ────────────────────────────────────────────────────

export function bulkAddSaved(rows: SavedReceipt[]): number {
  const existing = getSaved();
  const toAdd = rows.filter(
    (r) => !existing.some(
      (e) => e.vendor?.toLowerCase() === r.vendor?.toLowerCase() &&
             e.total === r.total && e.date === r.date
    )
  );
  localStorage.setItem(SAVED_KEY, JSON.stringify([...toAdd, ...existing]));
  return toAdd.length;
}

export function bulkAddIncome(rows: IncomeEntry[]): number {
  const existing = getIncome();
  const toAdd = rows.filter(
    (r) => !existing.some(
      (e) => e.invoiceNo && r.invoiceNo && e.invoiceNo === r.invoiceNo && e.client === r.client
    )
  );
  localStorage.setItem(INCOME_KEY, JSON.stringify([...toAdd, ...existing]));
  return toAdd.length;
}

// ── Office location ────────────────────────────────────────────────────────────

export type OfficeLocation = {
  label: string;    // short name, e.g. "Home Office"
  address: string;  // full address string
  lat?: number;
  lon?: number;
};

const OFFICE_KEY = "corpoOffice";

export function getOfficeLocation(): OfficeLocation | null {
  return readJSON<OfficeLocation | null>(OFFICE_KEY, null);
}

export function saveOfficeLocation(loc: OfficeLocation): void {
  localStorage.setItem(OFFICE_KEY, JSON.stringify(loc));
}

// ── Annual odometer (for business-use % calculation) ──────────────────────────

export type OdometerRecord = {
  year: number;
  startKm: number; // Jan 1 odometer reading
  endKm: number;   // Dec 31 odometer reading
};

const ODOMETER_KEY = "corpoOdometer";

export function getOdometers(): OdometerRecord[] {
  return readJSON<OdometerRecord[]>(ODOMETER_KEY, []);
}

export function saveOdometer(record: OdometerRecord): void {
  const all = getOdometers().filter((r) => r.year !== record.year);
  all.push(record);
  localStorage.setItem(ODOMETER_KEY, JSON.stringify(all));
}

export function getOdometerForYear(year: number): OdometerRecord | undefined {
  return getOdometers().find((r) => r.year === year);
}

export function updateMileage(id: string, patch: Partial<MileageTrip>): void {
  const all = getMileage().map((t) => t.id === id ? { ...t, ...patch } : t);
  localStorage.setItem(MILEAGE_KEY, JSON.stringify(all));
}

export function bulkAddMileage(rows: MileageTrip[]): number {
  const existing = getMileage();
  const toAdd = rows.filter(
    (r) => !existing.some(
      (e) => e.date === r.date && e.from === r.from && e.to === r.to && e.km === r.km
    )
  );
  localStorage.setItem(MILEAGE_KEY, JSON.stringify([...toAdd, ...existing]));
  return toAdd.length;
}

export function bulkAddLoan(rows: LoanEntry[]): number {
  const existing = getLoanEntries();
  const toAdd = rows.filter(
    (r) => !existing.some(
      (e) => e.date === r.date && e.description === r.description &&
             e.debit === r.debit && e.credit === r.credit
    )
  );
  localStorage.setItem(LOAN_KEY, JSON.stringify([...toAdd, ...existing]));
  return toAdd.length;
}

// ── Invoices ───────────────────────────────────────────────────────────────────

export type CustomColumn = {
  id: string;
  label: string;
  type: "text" | "number" | "date";
};

export type InvoiceLineItem = {
  id: string;
  description: string;
  qty: number;
  rate: number;
  customValues?: Record<string, string>;
};

export type Invoice = {
  id: string;
  invoiceNo: string;
  dateIssued: string;
  dateDue?: string;
  clientName: string;
  clientAddress: string;
  lineItems: InvoiceLineItem[];
  customColumns?: CustomColumn[];
  columnOrder?: string[];   // ordered list of column ids: "description" | "qty" | "rate" | custom-id
  hstRate: number;       // e.g. 0.13
  notes: string;
  status: "unpaid" | "partial" | "paid";
  amountPaid: number;
  paymentDate?: string;
  paymentMethod?: string;
  createdAt: string;
};

export type BusinessProfile = {
  name: string;
  address: string;
  hstNumber: string;
  email: string;
  phone: string;
  pdfHideFields?: string[];  // "address" | "email" | "phone" | "hstNumber"
};

const INVOICE_KEY  = "corpoInvoices";
const BIZ_KEY      = "corpoBusinessProfile";

export function getInvoices(): Invoice[] {
  return readJSON<Invoice[]>(INVOICE_KEY, []);
}

export function addInvoice(inv: Invoice): void {
  const all = getInvoices();
  all.unshift(inv);
  localStorage.setItem(INVOICE_KEY, JSON.stringify(all));
}

export function updateInvoice(id: string, patch: Partial<Invoice>): void {
  const all = getInvoices().map((i) => i.id === id ? { ...i, ...patch } : i);
  localStorage.setItem(INVOICE_KEY, JSON.stringify(all));
}

export function deleteInvoice(id: string): void {
  const all = getInvoices().filter((i) => i.id !== id);
  localStorage.setItem(INVOICE_KEY, JSON.stringify(all));
}

export function getBusinessProfile(): BusinessProfile {
  return readJSON<BusinessProfile>(BIZ_KEY, { name: "", address: "", hstNumber: "", email: "", phone: "" });
}

export function saveBusinessProfile(p: BusinessProfile): void {
  localStorage.setItem(BIZ_KEY, JSON.stringify(p));
}

// ── Invoice Templates ──────────────────────────────────────────────────────────

export type InvoiceTemplate = {
  id: string;
  name: string;
  createdAt: string;
  // Snapshot of invoice fields (no id/status/payment fields — those are per-invoice)
  columnOrder: string[];
  customColumns: CustomColumn[];
  lineItems: InvoiceLineItem[];
  hstRate: number;
  notes: string;
  clientName?: string;
  clientAddress?: string;
};

const TEMPLATE_KEY = "corpoInvoiceTemplates";

export function getTemplates(): InvoiceTemplate[] {
  return readJSON<InvoiceTemplate[]>(TEMPLATE_KEY, []);
}

export function saveTemplate(t: InvoiceTemplate): void {
  const all = getTemplates().filter(x => x.id !== t.id);
  all.unshift(t);
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(all));
}

export function deleteTemplate(id: string): void {
  const all = getTemplates().filter(t => t.id !== id);
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(all));
}

// ── Location Bias ──────────────────────────────────────────────────────────────

export type LocationBias = {
  enabled: boolean;
  label: string;       // display name, e.g. "Greater Toronto Area, ON"
  lat: number;
  lng: number;
  radiusKm: number;    // search radius in km (25 / 50 / 100 / 200)
};

export const DEFAULT_LOCATION_BIAS: LocationBias = {
  enabled: true,
  label: "Greater Toronto Area, ON",
  lat: 43.7181,
  lng: -79.5181,
  radiusKm: 100,
};

// ── App Settings ───────────────────────────────────────────────────────────────

export type AppSettings = {
  // Invoices
  invoiceDefaultColumns: string[];          // e.g. ["description","rate"]
  invoiceNumberFormat: string;              // e.g. "INV-{YEAR}-{SEQ4}"
  invoiceDateFormat: "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";
  invoiceDefaultHstRate: number;            // 0.13
  invoiceDefaultPaymentTerms: number;       // days, 0 = none
  invoiceDefaultNotes: string;
  invoiceCurrency: "CAD" | "USD" | "EUR" | "GBP";

  // Receipts
  receiptDefaultCategory: string;
  receiptAutoOcr: boolean;

  // Mileage
  mileageRatePerKm: number;                 // CRA standard = 0.70
  mileageDefaultVehicle: string;

  // Tax
  province: string;                         // e.g. "ON"
  fiscalYearEnd: string;                    // "MM-DD", e.g. "12-31"
  defaultSalary: number;
  defaultDividend: number;

  // General
  dateFormat: "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";
  theme: "dark" | "light";
  locationBias: LocationBias;               // bias geocoding/autocomplete towards a specific area

  // AI
  aiProMode: boolean;                       // allow AI agents to make direct changes to data
};

const DEFAULT_SETTINGS: AppSettings = {
  invoiceDefaultColumns: ["description", "rate"],
  invoiceNumberFormat: "INV-{YEAR}-{SEQ4}",
  invoiceDateFormat: "YYYY-MM-DD",
  invoiceDefaultHstRate: 0.13,
  invoiceDefaultPaymentTerms: 30,
  invoiceDefaultNotes: "",
  invoiceCurrency: "CAD",
  receiptDefaultCategory: "",
  receiptAutoOcr: true,
  mileageRatePerKm: 0.70,
  mileageDefaultVehicle: "",
  province: "ON",
  fiscalYearEnd: "12-31",
  defaultSalary: 0,
  defaultDividend: 0,
  dateFormat: "YYYY-MM-DD",
  theme: "dark",
  locationBias: DEFAULT_LOCATION_BIAS,
  aiProMode: false,
};

const SETTINGS_KEY = "corpoAppSettings";

export function getSettings(): AppSettings {
  const stored = readJSON<Partial<AppSettings>>(SETTINGS_KEY, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function patchSettings(patch: Partial<AppSettings>): void {
  saveSettings({ ...getSettings(), ...patch });
}
