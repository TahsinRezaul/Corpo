import { requireAuth } from "@/lib/api-auth";
import { aiLimit, getIP } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are an invoice assistant for a Canadian Ontario corporation.
The user will describe what they want on their invoice and you will return a JSON patch to update the invoice draft.

Return ONLY valid JSON with any of these optional fields:
- clientName: string
- clientAddress: string
- dateIssued: YYYY-MM-DD
- dateDue: YYYY-MM-DD (optional)
- invoiceNo: string
- hstRate: number (0.13 for 13% HST, 0.05 for GST only, 0 for exempt)
- notes: string
- lineItems: array of { description: string, qty: number, rate: number }

RULES:
- Only include fields you are updating, omit fields you don't need to change
- Line items rate should be in dollars (e.g. 150 for $150/hr)
- Always include all line items when returning lineItems (not just changes)
- If the user mentions hours worked, use qty for hours and rate for hourly rate
- Common HST rates: Ontario 13%, most provinces GST only = 5%
- Net 30 means due date = issued date + 30 days

Respond ONLY with valid JSON. No markdown, no code fences, no commentary.`;

export async function POST(req: NextRequest) {
  const deny = await requireAuth(); if (deny) return deny;
  const rl = aiLimit(getIP(req)); if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  const { prompt, draft } = await req.json();
  if (!prompt) return NextResponse.json({ error: "No prompt" }, { status: 400 });

  try {
    const context = `Current invoice draft:
${JSON.stringify(draft, null, 2)}

User request: ${prompt}`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: "user", content: context }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const patch = JSON.parse(cleaned);

    return NextResponse.json({ patch });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Invoice AI error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
