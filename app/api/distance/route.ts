import { requireAuth } from "@/lib/api-auth";
import { mapsLimit, getIP } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";
const GTA_VIEWBOX = "-80.5,44.5,-78.3,43.3";
const HEADERS = { "User-Agent": "CORPO-Tax-App/1.0" };

// ── Google Distance Matrix ────────────────────────────────────────────────────

async function googleDistance(
  from: string, to: string,
  fromCoords?: { lat: number; lng: number },
  toCoords?:   { lat: number; lng: number },
) {
  const originStr      = fromCoords ? `${fromCoords.lat},${fromCoords.lng}` : from;
  const destinationStr = toCoords   ? `${toCoords.lat},${toCoords.lng}`     : to;

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins",      originStr);
  url.searchParams.set("destinations", destinationStr);
  url.searchParams.set("mode",         "driving");
  url.searchParams.set("units",        "metric");
  url.searchParams.set("key",          KEY);
  url.searchParams.set("region",       "ca");

  const res  = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== "OK") return null;
  const el = data.rows?.[0]?.elements?.[0];
  if (!el || el.status !== "OK") return null;

  return {
    km:      Math.round((el.distance.value / 1000) * 10) / 10,
    minutes: Math.round(el.duration.value / 60),
  };
}

// ── Google Geocoding (formatted address) ─────────────────────────────────────

async function googleFormatAddress(address: string): Promise<{ formatted: string; lat: number; lng: number } | null> {
  if (!KEY) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", KEY);
  url.searchParams.set("region", "ca");
  const res  = await fetch(url.toString());
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) return null;
  const r = data.results[0];
  return {
    formatted: r.formatted_address as string,
    lat: r.geometry.location.lat as number,
    lng: r.geometry.location.lng as number,
  };
}

async function googleReverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!KEY) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", KEY);
  const res  = await fetch(url.toString());
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) return null;
  return data.results[0].formatted_address as string;
}

// ── OpenStreetMap / OSRM fallback ─────────────────────────────────────────────

type Coords = { lat: number; lon: number };

async function geocode(address: string): Promise<Coords | null> {
  const q = encodeURIComponent(address);
  // Try bounded GTA first
  const r1 = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=ca&viewbox=${GTA_VIEWBOX}&bounded=1`,
    { headers: HEADERS }
  );
  const d1 = r1.ok ? await r1.json() : [];
  if (d1.length) return { lat: parseFloat(d1[0].lat), lon: parseFloat(d1[0].lon) };

  // Canada-wide fallback
  const r2 = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=ca`,
    { headers: HEADERS }
  );
  const d2 = r2.ok ? await r2.json() : [];
  if (d2.length) return { lat: parseFloat(d2[0].lat), lon: parseFloat(d2[0].lon) };

  return null;
}

async function osrmRoute(fromLon: number, fromLat: number, toLon: number, toLat: number) {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false`;
  const res  = await fetch(url, { headers: HEADERS });
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) return null;
  return {
    km:      Math.round((data.routes[0].distance / 1000) * 10) / 10,
    minutes: Math.round(data.routes[0].duration / 60),
  };
}

async function osrmDistance(
  from: string, to: string,
  fromCoords?: { lat: number; lng: number },
  toCoords?:   { lat: number; lng: number },
) {
  // If we already have coordinates, skip Nominatim entirely
  if (fromCoords && toCoords) {
    return osrmRoute(fromCoords.lng, fromCoords.lat, toCoords.lng, toCoords.lat);
  }

  const [fc, tc] = await Promise.all([geocode(from), geocode(to)]);
  if (!fc || !tc) return null;
  return osrmRoute(fc.lon, fc.lat, tc.lon, tc.lat);
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const deny = await requireAuth(); if (deny) return deny;
  const rl = mapsLimit(getIP(req)); if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  const from    = req.nextUrl.searchParams.get("from")     ?? "";
  const to      = req.nextUrl.searchParams.get("to")       ?? "";
  const fromLat = parseFloat(req.nextUrl.searchParams.get("fromLat") ?? "");
  const fromLng = parseFloat(req.nextUrl.searchParams.get("fromLng") ?? "");
  const toLat   = parseFloat(req.nextUrl.searchParams.get("toLat")   ?? "");
  const toLng   = parseFloat(req.nextUrl.searchParams.get("toLng")   ?? "");

  const fromCoords = (!isNaN(fromLat) && !isNaN(fromLng)) ? { lat: fromLat, lng: fromLng } : undefined;
  const toCoords   = (!isNaN(toLat)   && !isNaN(toLng))   ? { lat: toLat,   lng: toLng   } : undefined;

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from or to" }, { status: 400 });
  }

  try {
    if (KEY) {
      // Geocode addresses to get formatted versions + coords (skip if coords already provided)
      const [fromGeo, toGeo] = await Promise.all([
        fromCoords ? googleReverseGeocode(fromCoords.lat, fromCoords.lng).then(f => f ? { formatted: f, lat: fromCoords.lat, lng: fromCoords.lng } : null) : googleFormatAddress(from),
        toCoords   ? googleReverseGeocode(toCoords.lat,   toCoords.lng  ).then(f => f ? { formatted: f, lat: toCoords.lat,   lng: toCoords.lng   } : null) : googleFormatAddress(to),
      ]);

      const resolvedFromCoords = fromCoords ?? (fromGeo ? { lat: fromGeo.lat, lng: fromGeo.lng } : undefined);
      const resolvedToCoords   = toCoords   ?? (toGeo   ? { lat: toGeo.lat,   lng: toGeo.lng   } : undefined);

      const result = await googleDistance(from, to, resolvedFromCoords, resolvedToCoords);
      if (result) return NextResponse.json({
        ...result,
        fromFormatted: fromGeo?.formatted ?? null,
        toFormatted:   toGeo?.formatted   ?? null,
        fromLat: resolvedFromCoords?.lat ?? null,
        fromLng: resolvedFromCoords?.lng ?? null,
        toLat:   resolvedToCoords?.lat   ?? null,
        toLng:   resolvedToCoords?.lng   ?? null,
      });
    }
    // Fall back to OSRM (no formatted address available)
    const result = await osrmDistance(from, to, fromCoords, toCoords);
    if (result) return NextResponse.json(result);

    return NextResponse.json({ error: "Could not calculate distance" }, { status: 400 });
  } catch (e) {
    console.error("distance error:", e);
    return NextResponse.json({ error: "Routing service unavailable" }, { status: 502 });
  }
}
