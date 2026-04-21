import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function toBase64Image(buffer: Buffer, mimeType: string, fileName: string): Promise<{ base64: string; mime: string }> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (mimeType === "application/pdf" || ext === "pdf") {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("@napi-rs/canvas");
    const pdf = await (await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise);
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = createCanvas(viewport.width, viewport.height);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: canvas.getContext("2d") as any, viewport, canvas: canvas as any }).promise;
    return { base64: canvas.toBuffer("image/jpeg").toString("base64"), mime: "image/jpeg" };
  }

  const isHeic = ["image/heic", "image/heif"].includes(mimeType) || ["heic", "heif"].includes(ext);
  if (isHeic) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heicConvert = (await import("heic-convert" as any)).default;
    const converted = await heicConvert({ buffer, format: "JPEG", quality: 1 });
    return { base64: Buffer.from(converted).toString("base64"), mime: "image/jpeg" };
  }

  const sharp = (await import("sharp")).default;
  const jpeg = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
  return { base64: jpeg.toString("base64"), mime: "image/jpeg" };
}

const PROMPT = `You are parsing an invoice document for a Canadian Ontario corporation.
Extract the following fields and return ONLY valid JSON (no markdown):

{
  "invoiceNo": "invoice number as string, e.g. INV-0042",
  "dateIssued": "YYYY-MM-DD",
  "dateDue": "YYYY-MM-DD or empty string",
  "clientName": "who the invoice is billed to",
  "clientAddress": "client address or empty string",
  "lineItems": [
    { "description": "item description", "qty": 1, "rate": 100.00 }
  ],
  "hstRate": 0.13,
  "notes": "any notes or payment terms found",
  "status": "unpaid",
  "amountPaid": 0,
  "paymentDate": "",
  "paymentMethod": ""
}

Rules:
- lineItems must be an array, even if only one item
- rate is the unit price as a number (no $ sign)
- qty is a number
- hstRate: use 0.13 for Ontario HST, 0.15 for Atlantic, 0.05 for GST-only, 0 if no tax
- If due date is not found, set dateDue to empty string
- If the invoice looks paid, set status to "paid"
- Return only the JSON object, nothing else`;

export async function POST(req: NextRequest) {
  try {
    const form   = await req.formData();
    const file   = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer   = Buffer.from(await file.arrayBuffer());
    const { base64, mime } = await toBase64Image(buffer, file.type, file.name);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}`, detail: "high" } },
        ],
      }],
    });

    const text = response.choices[0].message.content ?? "{}";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Ensure lineItems have ids
    if (Array.isArray(parsed.lineItems)) {
      parsed.lineItems = parsed.lineItems.map((l: object) => ({ id: crypto.randomUUID(), ...l }));
    } else {
      parsed.lineItems = [{ id: crypto.randomUUID(), description: "", qty: 1, rate: 0 }];
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
