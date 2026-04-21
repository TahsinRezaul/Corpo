"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import type { HelpContent } from "@/lib/page-help-content";

type ChatMsg = { role: "user" | "ai"; text: string };

// ── Rendered help panel ───────────────────────────────────────────────────────

function GuideTab({ content }: { content: HelpContent }) {
  return (
    <div className="p-5 flex flex-col gap-5">

      {/* About */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>What is this page?</h4>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{content.about}</p>
      </div>

      {/* Why empty */}
      {content.whyEmpty && (
        <div className="rounded-xl p-3.5" style={{ backgroundColor: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
          <p className="text-xs font-semibold mb-1" style={{ color: "#f59e0b" }}>Why am I seeing zeros / empty data?</p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{content.whyEmpty}</p>
        </div>
      )}

      {/* How it works */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>How it works</h4>
        <ol className="flex flex-col gap-2">
          {content.howItWorks.map((step, i) => (
            <li key={i} className="flex gap-2.5 items-start">
              <span className="flex-shrink-0 flex items-center justify-center rounded-full text-xs font-bold mt-0.5"
                style={{ width: 20, height: 20, backgroundColor: "rgba(59,130,246,0.15)", color: "var(--accent-blue)" }}>
                {i + 1}
              </span>
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Key concepts */}
      {content.keyConcepts && content.keyConcepts.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Key terms explained</h4>
          <div className="flex flex-col gap-2">
            {content.keyConcepts.map((c, i) => (
              <div key={i} className="rounded-xl p-3" style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>{c.term}</p>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{c.def}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      {content.tips.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Tips</h4>
          <ul className="flex flex-col gap-1.5">
            {content.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 items-start text-xs" style={{ color: "var(--text-secondary)" }}>
                <span style={{ color: "#10b981", flexShrink: 0 }}>✓</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}

function AskTab({
  content, msgs, input, setInput, loading, onAsk,
}: {
  content: HelpContent;
  msgs: ChatMsg[];
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  onAsk: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onAsk(); }
  }

  const SUGGESTED = [
    "Why is everything showing as zero?",
    "How do I get started with this page?",
    "What do I need to do before filing?",
    "Explain the key numbers here",
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {msgs.length === 0 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl p-4" style={{ backgroundColor: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--accent-blue)" }}>AI Assistant</p>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                Ask me anything about {content.title}. I know how this page works and can explain the numbers in plain language.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Try asking:</p>
              {SUGGESTED.map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); }}
                  className="text-left text-xs px-3 py-2.5 rounded-xl"
                  style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="rounded-2xl px-4 py-2.5 text-sm max-w-[90%]"
              style={{
                backgroundColor: m.role === "user" ? "rgba(59,130,246,0.15)" : "var(--bg-elevated)",
                color: "var(--text-primary)",
                border: `1px solid ${m.role === "user" ? "rgba(59,130,246,0.25)" : "var(--border)"}`,
                lineHeight: 1.55,
              }}
            >
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2.5 flex items-center gap-1" style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "var(--text-secondary)", display: "inline-block", opacity: 0.5, animation: `bounce 1s ${i * 0.15}s infinite` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex gap-2 items-center rounded-2xl px-4 py-2.5" style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask anything about this page…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--text-primary)" }}
          />
          <button
            onClick={onAsk}
            disabled={!input.trim() || loading}
            className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{
              width: 30, height: 30,
              backgroundColor: input.trim() && !loading ? "var(--accent-blue)" : "transparent",
              opacity: input.trim() && !loading ? 1 : 0.35,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>
        <p className="text-xs mt-1.5 text-center" style={{ color: "var(--text-secondary)", opacity: 0.5 }}>
          Powered by Claude AI · Not tax advice
        </p>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PageHelp({
  content,
  dataContext,
}: {
  content: HelpContent;
  dataContext?: string;
}) {
  const [open,    setOpen]    = useState(false);
  const [tab,     setTab]     = useState<"guide" | "ask">("guide");
  const [msgs,    setMsgs]    = useState<ChatMsg[]>([]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);

  // lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  async function handleAsk() {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await fetch("/api/page-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, content, dataContext }),
      });
      const data = await res.json();
      setMsgs(m => [...m, { role: "ai", text: data.answer || "I couldn't generate an answer. Please try again." }]);
    } catch {
      setMsgs(m => [...m, { role: "ai", text: "Connection error — please try again." }]);
    }
    setLoading(false);
  }

  return (
    <>
      {/* ─ ? button ─ */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center rounded-full flex-shrink-0"
        style={{
          width: 28, height: 28,
          backgroundColor: "rgba(59,130,246,0.12)",
          border: "1.5px solid rgba(59,130,246,0.3)",
          color: "var(--accent-blue)",
          fontSize: 13, fontWeight: 700,
          cursor: "pointer",
          letterSpacing: "-0.03em",
        }}
        aria-label="Help"
        title="Help & Explainer"
      >
        ?
      </button>

      {/* ─ Panel ─ */}
      {open && (
        <div
          className="fixed inset-0 z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          {/* Slide-in panel */}
          <div
            className="absolute right-0 top-0 bottom-0 flex flex-col"
            style={{
              width: "min(440px, 100vw)",
              backgroundColor: "var(--bg-surface)",
              borderLeft: "1px solid var(--border)",
              boxShadow: "-20px 0 60px rgba(0,0,0,0.4)",
              animation: "slideInRight 0.22s cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{content.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(59,130,246,0.12)", color: "var(--accent-blue)", border: "1px solid rgba(59,130,246,0.25)" }}>
                    Help
                  </span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{content.subtitle}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex items-center justify-center rounded-lg flex-shrink-0 ml-3"
                style={{ width: 28, height: 28, backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
              {(["guide", "ask"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 py-2.5 text-xs font-medium"
                  style={{
                    color: tab === t ? "var(--accent-blue)" : "var(--text-secondary)",
                    borderBottom: `2px solid ${tab === t ? "var(--accent-blue)" : "transparent"}`,
                  }}
                >
                  {t === "guide" ? "📖 Guide" : "✨ Ask AI"}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {tab === "guide" ? (
                <div className="flex-1 overflow-y-auto">
                  <GuideTab content={content} />
                </div>
              ) : (
                <AskTab
                  content={content}
                  msgs={msgs}
                  input={input}
                  setInput={v => { setInput(v); }}
                  loading={loading}
                  onAsk={handleAsk}
                />
              )}
            </div>
          </div>

          <style>{`
            @keyframes slideInRight {
              from { transform: translateX(100%); opacity: 0; }
              to   { transform: translateX(0);    opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
