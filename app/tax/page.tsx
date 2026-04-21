"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { getSaved, getIncome, getInvoices, type SavedReceipt, type IncomeEntry, type Invoice } from "@/lib/storage";
import PageHelp from "@/components/PageHelp";
import { PAGE_HELP } from "@/lib/page-help-content";

// ─────────────────────────────────────────────────────────────────────────────
// Canadian Tax Engine — Ontario 2025
// ─────────────────────────────────────────────────────────────────────────────

const FED_BRACKETS = [
  { min: 0,        max: 57_375,  rate: 0.15   },
  { min: 57_375,   max: 114_750, rate: 0.205  },
  { min: 114_750,  max: 158_520, rate: 0.26   },
  { min: 158_520,  max: 220_000, rate: 0.29   },
  { min: 220_000,  max: Infinity,rate: 0.33   },
];
const ON_BRACKETS = [
  { min: 0,        max: 51_446,  rate: 0.0505 },
  { min: 51_446,   max: 102_894, rate: 0.0915 },
  { min: 102_894,  max: 150_000, rate: 0.1116 },
  { min: 150_000,  max: 220_000, rate: 0.1216 },
  { min: 220_000,  max: Infinity,rate: 0.1316 },
];

const FED_BASIC  = 16_129;
const ON_BASIC   = 11_865;
const CPP_EXEMPT = 3_500;
const CPP_MAX    = 68_500;
const CPP_RATE   = 0.0595;
const CPP2_MAX   = 73_200;
const CPP2_RATE  = 0.04;
const EI_MAX     = 63_200;
const EI_RATE    = 0.0164;

const CORP_RATE_SB  = 0.122;  // 9% fed + 3.2% ON small biz
const CORP_RATE_GEN = 0.265;  // 15% fed + 11.5% ON general
const SBD_LIMIT     = 500_000;

const NELIG_GROSSUP        = 0.15;
const NELIG_FED_DTC_RATE   = 0.090301;
const NELIG_ON_DTC_RATE    = 0.029863;

function bracketTax(income: number, brackets: typeof FED_BRACKETS) {
  let tax = 0;
  for (const b of brackets) {
    if (income <= b.min) break;
    tax += (Math.min(income, b.max) - b.min) * b.rate;
  }
  return tax;
}

function salaryTax(salary: number) {
  const fed = Math.max(0, bracketTax(salary, FED_BRACKETS) - FED_BASIC * 0.15);
  const on  = Math.max(0, bracketTax(salary, ON_BRACKETS)  - ON_BASIC  * 0.0505);
  const cpp = Math.min(Math.max(salary - CPP_EXEMPT, 0), CPP_MAX - CPP_EXEMPT) * CPP_RATE
            + Math.min(Math.max(salary - CPP_MAX, 0), CPP2_MAX - CPP_MAX) * CPP2_RATE;
  const ei  = Math.min(salary, EI_MAX) * EI_RATE;
  const total = fed + on + cpp + ei;
  return { fed, on, cpp, ei, total, net: salary - total };
}

function dividendTax(div: number, otherIncome = 0) {
  const grossed     = div * (1 + NELIG_GROSSUP);
  const totalInc    = otherIncome + grossed;
  const fedTotal    = Math.max(0, bracketTax(totalInc, FED_BRACKETS) - FED_BASIC * 0.15);
  const onTotal     = Math.max(0, bracketTax(totalInc, ON_BRACKETS)  - ON_BASIC  * 0.0505);
  const fedOther    = Math.max(0, bracketTax(otherIncome, FED_BRACKETS) - FED_BASIC * 0.15);
  const onOther     = Math.max(0, bracketTax(otherIncome, ON_BRACKETS)  - ON_BASIC  * 0.0505);
  const fedDTC = grossed * NELIG_FED_DTC_RATE;
  const onDTC  = grossed * NELIG_ON_DTC_RATE;
  const total  = Math.max(0, (fedTotal - fedOther) + (onTotal - onOther) - fedDTC - onDTC);
  return { total, net: div - total, grossed };
}

