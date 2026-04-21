"use client";

import { useState, useEffect } from "react";
import {
  getIncome, addIncome, updateIncome, deleteIncome,
  getSaved,
  type IncomeEntry, type SavedReceipt,
} from "@/lib/storage";
import PageHelp from "@/components/PageHelp";
import { PAGE_HELP } from "@/lib/page-help-content";

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseDollar(s: string): number {
  return parseFloat(s.replace(/[^0-9.-]/g, "")) || 0;
}

function fmt(n: number): string {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

type Tab = "pl" | "balance" | "breakdown";

const EMPTY_ENTRY = {
  date: "", client: "", description: "", amount: "",
  hstCollected: "", invoiceNo: "", paid: false,
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function IncomePage() {
  const [tab, setTab]           = useState<Tab>("pl");
  const [year, setYear]         = useState(CURRENT_YEAR);
  const [income, setIncome]     = useState<IncomeEntry[]>([]);
  const [expenses, setExpenses] = useState<SavedReceipt[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ ...EMPTY_ENTRY });
  const [editId, setEditId]     = useState<string | null>(null);

  useEffect(() => {
    setIncome(getIncome());
    setExpenses(getSaved());
  }, []);

  // Filter to selected year
  const yearIncome   = year === 0 ? income   : income.filter((e) => e.date.startsWith(String(year)));
  const yearExpenses = year === 0 ? expenses : expenses.filter((e) => e.date?.startsWith(String(year)));

  // Totals
  const totalRevenue     = yearIncome.reduce((s, e) => s + parseDollar(e.amount), 0);
  const totalHSTCollected= yearIncome.reduce((s, e) => s + parseDollar(e.hstCollected), 0);
  const totalExpenses    = yearExpenses
    .filter((r) => !r.category.startsWith("CCA")) // CCA is not an operating expense
    .reduce((s, r) => {
      const amt = parseDollar(r.subtotal || r.total);
      // Meals & Entertainment only 50% deductible
      return s + (r.category.includes("Meals") ? amt * 0.5 : amt);
    }, 0);
  const totalHSTPaid     = yearExpenses.reduce((s, r) => s + parseDollar(r.tax), 0);
  const netIncome        = totalRevenue - totalExpenses;

  // Expense breakdown by category
  const expByCategory = yearExpenses.reduce<Record<string, number>>((acc, r) => {
    const cat = r.category || "Uncategorized";
    const amt = parseDollar(r.subtotal || r.total);
    const eff = r.category.includes("Meals") ? amt * 0.5 : amt;
    acc[cat] = (acc[cat] || 0) + eff;
    return acc;
  }, {});

  function saveEntry() {
    if (!form.date || !form.client || !form.amount) return;
    if (editId) {
      if (!window.confirm("Save changes to this income entry?")) return;
      updateIncome(editId, form);
      setIncome(getIncome());
      setEditId(null);
    } else {
      addIncome({ ...form, id: crypto.randomUUID() });
      setIncome(getIncome());
    }
    setForm({ ...EMPTY_ENTRY });
    setShowForm(false);
  }

  function startEdit(e: IncomeEntry) {
    setForm({ date: e.date, client: e.client, description: e.description, amount: e.amount, hstCollected: e.hstCollected, invoiceNo: e.invoiceNo, paid: e.paid });
    setEditId(e.id);
    setShowForm(true);
  }

  function del(id: string) {
    if (!window.confirm("Delete this income entry? This cannot be undone.")) return;
    deleteIncome(id);
    setIncome(getIncome());
  }

  const tabStyle = (t: Tab) => ({
    padding: "6px 16px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: tab === t ? 600 : 400,
    cursor: "pointer" as const,
    backgroundColor: tab === t ? "var(--bg-elevated)" : "transparent",
    color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
    border: "none",
  });

  return (
    <div className="max-w-5xl mx-auto px-5 py-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Income & P&L</h1>
            <PageHelp content={PAGE_HELP.income} />
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Profit & loss, revenue tracking, and expense summary</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            <option value={0}>All Years</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => { setShowForm(true); setEditId(null); setForm({ ...EMPTY_ENTRY }); }}
            className="px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}
          >
            + Add Revenue
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Revenue",   value: fmt(totalRevenue),     color: "#10b981" },
          { label: "Total Expenses",  value: fmt(totalExpenses),    color: "#f87171" },
          { label: "Net Income",      value: fmt(netIncome),        color: netIncome >= 0 ? "#10b981" : "#f87171" },
          { label: "HST Collected",   value: fmt(totalHSTCollected), color: "#f59e0b" },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl p-4 flex flex-col gap-1"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{c.label}</p>
            <p className="text-xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <button style={tabStyle("pl")}      onClick={() => setTab("pl")}>P&L Statement</button>
        <button style={tabStyle("balance")} onClick={() => setTab("balance")}>Balance Sheet</button>
        <button style={tabStyle("breakdown")} onClick={() => setTab("breakdown")}>Expense Breakdown</button>
      </div>

      {/* ── P&L tab ── */}
      {tab === "pl" && (
        <div className="flex flex-col gap-4">
          {/* Revenue table */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Revenue</p>
              <p className="text-sm font-bold" style={{ color: "#10b981" }}>{fmt(totalRevenue)}</p>
            </div>
            {yearIncome.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-base)" }}>
                No revenue entries for {year}. Click "+ Add Revenue" to log income.
              </div>
            ) : (
              <table className="w-full text-sm" style={{ backgroundColor: "var(--bg-base)" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Date", "Client", "Invoice #", "Description", "HST", "Amount", "Status", ""].map((h) => (
                      <th key={h} className="px-4 py-2 text-left font-medium" style={{ color: "var(--text-secondary)", fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {yearIncome.map((e) => (
                    <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{e.date}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{e.client}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{e.invoiceNo || "—"}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{e.description || "—"}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{e.hstCollected || "—"}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: "var(--text-primary)" }}>{e.amount}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: e.paid ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: e.paid ? "#10b981" : "#f59e0b" }}>
                          {e.paid ? "Paid" : "Unpaid"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(e)} className="text-xs" style={{ color: "var(--accent-blue)" }}>Edit</button>
                          <button onClick={() => del(e.id)} className="text-xs" style={{ color: "#f87171" }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Expenses summary */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Expenses (from Receipts)</p>
              <p className="text-sm font-bold" style={{ color: "#f87171" }}>{fmt(totalExpenses)}</p>
            </div>
            {yearExpenses.length === 0 ? (
              <div className="px-5 py-6 text-sm text-center" style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-base)" }}>
                No receipts saved for {year}.
              </div>
            ) : (
              <div className="px-5 py-4 flex flex-col gap-2" style={{ backgroundColor: "var(--bg-base)" }}>
                {Object.entries(expByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                  <div key={cat} className="flex items-center justify-between text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>{cat}</span>
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>{fmt(amt)}</span>
                  </div>
                ))}
                <div className="mt-2 pt-3 flex items-center justify-between text-sm font-semibold" style={{ borderTop: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--text-primary)" }}>Net Income</span>
                  <span style={{ color: netIncome >= 0 ? "#10b981" : "#f87171" }}>{fmt(netIncome)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Balance Sheet tab ── */}
      {tab === "balance" && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Assets */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-5 py-3" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Assets</p>
            </div>
            <div className="p-5 flex flex-col gap-3" style={{ backgroundColor: "var(--bg-base)" }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Current Assets</p>
              <BSRow label="Cash & Bank" note="Enter manually" />
              <BSRow label="Accounts Receivable" value={fmt(yearIncome.filter(e => !e.paid).reduce((s, e) => s + parseDollar(e.amount), 0))} note="Unpaid invoices" />
              <BSRow label="HST Receivable (ITC)" value={fmt(totalHSTPaid)} note="Input tax credits" />
              <p className="text-xs font-semibold uppercase tracking-widest mt-2" style={{ color: "var(--text-secondary)" }}>Capital Assets</p>
              <BSRow label="Equipment & Furniture" note="From CCA Class 8 receipts" />
              <BSRow label="Computers & Hardware" note="From CCA Class 50 receipts" />
              <BSRow label="Vehicles" note="From CCA Class 10 receipts" />
            </div>
          </div>

          {/* Liabilities & Equity */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <div className="px-5 py-3" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Liabilities</p>
              </div>
              <div className="p-5 flex flex-col gap-3" style={{ backgroundColor: "var(--bg-base)" }}>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Current Liabilities</p>
                <BSRow label="Accounts Payable" note="Enter manually" />
                <BSRow label="HST Payable" value={fmt(Math.max(0, totalHSTCollected - totalHSTPaid))} note="HST collected − ITC" />
                <BSRow label="Income Tax Payable" note="Enter manually" />
                <BSRow label="Shareholder Loan" note="Enter manually" />
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <div className="px-5 py-3" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Equity</p>
              </div>
              <div className="p-5 flex flex-col gap-3" style={{ backgroundColor: "var(--bg-base)" }}>
                <BSRow label="Share Capital" note="Enter manually" />
                <BSRow label="Retained Earnings (prior years)" note="Enter manually" />
                <BSRow label="Net Income (this year)" value={fmt(netIncome)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Expense Breakdown tab ── */}
      {tab === "breakdown" && (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <div className="px-5 py-3" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Receipts by Category — {year}</p>
          </div>
          {yearExpenses.length === 0 ? (
            <div className="px-5 py-10 text-sm text-center" style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-base)" }}>
              No receipts for {year}.
            </div>
          ) : (
            <table className="w-full text-sm" style={{ backgroundColor: "var(--bg-base)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Category", "# Receipts", "Subtotal", "HST Paid", "Deductible Amount"].map((h) => (
                    <th key={h} className="px-5 py-2 text-left font-medium" style={{ color: "var(--text-secondary)", fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(expByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                  const rows = yearExpenses.filter((r) => (r.category || "Uncategorized") === cat);
                  const hst  = rows.reduce((s, r) => s + parseDollar(r.tax), 0);
                  const sub  = rows.reduce((s, r) => s + parseDollar(r.subtotal || r.total), 0);
                  return (
                    <tr key={cat} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-5 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{cat}</td>
                      <td className="px-5 py-3" style={{ color: "var(--text-secondary)" }}>{rows.length}</td>
                      <td className="px-5 py-3" style={{ color: "var(--text-secondary)" }}>{fmt(sub)}</td>
                      <td className="px-5 py-3" style={{ color: "var(--text-secondary)" }}>{fmt(hst)}</td>
                      <td className="px-5 py-3 font-semibold" style={{ color: "var(--text-primary)" }}>{fmt(amt)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="px-5 py-3 font-semibold" style={{ color: "var(--text-primary)", borderTop: "2px solid var(--border)" }} colSpan={4}>Total</td>
                  <td className="px-5 py-3 font-bold" style={{ color: "#f87171", borderTop: "2px solid var(--border)" }}>{fmt(totalExpenses)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Add / Edit revenue modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-lg rounded-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>{editId ? "Edit Revenue Entry" : "Add Revenue Entry"}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date *" type="date" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
              <Field label="Invoice #" value={form.invoiceNo} onChange={(v) => setForm((f) => ({ ...f, invoiceNo: v }))} placeholder="INV-001" />
              <Field label="Client / Payer *" value={form.client} onChange={(v) => setForm((f) => ({ ...f, client: v }))} placeholder="Acme Corp" className="col-span-2" />
              <Field label="Description" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="Web design services" className="col-span-2" />
              <Field label="Amount (excl. HST) *" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} placeholder="$1,000.00" />
              <Field label="HST Collected (13%)" value={form.hstCollected} onChange={(v) => setForm((f) => ({ ...f, hstCollected: v }))} placeholder="$130.00" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={form.paid} onChange={(e) => setForm((f) => ({ ...f, paid: e.target.checked }))} />
              Mark as paid
            </label>
            <div className="flex gap-2 justify-end mt-1">
              <button onClick={() => { setShowForm(false); setEditId(null); }} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-secondary)" }}>Cancel</button>
              <button onClick={saveEntry} className="px-5 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BSRow({ label, value, note }: { label: string; value?: string; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>{label}</p>
        {note && <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{note}</p>}
      </div>
      <p className="text-sm font-medium whitespace-nowrap" style={{ color: value ? "var(--text-primary)" : "var(--text-secondary)" }}>
        {value ?? "—"}
      </p>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, className = "",
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg px-3 py-2 text-sm outline-none"
        style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
      />
    </div>
  );
}
