"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

// Keys we care about syncing from the server into localStorage
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

export default function DataLoader() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;

    // Only load once per login session (flag cleared on sign-out)
    const flag = sessionStorage.getItem("corpo-data-loaded");
    if (flag) return;

    fetch("/api/userdata")
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, unknown> | null) => {
        if (!data) return;
        for (const key of SYNC_KEYS) {
          if (key in data && data[key] !== null && data[key] !== undefined) {
            try {
              localStorage.setItem(key, JSON.stringify(data[key]));
            } catch {}
          }
        }
        sessionStorage.setItem("corpo-data-loaded", "1");
        // Reload the page so all components re-read fresh localStorage
        window.location.reload();
      })
      .catch(() => {});
  }, [status, session]);

  return null;
}
