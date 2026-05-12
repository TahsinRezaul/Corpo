const FILE_NAME = "corpo-data.json";

async function findFileId(accessToken: string): Promise<string | null> {
  const q = encodeURIComponent(`name = '${FILE_NAME}'`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    console.error("[Drive] findFileId failed", res.status, await res.text());
    return null;
  }
  const data = await res.json() as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

export async function driveUpload(
  accessToken: string,
  data: Record<string, unknown>
): Promise<void> {
  const content = JSON.stringify(data);
  const existingId = await findFileId(accessToken);

  if (existingId) {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: content,
      }
    );
    if (!res.ok) throw new Error(`Drive update failed ${res.status}: ${await res.text()}`);
    return;
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
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary="${boundary}"`,
      },
      body,
    }
  );
  if (!res.ok) throw new Error(`Drive create failed ${res.status}: ${await res.text()}`);
}

export async function driveDownload(
  accessToken: string
): Promise<Record<string, unknown> | null> {
  const fileId = await findFileId(accessToken);
  if (!fileId) {
    console.warn("[Drive] no backup file found in appDataFolder");
    return null;
  }
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    console.error("[Drive] download failed", res.status, await res.text());
    return null;
  }
  return res.json() as Promise<Record<string, unknown>>;
}
