import { NextRequest, NextResponse } from "next/server";
import { findByEmail, createUser } from "@/lib/users";
import { authLimit, getIP } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  // Rate limit: 10 signups per 15 minutes per IP
  const rl = authLimit(getIP(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const { email, name, password } = await req.json() as {
    email: string; name: string; password: string;
  };

  if (!email?.trim() || !name?.trim() || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 255) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }
  if (name.trim().length > 100) {
    return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (!/[A-Z]/.test(password)) {
    return NextResponse.json({ error: "Password must contain at least one uppercase letter." }, { status: 400 });
  }
  if (!/[0-9]/.test(password)) {
    return NextResponse.json({ error: "Password must contain at least one number." }, { status: 400 });
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return NextResponse.json({ error: "Password must contain at least one special character." }, { status: 400 });
  }
  if (findByEmail(email)) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
  }

  createUser(email, name, password);
  return NextResponse.json({ success: true });
}
