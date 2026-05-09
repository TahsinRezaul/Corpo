"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPending,
  clearPending,
  addSaved,
  CATEGORIES,
  EMPTY_FORM,
  type ReceiptForm,
  type PendingReceipt,
} from "@/lib/storage";
import IntervalPicker from "@/components/IntervalPicker";

type TabMeta = {
  store_address: string; store_city: string; store_postal_code: string;
  store_phone: string; hst_number: string; receipt_number: string;
  purchase_time: string; cashier: string; payment_method: string;
  card_last4: string; auth_code: string; tax_hst: string;
  tax_gst: string; tax_pst: string; tip: string; tax_rate: string;
};

type TabState = {
  pending: PendingReceipt;
  form: ReceiptForm;
  meta: TabMeta;
  saved: boolean;
};

function metaFromPending(p: PendingReceipt): TabMeta {
  const d = p.parsed;
  return {
    store_address: d.store_address ?? "", store_city: d.store_city ?? "",
    store_postal_code: d.store_postal_code ?? "", store_phone: d.store_phone ?? "",
    hst_number: d.hst_number ?? "", receipt_number: d.receipt_number ?? "",
    purchase_time: d.purchase_time ?? "", cashier: d.cashier ?? "",
    payment_method: d.payment_method ?? "", card_last4: d.card_last4 ?? "",
    auth_code: d.auth_code ?? "", tax_hst: d.tax_hst ?? "",
    tax_gst: d.tax_gst ?? "", tax_pst: d.tax_pst ?? "",
    tip: d.tip ?? "", tax_rate: d.tax_rate ?? "",
  };
}

function formFromPending(p: PendingReceipt): ReceiptForm {
  const d = p.parsed;
  return {
    vendor:             d.vendor           ?? "",
    date:               d.date             ?? "",
    subtotal:           d.subtotal         ?? "",
    tax:                d.tax              ?? "",
    total:              d.total            ?? "",
    category:           d.category         ?? "",
    business_purpose:   d.business_purpose ?? "",
    notes:              "",
    shareholder_loan:   false,
    recurring:          false,
    recurringInterval:  "",
    business_use_pct:   100,
  };
}

// Icons
function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
      <polyline points="2,6 5,9 10,3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      style={{ color: "var(--text-secondary)" }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Parsed Details collapsible (editable) ─────────────────────────────────────

function ReceiptDetails({
  meta,
  onUpdate,
}: {
  meta: TabMeta;
  onUpdate: (field: keyof TabMeta, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-3 text-xs font-medium"
        style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)" }}
      >
        <span>Parsed Details (expand to edit)</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-6 py-5 flex flex-col gap-5" style={{ backgroundColor: "var(--bg-base)", borderTop: "1px solid var(--border)" }}>
          <MetaSection title="Store Info">
            <MetaInput label="Address" value={meta.store_address} onChange={v => onUpdate("store_address", v)} colSpan={2} />
            <MetaInput label="City" value={meta.store_city} onChange={v => onUpdate("store_city", v)} />
            <MetaInput label="Postal Code" value={meta.store_postal_code} onChange={v => onUpdate("store_postal_code", v)} />
            <MetaInput label="Phone" value={meta.store_phone} onChange={v => onUpdate("store_phone", v)} />
            <MetaInput label="HST Registration #" value={meta.hst_number} onChange={v => onUpdate("hst_number", v)} />
          </MetaSection>
          <MetaSection title="Transaction">
            <MetaInput label="Receipt #" value={meta.receipt_number} onChange={v => onUpdate("receipt_number", v)} />
            <MetaInput label="Purchase Time" value={meta.purchase_time} onChange={v => onUpdate("purchase_time", v)} />
            <MetaInput label="Cashier" value={meta.cashier} onChange={v => onUpdate("cashier", v)} />
          </MetaSection>
          <MetaSection title="Payment">
            <MetaInput label="Method" value={meta.payment_method} onChange={v => onUpdate("payment_method", v)} />
            <MetaInput label="Card Last 4" value={meta.card_last4} onChange={v => onUpdate("card_last4", v)} />
            <MetaInput label="Auth Code" value={meta.auth_code} onChange={v => onUpdate("auth_code", v)} />
          </MetaSection>
          <MetaSection title="Tax Breakdown">
            <MetaInput label="HST" value={meta.tax_hst} onChange={v => onUpdate("tax_hst", v)} />
            <MetaInput label="GST" value={meta.tax_gst} onChange={v => onUpdate("tax_gst", v)} />
            <MetaInput label="PST" value={meta.tax_pst} onChange={v => onUpdate("tax_pst", v)} />
            <MetaInput label="Tip" value={meta.tip} onChange={v => onUpdate("tip", v)} />
            <MetaInput label="Tax Rate" value={meta.tax_rate} onChange={v => onUpdate("tax_rate", v)} />
          </MetaSection>
        </div>
      )}
    </div>
  );
}

function MetaSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-2.5" style={{ color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</p>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function MetaInput({ label, value, onChange, colSpan }: { label: string; value: string; onChange: (v: string) => void; colSpan?: number }) {
  return (
    <div style={colSpan === 2 ? { gridColumn: "span 2" } : undefined}>
      <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{label}</p>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="—"
        className="w-full px-3 py-2 rounded-lg text-xs outline-none"
        style={inputStyle}
      />
    </div>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const queue = getPending();
    if (!queue.length) {
      router.replace("/");
      return;
    }
    const initial = queue.map((p) => ({
      pending: p,
      form: formFromPending(p),
      meta: metaFromPending(p),
      saved: false,
    }));
    setTabs(initial);
    setActiveId(initial[0].pending.id);
    setLoaded(true);
  }, [router]);

  function updateForm(id: string, field: keyof ReceiptForm, value: string | boolean | number) {
    setTabs((prev) =>
      prev.map((t) =>
        t.pending.id === id ? { ...t, form: { ...t.form, [field]: value } } : t
      )
    );
  }

  function updateMeta(id: string, field: keyof TabMeta, value: string) {
    setTabs((prev) =>
      prev.map((t) =>
        t.pending.id === id ? { ...t, meta: { ...t.meta, [field]: value } } : t
      )
    );
  }

  function saveTab(tab: TabState) {
    const d = tab.pending.parsed;
    addSaved({
      id:             tab.pending.id,
      savedAt:        new Date().toISOString(),
      thumbnail:      tab.pending.thumbnail,
      tax_deductible: d.tax_deductible ?? true,
      ai_confirmed:   false,
      ...tab.form,
      ...tab.meta,   // user-edited metadata (initialised from parsed)
      line_items:     d.line_items,
    });
  }

  function handleSave(id: string) {
    const tab = tabs.find((t) => t.pending.id === id);
    if (!tab) return;
    saveTab(tab);
    setTabs((prev) =>
      prev.map((t) => (t.pending.id === id ? { ...t, saved: true } : t))
    );
    const nextUnsaved = tabs.find((t) => !t.saved && t.pending.id !== id);
    if (nextUnsaved) setActiveId(nextUnsaved.pending.id);
  }

  function isBlank(form: ReceiptForm) {
    return !form.vendor && !form.total && !form.date;
  }

  function handleFinish() {
    tabs.forEach((tab) => {
      if (!tab.saved && !isBlank(tab.form)) saveTab(tab);
    });
    clearPending();
    router.push("/receipts");
  }

  function handleSkip(id: string) {
    const remaining = tabs.filter((t) => t.pending.id !== id);
    if (remaining.length === 0) {
      clearPending();
      router.push("/receipts");
      return;
    }
    const next = remaining.find((t) => !t.saved) ?? remaining[0];
    setTabs(remaining);
    setActiveId(next.pending.id);
  }

  if (!loaded) return null;

  const activeTab = tabs.find((t) => t.pending.id === activeId);
  const savedCount = tabs.filter((t) => t.saved).length;
  const blankCount = tabs.filter((t) => !t.saved && isBlank(t.form)).length;

  return (
    <main className="min-h-screen px-4 py-8" style={{ backgroundColor: "var(--bg-base)" }}>
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const hasProgress = savedCount > 0 || tabs.some((t) => !isBlank(t.form));
                if (hasProgress && !window.confirm("Exit review? Unsaved receipts will be lost.")) return;
                clearPending();
                router.push("/");
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", touchAction: "manipulation" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                Review Receipts
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {savedCount} of {tabs.length} saved
              </p>
            </div>
          </div>
          <button
            onClick={handleFinish}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "var(--accent-green)", color: "#fff", touchAction: "manipulation" }}
          >
            Save All &amp; Finish
          </button>
        </div>

        {/* Unreadable receipts warning */}
        {blankCount > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm"
            style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
            <div className="flex items-center gap-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-amber)", flexShrink: 0 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span style={{ color: "var(--accent-amber)" }}>
                <strong>{blankCount} receipt{blankCount !== 1 ? "s" : ""}</strong>{" "}could not be read — they&apos;ll be skipped on finish unless filled in.
              </span>
            </div>
            <button
              onClick={() => {
                const blankIds = tabs.filter((t) => !t.saved && isBlank(t.form)).map((t) => t.pending.id);
                const remaining = tabs.filter((t) => !blankIds.includes(t.pending.id));
                if (remaining.length === 0) { clearPending(); router.push("/receipts"); return; }
                const next = remaining.find((t) => !t.saved) ?? remaining[0];
                setTabs(remaining);
                setActiveId(next.pending.id);
              }}
              className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0 font-medium"
              style={{ backgroundColor: "rgba(245,158,11,0.15)", color: "var(--accent-amber)" }}
            >
              Skip All
            </button>
          </div>
        )}

        {/* Tab strip */}
        <div className="flex gap-1 mb-4 pb-1" style={{ overflowX: "auto", scrollbarWidth: "none" }}>
          {tabs.map((tab, i) => {
            const label =
              tab.form.vendor ||
              (tab.pending.parsed._parseError === "manual" ? "Manual" : null) ||
              tab.pending.fileName.replace(/\.[^.]+$/, "") ||
              `Receipt ${i + 1}`;
            const isActive = tab.pending.id === activeId;
            const blank = isBlank(tab.form) && !tab.saved;

            return (
              <button
                key={tab.pending.id}
                onClick={() => setActiveId(tab.pending.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap flex-shrink-0 transition-colors"
                style={{
                  backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  borderBottom: isActive ? `2px solid var(--accent-blue)` : "2px solid transparent",
                }}
              >
                {tab.saved
                  ? <span style={{ color: "var(--accent-green)" }}><CheckIcon /></span>
                  : blank
                    ? <span style={{ color: "var(--accent-amber)", fontSize: 10, fontWeight: 700 }}>!</span>
                    : null}
                {label}
              </button>
            );
          })}
        </div>

        {/* Active tab form */}
        {activeTab && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            {/* Parse error warning */}
            {activeTab.pending.parsed._parseError &&
              activeTab.pending.parsed._parseError !== "manual" && (
              <div
                className="px-5 py-3 text-sm"
                style={{ backgroundColor: "rgba(245,158,11,0.1)", borderBottom: "1px solid var(--border)", color: "var(--accent-amber)" }}
              >
                AI couldn&apos;t read this receipt — please fill in the details manually.
              </div>
            )}

            {/* Thumbnail preview */}
            {activeTab.pending.thumbnail.startsWith("data:") && (
              <div
                className="flex items-center justify-center p-4"
                style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-elevated)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeTab.pending.thumbnail}
                  alt="Receipt"
                  className="max-h-48 rounded-lg object-contain"
                />
              </div>
            )}

            {/* Collapsible parsed receipt details (editable) */}
            <ReceiptDetails
              meta={activeTab.meta}
              onUpdate={(field, value) => updateMeta(activeId, field, value)}
            />

            <div className="px-6 py-5 flex flex-col gap-5">

              {/* Date & Category */}
              <div className="grid grid-cols-2 gap-5">
                <Field label="Date">
                  <input
                    type="date"
                    value={activeTab.form.date}
                    onChange={(e) => updateForm(activeId, "date", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Category">
                  <select
                    value={activeTab.form.category}
                    onChange={(e) => updateForm(activeId, "category", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{
                      ...inputStyle,
                      color: activeTab.form.category ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                  >
                    <option value="">Select category</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Vendor */}
              <Field label="Vendor">
                <TextInput
                  value={activeTab.form.vendor}
                  onChange={(v) => updateForm(activeId, "vendor", v)}
                  placeholder="Business name"
                />
              </Field>

              {/* Subtotal, Tax, Total */}
              <div className="grid grid-cols-3 gap-5">
                <Field label="Subtotal">
                  <TextInput
                    value={activeTab.form.subtotal}
                    onChange={(v) => updateForm(activeId, "subtotal", v)}
                    placeholder="$0.00"
                  />
                </Field>
                <Field label="Tax (HST/GST)">
                  <TextInput
                    value={activeTab.form.tax}
                    onChange={(v) => updateForm(activeId, "tax", v)}
                    placeholder="$0.00"
                  />
                </Field>
                <Field label="Total">
                  <TextInput
                    value={activeTab.form.total}
                    onChange={(v) => updateForm(activeId, "total", v)}
                    placeholder="$0.00"
                  />
                </Field>
              </div>

              {/* Business Purpose + % Business Use */}
              <div className="grid grid-cols-3 gap-5">
                <div className="col-span-2">
                  <Field label="Business Purpose">
                    <TextInput
                      value={activeTab.form.business_purpose}
                      onChange={(v) => updateForm(activeId, "business_purpose", v)}
                      placeholder="Why was this purchased for the business?"
                    />
                  </Field>
                </div>
                <Field label="% Business Use">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={activeTab.form.business_use_pct}
                      onChange={(e) => updateForm(activeId, "business_use_pct", Math.min(100, Math.max(0, Number(e.target.value))))}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                    <span className="text-sm flex-shrink-0" style={{ color: "var(--text-secondary)" }}>%</span>
                  </div>
                </Field>
              </div>

              {/* Notes */}
              <Field label="Notes">
                <textarea
                  value={activeTab.form.notes}
                  onChange={(e) => updateForm(activeId, "notes", e.target.value)}
                  placeholder="Any additional notes (optional)"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={inputStyle}
                />
              </Field>

              {/* Shareholder Loan */}
              <div
                className="flex items-start gap-3 px-4 py-3 rounded-lg pressable"
                style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                onClick={() => updateForm(activeId, "shareholder_loan", !activeTab.form.shareholder_loan)}
              >
                <div
                  className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    backgroundColor: activeTab.form.shareholder_loan ? "var(--accent-blue)" : "transparent",
                    border: `1.5px solid ${activeTab.form.shareholder_loan ? "var(--accent-blue)" : "var(--border)"}`,
                  }}
                >
                  {activeTab.form.shareholder_loan && (
                    <span style={{ color: "#fff" }}><CheckIcon /></span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Shareholder Loan
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    Paid from a shareholder&apos;s personal card for a business purpose.
                  </p>
                </div>
              </div>

              {/* Recurring / Subscription */}
              <div>
                <div
                  className="flex items-start gap-3 px-4 py-3 rounded-lg pressable"
                  style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                  onClick={() => {
                    const next = !activeTab.form.recurring;
                    updateForm(activeId, "recurring", next);
                    if (!next) updateForm(activeId, "recurringInterval", "");
                  }}
                >
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{
                      backgroundColor: activeTab.form.recurring ? "var(--accent-green)" : "transparent",
                      border: `1.5px solid ${activeTab.form.recurring ? "var(--accent-green)" : "var(--border)"}`,
                    }}
                  >
                    {activeTab.form.recurring && (
                      <span style={{ color: "#fff" }}><CheckIcon /></span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      Recurring / Subscription
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      This expense repeats regularly. You&apos;ll get a reminder to upload next time.
                    </p>
                  </div>
                </div>

                {activeTab.form.recurring && (
                  <IntervalPicker
                    value={activeTab.form.recurringInterval || "1m"}
                    onChange={(v) => updateForm(activeId, "recurringInterval", v)}
                  />
                )}
              </div>
            </div>

            {/* Actions */}
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <button
                onClick={() => handleSkip(activeId)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", touchAction: "manipulation" }}
              >
                Skip
              </button>

              <div className="flex items-center gap-2">
                {(() => {
                  const nextTab = tabs.find((t) => t.pending.id !== activeId && !t.saved);
                  return nextTab ? (
                    <button
                      onClick={() => setActiveId(nextTab.pending.id)}
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)", touchAction: "manipulation" }}
                    >
                      Next
                    </button>
                  ) : null;
                })()}

                <button
                  onClick={() => handleSave(activeId)}
                  disabled={activeTab.saved}
                  className="px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                  style={{
                    backgroundColor: activeTab.saved ? "var(--bg-elevated)" : "var(--accent-blue)",
                    color: activeTab.saved ? "var(--accent-green)" : "#fff",
                    touchAction: "manipulation",
                  }}
                >
                  {activeTab.saved ? <><CheckIcon /> Saved</> : "Save Receipt"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab &&
          !activeTab.pending.thumbnail.startsWith("data:") &&
          (activeTab.pending.thumbnail === "pdf" || activeTab.pending.thumbnail === "heic") && (
          <div className="hidden">
            <DocIcon />
          </div>
        )}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
    />
  );
}
