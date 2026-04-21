import { requireAuth } from "@/lib/api-auth";
import { aiLimit, getIP } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { HelpContent } from "@/lib/page-help-content";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

export async function POST(req: NextRequest) {
  const deny = await requireAuth(); if (deny) return deny;
  const rl = aiLimit(getIP(req)); if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  try {
    const body = await req.json() as {
      question: string;
      content: HelpContent;
      dataContext?: string; // optional extra context (e.g. "User has 5 receipts, $1200 expenses")
    };

    const { question, content, dataContext } = body;
    if (!question?.trim()) return NextResponse.json({ answer: "" });

    const systemPrompt = `You are a helpful financial assistant inside CORPO, a bookkeeping app for Canadian small business owners (CCPCs in Ontario).

The user is on the "${content.title}" page (${content.subtitle}).

About this page:
${content.about}

How it works:
${content.howItWorks.map(h => `- ${h}`).join("\n")}

${content.keyConcepts ? `Key concepts:\n${content.keyConcepts.map(c => `- ${c.term}: ${c.def}`).join("\n")}` : ""}

${dataContext ? `User's current data context:\n${dataContext}` : ""}

Instructions:
- Answer in plain language a non-accountant can understand
- Be concise: 2-5 sentences unless the question needs more detail
- If data shows as zero or empty, explain what needs to be entered first and where
- If asked about tax law, give practical guidance but note they should confirm with an accountant
- Use Canadian tax terminology (HST, CCPC, T2, CRA, etc.)
- Do not use markdown headers, keep it conversational
- If you don't know something specific to their situation, say so and suggest asking an accountant`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: question }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "I couldn't generate an answer.";
    return NextResponse.json({ answer: text });

  } catch (e) {
    console.error("page-help error:", e);
    return NextResponse.json({ answer: "Sorry, something went wrong. Please try again." }, { status: 500 });
  }
}
