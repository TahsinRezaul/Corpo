import NextAuth from "next-auth";
import authConfig from "./auth.config";
const { auth } = NextAuth(authConfig);
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_TOKEN = "corpo_admin_v1_authorized";
const ADMIN_LOGIN = "/admin/login";

export default auth(function middleware(req) {
  const { pathname } = req.nextUrl;

  // Allow auth API, admin API, and static assets
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

  // Admin section: verify admin_session cookie
  if (pathname.startsWith("/admin")) {
    const adminSession = (req as NextRequest).cookies.get("admin_session");
    if (adminSession?.value !== ADMIN_TOKEN) {
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
    // Already signed in — send to home
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.webp).*)"],
};
