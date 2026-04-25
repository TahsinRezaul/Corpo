"use client";

import { useState, useEffect } from "react";
import { getSettings, saveSettings, type AppSettings, DEFAULT_LOCATION_BIAS, type LocationBias } from "@/lib/storage";
import { requestBrowserPermission, getBrowserPermission } from "@/lib/notifications";
import AddressInput, { resolvePlaceDetails, type PlaceResult } from "@/components/AddressInput";
import PageHelp from "@/components/PageHelp";
import { PAGE_HELP } from "@/lib/page-help-content";

type Tab = "general" | "invoices" | "receipts" | "mileage" | "tax" | "ai" | "notifications";

const TABS: { key: Tab; label: string }[] = [
  { key: "general",       label: "General" },
  { key: "invoices",      label: "Invoices" },
  { key: "receipts",      label: "Receipts" },
  { key: "mileage",       label: "Mileage" },
  { key: "tax",           label: "Tax" },
  { key: "ai",            label: "AI" },
  { key: "notifications", label: "Notifications" },
];

const PROVINCES = [
  { code: "ON", label: "Ontario" },
  { code: "BC", label: "British Columbia" },
  { code: "AB", label: "Alberta" },
  { code: "QC", label: "Quebec" },
  { code: "MB", label: "Manitoba" },
  { code: "SK", label: "Saskatchewan" },
  { code: "NS", label: "Nova Scotia" },
  { code: "NB", label: "New Brunswick" },
  { code: "NL", label: "Newfoundland & Labrador" },
  { code: "PE", label: "Prince Edward Island" },
  { code: "NT", label: "Northwest Territories" },
  { code: "YT", label: "Yukon" },
  { code: "NU", label: "Nunavut" },
];

