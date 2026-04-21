"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import AddressInput, { type PlaceResult, resolvePlaceDetails } from "@/components/AddressInput";
import {
  getMileage, addMileage, deleteMileage, updateMileage,
  calcMileageDeduction, bulkAddMileage,
  getOdometerForYear, saveOdometer,
  getOfficeLocation, saveOfficeLocation,
  getSettings,
  type MileageTrip, type OdometerRecord, type OfficeLocation,
} from "@/lib/storage";
import PageHelp from "@/components/PageHelp";
import { PAGE_HELP } from "@/lib/page-help-content";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

const CURRENT_YEAR = new Date().getFullYear();
const TODAY = new Date().toISOString().slice(0, 10);

// ── CRA flag logic ────────────────────────────────────────────────────────────

function craFlags(trip: MileageTrip): string[] {
  const flags: string[] = [];
  if (!trip.purpose?.trim())            flags.push("Business purpose required");
  if (!trip.km && !trip.kmPending)      flags.push("Distance not set");
  if (!trip.fromLat || !trip.toLat)     flags.push("Address not verified by Google Maps");
  return flags;
}

function groupFlags(legs: MileageTrip[]): string[] {
  const all = legs.flatMap(craFlags);
  return [...new Set(all)];
}

// ── Multi-stop form types ─────────────────────────────────────────────────────

type Leg = {
  id: string;
  from: string;
  to: string;
  fromLat?: number;
  fromLng?: number;
  toLat?: number;
  toLng?: number;
};

type TripDraft = {
  date: string;
  legs: Leg[];
  purpose: string;
  notes: string;
  startMileage: string;
};

function newLeg(): Leg {
  return { id: crypto.randomUUID(), from: "", to: "" };
}

// ── Mileage import helpers ────────────────────────────────────────────────────

const FROM_ALIASES         = ["from", "origin", "start location", "departure"];
const TO_ALIASES           = ["to", "destination", "end location", "arrival"];
const DATE_ALIASES         = ["date"];
const START_ALIASES        = ["starting mileage", "start mileage", "odometer start", "start odometer", "starting km", "from km", "opening"];
const END_ALIASES          = ["ending mileage", "end mileage", "odometer end", "end odometer", "ending km", "to km", "closing"];
const KM_ALIASES           = ["km driven", "km", "kms", "distance", "km traveled", "miles"];
const PURPOSE_ALIASES      = ["business purpose", "purpose", "description", "reason", "memo"];
const NOTES_ALIASES        = ["notes", "note", "comments"];
// Address component columns (combined with the main from/to name when present)
const FROM_STREET_ALIASES  = ["from street", "from address", "from street address", "start street", "departure address", "from location address"];
const FROM_CITY_ALIASES    = ["from city", "start city", "origin city", "departure city"];
const FROM_PROV_ALIASES    = ["from province", "from prov", "from state", "start province", "from region"];
const FROM_POSTAL_ALIASES  = ["from postal", "from postal code", "from zip", "start postal", "from postcode"];
const TO_STREET_ALIASES    = ["to street", "to address", "to street address", "end street", "arrival address", "to location address"];
const TO_CITY_ALIASES      = ["to city", "end city", "destination city", "arrival city"];
const TO_PROV_ALIASES      = ["to province", "to prov", "to state", "end province", "to region"];
const TO_POSTAL_ALIASES    = ["to postal", "to postal code", "to zip", "end postal", "to postcode"];

function findCol(headers: string[], aliases: string[]) {
  return headers.find((h) => aliases.some((a) => h.toLowerCase().trim().includes(a)));
}

