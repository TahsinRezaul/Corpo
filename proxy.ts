import NextAuth from "next-auth";
import authConfig from "./auth.config";
const { auth } = NextAuth(authConfig);
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

const ADMIN_LOGIN = "/admin/login";

// Verify HMAC-signed admin session cookie (edge-compatible, no Node fs/path)
function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const secret   = process.env.AUTH_SECRET ?? "fallback-secret-change-me";
  const payload  = "corpo_admin_v1";
  const sig      = createHmac("sha256", secret).update(payload).digest("hex");
  const expected = `${payload}.${sig}`;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export default auth(function middleware(req) {
  const { pathname } = req.nextUrl;

  // Allow auth API, admin API, and static assets through
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Admin login page always accessible
  if (pathname === ADMIN_LOGIN) return NextResponse.next();

  // Admin section: verify HMAC-signed admin_session cookie
  if (pathname.startsWith("/admin")) {
    const adminSession = (req as NextRequest).cookies.get("admin_session");
    if (!verifyAdminToken(adminSession?.value)) {
      return NextResponse.redirect(new URL(ADMIN_LOGIN, req.url));
    }
    return NextResponse.next();
  }

  // App section: require NextAuth session
  if (!req.auth?.user) {
    if (pathname !== "/login") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  } else if (pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.webp).*)"],
};
