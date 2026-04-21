"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  setPending, getSaved,
  type PendingReceipt, type ParsedReceipt, type FieldRegion, type SavedReceipt,
} from "@/lib/storage";

// ── Shared helpers ─────────────────────────────────────────────────────────────

type UploadState =
  | { status: "idle" }
  | { status: "parsing"; done: number; total: number }
  | { status: "error"; message: string };

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/heic" || file.type === "image/heif") return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1920;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file),
        "image/jpeg", 0.85
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function parseFile(file: File): Promise<ParsedReceipt> {
  const formData = new FormData();
  formData.append("file", file);
  // Retry up to 4 times on rate-limit (429) with exponential backoff
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("/api/parse-receipt", { method: "POST", body: formData });
    if (res.status === 429) {
      if (attempt === 3) throw new Error("Rate limit exceeded — try again in a minute");
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 3000)); // 3s, 6s, 12s
      continue;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || "Failed to parse receipt");
    }
    return res.json();
  }
  throw new Error("Failed to parse receipt");
}

// ── Camera processing row (shimmer → value) ────────────────────────────────────

function ProcessingRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", width: 60, flexShrink: 0 }}>{label}</span>
      {value ? (
        <span
          className="text-sm font-semibold text-right"
          style={{ color: "#fff", flex: 1, animation: "fadeSlideIn 0.2s ease forwards" }}
        >
          {value}
        </span>
      ) : (
        <div
          className="h-4 rounded-md flex-1 animate-pulse"
          style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
        />
      )}
    </div>
  );
}

// ── Camera scanner (shared between modal and mobile panel) ─────────────────────

