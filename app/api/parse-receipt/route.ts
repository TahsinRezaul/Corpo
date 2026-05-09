import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleAuth } from "google-auth-library";
import { requireAuth } from "@/lib/api-auth";
import { uploadLimit, getIP } from "@/lib/rate-limit";

export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

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
    // Send PDF directly to Document AI — it supports PDF natively,
    // avoiding @napi-rs/canvas which doesn't run on Vercel's serverless runtime.
    return { base64: buffer.toString("base64"), mime: "application/pdf" };
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
Extract EVERY piece of data visible on this receipt. Return JSON with these exact fields:

IDENTIFICATION
- vendor: business/store name
- store_address: full street address of the vendor as printed on the receipt, or ""
- store_city: city and province, or ""
- store_postal_code: postal code, or ""
- store_phone: vendor's phone number exactly as shown, or ""
- hst_number: vendor's HST/GST registration number (e.g. "123456789 RT0001"), or ""

TRANSACTION
- date: YYYY-MM-DD (best guess if unclear)
- purchase_time: time of purchase in HH:MM 24h format, or ""
- receipt_number: receipt, order, or transaction number exactly as shown, or ""
- cashier: cashier name or ID if shown, or ""

PAYMENT
- payment_method: card brand (e.g. "Visa", "Mastercard", "Amex", "Debit"), or "Cash", or ""
- card_last4: last 4 digits of the card number if shown, or ""
- auth_code: authorization/approval code if shown, or ""

AMOUNTS
- subtotal: amount before tax with $ sign (e.g. "$38.94"), or ""
- tax_hst: HST amount with $ sign, or ""
- tax_gst: GST amount with $ sign if shown separately, or ""
- tax_pst: PST amount with $ sign if shown separately, or ""
- tax: total tax charged (all taxes combined) with $ sign (e.g. "$4.55"), or ""
- tip: tip/gratuity amount with $ sign if shown, or ""
- total: final total with $ sign (e.g. "$42.50")
- tax_rate: tax rate percentage if shown (e.g. "13%"), or ""

ITEMS
- line_items: array of all purchased items. Each: { "description": string, "qty": string, "unit_price": string, "amount": string, "sku": string }. Use "" for missing fields. Return [] if no items visible.

CLASSIFICATION
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
- If a field is not visible on the receipt, return "" — never guess

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.`;

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const deny = await requireAuth(); if (deny) return deny;
  const rl = uploadLimit(getIP(req)); if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "File too large (max 10 MB)." }, { status: 413 });

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
      if (prepared.mime === "application/pdf") {
        throw new Error("Document AI failed for this PDF and OpenAI vision does not support PDFs.");
      }
      ocrText = await ocrViaOpenAI(prepared.base64, prepared.mime);
      ocrSource = "openai";
      console.log("OCR via OpenAI succeeded");
    }

    if (!ocrText.trim()) throw new Error("OCR returned no text from either provider");

    // Step 3 — Parse with Claude Haiku
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2400,
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
    console.error("Parse error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Failed to process the file. Please try again." }, { status: 500 });
  }
}
