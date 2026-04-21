import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Call at the top of any API route handler to enforce authentication.
 * Returns null if the session is valid; returns a 401 Response if not.
 *
 * Usage:
 *   const deny = await requireAuth();
 *   if (deny) return deny;
 */
export async function requireAuth(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
