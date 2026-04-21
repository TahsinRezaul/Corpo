import { NextRequest, NextResponse } from "next/server";
import { findByEmail, createUser } from "@/lib/users";

export async function POST(req: NextRequest) {
  const { email, name, password } = await req.json() as {
    email: string; name: string; password: string;
  };

  if (!email?.trim() || !name?.trim() || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  if (findByEmail(email)) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
  }

  createUser(email, name, password);
  return NextResponse.json({ success: true });
}
