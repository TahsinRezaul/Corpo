"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getBackgroundQueue,
  updateBackgroundParse,
  removeFromBackgroundQueue,
  getPending,
  setPending,
} from "@/lib/storage";
import { useBackgroundTasks } from "@/contexts/BackgroundTasksContext";

export default function BackgroundParser() {
  const router = useRouter();
  const processingRef = useRef<Set<string>>(new Set());
  const { notifs, setNotifs } = useBackgroundTasks();

  useEffect(() => {
    // Clear stale "parsing" items left from a crashed session
    const stale = getBackgroundQueue().filter((i) => i.status === "parsing");
    stale.forEach((i) => removeFromBackgroundQueue(i.id));
  }, []);

  useEffect(() => {
    async function processQueue() {
      const queue = getBackgroundQueue();
      const pending = queue.filter((i) => i.status === "parsing" && !processingRef.current.has(i.id));
      for (const item of pending) {
        processingRef.current.add(item.id);
        setNotifs((prev) => [...prev.filter((n) => n.id !== item.id), { id: item.id, status: "parsing", label: "Parsing receipt…" }]);

        try {
          const res = await fetch(item.imageData);
          const blob = await res.blob();
          const file = new File([blob], item.fileName, { type: "image/jpeg" });
          const form = new FormData();
          form.append("file", file);

          const apiRes = await fetch("/api/parse-receipt", { method: "POST", body: form });
          if (!apiRes.ok) throw new Error("parse failed");
          const parsed = await apiRes.json();

          const existing = getPending();
          setPending([...existing, { id: item.id, fileName: item.fileName, thumbnail: parsed._thumbnail ?? "", parsed }]);

          updateBackgroundParse(item.id, { status: "done", result: parsed });
          const label = parsed.vendor && parsed.total ? `${parsed.vendor} · ${parsed.total}` : "Receipt ready";
          setNotifs((prev) => prev.map((n) => n.id === item.id ? { ...n, status: "done", label } : n));

          // Auto-dismiss toast after 8s — tray keeps showing it until navigated
          setTimeout(() => {
            removeFromBackgroundQueue(item.id);
          }, 8000);
        } catch {
          updateBackgroundParse(item.id, { status: "error" });
          setNotifs((prev) => prev.map((n) => n.id === item.id ? { ...n, status: "error", label: "Couldn't read receipt" } : n));
          setTimeout(() => {
            setNotifs((prev) => prev.filter((n) => n.id !== item.id));
            removeFromBackgroundQueue(item.id);
          }, 8000);
        } finally {
          processingRef.current.delete(item.id);
        }
      }
    }

    const interval = setInterval(processQueue, 600);
    processQueue();
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (notifs.length === 0) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none"
      style={{ top: 58 }}
    >
      {notifs.map((n) => (
        <button
          key={n.id}
          onClick={n.status === "done" ? () => router.push("/receipts/review") : undefined}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm font-medium shadow-lg pointer-events-auto"
          style={{
            backgroundColor:
              n.status === "done"  ? "rgba(20,40,20,0.92)" :
              n.status === "error" ? "rgba(40,15,15,0.92)" :
                                     "rgba(10,20,40,0.92)",
            border: `1px solid ${
              n.status === "done"  ? "rgba(74,222,128,0.4)" :
              n.status === "error" ? "rgba(248,113,113,0.4)" :
                                     "rgba(59,130,246,0.4)"
            }`,
            backdropFilter: "blur(12px)",
            color: "#fff",
            cursor: n.status === "done" ? "pointer" : "default",
            animation: "slideDown 0.25s cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          {n.status === "parsing" && (
            <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin flex-shrink-0"
              style={{ borderColor: "rgba(99,179,237,0.9) transparent transparent transparent" }} />
          )}
          {n.status === "done" && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
              <polyline points="2,7 5.5,10.5 12,3.5" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {n.status === "error" && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
              <line x1="2" y1="2" x2="12" y2="12" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="2" x2="2" y2="12" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          <span style={{
            color: n.status === "done" ? "#4ade80" : n.status === "error" ? "#f87171" : "rgba(255,255,255,0.85)"
          }}>
            {n.label}
          </span>
          {n.status === "done" && (
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>Tap to review →</span>
          )}
        </button>
      ))}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
