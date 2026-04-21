import { NextRequest, NextResponse } from "next/server";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "Tahsin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "555610";
const ADMIN_TOKEN    = "corpo_admin_v1_authorized";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json() as { username: string; password: string };

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const res = NextResponse.json({ success: true });
    res.cookies.set("admin_session", ADMIN_TOKEN, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });
    return res;
  }

  return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
}
