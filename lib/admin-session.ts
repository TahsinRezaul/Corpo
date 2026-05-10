import { randomBytes, createHmac } from "crypto";

const SECRET = process.env.AUTH_SECRET ?? "fallback-secret";

export function createAdminToken(): string {
  const payload = `${Date.now()}:${randomBytes(16).toString("hex")}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token: string): boolean {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return false;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = createHmac("sha256", SECRET).update(payload).digest("hex");
  if (sig !== expected) return false;
  const ts = parseInt(payload.split(":")[0], 10);
  return Date.now() - ts < 7 * 24 * 60 * 60 * 1000; // 7 days
}
