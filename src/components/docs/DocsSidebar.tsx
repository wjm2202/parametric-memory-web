"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { docsNav } from "@/config/docs-nav";
import type { DocNavItem } from "@/config/docs-nav";

// ── Badge ────────────────────────────────────────────────────────────────────

function NavBadge({ badge }: { badge: DocNavItem["badge"] }) {
  if (!badge) return null;

  const styles: Record<NonNullable<DocNavItem["badge"]>, string> = {
    new: "bg-amber-400/15 text-amber-300 border border-amber-400/20",
    beta: "bg-brand-500/15 text-brand-400 border border-brand-500/20",
    soon: "bg-surface-800 text-surface-600 border border-surface-700",
  };

  return (
    <span
      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase ${styles[badge]}`}
    >
      {badge}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DocsSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Normalise /docs/foo/bar → "foo/bar" for comparison
  const activeSlug = pathname.replace(/^\/docs\/?/, "");

  const SidebarContent = () => (
    <nav aria-label="Documentation navigation">
      <ul className="space-y-6">
        {docsNav.map((section) => (
          <li key={section.title}>
            <p className="text-surface-600 mb-2 px-2 text-[11px] font-semibold tracking-widest uppercase">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = activeSlug === item.slug;
                const isSoon = item.badge === "soon";
                return (
                  <li key={item.slug}>
                    {isSoon ? (
                      <span className="text-surface-600 flex cursor-default items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm select-none">
                        <span>{item.title}</span>
                        <NavBadge badge={item.badge} />
                      </span>
                    ) : (
                      <Link
                        href={`/docs/${item.slug}`}
                        className={[
                          "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-brand-500/10 text-brand-400 border-brand-500 border-l-2 pl-[7px] font-medium"
                            : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/60",
                        ].join(" ")}
                        onClick={() => setMobileOpen(false)}
                      >
                        <span>{item.title}</span>
                        <NavBadge badge={item.badge} />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div className="border-surface-800 bg-surface-950 flex items-center gap-3 border-b px-4 py-3 lg:hidden">
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="text-surface-400 hover:text-surface-200 flex items-center gap-2 text-sm transition-colors"
          aria-expanded={mobileOpen}
          aria-label="Toggle docs navigation"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
            />
          </svg>
          <span>On this page</span>
          <svg
            className={`h-3.5 w-3.5 transition-transform ${mobileOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="border-surface-800 bg-surface-950 border-b px-4 py-4 lg:hidden">
          <SidebarContent />
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-20 max-h-[calc(100vh-5rem)] overflow-y-auto py-6 pr-4">
          <SidebarContent />
        </div>
      </aside>
    </>
  );
}
