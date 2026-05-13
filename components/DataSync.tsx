"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

const SYNC_KEYS = [
  "savedReceipts", "corpoIncome", "corpoMileage", "corpoLoan",
  "corpoInvoices", "corpoBusinessProfile", "corpoInvoiceTemplates",
  "corpoAppSettings", "corpoTaxRates", "corpoOffice", "corpoOdometer",
  "dismissedNotifs", "corpoAiUsage",
];

function uploadLocalToFirestore() {
  for (const key of SYNC_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const value = JSON.parse(raw);
      fetch("/api/userdata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      }).catch(() => {});
    } catch { /* skip malformed */ }
  }
}

export default function DataSync() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;

    const flag = `synced:${session.user.id}`;
    if (sessionStorage.getItem(flag)) return;

    fetch("/api/userdata")
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        sessionStorage.setItem(flag, "1");
        if (Object.keys(data).length > 0) {
          // Firestore has data — load it into localStorage and reload
          for (const [key, value] of Object.entries(data)) {
            if (value !== null && value !== undefined) {
              localStorage.setItem(key, JSON.stringify(value));
            }
          }
          window.location.reload();
        } else {
          // Firestore is empty — push local data up so other devices can see it
          uploadLocalToFirestore();
        }
      })
      .catch(() => {
        sessionStorage.setItem(flag, "1");
      });
  }, [session?.user?.id, status]);

  return null;
}
