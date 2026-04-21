"use client";

import { useState, useEffect } from "react";
import {
  getLoanEntries, addLoanEntry, deleteLoanEntry,
  getSaved,
  type LoanEntry, type SavedReceipt,
} from "@/lib/storage";
import PageHelp from "@/components/PageHelp";
import { PAGE_HELP } from "@/lib/page-help-content";

function fmt(n: number): string {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}
function parseDollar(s: string): number {
  return parseFloat(s.replace(/[^0-9.-]/g, "")) || 0;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

const EMPTY = { date: "", description: "", amount: "", type: "debit" as "debit" | "credit" };

export default function LoanPage() {
  const [year, setYear]           = useState(CURRENT_YEAR);
  const [manual, setManual]       = useState<LoanEntry[]>([]);
  const [receipts, setReceipts]   = useState<SavedReceipt[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ ...EMPTY });
  const [showAutoImport, setShowAutoImport] = useState(false);

  useEffect(() => {
    setManual(getLoanEntries());
    setReceipts(getSaved());
  }, []);

  // Receipts tagged as shareholder loan — auto entries
  const autoEntries: LoanEntry[] = receipts
    .filter((r) => r.shareholder_loan && (year === 0 || r.date?.startsWith(String(year))))
    .map((r) => ({
      id: `receipt-${r.id}`,
      date: r.date,
      description: `${r.vendor || "Receipt"} — ${r.category || "Expense"}`,
      debit: parseDollar(r.total),
      credit: 0,
      source: "receipt" as const,
      receiptId: r.id,
    }));

  // Manual entries for the year
  const manualYear = year === 0 ? manual : manual.filter((e) => e.date.startsWith(String(year)));

  // Combine and sort by date
  const all = [...autoEntries, ...manualYear].sort((a, b) => a.date.localeCompare(b.date));

  // Running balance (positive = corp owes shareholder)
  let balance = 0;
  const rows = all.map((e) => {
    balance += e.debit - e.credit;
    return { ...e, balance };
  });

  const totalDebit  = all.reduce((s, e) => s + e.debit, 0);
  const totalCredit = all.reduce((s, e) => s + e.credit, 0);
  const netOwing    = totalDebit - totalCredit;

  function saveEntry() {
    if (!form.date || !form.description || !form.amount) return;
    const amt = parseDollar(form.amount);
    addLoanEntry({
      id: crypto.randomUUID(),
      date: form.date,
      description: form.description,
      debit:  form.type === "debit"  ? amt : 0,
      credit: form.type === "credit" ? amt : 0,
      source: "manual",
    });
    setManual(getLoanEntries());
    setForm({ ...EMPTY });
    setShowForm(false);
  }

  function del(id: string) {
    if (!window.confirm("Delete this loan entry? This cannot be undone.")) return;
    deleteLoanEntry(id);
    setManual(getLoanEntries());
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Shareholder Loan Ledger</h1>
            <PageHelp content={PAGE_HELP.loan} />
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Tracks what the corporation owes you as shareholder. Receipts marked "Shareholder Loan" auto-populate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            <option value={0}>All Years</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => { setForm({ ...EMPTY }); setShowForm(true); }}
            className="px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>
            + Add Entry
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total Debits (Corp borrowed)" value={fmt(totalDebit)} color="#f87171" note="Expenses you paid on behalf of corp" />
        <StatCard label="Total Credits (Repaid)" value={fmt(totalCredit)} color="#10b981" note="Corp repaid to you" />
        <StatCard label={netOwing >= 0 ? "Corp Owes You" : "You Owe Corp"}
          value={fmt(Math.abs(netOwing))}
          color={netOwing >= 0 ? "var(--accent-blue)" : "#f87171"}
          note={netOwing >= 0 ? "Outstanding balance" : "Negative loan balance"} />
      </div>

      {/* Auto-import note */}
      {autoEntries.length > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-sm"
          style={{ backgroundColor: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)" }}>
          <p style={{ color: "var(--text-secondary)" }}>
            <span style={{ color: "var(--accent-blue)", fontWeight: 600 }}>{autoEntries.length} receipts</span> tagged as Shareholder Loan auto-imported as debits.
          </p>
          <button onClick={() => setShowAutoImport((s) => !s)} className="text-xs font-medium whitespace-nowrap"
            style={{ color: "var(--accent-blue)" }}>
            {showAutoImport ? "Hide" : "View all"}
          </button>
        </div>
      )}

      {/* Ledger table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="px-5 py-3 flex items-center justify-between"
          style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Ledger — {year}</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Debit = corp owes more · Credit = corp repays
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-10 text-sm text-center" style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-base)" }}>
            No entries for {year}. Tag receipts as "Shareholder Loan" or add manual entries.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ backgroundColor: "var(--bg-base)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Date","Tr","Description","Debit","Credit","Running Balance",""].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-medium"
                      style={{ color: "var(--text-secondary)", fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isAuto = r.source === "receipt";
                  const isVisible = isAuto ? showAutoImport || r.debit > 0 : true;
                  if (!isVisible && isAuto && !showAutoImport) return null;
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", opacity: isAuto ? 0.85 : 1 }}>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.date}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                          style={{
                            backgroundColor: r.debit > 0 ? "rgba(248,113,113,0.12)" : "rgba(16,185,129,0.12)",
                            color: r.debit > 0 ? "#f87171" : "#10b981",
                          }}>
                          {r.debit > 0 ? "DR" : "CR"}
                        </span>
                        {isAuto && (
                          <span className="ml-1 text-xs px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: "rgba(59,130,246,0.1)", color: "var(--accent-blue)" }}>
                            auto
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>{r.description}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: r.debit > 0 ? "#f87171" : "var(--text-secondary)" }}>
                        {r.debit > 0 ? fmt(r.debit) : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono" style={{ color: r.credit > 0 ? "#10b981" : "var(--text-secondary)" }}>
                        {r.credit > 0 ? fmt(r.credit) : "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold font-mono"
                        style={{ color: r.balance >= 0 ? "var(--accent-blue)" : "#f87171" }}>
                        {fmt(Math.abs(r.balance))} {r.balance < 0 ? "(neg)" : ""}
                      </td>
                      <td className="px-4 py-3">
                        {!isAuto && (
                          <button onClick={() => del(r.id)} className="text-xs" style={{ color: "#f87171" }}>Delete</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td colSpan={2} className="px-4 py-3 font-semibold" style={{ color: "var(--text-primary)" }}>Balance</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 font-bold font-mono" style={{ color: "#f87171" }}>{fmt(totalDebit)}</td>
                  <td className="px-4 py-3 font-bold font-mono" style={{ color: "#10b981" }}>{fmt(totalCredit)}</td>
                  <td className="px-4 py-3 font-bold font-mono"
                    style={{ color: netOwing >= 0 ? "var(--accent-blue)" : "#f87171" }}>
                    {fmt(Math.abs(netOwing))} {netOwing < 0 ? "(you owe corp)" : "(corp owes you)"}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* CRA note */}
      <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>CRA Shareholder Loan Rules</p>
        <ul className="flex flex-col gap-1 list-disc list-inside" style={{ color: "var(--text-secondary)" }}>
          <li>If the corp owes you money (debit balance), it must be repaid within 1 year of the corp's fiscal year-end — or it becomes taxable income to you.</li>
          <li>If you owe the corp (credit balance), CRA may assess a taxable benefit.</li>
          <li>Always document loans with a written agreement and charge a reasonable interest rate (CRA prescribed rate).</li>
          <li>Have your accountant review the shareholder loan account at year-end.</li>
        </ul>
      </div>

      {/* Add entry modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Add Ledger Entry</p>
            <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)" }}>
              {(["debit", "credit"] as const).map((t) => (
                <button key={t} onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className="flex-1 py-1.5 rounded-lg text-sm font-medium capitalize"
                  style={{
                    backgroundColor: form.type === t ? (t === "debit" ? "rgba(248,113,113,0.2)" : "rgba(16,185,129,0.2)") : "transparent",
                    color: form.type === t ? (t === "debit" ? "#f87171" : "#10b981") : "var(--text-secondary)",
                    border: "none",
                  }}>
                  {t === "debit" ? "Debit (corp borrowed)" : "Credit (corp repaid)"}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <F label="Date *" type="date" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
              <F label="Description *" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholder={form.type === "debit" ? "e.g. Initial Deposit" : "e.g. Repayment"} />
              <F label="Amount *" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} placeholder="$1,500.00" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-secondary)" }}>Cancel</button>
              <button onClick={saveEntry} className="px-5 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, note }: { label: string; value: string; color: string; note?: string }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-1" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</p>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      {note && <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{note}</p>}
    </div>
  );
}

function F({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="rounded-lg px-3 py-2 text-sm outline-none"
        style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
    </div>
  );
}
