import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAuth } from "@/lib/api-auth";

export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM = `You are CORPO's AI assistant — a bookkeeping app for Canadian Ontario businesses.
The user gives you natural language commands or questions. Return ONLY a JSON object:

{ "action": "navigate" | "answer", "path": string | null, "message": string }

NAVIGATION RULES (action = "navigate"):
- Make/create/new invoice [for month/client]: path = "/invoices?new=1&month=MONTH&year=YEAR" (use current year if not specified, month name e.g. "June")
- Scan/upload/add receipt or expense: path = "/receipts"
- Add/record income or revenue: path = "/income?new=1"
- Log mileage, drive, trip, km: path = "/mileage"
- HST, GST, tax return, quarterly: path = "/hst"
- Tax planner, estimate taxes: path = "/tax"
- Accountant report, export, download PDF: path = "/accountant"
- Settings, profile, theme: path = "/settings"
- Money management, cash flow: path = "/money"
- Shareholder loan: path = "/loan"
- Import, migrate, spreadsheet, CSV, Excel: path = "/migrate"

ANSWER RULES (action = "answer"):
- Questions about expenses, income, receipts → answer helpfully using the context provided
- How-to questions → explain briefly
- Anything unclear → ask for clarification

message is always a short, friendly 1-sentence reply. Never use markdown in message.
Respond ONLY with valid JSON. No code fences, no extra text.`;

export async function POST(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;

  const body = await req.json();
  const { message, context } = body as { message: string; context?: string };
  if (!message?.trim()) return NextResponse.json({ error: "No message" }, { status: 400 });

  const userContent = context
    ? `App context (current data summary): ${context}\n\nUser request: ${message}`
    : message;

  const msg = await openai.chat.completions.create({
    model: "gpt-5",
    max_tokens: 150,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userContent },
    ],
  });

  const raw = msg.choices[0]?.message?.content ?? "{}";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  const usage = {
    promptTokens: msg.usage?.prompt_tokens ?? 0,
    completionTokens: msg.usage?.completion_tokens ?? 0,
  };

  try {
    const result = JSON.parse(cleaned);
    return NextResponse.json({ ...result, _usage: usage });
  } catch {
    return NextResponse.json({
      action: "answer",
      path: null,
      message: "I didn't catch that — try something like 'make an invoice for June' or 'scan a receipt'.",
    });
  }
}
