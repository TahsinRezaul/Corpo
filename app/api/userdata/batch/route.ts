import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/firebase-admin";

// Accepts { key: value, key: value, ... } and writes all at once with merge
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({}, { status: 401 });
  try {
    const data = await req.json() as Record<string, unknown>;
    if (!data || typeof data !== "object") return NextResponse.json({ error: "invalid body" }, { status: 400 });
    await getDb().collection("userdata").doc(session.user.id).set(data, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Firestore batch error", e);
    return NextResponse.json({ error: "firestore error" }, { status: 500 });
  }
}
