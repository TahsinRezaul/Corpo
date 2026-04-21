import { requireAuth } from "@/lib/api-auth";
import { mapsLimit, getIP } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";

// Approximate bounding boxes per Canadian province/territory (lat_lo,lng_lo,lat_hi,lng_hi)
const PROVINCE_BOUNDS: Record<string, string> = {
  ON: "41.6,-95.2,56.9,-74.3",
  QC: "44.9,-79.8,62.6,-57.1",
  BC: "48.2,-139.1,60.0,-114.0",
  AB: "48.9,-120.0,60.0,-110.0",
  MB: "48.9,-102.0,60.0,-88.9",
  SK: "48.9,-110.0,60.0,-101.4",
  NS: "43.3,-66.4,47.1,-59.6",
  NB: "44.5,-69.1,48.1,-63.7",
  PE: "45.9,-64.5,47.1,-62.0",
  NL: "46.6,-67.8,60.4,-52.6",
  NT: "60.0,-136.5,78.0,-101.9",
  YT: "59.9,-141.0,70.0,-123.8",
  NU: "61.0,-120.0,83.1,-61.0",
};

function isFormatted(addr: string): boolean {
  return /\b[A-Z]{2}\b/.test(addr) && addr.includes(",");
}

async function geocode(query: string, bounds?: string): Promise<{ formatted: string; lat: number; lng: number } | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key",     KEY);
  url.searchParams.set("region",  "ca");
  if (bounds) url.searchParams.set("bounds", bounds);

  const res  = await fetch(url.toString());
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) return null;
  const r = data.results[0];
  return {
    formatted: r.formatted_address as string,
    lat:       r.geometry.location.lat as number,
    lng:       r.geometry.location.lng as number,
  };
}

function latLngToBounds(lat: number, lng: number, radiusKm: number): string {
  const dlat = radiusKm / 111;
  const dlng = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
  return `${lat - dlat},${lng - dlng}|${lat + dlat},${lng + dlng}`;
}

export async function GET(req: NextRequest) {
  const deny = await requireAuth(); if (deny) return deny;
  const rl = mapsLimit(getIP(req)); if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  const raw      = req.nextUrl.searchParams.get("address")  ?? "";
  // New location-bias params (preferred)
  const latStr   = req.nextUrl.searchParams.get("lat");
  const lngStr   = req.nextUrl.searchParams.get("lng");
  const radiusKm = parseFloat(req.nextUrl.searchParams.get("radius") ?? "100");
  // Legacy province-bias params (kept for backward compat)
  const province = req.nextUrl.searchParams.get("province") ?? "";
  const biasOn   = req.nextUrl.searchParams.get("bias") !== "0";

  if (!raw) return NextResponse.json({ error: "Missing address" }, { status: 400 });
  if (!KEY)  return NextResponse.json({ error: "No API key" },      { status: 500 });

  // Compute bounding box — prefer lat/lng if provided, fall back to province
  let bounds: string | undefined;
  if (latStr && lngStr && biasOn) {
    bounds = latLngToBounds(parseFloat(latStr), parseFloat(lngStr), radiusKm);
  } else if (biasOn && province) {
    bounds = PROVINCE_BOUNDS[province.toUpperCase()];
  }

  try {
    // First attempt: with province suffix + bounds bias (if enabled and not already formatted)
    if (biasOn && province && !isFormatted(raw)) {
      const withProvince = await geocode(`${raw}, ${province}, Canada`, bounds);
      if (withProvince) return NextResponse.json(withProvince);
    }

    // Second attempt: plain address with bounds bias only
    const withBounds = await geocode(raw, bounds);
    if (withBounds) return NextResponse.json(withBounds);

    // Final fallback: no bias
    if (bounds) {
      const plain = await geocode(raw);
      if (plain) return NextResponse.json(plain);
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    console.error("geocode error:", e);
    return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
  }
}
