import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleAuth } from "google-auth-library";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Google Document AI ─────────────────────────────────────────────────────────

async function getGoogleToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not set");
  const credentials = JSON.parse(raw);
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const token  = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to get Google access token");
  return token.token;
}

async function ocrViaDocumentAI(base64: string, mimeType: string): Promise<string> {
  const project   = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location  = process.env.GOOGLE_CLOUD_LOCATION ?? "us";
  const processor = process.env.GOOGLE_DOCUMENTAI_PROCESSOR_ID;
  if (!project || !processor) throw new Error("Google Document AI env vars not set");

  const token = await getGoogleToken();
  const url   = `https://${location}-documentai.googleapis.com/v1/projects/${project}/locations/${location}/processors/${processor}:process`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ rawDocument: { content: base64, mimeType } }),
  });

  if (!res.ok) throw new Error(`Document AI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.document?.text ?? "").trim();
  if (!text) throw new Error("Document AI returned no text");
  return text;
}

// ── OpenAI vision fallback OCR ─────────────────────────────────────────────────

async function ocrViaOpenAI(base64: string, mimeType: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Extract ALL text from this receipt exactly as it appears. Include every number, label, date, and line item. Output raw text only, no commentary." },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
      ],
    }],
  });
  return response.choices[0].message.content ?? "";
}

// ── Image normalisation ────────────────────────────────────────────────────────

async function prepareFile(buffer: Buffer, mimeType: string, fileName: string): Promise<{ base64: string; mime: string }> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (mimeType === "application/pdf" || ext === "pdf") {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("@napi-rs/canvas");
    const pdf  = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas   = createCanvas(viewport.width, viewport.height);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: canvas.getContext("2d") as any, viewport, canvas: canvas as any }).promise;
    return { base64: canvas.toBuffer("image/jpeg").toString("base64"), mime: "image/jpeg" };
  }

  const isHeic = ["image/heic","image/heif","image/heic-sequence","image/heif-sequence"].includes(mimeType)
               || ["heic","heif"].includes(ext);
  if (isHeic) {
    const heicConvert = (await import("heic-convert")).default;
    const converted = await heicConvert({ buffer, format: "JPEG", quality: 1 });
    return { base64: Buffer.from(converted).toString("base64"), mime: "image/jpeg" };
  }

  const sharp = (await import("sharp")).default;
  const jpeg  = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
  return { base64: jpeg.toString("base64"), mime: "image/jpeg" };
}

// ── Claude parsing prompt ──────────────────────────────────────────────────────

const PARSE_PROMPT = `You are a tax assistant for a Canadian Ontario incorporation.
You are given raw OCR text extracted from a receipt. Parse it and return JSON with these exact fields:

- vendor: business name
- date: YYYY-MM-DD format (best guess if unclear)
- subtotal: amount before tax with $ sign (e.g. "$38.94"), or empty string
- tax: total tax charged (HST/GST/PST) with $ sign (e.g. "$4.55"), or empty string
- total: final total with $ sign (e.g. "$42.50")
- category: exactly one from the list below
- business_purpose: one clear sentence on the likely business reason
- tax_deductible: true or false

CATEGORIES:
Operating: Advertising, Meals & Entertainment (50% deductible), Insurance, Interest & Bank Charges, Office Expenses, Legal & Accounting Fees, Rent, Salaries & Wages, Travel, Telephone & Utilities, Repairs & Maintenance, Subcontracting / Management Fees
Motor Vehicle: Motor Vehicle Expenses — Fuel, Motor Vehicle Expenses — Insurance, Motor Vehicle Expenses — Repairs & Maintenance, Motor Vehicle Expenses — Lease / Financing, Motor Vehicle Expenses — Parking & Tolls
CCA: CCA — Class 8 (Furniture & Equipment), CCA — Class 10 (Vehicles — purchase price), CCA — Class 12 (Software / Tools under $500), CCA — Class 50 (Computers & Hardware), CCA — Class 14.1 (Goodwill / Intangibles)
COGS: COGS — Purchases / Inventory, COGS — Direct Labour

RULES:
- Gas/fuel/petrol/diesel/EV charging → ALWAYS "Motor Vehicle Expenses — Fuel"
- Car wash, oil change, tires → "Motor Vehicle Expenses — Repairs & Maintenance"
- Parking, tolls → "Motor Vehicle Expenses — Parking & Tolls"
- COGS is NEVER for fuel, food, office supplies, or general expenses

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.`;

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer   = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";

  try {
    // Step 1 — normalise to JPEG
    const prepared = await prepareFile(buffer, mimeType, file.name ?? "");

    // Step 2 — OCR: try Google Document AI, fall back to OpenAI vision
    let ocrText = "";
    let ocrSource = "documentai";
    try {
      ocrText = await ocrViaDocumentAI(prepared.base64, prepared.mime);
      console.log("OCR via Document AI succeeded");
    } catch (e) {
      console.warn("Document AI failed, falling back to OpenAI vision:", e);
      ocrText = await ocrViaOpenAI(prepared.base64, prepared.mime);
      ocrSource = "openai";
      console.log("OCR via OpenAI succeeded");
    }

    if (!ocrText.trim()) throw new Error("OCR returned no text from either provider");

    // Step 3 — Parse with Claude Haiku
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      messages: [{
        role: "user",
        content: `${PARSE_PROMPT}\n\nOCR TEXT (source: ${ocrSource}):\n\n${ocrText}`,
      }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const parsed  = JSON.parse(cleaned);

    // Step 4 — Thumbnail
    const sharp = (await import("sharp")).default;
    const thumb = await sharp(Buffer.from(prepared.base64, "base64"))
      .resize(400, undefined, { withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    return NextResponse.json({ ...parsed, _thumbnail: `data:image/jpeg;base64,${thumb.toString("base64")}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Parse error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
