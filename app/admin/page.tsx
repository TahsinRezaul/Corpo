"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      backgroundColor: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderRadius: "1rem",
      padding: "1.25rem",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [stats, setStats] = useState({
    receipts: 0,
    income: 0,
    invoices: 0,
    mileage: 0,
  });

  // Verify admin session on mount
  useEffect(() => {
    // If the cookie isn't there, the middleware will redirect;
    // load stats from localStorage for the dashboard
    try {
      const receipts = JSON.parse(localStorage.getItem("corpo-receipts") ?? "[]");
      const income   = JSON.parse(localStorage.getItem("corpo-income")   ?? "[]");
      const invoices = JSON.parse(localStorage.getItem("corpo-invoices") ?? "[]");
      const mileage  = JSON.parse(localStorage.getItem("corpo-mileage")  ?? "[]");
      setStats({ receipts: receipts.length, income: income.length, invoices: invoices.length, mileage: mileage.length });
    } catch { /* ignore */ }
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-base)", padding: "2rem 1.5rem" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.75rem" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "rgba(239,68,68,0.1)",
                border: "1.5px solid rgba(239,68,68,0.2)",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.03em", margin: 0 }}>
                Admin Panel
              </h1>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 20,
                backgroundColor: "rgba(239,68,68,0.12)",
                color: "#f87171",
                border: "1px solid rgba(239,68,68,0.2)",
                letterSpacing: "0.06em",
              }}>
                RESTRICTED
              </span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
              CORPO · Signed in as <strong style={{ color: "var(--text-primary)" }}>Tahsin</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.625rem" }}>
            <Link href="/" style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "0.5rem 1rem",
              borderRadius: "0.75rem",
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}>
              ← Go to App
            </Link>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "0.5rem 1rem",
                borderRadius: "0.75rem",
                border: "1px solid rgba(239,68,68,0.25)",
                backgroundColor: "rgba(239,68,68,0.08)",
                color: "#f87171",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {loggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.75rem" }}>
            Current Data
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
            <StatCard label="Receipts" value={stats.receipts} sub="expense records" />
            <StatCard label="Income Entries" value={stats.income} sub="revenue records" />
            <StatCard label="Invoices" value={stats.invoices} sub="client invoices" />
            <StatCard label="Mileage Trips" value={stats.mileage} sub="logged trips" />
          </div>
        </div>

        {/* Quick links */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.75rem" }}>
            Quick Actions
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            {[
              { label: "Receipts", href: "/receipts", desc: "View & manage expense records" },
              { label: "Income & P&L", href: "/income", desc: "Revenue and profit reports" },
              { label: "HST Report", href: "/hst", desc: "GST/HST filing summary" },
              { label: "Accountant Reports", href: "/accountant", desc: "Download tax package" },
              { label: "Settings", href: "/settings", desc: "App configuration" },
            ].map(item => (
              <Link key={item.href} href={item.href} style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "1rem 1.125rem",
                borderRadius: "1rem",
                border: "1px solid var(--border)",
                backgroundColor: "var(--bg-surface)",
                textDecoration: "none",
                transition: "border-color 0.15s",
              }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{item.label}</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* System info */}
        <div style={{
          padding: "1rem 1.25rem",
          borderRadius: "1rem",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.625rem" }}>System</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["Environment", "Local / Development"],
              ["Storage", "Browser localStorage"],
              ["Auth", "Admin session cookie (7 days)"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-secondary)" }}>{k}</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
