import type { NextAuthConfig } from "next-auth";

// Edge-compatible auth config — no Node.js APIs (no fs, crypto, process.cwd)
// Used only by middleware.ts (Edge Runtime)
export default {
  providers: [], // Providers are added in auth.ts (Node.js runtime only)
  pages: {
    signIn: "/login",
    error:  "/login",
  },
} satisfies NextAuthConfig;
