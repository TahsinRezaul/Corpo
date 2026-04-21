"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  getSaved, getIncome, getMileage, getLoanEntries,
  getBusinessProfile, calcMileageDeduction,
  type SavedReceipt, type IncomeEntry, type MileageTrip,
  CATEGORIES,
} from "@/lib/storage";
import PageHelp from "@/components/PageHelp";
import { PAGE_HELP } from "@/lib/page-help-content";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDollar(s: string | number | undefined): number {
  return parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
}
function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtKm(n: number): string {
  return n.toLocaleString("en-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " km";
}
function currentYear() { return new Date().getFullYear(); }

// ── Print styles ──────────────────────────────────────────────────────────────

const PRINT_STYLES = `
@media print {
  body { background: white !important; color: black !important; }
  .no-print { display: none !important; }
  .print-page { page-break-after: always; }
  .print-section { page-break-inside: avoid; }
  nav, header { display: none !important; }
}
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
`;

// ── Data aggregation ──────────────────────────────────────────────────────────

type ReportData = {
  year: number;
  bizName: string;
  hstNumber: string;
  totalIncome: number;
  hstCollected: number;
  totalExpenses: number;
  hstPaid: number;
  expensesByCategory: { category: string; total: number; count: number }[];
  totalKm: number;
  mileageDeduction: number;
  loanBalance: number;
  netIncome: number;
  netHST: number;
  receipts: SavedReceipt[];
  incomeEntries: IncomeEntry[];
  trips: MileageTrip[];
};

function buildReport(year: number): ReportData {
  const profile  = getBusinessProfile();
  const receipts = getSaved().filter(r => r.date?.startsWith(String(year)));
  const income   = getIncome().filter(e => e.date?.startsWith(String(year)));
  const trips    = getMileage().filter(t => t.date?.startsWith(String(year)));
  const loans    = getLoanEntries().filter(e => e.date?.startsWith(String(year)));

  const totalIncome   = income.reduce((s, e) => s + parseDollar(e.amount), 0);
  const hstCollected  = income.reduce((s, e) => s + parseDollar(e.hstCollected), 0);
  const totalExpenses = receipts.reduce((s, r) => s + parseDollar(r.subtotal || r.total), 0);
  const hstPaid       = receipts.reduce((s, r) => s + parseDollar(r.tax), 0);
  const totalKm       = trips.reduce((s, t) => s + (t.km || 0), 0);
  const mileageDeduction = calcMileageDeduction(totalKm);
  const loanBalance   = loans.reduce((s, e) => s + e.debit - e.credit, 0);

  // Group expenses by category
  const catMap = new Map<string, { total: number; count: number }>();
  for (const r of receipts) {
    const cat = r.category || "Uncategorized";
    const existing = catMap.get(cat) ?? { total: 0, count: 0 };
    catMap.set(cat, { total: existing.total + parseDollar(r.subtotal || r.total), count: existing.count + 1 });
  }
  const expensesByCategory = Array.from(catMap.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.total - a.total);

  const netHST    = hstCollected - hstPaid;
  const netIncome = totalIncome - totalExpenses - mileageDeduction;

  return {
    year, bizName: profile.name || "Your Business", hstNumber: profile.hstNumber,
    totalIncome, hstCollected, totalExpenses, hstPaid,
    expensesByCategory, totalKm, mileageDeduction,
    loanBalance, netIncome, netHST,
    receipts, incomeEntries: income, trips,
  };
}

// ── Section card ─────────────────────────────────────────────────────────────

function Card({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div className="print-section rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--bg-surface)" }}>
      <div className="flex items-center px-5 py-3" style={{ borderBottom: "1px solid var(--border)", backgroundColor: accent ? "rgba(16,185,129,0.06)" : undefined }}>
        <h3 className="text-sm font-semibold" style={{ color: accent ?? "var(--text-primary)", letterSpacing: "-0.01em" }}>{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Row({ label, value, sub, bold, accent, indent }: { label: string; value: string; sub?: string; bold?: boolean; accent?: string; indent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-2" style={{ borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text-secondary)", fontSize: 13, fontWeight: bold ? 600 : 400, paddingLeft: indent ? 16 : 0 }}>{label}</span>
      <div className="text-right">
        <span style={{ color: accent ?? (bold ? "var(--text-primary)" : "var(--text-primary)"), fontSize: 13, fontWeight: bold ? 700 : 500 }}>{value}</span>
        {sub && <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Tab: Summary ─────────────────────────────────────────────────────────────

function SummaryTab({ d }: { d: ReportData }) {
  const corpTaxEst = Math.max(0, d.netIncome) * 0.155; // ~15.5% small biz rate ON

  return (
    <div className="flex flex-col gap-5">

      {/* Business info */}
      <Card title="Business Information">
        <Row label="Business Name"  value={d.bizName || "—"} />
        <Row label="HST / GST No."  value={d.hstNumber || "—"} />
        <Row label="Tax Year"       value={String(d.year)} />
        <Row label="Province"       value="Ontario (ON)" />
        <Row label="Fiscal Year End" value="December 31" />
      </Card>

      {/* Income */}
      <Card title="Income">
        <Row label="Gross Revenue (excl. HST)" value={fmt(d.totalIncome)} bold />
        <Row label="HST / GST Collected"       value={fmt(d.hstCollected)} sub="To be remitted to CRA" />
        <Row label="Invoice Count"             value={String(d.incomeEntries.length)} />
      </Card>

      {/* Expenses */}
      <Card title="Expenses">
        <Row label="Total Business Expenses" value={fmt(d.totalExpenses)} bold />
        <Row label="HST Paid (Input Tax Credits)" value={fmt(d.hstPaid)} sub="Claimable against HST collected" />
        <Row label="Receipt Count"            value={String(d.receipts.length)} />
      </Card>

      {/* Mileage */}
      <Card title="Mileage Deduction">
        <Row label="Total Business KM"        value={fmtKm(d.totalKm)} />
        <Row label="CRA Rate (first 5,000 km)" value="$0.70 / km" sub="Over 5,000 km: $0.64 / km" />
        <Row label="Estimated Deduction"      value={fmt(d.mileageDeduction)} bold accent="#10b981" />
      </Card>

      {/* HST Summary */}
      <Card title="HST / GST Summary">
        <Row label="HST Collected from Clients" value={fmt(d.hstCollected)} />
        <Row label="HST Paid on Expenses (ITCs)" value={`(${fmt(d.hstPaid)})`} />
        {d.netHST >= 0
          ? <Row label="Net HST Owing to CRA" value={fmt(d.netHST)} bold accent="#ef4444" />
          : <Row label="HST Refund Owed to You" value={fmt(-d.netHST)} bold accent="#10b981" />
        }
      </Card>

      {/* Shareholder loan */}
      {d.loanBalance !== 0 && (
        <Card title="Shareholder Loan (Year Net)">
          <Row
            label={d.loanBalance > 0 ? "Company owes you" : "You owe the company"}
            value={fmt(Math.abs(d.loanBalance))}
            bold
            accent={d.loanBalance > 0 ? "#10b981" : "#ef4444"}
          />
          <p className="text-xs mt-3" style={{ color: "var(--text-secondary)" }}>
            Note: amounts from this tax year only. Open the Shareholder Loan module for full balance.
          </p>
        </Card>
      )}

      {/* Net income estimate */}
      <Card title="Net Income Estimate (Pre-Tax)" accent="#3b82f6">
        <Row label="Gross Revenue"              value={fmt(d.totalIncome)} />
        <Row label="Less: Business Expenses"    value={`(${fmt(d.totalExpenses)})`} />
        <Row label="Less: Mileage Deduction"    value={`(${fmt(d.mileageDeduction)})`} />
        <Row label="Net Income Before Corp Tax" value={fmt(d.netIncome)} bold />
        <Row label="Estimated Corp Tax (~15.5%)" value={fmt(corpTaxEst)} sub="Federal small biz rate + ON. Accountant will confirm." />
        <p className="text-xs mt-4 p-3 rounded-xl" style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)" }}>
          This is an estimate only. Your accountant will calculate the exact figures using T2 schedules.
          CCA, home office, and other deductions are not included here.
        </p>
      </Card>

    </div>
  );
}

// ── Tab: Expenses ─────────────────────────────────────────────────────────────

function ExpensesTab({ d }: { d: ReportData }) {
  return (
    <div className="flex flex-col gap-5">

      <Card title={`Expenses by Category — ${d.year}`}>
        {d.expensesByCategory.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No expenses recorded for {d.year}.</p>
        ) : (
          <>
            {d.expensesByCategory.map(cat => (
              <Row key={cat.category} label={cat.category} value={fmt(cat.total)} sub={`${cat.count} receipt${cat.count !== 1 ? "s" : ""}`} indent />
            ))}
            <Row label="TOTAL" value={fmt(d.totalExpenses)} bold />
          </>
        )}
      </Card>

      <Card title="All Receipts">
        {d.receipts.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No receipts for {d.year}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  {["Date", "Vendor", "Category", "Subtotal", "Tax", "Total"].map(h => (
                    <th key={h} className="text-left py-2 px-2" style={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.receipts.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", backgroundColor: i % 2 === 0 ? "transparent" : "var(--bg-elevated)" }}>
                    <td className="py-2 px-2" style={{ color: "var(--text-secondary)" }}>{r.date || "—"}</td>
                    <td className="py-2 px-2" style={{ color: "var(--text-primary)" }}>{r.vendor || "—"}</td>
                    <td className="py-2 px-2" style={{ color: "var(--text-secondary)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.category || "—"}</td>
                    <td className="py-2 px-2 text-right" style={{ color: "var(--text-primary)" }}>{r.subtotal ? fmt(parseDollar(r.subtotal)) : "—"}</td>
                    <td className="py-2 px-2 text-right" style={{ color: "var(--text-secondary)" }}>{r.tax ? fmt(parseDollar(r.tax)) : "—"}</td>
                    <td className="py-2 px-2 text-right font-medium" style={{ color: "var(--text-primary)" }}>{fmt(parseDollar(r.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
  );
}

// ── Tab: Full Package ─────────────────────────────────────────────────────────

function PackageTab({ d }: { d: ReportData }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="p-4 rounded-2xl" style={{ border: "1.5px solid rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.06)" }}>
        <p className="text-sm font-semibold" style={{ color: "#10b981" }}>Full Accountant Package</p>
        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
          This tab compiles everything your accountant needs to complete your T2 corporate tax return.
          Click "Print / Download PDF" to save it as a PDF and email it to them.
        </p>
      </div>

      {/* Header block */}
      <div className="rounded-2xl p-5" style={{ border: "1px solid var(--border)", backgroundColor: "var(--bg-surface)" }}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-black" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
              {d.bizName || "Your Business"}
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Corporate Tax Year: January 1 – December 31, {d.year}
            </p>
            {d.hstNumber && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>HST No: {d.hstNumber}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Prepared by CORPO</p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Generated: {new Date().toLocaleDateString("en-CA")}</p>
          </div>
        </div>
      </div>

      <SummaryTab d={d} />

      <div className="print-page" />

      <ExpensesTab d={d} />

      {/* Mileage log */}
      {d.trips.length > 0 && (
        <Card title="Mileage Log">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  {["Date", "From", "To", "Purpose", "KM"].map(h => (
                    <th key={h} className="text-left py-2 px-2" style={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.trips.map((t, i) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--border)", backgroundColor: i % 2 === 0 ? "transparent" : "var(--bg-elevated)" }}>
                    <td className="py-2 px-2" style={{ color: "var(--text-secondary)" }}>{t.date || "—"}</td>
                    <td className="py-2 px-2" style={{ color: "var(--text-primary)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.from || "—"}</td>
                    <td className="py-2 px-2" style={{ color: "var(--text-primary)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.to || "—"}</td>
                    <td className="py-2 px-2" style={{ color: "var(--text-secondary)" }}>{t.purpose || "—"}</td>
                    <td className="py-2 px-2 text-right font-medium" style={{ color: "var(--text-primary)" }}>{t.km?.toFixed(1) ?? "—"}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td colSpan={4} className="py-2 px-2 text-right font-semibold text-xs" style={{ color: "var(--text-secondary)" }}>Total</td>
                  <td className="py-2 px-2 text-right font-bold text-xs" style={{ color: "var(--text-primary)" }}>{d.totalKm.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 p-3 rounded-xl text-xs" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
            CRA allowable deduction: {fmtKm(d.totalKm)} × rate = <strong style={{ color: "var(--text-primary)" }}>{fmt(d.mileageDeduction)}</strong>
          </div>
        </Card>
      )}

      {/* Notes for accountant */}
      <Card title="Notes for Your Accountant">
        <ul className="text-sm flex flex-col gap-2" style={{ color: "var(--text-secondary)" }}>
          <li>• All figures are for fiscal year January 1 – December 31, {d.year}.</li>
          <li>• Receipts are categorized per T2 Schedule 1 operating expense categories.</li>
          <li>• Mileage deduction uses CRA prescribed rates ($0.70/km first 5,000 km, $0.64/km after).</li>
          <li>• HST figures: collected = to be remitted, paid on expenses = Input Tax Credits (ITCs).</li>
          <li>• Net income estimate does not include CCA, home office, or other deductions — accountant to confirm.</li>
          {d.loanBalance !== 0 && <li>• Shareholder loan balance shown is for this tax year only; confirm full running balance.</li>}
          <li>• All data self-reported via CORPO bookkeeping software. Receipts and invoices available on request.</li>
        </ul>
      </Card>
    </div>
  );
}

// ── Coming Soon stub ──────────────────────────────────────────────────────────

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <span style={{ fontSize: 48 }}>🔜</span>
      <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{name}</h3>
      <p className="text-sm text-center max-w-xs" style={{ color: "var(--text-secondary)" }}>
        This feature is coming in a future patch update. Stay tuned!
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type TabKey = "summary" | "expenses" | "package";

const TABS: { key: TabKey; label: string; desc: string; downloadable: boolean }[] = [
  { key: "summary",  label: "Tax Year Summary",       desc: "Key numbers at a glance",         downloadable: true },
  { key: "expenses", label: "Categorized Expenses",   desc: "All receipts by category",         downloadable: true },
  { key: "package",  label: "Full Accountant Package",desc: "Everything combined, print-ready", downloadable: true },
];

function AccountantPageInner() {
  const searchParams = useSearchParams();
  const initialTab   = (searchParams.get("tab") as TabKey | null) ?? "summary";

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [year, setYear]           = useState(currentYear());
  const [data, setData]           = useState<ReportData | null>(null);

  const YEARS = [currentYear(), currentYear() - 1, currentYear() - 2];

  useEffect(() => {
    setData(buildReport(year));
  }, [year]);

  function handlePrint() {
    window.print();
  }

  if (!data) return null;

  return (
    <>
      <style>{PRINT_STYLES}</style>

      <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-base)" }}>

        {/* ── Page header ──────────────────────────────── */}
        <div className="no-print" style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-surface)" }}>
          <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                  Accountant Reports
                </h1>
                <PageHelp content={PAGE_HELP.accountant} />
              </div>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Tax-ready documents for your accountant
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Year selector */}
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="text-sm rounded-lg px-3 py-1.5 outline-none"
                style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              >
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {/* Print / Download */}
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: "#10b981", color: "white", border: "none", cursor: "pointer" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12l7 7 7-7"/>
                </svg>
                Print / Save PDF
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="max-w-3xl mx-auto px-5 flex gap-0" style={{ borderTop: "1px solid var(--border)" }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex flex-col items-start py-3 px-4 text-left"
                style={{
                  borderBottom: `2px solid ${activeTab === tab.key ? "var(--accent-blue)" : "transparent"}`,
                  color: activeTab === tab.key ? "var(--accent-blue)" : "var(--text-secondary)",
                  minWidth: 0,
                }}
              >
                <span className="text-xs font-semibold">{tab.label}</span>
                <span className="text-xs opacity-60 hidden sm:block">{tab.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ──────────────────────────────── */}
        <div className="max-w-3xl mx-auto px-5 py-6" style={{ animation: "fadeIn 0.2s ease-out" }}>

          {/* Print-only header */}
          <div className="hidden print:block mb-6">
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "#111", letterSpacing: "-0.03em" }}>
              {data.bizName} — {TABS.find(t => t.key === activeTab)?.label}
            </h1>
            <p style={{ color: "#555", fontSize: 13 }}>Tax Year {data.year} · Generated {new Date().toLocaleDateString("en-CA")}</p>
          </div>

          {activeTab === "summary"  && <SummaryTab  d={data} />}
          {activeTab === "expenses" && <ExpensesTab d={data} />}
          {activeTab === "package"  && <PackageTab  d={data} />}
        </div>

        {/* ── Coming soon modules note ──────────────────── */}
        <div className="no-print max-w-3xl mx-auto px-5 pb-10">
          <div className="rounded-2xl p-4" style={{ border: "1px dashed var(--border)", backgroundColor: "var(--bg-elevated)" }}>
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Coming in future patch updates:</p>
            <div className="flex flex-wrap gap-2">
              {["T2 Corp Tax Prep Sheet", "T4 Slips", "CRA Filing Checklist", "Director's Resolution Template"].map(item => (
                <span key={item} className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  🔜 {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function AccountantPage() {
  return (
    <Suspense>
      <AccountantPageInner />
    </Suspense>
  );
}
