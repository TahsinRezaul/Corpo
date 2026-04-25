"use client";

import { useEffect, useRef, useState } from "react";

type ViewState = { scale: number; x: number; y: number };

function applyZoom(v: ViewState, factor: number, cx: number, cy: number): ViewState {
  const newScale = Math.min(Math.max(v.scale * factor, 0.5), 20);
  const f = newScale / v.scale;
  return { scale: newScale, x: cx * (1 - f) + v.x * f, y: cy * (1 - f) + v.y * f };
}

export default function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef   = useRef({ active: false, lastX: 0, lastY: 0 });
  const pinchRef  = useRef<{ dist: number } | null>(null);

  // Escape key
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  // Non-passive wheel handler (can't preventDefault on passive React synthetic events)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setView((v) => applyZoom(v, factor, cx, cy));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    setDragging(true);
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  }

  function onMouseUp() {
    dragRef.current.active = false;
    setDragging(false);
  }

  function onDoubleClick(e: React.MouseEvent) {
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    setView((v) => (v.scale > 1.5 ? { scale: 1, x: 0, y: 0 } : applyZoom(v, 3.5, cx, cy)));
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      pinchRef.current = { dist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY) };
      dragRef.current.active = false;
    } else if (e.touches.length === 1) {
      dragRef.current = { active: true, lastX: e.touches[0].clientX, lastY: e.touches[0].clientY };
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchRef.current) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const factor  = newDist / pinchRef.current.dist;
      const rect    = containerRef.current!.getBoundingClientRect();
      const cx = (t1.clientX + t2.clientX) / 2 - rect.left - rect.width / 2;
      const cy = (t1.clientY + t2.clientY) / 2 - rect.top  - rect.height / 2;
      setView((v) => applyZoom(v, factor, cx, cy));
      pinchRef.current = { dist: newDist };
    } else if (e.touches.length === 1 && dragRef.current.active) {
      const dx = e.touches[0].clientX - dragRef.current.lastX;
      const dy = e.touches[0].clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.touches[0].clientX;
      dragRef.current.lastY = e.touches[0].clientY;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  }

  function onTouchEnd() {
    pinchRef.current = null;
    dragRef.current.active = false;
  }

  const isZoomed = view.scale !== 1 || view.x !== 0 || view.y !== 0;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[70] overflow-hidden select-none"
      style={{
        backgroundColor: "#000",
        cursor: dragging ? "grabbing" : view.scale > 1 ? "grab" : "zoom-in",
        touchAction: "none",
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onDoubleClick={onDoubleClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Full screen"
        draggable={false}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          maxWidth: "100vw",
          maxHeight: "100vh",
          objectFit: "contain",
          transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px)) scale(${view.scale})`,
          transformOrigin: "center center",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />

      {/* Hint text — fades after interaction */}
      {!isZoomed && (
        <p
          className="absolute bottom-20 left-1/2 text-xs pointer-events-none"
          style={{ transform: "translateX(-50%)", color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}
        >
          Scroll or pinch to zoom · Drag to pan · Double-tap to zoom in
        </p>
      )}

      {/* Bottom controls */}
      <div
        className="absolute bottom-5 left-1/2 flex items-center gap-1 px-2 py-1.5 rounded-2xl"
        style={{
          transform: "translateX(-50%)",
          backgroundColor: "rgba(20,20,20,0.8)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setView((v) => applyZoom(v, 1 / 1.5, 0, 0))}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-white font-medium text-lg"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
        >
          −
        </button>
        <span className="w-14 text-center text-xs font-semibold tabular-nums" style={{ color: "rgba(255,255,255,0.8)" }}>
          {Math.round(view.scale * 100)}%
        </span>
        <button
          onClick={() => setView((v) => applyZoom(v, 1.5, 0, 0))}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-white font-medium text-lg"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
        >
          +
        </button>
        {isZoomed && (
          <>
            <div style={{ width: 1, height: 20, backgroundColor: "rgba(255,255,255,0.15)", margin: "0 4px" }} />
            <button
              onClick={() => setView({ scale: 1, x: 0, y: 0 })}
              className="px-3 h-9 flex items-center rounded-xl text-xs font-medium"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
            >
              Reset
            </button>
          </>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute top-5 right-5 w-10 h-10 flex items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}
