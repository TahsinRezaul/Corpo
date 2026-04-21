import { createHmac, timingSafeEqual } from "crypto";

const SECRET = () => process.env.AUTH_SECRET ?? "fallback-secret-change-me";
const PAYLOAD = "corpo_admin_v1";

/** Creates a signed admin session token: `payload.hmac` */
export function createAdminToken(): string {
  const sig = createHmac("sha256", SECRET()).update(PAYLOAD).digest("hex");
  return `${PAYLOAD}.${sig}`;
}

/** Returns true only if the token is a valid HMAC-signed admin token */
export function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = createAdminToken();
  try {
    // Constant-time comparison to prevent timing attacks
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
