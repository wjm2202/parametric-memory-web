"use client";

import { useEffect, useRef, useState } from "react";

interface Heading {
  id: string;
  level: 2 | 3;
  text: string;
}

interface TableOfContentsProps {
  headings: Heading[];
}

export function TableOfContents({ headings }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (headings.length === 0) return;

    const handleIntersect: IntersectionObserverCallback = (entries) => {
      // Find the topmost visible heading
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length > 0) {
        setActiveId(visible[0].target.id);
      }
    };

    observerRef.current = new IntersectionObserver(handleIntersect, {
      rootMargin: "-80px 0px -60% 0px",
      threshold: 0,
    });

    headings.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <aside className="hidden w-48 shrink-0 xl:block">
      <div className="sticky top-20 max-h-[calc(100vh-5rem)] overflow-y-auto py-6 pl-4">
        <p className="text-surface-600 mb-3 text-[11px] font-semibold tracking-widest uppercase">
          On this page
        </p>
        <ul className="space-y-1">
          {headings.map(({ id, level, text }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className={[
                  "block py-0.5 text-sm leading-snug transition-colors",
                  level === 3 ? "pl-3" : "",
                  activeId === id
                    ? "text-brand-400 font-medium"
                    : "text-surface-500 hover:text-surface-300",
                ].join(" ")}
              >
                {text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
