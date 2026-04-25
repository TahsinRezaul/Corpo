import NextAuth from "next-auth";
import authConfig from "./auth.config";
const { auth } = NextAuth(authConfig);
import { NextResponse } from "next/server";

export default auth(function middleware(req) {
  const { pathname } = req.nextUrl;

  // Allow auth API and static assets through without a session check
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Require NextAuth session for everything else
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
