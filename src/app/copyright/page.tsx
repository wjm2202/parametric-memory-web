/* ── /copyright — public-facing copyright & licensing page ────────────────
 * Mirrors the visual style of /privacy, /terms, /aup, /dpa. The wording
 * here is the human-readable companion to the LICENSE file at the repo
 * root. Tests in src/app/copyright/__tests__/page.test.tsx pin the exact
 * legal sentences below; if you edit the wording, update the test too.
 *
 * Why this page exists:
 *   • establishes New Zealand as place of first publication and jurisdiction
 *   • clarifies that the underlying software is owned by G. Osborne
 *     personally, NOT by Parametric Memory Limited (the licensee)
 *   • puts the human-authorship statement on the public record so the
 *     copyright claim is harder to challenge later
 *
 * NOT legal advice. The author should have a NZ IP lawyer review this
 * page and the LICENSE before relying on it for enforcement action.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import SiteNavbar from "@/components/ui/SiteNavbar";

import { SUPPORT_EMAIL } from "@/config/site";
export const metadata: Metadata = {
  title: "Copyright & Licensing — Parametric Memory",
  description:
    "Copyright statement and licensing terms for Parametric Memory software. Authored in New Zealand by G. Osborne. Licensed to Parametric Memory Limited under New Zealand law.",
  alternates: { canonical: "https://parametric-memory.dev/copyright" },
  openGraph: {
    title: "Copyright & Licensing | Parametric Memory",
    description:
      "Copyright and licensing for Parametric Memory software — authored in New Zealand, licensed to Parametric Memory Limited.",
    url: "https://parametric-memory.dev/copyright",
    images: [
      {
        url: "https://parametric-memory.dev/brand/og.png",
        width: 1200,
        height: 630,
        alt: "Parametric Memory Copyright & Licensing",
      },
    ],
  },
};

export default async function CopyrightPage() {
  const cookieStore = await cookies();
  const isLoggedIn = Boolean(cookieStore.get("mmpm_session")?.value);

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <SiteNavbar isLoggedIn={isLoggedIn} />

      <main className="mx-auto max-w-3xl px-6 py-20" data-testid="copyright-page-main">
        {/* Header */}
        <div className="mb-12">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            Legal
          </div>
          <h1
            className="font-[family-name:var(--font-syne)] text-4xl font-bold text-white"
            data-testid="copyright-page-heading"
          >
            Copyright &amp; Licensing
          </h1>
          <p className="mt-3 text-sm text-white/50">
            Effective Date: 27 April 2026 &nbsp;·&nbsp; Last Updated: 27 April 2026
          </p>
        </div>

        {/* Legal nav */}
        <div className="mb-12 flex flex-wrap gap-3">
          {[
            { href: "/privacy", label: "Privacy Policy" },
            { href: "/terms", label: "Terms of Service" },
            { href: "/aup", label: "Acceptable Use" },
            { href: "/dpa", label: "Data Processing Agreement" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 transition-colors hover:border-white/20 hover:text-white/80"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Canonical short notice — pinned by SiteFooter test too */}
        <div
          className="mb-12 rounded-lg border border-white/10 bg-white/[0.04] p-6"
          data-testid="copyright-canonical-notice"
        >
          <p className="font-mono text-sm leading-relaxed text-white/80">
            © 2025–2026 G. Osborne. All rights reserved. Authored in New Zealand.
          </p>
          <p className="mt-2 font-mono text-xs leading-relaxed text-white/50">
            Parametric Memory Limited is a licensee of this software, not its owner.
          </p>
        </div>

        {/* Body */}
        <div className="prose prose-invert prose-sm prose-headings:font-[family-name:var(--font-syne)] prose-headings:text-white prose-h2:text-2xl prose-h2:font-semibold prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-3 prose-p:text-white/70 prose-p:leading-relaxed prose-li:text-white/70 prose-strong:text-white prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline max-w-none">
          <h2>1. Author and Ownership</h2>
          <p data-testid="copyright-authorship-statement">
            The Parametric Memory software (the &ldquo;Work&rdquo;) is the original and proprietary
            work of its sole human author, <strong>G. Osborne</strong> (the &ldquo;Author&rdquo;).
            The Author conceived, directed, reviewed and corrected all material contained herein.
            AI-based code generation tools were used as instruments of authorship under the
            Author&rsquo;s continuous direction and editorial control; no part of the Work was
            produced autonomously by an AI system.
          </p>
          <p>
            All right, title and interest in and to the Work &mdash; including all copyright, trade
            secret, patent and other intellectual property rights &mdash; vest exclusively in the
            Author. <strong>Parametric Memory Limited</strong>, a company incorporated in New
            Zealand, is a <em>licensee</em> of the Work, not its owner.
          </p>

          <h2>2. Place of Authorship and Jurisdiction</h2>
          <p data-testid="copyright-jurisdiction-statement">
            The Work was first authored and first published in <strong>New Zealand</strong>. New
            Zealand is the place of authorship for the purposes of the <em>Copyright Act 1994</em>{" "}
            (New Zealand) and the Berne Convention for the Protection of Literary and Artistic
            Works.
          </p>
          <p>
            Any dispute arising out of or in connection with the Work, this notice, or any licence
            granted in respect of the Work is governed by the laws of New Zealand. The parties
            submit to the <strong>exclusive jurisdiction of the courts of New Zealand</strong>.
          </p>

          <h2>3. Licence to Parametric Memory Limited</h2>
          <p>
            The Author has granted Parametric Memory Limited a licence to use the Work in connection
            with its business, including operating the Parametric Memory service, under a separate
            written agreement between the Author and Parametric Memory Limited.
          </p>
          <p>Under that agreement:</p>
          <ul>
            <li>
              the Author retains <strong>all underlying rights, title and interest</strong> in and
              to the Work;
            </li>
            <li>
              the Author makes <strong>no warranty</strong> as to the Work or its fitness for any
              particular purpose; and
            </li>
            <li>
              the Author accepts <strong>no liability</strong> for the manner in which Parametric
              Memory Limited, its affiliates, employees, agents or customers use the Work.
            </li>
          </ul>
          <p>
            The licence between the Author and Parametric Memory Limited is non-transferable and may
            be amended or terminated only by written agreement between the parties. For the
            avoidance of doubt, the licence to Parametric Memory Limited does not confer any
            ownership of the Work upon Parametric Memory Limited.
          </p>

          <h2>4. No Other Licence Granted</h2>
          <p>
            No licence to use, copy, modify, distribute, sublicense, publicly perform, publicly
            display, or create derivative works of the Work is granted to any person or entity
            except as expressly agreed in writing by the Author. Unauthorised use, reproduction,
            modification or distribution is prohibited and may result in civil and/or criminal
            liability under the <em>Copyright Act 1994</em> (New Zealand) and applicable
            international copyright treaties.
          </p>

          <h2>5. No Warranty &amp; No Liability</h2>
          <p className="font-mono text-xs tracking-wide uppercase">
            The Work is provided &ldquo;as is&rdquo;, without warranty of any kind, express or
            implied, including but not limited to the implied warranties of merchantability, fitness
            for a particular purpose, non-infringement and quiet enjoyment. The Author makes no
            warranty that the Work will meet any particular requirements, be uninterrupted, be
            error-free, or be secure.
          </p>
          <p className="font-mono text-xs tracking-wide uppercase">
            To the fullest extent permitted by law, the Author shall not be liable for any claim,
            damages or other liability (whether in contract, tort including negligence, or
            otherwise) arising from or in connection with the Work or its use, including use by
            Parametric Memory Limited.
          </p>
          <p>
            Nothing in this notice limits or excludes any liability that cannot be limited or
            excluded under New Zealand law. Where the <em>Consumer Guarantees Act 1993</em> (New
            Zealand) applies notwithstanding section 43 of that Act, that Act prevails to the extent
            of any inconsistency.
          </p>

          <h2>6. Canonical Licence Text</h2>
          <p>
            The full canonical licence is the <code>LICENSE</code> file shipped with each of the
            Author&rsquo;s software repositories. Where any README, package metadata, source-code
            header, marketing material or other artefact appears to grant rights broader than those
            set out in the <code>LICENSE</code> file or this page, the <code>LICENSE</code> file
            prevails.
          </p>

          <h2>7. Contact</h2>
          <p>
            Licensing enquiries, attribution disputes, and takedown requests:&nbsp;
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>

          <h2>8. Not Legal Advice</h2>
          <p className="text-xs text-white/50">
            This page is the public copyright statement of the Author. It is not legal advice.
            Persons seeking to enter into a licensing arrangement, or who believe their rights are
            affected by this statement, should obtain independent legal advice from a qualified New
            Zealand intellectual property practitioner.
          </p>
        </div>

        {/* Footer nav */}
        <div className="mt-16 border-t border-white/10 pt-8">
          <p className="text-sm text-white/40">
            G. Osborne · New Zealand ·{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white/60 hover:text-white">
              {SUPPORT_EMAIL}
            </a>
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/privacy" className="text-white/40 hover:text-white/70">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-white/40 hover:text-white/70">
              Terms of Service
            </Link>
            <Link href="/aup" className="text-white/40 hover:text-white/70">
              Acceptable Use Policy
            </Link>
            <Link href="/dpa" className="text-white/40 hover:text-white/70">
              Data Processing Agreement
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