function CameraScanner({
  active,
  onCapture,
  onClose,
  onManual,
}: {
  active: boolean;
  onCapture: (file: File, parsed: ParsedReceipt) => void;
  onClose?: () => void;
  onManual?: () => void;
}) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const overlayRef  = useRef<HTMLCanvasElement>(null);
  const cameraRef   = useRef<HTMLInputElement>(null); // capture="environment"
  const libraryRef  = useRef<HTMLInputElement>(null); // photo library
  const streamRef   = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const capturedRef = useRef(false);
  const frozenRef   = useRef(false);

  const [ready, setReady]                 = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [scanState, setScanState]         = useState<"idle" | "scanning" | "found">("idle");
  const [detectedLabel, setDetectedLabel] = useState("");
  const [shutterLoading, setShutterLoading] = useState(false);
  const [shutterPressed, setShutterPressed] = useState(false);
  const [processing, setProcessing] = useState<{
    active: boolean;
    vendor?: string; date?: string; total?: string; category?: string;
  }>({ active: false });

  function haptic(ms = 40) {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
  }

  useEffect(() => {
    if (!active) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setReady(false);
      setError(null);
      setScanState("idle");
      capturedRef.current = false;
      scanningRef.current = false;
      frozenRef.current   = false;
      return;
    }
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        const markReady = () => { if (!video.paused || video.readyState >= 2) setReady(true); };
        video.addEventListener("canplay",     markReady, { once: true });
        video.addEventListener("loadeddata",  markReady, { once: true });
        try { await video.play(); } catch { /* autoplay blocked */ }
        if (video.readyState >= 2) setReady(true);
      } catch {
        if (!cancelled) setError("Camera blocked — tap below to take a photo instead.");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  const drawHighlights = useCallback((fields: FieldRegion[], found: boolean) => {
    const overlay = overlayRef.current;
    const video   = videoRef.current;
    if (!overlay || !video || !video.videoWidth) return;
    const ew = overlay.offsetWidth, eh = overlay.offsetHeight;
    overlay.width = ew; overlay.height = eh;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, ew, eh);
    const vw = video.videoWidth, vh = video.videoHeight;
    let scale: number, xOff: number, yOff: number;
    if (vw / vh > ew / eh) { scale = eh / vh; xOff = (ew - vw * scale) / 2; yOff = 0; }
    else                   { scale = ew / vw; xOff = 0; yOff = (eh - vh * scale) / 2; }
    const color = found ? "74,222,128" : "56,189,248";
    fields.forEach((f) => {
      const x = f.x * vw * scale + xOff, y = f.y * vh * scale + yOff;
      const w = f.w * vw * scale,         h = f.h * vh * scale;
      ctx.strokeStyle = `rgba(${color},${found ? 0.9 : 0.75})`;
      ctx.lineWidth   = found ? 2 : 1.5;
      ctx.fillStyle   = `rgba(${color},${found ? 0.12 : 0.06})`;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill(); ctx.stroke();
      ctx.font = "bold 10px system-ui"; ctx.fillStyle = `rgba(${color},0.9)`;
      ctx.fillText(f.name, x + 4, y - 4);
    });
  }, []);

  const clearOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
  }, []);

  const scan = useCallback(() => {
    if (scanningRef.current || capturedRef.current || frozenRef.current) return;
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    scanningRef.current = true;
    canvas.toBlob(async (blob) => {
      if (!blob || capturedRef.current) { scanningRef.current = false; return; }
      const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" });
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/parse-receipt", { method: "POST", body: formData });
        if (!res.ok) throw new Error("bad response");
        const parsed: ParsedReceipt = await res.json();

        if (parsed._fields?.length && !capturedRef.current) {
          // Freeze the frame immediately when fields are readable
          frozenRef.current = true;
          video.pause();
          drawHighlights(parsed._fields, !!(parsed.vendor && parsed.total));

          if (parsed.vendor && parsed.total && !parsed._parseError) {
            // All data found — capture and go
            capturedRef.current = true;
            setDetectedLabel(`${parsed.vendor}  ·  ${parsed.total}`);
            setScanState("found");
            haptic(50);
            setProcessing({ active: true });
            setTimeout(() => setProcessing(p => ({ ...p, vendor: parsed.vendor || "" })), 0);
            setTimeout(() => setProcessing(p => ({ ...p, date: parsed.date || "" })), 180);
            setTimeout(() => setProcessing(p => ({ ...p, total: parsed.total || "" })), 360);
            setTimeout(() => setProcessing(p => ({ ...p, category: parsed.category || "" })), 540);
            setTimeout(() => {
              streamRef.current?.getTracks().forEach((t) => t.stop());
              onCapture(file, parsed);
              setProcessing({ active: false });
            }, 900);
          } else {
            // Partial read — show highlights briefly then unfreeze and retry
            setTimeout(() => {
              if (!capturedRef.current) {
                frozenRef.current = false;
                video.play().catch(() => {});
                clearOverlay();
              }
            }, 1200);
          }
        } else if (!capturedRef.current) {
          setScanState("idle");
        }
      } catch { if (!capturedRef.current) setScanState("idle"); }
      finally  { scanningRef.current = false; }
    }, "image/jpeg", 0.85);
  }, [onCapture, drawHighlights, clearOverlay]);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(scan, 1200);
    return () => clearInterval(id);
  }, [ready, scan]);

  useEffect(() => {
    if (!onClose) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose!(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isFound = scanState === "found";

  async function handleFileInput(file: File) {
    if (capturedRef.current) return;
    capturedRef.current = true;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const compressed = await compressImage(file);
    try {
      const parsed = await parseFile(compressed);
      onCapture(compressed, parsed);
    } catch { onCapture(compressed, { _parseError: "parse-failed" }); }
  }

  async function handleShutter() {
    if (capturedRef.current || shutterLoading) return;
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) {
      cameraRef.current?.click(); return;
    }
    haptic(35);
    setShutterPressed(true);
    setTimeout(() => setShutterPressed(false), 120);
    setShutterLoading(true);
    setProcessing({ active: true });
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) { setShutterLoading(false); setProcessing({ active: false }); return; }
      const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" });
      capturedRef.current = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        const parsed = await parseFile(file);
        setTimeout(() => setProcessing(p => ({ ...p, vendor: parsed.vendor || "—" })), 0);
        setTimeout(() => setProcessing(p => ({ ...p, date: parsed.date || "—" })), 180);
        setTimeout(() => setProcessing(p => ({ ...p, total: parsed.total || "—" })), 360);
        setTimeout(() => setProcessing(p => ({ ...p, category: parsed.category || "—" })), 540);
        setTimeout(() => {
          onCapture(file, parsed);
          setProcessing({ active: false });
        }, 900);
      } catch {
        onCapture(file, { _parseError: "parse-failed" });
        setProcessing({ active: false });
      } finally { setShutterLoading(false); }
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: "#000" }}>
      {/* Hidden file inputs */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileInput(f); }} />
      <input ref={libraryRef} type="file" accept="image/*,.pdf,.heic,.heif" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileInput(f); }} />

      {/* Viewfinder */}
      <div className="flex-1 relative overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8">
            <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.45)" }}>{error}</p>
            <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.3)" }}>Use the buttons below to upload a photo</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"
              style={{ opacity: ready ? 1 : 0, transition: "opacity 0.3s" }} />
            <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            {!ready && !error && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 animate-spin"
                  style={{ borderColor: "rgba(255,255,255,0.4) transparent transparent transparent" }} />
              </div>
            )}
            {/* Detected label overlay */}
            {isFound && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full"
                  style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <polyline points="2,7 5.5,10.5 12,3.5" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-sm font-semibold" style={{ color: "#4ade80" }}>{detectedLabel}</span>
                </div>
              </div>
            )}
            {/* Hint when ready but not found */}
            {ready && !isFound && !processing.active && (
              <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
                <span className="text-xs px-3 py-1 rounded-full"
                  style={{ color: "rgba(255,255,255,0.45)", backgroundColor: "rgba(0,0,0,0.4)" }}>
                  Point at a receipt to auto-scan
                </span>
              </div>
            )}

            {/* Processing overlay — shimmer then autofill */}
            {processing.active && (
              <div className="absolute inset-0 flex items-center justify-center px-6"
                style={{ backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", zIndex: 10 }}>
                <div className="w-full rounded-2xl p-5 flex flex-col gap-4"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}>
                  <p className="text-xs font-semibold tracking-widest" style={{ color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em" }}>
                    READING RECEIPT
                  </p>
                  <ProcessingRow label="Vendor"   value={processing.vendor} />
                  <ProcessingRow label="Date"     value={processing.date} />
                  <ProcessingRow label="Total"    value={processing.total} />
                  <ProcessingRow label="Category" value={processing.category} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Bottom camera bar */}
      <div className="flex items-center justify-between px-8 py-5"
        style={{ backgroundColor: "rgba(0,0,0,0.9)", minHeight: 100 }}>

        {/* Photo library */}
        <button onClick={() => libraryRef.current?.click()}
          className="flex flex-col items-center gap-1.5"
          style={{ touchAction: "manipulation", color: "rgba(255,255,255,0.7)" }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Library</span>
        </button>

        {/* Shutter */}
        <button onClick={handleShutter} disabled={isFound || shutterLoading}
          style={{ touchAction: "manipulation", transform: shutterPressed ? "scale(0.87)" : "scale(1)", transition: "transform 0.1s ease" }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            border: "3px solid rgba(255,255,255,0.9)",
            display: "flex", alignItems: "center", justifyContent: "center",
            backgroundColor: isFound ? "rgba(74,222,128,0.2)" : "transparent",
          }}>
            <div style={{
              width: 58, height: 58, borderRadius: "50%",
              backgroundColor: isFound ? "#4ade80" : shutterLoading ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.92)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {shutterLoading && (
                <div className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{ borderColor: "#000 transparent transparent transparent" }} />
              )}
            </div>
          </div>
        </button>

        {/* Manual entry */}
        <button onClick={onManual}
          className="flex flex-col items-center gap-1.5"
          style={{ touchAction: "manipulation", color: "rgba(255,255,255,0.7)" }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </div>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Manual</span>
        </button>
      </div>
    </div>
  );
}

// ── Mobile: Import left panel ──────────────────────────────────────────────────

function MobileImportPanel({
  state,
  onFiles,
  onManual,
}: {
  state: UploadState;
  onFiles: (files: File[]) => void;
  onManual: () => void;
}) {
  const isParsing = state.status === "parsing";
  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 gap-6"
      style={{ backgroundColor: "var(--bg-base)" }}>
      {isParsing ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "var(--accent-blue) transparent transparent transparent" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {state.total > 1 ? `${state.done} / ${state.total}` : "Reading…"}
          </p>
        </div>
      ) : (
        <>
          <div className="text-center">
            <p className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Import Receipt</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>JPG · PNG · PDF · HEIC</p>
          </div>

          <label className="w-full flex flex-col items-center justify-center rounded-3xl border-2 border-dashed py-10 gap-3"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-surface)", cursor: "pointer" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-blue)" }}>
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
              <path d="M20 21H4" />
            </svg>
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Choose file or take photo</span>
            <input type="file" accept="image/*,.pdf,.heic,.heif" multiple className="hidden"
              onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) onFiles(f); e.target.value = ""; }} />
          </label>

          {state.status === "error" && (
            <p className="text-sm text-center" style={{ color: "#f87171" }}>{state.message}</p>
          )}

          <button onClick={onManual} className="text-sm py-2 px-6"
            style={{ color: "var(--text-secondary)", touchAction: "manipulation" }}>
            Enter manually
          </button>
        </>
      )}
    </div>
  );
}

