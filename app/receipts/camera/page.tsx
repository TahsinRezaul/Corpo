"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { setPending, addToBackgroundQueue, type ParsedReceipt, type FieldRegion } from "@/lib/storage";

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

export default function CameraPage() {
  const router = useRouter();
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const overlayRef  = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const scanningRef  = useRef(false);
  const capturedRef  = useRef(false);
  const swipeStartX  = useRef(0);
  const swipeStartY  = useRef(0);

  const [ready, setReady]                 = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [flash, setFlash]                 = useState(false);
  const [scanState, setScanState]         = useState<"idle" | "scanning" | "found">("idle");
  const [detectedLabel, setDetectedLabel] = useState("");
  const [uploading, setUploading]         = useState(false);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      const markReady = () => { if (!video.paused || video.readyState >= 2) setReady(true); };
      video.addEventListener("canplay", markReady, { once: true });
      video.addEventListener("loadeddata", markReady, { once: true });
      try { await video.play(); } catch { /* autoplay blocked */ }
      if (video.readyState >= 2) setReady(true);
    } catch {
      setError("Camera access denied. Tap the gallery button to upload a photo instead.");
    }
  }

  // Auto-start + stop on unmount
  useEffect(() => {
    startCamera();
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const drawHighlights = useCallback((fields: FieldRegion[], found: boolean) => {
    const overlay = overlayRef.current;
    const video   = videoRef.current;
    if (!overlay || !video || !video.videoWidth) return;
    const ew = overlay.offsetWidth;
    const eh = overlay.offsetHeight;
    overlay.width  = ew;
    overlay.height = eh;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, ew, eh);
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    let scale: number, xOff: number, yOff: number;
    if (vw / vh > ew / eh) {
      scale = eh / vh; xOff = (ew - vw * scale) / 2; yOff = 0;
    } else {
      scale = ew / vw; xOff = 0; yOff = (eh - vh * scale) / 2;
    }
    const color = found ? "74,222,128" : "56,189,248";
    fields.forEach((f) => {
      const x = f.x * vw * scale + xOff;
      const y = f.y * vh * scale + yOff;
      const w = f.w * vw * scale;
      const h = f.h * vh * scale;
      ctx.strokeStyle = `rgba(${color},${found ? 0.9 : 0.75})`;
      ctx.lineWidth   = found ? 2 : 1.5;
      ctx.fillStyle   = `rgba(${color},${found ? 0.12 : 0.06})`;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 4);
      ctx.fill();
      ctx.stroke();
      ctx.font      = "bold 10px system-ui";
      ctx.fillStyle = `rgba(${color},0.9)`;
      ctx.fillText(f.name, x + 4, y - 4);
    });
  }, []);

  const scan = useCallback(() => {
    if (scanningRef.current || capturedRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    scanningRef.current = true;
    setScanState("scanning");
    canvas.toBlob(async (blob) => {
      if (!blob || capturedRef.current) { scanningRef.current = false; return; }
      const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" });
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/parse-receipt", { method: "POST", body: formData });
        if (!res.ok) throw new Error("bad response");
        const parsed: ParsedReceipt = await res.json();
        if (parsed._fields?.length) drawHighlights(parsed._fields, !!(parsed.vendor && parsed.total));
        if (!capturedRef.current && parsed.vendor && parsed.total && !parsed._parseError) {
          capturedRef.current = true;
          setDetectedLabel(`${parsed.vendor}  ·  ${parsed.total}`);
          setScanState("found");
          setFlash(true);
          setTimeout(() => setFlash(false), 200);
          setTimeout(() => {
            streamRef.current?.getTracks().forEach((t) => t.stop());
            try {
              setPending([{ id: crypto.randomUUID(), fileName: file.name, thumbnail: parsed._thumbnail ?? "", parsed }]);
              router.push("/receipts/review");
            } catch {
              setError("Could not save — try freeing up storage.");
              capturedRef.current = false;
              setScanState("idle");
            }
          }, 900);
        } else if (!capturedRef.current) {
          setScanState("idle");
        }
      } catch {
        if (!capturedRef.current) setScanState("idle");
      } finally {
        scanningRef.current = false;
      }
    }, "image/jpeg", 0.85);
  }, [drawHighlights, router]);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(scan, 1800);
    return () => clearInterval(id);
  }, [ready, scan]);

  // Native camera fallback — works even without HTTPS getUserMedia permission
  async function handleFallbackFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", compressed);
      const res = await fetch("/api/parse-receipt", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed to read receipt");
      const parsed: ParsedReceipt = await res.json();
      setPending([{ id: crypto.randomUUID(), fileName: file.name, thumbnail: parsed._thumbnail ?? "", parsed }]);
      router.push("/receipts/review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read receipt");
    } finally {
      setUploading(false);
    }
  }

  const isFound    = scanState === "found";

  function handleShutter() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !ready) return;

    // Capture the current frame
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);

    // Flash
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    // Queue for background parsing
    const imageData = canvas.toDataURL("image/jpeg", 0.85);
    addToBackgroundQueue({
      id: crypto.randomUUID(),
      fileName: `receipt-${Date.now()}.jpg`,
      imageData,
      status: "parsing",
      capturedAt: new Date().toISOString(),
    });

    // Stop camera and go back — parsing happens in the background
    streamRef.current?.getTracks().forEach((t) => t.stop());
    router.back();
  }

  return (
    <div
      className="fixed inset-0"
      style={{ backgroundColor: "#000" }}
      onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; swipeStartY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - swipeStartX.current;
        const dy = e.changedTouches[0].clientY - swipeStartY.current;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dx > 0) {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          router.push("/");
        }
      }}
    >
      {/* Flash */}
      {flash && <div className="absolute inset-0 z-30 pointer-events-none" style={{ backgroundColor: "rgba(255,255,255,0.5)" }} />}

      {/* Full-screen video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: ready ? 1 : 0, transition: "opacity 0.4s" }}
      />
      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Hidden gallery input */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFallbackFile} />

      {/* Loading spinner */}
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="w-9 h-9 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(255,255,255,0.5) transparent transparent transparent" }} />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 z-20">
          <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.6)" }}>{error}</p>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="px-6 py-3 rounded-2xl text-sm font-semibold"
            style={{ backgroundColor: "#fff", color: "#000", touchAction: "manipulation" }}>
            {uploading ? "Reading…" : "Open Gallery"}
          </button>
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5"
        style={{ paddingTop: "env(safe-area-inset-top, 16px)", paddingBottom: 12 }}>
        <button
          onClick={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); router.back(); }}
          className="w-10 h-10 flex items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(0,0,0,0.35)", color: "#fff", touchAction: "manipulation" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* Status badge */}
        {(isFound || uploading || scanState === "scanning") && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}>
            {isFound ? (
              <>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <polyline points="2,7 5.5,10.5 12,3.5" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-xs font-semibold" style={{ color: "#4ade80" }}>{detectedLabel}</span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 rounded-full border-2 animate-spin flex-shrink-0"
                  style={{ borderColor: "rgba(255,255,255,0.6) transparent transparent transparent" }} />
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.8)" }}>
                  {uploading ? "Reading…" : "Scanning…"}
                </span>
              </>
            )}
          </div>
        )}

        <div className="w-10" />
      </div>

      {/* ── Bottom controls (Snapchat style) ── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-10"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 36px)", paddingTop: 24 }}>

        {/* Gallery */}
        <button onClick={() => fileInputRef.current?.click()}
          className="w-12 h-12 flex items-center justify-center rounded-xl overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.15)", touchAction: "manipulation" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21,15 16,10 5,21"/>
          </svg>
        </button>

        {/* Shutter */}
        <button onClick={handleShutter} disabled={!ready || isFound}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 76, height: 76,
            backgroundColor: "transparent",
            border: "4px solid rgba(255,255,255,0.9)",
            touchAction: "manipulation",
            transition: "transform 0.1s",
          }}
          onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
          onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <div className="rounded-full" style={{
            width: 56, height: 56,
            backgroundColor: isFound ? "#4ade80" : "rgba(255,255,255,0.9)",
            transition: "background-color 0.2s",
          }} />
        </button>

        {/* Placeholder for symmetry */}
        <div className="w-12" />
      </div>

      {/* Hint text */}
      {ready && !isFound && scanState === "idle" && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex justify-center"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 140px)" }}>
          <span className="text-xs px-3 py-1 rounded-full"
            style={{ color: "rgba(255,255,255,0.5)", backgroundColor: "rgba(0,0,0,0.3)" }}>
            Point at a receipt · auto-scans
          </span>
        </div>
      )}
    </div>
  );
}
