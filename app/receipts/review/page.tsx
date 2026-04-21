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

type TabState = {
  pending: PendingReceipt;
  form: ReceiptForm;
  saved: boolean;
};

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
      saved: false,
    }));
    setTabs(initial);
    setActiveId(initial[0].pending.id);
    setLoaded(true);
  }, [router]);

  function updateForm(id: string, field: keyof ReceiptForm, value: string | boolean) {
    setTabs((prev) =>
      prev.map((t) =>
        t.pending.id === id ? { ...t, form: { ...t.form, [field]: value } } : t
      )
    );
  }

  function handleSave(id: string) {
    const tab = tabs.find((t) => t.pending.id === id);
    if (!tab) return;

    addSaved({
      id: tab.pending.id,
      savedAt: new Date().toISOString(),
      thumbnail: tab.pending.thumbnail,
      tax_deductible: tab.pending.parsed.tax_deductible ?? true,
      ...tab.form,
    });

    setTabs((prev) =>
      prev.map((t) => (t.pending.id === id ? { ...t, saved: true } : t))
    );

    // Advance to next unsaved tab automatically
    const nextUnsaved = tabs.find((t) => !t.saved && t.pending.id !== id);
    if (nextUnsaved) setActiveId(nextUnsaved.pending.id);
  }

  function isBlank(form: ReceiptForm) {
    return !form.vendor && !form.total && !form.date;
  }

  function handleFinish() {
    // Save unsaved tabs — skip completely blank ones (failed parses with no manual input)
    tabs.forEach((tab) => {
      if (!tab.saved && !isBlank(tab.form)) {
        addSaved({
          id: tab.pending.id,
          savedAt: new Date().toISOString(),
          thumbnail: tab.pending.thumbnail,
          tax_deductible: tab.pending.parsed.tax_deductible ?? true,
          ...tab.form,
        });
      }
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
        <div
          className="flex gap-1 mb-4 pb-1"
          style={{ overflowX: "auto", scrollbarWidth: "none" }}
        >
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

            {/* Thumbnail preview (if available) */}
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

              {/* Business Purpose */}
              <Field label="Business Purpose">
                <TextInput
                  value={activeTab.form.business_purpose}
                  onChange={(v) => updateForm(activeId, "business_purpose", v)}
                  placeholder="Why was this purchased for the business?"
                />
              </Field>

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
                  <div className="mt-2 flex gap-2">
                    {(["monthly", "yearly"] as const).map((interval) => (
                      <button
                        key={interval}
                        onClick={() => updateForm(activeId, "recurringInterval", interval)}
                        className="flex-1 py-2 rounded-lg text-sm font-medium"
                        style={{
                          backgroundColor: activeTab.form.recurringInterval === interval
                            ? "var(--accent-green)" : "var(--bg-elevated)",
                          color: activeTab.form.recurringInterval === interval
                            ? "#fff" : "var(--text-secondary)",
                          border: `1px solid ${activeTab.form.recurringInterval === interval
                            ? "var(--accent-green)" : "var(--border)"}`,
                        }}
                      >
                        {interval.charAt(0).toUpperCase() + interval.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              {/* Skip — removes this receipt entirely */}
              <button
                onClick={() => handleSkip(activeId)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", touchAction: "manipulation" }}
              >
                Skip
              </button>

              <div className="flex items-center gap-2">
                {/* Next — advance without saving */}
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

                {/* Save Receipt */}
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

        {/* Show the doc icon placeholder for PDF/HEIC (used when no data:// thumbnail) */}
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
