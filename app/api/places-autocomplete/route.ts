import { NextRequest, NextResponse } from "next/server";

const KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";

// GTA bounding box for Nominatim fallback
const GTA_VIEWBOX = "-80.5,44.5,-78.3,43.3";

// ── Google Places (preferred) ─────────────────────────────────────────────────

async function googleAutocomplete(q: string, lat: number, lng: number, radiusM: number) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", q);
  url.searchParams.set("key", KEY);
  url.searchParams.set("components", "country:ca");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(radiusM));
  url.searchParams.set("language", "en");

  const res  = await fetch(url.toString(), { next: { revalidate: 0 } });
  const data = await res.json();

  if (!["OK", "ZERO_RESULTS"].includes(data.status)) {
    console.error("Google Places error:", data.status, data.error_message);
    return null; // signal to fall back
  }

  type Prediction = { description: string; place_id: string };
  return (data.predictions ?? []).map((p: Prediction) => ({
    label:    p.description,
    place_id: p.place_id,
  }));
}

// ── OpenStreetMap Nominatim (fallback) ────────────────────────────────────────

function latLngToViewbox(lat: number, lng: number, radiusKm: number): string {
  const dlat = radiusKm / 111;
  const dlng = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
  // Nominatim viewbox: left,top,right,bottom (lng_min,lat_max,lng_max,lat_min)
  return `${lng - dlng},${lat + dlat},${lng + dlng},${lat - dlat}`;
}

async function nominatimAutocomplete(q: string, lat: number, lng: number, radiusKm: number) {
  const headers  = { "User-Agent": "CORPO-Tax-App/1.0" };
  const viewbox  = latLngToViewbox(lat, lng, radiusKm);

  // Try bounded area first
  const bounded = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1&countrycodes=ca&viewbox=${viewbox}&bounded=1`,
    { headers, next: { revalidate: 0 } }
  );
  let data: NomResult[] = bounded.ok ? await bounded.json() : [];

  // If < 3 results, fall back to Canada-wide biased
  if (data.length < 3) {
    const fallback = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1&countrycodes=ca&viewbox=${viewbox}&bounded=0`,
      { headers, next: { revalidate: 0 } }
    );
    const extra: NomResult[] = fallback.ok ? await fallback.json() : [];
    const seen = new Set(data.map((r) => r.place_id));
    for (const r of extra) if (!seen.has(r.place_id)) { data.push(r); seen.add(r.place_id); }
  }

  return data.slice(0, 6).map((r) => {
    const a = r.address ?? {};
    const parts = [
      [a.house_number, a.road].filter(Boolean).join(" "),
      a.city ?? a.town ?? a.municipality ?? a.village ?? "",
      a.state_code ?? a.state ?? "",
      a.postcode ?? "",
    ].filter(Boolean);
    return { label: parts.length > 1 ? parts.join(", ") : r.display_name };
  });
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const q        = req.nextUrl.searchParams.get("q")      ?? "";
  const latStr   = req.nextUrl.searchParams.get("lat");
  const lngStr   = req.nextUrl.searchParams.get("lng");
  const radiusKm = parseFloat(req.nextUrl.searchParams.get("radius") ?? "100");

  if (q.length < 2) return NextResponse.json([]);

  // Use provided bias coords or fall back to GTA defaults
  const lat = latStr ? parseFloat(latStr) : 43.7181;
  const lng = lngStr ? parseFloat(lngStr) : -79.5181;

  try {
    if (KEY) {
      const results = await googleAutocomplete(q, lat, lng, Math.round(radiusKm * 1000));
      if (results !== null) return NextResponse.json(results);
    }
    const results = await nominatimAutocomplete(q, lat, lng, radiusKm);
    return NextResponse.json(results);
  } catch (e) {
    console.error("places-autocomplete error:", e);
    return NextResponse.json([]);
  }
}

type NomResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    municipality?: string;
    village?: string;
    state?: string;
    state_code?: string;
    postcode?: string;
  };
};
