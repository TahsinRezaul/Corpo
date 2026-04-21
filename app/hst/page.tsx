"use client";

import { useState, useEffect } from "react";
import { getSaved, getIncome, type SavedReceipt, type IncomeEntry } from "@/lib/storage";
import PageHelp from "@/components/PageHelp";
import { PAGE_HELP } from "@/lib/page-help-content";

function parseDollar(s: string): number {
  return parseFloat(s.replace(/[^0-9.-]/g, "")) || 0;
}
function fmt(n: number): string {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

const CURRENT_YEAR  = new Date().getFullYear();
const CURRENT_QTR   = Math.ceil((new Date().getMonth() + 1) / 3);
const YEARS         = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
const QUARTERS      = [1, 2, 3, 4] as const;
const QTR_LABELS    = ["Q1 (Jan–Mar)", "Q2 (Apr–Jun)", "Q3 (Jul–Sep)", "Q4 (Oct–Dec)"];
const QTR_MONTHS: Record<number, number[]> = { 1: [1,2,3], 2: [4,5,6], 3: [7,8,9], 4: [10,11,12] };

function inQtr(date: string, year: number, qtr: number): boolean {
  if (!date) return false;
  const [y, m] = date.split("-").map(Number);
  return y === year && QTR_MONTHS[qtr].includes(m);
}

type Period = "annual" | "quarterly";

export default function HSTPage() {
  const [period, setPeriod] = useState<Period>("quarterly");
  const [year, setYear]     = useState(CURRENT_YEAR);
  const [qtr, setQtr]       = useState<1|2|3|4>(CURRENT_QTR as 1|2|3|4);
  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  const [income, setIncome]     = useState<IncomeEntry[]>([]);

  useEffect(() => {
    setReceipts(getSaved());
    setIncome(getIncome());
  }, []);

  // Filter by period
  function inPeriod(date: string) {
    if (year === 0) return true;
    return period === "annual"
      ? date?.startsWith(String(year))
      : inQtr(date, year, qtr);
  }

  const periodReceipts = receipts.filter((r) => inPeriod(r.date));
  const periodIncome   = income.filter((e) => inPeriod(e.date));

  const hstCollected = periodIncome.reduce((s, e) => s + parseDollar(e.hstCollected), 0);
  const itc          = periodReceipts.reduce((s, r) => s + parseDollar(r.tax), 0); // Input Tax Credits
  const netHST       = hstCollected - itc;
  const owing        = Math.max(0, netHST);
  const refund       = Math.max(0, -netHST);

  // CRA filing deadlines for quarterly filers (Ontario)
  const DEADLINES = [
    { qtr: "Q1 (Jan–Mar)", due: `Apr 30, ${year}` },
    { qtr: "Q2 (Apr–Jun)", due: `Jul 31, ${year}` },
    { qtr: "Q3 (Jul–Sep)", due: `Oct 31, ${year}` },
    { qtr: "Q4 (Oct–Dec)", due: `Jan 31, ${year + 1}` },
  ];

  const periodLabel = period === "annual"
    ? `Annual ${year}`
    : `${QTR_LABELS[qtr - 1]} ${year}`;

  return (
    <div className="max-w-5xl mx-auto px-5 py-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>HST Report</h1>
            <PageHelp
              content={PAGE_HELP.hst}
              dataContext={`HST Collected: ${fmt(hstCollected)}, ITCs: ${fmt(itc)}, Net HST: ${fmt(netHST)}, Receipts: ${periodReceipts.length}, Income entries: ${periodIncome.length}`}
            />
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Ontario HST 13% · File via CRA My Business Account or GST/HST NETFILE
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {(["quarterly", "annual"] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className="px-3 py-1.5 text-sm capitalize"
                style={{
                  backgroundColor: period === p ? "var(--accent-blue)" : "var(--bg-surface)",
                  color: period === p ? "#fff" : "var(--text-secondary)",
                  border: "none",
                }}>
                {p}
              </button>
            ))}
          </div>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            <option value={0}>All Years</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {period === "quarterly" && year !== 0 && (
            <select value={qtr} onChange={(e) => setQtr(Number(e.target.value) as 1|2|3|4)}
              className="rounded-lg px-3 py-1.5 text-sm"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
              {QUARTERS.map((q) => <option key={q} value={q}>{QTR_LABELS[q - 1]}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="HST Collected" value={fmt(hstCollected)} color="#10b981" note="From revenue entries" />
        <StatCard label="Input Tax Credits (ITC)" value={fmt(itc)} color="var(--accent-blue)" note="HST paid on receipts" />
        <StatCard
          label={netHST >= 0 ? "HST Owing" : "HST Refund"}
          value={netHST >= 0 ? fmt(owing) : fmt(refund)}
          color={netHST >= 0 ? "#f87171" : "#10b981"}
          note={netHST >= 0 ? "Remit to CRA" : "Claim from CRA"}
        />
        <StatCard label="Filing Period" value={periodLabel} color="var(--text-primary)" />
      </div>

      {/* Calculation breakdown */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="px-5 py-3" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Line-by-Line Calculation</p>
        </div>
        <div className="p-5 flex flex-col gap-3" style={{ backgroundColor: "var(--bg-base)" }}>
          <HSTLine label="Line 101 — Total Sales (before HST)" value={fmt(periodIncome.reduce((s,e) => s + parseDollar(e.amount), 0))} />
          <HSTLine label="Line 105 — HST Collected (13% on taxable sales)" value={fmt(hstCollected)} color="#10b981" />
          <div className="border-t my-1" style={{ borderColor: "var(--border)" }} />
          <HSTLine label="Line 106 — Input Tax Credits (ITC) — HST paid on purchases" value={fmt(itc)} color="var(--accent-blue)" />
          <div className="border-t my-1" style={{ borderColor: "var(--border)" }} />
          <HSTLine
            label={netHST >= 0 ? "Line 109 — Net Tax Owing (remit to CRA)" : "Line 111 — Net Refund (claim from CRA)"}
            value={netHST >= 0 ? fmt(owing) : fmt(refund)}
            color={netHST >= 0 ? "#f87171" : "#10b981"}
            bold
          />
        </div>
      </div>

      {/* ITC breakdown */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <div className="px-5 py-3" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>ITC Details — Receipts with HST</p>
          </div>
          <div style={{ backgroundColor: "var(--bg-base)", maxHeight: 280, overflowY: "auto" }}>
            {periodReceipts.filter((r) => parseDollar(r.tax) > 0).length === 0 ? (
              <p className="px-5 py-6 text-sm" style={{ color: "var(--text-secondary)" }}>No receipts with HST for this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Date", "Vendor", "HST Paid"].map((h) => (
                      <th key={h} className="px-4 py-2 text-left font-medium" style={{ color: "var(--text-secondary)", fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodReceipts.filter((r) => parseDollar(r.tax) > 0).map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{r.date}</td>
                      <td className="px-4 py-2.5" style={{ color: "var(--text-primary)" }}>{r.vendor || "—"}</td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "var(--accent-blue)" }}>{r.tax}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Filing calendar */}
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <div className="px-5 py-3" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Filing Deadlines — {year}</p>
          </div>
          <div className="p-5 flex flex-col gap-3" style={{ backgroundColor: "var(--bg-base)" }}>
            {DEADLINES.map((d, i) => {
              const isPast = new Date() > new Date(d.due);
              const isCurrent = period === "quarterly" && (i + 1) === qtr;
              return (
                <div key={d.qtr} className="flex items-center justify-between text-sm rounded-lg px-3 py-2"
                  style={{
                    backgroundColor: isCurrent ? "rgba(59,130,246,0.08)" : "transparent",
                    border: isCurrent ? "1px solid rgba(59,130,246,0.2)" : "1px solid transparent",
                  }}>
                  <div>
                    <p className="font-medium" style={{ color: "var(--text-primary)" }}>{d.qtr}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Due {d.due}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: isPast ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                      color: isPast ? "#10b981" : "#f59e0b",
                    }}>
                    {isPast ? "Filed" : "Upcoming"}
                  </span>
                </div>
              );
            })}
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              Annual filers: due 3 months after your fiscal year end.
            </p>
          </div>
        </div>
      </div>

      {/* HST tips */}
      <div className="rounded-xl p-4 flex flex-col gap-2 text-sm" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <p className="font-semibold" style={{ color: "var(--text-primary)" }}>HST Tips for Ontario Incorporations</p>
        <ul className="flex flex-col gap-1.5 list-disc list-inside" style={{ color: "var(--text-secondary)" }}>
          <li>Register for HST once revenue exceeds $30,000 in any 4 consecutive quarters.</li>
          <li>Ontario HST rate is 13% (5% federal GST + 8% provincial).</li>
          <li>Most business expenses have ITCs — keep all receipts showing HST paid.</li>
          <li>Meals & Entertainment: only 50% of HST on these expenses is claimable as ITC.</li>
          <li>File and remit on time to avoid CRA penalties (5% + 1%/month).</li>
          <li>Consider the Quick Method if annual revenue is under $400,000 — simpler remittance.</li>
        </ul>
      </div>
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

function HSTLine({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)", fontWeight: bold ? 600 : 400 }}>{label}</p>
      <p className="text-sm font-semibold whitespace-nowrap" style={{ color: color ?? "var(--text-primary)", fontWeight: bold ? 700 : 600 }}>{value}</p>
    </div>
  );
}
