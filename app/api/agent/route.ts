import { requireAuth } from "@/lib/api-auth";
import { aiLimit, getIP } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const deny = await requireAuth(); if (deny) return deny;
  const rl = aiLimit(getIP(req)); if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  const { query, receipts, history, proMode } = await req.json();

  const receiptSummary = receipts.map((r: Record<string, unknown>) => ({
    id: r.id,
    vendor: r.vendor,
    date: r.date,
    total: r.total,
    subtotal: r.subtotal,
    tax: r.tax,
    category: r.category,
    business_purpose: r.business_purpose,
    shareholder_loan: r.shareholder_loan,
    savedAt: r.savedAt,
  }));

  const proActions = proMode ? `
 | {
    "type": "edit",
    "id": "receipt-id",
    "changes": {
      "vendor": "...",
      "date": "...",
      "total": "...",
      "subtotal": "...",
      "tax": "...",
      "category": "...",
      "business_purpose": "...",
      "notes": "...",
      "shareholder_loan": true | false
    }
  } | {
    "type": "bulkEdit",
    "ids": ["id1", "id2"],
    "changes": {
      "category": "...",
      "business_purpose": "..."
    }
  } | {
    "type": "delete",
    "ids": ["id1", "id2"]
  }` : "";

  const proRules = proMode ? `
- You are in PRO MODE. You CAN make changes to receipts.
- For "change" / "update" / "edit" / "fix" requests on a specific receipt: use type "edit" with the receipt id and only the fields that need changing
- For bulk category changes ("categorize all X as Y", "fix all motor vehicle"): use type "bulkEdit" with the matching ids
- For "delete" / "remove" requests: use type "delete" with the ids
- Always confirm what you changed in the "answer" field
- Only change fields the user explicitly asked about — don't touch other fields` : `
- You are in GUIDE MODE. You can only read, filter, sort, highlight, and answer questions. You CANNOT edit or delete receipts.
- If the user asks you to change or edit something, explain that Pro AI mode is needed (available in Settings → AI).`;

  const systemPrompt = `You are a helpful tax receipt assistant for a Canadian Ontario incorporation. You help the user find, filter, sort, and understand their business receipts.

The user's receipts (${receiptSummary.length} total):
${JSON.stringify(receiptSummary, null, 2)}

You can respond with actions to help navigate the data. Always respond with valid JSON in exactly this format:
{
  "answer": "A brief, helpful response. Can include totals, summaries, or insights.",
  "action": null | {
    "type": "filter",
    "filters": {
      "search": "",
      "category": "",
      "dateFrom": "",
      "dateTo": ""
    }
  } | {
    "type": "sort",
    "by": "date" | "total" | "vendor" | "category",
    "order": "asc" | "desc"
  } | {
    "type": "highlight",
    "ids": ["id1", "id2"]
  } | {
    "type": "clear"
  }${proActions}
}

Rules:
- For "how much" / "total" questions: calculate the answer and put it in "answer", set action to null
- For "show me" / "find" / "filter" requests: use type "filter"
- For "sort by" requests: use type "sort"
- For "reset" / "show all" / "clear": use type "clear"
- Categories available: Advertising, Meals & Entertainment (50% deductible), Insurance, Interest & Bank Charges, Office Expenses, Legal & Accounting Fees, Rent, Salaries & Wages, Travel, Telephone & Utilities, Repairs & Maintenance, Subcontracting / Management Fees, Motor Vehicle Expenses — Fuel, Motor Vehicle Expenses — Insurance, Motor Vehicle Expenses — Repairs & Maintenance, Motor Vehicle Expenses — Lease / Financing, Motor Vehicle Expenses — Parking & Tolls, CCA — Class 8 (Furniture & Equipment), CCA — Class 10 (Vehicles — purchase price), CCA — Class 12 (Software / Tools under $500), CCA — Class 50 (Computers & Hardware), CCA — Class 14.1 (Goodwill / Intangibles), COGS — Purchases / Inventory, COGS — Direct Labour
- Dates should be YYYY-MM-DD format
- Dollar amounts use $ prefix (e.g. "$42.50")
- Keep answers concise (1-2 sentences max)
- If you highlight receipts, also include a helpful answer explaining what you found
${proRules}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...(history ?? []),
    { role: "user", content: query },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0].message.content ?? "{}";
    const result = JSON.parse(text);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ answer: `Sorry, something went wrong: ${message}`, action: null }, { status: 500 });
  }
}
