"use client";

import { useState } from "react";

export interface FAQItem {
  question: string;
  answer: string | React.ReactNode;
  category: string;
}

interface FAQAccordionProps {
  items: FAQItem[];
  category?: string;
}

export function FAQAccordion({ items, category }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const filtered = category ? items.filter((f) => f.category === category) : items;

  return (
    <div className="space-y-3" role="region" aria-label={`FAQ: ${category ?? "all questions"}`}>
      {filtered.map((faq, index) => (
        <div
          key={index}
          className="border-surface-200/10 bg-surface-900/50 hover:border-surface-200/20 rounded-xl border backdrop-blur-sm transition-all"
          itemScope
          itemType="https://schema.org/Question"
        >
          <button
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left"
            aria-expanded={openIndex === index}
            aria-controls={`faq-answer-${category}-${index}`}
          >
            <h3 className="text-base leading-snug font-semibold text-white" itemProp="name">
              {faq.question}
            </h3>
            <svg
              className={`text-brand-400 mt-0.5 h-5 w-5 flex-shrink-0 transition-transform duration-200 ${
                openIndex === index ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <div
            id={`faq-answer-${category}-${index}`}
            itemScope
            itemType="https://schema.org/Answer"
            className={openIndex === index ? "block" : "hidden"}
          >
            <div
              className="border-surface-200/10 text-surface-200/75 border-t px-6 py-5 text-sm leading-relaxed"
              itemProp="text"
            >
              {faq.answer}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
