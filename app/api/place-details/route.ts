import { requireAuth } from "@/lib/api-auth";
import { mapsLimit, getIP } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";

export async function GET(req: NextRequest) {
  const deny = await requireAuth(); if (deny) return deny;
  const rl = mapsLimit(getIP(req)); if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  const placeId = req.nextUrl.searchParams.get("place_id") ?? "";
  if (!placeId) return NextResponse.json({ error: "Missing place_id" }, { status: 400 });
  if (!KEY)     return NextResponse.json({ error: "No API key" }, { status: 500 });

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields",   "formatted_address,geometry");
  url.searchParams.set("key",      KEY);

  const res  = await fetch(url.toString(), { next: { revalidate: 0 } });
  const data = await res.json();

  if (data.status !== "OK") {
    console.error("Place Details error:", data.status, data.error_message);
    return NextResponse.json({ error: data.status }, { status: 400 });
  }

  const { formatted_address, geometry } = data.result;
  return NextResponse.json({
    address: formatted_address as string,
    lat:     geometry.location.lat as number,
    lng:     geometry.location.lng as number,
  });
}
