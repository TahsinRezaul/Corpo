import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const FILE_NAME = "corpo-data.json";

async function findFileId(token: string): Promise<string | null> {
  const q = encodeURIComponent(`name = '${FILE_NAME}'`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json() as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

// GET — download data from Drive
export async function GET() {
  const session = await auth();
  const token = session?.googleAccessToken;
  if (!token) return NextResponse.json({ error: "no_token" }, { status: 401 });

  const fileId = await findFileId(token);
  if (!fileId) return NextResponse.json({}, { status: 200 });

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: 502 });
  }
  const data = await res.json();
  return NextResponse.json(data);
}

// POST — upload data to Drive
export async function POST(req: NextRequest) {
  const session = await auth();
  const token = session?.googleAccessToken;
  if (!token) return NextResponse.json({ error: "no_token" }, { status: 401 });

  const data = await req.json() as Record<string, unknown>;
  const content = JSON.stringify(data);
  const existingId = await findFileId(token);

  if (existingId) {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: content,
      }
    );
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  const boundary = "corpo_boundary";
  const metadata = JSON.stringify({ name: FILE_NAME, parents: ["appDataFolder"] });
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary="${boundary}"`,
      },
      body,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