// ── Mobile: Records right panel ────────────────────────────────────────────────

function MobileRecordsPanel({ active }: { active: boolean }) {
  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  useEffect(() => { if (active) setReceipts(getSaved().slice(0, 12)); }, [active]);

  return (
    <div className="w-full h-full overflow-y-auto" style={{ backgroundColor: "var(--bg-base)" }}>
      <div className="px-5 pt-14 pb-24">
        <p className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Records</p>

        {receipts.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No saved receipts yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {receipts.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-2xl"
                style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                {r.thumbnail && r.thumbnail !== "pdf" ? (
                  <img src={r.thumbnail} alt="" className="rounded-xl object-cover flex-shrink-0"
                    style={{ width: 44, height: 44 }} />
                ) : (
                  <div className="rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ width: 44, height: 44, backgroundColor: "var(--bg-elevated)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-secondary)" }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {r.vendor || "Receipt"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {r.date}{r.total ? ` · ${r.total}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <Link href="/receipts"
          className="mt-4 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium"
          style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          View all records
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

// ── Mobile: Three-panel Snapchat-style layout ──────────────────────────────────
// Panel 0 = Records (swipe right), Panel 1 = Camera (center/default), Panel 2 = Import (swipe left)

function MobileLayout() {
  const router = useRouter();
  const [panel, setPanel]           = useState(2);
  const [dragOffset, setDragOffset] = useState(0);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });

  const startX   = useRef(0);
  const startY   = useRef(0);
  const dragging = useRef(false);

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    setUploadState({ status: "parsing", done: 0, total: files.length });
    const results: PendingReceipt[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = crypto.randomUUID();
      try {
        const compressed = await compressImage(file);
        const parsed = await parseFile(compressed);
        results.push({ id, fileName: file.name, thumbnail: parsed._thumbnail ?? (file.type === "application/pdf" ? "pdf" : ""), parsed });
      } catch (err) {
        results.push({ id, fileName: file.name, thumbnail: "", parsed: { _parseError: err instanceof Error ? err.message : String(err) } });
      }
      setUploadState({ status: "parsing", done: i + 1, total: files.length });
    }
    try {
      setPending(results.filter(Boolean));
      router.push("/receipts/review");
    } catch {
      setUploadState({ status: "error", message: "Could not save. Try freeing up storage." });
    }
  }

  function goManual() {
    setPending([{ id: crypto.randomUUID(), fileName: "Manual entry", thumbnail: "", parsed: { _parseError: "manual" } }]);
    router.push("/receipts/review");
  }

  function handleCameraResult(file: File, parsed: ParsedReceipt) {
    try {
      setPending([{ id: crypto.randomUUID(), fileName: file.name, thumbnail: parsed._thumbnail ?? "", parsed }]);
      router.push("/receipts/review");
    } catch { /* ignore */ }
  }

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    dragging.current = true;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (Math.abs(dy) > Math.abs(dx)) { dragging.current = false; setDragOffset(0); return; }
    // Resist dragging past edges
    if ((panel === 0 && dx > 0) || (panel === 2 && dx < 0)) {
      setDragOffset(dx * 0.2); // rubber band
    } else {
      setDragOffset(dx);
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    dragging.current = false;
    const dx = e.changedTouches[0].clientX - startX.current;
    setDragOffset(0);
    if (dx < -40 && panel < 2) setPanel((p) => p + 1);
    else if (dx > 40 && panel > 0) setPanel((p) => p - 1);
  }

  // translateX: panel=0→0vw, panel=1→-100vw, panel=2→-200vw, plus live drag
  const translateVw = -panel * 100;
  const isAnimating = dragOffset === 0;

  return (
    <div className="fixed inset-0 overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}>

      {/* Three panels side by side */}
      <div className="flex h-full" style={{
        width: "300vw",
        transform: `translateX(calc(${translateVw}vw + ${dragOffset}px))`,
        transition: isAnimating ? "transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)" : "none",
        willChange: "transform",
      }}>
        {/* Panel 0 — Records (swipe right to see) */}
        <div style={{ width: "100vw", height: "100%", flexShrink: 0 }}>
          <MobileRecordsPanel active={panel === 0} />
        </div>

        {/* Panel 1 — Camera (default/center) */}
        <div style={{ width: "100vw", height: "100%", flexShrink: 0, position: "relative" }}>
          <CameraScanner active={panel === 1} onCapture={handleCameraResult} onManual={goManual} />
        </div>

        {/* Panel 2 — Import (swipe left to see) */}
        <div style={{ width: "100vw", height: "100%", flexShrink: 0 }}>
          <MobileImportPanel state={uploadState} onFiles={handleFiles} onManual={goManual} />
        </div>
      </div>

      {/* Panel indicator dots */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center gap-2 pointer-events-none z-20">
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%",
            backgroundColor: i === panel ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
            transition: "background-color 0.2s",
            boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Desktop: Camera modal (unchanged) ──────────────────────────────────────────

function DesktopCameraModal({ onCapture, onClose }: {
  onCapture: (file: File, parsed: ParsedReceipt) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <CameraScanner active onCapture={onCapture} onClose={onClose} />
      <button onClick={onClose}
        className="absolute top-4 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(0,0,0,0.5)", color: "#fff" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ── Desktop: Import page (unchanged from before) ───────────────────────────────

function DesktopLayout() {
  const [state, setState]     = useState<UploadState>({ status: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const router = useRouter();

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    setState({ status: "parsing", done: 0, total: files.length });
    const results: PendingReceipt[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = crypto.randomUUID();
      try {
        const compressed = await compressImage(file);
        const parsed = await parseFile(compressed);
        const thumbnail = parsed._thumbnail ?? (file.type === "application/pdf" ? "pdf" : "");
        results.push({ id, fileName: file.name, thumbnail, parsed });
      } catch (err) {
        results.push({ id, fileName: file.name, thumbnail: "", parsed: { _parseError: err instanceof Error ? err.message : String(err) } });
      }
      setState({ status: "parsing", done: i + 1, total: files.length });
    }
    try {
      setPending(results.filter(Boolean));
      router.push("/receipts/review");
    } catch {
      setState({ status: "error", message: "Could not save — try freeing up storage." });
    }
  }

  function goManual() {
    setPending([{ id: crypto.randomUUID(), fileName: "Manual entry", thumbnail: "", parsed: { _parseError: "manual" } }]);
    router.push("/receipts/review");
  }

  const isParsing = state.status === "parsing";

  return (
    <>
      {cameraOpen && (
        <DesktopCameraModal
          onCapture={(file, parsed) => {
            setCameraOpen(false);
            try {
              setPending([{ id: crypto.randomUUID(), fileName: file.name, thumbnail: parsed._thumbnail ?? "", parsed }]);
              router.push("/receipts/review");
            } catch {
              setState({ status: "error", message: "Could not save — try freeing up storage." });
            }
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}

      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
        style={{ backgroundColor: "var(--bg-base)" }}>
        <div className="w-full max-w-md">
          {!isParsing && (
            <>
              <label htmlFor="file-upload-desktop"
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = Array.from(e.dataTransfer.files); if (f.length) handleFiles(f); }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed transition-all duration-300 py-20 gap-8"
                style={{
                  borderColor: dragOver ? "var(--accent-blue)" : "var(--border)",
                  backgroundColor: dragOver ? "rgba(59,130,246,0.06)" : "var(--bg-surface)",
                  cursor: "pointer", display: "flex",
                }}>
                {/* Stacked receipt illustration */}
                <div className="relative" style={{ width: 96, height: 112 }}>
                  <div className="absolute rounded-xl" style={{ width: 72, height: 88, top: 6, left: 20, backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", transform: "rotate(6deg)" }} />
                  <div className="absolute rounded-xl" style={{ width: 72, height: 88, top: 3, left: 12, backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", transform: "rotate(-3deg)" }} />
                  <div className="absolute rounded-xl flex flex-col justify-between" style={{ width: 72, height: 88, top: 0, left: 12, backgroundColor: "var(--bg-surface)", border: dragOver ? "1.5px solid var(--accent-blue)" : "1.5px solid var(--border)", padding: "10px 10px 8px", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
                    {[1, 0.5, 0.8, 0.4].map((w, i) => (
                      <div key={i} className="rounded-full" style={{ height: 4, width: `${w * 100}%`, backgroundColor: i === 0 ? "var(--accent-blue)" : "var(--border)", opacity: i === 0 ? 0.9 : 0.6 }} />
                    ))}
                    <div style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", backgroundColor: "var(--accent-blue)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="white"><path d="M5 0 L5.8 4.2 L10 5 L5.8 5.8 L5 10 L4.2 5.8 L0 5 L4.2 4.2 Z" /></svg>
                    </div>
                  </div>
                  <div className="absolute flex items-center justify-center rounded-full" style={{ width: 26, height: 26, bottom: 0, right: 0, backgroundColor: dragOver ? "var(--accent-blue)" : "var(--bg-elevated)", border: "1px solid var(--border)", transition: "background-color 0.2s" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: dragOver ? "#fff" : "var(--text-secondary)" }}>
                      <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-lg" style={{ color: "var(--text-primary)" }}>
                    {dragOver ? "Release to upload" : "Import Receipts"}
                  </p>
                  <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>JPG · PNG · PDF · HEIC</p>
                </div>
                <input id="file-upload-desktop" type="file" accept="image/*,.pdf,.heic,.heif" multiple className="hidden"
                  onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) handleFiles(f); e.target.value = ""; }} />
              </label>

              <button type="button" onClick={() => setCameraOpen(true)}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium transition-colors"
                style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Scan with Camera
              </button>

              {state.status === "error" && (
                <p className="mt-3 text-sm text-center" style={{ color: "#f87171" }}>{state.message}</p>
              )}

              <div className="mt-5 text-center">
                <button type="button" onClick={goManual} className="text-xs py-2 px-4"
                  style={{ color: "var(--text-secondary)" }}>
                  Enter manually
                </button>
              </div>
            </>
          )}

          {isParsing && (
            <div className="flex flex-col items-center justify-center gap-6 rounded-3xl py-20"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 rounded-full border-2 animate-spin"
                  style={{ borderColor: "var(--accent-blue) transparent transparent transparent" }} />
              </div>
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                {state.total > 1 ? `${state.done} / ${state.total}` : "Reading…"}
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  return (
    <>
      {/* Mobile: Snapchat-style three-panel layout */}
      <div className="md:hidden">
        <MobileLayout />
      </div>
      {/* Desktop: original import page */}
      <div className="hidden md:block">
        <DesktopLayout />
      </div>
    </>
  );
}
