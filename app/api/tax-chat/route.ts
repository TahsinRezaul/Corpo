import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json();

    const system = `You are a friendly Canadian tax advisor helping an Ontario small business owner who runs a Canadian-Controlled Private Corporation (CCPC).

Here is their current financial snapshot for the year:
${context}

Your job is to:
- Answer questions about their specific numbers above
- Explain Canadian tax concepts in plain English (no jargon)
- Help them optimize salary vs dividend splits
- Explain HST, corporate tax, RRSP, CCA, and other concepts simply
- Give practical, actionable advice tailored to their actual situation
- Flag anything they should discuss with their CPA

Always be concise and direct. Use dollar amounts from their data when relevant.
Always remind them that your advice is for planning purposes and they should verify with a CPA for filing.
Never make up numbers — only reference what's in their snapshot above.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system,
      messages,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return NextResponse.json({ reply: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
