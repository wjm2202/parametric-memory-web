/**
 * /hero-preview — staging route for the candidate landing hero.
 *
 * noindex. Renders the real navbar + HeroL2Cache so the prototype can be
 * reviewed in situ (fonts, tokens, viewport) without touching the live
 * landing page. Delete this route once the hero ships in page.tsx.
 *
 * Statically rendered: login state is detected client-side by SiteNavbar
 * (src/lib/use-session.ts) — no `cookies()` here, per static-render-guard.
 */

import type { Metadata } from "next";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { HeroL2Cache } from "@/components/landing/HeroL2Cache";

export const metadata: Metadata = {
  title: "Hero preview — Parametric Memory",
  robots: { index: false, follow: false },
};

export default function HeroPreviewPage() {
  return (
    <>
      <SiteNavbar variant="standard" />
      <main>
        <HeroL2Cache />
      </main>
    </>
  );
}
