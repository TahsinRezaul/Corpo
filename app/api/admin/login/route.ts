import { NextRequest, NextResponse } from "next/server";
import { createAdminToken } from "@/lib/admin-session";
import { authLimit, getIP } from "@/lib/rate-limit";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export async function POST(req: NextRequest) {
  // Rate limit: 10 attempts per 15 minutes per IP
  const result = authLimit(getIP(req));
  if (!result.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error("ADMIN_USERNAME or ADMIN_PASSWORD env vars not set");
    return NextResponse.json({ error: "Admin login not configured" }, { status: 503 });
  }

  const { username, password } = await req.json() as { username: string; password: string };

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const res = NextResponse.json({ success: true });
    res.cookies.set("admin_session", createAdminToken(), {
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
