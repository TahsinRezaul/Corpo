import { readFileSync } from "fs";
import { NextResponse } from "next/server";
import { join } from "path";
import os from "os";

export async function GET() {
  const certPath = join(os.homedir(), "Library", "Application Support", "mkcert", "rootCA.pem");
  const cert = readFileSync(certPath);
  return new NextResponse(cert, {
    headers: {
      "Content-Type": "application/x-x509-ca-cert",
      "Content-Disposition": 'attachment; filename="mkcert-rootCA.crt"',
    },
  });
}
