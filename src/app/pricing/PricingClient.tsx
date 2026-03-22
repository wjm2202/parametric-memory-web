"use client";

import { useState } from "react";

/* FAQ questions */
const faqs = [
  {
    question: "What makes Parametric Memory different from Mem0 or Zep?",
    answer:
      "Parametric Memory is built on cryptographic foundations. Every memory operation is verifiable via RFC 6962 Merkle proofs, making memory auditable and tamper-evident—critical for regulated AI systems. We include Markov-chain prediction (64% hit rate) to anticipate what your AI will need next. MCP support is native, not bolted on. We run on dedicated instances you control, not shared infrastructure. And pricing is flat-rate: no per-query fees that explode as your system scales.",
  },
  {
    question: "How much does Parametric Memory cost?",
    answer:
      "Plans range from $9/mo (Starter, 512 MiB, 10 GiB) to $499/mo (Enterprise Self-Hosted, unlimited everything). Solo at $29/mo is most popular—it gives you 1 GiB RAM, 25 GiB storage, email support, and all features for the price of a coffee per day. Team ($79/mo) adds priority support and Grafana dashboards. Enterprise Cloud ($299/mo) includes 99.9% SLA and SSO. Enterprise Self-Hosted ($499/mo) gives you full source code and deployment flexibility. All plans include cryptographic proofs, Markov prediction, and MCP.",
  },
  {
    question: "Does Parametric Memory work with Claude and MCP?",
    answer:
      "Yes. Parametric Memory is MCP-native—it ships with a complete MCP server that exposes memory operations as tools. Claude and any MCP-compatible client (Cowork, Zed, etc.) can call store(), recall(), and predict() directly. No wrapper layer, no API glue—it speaks MCP natively. See docs at /docs for the full tool reference.",
  },
  {
    question: "Can I self-host Parametric Memory?",
    answer:
      "Yes. Enterprise Self-Hosted ($499/mo) gives you the full source code, commercial license, and deployment guide. Deploy on AWS, Azure, GCP, or your own Kubernetes cluster. You own the data, the proofs, the ML. No cloud lock-in. We provide a 2-hour architecture review, deployment guide, and quarterly health reviews to help you scale.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Not yet — Parametric Memory is currently in Public Beta (pre-v1.0.0). Paid plans are not available during the Beta. We're accepting early access requests from developers who want to test the service or contribute to the memory substrate. Use the early access form on this page to join. Once v1.0.0 launches, all plans will include a free trial with no credit card required.",
  },
  {
    question: "What happens if I outgrow my plan?",
    answer:
      "Upgrade instantly via the console—same data, zero downtime. RAM and storage scale elastically. If you hit capacity on a dedicated plan, we auto-provision the next tier. For Enterprise Cloud or Self-Hosted, your dedicated team helps you right-size. No surprise bills—pricing is transparent and per-month.",
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
