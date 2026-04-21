import { requireAuth } from "@/lib/api-auth";
import { aiLimit, getIP } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const deny = await requireAuth(); if (deny) return deny;
  const rl = aiLimit(getIP(req)); if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
  const { from, to } = await req.json();
  if (!from || !to) return NextResponse.json({ purpose: "" });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a CRA compliance assistant for a Canadian corporation. Given a trip's origin and destination, suggest a brief, realistic business purpose (under 12 words). Reply with only the purpose text — no quotes, no explanation.",
        },
        {
          role: "user",
          content: `From: ${from}\nTo: ${to}`,
        },
      ],
      max_tokens: 40,
    });

    const purpose = response.choices[0].message.content?.trim() ?? "";
    return NextResponse.json({ purpose });
  } catch {
    return NextResponse.json({ purpose: "" });
  }
}
