"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { getSettings } from "@/lib/storage";

export type PlaceResult = { label: string; place_id?: string; lat?: number; lng?: number };

export async function resolvePlaceDetails(place: PlaceResult): Promise<PlaceResult> {
  if (!place.place_id || (place.lat !== undefined && place.lng !== undefined)) return place;
  try {
    const res  = await fetch(`/api/place-details?place_id=${encodeURIComponent(place.place_id)}`);
    const data = await res.json();
    if (data.lat !== undefined) {
      return { ...place, label: data.address ?? place.label, lat: data.lat, lng: data.lng };
    }
  } catch { /* keep original */ }
  return place;
}

function useAddressAutocomplete() {
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [loading, setLoading]         = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 2) { setSuggestions([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q });
        const bias = getSettings().locationBias;
        if (bias?.enabled && bias.lat) {
          params.set("lat",    String(bias.lat));
          params.set("lng",    String(bias.lng));
          params.set("radius", String(bias.radiusKm ?? 100));
        }
        const res  = await fetch(`/api/places-autocomplete?${params}`);
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch { setSuggestions([]); }
      setLoading(false);
    }, 150);
  }, []);

  const clear = useCallback(() => setSuggestions([]), []);
  return { suggestions, loading, search, clear };
}

export default function AddressInput({
  value, onChange, onSelect, placeholder, locked, small,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (p: PlaceResult) => void;
  placeholder?: string;
  locked?: boolean;
  small?: boolean;
}) {
  const { suggestions, loading, search, clear } = useAddressAutocomplete();
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); clear();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [clear]);

  function openDropdown() {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 280),
      zIndex: 9999,
    });
    setOpen(true);
  }

  function handleChange(v: string) {
    if (locked) return;
    onChange(v);
    search(v);
    openDropdown();
  }

  function handleSelect(p: PlaceResult) {
    onChange(p.label);
    onSelect?.(p);
    setOpen(false);
    clear();
  }

  const dropdown = open && suggestions.length > 0 ? createPortal(
    <div style={{
      ...dropdownStyle,
      backgroundColor: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
    }}>
      {suggestions.map((s, i) => (
        <button key={i} onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
          className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors"
          style={{
            fontSize: 12,
            color: "var(--text-primary)",
            borderBottom: i < suggestions.length - 1 ? "1px solid var(--border)" : "none",
            backgroundColor: "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-elevated)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-blue)", flexShrink: 0 }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative" ref={wrapRef} style={{ flex: 1, minWidth: 0 }}>
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (suggestions.length) openDropdown(); }}
          placeholder={placeholder}
          readOnly={locked}
          className="w-full rounded-lg px-3 outline-none"
          style={{
            backgroundColor: locked ? "var(--bg-elevated)" : "var(--bg-base)",
            border: "1px solid var(--border)",
            color: locked ? "var(--text-secondary)" : "var(--text-primary)",
            fontSize: small ? 12 : 13,
            padding: small ? "5px 10px" : "8px 12px",
            cursor: locked ? "default" : "text",
          }}
        />
        {locked && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
            style={{ color: "var(--text-secondary)", opacity: 0.5 }}>🔒</span>
        )}
        {loading && !locked && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
            style={{ color: "var(--accent-blue)" }}>…</span>
        )}
      </div>
      {dropdown}
    </div>
  );
}
