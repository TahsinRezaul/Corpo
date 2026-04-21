"use client";

import { useState, useEffect } from "react";
import { getIncome, getTaxRates, saveTaxRates, type IncomeEntry, type TaxRates } from "@/lib/storage";
import PageHelp from "@/components/PageHelp";
import { PAGE_HELP } from "@/lib/page-help-content";

function parseDollar(s: string): number {
  return parseFloat(s.replace(/[^0-9.-]/g, "")) || 0;
}
function fmt(n: number): string {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

// Per-invoice money allocation
type Allocation = {
  entry: IncomeEntry;
  totalReceive: number;   // income + HST
  income: number;
  hst: number;            // Savings 1 — set aside for HST remittance
  taxSavings: number;     // Savings 2 — corporate + dividends tax provision
  corpTax: number;        // Incorporation tax component
  divTax: number;         // Dividends tax component
  cashReceived: number;   // What you actually keep / can spend
};

function calcAllocation(entry: IncomeEntry, rates: TaxRates): Allocation {
  const income       = parseDollar(entry.amount);
  const hst          = parseDollar(entry.hstCollected);
  const totalReceive = income + hst;
  const corpTax      = income * (rates.corporateTaxPct / 100);
  const divTax       = income * (rates.dividendsTaxPct / 100);
  const taxSavings   = corpTax + divTax;
  const cashReceived = income - taxSavings; // what stays after setting aside taxes
  return { entry, totalReceive, income, hst, taxSavings, corpTax, divTax, cashReceived };
}

export default function MoneyPage() {
  const [year, setYear]       = useState(CURRENT_YEAR);
  const [income, setIncome]   = useState<IncomeEntry[]>([]);
  const [rates, setRates]     = useState<TaxRates>({ corporateTaxPct: 15, dividendsTaxPct: 30 });
  const [showSettings, setShowSettings] = useState(false);
  const [draftRates, setDraftRates]     = useState<TaxRates>({ corporateTaxPct: 15, dividendsTaxPct: 30 });

  useEffect(() => {
    setIncome(getIncome());
    const r = getTaxRates();
    setRates(r);
    setDraftRates(r);
  }, []);

  const yearIncome  = year === 0 ? income : income.filter((e) => e.date.startsWith(String(year)));
  const allocations = yearIncome.map((e) => calcAllocation(e, rates));

  // Running totals
  let runningTotal = 0;
  const rows = allocations.map((a) => {
    runningTotal += a.cashReceived;
    return { ...a, runningTotal };
  });

  const totals = {
    totalReceive: allocations.reduce((s, a) => s + a.totalReceive, 0),
    income:       allocations.reduce((s, a) => s + a.income, 0),
    hst:          allocations.reduce((s, a) => s + a.hst, 0),
    taxSavings:   allocations.reduce((s, a) => s + a.taxSavings, 0),
    corpTax:      allocations.reduce((s, a) => s + a.corpTax, 0),
    divTax:       allocations.reduce((s, a) => s + a.divTax, 0),
    cashReceived: allocations.reduce((s, a) => s + a.cashReceived, 0),
  };

  function saveSettings() {
    setRates(draftRates);
    saveTaxRates(draftRates);
    setShowSettings(false);
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Money Management</h1>
            <PageHelp content={PAGE_HELP.money} />
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Per-invoice breakdown of what to set aside for HST, corporate tax, and dividends
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            <option value={0}>All Years</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => { setDraftRates(rates); setShowSettings(true); }}
            className="px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            ⚙ Tax Rates
          </button>
        </div>
      </div>

      {/* Rate pills */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { label: "HST (Ontario)", value: "13%", color: "#f59e0b" },
          { label: "Corporate Tax", value: `${rates.corporateTaxPct}%`, color: "#3b82f6" },
          { label: "Dividends Tax", value: `${rates.dividendsTaxPct}%`, color: "#a855f7" },
          { label: "Total Set-Aside", value: `${rates.corporateTaxPct + rates.dividendsTaxPct}%`, color: "#f87171" },
        ].map((r) => (
          <span key={r.label} className="px-3 py-1 rounded-full font-medium"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: r.color }}>
            {r.label}: {r.value}
          </span>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Revenue (incl. HST)" value={fmt(totals.totalReceive)} color="var(--text-primary)" />
        <StatCard label="Savings 1 — HST" value={fmt(totals.hst)} color="#f59e0b" note="Remit to CRA" />
        <StatCard label="Savings 2 — Tax Provision" value={fmt(totals.taxSavings)} color="#3b82f6" note={`Corp ${fmt(totals.corpTax)} + Div ${fmt(totals.divTax)}`} />
        <StatCard label="Net Cash (yours to keep)" value={fmt(totals.cashReceived)} color="#10b981" />
      </div>

      {/* Allocation table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="px-5 py-3 flex items-center justify-between"
          style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Per-Invoice Breakdown — {year}</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Derived from Income Log entries</p>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-10 text-sm text-center" style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-base)" }}>
            No income entries for {year}. Add revenue in Income &amp; P&amp;L first.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ backgroundColor: "var(--bg-base)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {[
                    "Date", "Client", "Invoice #",
                    "Income", "Cash Received",
                    "Savings 1 (HST)", "Savings 2 (Tax)",
                    "Corp Tax", "Div Tax",
                    "Total Earned",
                  ].map((h) => (
                    <th key={h} className="px-4 py-2 text-right first:text-left font-medium"
                      style={{ color: "var(--text-secondary)", fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.entry.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.entry.date}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>{r.entry.client}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{r.entry.invoiceNo || "—"}</td>
                    <Num value={r.income} />
                    <Num value={r.cashReceived} color="#10b981" />
                    <Num value={r.hst} color="#f59e0b" />
                    <Num value={r.taxSavings} color="#3b82f6" />
                    <Num value={r.corpTax} />
                    <Num value={r.divTax} />
                    <td className="px-4 py-3 text-right font-bold" style={{ color: "#10b981" }}>{fmt(r.runningTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td colSpan={3} className="px-4 py-3 font-semibold" style={{ color: "var(--text-primary)" }}>Total</td>
                  <Num value={totals.income} bold />
                  <Num value={totals.cashReceived} color="#10b981" bold />
                  <Num value={totals.hst} color="#f59e0b" bold />
                  <Num value={totals.taxSavings} color="#3b82f6" bold />
                  <Num value={totals.corpTax} bold />
                  <Num value={totals.divTax} bold />
                  <td className="px-4 py-3 text-right font-bold" style={{ color: "#10b981" }}>{fmt(totals.cashReceived)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="rounded-xl p-4 flex flex-col gap-2 text-sm" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Cash Flow Tips for Ontario Incorporations</p>
        <ul className="flex flex-col gap-1.5 list-disc list-inside" style={{ color: "var(--text-secondary)" }}>
          <li><strong style={{ color: "var(--text-primary)" }}>Savings 1 (HST):</strong> Transfer the full HST amount to a separate account immediately — it's not your money.</li>
          <li><strong style={{ color: "var(--text-primary)" }}>Savings 2 (Tax):</strong> Set aside ~{rates.corporateTaxPct + rates.dividendsTaxPct}% of income for taxes. Adjust based on your actual bracket.</li>
          <li><strong style={{ color: "var(--text-primary)" }}>Corp Tax ({rates.corporateTaxPct}%):</strong> Ontario small business rate is 12.2% (3.2% provincial + 9% federal after SBD).</li>
          <li><strong style={{ color: "var(--text-primary)" }}>Dividends Tax ({rates.dividendsTaxPct}%):</strong> Approximate personal tax on eligible dividends — varies by your total personal income.</li>
          <li>Consider opening separate bank accounts: Operations, HST Holding, Tax Holding.</li>
        </ul>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Tax Rate Settings</p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Adjust these to match your actual tax situation. Talk to your accountant for precise rates.
            </p>
            <div className="flex flex-col gap-3">
              <RateField label="Corporate Tax %" value={draftRates.corporateTaxPct}
                onChange={(v) => setDraftRates((r) => ({ ...r, corporateTaxPct: v }))}
                note="Federal SBD: 9% + Ontario: 3.2% = 12.2% typical" />
              <RateField label="Dividends Tax %" value={draftRates.dividendsTaxPct}
                onChange={(v) => setDraftRates((r) => ({ ...r, dividendsTaxPct: v }))}
                note="Approx. personal tax on eligible dividends" />
            </div>
            <div className="flex gap-2 justify-end mt-1">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-secondary)" }}>Cancel</button>
              <button onClick={saveSettings} className="px-5 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Num({ value, color, bold }: { value: number; color?: string; bold?: boolean }) {
  return (
    <td className="px-4 py-3 text-right font-mono"
      style={{ color: color ?? "var(--text-primary)", fontWeight: bold ? 700 : 400 }}>
      {value.toLocaleString("en-CA", { style: "currency", currency: "CAD" })}
    </td>
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

function RateField({ label, value, onChange, note }: { label: string; value: number; onChange: (v: number) => void; note: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
      <input type="number" min={0} max={100} step={0.1} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        onFocus={(e) => e.target.select()}
        className="rounded-lg px-3 py-2 text-sm outline-none"
        style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{note}</p>
    </div>
  );
}
