"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

const SYNC_KEYS = [
  "savedReceipts",
  "pendingReceipts",
  "corpoIncome",
  "corpoMileage",
  "corpoLoan",
  "corpoInvoices",
  "corpoBusinessProfile",
  "corpoInvoiceTemplates",
  "corpoAppSettings",
  "corpoTaxRates",
  "corpoOffice",
  "corpoOdometer",
  "dismissedNotifs",
];

function readLocalData(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SYNC_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try { out[key] = JSON.parse(raw); } catch {}
    }
  }
  return out;
}

function hasLocalData(data: Record<string, unknown>): boolean {
  // Check if there's meaningful data (non-empty arrays or objects)
  for (const key of SYNC_KEYS) {
    const v = data[key];
    if (Array.isArray(v) && v.length > 0) return true;
    if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length > 0) return true;
  }
  return false;
}

export default function DataLoader() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;

    const flag = sessionStorage.getItem("corpo-data-loaded");
    if (flag) return;

    // Mark as loaded immediately to prevent double-runs
    sessionStorage.setItem("corpo-data-loaded", "1");

    fetch("/api/userdata")
      .then(r => r.ok ? r.json() : null)
      .then(async (serverData: Record<string, unknown> | null) => {
        if (!serverData) return;

        const serverHasData = hasLocalData(serverData);
        const localData = readLocalData();
        const localHasData = hasLocalData(localData);

        if (serverHasData) {
          // Server has data → restore into localStorage and reload
          for (const key of SYNC_KEYS) {
            if (key in serverData && serverData[key] !== null && serverData[key] !== undefined) {
              try { localStorage.setItem(key, JSON.stringify(serverData[key])); } catch {}
            }
          }
          window.location.reload();
        } else if (localHasData) {
          // Server is empty but local has data → upload local data to Firestore
          await fetch("/api/userdata/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(localData),
          }).catch(() => {});
          // No reload needed — local data is already loaded
        }
      })
      .catch(() => {});
  }, [status, session]);

  return null;
}