const RECEIPT_CATEGORIES = [
  "", "Advertising", "Meals & Entertainment (50% deductible)", "Insurance",
  "Interest & Bank Charges", "Office Expenses", "Legal & Accounting Fees",
  "Rent", "Salaries & Wages", "Travel", "Telephone & Utilities",
  "Repairs & Maintenance", "Subcontracting / Management Fees",
  "Motor Vehicle Expenses", "Capital Equipment (CCA)", "Other",
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</span>
        {hint && <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{hint}</span>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Select({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-lg px-3 py-1.5 text-sm outline-none min-w-40"
      style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="rounded-lg px-3 py-1.5 text-sm outline-none min-w-48"
      style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
  );
}

function NumberInput({ value, onChange, min, step, suffix }: { value: number; onChange: (v: number) => void; min?: number; step?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min} step={step ?? 1}
        className="rounded-lg px-3 py-1.5 text-sm outline-none w-28 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
      {suffix && <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{suffix}</span>}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className="relative inline-flex items-center rounded-full transition-colors"
      style={{
        width: 40, height: 22,
        backgroundColor: value ? "var(--accent-blue)" : "var(--bg-elevated)",
        border: "1px solid var(--border)",
      }}>
      <span className="inline-block rounded-full transition-transform"
        style={{
          width: 16, height: 16,
          backgroundColor: value ? "#fff" : "var(--text-secondary)",
          transform: value ? "translateX(20px)" : "translateX(3px)",
        }} />
    </button>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-6 pb-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>{children}</h3>
    </div>
  );
}

// ── Default invoice columns selector ──────────────────────────────────────────

const AVAILABLE_COLS = [
  { id: "description", label: "Description", required: true },
  { id: "qty",         label: "Qty",         required: false },
  { id: "rate",        label: "Rate",        required: false },
];

function DefaultColumnsSelector({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  function toggle(id: string) {
    if (id === "description") return; // always required
    if (value.includes(id)) {
      // Remove — if removing rate, also remove qty; if removing qty, keep rate
      let next = value.filter(c => c !== id);
      if (id === "rate") next = next.filter(c => c !== "qty");
      onChange(next);
    } else {
      let next = [...value, id];
      if (id === "qty" && !next.includes("rate")) next = [...next, "rate"];
      if (id === "rate" && !next.includes("qty")) next = ["description", "qty", "rate"];
      onChange(next);
    }
  }

  return (
    <div className="flex gap-2">
      {AVAILABLE_COLS.map(col => {
        const active = value.includes(col.id);
        return (
          <button key={col.id} onClick={() => toggle(col.id)}
            className="px-3 py-1 rounded-full text-xs"
            style={{
              backgroundColor: active ? "rgba(59,130,246,0.15)" : "var(--bg-elevated)",
              color: active ? "var(--accent-blue)" : "var(--text-secondary)",
              border: `1px solid ${active ? "rgba(59,130,246,0.4)" : "var(--border)"}`,
              opacity: col.required ? 0.6 : 1,
              cursor: col.required ? "default" : "pointer",
            }}>
            {col.label}{col.required ? " *" : ""}
          </button>
        );
      })}
    </div>
  );
}

// ── Location Bias section (used inside Mileage tab) ──────────────────────────

const RADIUS_OPTIONS = [25, 50, 100, 200] as const;

function LocationBiasSection({ settings, patch }: { settings: AppSettings; patch: (p: Partial<AppSettings>) => void }) {
  const bias = settings.locationBias ?? DEFAULT_LOCATION_BIAS;
  const [picking, setPicking]         = useState(false);
  const [searchText, setSearchText]   = useState("");

  function patchBias(p: Partial<LocationBias>) {
    patch({ locationBias: { ...bias, ...p } });
  }

  async function handleSelect(place: PlaceResult) {
    const resolved = await resolvePlaceDetails(place);
    if (resolved.lat !== undefined && resolved.lng !== undefined) {
      patchBias({ label: resolved.label, lat: resolved.lat, lng: resolved.lng, enabled: true });
    } else {
      // Fallback: just save the label without coords
      patchBias({ label: resolved.label, enabled: true });
    }
    setSearchText("");
    setPicking(false);
  }

  return (
    <>
      <SettingRow
        label="Location Bias"
        hint="Bias address suggestions and geocoding towards a specific area. Most accurate when your business trips are concentrated in one region."
      >
        <Toggle value={bias.enabled} onChange={(v) => patchBias({ enabled: v })} />
      </SettingRow>

      {bias.enabled && (
        <div className="px-5 py-4" style={{ backgroundColor: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>

          {/* Current location display */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-start gap-2 min-w-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-blue)", flexShrink: 0, marginTop: 1 }}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                  {bias.label || "Not set"}
                </p>
                {bias.lat !== 0 && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {bias.lat.toFixed(4)}, {bias.lng.toFixed(4)}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => { setPicking(p => !p); setSearchText(""); }}
              className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
              style={{
                color: picking ? "var(--accent-blue)" : "var(--text-secondary)",
                border: `1px solid ${picking ? "rgba(59,130,246,0.35)" : "var(--border)"}`,
                backgroundColor: picking ? "rgba(59,130,246,0.08)" : "var(--bg-surface)",
              }}
            >
              {picking ? "Cancel" : "Change"}
            </button>
          </div>

          {/* Address search (shown when picking) */}
          {picking && (
            <div className="mb-3">
              <p className="text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Search for a city, neighbourhood, or area:
              </p>
              <AddressInput
                value={searchText}
                onChange={setSearchText}
                onSelect={handleSelect}
                placeholder="e.g. Mississauga, ON or Downtown Toronto"
              />
            </div>
          )}

          {/* Radius selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Search radius:</span>
            {RADIUS_OPTIONS.map(r => {
              const active = (bias.radiusKm ?? 100) === r;
              return (
                <button
                  key={r}
                  onClick={() => patchBias({ radiusKm: r })}
                  className="text-xs px-2.5 py-1 rounded-lg"
                  style={{
                    backgroundColor: active ? "rgba(59,130,246,0.12)" : "var(--bg-surface)",
                    border:          `1px solid ${active ? "rgba(59,130,246,0.35)" : "var(--border)"}`,
                    color:           active ? "var(--accent-blue)" : "var(--text-secondary)",
                  }}
                >
                  {r} km
                </button>
              );
            })}
          </div>

          {/* Reset to default */}
          <button
            onClick={() => patch({ locationBias: DEFAULT_LOCATION_BIAS })}
            className="mt-3 text-xs"
            style={{ color: "var(--text-secondary)", opacity: 0.6 }}
          >
            ↩ Reset to GTA default
          </button>
        </div>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type ClearStep = "idle" | "warn" | "type" | "confirm";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [clearStep, setClearStep] = useState<ClearStep>("idle");
  const [clearInput, setClearInput] = useState("");
  const [clearing, setClearing] = useState(false);
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission>("default");

  useEffect(() => { setBrowserPerm(getBrowserPermission()); }, []);

  useEffect(() => { setSettings(getSettings()); }, []);

  if (!settings) return null;

  function patch(p: Partial<AppSettings>) {
    setSettings(s => s ? { ...s, ...p } : s);
  }

  function handleSave() {
    if (!settings) return;
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleClearData() {
    setClearing(true);
    try {
      await fetch("/api/userdata", { method: "DELETE" });
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/login";
    } catch {
      setClearing(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Settings</h1>
            <PageHelp content={PAGE_HELP.settings} />
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Configure defaults and preferences for your account.</p>
        </div>
        <button onClick={handleSave}
          className="px-5 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: saved ? "#10b981" : "var(--accent-blue)", color: "#fff", transition: "background-color 0.3s" }}>
          {saved ? "Saved ✓" : "Save Changes"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1" style={{ borderBottom: "1px solid var(--border)" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 text-sm -mb-px"
            style={{
              color: tab === t.key ? "var(--accent-blue)" : "var(--text-secondary)",
              fontWeight: tab === t.key ? 600 : 400,
              borderBottom: tab === t.key ? "2px solid var(--accent-blue)" : "2px solid transparent",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── General Tab ── */}
      {tab === "general" && (
        <div>
          <SectionHeader>Display</SectionHeader>
          <SettingRow label="Date Format" hint="How dates appear throughout the app">
            <Select value={settings.dateFormat} onChange={(v) => patch({ dateFormat: v as AppSettings["dateFormat"] })}
              options={[
                { value: "YYYY-MM-DD", label: "YYYY-MM-DD (ISO)" },
                { value: "MM/DD/YYYY", label: "MM/DD/YYYY (US)" },
                { value: "DD/MM/YYYY", label: "DD/MM/YYYY (EU)" },
              ]} />
          </SettingRow>

          <SectionHeader>Business</SectionHeader>
          <SettingRow label="Province / Territory" hint="Used for tax calculations and HST rates">
            <Select value={settings.province} onChange={(v) => patch({ province: v })}
              options={PROVINCES.map(p => ({ value: p.code, label: `${p.code} — ${p.label}` }))} />
          </SettingRow>
          <SettingRow label="Fiscal Year End" hint="Month-day your corporation's fiscal year ends">
            <TextInput value={settings.fiscalYearEnd} onChange={(v) => patch({ fiscalYearEnd: v })} placeholder="12-31" />
          </SettingRow>
        </div>
      )}

      {/* ── Invoices Tab ── */}
      {tab === "invoices" && (
        <div>
          <SectionHeader>Numbering</SectionHeader>
          <SettingRow label="Invoice # Format"
            hint="Tokens: {YEAR} = current year, {SEQ4} = 4-digit sequence, {SEQ3} = 3-digit">
            <TextInput value={settings.invoiceNumberFormat} onChange={(v) => patch({ invoiceNumberFormat: v })} placeholder="INV-{YEAR}-{SEQ4}" />
          </SettingRow>

          <SectionHeader>Defaults</SectionHeader>
          <SettingRow label="Default Columns" hint="Columns added when creating a new invoice">
            <DefaultColumnsSelector value={settings.invoiceDefaultColumns} onChange={(v) => patch({ invoiceDefaultColumns: v })} />
          </SettingRow>
          <SettingRow label="Date Format" hint="How dates appear on invoices">
            <Select value={settings.invoiceDateFormat} onChange={(v) => patch({ invoiceDateFormat: v as AppSettings["invoiceDateFormat"] })}
              options={[
                { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
                { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
                { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
              ]} />
          </SettingRow>
          <SettingRow label="Default HST Rate" hint="Pre-filled HST rate on new invoices">
            <Select value={String(settings.invoiceDefaultHstRate)} onChange={(v) => patch({ invoiceDefaultHstRate: parseFloat(v) })}
              options={[
                { value: "0.13", label: "13% (ON/BC)" },
                { value: "0.15", label: "15% (NS/NB/NL/PEI)" },
                { value: "0.05", label: "5% (GST only)" },
                { value: "0",    label: "0% (exempt)" },
              ]} />
          </SettingRow>
          <SettingRow label="Default Payment Terms" hint="Days until invoice is due (0 = no due date)">
            <NumberInput value={settings.invoiceDefaultPaymentTerms} onChange={(v) => patch({ invoiceDefaultPaymentTerms: v })} min={0} suffix="days" />
          </SettingRow>
          <SettingRow label="Currency" hint="Currency displayed on invoices">
            <Select value={settings.invoiceCurrency} onChange={(v) => patch({ invoiceCurrency: v as AppSettings["invoiceCurrency"] })}
              options={[
                { value: "CAD", label: "CAD — Canadian Dollar" },
                { value: "USD", label: "USD — US Dollar" },
                { value: "EUR", label: "EUR — Euro" },
                { value: "GBP", label: "GBP — British Pound" },
              ]} />
          </SettingRow>

          <SectionHeader>Default Notes</SectionHeader>
          <div className="py-3">
            <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>Pre-filled notes on every new invoice (e.g. payment instructions, thank you message)</p>
            <textarea value={settings.invoiceDefaultNotes} onChange={(e) => patch({ invoiceDefaultNotes: e.target.value })}
              rows={3} placeholder="e.g. Please e-transfer to billing@corp.ca · Thank you for your business!"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          </div>
        </div>
      )}

      {/* ── Receipts Tab ── */}
      {tab === "receipts" && (
        <div>
          <SectionHeader>Defaults</SectionHeader>
          <SettingRow label="Default Category" hint="Pre-selected category when a receipt is uploaded">
            <Select value={settings.receiptDefaultCategory} onChange={(v) => patch({ receiptDefaultCategory: v })}
              options={RECEIPT_CATEGORIES.map(c => ({ value: c, label: c || "— None —" }))} />
          </SettingRow>

          <SectionHeader>Processing</SectionHeader>
          <SettingRow label="Auto-OCR on Upload" hint="Automatically extract data from receipts when uploaded">
            <Toggle value={settings.receiptAutoOcr} onChange={(v) => patch({ receiptAutoOcr: v })} />
          </SettingRow>
        </div>
      )}

      {/* ── Mileage Tab ── */}
      {tab === "mileage" && (
        <div>
          <SectionHeader>CRA Rates</SectionHeader>
          <SettingRow label="Rate per km" hint="CRA standard: $0.70 first 5,000 km / $0.64 after (2024)">
            <NumberInput value={settings.mileageRatePerKm} onChange={(v) => patch({ mileageRatePerKm: v })} min={0} step={0.01} suffix="$/km" />
          </SettingRow>

          <SectionHeader>Vehicle</SectionHeader>
          <SettingRow label="Default Vehicle" hint="Name or plate used in mileage log entries">
            <TextInput value={settings.mileageDefaultVehicle} onChange={(v) => patch({ mileageDefaultVehicle: v })} placeholder="e.g. 2022 Honda Civic · ABCD 123" />
          </SettingRow>

          <SectionHeader>Address Geocoding</SectionHeader>
          <LocationBiasSection settings={settings} patch={patch} />
        </div>
      )}

      {/* ── Tax Tab ── */}
      {tab === "tax" && (
        <div>
          <SectionHeader>Corporation</SectionHeader>
          <SettingRow label="Province" hint="Used for provincial corporate tax rates">
            <Select value={settings.province} onChange={(v) => patch({ province: v })}
              options={PROVINCES.map(p => ({ value: p.code, label: `${p.code} — ${p.label}` }))} />
          </SettingRow>
          <SettingRow label="Fiscal Year End" hint="MM-DD format, e.g. 12-31 for December 31">
            <TextInput value={settings.fiscalYearEnd} onChange={(v) => patch({ fiscalYearEnd: v })} placeholder="12-31" />
          </SettingRow>

          <SectionHeader>Tax Planner Defaults</SectionHeader>
          <SettingRow label="Default Salary" hint="Starting salary in the tax planner">
            <NumberInput value={settings.defaultSalary} onChange={(v) => patch({ defaultSalary: v })} min={0} step={1000} suffix="$/yr" />
          </SettingRow>
          <SettingRow label="Default Dividend" hint="Starting dividend in the tax planner">
            <NumberInput value={settings.defaultDividend} onChange={(v) => patch({ defaultDividend: v })} min={0} step={1000} suffix="$/yr" />
          </SettingRow>
        </div>
      )}

      {/* ── AI Tab ── */}
      {tab === "ai" && (
        <div>
          <SectionHeader>AI Mode</SectionHeader>
          <SettingRow
            label="Pro AI"
            hint="When enabled, AI agents can directly edit, delete, and update your data — not just read it. Disable to keep AI in guide-only mode.">
            <Toggle value={settings.aiProMode} onChange={(v) => patch({ aiProMode: v })} />
          </SettingRow>

          {settings.aiProMode && (
            <div className="mt-3 rounded-lg px-4 py-3 text-sm"
              style={{ backgroundColor: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--accent-blue)", fontWeight: 600 }}>Pro AI is on.</span>{" "}
              Agents can now make changes: edit receipt fields, delete entries, bulk-recategorize, and more. All changes apply immediately to your local data.
            </div>
          )}

          {!settings.aiProMode && (
            <div className="mt-3 rounded-lg px-4 py-3 text-sm"
              style={{ backgroundColor: "rgba(100,100,100,0.08)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Guide mode.</span>{" "}
              AI agents answer questions, filter, sort, and highlight — but cannot change your data.
            </div>
          )}
        </div>
      )}

      {/* ── Notifications Tab ── */}
      {tab === "notifications" && (
        <div>
          <SectionHeader>Browser Notifications</SectionHeader>
          <SettingRow
            label="Push Notifications"
            hint="Show system notifications even when the app is in the background"
          >
            {browserPerm === "granted" ? (
              <span className="text-xs px-3 py-1.5 rounded-full font-medium"
                style={{ backgroundColor: "rgba(16,185,129,0.12)", color: "var(--accent-green)", border: "1px solid rgba(16,185,129,0.3)" }}>
                Enabled ✓
              </span>
            ) : browserPerm === "denied" ? (
              <span className="text-xs px-3 py-1.5 rounded-full"
                style={{ backgroundColor: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.25)" }}>
                Blocked — update in browser settings
              </span>
            ) : (
              <button
                onClick={async () => {
                  const perm = await requestBrowserPermission();
                  setBrowserPerm(perm);
                  if (perm === "granted") patch({ notif_browserEnabled: true });
                }}
                className="text-sm px-4 py-1.5 rounded-lg font-medium"
                style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}
              >
                Enable
              </button>
            )}
          </SettingRow>
          {browserPerm === "granted" && (
            <SettingRow label="Send browser notifications" hint="When enabled, events below will also appear as system pop-ups">
              <Toggle value={settings.notif_browserEnabled} onChange={(v) => patch({ notif_browserEnabled: v })} />
            </SettingRow>
          )}

          <SectionHeader>In-App Alerts</SectionHeader>
          <SettingRow
            label="Subscription Reminders"
            hint="Alert when a recurring subscription receipt is overdue for upload"
          >
            <Toggle value={settings.notif_subscriptionReminders} onChange={(v) => patch({ notif_subscriptionReminders: v })} />
          </SettingRow>
          <SettingRow
            label="Duplicate Warnings"
            hint="Flag receipts that look like duplicates (same vendor, total, and date range)"
          >
            <Toggle value={settings.notif_duplicateWarnings} onChange={(v) => patch({ notif_duplicateWarnings: v })} />
          </SettingRow>
          <SettingRow
            label="Incomplete Receipt Warnings"
            hint="Warn about receipts with no vendor, total, or date filled in"
          >
            <Toggle value={settings.notif_incompleteReceipts} onChange={(v) => patch({ notif_incompleteReceipts: v })} />
          </SettingRow>
        </div>
      )}

      {/* Save button (bottom) */}
      <div className="flex justify-end pt-2">
        <button onClick={handleSave}
          className="px-6 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: saved ? "#10b981" : "var(--accent-blue)", color: "#fff", transition: "background-color 0.3s" }}>
          {saved ? "Saved ✓" : "Save Changes"}
        </button>
      </div>

      {/* Danger Zone */}
      <div style={{ borderRadius: "1rem", border: "1px solid rgba(239,68,68,0.25)", overflow: "hidden", marginTop: 8 }}>
        <div style={{ padding: "0.875rem 1.25rem", backgroundColor: "rgba(239,68,68,0.06)", borderBottom: "1px solid rgba(239,68,68,0.15)" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f87171", letterSpacing: "0.05em", textTransform: "uppercase" }}>Danger Zone</span>
        </div>

        <div style={{ padding: "1.25rem" }}>
          {clearStep === "idle" && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Clear all data</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                  Permanently delete all receipts, invoices, income, mileage, and settings.
                </div>
              </div>
              <button
                onClick={() => setClearStep("warn")}
                style={{ flexShrink: 0, padding: "0.5rem 1rem", borderRadius: "0.75rem", border: "1px solid rgba(239,68,68,0.4)", backgroundColor: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                Clear data
              </button>
            </div>
          )}

          {clearStep === "warn" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <div style={{ padding: "0.875rem", borderRadius: "0.75rem", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f87171", marginBottom: 6 }}>This cannot be undone.</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  All your receipts, invoices, income entries, mileage trips, shareholder loan records, and settings will be <strong style={{ color: "var(--text-primary)" }}>permanently deleted</strong>. There is no recovery.
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button onClick={() => setClearStep("idle")} style={{ padding: "0.5rem 1rem", borderRadius: "0.75rem", border: "1px solid var(--border)", backgroundColor: "transparent", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={() => setClearStep("type")} style={{ padding: "0.5rem 1rem", borderRadius: "0.75rem", border: "none", backgroundColor: "#ef4444", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  I understand, continue
                </button>
              </div>
            </div>
          )}

          {clearStep === "type" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Type <strong style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>DELETE</strong> to confirm you want to erase everything.
              </div>
              <input
                type="text"
                value={clearInput}
                onChange={e => setClearInput(e.target.value)}
                placeholder="Type DELETE"
                autoFocus
                style={{ padding: "0.6rem 0.875rem", borderRadius: "0.75rem", border: `1px solid ${clearInput === "DELETE" ? "rgba(239,68,68,0.6)" : "var(--border)"}`, backgroundColor: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 14, outline: "none", fontFamily: "monospace" }}
              />
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button onClick={() => { setClearStep("idle"); setClearInput(""); }} style={{ padding: "0.5rem 1rem", borderRadius: "0.75rem", border: "1px solid var(--border)", backgroundColor: "transparent", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
                <button
                  onClick={() => clearInput === "DELETE" && setClearStep("confirm")}
                  disabled={clearInput !== "DELETE"}
                  style={{ padding: "0.5rem 1rem", borderRadius: "0.75rem", border: "none", backgroundColor: clearInput === "DELETE" ? "#ef4444" : "rgba(239,68,68,0.2)", color: clearInput === "DELETE" ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: 600, cursor: clearInput === "DELETE" ? "pointer" : "not-allowed" }}>
                  Next
                </button>
              </div>
            </div>
          )}

          {clearStep === "confirm" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <div style={{ padding: "0.875rem", borderRadius: "0.75rem", backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 13, color: "#fca5a5", textAlign: "center", fontWeight: 600 }}>
                Last chance. Once you click below, everything is gone forever.
              </div>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button onClick={() => { setClearStep("idle"); setClearInput(""); }} style={{ padding: "0.5rem 1rem", borderRadius: "0.75rem", border: "1px solid var(--border)", backgroundColor: "transparent", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
                <button
                  onClick={handleClearData}
                  disabled={clearing}
                  style={{ padding: "0.5rem 1.25rem", borderRadius: "0.75rem", border: "none", backgroundColor: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: clearing ? "not-allowed" : "pointer", opacity: clearing ? 0.7 : 1 }}>
                  {clearing ? "Deleting…" : "Permanently delete all data"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
