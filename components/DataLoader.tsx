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

function hasMeaningfulData(data: Record<string, unknown>): boolean {
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
    if (status !== "authenticated" || !session?.user?.id) return;

    const flagKey = `corpo-loaded:${session.user.id}`;
    if (sessionStorage.getItem(flagKey)) return;

    // Set flag immediately to prevent double-runs within this session
    sessionStorage.setItem(flagKey, "1");

    (async () => {
      try {
        const res = await fetch("/api/userdata");
        if (!res.ok) {
          console.warn("[DataLoader] /api/userdata returned", res.status);
          return;
        }
        const serverData = await res.json() as Record<string, unknown>;

        if (hasMeaningfulData(serverData)) {
          // Cloud has data → restore to localStorage then reload so every page reads it
          console.log("[DataLoader] restoring from cloud");
          for (const key of SYNC_KEYS) {
            if (key in serverData && serverData[key] !== null && serverData[key] !== undefined) {
              try { localStorage.setItem(key, JSON.stringify(serverData[key])); } catch {}
            }
          }
          window.location.reload();
        } else {
          const localData = readLocalData();
          if (hasMeaningfulData(localData)) {
            // Cloud is empty but we have local data → upload it
            console.log("[DataLoader] uploading local data to cloud");
            await fetch("/api/userdata/batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(localData),
            });
          } else {
            console.log("[DataLoader] no data in cloud or local");
          }
        }
      } catch (e) {
        console.error("[DataLoader] error", e);
      }
    })();
  }, [status, session?.user?.id]);

  return null;
}
