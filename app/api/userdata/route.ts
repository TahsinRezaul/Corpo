import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadUserData, setUserKey, clearUserData } from "@/lib/server-data";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({}, { status: 401 });
  return NextResponse.json(loadUserData(session.user.id));
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({}, { status: 401 });
  clearUserData(session.user.id);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({}, { status: 401 });
  const { key, value } = await req.json() as { key: string; value: unknown };
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  setUserKey(session.user.id, key, value);
  return NextResponse.json({ ok: true });
}