function corpTax(income: number) {
  const sb  = Math.min(Math.max(income, 0), SBD_LIMIT);
  const gen = Math.max(0, income - SBD_LIMIT);
  return sb * CORP_RATE_SB + gen * CORP_RATE_GEN;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

function fmt(n: number) { return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" }); }
function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function parseDollar(s: string) { return parseFloat((s ?? "").replace(/[^0-9.-]/g, "")) || 0; }

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Card({ label, value, sub, color = "var(--accent-blue)" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl px-5 py-4 flex flex-col gap-1" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

function Row({ label, value, bold, color, indent, border }: { label: string; value: string; bold?: boolean; color?: string; indent?: boolean; border?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 px-4" style={{ borderTop: border ? "1px solid var(--border)" : undefined }}>
      <span className="text-sm" style={{ color: indent ? "var(--text-secondary)" : "var(--text-primary)", paddingLeft: indent ? 14 : 0, fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: color ?? "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function NumInput({ label, value, onChange, prefix = "$" }: { label: string; value: number; onChange: (n: number) => void; prefix?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-secondary)" }}>{prefix}</span>
        <input type="number" min={0} value={value || ""}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          onFocus={(e) => e.target.select()}
          className="w-full rounded-lg pl-6 pr-3 py-2 text-sm outline-none"
          style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "overview" | "split" | "hst" | "brackets";

function renderMarkdown(text: string) {
  return text.split("\n").map((line, i) => {
    const trimmed = line.trim();
    // H1/H2 headers
    if (trimmed.startsWith("## ")) return <p key={i} className="font-bold mt-2 mb-0.5" style={{ color: "var(--text-primary)", fontSize: 12 }}>{trimmed.slice(3)}</p>;
    if (trimmed.startsWith("# "))  return <p key={i} className="font-bold mt-2 mb-0.5" style={{ color: "var(--text-primary)", fontSize: 13 }}>{trimmed.slice(2)}</p>;
    // Bullet points
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const content = trimmed.slice(2);
      return <p key={i} className="flex gap-1.5" style={{ margin: "1px 0" }}><span style={{ opacity: 0.5, flexShrink: 0 }}>•</span><span>{inlineMd(content)}</span></p>;
    }
    // Empty line
    if (!trimmed) return <div key={i} style={{ height: 6 }} />;
    // Normal line
    return <p key={i} style={{ margin: "1px 0" }}>{inlineMd(trimmed)}</p>;
  });
}

function inlineMd(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} style={{ color: "var(--text-primary)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>
      : <Fragment key={i}>{part}</Fragment>
  );
}

export default function TaxPage() {
  const [year, setYear]         = useState(CURRENT_YEAR);
  const [tab, setTab]           = useState<Tab>("overview");
  const [detailed, setDetailed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput]       = useState("");
  const [chatLoading, setChatLoading]   = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  const [income, setIncome]     = useState<IncomeEntry[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  // Money Split planner
  const [totalEarned, setTotalEarned] = useState(0);
  const [asSalary, setAsSalary]       = useState(0);
  const [asDividend, setAsDividend]   = useState(0);
  const [splitInited, setSplitInited] = useState(false);
  const [override, setOverride]       = useState(false);
  const [keepOverride, setKeepOverride] = useState(0);

  // In normal mode keep-in-corp is always the remainder
  const keepInCorp  = override ? keepOverride : Math.max(0, totalEarned - asSalary - asDividend);
  const allocated   = keepInCorp + asSalary + asDividend;
  const overBudget  = override && allocated > totalEarned + 1;

  function handleSalaryChange(value: number) {
    if (!override) {
      // Clamp salary to totalEarned, then reduce dividend if needed
      const salary = Math.min(value, totalEarned);
      const remaining = Math.max(0, totalEarned - salary);
      setAsSalary(salary);
      if (asDividend > remaining) setAsDividend(remaining);
    } else {
      setAsSalary(value);
    }
  }

  function resetSplit() {
    setAsSalary(0);
    setAsDividend(0);
    setKeepOverride(totalEarned);
    setOverride(false);
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const userMsg = { role: "user" as const, content: text };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    setChatInput("");
    setChatLoading(true);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    try {
      const context = `
- Year: ${year}
- Revenue (paid invoices): ${fmt(totalRevenue)}
- Total expenses: ${fmt(totalExpenses)}
- Net profit: ${fmt(netIncome)}
- Corporate tax estimate: ${fmt(estCorpTax)}
- After-corp-tax cash: ${fmt(afterCorpTax)}
- HST collected: ${fmt(hstCollected)}
- HST paid on expenses (ITC): ${fmt(hstPaid)}
- HST owing to CRA: ${fmt(hstOwing)}
- Money split plan: Keep in corp ${fmt(keepInCorp)}, Salary ${fmt(asSalary)}, Dividends ${fmt(asDividend)}
- Estimated personal tax on salary: ${fmt(salT.total)}
- Estimated personal tax on dividends: ${fmt(divT.total)}
- Total tax (corp + personal): ${fmt(totalTaxPaid)}
- Net cash in pocket: ${fmt(netCashInHand)}
`.trim();
      const res = await fetch("/api/tax-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated, context }),
      });
      const data = await res.json();
      if (data.reply) {
        setChatMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Try again." }]);
    }
    setChatLoading(false);
  }

  useEffect(() => {
    setReceipts(getSaved());
    setIncome(getIncome());
    setInvoices(getInvoices());
  }, []);

  // ── Compute year totals ──
  const yr = String(year);

  const yearReceipts = year === 0 ? receipts : receipts.filter(r => r.date?.startsWith(yr));
  const yearIncome   = year === 0 ? income   : income.filter(e => e.date?.startsWith(yr));
  const yearInvoices = year === 0 ? invoices : invoices.filter(i => i.dateIssued?.startsWith(yr));

  // Revenue: paid invoices + income entries (deduplicate by using invoices as primary)
  const invRevenue = yearInvoices
    .filter(i => i.status === "paid")
    .reduce((s, i) => s + i.lineItems.reduce((a, l) => a + l.qty * l.rate, 0), 0);
  const incRevenue  = yearIncome.reduce((s, e) => s + parseDollar(e.amount), 0);
  const totalRevenue = Math.max(invRevenue, incRevenue); // use whichever is larger

  // HST — prefer invoices if populated, else income entries
  const invHST = yearInvoices
    .filter(i => i.status === "paid")
    .reduce((s, i) => s + i.lineItems.reduce((a, l) => a + l.qty * l.rate, 0) * i.hstRate, 0);
  const incHST = yearIncome.reduce((s, e) => s + parseDollar(e.hstCollected), 0);
  const hstCollected = invHST > 0 ? invHST : incHST;
  const hstPaid      = yearReceipts.reduce((s, r) => s + parseDollar(r.tax), 0);
  const hstOwing     = Math.max(0, hstCollected - hstPaid);

  const totalExpenses = yearReceipts.reduce((s, r) => s + parseDollar(r.subtotal || r.total), 0);
  const netIncome     = totalRevenue - totalExpenses;
  const estCorpTax    = corpTax(Math.max(0, netIncome));
  const afterCorpTax  = Math.max(0, netIncome - estCorpTax);

  // Pre-fill split planner once we have data
  useEffect(() => {
    if (splitInited || afterCorpTax === 0) return;
    setTotalEarned(Math.round(afterCorpTax));
    setAsSalary(0);
    setAsDividend(0);
    setOverride(false);
    setSplitInited(true);
  }, [afterCorpTax, splitInited]);

  // ── Split planner math ──

  // Corp keeps `keepInCorp` — already paid corp tax on it proportionally
  const corpTaxOnKept   = keepInCorp * CORP_RATE_SB;   // corp already paid this
  const retainedNet     = keepInCorp - corpTaxOnKept;

  // Salary: paid gross, corp deducts it (saves corp tax), person pays personal tax
  const salT = salaryTax(asSalary);
  const corpSavedBySalary = asSalary * CORP_RATE_SB; // corp tax savings from salary deduction

  // Dividend: paid from after-corp-tax money
  const divT = dividendTax(asDividend, asSalary);

  const totalTaxPaid  = corpTaxOnKept + salT.total + divT.total;
  const netCashInHand = salT.net + divT.net;
  const totalOut      = retainedNet + netCashInHand;

  const bracketRows = [
    { range: "$0 – $57,375",       fedRate: "15.0%", onRate: "5.05%",  combined: "20.05%" },
    { range: "$57,376 – $102,894", fedRate: "20.5%", onRate: "9.15%",  combined: "29.65%" },
    { range: "$102,895 – $114,750",fedRate: "20.5%", onRate: "11.16%", combined: "31.66%" },
    { range: "$114,751 – $150,000",fedRate: "26.0%", onRate: "11.16%", combined: "37.16%" },
    { range: "$150,001 – $158,520",fedRate: "26.0%", onRate: "12.16%", combined: "38.16%" },
    { range: "$158,521 – $220,000",fedRate: "29.0%", onRate: "12.16%", combined: "41.16%" },
    { range: "$220,001+",          fedRate: "33.0%", onRate: "13.16%", combined: "46.16%" },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Year Overview" },
    { key: "split",    label: "Money Split" },
    { key: "hst",      label: "HST Remittance" },
    { key: "brackets", label: "Tax Brackets" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-5 py-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Tax Planner</h1>
            <PageHelp content={PAGE_HELP.tax} />
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Ontario CCPC · 2025 rates · {yearInvoices.length} invoice{yearInvoices.length !== 1 ? "s" : ""} · {yearReceipts.length} receipt{yearReceipts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Simple / Detailed toggle */}
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <button onClick={() => setDetailed(false)}
              className="px-3 py-1.5 text-sm transition-colors"
              style={{ backgroundColor: !detailed ? "var(--accent-blue)" : "var(--bg-surface)", color: !detailed ? "#fff" : "var(--text-secondary)", fontWeight: !detailed ? 600 : 400 }}>
              Simple
            </button>
            <button onClick={() => setDetailed(true)}
              className="px-3 py-1.5 text-sm transition-colors"
              style={{ backgroundColor: detailed ? "var(--accent-blue)" : "var(--bg-surface)", color: detailed ? "#fff" : "var(--text-secondary)", fontWeight: detailed ? 600 : 400 }}>
              Detailed
            </button>
          </div>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            <option value={0}>All Years</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowChat(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ backgroundColor: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", color: "var(--accent-blue)", flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Ask AI
          </button>
          <button onClick={() => setShowHelp(true)}
            className="flex items-center justify-center rounded-full text-xs font-bold"
            style={{ width: 28, height: 28, backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", flexShrink: 0 }}
            aria-label="Help">?</button>
        </div>
      </div>

      {/* ── SIMPLE VIEW ── */}
      {!detailed && (
        <div className="flex flex-col gap-4">
          {/* At a glance cards */}
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
            <div className="rounded-2xl px-5 py-5 flex flex-col gap-3" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>You earned (paid invoices)</p>
              <p className="text-3xl font-bold" style={{ color: "#10b981" }}>{fmt(totalRevenue)}</p>
              <div className="h-px" style={{ backgroundColor: "var(--border)" }} />
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between"><span style={{ color: "var(--text-secondary)" }}>Business expenses</span><span style={{ color: "#f87171" }}>({fmt(totalExpenses)})</span></div>
                <div className="flex justify-between font-semibold"><span style={{ color: "var(--text-secondary)" }}>Net profit</span><span style={{ color: "var(--text-primary)" }}>{fmt(netIncome)}</span></div>
              </div>
            </div>

            <div className="rounded-2xl px-5 py-5 flex flex-col gap-3" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Taxes you owe</p>
              <p className="text-3xl font-bold" style={{ color: "#f59e0b" }}>{fmt(estCorpTax + hstOwing)}</p>
              <div className="h-px" style={{ backgroundColor: "var(--border)" }} />
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between"><span style={{ color: "var(--text-secondary)" }}>Corporate tax {netIncome > 500_000 ? "(12.2% + 26.5%)" : "(12.2% on first $500K)"}</span><span style={{ color: "#f59e0b" }}>{fmt(estCorpTax)}</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--text-secondary)" }}>HST owing to CRA</span><span style={{ color: "#f59e0b" }}>{fmt(hstOwing)}</span></div>
              </div>
            </div>
          </div>

          {/* Simple money split */}
          <div className="rounded-2xl px-5 py-5 flex flex-col gap-4" style={{ backgroundColor: "var(--bg-surface)", border: "2px solid var(--accent-blue)" }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>How do you want to split your money?</p>
              <div className="flex items-center gap-2">
                <button onClick={resetSplit} className="text-xs px-2 py-1 rounded-lg"
                  style={{ backgroundColor: "rgba(248,113,113,0.1)", color: "#f87171" }}>
                  Reset
                </button>
                <button onClick={() => setOverride(o => !o)}
                  className="text-xs px-2 py-1 rounded-lg"
                  style={{ backgroundColor: override ? "rgba(245,158,11,0.15)" : "var(--bg-elevated)", color: override ? "#f59e0b" : "var(--text-secondary)", border: override ? "1px solid rgba(245,158,11,0.4)" : "1px solid var(--border)" }}>
                  {override ? "Override ON" : "Override"}
                </button>
                {afterCorpTax > 0 && (
                  <button onClick={() => { setTotalEarned(Math.round(afterCorpTax)); setAsSalary(0); setAsDividend(0); setOverride(false); setSplitInited(true); }}
                    className="text-xs px-2 py-1 rounded-lg"
                    style={{ backgroundColor: "rgba(59,130,246,0.1)", color: "var(--accent-blue)" }}>
                    Fill from invoices
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              {override
                ? <NumInput label="Keep in corp" value={keepInCorp} onChange={setKeepOverride} />
                : <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Keep in corp <span style={{ color: "var(--accent-blue)" }}>(auto)</span></label>
                    <div className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>{fmt(keepInCorp)}</div>
                  </div>
              }
              <NumInput label="Pay as dividend" value={asDividend} onChange={setAsDividend} />
              <NumInput label="Pay as salary" value={asSalary} onChange={handleSalaryChange} />
            </div>

            {/* Simple results */}
            <div className="grid gap-3 pt-1" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              {[
                { label: "Corp tax on kept amount", value: fmt(corpTaxOnKept), color: "#f59e0b", sub: "12.2% of kept" },
                { label: "You pocket (dividends)", value: fmt(divT.net), color: "#10b981", sub: `${pct(asDividend > 0 ? divT.total/asDividend : 0)} tax` },
                { label: "You pocket (salary)", value: fmt(salT.net), color: "#10b981", sub: `${pct(asSalary > 0 ? salT.total/asSalary : 0)} tax` },
              ].map(c => (
                <div key={c.label} className="rounded-xl px-4 py-3 flex flex-col gap-1"
                  style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)" }}>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{c.label}</p>
                  <p className="text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{c.sub}</p>
                </div>
              ))}
            </div>

            {overBudget && (
              <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2.5"
                style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b" }}>
                <span style={{ fontSize: 14, lineHeight: 1 }}>⚠</span>
                <span>
                  Override mode — you&apos;re splitting <strong>{fmt(allocated)}</strong> but only earned <strong>{fmt(totalEarned)}</strong>. You&apos;re <strong>{fmt(allocated - totalEarned)}</strong> over budget. Numbers are hypothetical.
                </span>
              </div>
            )}
            <div className="rounded-xl px-4 py-3 flex items-center justify-between"
              style={{ backgroundColor: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Total cash in your pocket</span>
              <span className="text-xl font-bold" style={{ color: "#10b981" }}>{fmt(netCashInHand)}</span>
            </div>
            <div className="rounded-xl px-4 py-3 flex items-center justify-between"
              style={{ backgroundColor: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Total taxes paid (corp + personal)</span>
              <span className="text-xl font-bold" style={{ color: "#f87171" }}>{fmt(totalTaxPaid)}</span>
            </div>
          </div>

          <p className="text-xs text-center" style={{ color: "var(--text-secondary)" }}>
            Switch to <button onClick={() => setDetailed(true)} style={{ color: "var(--accent-blue)", fontWeight: 600 }}>Detailed view</button> for full breakdowns, HST, tax brackets and more.
          </p>
        </div>
      )}

      {/* ── DETAILED VIEW ── */}
      {detailed && <>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex-1 px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={{
              fontWeight: tab === t.key ? 600 : 400,
              backgroundColor: tab === t.key ? "var(--bg-elevated)" : "transparent",
              color: tab === t.key ? "var(--text-primary)" : "var(--text-secondary)",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── YEAR OVERVIEW ── */}
      {tab === "overview" && (
        <div className="flex flex-col gap-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
            <Card label="Revenue (paid invoices)" value={fmt(totalRevenue)} color="#10b981"
              sub={`${yearInvoices.filter(i=>i.status==="paid").length} paid invoices`} />
            <Card label="Business Expenses"  value={fmt(totalExpenses)} color="#f87171"
              sub={`${yearReceipts.length} receipts`} />
            <Card label="Net Income"  value={fmt(netIncome)} color={netIncome >= 0 ? "var(--accent-blue)" : "#f87171"} />
            <Card label="Est. Corp Tax" value={fmt(estCorpTax)} color="#f59e0b" sub="12.2% small biz rate" />
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-3 text-sm font-semibold" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}>
              Corporate Income Statement — {year}
            </div>
            <div style={{ backgroundColor: "var(--bg-base)" }}>
              <Row label="Gross Revenue (paid invoices)" value={fmt(totalRevenue)} color="#10b981" />
              <Row label="Total Deductible Expenses"     value={`(${fmt(totalExpenses)})`} indent color="#f87171" />
              <Row label="Net Income Before Tax"         value={fmt(netIncome)} bold border />
              <Row label="Corporate Tax (12.2% SB)"      value={`(${fmt(estCorpTax)})`} indent color="#f59e0b" />
              <Row label="After-Tax Corporate Income"    value={fmt(afterCorpTax)} bold color="var(--accent-blue)" border />
              <Row label="HST Collected"                 value={fmt(hstCollected)} color="#10b981" border />
              <Row label="HST Paid (Input Tax Credits)"  value={`(${fmt(hstPaid)})`} indent color="#f87171" />
              <Row label="Net HST Owing to CRA"          value={fmt(hstOwing)} bold color={hstOwing > 0 ? "#f59e0b" : "#10b981"} border />
            </div>
          </div>

          {totalRevenue === 0 && (
            <div className="rounded-2xl px-5 py-4 text-sm" style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <p className="font-semibold mb-1" style={{ color: "#f59e0b" }}>No revenue found for {year}</p>
              <p style={{ color: "var(--text-secondary)" }}>
                Revenue is pulled from <strong style={{ color: "var(--text-primary)" }}>paid invoices</strong> in your Invoices tab.
                Make sure your invoices are marked as <strong style={{ color: "#10b981" }}>Paid</strong> and have the correct date.
              </p>
            </div>
          )}

          <div className="rounded-2xl px-5 py-4 text-sm" style={{ backgroundColor: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <p className="font-semibold mb-1" style={{ color: "var(--accent-blue)" }}>Next step</p>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
              You have <strong style={{ color: "var(--text-primary)" }}>{fmt(afterCorpTax)}</strong> after-tax money in your corp.
              Go to <button onClick={() => setTab("split")} style={{ color: "var(--accent-blue)", fontWeight: 600 }}>Money Split</button> to decide
              how much to keep in the corp, pay yourself as salary, or pull out as dividends — and see exactly what you take home.
            </p>
          </div>
        </div>
      )}

      {/* ── MONEY SPLIT ── */}
      {tab === "split" && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl px-5 py-4 text-sm" style={{ backgroundColor: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <p className="font-semibold mb-1" style={{ color: "var(--accent-blue)" }}>How this works</p>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
              Enter how you want to split your corp&apos;s money. The planner shows the tax implications of each choice and
              exactly how much cash ends up in your pocket vs the government.
            </p>
          </div>

          {/* Inputs */}
          <div className="rounded-2xl px-5 py-4 flex flex-col gap-4" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Your Numbers</p>
              <div className="flex items-center gap-2">
                <button onClick={resetSplit} className="text-xs px-2 py-1 rounded-lg"
                  style={{ backgroundColor: "rgba(248,113,113,0.1)", color: "#f87171" }}>
                  Reset
                </button>
                <button onClick={() => setOverride(o => !o)}
                  className="text-xs px-2 py-1 rounded-lg"
                  style={{ backgroundColor: override ? "rgba(245,158,11,0.15)" : "var(--bg-elevated)", color: override ? "#f59e0b" : "var(--text-secondary)", border: override ? "1px solid rgba(245,158,11,0.4)" : "1px solid var(--border)" }}>
                  {override ? "Override ON" : "Override"}
                </button>
                {afterCorpTax > 0 && (
                  <button onClick={() => { setTotalEarned(Math.round(afterCorpTax)); setAsSalary(0); setAsDividend(0); setOverride(false); setSplitInited(false); }}
                    className="text-xs px-2 py-1 rounded-lg"
                    style={{ backgroundColor: "rgba(59,130,246,0.1)", color: "var(--accent-blue)" }}>
                    Fill from invoices ({fmt(afterCorpTax)})
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <NumInput label="Total after-tax corp money available" value={totalEarned} onChange={v => { setTotalEarned(v); }} />
              <div />
            </div>

            <div className="h-px" style={{ backgroundColor: "var(--border)" }} />
            <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>How do you want to split it?</p>

            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              {override
                ? <NumInput label="Keep in corporation" value={keepInCorp} onChange={setKeepOverride} />
                : <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Keep in corporation <span style={{ color: "var(--accent-blue)" }}>(auto)</span></label>
                    <div className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>{fmt(keepInCorp)}</div>
                  </div>
              }
              <NumInput label="Pay as salary" value={asSalary} onChange={handleSalaryChange} />
              <NumInput label="Pay as dividends" value={asDividend} onChange={setAsDividend} />
            </div>

            {/* Allocation bar */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
                <span>Allocated: {fmt(allocated)} of {fmt(totalEarned)}</span>
                <span style={{ color: overBudget ? "#f59e0b" : "#10b981" }}>
                  {overBudget ? `${fmt(allocated - totalEarned)} over (override)` : "Fully allocated ✓"}
                </span>
              </div>
              <div className="rounded-full overflow-hidden h-3 flex" style={{ backgroundColor: "var(--bg-elevated)" }}>
                {totalEarned > 0 && keepInCorp > 0 && (
                  <div className="h-full transition-all" style={{ width: `${Math.min(100, (keepInCorp / totalEarned) * 100)}%`, backgroundColor: "#3b82f6" }} />
                )}
                {totalEarned > 0 && asSalary > 0 && (
                  <div className="h-full transition-all" style={{ width: `${Math.min(100, (asSalary / totalEarned) * 100)}%`, backgroundColor: "#f59e0b" }} />
                )}
                {totalEarned > 0 && asDividend > 0 && (
                  <div className="h-full transition-all" style={{ width: `${Math.min(100, (asDividend / totalEarned) * 100)}%`, backgroundColor: "#10b981" }} />
                )}
              </div>
              <div className="flex gap-4 text-xs">
                <span style={{ color: "#3b82f6" }}>■ Keep: {fmt(keepInCorp)}</span>
                <span style={{ color: "#f59e0b" }}>■ Salary: {fmt(asSalary)}</span>
                <span style={{ color: "#10b981" }}>■ Dividend: {fmt(asDividend)}</span>
              </div>
              {overBudget && (
                <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2.5 mt-1"
                  style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b" }}>
                  <span style={{ fontSize: 14, lineHeight: 1 }}>⚠</span>
                  <span>
                    Override mode — you&apos;re splitting <strong>{fmt(allocated)}</strong> but only earned <strong>{fmt(totalEarned)}</strong>. You&apos;re <strong>{fmt(allocated - totalEarned)}</strong> over budget. Numbers are hypothetical.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Results grid */}
          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>

            {/* Keep in corp */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <div className="px-4 py-2.5 text-xs font-bold text-center" style={{ backgroundColor: "rgba(59,130,246,0.1)", color: "var(--accent-blue)" }}>
                KEEP IN CORP
              </div>
              <div style={{ backgroundColor: "var(--bg-base)" }}>
                <Row label="Gross amount"        value={fmt(keepInCorp)} />
                <Row label="Corp tax (12.2%)"    value={`(${fmt(corpTaxOnKept)})`} indent color="#f59e0b" />
                <Row label="Net retained in corp" value={fmt(retainedNet)} bold color="var(--accent-blue)" border />
                <Row label="Available later as dividend" value={fmt(retainedNet)} indent color="var(--text-secondary)" />
              </div>
              <div className="px-4 py-2.5 text-center text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                Corp grows by <strong style={{ color: "var(--accent-blue)" }}>{fmt(retainedNet)}</strong>
              </div>
            </div>

            {/* Salary */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <div className="px-4 py-2.5 text-xs font-bold text-center" style={{ backgroundColor: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
                SALARY
              </div>
              <div style={{ backgroundColor: "var(--bg-base)" }}>
                <Row label="Gross salary"         value={fmt(asSalary)} />
                <Row label="Federal income tax"   value={`(${fmt(salT.fed)})`}  indent color="#f87171" />
                <Row label="Ontario income tax"   value={`(${fmt(salT.on)})`}   indent color="#f87171" />
                <Row label="CPP (your share)"     value={`(${fmt(salT.cpp)})`}  indent color="#f59e0b" />
                <Row label="EI (your share)"      value={`(${fmt(salT.ei)})`}   indent color="#f59e0b" />
                <Row label="Net cash in hand"     value={fmt(salT.net)} bold color="#10b981" border />
                <Row label="Effective tax rate"   value={pct(asSalary > 0 ? salT.total / asSalary : 0)} color="#f87171" />
                <Row label="Builds RRSP room"     value="✓" color="#10b981" />
              </div>
              <div className="px-4 py-2.5 text-center text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                You pocket <strong style={{ color: "#10b981" }}>{fmt(salT.net)}</strong>
              </div>
            </div>

            {/* Dividend */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <div className="px-4 py-2.5 text-xs font-bold text-center" style={{ backgroundColor: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                DIVIDEND
              </div>
              <div style={{ backgroundColor: "var(--bg-base)" }}>
                <Row label="Dividend paid"        value={fmt(asDividend)} />
                <Row label="Gross-up (15%)"       value={fmt(divT.grossed - asDividend)} indent color="var(--text-secondary)" />
                <Row label="Taxable amount"       value={fmt(divT.grossed)} indent />
                <Row label="Personal tax (after DTC)" value={`(${fmt(divT.total)})`} color="#f87171" border />
                <Row label="Net cash in hand"     value={fmt(divT.net)} bold color="#10b981" border />
                <Row label="Effective tax rate"   value={pct(asDividend > 0 ? divT.total / asDividend : 0)} color="#f87171" />
                <Row label="No CPP / No EI"       value="✓" color="#10b981" />
              </div>
              <div className="px-4 py-2.5 text-center text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                You pocket <strong style={{ color: "#10b981" }}>{fmt(divT.net)}</strong>
              </div>
            </div>
          </div>

          {/* Bottom summary */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "2px solid var(--accent-blue)" }}>
            <div className="px-4 py-3 text-sm font-bold" style={{ backgroundColor: "rgba(59,130,246,0.08)", borderBottom: "1px solid var(--border)", color: "var(--accent-blue)" }}>
              Summary — What Happens to Your {fmt(totalEarned)}
            </div>
            <div style={{ backgroundColor: "var(--bg-base)" }}>
              <Row label="Stays in corp (after corp tax)"    value={fmt(retainedNet)}    color="var(--accent-blue)" />
              <Row label="Cash in your pocket (salary)"      value={fmt(salT.net)}       color="#10b981" />
              <Row label="Cash in your pocket (dividends)"   value={fmt(divT.net)}       color="#10b981" />
              <Row label="Total cash you take home"          value={fmt(netCashInHand)}  bold color="#10b981" border />
              <Row label="Corp tax paid"                     value={fmt(corpTaxOnKept)}  indent color="#f59e0b" />
              <Row label="Personal tax paid (salary)"        value={fmt(salT.total)}     indent color="#f87171" />
              <Row label="Personal tax paid (dividends)"     value={fmt(divT.total)}     indent color="#f87171" />
              <Row label="Total tax (all in)"                value={fmt(totalTaxPaid)}   bold color="#f87171" border />
              <Row label="Everything accounted for"          value={fmt(totalOut + totalTaxPaid)} color="var(--text-secondary)" border />
            </div>
          </div>

          <div className="rounded-2xl px-5 py-4 text-sm" style={{ backgroundColor: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <p className="font-semibold mb-2" style={{ color: "#10b981" }}>Key things to know</p>
            <ul className="flex flex-col gap-1.5" style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
              <li>• <strong style={{ color: "var(--text-primary)" }}>Dividends under ~$53K</strong> are taxed at very low rates (sometimes 0%) because the dividend tax credit offsets most of the tax.</li>
              <li>• <strong style={{ color: "var(--text-primary)" }}>Salary builds RRSP room</strong> — every $1 of salary creates $0.18 of RRSP contribution room. Dividends don&apos;t.</li>
              <li>• <strong style={{ color: "var(--text-primary)" }}>Corp tax on retained income</strong> is paid now (12.2%), but when you eventually pay it out as dividends, the personal tax is lower to compensate — this is "tax integration."</li>
              <li>• <strong style={{ color: "var(--text-primary)" }}>Keeping money in the corp</strong> lets it grow tax-sheltered. You only pay personal tax when you take it out.</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── HST ── */}
      {tab === "hst" && (
        <div className="flex flex-col gap-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <Card label="HST Collected"    value={fmt(hstCollected)} color="#f59e0b" sub="Charged to clients" />
            <Card label="Input Tax Credits" value={fmt(hstPaid)}    color="#10b981" sub="HST paid on receipts" />
            <Card label="Net HST Owing"    value={fmt(hstOwing)}    color={hstOwing > 0 ? "#ef4444" : "#10b981"} sub="Remit to CRA" />
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-3 text-sm font-semibold" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}>
              HST Detail — {year}
            </div>
            <div style={{ backgroundColor: "var(--bg-base)" }}>
              <Row label="HST collected from clients (invoices)"  value={fmt(hstCollected)} color="#f59e0b" />
              <Row label="HST paid on expenses (Input Tax Credits)" value={`(${fmt(hstPaid)})`} indent color="#10b981" />
              <Row label="Net HST remittance owing to CRA"        value={fmt(hstOwing)} bold color={hstOwing > 0 ? "#ef4444" : "#10b981"} border />
            </div>
          </div>
          <div className="rounded-2xl px-5 py-4 text-sm" style={{ backgroundColor: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
            <p className="font-semibold mb-2" style={{ color: "#f59e0b" }}>HST Filing Reminders</p>
            <ul className="flex flex-col gap-1.5" style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
              <li>• Ontario HST is <strong style={{ color: "var(--text-primary)" }}>13%</strong> (5% federal GST + 8% Ontario)</li>
              <li>• Annual filers: due <strong style={{ color: "var(--text-primary)" }}>3 months after fiscal year-end</strong></li>
              <li>• If annual revenue {"<"} $1.5M you can file annually; above that, quarterly</li>
              <li>• Keep all receipts showing HST — you need them to claim ITCs</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── BRACKETS ── */}
      {tab === "brackets" && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-3 text-sm font-semibold" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}>
              Personal Income Tax — Ontario 2025 (Federal + Provincial Combined)
            </div>
            <div className="overflow-x-auto" style={{ backgroundColor: "var(--bg-base)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
                    {["Income Range", "Federal", "Ontario", "Combined Rate"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bracketRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium" style={{ color: "var(--text-primary)" }}>{r.range}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>{r.fedRate}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>{r.onRate}</td>
                      <td className="px-4 py-2.5 text-xs font-bold" style={{ color: "var(--accent-blue)" }}>{r.combined}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-3 text-sm font-semibold" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}>
              Non-Eligible Dividend Effective Rates (Ontario 2025)
            </div>
            <div className="overflow-x-auto" style={{ backgroundColor: "var(--bg-base)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
                    {["Total Income Level", "Effective Dividend Rate", "Note"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { income: "$0 – $30K",    rate: "~0% or negative", note: "Dividend tax credit exceeds tax" },
                    { income: "$30K – $57K",  rate: "~3–6%",           note: "Very low personal tax" },
                    { income: "$57K – $80K",  rate: "~13–19%",         note: "Still below salary equivalent" },
                    { income: "$80K – $102K", rate: "~22–26%",         note: "" },
                    { income: "$102K – $150K",rate: "~29–35%",         note: "Approaches salary tax" },
                    { income: "$150K+",       rate: "~37–44%",         note: "Salary may be more efficient" },
                  ].map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium" style={{ color: "var(--text-primary)" }}>{r.income}</td>
                      <td className="px-4 py-2.5 text-xs font-bold" style={{ color: "#10b981" }}>{r.rate}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-3 text-sm font-semibold" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}>
              Corporate Tax — Ontario CCPC 2025
            </div>
            <div style={{ backgroundColor: "var(--bg-base)" }}>
              <Row label="Small business rate (first $500K)"   value="12.2%" color="#10b981" />
              <Row label="  Federal (after SBD)"               value="9.0%"  indent />
              <Row label="  Ontario small business"            value="3.2%"  indent />
              <Row label="General rate (above $500K)"          value="26.5%" color="#f59e0b" border />
              <Row label="  Federal general"                   value="15.0%" indent />
              <Row label="  Ontario general"                   value="11.5%" indent />
            </div>
          </div>

          <div className="rounded-2xl px-5 py-4 text-sm" style={{ backgroundColor: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <p className="font-semibold mb-2" style={{ color: "var(--accent-blue)" }}>Key Notes</p>
            <ul className="flex flex-col gap-1.5" style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
              <li>• These are <strong style={{ color: "var(--text-primary)" }}>marginal rates</strong> — only income above each threshold is taxed at that rate.</li>
              <li>• Basic personal amounts offset <strong style={{ color: "var(--text-primary)" }}>~$3,018</strong> in total personal tax annually.</li>
              <li>• Ontario surtax applies at high incomes and can push the top rate above 53%.</li>
              <li>• Always consult a CPA for your specific situation. These figures are estimates for planning only.</li>
            </ul>
          </div>
        </div>
      )}

      </> /* end detailed */}

      {/* ── AI Chat Panel ── */}
      {showChat && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-sm flex flex-col rounded-2xl overflow-hidden"
            style={{ height: "70vh", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.15)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Tax AI</p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Knows your {year} numbers</p>
                </div>
              </div>
              <button onClick={() => setShowChat(false)} style={{ color: "var(--text-secondary)" }}>✕</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              {chatMessages.length === 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Try asking:</p>
                  {[
                    "How much should I pay myself as salary?",
                    "Am I paying too much tax?",
                    "What is HST remittance?",
                    "Should I take dividends or salary?",
                    "How do I reduce my corporate tax?",
                  ].map(q => (
                    <button key={q} onClick={() => { setChatInput(q); }}
                      className="text-left text-xs px-3 py-2 rounded-xl"
                      style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed"
                    style={{
                      backgroundColor: m.role === "user" ? "var(--accent-blue)" : "var(--bg-elevated)",
                      color: m.role === "user" ? "#fff" : "var(--text-primary)",
                      borderBottomRightRadius: m.role === "user" ? 4 : undefined,
                      borderBottomLeftRadius: m.role === "assistant" ? 4 : undefined,
                    }}>
                    {m.role === "assistant" ? renderMarkdown(m.content) : m.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="px-3 py-2 rounded-2xl flex items-center gap-1" style={{ backgroundColor: "var(--bg-elevated)", borderBottomLeftRadius: 4 }}>
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{ backgroundColor: "var(--text-secondary)", animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 px-3 py-3 flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
                placeholder="Ask anything about your taxes…"
                className="flex-1 text-xs px-3 py-2 rounded-xl outline-none"
                style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
              <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: chatInput.trim() ? "var(--accent-blue)" : "var(--bg-elevated)", color: chatInput.trim() ? "#fff" : "var(--text-secondary)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Help Modal ── */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowHelp(false)}>
          <div className="w-full max-w-lg rounded-2xl flex flex-col max-h-[88vh] overflow-y-auto"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>How to use Tax Planner</h2>
              <button onClick={() => setShowHelp(false)} style={{ color: "var(--text-secondary)" }}>✕</button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-5 text-sm" style={{ color: "var(--text-secondary)", lineHeight: 1.75 }}>

              <section className="flex flex-col gap-1.5">
                <p className="font-semibold text-xs uppercase tracking-wide" style={{ color: "var(--accent-blue)" }}>Where does the data come from?</p>
                <p>Everything is pulled automatically from the other tabs — no manual entry needed.</p>
                <ul className="flex flex-col gap-1 pl-3">
                  <li>• <strong style={{ color: "var(--text-primary)" }}>Revenue</strong> — total from your <em>paid</em> invoices in the Invoices tab</li>
                  <li>• <strong style={{ color: "var(--text-primary)" }}>Expenses</strong> — subtotals from your saved receipts in the Receipts tab</li>
                  <li>• <strong style={{ color: "var(--text-primary)" }}>HST</strong> — HST charged on paid invoices minus HST paid on receipts (your Input Tax Credits)</li>
                </ul>
                <p className="text-xs" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>If numbers look like $0, make sure you have paid invoices and saved receipts for the selected year.</p>
              </section>

              <div className="h-px" style={{ backgroundColor: "var(--border)" }} />

              <section className="flex flex-col gap-1.5">
                <p className="font-semibold text-xs uppercase tracking-wide" style={{ color: "var(--accent-blue)" }}>Simple view</p>
                <p>Two cards at a glance:</p>
                <ul className="flex flex-col gap-1 pl-3">
                  <li>• <strong style={{ color: "var(--text-primary)" }}>You Earned</strong> — revenue minus expenses = net profit your corp made</li>
                  <li>• <strong style={{ color: "var(--text-primary)" }}>Taxes You Owe</strong> — estimated corporate tax (12.2% on first $500K profit, 26.5% above that) + HST owing to CRA</li>
                </ul>
                <p>Below the cards is the <strong style={{ color: "var(--text-primary)" }}>Money Split</strong> — use the sliders/inputs to decide how to take money out of your corp. It shows how much you&apos;ll keep after all taxes depending on whether you take salary, dividends, or leave it in the corp.</p>
              </section>

              <div className="h-px" style={{ backgroundColor: "var(--border)" }} />

              <section className="flex flex-col gap-1.5">
                <p className="font-semibold text-xs uppercase tracking-wide" style={{ color: "var(--accent-blue)" }}>Detailed view tabs</p>
                <ul className="flex flex-col gap-1 pl-3">
                  <li>• <strong style={{ color: "var(--text-primary)" }}>Year Overview</strong> — full P&amp;L breakdown with corp tax calculation</li>
                  <li>• <strong style={{ color: "var(--text-primary)" }}>Money Split</strong> — same planner as Simple view but with a full tax breakdown showing exactly how much goes to salary tax, dividend tax, and corp tax</li>
                  <li>• <strong style={{ color: "var(--text-primary)" }}>HST Remittance</strong> — what you collected vs what you paid, and what you owe CRA</li>
                  <li>• <strong style={{ color: "var(--text-primary)" }}>Tax Brackets</strong> — 2025 Ontario federal + provincial marginal rates reference table</li>
                </ul>
              </section>

              <div className="h-px" style={{ backgroundColor: "var(--border)" }} />

              <section className="flex flex-col gap-1.5">
                <p className="font-semibold text-xs uppercase tracking-wide" style={{ color: "var(--accent-blue)" }}>Salary vs Dividends — quick guide</p>
                <ul className="flex flex-col gap-1 pl-3">
                  <li>• <strong style={{ color: "var(--text-primary)" }}>Salary</strong> — you pay personal income tax + CPP + EI, but it builds RRSP room and is a corp deduction (saves corp tax)</li>
                  <li>• <strong style={{ color: "var(--text-primary)" }}>Dividends</strong> — paid from after-corp-tax money, lower personal tax rate due to the dividend tax credit, but no RRSP room built</li>
                  <li>• <strong style={{ color: "var(--text-primary)" }}>Keep in corp</strong> — money stays and compounds inside the corp at 12.2% tax, you pay personal tax later when you take it out</li>
                </ul>
              </section>

              <div className="rounded-xl px-4 py-3 text-xs" style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "#f59e0b" }}>
                These are estimates for planning purposes only. Always verify with a CPA before filing.
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