function parseDate(s: string): string {
  if (!s) return "";
  const num = parseFloat(String(s));
  if (!isNaN(num) && num > 1000) {
    const d = XLSX.SSF.parse_date_code(num);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return String(s);
}

function importMileageSheet(file: File, officeAddr?: string, officeLabel?: string): Promise<{ trips: MileageTrip[]; warnings: string[] }> {
  // Normalize office label variants so we can substitute with the real address
  const officeLabelLower = (officeLabel ?? "home office").toLowerCase();
  function resolveAddr(raw: string): string {
    const l = raw.toLowerCase().trim();
    if (officeAddr && (l === officeLabelLower || l === "home office" || l === "office" || l === "home")) {
      return officeAddr;
    }
    return raw;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb   = XLSX.read(data, { type: "array", raw: false });
      const sheetName = wb.SheetNames.find((n) =>
        n.toLowerCase().includes("mileage") || n.toLowerCase().includes("trip")
      ) ?? wb.SheetNames[0];
      const ws   = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", raw: false });
      if (!rows.length) { resolve({ trips: [], warnings: ["Sheet appears empty."] }); return; }
      const headers = Object.keys(rows[0]);
      const col = {
        date:       findCol(headers, DATE_ALIASES),
        from:       findCol(headers, FROM_ALIASES),
        to:         findCol(headers, TO_ALIASES),
        start:      findCol(headers, START_ALIASES),
        end:        findCol(headers, END_ALIASES),
        km:         findCol(headers, KM_ALIASES),
        purpose:    findCol(headers, PURPOSE_ALIASES),
        notes:      findCol(headers, NOTES_ALIASES),
        // address components
        fromStreet: findCol(headers, FROM_STREET_ALIASES),
        fromCity:   findCol(headers, FROM_CITY_ALIASES),
        fromProv:   findCol(headers, FROM_PROV_ALIASES),
        fromPostal: findCol(headers, FROM_POSTAL_ALIASES),
        toStreet:   findCol(headers, TO_STREET_ALIASES),
        toCity:     findCol(headers, TO_CITY_ALIASES),
        toProv:     findCol(headers, TO_PROV_ALIASES),
        toPostal:   findCol(headers, TO_POSTAL_ALIASES),
      };
      // Build a full address string from a name + separate component columns
      function buildFullAddr(name: string, street: string, city: string, prov: string, postal: string): string {
        const parts = [name, street, city, prov, postal].map((p) => p.trim()).filter(Boolean);
        return parts.join(", ");
      }
      const warnings: string[] = [];
      if (!col.date)             warnings.push("Could not find a Date column.");
      if (!col.from)             warnings.push("Could not find a From column.");
      if (!col.to)               warnings.push("Could not find a To column.");
      if (!col.start && !col.km) warnings.push("No Starting Mileage or KM column — distances set to 0.");
      const trips: MileageTrip[] = [];
      for (const row of rows) {
        const startNum = parseFloat(String(row[col.start ?? ""] ?? "")) || 0;
        const endNum   = parseFloat(String(row[col.end   ?? ""] ?? "")) || 0;
        const kmRaw    = parseFloat(String(row[col.km    ?? ""] ?? "")) || 0;
        const km       = endNum > startNum ? endNum - startNum : kmRaw;
        const date     = parseDate(String(row[col.date ?? ""] ?? ""));
        if (!date && !km) continue;
        const fromName   = String(row[col.from       ?? ""] ?? "").trim();
        const toName     = String(row[col.to         ?? ""] ?? "").trim();
        const fromStreet = String(row[col.fromStreet ?? ""] ?? "").trim();
        const fromCity   = String(row[col.fromCity   ?? ""] ?? "").trim();
        const fromProv   = String(row[col.fromProv   ?? ""] ?? "").trim();
        const fromPostal = String(row[col.fromPostal ?? ""] ?? "").trim();
        const toStreet   = String(row[col.toStreet   ?? ""] ?? "").trim();
        const toCity     = String(row[col.toCity     ?? ""] ?? "").trim();
        const toProv     = String(row[col.toProv     ?? ""] ?? "").trim();
        const toPostal   = String(row[col.toPostal   ?? ""] ?? "").trim();
        const fromRaw = buildFullAddr(fromName, fromStreet, fromCity, fromProv, fromPostal);
        const toRaw   = buildFullAddr(toName,   toStreet,   toCity,   toProv,   toPostal);
        trips.push({
          id: crypto.randomUUID(), date,
          from: resolveAddr(fromRaw),
          to:   resolveAddr(toRaw),
          purpose: String(row[col.purpose ?? ""] ?? "").trim(),
          notes:   String(row[col.notes   ?? ""] ?? "").trim() || undefined,
          km: 0,          // will be recalculated from real addresses
          kmImported: km || undefined,  // keep original as fallback
          kmPending: true, // triggers background distance calculation
          startMileage: startNum || undefined, endMileage: endNum || undefined,
          roundTrip: false,
        });
      }
      resolve({ trips, warnings });
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MileagePage() {
  const [year, setYear]           = useState(0);
  const [trips, setTrips]         = useState<MileageTrip[]>([]);
  const [odometer, setOdometer]   = useState<Partial<OdometerRecord>>({});
  const [odomEdit, setOdomEdit]   = useState(false);
  const [odomDraft, setOdomDraft] = useState({ startKm: "", endKm: "" });

  const [office, setOffice]           = useState<OfficeLocation | null>(null);
  const [officeEdit, setOfficeEdit]   = useState(false);
  const [officeDraft, setOfficeDraft] = useState({ label: "Home Office", address: "" });

  // Modal
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null); // single-leg edit
  const [draft, setDraft]         = useState<TripDraft>({
    date: TODAY, legs: [newLeg()], purpose: "", notes: "", startMileage: "",
  });
  const [aiLoading, setAiLoading] = useState(false);

  // Filters
  const [search, setSearch]       = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo]     = useState("");
  const [mileSort, setMileSort]     = useState<"date" | "km" | "purpose" | null>(null);
  const [mileSortDir, setMileSortDir] = useState<"asc" | "desc">("desc");

  // Import
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState<{ count: number; skipped: number; warnings: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Selection & AI chat
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [chatOpen, setChatOpen]         = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{
    role: "user" | "assistant";
    content: string;
    elapsed?: number;   // ms the API took
    tokens?: number;    // total tokens used
    actionSummary?: string; // e.g. "Grouped 14 trips"
  }>>([]);
  const [chatInput, setChatInput]         = useState("");
  const [chatLoading, setChatLoading]     = useState(false);
  const [chatMinimized, setChatMinimized] = useState(false);
  const [chatElapsed, setChatElapsed]     = useState(0);
  const chatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef   = useRef<HTMLDivElement>(null);

  // Selection toolbar
  const [selAction, setSelAction] = useState<"purpose" | "notes" | null>(null);
  const [selInput, setSelInput]   = useState("");

  // Discrepancy review
  const [showFlagReview, setShowFlagReview] = useState(false);

  // Background km resolution — track in-flight IDs so we don't double-fire
  const resolvingRef = useRef<Set<string>>(new Set());

  // Escape key — close trip form (confirm if dirty)
  const draftSnapshotRef = useRef<string>("");
  useEffect(() => {
    if (!showForm) return;
    draftSnapshotRef.current = JSON.stringify(draft);
  }, [showForm]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!showForm) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const dirty = JSON.stringify(draft) !== draftSnapshotRef.current;
      if (dirty) {
        if (window.confirm("You have unsaved changes. Discard and close?")) setShowForm(false);
      } else {
        setShowForm(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showForm, draft]);

  // ── Load ──

  useEffect(() => {
    setTrips(getMileage());
    if (year !== 0) {
      const od = getOdometerForYear(year);
      setOdometer(od ?? {});
      setOdomDraft({ startKm: String(od?.startKm ?? ""), endKm: String(od?.endKm ?? "") });
    } else {
      setOdometer({});
    }
  }, [year]);

  useEffect(() => {
    const off = getOfficeLocation();
    setOffice(off);
    if (off) setOfficeDraft({ label: off.label, address: off.address });
  }, []);

  // ── Sort hotkeys (Alt+D / Alt+K / Alt+P, or just d/k/p when not in an input) ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      // Alt+key works anywhere; bare key only when not in an input
      const d = e.altKey ? e.key.toLowerCase() : (!inInput ? e.key.toLowerCase() : null);
      if (!d) return;
      function cycle(field: "date" | "km" | "purpose") {
        setMileSort((prev) => {
          if (prev === field) setMileSortDir((dir) => dir === "asc" ? "desc" : "asc");
          else { setMileSortDir(field === "date" ? "desc" : "asc"); }
          return field;
        });
      }
      if (d === "d") { e.preventDefault(); cycle("date"); }
      else if (d === "k") { e.preventDefault(); cycle("km"); }
      else if (d === "p") { e.preventDefault(); cycle("purpose"); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── Background km calculation ──

  useEffect(() => {
    const pending = trips.filter((t) => t.kmPending && !resolvingRef.current.has(t.id));
    if (!pending.length) return;

    for (const trip of pending) {
      resolvingRef.current.add(trip.id);

      // Step 1: geocode both addresses first (always — so we get full formatted addresses)
      const { province, locationBias } = getSettings();
      const geocodeAddr = async (addr: string, lat?: number, lng?: number) => {
        const params = new URLSearchParams({ address: addr });
        if (locationBias?.enabled && locationBias.lat) {
          params.set("lat",    String(locationBias.lat));
          params.set("lng",    String(locationBias.lng));
          params.set("radius", String(locationBias.radiusKm ?? 100));
          if (province) params.set("province", province);
        } else if (!locationBias?.enabled) {
          params.set("bias", "0");
        } else if (province) {
          params.set("province", province);
        }
        if (lat !== undefined && lng !== undefined) {
          const r = await fetch(`/api/geocode?${params}`);
          const d = await r.json();
          if (d.formatted) return d as { formatted: string; lat: number; lng: number };
          return { formatted: addr, lat, lng };
        }
        const r = await fetch(`/api/geocode?${params}`);
        const d = await r.json();
        return d.formatted ? (d as { formatted: string; lat: number; lng: number }) : null;
      };

      Promise.all([
        geocodeAddr(trip.from, trip.fromLat, trip.fromLng),
        geocodeAddr(trip.to,   trip.toLat,   trip.toLng),
      ]).then(async ([fromGeo, toGeo]) => {
        // Step 2: calculate distance using resolved coords
        const distParams = new URLSearchParams({ from: trip.from, to: trip.to });
        if (fromGeo) { distParams.set("fromLat", String(fromGeo.lat)); distParams.set("fromLng", String(fromGeo.lng)); }
        if (toGeo)   { distParams.set("toLat",   String(toGeo.lat));   distParams.set("toLng",   String(toGeo.lng));   }

        const distRes  = await fetch(`/api/distance?${distParams}`);
        const data     = await distRes.json();

        if (data.km) {
          const calc     = data.km as number;
          const imported = trip.kmImported;
          const flagged  = imported && imported > 0
            ? Math.abs(calc - imported) / imported > 0.2
              ? { imported, calculated: calc, pct: Math.round(Math.abs(calc - imported) / imported * 100) }
              : undefined
            : undefined;
          updateMileage(trip.id, {
            km: calc,
            kmPending: false,
            kmWarning: undefined,
            kmFlagged: flagged,
            ...(fromGeo ? { from: fromGeo.formatted, fromLat: fromGeo.lat, fromLng: fromGeo.lng } : {}),
            ...(toGeo   ? { to:   toGeo.formatted,   toLat:   toGeo.lat,   toLng:   toGeo.lng   } : {}),
          });
        } else {
          updateMileage(trip.id, {
            km: trip.kmImported ?? 0,
            kmPending: false,
            kmWarning: "Could not calculate distance — address may not be recognized",
            ...(fromGeo ? { from: fromGeo.formatted, fromLat: fromGeo.lat, fromLng: fromGeo.lng } : {}),
            ...(toGeo   ? { to:   toGeo.formatted,   toLat:   toGeo.lat,   toLng:   toGeo.lng   } : {}),
          });
        }
        resolvingRef.current.delete(trip.id);
        setTrips(getMileage());
      })
        .catch(() => {
          updateMileage(trip.id, {
            km: trip.kmImported ?? 0,
            kmPending: false,
            kmWarning: "Distance calculation failed — check addresses",
          });
          resolvingRef.current.delete(trip.id);
          setTrips(getMileage());
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips]);

  // ── Computed ──

  const availableYears = [...new Set(trips.map((t) => parseInt(t.date.slice(0, 4))))].filter(Boolean).sort((a, b) => b - a);

  const yearTrips   = year === 0 ? trips : trips.filter((t) => t.date.startsWith(String(year)));
  const businessKm  = yearTrips.reduce((s, t) => s + t.km, 0);
  const totalKm     = odometer.endKm && odometer.startKm ? odometer.endKm - odometer.startKm : 0;
  const businessPct = totalKm > 0 ? (businessKm / totalKm) * 100 : null;
  const deduction   = calcMileageDeduction(businessKm);
  const lastEnd     = [...yearTrips].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.endMileage;

  // Filtered trips
  const filtered = yearTrips
    .filter((t) => {
      const q = search.toLowerCase();
      if (q && !`${t.from} ${t.to} ${t.purpose} ${t.notes ?? ""}`.toLowerCase().includes(q)) return false;
      if (filterFrom && !t.from.toLowerCase().includes(filterFrom.toLowerCase())) return false;
      if (filterTo   && !t.to.toLowerCase().includes(filterTo.toLowerCase()))   return false;
      return true;
    })
    .sort((a, b) => {
      // Keep group legs together always
      if (a.groupId && a.groupId === b.groupId) return (a.legOrder ?? 0) - (b.legOrder ?? 0);
      const dir = mileSortDir === "asc" ? 1 : -1;
      if (mileSort === "km")      return dir * (a.km - b.km);
      if (mileSort === "purpose") return dir * (a.purpose ?? "").localeCompare(b.purpose ?? "");
      // default: date
      return dir * a.date.localeCompare(b.date) || ((a.legOrder ?? 0) - (b.legOrder ?? 0));
    });

  // Group for display
  const displayGroups = useMemo(() => {
    const result: Array<{ key: string; legs: MileageTrip[]; isGroup: boolean }> = [];
    const seen = new Set<string>();
    for (const trip of filtered) {
      if (trip.groupId) {
        if (seen.has(trip.groupId)) continue;
        seen.add(trip.groupId);
        const legs = filtered
          .filter((t) => t.groupId === trip.groupId)
          .sort((a, b) => (a.legOrder ?? 0) - (b.legOrder ?? 0));
        result.push({ key: trip.groupId, legs, isGroup: true });
      } else {
        result.push({ key: trip.id, legs: [trip], isGroup: false });
      }
    }
    return result;
  }, [filtered]);

  // ── Office ──

  function saveOffice() {
    if (!officeDraft.address.trim()) return;
    const loc: OfficeLocation = {
      label:   officeDraft.label.trim() || "Home Office",
      address: officeDraft.address.trim(),
    };
    saveOfficeLocation(loc);
    setOffice(loc);
    setOfficeEdit(false);
  }

  // ── Odometer ──

  function saveOdometerEdit() {
    const rec = { year, startKm: parseFloat(odomDraft.startKm) || 0, endKm: parseFloat(odomDraft.endKm) || 0 };
    saveOdometer(rec);
    setOdometer(rec);
    setOdomEdit(false);
  }

  // ── Form helpers ──

  function openAdd() {
    const offAddr = office?.address ?? "";
    const l1 = newLeg();
    l1.from = offAddr;
    const l2 = newLeg();
    l2.to = offAddr;
    setDraft({ date: TODAY, legs: [l1, l2], purpose: "", notes: "", startMileage: lastEnd ? String(lastEnd) : "" });
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(trip: MileageTrip) {
    const l = newLeg();
    l.from = trip.from; l.to = trip.to;
    setDraft({ date: trip.date, legs: [l], purpose: trip.purpose, notes: trip.notes ?? "", startMileage: String(trip.startMileage ?? "") });
    setEditId(trip.id);
    setShowForm(true);
  }

  // Update a specific leg field; auto-propagate adjacency
  function setLeg(idx: number, field: "from" | "to", value: string) {
    setDraft((prev) => {
      const legs = prev.legs.map((l) => ({ ...l }));
      legs[idx][field] = value;

      // When "to" changes, auto-fill next leg's "from" (unless it was manually set)
      if (field === "to" && idx < legs.length - 1) {
        legs[idx + 1].from = value;
      }
      // When "from" changes on first leg, don't cascade (office address)
      return { ...prev, legs };
    });
  }

  function addStop() {
    setDraft((prev) => {
      const legs = prev.legs.map((l) => ({ ...l }));
      // Insert before the last leg (which is the "return" leg)
      const lastTo = prev.legs.length >= 2 ? prev.legs[prev.legs.length - 2].to : "";
      const newL = newLeg();
      newL.from = lastTo;
      legs.splice(legs.length - 1, 0, newL);
      return { ...prev, legs };
    });
  }

  function removeLeg(idx: number) {
    setDraft((prev) => {
      if (prev.legs.length <= 1) return prev;
      const legs = prev.legs.filter((_, i) => i !== idx).map((l) => ({ ...l }));
      // Re-propagate adjacency after removal
      for (let i = 1; i < legs.length; i++) {
        legs[i].from = legs[i - 1].to;
      }
      return { ...prev, legs };
    });
  }

  // AI purpose suggestion — auto-triggers when addresses are filled
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function triggerAI(legs: Leg[], currentPurpose: string) {
    if (currentPurpose.trim()) return; // don't overwrite
    const stops = legs.map((l) => l.to).filter(Boolean);
    if (!stops.length || !legs[0].from) return;
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(async () => {
      setAiLoading(true);
      try {
        const from = legs[0].from;
        const to   = stops[0];
        const res  = await fetch("/api/suggest-purpose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from, to }),
        });
        const data = await res.json();
        if (data.purpose) {
          setDraft((d) => d.purpose ? d : { ...d, purpose: data.purpose });
        }
      } catch { /* silent */ }
      setAiLoading(false);
    }, 800);
  }

  function handleLegSelect(idx: number, field: "from" | "to", place: PlaceResult) {
    setDraft((prev) => {
      const legs = prev.legs.map((l) => ({ ...l }));
      legs[idx][field] = place.label;
      if (field === "from") {
        legs[idx].fromLat = place.lat;
        legs[idx].fromLng = place.lng;
      } else {
        legs[idx].toLat = place.lat;
        legs[idx].toLng = place.lng;
        if (idx < legs.length - 1) {
          legs[idx + 1].from    = place.label;
          legs[idx + 1].fromLat = place.lat;
          legs[idx + 1].fromLng = place.lng;
        }
      }
      triggerAI(legs, prev.purpose);
      return { ...prev, legs };
    });

    // resolve coordinates in background if place_id present but no coords yet
    if (place.place_id && place.lat === undefined) {
      resolvePlaceDetails(place).then((resolved) => {
        if (resolved.lat === undefined) return;
        setDraft((prev) => {
          const legs = prev.legs.map((l) => ({ ...l }));
          if (field === "from") {
            legs[idx].fromLat = resolved.lat;
            legs[idx].fromLng = resolved.lng;
          } else {
            legs[idx].toLat = resolved.lat;
            legs[idx].toLng = resolved.lng;
            if (idx < legs.length - 1) {
              legs[idx + 1].fromLat = resolved.lat;
              legs[idx + 1].fromLng = resolved.lng;
            }
          }
          return { ...prev, legs };
        });
      });
    }
  }

  // ── Save trip ──

  async function fetchDistance(leg: Leg): Promise<{ km: number; from?: string; to?: string; fromLat?: number; fromLng?: number; toLat?: number; toLng?: number }> {
    try {
      const p = new URLSearchParams({ from: leg.from, to: leg.to });
      if (leg.fromLat !== undefined) { p.set("fromLat", String(leg.fromLat)); p.set("fromLng", String(leg.fromLng)); }
      if (leg.toLat   !== undefined) { p.set("toLat",   String(leg.toLat));   p.set("toLng",   String(leg.toLng));   }
      const res  = await fetch(`/api/distance?${p}`);
      const data = await res.json();
      return {
        km:      data.km ?? 0,
        from:    data.fromFormatted ?? undefined,
        to:      data.toFormatted   ?? undefined,
        fromLat: data.fromLat       ?? undefined,
        fromLng: data.fromLng       ?? undefined,
        toLat:   data.toLat         ?? undefined,
        toLng:   data.toLng         ?? undefined,
      };
    } catch { return { km: 0 }; }
  }

  async function saveTrip() {
    const validLegs = draft.legs.filter((l) => l.from && l.to);
    if (!validLegs.length || !draft.date) return;

    if (editId) {
      if (!window.confirm("Save changes to this trip?")) return;
      const l = validLegs[0];
      setShowForm(false);
      const dist = await fetchDistance(l);
      updateMileage(editId, {
        date:    draft.date,
        from:    dist.from    ?? l.from,
        to:      dist.to      ?? l.to,
        fromLat: dist.fromLat ?? l.fromLat,
        fromLng: dist.fromLng ?? l.fromLng,
        toLat:   dist.toLat   ?? l.toLat,
        toLng:   dist.toLng   ?? l.toLng,
        purpose: draft.purpose,
        notes:   draft.notes || undefined,
        km:      dist.km,
        kmPending: false,
      });
      setTrips(getMileage());
      return;
    }

    // Fetch all leg distances in parallel, close modal immediately
    const groupId  = validLegs.length > 1 ? crypto.randomUUID() : undefined;
    const startMil = parseFloat(draft.startMileage) || undefined;
    const ids      = validLegs.map(() => crypto.randomUUID());

    // Save with kmPending, close modal right away so user isn't waiting
    for (let i = 0; i < validLegs.length; i++) {
      const l = validLegs[i];
      addMileage({
        id: ids[i],
        date: draft.date,
        from: l.from,
        to:   l.to,
        fromLat: l.fromLat,
        fromLng: l.fromLng,
        toLat:   l.toLat,
        toLng:   l.toLng,
        purpose: draft.purpose,
        notes:   draft.notes || undefined,
        km: 0,
        kmPending: true,
        startMileage: i === 0 ? startMil : undefined,
        roundTrip: false,
        groupId,
        legOrder: groupId ? i : undefined,
      });
    }
    setTrips(getMileage());
    setShowForm(false);

    // Resolve all distances in parallel immediately (don't wait for useEffect)
    const distances = await Promise.all(validLegs.map(fetchDistance));
    for (let i = 0; i < ids.length; i++) {
      updateMileage(ids[i], { km: distances[i].km, kmPending: false });
    }
    setTrips(getMileage());
  }

  function del(id: string) {
    if (!window.confirm("Delete this trip? This cannot be undone.")) return;
    deleteMileage(id);
    setTrips(getMileage());
  }

  function delGroup(groupId: string) {
    const count = trips.filter((t) => t.groupId === groupId).length;
    if (!window.confirm(`Delete this trip (${count} leg${count !== 1 ? "s" : ""})? This cannot be undone.`)) return;
    trips.filter((t) => t.groupId === groupId).forEach((t) => deleteMileage(t.id));
    setTrips(getMileage());
  }

  // ── Import ──

  async function handleImportFile(file: File) {
    setImporting(true);
    setImportResult(null);
    const { trips: imported, warnings } = await importMileageSheet(file, office?.address, office?.label);
    const count   = bulkAddMileage(imported);
    const skipped = imported.length - count;
    setTrips(getMileage());
    setImportResult({ count, skipped, warnings });
    setImporting(false);
    if (imported.length > 0) {
      const yearCounts: Record<string, number> = {};
      for (const t of imported) {
        const y = t.date?.slice(0, 4);
        if (y && y.length === 4) yearCounts[y] = (yearCounts[y] ?? 0) + 1;
      }
      const bestYear = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (bestYear && parseInt(bestYear) !== year) {
        const yr = parseInt(bestYear);
        setYear(yr);
        const od = getOdometerForYear(yr);
        setOdometer(od ?? {});
        setOdomDraft({ startKm: String(od?.startKm ?? ""), endKm: String(od?.endKm ?? "") });
      }
    }
  }

  // ── Selection helpers ──

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectGroup(ids: string[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  const allVisibleIds = filtered.map((t) => t.id);
  const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  }

  function deleteSelected() {
    if (!window.confirm(`Delete ${selectedIds.size} selected trip${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    [...selectedIds].forEach((id) => deleteMileage(id));
    setSelectedIds(new Set());
    setTrips(getMileage());
  }

  function applyBulkEdit() {
    if (!selInput.trim() || !selAction) return;
    [...selectedIds].forEach((id) => {
      updateMileage(id, selAction === "purpose" ? { purpose: selInput } : { notes: selInput });
    });
    setTrips(getMileage());
    setSelAction(null);
    setSelInput("");
  }

  function recalcSelected() {
    [...selectedIds].forEach((id) => {
      updateMileage(id, { kmPending: true, km: 0, kmWarning: undefined });
    });
    setTrips(getMileage());
  }

  // ── Discrepancy helpers ──

  function resolveFlag(id: string, keep: "calculated" | "imported" | "manual", manualKm?: number) {
    const trip = trips.find((t) => t.id === id);
    if (!trip?.kmFlagged) return;
    const km = keep === "calculated"
      ? trip.kmFlagged.calculated
      : keep === "imported"
        ? trip.kmFlagged.imported
        : (manualKm ?? trip.km);
    updateMileage(id, { km, kmFlagged: { ...trip.kmFlagged, resolved: true } });
    setTrips(getMileage());
  }

  function dismissFlag(id: string) {
    const trip = trips.find((t) => t.id === id);
    if (!trip?.kmFlagged) return;
    updateMileage(id, { kmFlagged: { ...trip.kmFlagged, resolved: true } });
    setTrips(getMileage());
  }

  // ── AI chat ──

  function handleAiAction(action: {
    type: string;
    target?: string;
    updates?: { purpose?: string; notes?: string; from?: string; to?: string };
    dateTransform?: { op: string; value: string };
    skipRecalculate?: boolean;
    match?: Record<string, string>;
    // resolve_label
    label?: string;
    resolvedAddress?: string;
    search?: string;
    ids?: string[];
    // delete_trips
    deleteIds?: string[];
    // create_trip / merge_trips
    legs?: Array<{ from: string; to: string; date: string; purpose?: string; notes?: string; km?: number }>;
    // single create
    from?: string; to?: string; date?: string; purpose?: string; notes?: string; km?: number;
  } | null): string {
    if (!action) return "";

    if (action.type === "bulk_update") {
      let targetIds: string[];
      if (action.target === "selected") {
        targetIds = [...selectedIds];
      } else if (action.target === "filtered") {
        targetIds = filtered.map((t) => t.id);
      } else {
        targetIds = trips.map((t) => t.id);
      }
      // Optionally filter to only trips matching certain field values (e.g. match: { from: "PA Office" })
      if (action.match) {
        targetIds = targetIds.filter((id) => {
          const t = trips.find((x) => x.id === id);
          if (!t) return false;
          return Object.entries(action.match!).every(([k, v]) =>
            (t as Record<string, unknown>)[k]?.toString().toLowerCase() === (v as string).toLowerCase()
          );
        });
      }
      for (const id of targetIds) {
        const trip = trips.find((t) => t.id === id);
        if (!trip) continue;
        const patch: Partial<MileageTrip> = {};
        if (action.dateTransform?.op === "set_year") {
          const newYear = action.dateTransform.value;
          if (trip.date?.match(/^\d{4}/)) {
            patch.date = trip.date.replace(/^\d{4}/, newYear);
          }
        }
        if (action.updates?.purpose !== undefined) patch.purpose = action.updates.purpose;
        if (action.updates?.notes !== undefined) patch.notes = action.updates.notes || undefined;
        if (action.updates?.from !== undefined) patch.from = action.updates.from;
        if (action.updates?.to !== undefined) patch.to = action.updates.to;
        if ((action.updates?.from !== undefined || action.updates?.to !== undefined) && !action.skipRecalculate) patch.kmPending = true;
        updateMileage(id, patch);
      }
      setTrips(getMileage());
      return `Updated ${targetIds.length} trip${targetIds.length !== 1 ? "s" : ""}`;

    } else if (action.type === "resolve_label") {
      // Replace an ambiguous label in both from and to fields, then recalculate km
      if (!action.label || !action.resolvedAddress) return "Missing label or resolvedAddress";
      const norm = (s: string) => s.toLowerCase().trim();
      const matchLabel = norm(action.label);
      let count = 0;
      for (const trip of trips) {
        const patch: Partial<MileageTrip> = {};
        if (norm(trip.from) === matchLabel) { patch.from = action.resolvedAddress; patch.kmPending = true; }
        if (norm(trip.to)   === matchLabel) { patch.to   = action.resolvedAddress; patch.kmPending = true; }
        if (Object.keys(patch).length > 0) { updateMileage(trip.id, patch); count++; }
      }
      setTrips(getMileage());
      return `Replaced "${action.label}" with "${action.resolvedAddress}" in ${count} trip${count !== 1 ? "s" : ""} — recalculating distances`;

    } else if (action.type === "group_round_trips") {
      // Get the target pool
      const pool = action.target === "selected"
        ? trips.filter((t) => selectedIds.has(t.id) && !t.groupId)
        : trips.filter((t) => !t.groupId);

      // Group by date
      const byDay: Record<string, MileageTrip[]> = {};
      for (const t of pool) {
        const day = t.date.slice(0, 10);
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(t);
      }

      for (const dayTrips of Object.values(byDay)) {
        if (dayTrips.length < 2) continue;

        // Build lookup: normalize(from) → trips starting here
        const norm = (s: string) => s.toLowerCase().trim();
        const fromMap = new Map<string, MileageTrip[]>();
        for (const t of dayTrips) {
          const key = norm(t.from);
          if (!fromMap.has(key)) fromMap.set(key, []);
          fromMap.get(key)!.push(t);
        }

        // Find chain starts: trips whose origin is NOT the destination of any other trip this day
        const allDestinations = new Set(dayTrips.map((t) => norm(t.to)));
        const used = new Set<string>();

        const starts = dayTrips.filter((t) => !allDestinations.has(norm(t.from)));
        // If no clear start (circular), just use all as potential starts
        const queue = starts.length > 0 ? starts : dayTrips;

        for (const start of queue) {
          if (used.has(start.id)) continue;
          const chain: MileageTrip[] = [start];
          used.add(start.id);
          let current = start;

          while (true) {
            const nextKey = norm(current.to);
            const candidates = (fromMap.get(nextKey) ?? []).filter((t) => !used.has(t.id));
            if (!candidates.length) break;
            const next = candidates[0];
            chain.push(next);
            used.add(next.id);
            current = next;
          }

          if (chain.length >= 2) {
            const groupId = crypto.randomUUID();
            chain.forEach((t, i) => updateMileage(t.id, { groupId, legOrder: i }));
          }
        }
      }
      setTrips(getMileage());

    } else if (action.type === "ungroup_trips") {
      const pool = action.target === "selected"
        ? trips.filter((t) => selectedIds.has(t.id))
        : trips;

      for (const t of pool) {
        if (t.groupId) {
          updateMileage(t.id, { groupId: undefined, legOrder: undefined });
        }
      }
      setTrips(getMileage());

    } else if (action.type === "resolve_addresses" || action.type === "resolve_and_group") {
      // Determine pool: trips that lack GPS coords (imported as plain text)
      const allTrips = getMileage();
      let pool: MileageTrip[];
      if (action.target === "selected") {
        pool = allTrips.filter((t) => selectedIds.has(t.id));
      } else if (action.target === "all") {
        pool = allTrips;
      } else {
        // "unresolved" = no coords
        pool = allTrips.filter((t) => t.fromLat === undefined || t.toLat === undefined);
      }

      // Substitute known office label with the real saved address
      const officeLabel  = office?.label?.toLowerCase() ?? "home office";
      const officeAddr   = office?.address ?? "";

      for (const t of pool) {
        const patch: Partial<MileageTrip> = { kmPending: true, km: 0 };
        // Replace label with real address so geocoding succeeds
        if (officeAddr) {
          if (
            t.from.toLowerCase() === officeLabel ||
            t.from.toLowerCase() === "home office" ||
            t.from.toLowerCase() === "office"
          ) {
            patch.from = officeAddr;
            patch.fromLat = undefined;
            patch.fromLng = undefined;
          }
          if (
            t.to.toLowerCase() === officeLabel ||
            t.to.toLowerCase() === "home office" ||
            t.to.toLowerCase() === "office"
          ) {
            patch.to = officeAddr;
            patch.toLat = undefined;
            patch.toLng = undefined;
          }
        }
        updateMileage(t.id, patch);
      }
      setTrips(getMileage());

      // helper: chain trips into groups
      function chainAndGroup(pool2: MileageTrip[]) {
        const norm2 = (s: string) => s.toLowerCase().trim();
        const byDay2: Record<string, MileageTrip[]> = {};
        for (const t of pool2) {
          const day = t.date.slice(0, 10);
          if (!byDay2[day]) byDay2[day] = [];
          byDay2[day].push(t);
        }
        let grouped = 0;
        for (const dayTrips of Object.values(byDay2)) {
          if (dayTrips.length < 2) continue;
          const fromMap2 = new Map<string, MileageTrip[]>();
          for (const t of dayTrips) {
            const key = norm2(t.from);
            if (!fromMap2.has(key)) fromMap2.set(key, []);
            fromMap2.get(key)!.push(t);
          }
          const allDests2 = new Set(dayTrips.map((t) => norm2(t.to)));
          const starts2   = dayTrips.filter((t) => !allDests2.has(norm2(t.from)));
          const queue2    = starts2.length > 0 ? starts2 : dayTrips;
          const used2     = new Set<string>();
          for (const start of queue2) {
            if (used2.has(start.id)) continue;
            const chain: MileageTrip[] = [start];
            used2.add(start.id);
            let cur = start;
            while (true) {
              const cands = (fromMap2.get(norm2(cur.to)) ?? []).filter((t) => !used2.has(t.id));
              if (!cands.length) break;
              chain.push(cands[0]);
              used2.add(cands[0].id);
              cur = cands[0];
            }
            if (chain.length >= 2) {
              const gid = crypto.randomUUID();
              chain.forEach((t, i) => updateMileage(t.id, { groupId: gid, legOrder: i }));
              grouped++;
            }
          }
        }
        return grouped;
      }

      const resolvedCount = pool.length;
      const groupedCount  = action.type === "resolve_and_group"
        ? chainAndGroup(getMileage().filter((t) => !t.groupId))
        : 0;
      setTrips(getMileage());
      return action.type === "resolve_and_group"
        ? `Resolving ${resolvedCount} trips · grouped ${groupedCount} chains`
        : `Resolving distances for ${resolvedCount} trips`;

    } else if (action.type === "delete_trips") {
      const ids = action.deleteIds ?? action.ids ?? [];
      for (const id of ids) deleteMileage(id);
      setTrips(getMileage());
      return `Deleted ${ids.length} trip${ids.length !== 1 ? "s" : ""}`;

    } else if (action.type === "create_trip" || action.type === "merge_trips") {
      // Delete any specified trips first
      for (const id of action.deleteIds ?? []) deleteMileage(id);

      // Build legs array — works for both create_trip (single) and merge_trips (multi-leg)
      const legsToCreate = action.legs ?? (action.from && action.to && action.date
        ? [{ from: action.from, to: action.to, date: action.date, purpose: action.purpose, notes: action.notes, km: action.km }]
        : []);

      if (legsToCreate.length > 0) {
        const groupId = legsToCreate.length > 1 ? crypto.randomUUID() : undefined;
        // Substitute office labels
        const officeAddr2  = office?.address ?? "";
        const officeLabel2 = office?.label?.toLowerCase() ?? "home office";
        const resolveAddr  = (addr: string) => {
          const a = addr.toLowerCase();
          if (officeAddr2 && (a === officeLabel2 || a === "home office" || a === "office")) return officeAddr2;
          return addr;
        };
        for (let i = 0; i < legsToCreate.length; i++) {
          const leg = legsToCreate[i];
          addMileage({
            id: crypto.randomUUID(),
            date: leg.date,
            from: resolveAddr(leg.from),
            to:   resolveAddr(leg.to),
            purpose: leg.purpose ?? "",
            notes:   leg.notes || undefined,
            km:      leg.km ?? 0,
            kmPending: !leg.km,
            roundTrip: false,
            groupId,
            legOrder: groupId ? i : undefined,
          });
        }
        setTrips(getMileage());
        const deleted = (action.deleteIds ?? []).length;
        return deleted > 0
          ? `Replaced ${deleted} trips → ${legsToCreate.length}-leg trip (calculating km…)`
          : `Created ${legsToCreate.length}-leg trip (calculating km…)`;
      }

    } else if (action.type === "group_round_trips") {
      const pool2 = action.target === "selected"
        ? trips.filter((t) => selectedIds.has(t.id) && !t.groupId)
        : trips.filter((t) => !t.groupId);
      const norm = (s: string) => s.toLowerCase().trim();
      const byDay: Record<string, MileageTrip[]> = {};
      for (const t of pool2) {
        const day = t.date.slice(0, 10);
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(t);
      }
      let grouped = 0;
      for (const dayTrips of Object.values(byDay)) {
        if (dayTrips.length < 2) continue;
        const fromMap = new Map<string, MileageTrip[]>();
        for (const t of dayTrips) {
          const key = norm(t.from);
          if (!fromMap.has(key)) fromMap.set(key, []);
          fromMap.get(key)!.push(t);
        }
        const allDests = new Set(dayTrips.map((t) => norm(t.to)));
        const starts   = dayTrips.filter((t) => !allDests.has(norm(t.from)));
        const queue    = starts.length > 0 ? starts : dayTrips;
        const used     = new Set<string>();
        for (const start of queue) {
          if (used.has(start.id)) continue;
          const chain: MileageTrip[] = [start];
          used.add(start.id);
          let cur = start;
          while (true) {
            const cands = (fromMap.get(norm(cur.to)) ?? []).filter((t) => !used.has(t.id));
            if (!cands.length) break;
            chain.push(cands[0]);
            used.add(cands[0].id);
            cur = cands[0];
          }
          if (chain.length >= 2) {
            const gid = crypto.randomUUID();
            chain.forEach((t, i) => updateMileage(t.id, { groupId: gid, legOrder: i }));
            grouped++;
          }
        }
      }
      setTrips(getMileage());
      return `Grouped ${grouped} chain${grouped !== 1 ? "s" : ""} into multi-stop trips`;

    } else if (action.type === "ungroup_trips") {
      const pool2 = action.target === "selected" ? trips.filter((t) => selectedIds.has(t.id)) : trips;
      let count = 0;
      for (const t of pool2) {
        if (t.groupId) { updateMileage(t.id, { groupId: undefined, legOrder: undefined }); count++; }
      }
      setTrips(getMileage());
      return `Ungrouped ${count} trip${count !== 1 ? "s" : ""}`;

    } else if (action.type === "filter") {
      if (action.search !== undefined) setSearch(action.search);
      return `Filtered: "${action.search}"`;
    } else if (action.type === "highlight") {
      setHighlightIds(new Set(action.ids ?? []));
      return `Highlighted ${(action.ids ?? []).length} trips`;
    } else if (action.type === "clear") {
      setSearch(""); setFilterFrom(""); setFilterTo("");
      setHighlightIds(new Set()); setSelectedIds(new Set());
      return "Cleared filters and selection";
    }
    return "";
  }

  async function sendChat(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const q = chatInput.trim();
    if (!q || chatLoading) return;
    const userMsg = { role: "user" as const, content: q };
    const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);
    setChatElapsed(0);

    // Live elapsed timer — like Claude Code's orange timer
    const startMs = Date.now();
    chatTimerRef.current = setInterval(() => setChatElapsed(Date.now() - startMs), 100);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const res  = await fetch("/api/mileage-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, trips, selectedIds: [...selectedIds], history, officeAddress: office?.address ?? "" }),
      });
      const data = await res.json();
      const elapsed = Date.now() - startMs;
      if (chatTimerRef.current) clearInterval(chatTimerRef.current);

      // Support both single action and actions array
      const actionsToRun = data.actions ?? (data.action ? [data.action] : []);
      const summaries = actionsToRun.map((a: Parameters<typeof handleAiAction>[0]) => handleAiAction(a)).filter(Boolean);
      const actionSummary = summaries.join(" · ") || undefined;

      setChatMessages((prev) => [...prev, {
        role: "assistant",
        content: data.answer && data.answer.trim() ? data.answer : "I'm unable to do that — please update it manually.",
        elapsed,
        tokens: data._usage?.total_tokens,
        actionSummary: actionSummary || undefined,
      }]);
    } catch {
      if (chatTimerRef.current) clearInterval(chatTimerRef.current);
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Try again." }]);
    }
    setChatLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const pendingCount  = yearTrips.filter((t) => t.kmPending).length;
  const flaggedTrips  = trips.filter((t) => t.kmFlagged && !t.kmFlagged.resolved);

  return (
    <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Mileage Log</h1>
            <PageHelp content={PAGE_HELP.mileage} />
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            CRA vehicle logbook · Track business use % to claim motor vehicle expenses
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            <option value={0}>All Years</option>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => { if (fileRef.current) fileRef.current.value = ""; fileRef.current?.click(); }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {importing ? "Importing…" : "Import Spreadsheet"}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }} />
<button onClick={openAdd} className="px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>
            + Log Trip
          </button>
        </div>
      </div>

      {/* Pending background calc banner */}
      {pendingCount > 0 && (
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-3 text-sm"
          style={{ backgroundColor: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <span style={{ color: "var(--text-primary)" }}>
            Calculating distances for {pendingCount} leg{pendingCount > 1 ? "s" : ""} in the background…
          </span>
        </div>
      )}

      {/* Discrepancy review banner */}
      {flaggedTrips.length > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-4"
          style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)" }}>
          <div className="flex items-start gap-3">
            <span className="text-base flex-shrink-0" style={{ marginTop: 1 }}>⚠</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {flaggedTrips.length} trip{flaggedTrips.length !== 1 ? "s" : ""} flagged — distance mismatch
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Google Maps calculated a distance more than 20% different from what was in your spreadsheet. Review and confirm which is correct.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowFlagReview(true)}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold flex-shrink-0"
            style={{ backgroundColor: "#f59e0b", color: "#000" }}>
            Review {flaggedTrips.length}
          </button>
        </div>
      )}

      {/* Office */}
      {!office && !officeEdit ? (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-sm"
          style={{ backgroundColor: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)" }}>
          <div>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Set your office address</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Auto-fills &ldquo;From&rdquo; on every trip and sets the return destination.
            </p>
          </div>
          <button onClick={() => setOfficeEdit(true)} className="px-4 py-1.5 rounded-lg text-sm font-medium flex-shrink-0"
            style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>
            Set office
          </button>
        </div>
      ) : office && !officeEdit ? (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-sm"
          style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 16 }}>🏢</span>
            <div>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Default Office</p>
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{office.label}</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{office.address}</p>
            </div>
          </div>
          <button onClick={() => setOfficeEdit(true)} className="px-3 py-1 rounded-lg text-xs"
            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            Edit
          </button>
        </div>
      ) : null}

      {officeEdit && (
        <div className="rounded-xl p-4 flex flex-col gap-3"
          style={{ backgroundColor: "var(--bg-surface)", border: "1px solid rgba(59,130,246,0.35)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Office Location</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Label</label>
              <input value={officeDraft.label} onChange={(e) => setOfficeDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="Home Office" className="rounded-lg px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            </div>
            <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Full Address</label>
              <AddressInput
                value={officeDraft.address}
                onChange={(v) => setOfficeDraft((d) => ({ ...d, address: v }))}
                onSelect={(p) => setOfficeDraft((d) => ({ ...d, address: p.label }))}
                placeholder="123 Main St, Toronto, ON"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setOfficeEdit(false)} className="px-4 py-1.5 rounded-lg text-sm"
              style={{ color: "var(--text-secondary)" }}>Cancel</button>
            <button onClick={saveOffice} className="px-5 py-1.5 rounded-lg text-sm font-medium"
              style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>Save</button>
          </div>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className="rounded-xl px-4 py-3 flex items-start justify-between gap-3 text-sm"
          style={{
            backgroundColor: importResult.warnings.length ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)",
            border: `1px solid ${importResult.warnings.length ? "rgba(245,158,11,0.25)" : "rgba(16,185,129,0.25)"}`,
          }}>
          <div className="flex flex-col gap-1">
            <p style={{ color: "var(--text-primary)", fontWeight: 600 }}>
              Import complete — {importResult.count} trips added{importResult.skipped > 0 ? `, ${importResult.skipped} duplicates skipped` : ""}
            </p>
            {importResult.count === 0 && importResult.skipped > 0 && (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>All trips already exist — use the year selector to view them.</p>
            )}
            {importResult.warnings.map((w, i) => <p key={i} className="text-xs" style={{ color: "#f59e0b" }}>{w}</p>)}
          </div>
          <button onClick={() => setImportResult(null)} style={{ color: "var(--text-secondary)", flexShrink: 0 }}>✕</button>
        </div>
      )}

      {/* Business Use % */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "2px solid var(--accent-blue)", backgroundColor: "var(--bg-surface)" }}>
        <div className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--accent-blue)", letterSpacing: "0.1em" }}>
              Business Use Percentage{year !== 0 ? ` — ${year}` : " — All Years"}
            </p>
            <div className="flex items-end gap-3 mt-1">
              <p className="text-5xl font-black" style={{ color: businessPct !== null ? "var(--accent-blue)" : "var(--text-secondary)", lineHeight: 1 }}>
                {businessPct !== null ? `${businessPct.toFixed(1)}%` : "—"}
              </p>
              {businessPct !== null && <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>of your vehicle use was for business</p>}
            </div>
            {businessPct !== null ? (
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                Apply this % to all motor vehicle expenses (fuel, insurance, repairs, lease) when filing your T2.
              </p>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Enter your annual odometer readings to calculate your CRA business-use %.</p>
            )}
          </div>
          {year !== 0 && <div className="flex flex-col gap-2 min-w-[280px]">
            <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Annual Odometer Readings</p>
            {odomEdit ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  {[["startKm", `Jan 1, ${year}`], ["endKm", `Dec 31, ${year}`]].map(([k, lbl]) => (
                    <div key={k} className="flex flex-col gap-1 flex-1">
                      <label className="text-xs" style={{ color: "var(--text-secondary)" }}>{lbl} (km)</label>
                      <input type="number" value={(odomDraft as Record<string,string>)[k]}
                        onChange={(e) => setOdomDraft((d) => ({ ...d, [k]: e.target.value }))}
                        placeholder="e.g. 95000" className="rounded-lg px-3 py-2 text-sm outline-none"
                        style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={saveOdometerEdit} className="flex-1 py-1.5 rounded-lg text-sm font-medium"
                    style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>Save</button>
                  <button onClick={() => setOdomEdit(false)} className="px-3 py-1.5 rounded-lg text-sm"
                    style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 items-center">
                <div className="flex gap-4 text-sm">
                  {[["Jan 1", odometer.startKm], ["Dec 31", odometer.endKm], ["Total KM", totalKm || null]].map(([lbl, val]) => (
                    <div key={String(lbl)}>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{lbl}</p>
                      <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        {val ? Number(val).toLocaleString() + " km" : "—"}
                      </p>
                    </div>
                  ))}
                </div>
                <button onClick={() => setOdomEdit(true)} className="px-3 py-1.5 rounded-lg text-xs ml-auto"
                  style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                  {odometer.startKm ? "Edit" : "Set readings"}
                </button>
              </div>
            )}
          </div>}
        </div>
        {businessPct !== null && year !== 0 && (
          <div className="px-5 pb-4">
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-elevated)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(businessPct, 100)}%`, backgroundColor: "var(--accent-blue)" }} />
            </div>
            <div className="flex justify-between text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
              <span>{businessKm.toLocaleString()} km business</span>
              <span>{(totalKm - businessKm).toLocaleString()} km personal</span>
            </div>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Business Trips" value={String(yearTrips.filter((t) => !t.groupId || t.legOrder === 0).length)} color="var(--text-primary)" />
        <StatCard label="Business KM" value={`${businessKm.toLocaleString()} km`} color="var(--accent-blue)" />
        <StatCard label="CRA Deduction" value={fmt(deduction)} color="#10b981"
          note={businessKm > 5000 ? `5,000×$0.70 + ${(businessKm-5000).toLocaleString()}×$0.64` : `${businessKm}×$0.70`} />
        {businessPct !== null && (
          <StatCard label="Motor Vehicle Deductible" value={`${businessPct.toFixed(1)}%`} color="#a855f7" note="Apply to fuel, insurance, repairs" />
        )}
      </div>

      {/* Trip log */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap"
          style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Trip Log — {year === 0 ? "All Years" : year}</p>
          <div className="flex items-center gap-2 flex-1 min-w-0 max-w-2xl">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search trips…"
              className="rounded-lg px-3 py-1.5 text-sm outline-none flex-1 min-w-0"
              style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            <input value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} placeholder="Filter: From"
              className="rounded-lg px-3 py-1.5 text-sm outline-none w-28"
              style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            <input value={filterTo} onChange={(e) => setFilterTo(e.target.value)} placeholder="Filter: To"
              className="rounded-lg px-3 py-1.5 text-sm outline-none w-28"
              style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            <select
              value={mileSort ? `${mileSort}-${mileSortDir}` : "date-desc"}
              onChange={(e) => {
                const [field, dir] = e.target.value.split("-") as ["date"|"km"|"purpose", "asc"|"desc"];
                setMileSort(field);
                setMileSortDir(dir);
              }}
              className="rounded-lg px-2 py-1.5 text-xs outline-none"
              style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: "pointer" }}
              title="Sort (Alt+D / Alt+K / Alt+P)"
            >
              <option value="date-desc">Date: Newest</option>
              <option value="date-asc">Date: Oldest</option>
              <option value="km-desc">KM: High → Low</option>
              <option value="km-asc">KM: Low → High</option>
              <option value="purpose-asc">Purpose: A → Z</option>
              <option value="purpose-desc">Purpose: Z → A</option>
            </select>
          </div>
          <p className="text-sm font-bold" style={{ color: "var(--accent-blue)" }}>{businessKm.toLocaleString()} km</p>
        </div>

        {displayGroups.length === 0 ? (
          <div className="px-5 py-12 text-center flex flex-col items-center gap-3" style={{ backgroundColor: "var(--bg-base)" }}>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {yearTrips.length === 0 ? (year === 0 ? "No trips logged yet." : `No trips logged for ${year}.`) : "No trips match your filters."}
            </p>
            {yearTrips.length === 0 && (
              <div className="flex gap-2">
                <button onClick={() => { if (fileRef.current) fileRef.current.value = ""; fileRef.current?.click(); }}
                  className="text-sm px-4 py-2 rounded-lg"
                  style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                  Import from spreadsheet
                </button>
                <button onClick={openAdd} className="text-sm px-4 py-2 rounded-lg"
                  style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>+ Log trip</button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ backgroundColor: "var(--bg-base)" }}>

          {/* ── Selection toolbar ── */}
          {selectedIds.size > 0 && (
            <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap"
              style={{ backgroundColor: "rgba(59,130,246,0.07)", borderBottom: "1px solid rgba(59,130,246,0.2)" }}>
              <span className="text-xs font-semibold" style={{ color: "var(--accent-blue)" }}>
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-1.5 flex-wrap ml-1">
                {/* Inline edit fields */}
                {selAction ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={selInput}
                      onChange={(e) => setSelInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") applyBulkEdit(); if (e.key === "Escape") { setSelAction(null); setSelInput(""); } }}
                      placeholder={selAction === "purpose" ? "Business purpose…" : "Notes…"}
                      className="rounded-lg px-2.5 py-1 text-xs outline-none w-52"
                      style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--accent-blue)", color: "var(--text-primary)" }}
                    />
                    <button onClick={applyBulkEdit} className="px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>Apply</button>
                    <button onClick={() => { setSelAction(null); setSelInput(""); }} className="px-2 py-1 rounded-lg text-xs"
                      style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>✕</button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => { setSelAction("purpose"); setSelInput(""); }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      Edit Purpose
                    </button>
                    <button onClick={() => { setSelAction("notes"); setSelInput(""); }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      Edit Notes
                    </button>
                    <button onClick={recalcSelected}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      Recalculate KM
                    </button>
                    <button onClick={() => { setChatOpen(true); setChatMinimized(false); }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "var(--accent-blue)" }}>
                      Ask AI ({selectedIds.size})
                    </button>
                    <button onClick={deleteSelected}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }}>
                      Delete {selectedIds.size}
                    </button>
                    <button onClick={() => setSelectedIds(new Set())}
                      className="px-2 py-1 rounded text-xs ml-1" style={{ color: "var(--text-secondary)" }}>
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-3 py-2 w-8">
                    <div className="flex flex-col items-center gap-0.5">
                      {selectedIds.size > 0 && (
                        <button onClick={() => setSelectedIds(new Set())}
                          title="Deselect all"
                          className="text-xs leading-none"
                          style={{ color: "var(--text-secondary)", lineHeight: 1 }}>×</button>
                      )}
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll}
                        className="rounded" style={{ accentColor: "var(--accent-blue)", cursor: "pointer" }} />
                    </div>
                  </th>
                  {(["Date","From","To","KM","Business Purpose","Notes",""] as const).map((h) => {
                    const sortKey = h === "Date" ? "date" : h === "KM" ? "km" : h === "Business Purpose" ? "purpose" : null;
                    const isActive = sortKey && mileSort === sortKey;
                    return (
                      <th key={h}
                        className={`px-4 py-2 font-medium ${h === "KM" ? "text-right" : "text-left"} ${sortKey ? "cursor-pointer select-none" : ""}`}
                        style={{ color: isActive ? "var(--accent-blue)" : "var(--text-secondary)", fontSize: 11, whiteSpace: "nowrap", transition: "color 0.15s" }}
                        onClick={sortKey ? () => {
                          if (mileSort === sortKey) {
                            setMileSortDir(d => d === "asc" ? "desc" : "asc");
                          } else {
                            setMileSort(sortKey);
                            setMileSortDir(sortKey === "date" ? "desc" : "asc");
                          }
                        } : undefined}
                        title={sortKey ? `Sort by ${h} (Alt+${sortKey[0].toUpperCase()})` : undefined}
                      >
                        {h}{isActive ? (mileSortDir === "asc" ? " ↑" : " ↓") : sortKey ? <span style={{ opacity: 0.3 }}> ↕</span> : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {displayGroups.map(({ key, legs, isGroup }) => {
                  const flags     = groupFlags(legs);
                  const totalKmGrp = legs.reduce((s, t) => s + t.km, 0);
                  const pending   = legs.some((t) => t.kmPending);
                  const firstLeg  = legs[0];

                  if (!isGroup) {
                    // Single leg row
                    const t     = firstLeg;
                    const tFlags = craFlags(t);
                    const isSelected  = selectedIds.has(t.id);
                    const isHighlight = highlightIds.size > 0 && highlightIds.has(t.id);
                    return (
                      <tr key={key} className="group" style={{
                        borderBottom: "1px solid var(--border)",
                        backgroundColor: isHighlight ? "rgba(168,85,247,0.08)" : isSelected ? "rgba(59,130,246,0.06)" : undefined,
                      }}>
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(t.id)}
                            style={{ accentColor: "var(--accent-blue)", cursor: "pointer" }} />
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>{t.date}</td>
                        <td className="px-4 py-2.5" style={{ minWidth: 180, maxWidth: 260 }}>
                          <span className="text-xs" style={{ color: "var(--text-primary)", display: "block", wordBreak: "break-word" }}>{t.from}</span>
                        </td>
                        <td className="px-4 py-2.5" style={{ minWidth: 180, maxWidth: 260 }}>
                          <span className="text-xs" style={{ color: "var(--text-primary)", display: "block", wordBreak: "break-word" }}>{t.to}</span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-right">
                          {t.kmPending ? (
                            <span className="text-xs" style={{ color: "var(--accent-blue)" }}>
                              <svg className="animate-spin inline mr-1" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                              calc…
                            </span>
                          ) : t.kmWarning ? (
                            <span className="text-xs flex items-center gap-1 justify-end" title={t.kmWarning}>
                              <span style={{ color: "var(--accent-blue)" }}>{t.km > 0 ? `${t.km} km` : "? km"}</span>
                              <span style={{ color: "#f59e0b" }}>⚠</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 justify-end">
                              <span className="text-xs font-semibold" style={{ color: "var(--accent-blue)" }}>{t.km} km</span>
                              {t.km > 500 && (
                                <span title="Unusually large distance — please verify" className="text-xs" style={{ color: "#f87171" }}>🚩</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 max-w-[180px]">
                          <div className="flex items-center gap-1.5">
                            {tFlags.length > 0 && (
                              <span title={tFlags.join(", ")} className="text-xs flex-shrink-0" style={{ color: "#f59e0b" }}>⚠</span>
                            )}
                            <span className="text-xs line-clamp-1" style={{ color: tFlags.length ? "#f59e0b" : "var(--text-secondary)" }}>{t.purpose || "—"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>{t.notes || "—"}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEdit(t)} className="text-xs px-2 py-0.5 rounded"
                              style={{ color: "var(--accent-blue)", backgroundColor: "rgba(59,130,246,0.1)" }}>Edit</button>
                            <button onClick={() => del(t.id)} className="text-xs px-2 py-0.5 rounded"
                              style={{ color: "#f87171", backgroundColor: "rgba(248,113,113,0.1)" }}>Del</button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  // Multi-leg group
                  return (
                    <GroupRow
                      key={key}
                      legs={legs}
                      flags={flags}
                      totalKm={totalKmGrp}
                      pending={pending}
                      onEditLeg={openEdit}
                      onDeleteGroup={() => delGroup(key)}
                      selectedIds={selectedIds}
                      highlightIds={highlightIds}
                      onToggleGroup={(ids) => toggleSelectGroup(ids)}
                    />
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td className="px-3 py-3" />
                  <td colSpan={3} className="px-4 py-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {displayGroups.length} trip{displayGroups.length !== 1 ? "s" : ""}
                    {selectedIds.size > 0 && (
                      <span className="ml-2 text-xs font-normal" style={{ color: "var(--accent-blue)" }}>
                        · {selectedIds.size} selected
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-right whitespace-nowrap" style={{ color: "var(--accent-blue)" }}>
                    {filtered.reduce((s, t) => s + t.km, 0).toLocaleString()} km
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
          </div>
        )}
      </div>

      {/* Trip form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-2xl rounded-2xl flex flex-col max-h-[92vh]"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                {editId ? "Edit Trip" : "Log Business Trip"}
              </p>
              <button onClick={() => setShowForm(false)} style={{ color: "var(--text-secondary)" }}>✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">

              {/* Date */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Date *</label>
                <input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                  className="rounded-lg px-3 py-2 text-sm outline-none w-44"
                  style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>

              {/* Stops table */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Trip Stops * {draft.legs.length > 1 && (
                      <span style={{ color: "var(--accent-blue)" }}>· {draft.legs.length} legs</span>
                    )}
                  </label>
                  {!editId && (
                    <button onClick={addStop} className="text-xs flex items-center gap-1"
                      style={{ color: "var(--accent-blue)" }}>
                      + Add Stop
                    </button>
                  )}
                </div>

                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                  {/* Column headers */}
                  <div className="grid px-3 py-1.5 text-xs font-medium"
                    style={{ gridTemplateColumns: "24px 1fr 1fr auto", gap: 8, backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
                    <span>#</span><span>From</span><span>To</span><span style={{ minWidth: 28 }}></span>
                  </div>

                  {draft.legs.map((leg, idx) => {
                    const isFirst    = idx === 0;
                    const isLast     = idx === draft.legs.length - 1;
                    const fromLocked = isFirst && !!office?.address && leg.from === office.address;
                    const toLocked   = isLast  && !!office?.address && leg.to === office.address && draft.legs.length > 1;

                    return (
                      <div key={leg.id}
                        className="grid items-center px-3 py-2 gap-2"
                        style={{
                          gridTemplateColumns: "24px 1fr 1fr auto",
                          borderBottom: idx < draft.legs.length - 1 ? "1px solid var(--border)" : "none",
                          backgroundColor: isFirst || isLast ? "rgba(59,130,246,0.03)" : "transparent",
                        }}>
                        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{idx + 1}</span>
                        <AddressInput
                          value={leg.from}
                          onChange={(v) => setLeg(idx, "from", v)}
                          onSelect={(p) => handleLegSelect(idx, "from", p)}
                          placeholder={isFirst ? (office?.address ?? "Home Office") : ""}
                          locked={fromLocked && idx > 0}
                          small
                        />
                        <AddressInput
                          value={leg.to}
                          onChange={(v) => setLeg(idx, "to", v)}
                          onSelect={(p) => handleLegSelect(idx, "to", p)}
                          placeholder={isLast && office?.address ? office.address : "Destination…"}
                          locked={toLocked}
                          small
                        />
                        <button
                          onClick={() => removeLeg(idx)}
                          disabled={draft.legs.length <= 1}
                          className="w-6 h-6 flex items-center justify-center rounded text-xs"
                          style={{ color: draft.legs.length <= 1 ? "var(--border)" : "#f87171", flexShrink: 0 }}>
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>

                {draft.legs.length >= 2 && (
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    First leg starts and last leg returns to your office. Each row&apos;s destination auto-fills the next row&apos;s origin.
                  </p>
                )}
              </div>

              {/* Business Purpose */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Business Purpose *</label>
                  <button onClick={() => triggerAI(draft.legs, "")}
                    disabled={aiLoading}
                    className="text-xs flex items-center gap-1"
                    style={{ color: aiLoading ? "var(--text-secondary)" : "var(--accent-blue)" }}>
                    {aiLoading ? "✨ Generating…" : "✨ Regenerate"}
                  </button>
                </div>
                <input value={draft.purpose} onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
                  placeholder={aiLoading ? "AI is generating…" : "e.g. Client site visit, contractor meeting"}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>

              {/* Notes + start odometer */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Notes</label>
                  <input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                    placeholder="Optional"
                    className="rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Start Odometer (km)</label>
                  <input type="number" value={draft.startMileage}
                    onChange={(e) => setDraft((d) => ({ ...d, startMileage: e.target.value }))}
                    placeholder="Optional"
                    className="rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
                style={{ backgroundColor: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.15)" }}>
                <svg className="animate-spin flex-shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                <span style={{ color: "var(--text-secondary)" }}>
                  Trip will be logged immediately. Distances ({draft.legs.filter((l) => l.from && l.to).length} leg{draft.legs.filter((l) => l.from && l.to).length !== 1 ? "s" : ""}) will be calculated in the background using the fastest driving route.
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {!draft.purpose && <span style={{ color: "#f59e0b" }}>⚠ Purpose required for CRA  </span>}
                {draft.legs.filter((l) => !l.from || !l.to).length > 0 && (
                  <span style={{ color: "var(--text-secondary)" }}>{draft.legs.filter((l) => !l.from || !l.to).length} leg{draft.legs.filter((l) => !l.from || !l.to).length > 1 ? "s" : ""} incomplete</span>
                )}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm"
                  style={{ color: "var(--text-secondary)" }}>Cancel</button>
                <button onClick={saveTrip}
                  disabled={!draft.date || !draft.legs.filter((l) => l.from && l.to).length}
                  className="px-5 py-2 rounded-lg text-sm font-medium"
                  style={{
                    backgroundColor: "var(--accent-blue)", color: "#fff",
                    opacity: (!draft.date || !draft.legs.filter((l) => l.from && l.to).length) ? 0.5 : 1,
                  }}>
                  {editId ? "Save Changes" : "Log Trip →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Discrepancy Review Modal ── */}
      {showFlagReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-2xl rounded-2xl flex flex-col max-h-[85vh]"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  ⚠ Distance Discrepancies — Review Required
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  Google Maps calculated distances that differ by more than 20% from your spreadsheet. Choose which value to keep.
                </p>
              </div>
              <button onClick={() => setShowFlagReview(false)} style={{ color: "var(--text-secondary)", flexShrink: 0 }}>✕</button>
            </div>

            {/* Trip list */}
            <div className="flex-1 overflow-y-auto flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
              {flaggedTrips.map((t) => {
                const f = t.kmFlagged!;
                const bigger = f.calculated > f.imported ? "calculated" : "imported";
                return (
                  <FlagReviewRow
                    key={t.id}
                    trip={t}
                    flag={f}
                    bigger={bigger}
                    onKeepCalculated={() => resolveFlag(t.id, "calculated")}
                    onKeepImported={() => resolveFlag(t.id, "imported")}
                    onDismiss={() => dismissFlag(t.id)}
                  />
                );
              })}
              {flaggedTrips.length === 0 && (
                <div className="px-5 py-10 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                  All discrepancies resolved.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {flaggedTrips.length} remaining · Changes save instantly
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { flaggedTrips.forEach((t) => resolveFlag(t.id, "calculated")); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                  Accept all Google Maps
                </button>
                <button
                  onClick={() => { flaggedTrips.forEach((t) => resolveFlag(t.id, "imported")); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                  Keep all spreadsheet
                </button>
                <button onClick={() => setShowFlagReview(false)}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Chat Panel ── */}
      {/* Floating toggle button — only shown when panel is closed */}
      {!chatOpen && (
        <button
          onClick={() => { setChatOpen(true); setChatMinimized(false); }}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg"
          style={{ backgroundColor: "var(--accent-blue)", color: "#fff", border: "1px solid var(--border)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          AI Assistant
          {selectedIds.size > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "rgba(255,255,255,0.25)" }}>
              {selectedIds.size}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {chatOpen && (
        <div className="fixed bottom-6 right-6 z-40 w-[380px] rounded-2xl flex flex-col shadow-2xl"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
            maxHeight: chatMinimized ? "auto" : "calc(100vh - 80px)",
          }}>
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none"
            style={{ borderBottom: chatMinimized ? "none" : "1px solid var(--border)" }}
            onClick={() => setChatMinimized((v) => !v)}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: chatLoading ? "#f59e0b" : "var(--accent-blue)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Mileage AI</span>
              {chatLoading && (
                <span style={{ fontSize: 11, color: "#f59e0b" }}>thinking · {(chatElapsed / 1000).toFixed(1)}s</span>
              )}
              {!chatLoading && selectedIds.size > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "rgba(59,130,246,0.12)", color: "var(--accent-blue)" }}>
                  {selectedIds.size} selected
                </span>
              )}
            </div>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setChatMinimized((v) => !v)}
                className="w-6 h-6 flex items-center justify-center rounded text-sm"
                title={chatMinimized ? "Expand" : "Minimize"}
                style={{ color: "var(--text-secondary)" }}>
                {chatMinimized ? "▲" : "▼"}
              </button>
              <button
                onClick={() => setChatOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded text-sm"
                title="Close"
                style={{ color: "var(--text-secondary)" }}>
                ✕
              </button>
            </div>
          </div>

          {/* Messages + input — hidden when minimized */}
          {!chatMinimized && <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ minHeight: 0 }}>
            {chatMessages.length === 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Try asking:</p>
                {[
                  "Update all years to 2026",
                  "Set notes on selected to 'personal vehicle'",
                  "How many km total this year?",
                  "Show trips with no purpose",
                  "Find trips to downtown",
                ].map((s) => (
                  <button key={s} onClick={() => { setChatInput(s); }}
                    className="text-left text-xs px-3 py-2 rounded-lg transition-colors"
                    style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className="max-w-[88%] rounded-xl px-3 py-2 text-xs"
                  style={{
                    backgroundColor: m.role === "user" ? "var(--accent-blue)" : "var(--bg-elevated)",
                    color: m.role === "user" ? "#fff" : "var(--text-primary)",
                    border: m.role === "assistant" ? "1px solid var(--border)" : "none",
                    lineHeight: 1.5,
                  }}>
                  {m.content}
                </div>
                {/* Action executed badge */}
                {m.actionSummary && (
                  <div className="flex items-center gap-1.5 mt-1 px-1" style={{ color: "#10b981" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span style={{ fontSize: 10 }}>{m.actionSummary}</span>
                  </div>
                )}
                {/* Timing metadata */}
                {m.role === "assistant" && (m.elapsed || m.tokens) && (
                  <p className="px-1 mt-0.5" style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                    {m.elapsed ? `${(m.elapsed / 1000).toFixed(1)}s` : ""}
                    {m.elapsed && m.tokens ? " · " : ""}
                    {m.tokens ? `${m.tokens} tokens` : ""}
                  </p>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex flex-col items-start gap-1">
                <div className="rounded-xl px-3 py-2 text-xs flex items-center gap-2"
                  style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "#f59e0b" }}>
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  <span>thinking · {(chatElapsed / 1000).toFixed(1)}s</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>}  {/* end messages — only shown when not minimized */}

          {/* Input — only shown when not minimized */}
          {!chatMinimized && (
            <form onSubmit={sendChat} className="px-3 py-3 flex gap-2 items-end" style={{ borderTop: "1px solid var(--border)" }}>
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="Ask me to update, filter, or explain…"
                rows={2}
                className="flex-1 resize-none rounded-xl px-3 py-2 text-xs outline-none"
                style={{ backgroundColor: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
              <button type="submit" disabled={chatLoading || !chatInput.trim()}
                className="px-3 py-2 rounded-xl text-xs font-semibold flex-shrink-0"
                style={{
                  backgroundColor: "var(--accent-blue)", color: "#fff",
                  opacity: chatLoading || !chatInput.trim() ? 0.5 : 1,
                }}>
                Send
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ── GroupRow (multi-leg display) ──────────────────────────────────────────────

function GroupRow({
  legs, flags, totalKm, pending, onEditLeg, onDeleteGroup, selectedIds, highlightIds, onToggleGroup,
}: {
  legs: MileageTrip[];
  flags: string[];
  totalKm: number;
  pending: boolean;
  onEditLeg: (t: MileageTrip) => void;
  onDeleteGroup: () => void;
  selectedIds: Set<string>;
  highlightIds: Set<string>;
  onToggleGroup: (ids: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const first = legs[0];
  const last  = legs[legs.length - 1];
  const legIds = legs.map((l) => l.id);
  const allSelected = legIds.every((id) => selectedIds.has(id));
  const someHighlighted = highlightIds.size > 0 && legIds.some((id) => highlightIds.has(id));

  // For the group header, show the first actual stop (leg[0].to) and the last actual
  // stop (leg[last].from) — this skips the home-office bookends and shows what's unique.
  const firstStop = first.to;
  const lastStop  = last.from;

  return (
    <>
      {/* Group header row */}
      <tr className="group cursor-pointer" onClick={() => setExpanded((v) => !v)}
        style={{
          borderBottom: expanded ? "none" : "1px solid var(--border)",
          backgroundColor: someHighlighted ? "rgba(168,85,247,0.08)" : allSelected ? "rgba(59,130,246,0.06)" : "var(--bg-surface)",
        }}>
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={allSelected} onChange={() => onToggleGroup(legIds)}
            style={{ accentColor: "var(--accent-blue)", cursor: "pointer" }} />
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>{first.date}</td>
        <td className="px-4 py-2.5" style={{ minWidth: 180, maxWidth: 260 }}>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs" style={{ color: "var(--text-primary)", wordBreak: "break-word" }}>{firstStop}</span>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>↓{legs.length} stops</span>
          </div>
        </td>
        <td className="px-4 py-2.5" style={{ minWidth: 180, maxWidth: 260 }}>
          <span className="text-xs" style={{ color: "var(--text-primary)", display: "block", wordBreak: "break-word" }}>{lastStop}</span>
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap text-right">
          {pending ? (
            <span className="text-xs" style={{ color: "var(--accent-blue)" }}>
              <svg className="animate-spin inline mr-1" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              calc…
            </span>
          ) : (
            <span className="flex items-center gap-1 justify-end">
              <span className="text-xs font-bold" style={{ color: "var(--accent-blue)" }}>{totalKm.toLocaleString()} km</span>
              {totalKm > 500 && (
                <span title="Unusually large distance — please verify" className="text-xs" style={{ color: "#f87171" }}>🚩</span>
              )}
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 max-w-[180px]">
          <div className="flex items-center gap-1.5">
            {flags.length > 0 && <span title={flags.join(", ")} className="text-xs flex-shrink-0" style={{ color: "#f59e0b" }}>⚠</span>}
            <span className="text-xs line-clamp-1" style={{ color: flags.length ? "#f59e0b" : "var(--text-secondary)" }}>
              {first.purpose || "—"}
            </span>
          </div>
        </td>
        <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>{first.notes || "—"}</td>
        <td className="px-4 py-2.5">
          <div className="flex gap-2 items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
              className="text-xs px-2 py-0.5 rounded"
              style={{ color: "var(--accent-blue)", backgroundColor: "rgba(59,130,246,0.1)" }}>Edit</button>
            <button onClick={(e) => { e.stopPropagation(); onDeleteGroup(); }}
              className="text-xs px-2 py-0.5 rounded"
              style={{ color: "#f87171", backgroundColor: "rgba(248,113,113,0.1)" }}>Del</button>
          </div>
        </td>
      </tr>

      {/* Expanded leg rows */}
      {expanded && legs.map((leg, i) => (
        <tr key={leg.id} className="group"
          style={{
            borderBottom: i === legs.length - 1 ? "1px solid var(--border)" : "1px dashed var(--border)",
            backgroundColor: "var(--bg-base)",
          }}>
          <td className="px-3 py-2" />
          <td className="py-2 pl-8 pr-2 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>
            <span className="inline-block w-3 h-3 rounded-full mr-1 flex-shrink-0 align-middle"
              style={{ backgroundColor: i === 0 || i === legs.length - 1 ? "var(--accent-blue)" : "var(--border)", display: "inline-block" }} />
            {i + 1}
          </td>
          <td className="px-4 py-2" style={{ minWidth: 180, maxWidth: 260 }}>
            <span className="text-xs" style={{ color: "var(--text-secondary)", display: "block", wordBreak: "break-word" }}>{leg.from}</span>
          </td>
          <td className="px-4 py-2" style={{ minWidth: 180, maxWidth: 260 }}>
            <span className="text-xs" style={{ color: "var(--text-secondary)", display: "block", wordBreak: "break-word" }}>{leg.to}</span>
          </td>
          <td className="px-4 py-2 whitespace-nowrap text-right">
            {leg.kmPending ? (
              <span className="text-xs" style={{ color: "var(--accent-blue)" }}>
                <svg className="animate-spin inline mr-1" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                calc…
              </span>
            ) : (
              <span className="text-xs font-medium" style={{ color: "var(--accent-blue)" }}>{leg.km} km</span>
            )}
          </td>
          <td className="px-4 py-2 text-xs" style={{ color: "var(--text-secondary)" }} colSpan={2}></td>
          <td className="px-4 py-2">
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onEditLeg(leg)} className="text-xs px-2 py-0.5 rounded"
                style={{ color: "var(--accent-blue)", backgroundColor: "rgba(59,130,246,0.1)" }}>Edit</button>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

// ── FlagReviewRow ─────────────────────────────────────────────────────────────

function FlagReviewRow({
  trip, flag, bigger, onKeepCalculated, onKeepImported, onDismiss,
}: {
  trip: MileageTrip;
  flag: { imported: number; calculated: number; pct: number; resolved?: boolean };
  bigger: "calculated" | "imported";
  onKeepCalculated: () => void;
  onKeepImported: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="px-5 py-4 flex flex-col gap-2" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* Trip header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span style={{ color: "var(--text-secondary)" }}>{trip.date}</span>
          <span style={{ color: "var(--text-secondary)" }}>·</span>
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>{trip.from}</span>
          <span style={{ color: "var(--text-secondary)" }}>→</span>
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>{trip.to}</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
          style={{ backgroundColor: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
          {flag.pct.toFixed(0)}% diff
        </span>
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-2">
        {/* Spreadsheet value */}
        <div className="rounded-xl px-3 py-2.5 flex flex-col gap-0.5"
          style={{
            border: bigger === "imported" ? "1px solid rgba(245,158,11,0.4)" : "1px solid var(--border)",
            backgroundColor: bigger === "imported" ? "rgba(245,158,11,0.05)" : "var(--bg-surface)",
          }}>
          <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Your spreadsheet</p>
          <p className="text-base font-bold" style={{ color: bigger === "imported" ? "#f59e0b" : "var(--text-primary)" }}>
            {flag.imported} km
          </p>
          {bigger === "imported" && (
            <p className="text-xs" style={{ color: "#f59e0b" }}>↑ higher</p>
          )}
        </div>

        {/* Google Maps value */}
        <div className="rounded-xl px-3 py-2.5 flex flex-col gap-0.5"
          style={{
            border: bigger === "calculated" ? "1px solid rgba(59,130,246,0.4)" : "1px solid var(--border)",
            backgroundColor: bigger === "calculated" ? "rgba(59,130,246,0.05)" : "var(--bg-surface)",
          }}>
          <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Google Maps</p>
          <p className="text-base font-bold" style={{ color: bigger === "calculated" ? "var(--accent-blue)" : "var(--text-primary)" }}>
            {flag.calculated} km
          </p>
          {bigger === "calculated" && (
            <p className="text-xs" style={{ color: "var(--accent-blue)" }}>↑ higher</p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        <button onClick={onDismiss}
          className="px-3 py-1.5 rounded-lg text-xs"
          style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
          Dismiss
        </button>
        <button onClick={onKeepImported}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ backgroundColor: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }}>
          Keep {flag.imported} km
        </button>
        <button onClick={onKeepCalculated}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ backgroundColor: "rgba(59,130,246,0.12)", color: "var(--accent-blue)", border: "1px solid rgba(59,130,246,0.25)" }}>
          Use Google Maps ({flag.calculated} km)
        </button>
      </div>
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, note }: { label: string; value: string; color: string; note?: string }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-1" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</p>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      {note && <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{note}</p>}
    </div>
  );
}
