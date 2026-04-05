"use client";

import { useState } from "react";

/* FAQ questions */
const faqs = [
  {
    question: "What makes Parametric Memory different from Mem0 or Zep?",
    answer:
      "Parametric Memory is built on cryptographic foundations. Every memory operation is verifiable via RFC 6962 Merkle proofs, making memory auditable and tamper-evident — critical for regulated AI systems. We include Markov-chain prediction (64% hit rate) to anticipate what your AI will need next. MCP support is native, not bolted on. Your substrate runs in isolated containers — not shared infrastructure. And pricing is flat-rate: no per-query fees that explode as your system scales.",
  },
  {
    question: "How much does Parametric Memory cost?",
    answer:
      "Four plans, all billed monthly: Free at $1/month (500 atoms, 100 bootstraps/month), Indie at $9/month (10,000 atoms, 1,000 bootstraps/month, email support), Pro at $29/month (100,000 atoms, 10,000 bootstraps/month, knowledge graph edges, priority support), and Team at $79/month (500,000 atoms, unlimited bootstraps, dedicated support). No contracts, cancel anytime from your dashboard.",
  },
  {
    question: "Does Parametric Memory work with Claude and MCP?",
    answer:
      "Yes. Parametric Memory is MCP-native — it ships with a complete MCP server that exposes memory operations as tools. Claude and any MCP-compatible client (Cowork, Zed, etc.) can call store(), recall(), and predict() directly. No wrapper layer, no API glue — it speaks MCP natively. See docs at /docs for the full tool reference.",
  },
  {
    question: "What happens when I hit my memory limit?",
    answer:
      "Claude keeps working. Older, less-relevant memories are gently summarised to make room. You won't lose anything important, and you'll never get a hard stop mid-session. You can also upgrade your plan instantly from the dashboard — same data, zero downtime.",
  },
  {
    question: "Can I switch plans?",
    answer:
      "Yes. Upgrade or downgrade anytime from your dashboard. Upgrades apply immediately. Downgrades take effect at the end of your billing period.",
  },
  {
    question: "Can I cancel?",
    answer:
      "Yes. Cancel anytime from the Billing section in your dashboard. Takes 30 seconds — no calls, no emails. Your memories are preserved for 90 days after cancellation.",
  },
  {
    question: "I have a team larger than 5. Can you support us?",
    answer: "Yes — contact us and we can put together a custom arrangement for larger teams.",
  },
];

export function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-4" role="region" aria-label="Frequently asked questions">
      {faqs.map((faq, index) => (
        <div
          key={index}
          className="border-surface-200/10 bg-surface-900/50 hover:border-surface-200/20 rounded-lg border backdrop-blur-sm transition-all"
        >
          <button
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            className="flex w-full items-center justify-between px-6 py-4 text-left"
            aria-expanded={openIndex === index}
            aria-controls={`faq-answer-${index}`}
          >
            <h3 className="text-base font-semibold text-white">{faq.question}</h3>
            <svg
              className={`text-brand-400 ml-4 h-5 w-5 flex-shrink-0 transition-transform ${
                openIndex === index ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </button>
          {openIndex === index && (
            <div id={`faq-answer-${index}`} className="border-surface-200/10 border-t px-6 py-4">
              <p className="text-surface-200/70 text-sm leading-relaxed">{faq.answer}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
