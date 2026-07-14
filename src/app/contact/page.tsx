import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { SUPPORT_EMAIL, mailto, SITE_ORIGIN } from "@/config/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with Parametric Memory — sales and enterprise enquiries, technical support, and partnership questions. Built and operated from New Zealand.",
  alternates: { canonical: `${SITE_ORIGIN}/contact` },
  keywords: [
    "contact Parametric Memory",
    "Parametric Memory sales",
    "AI memory support",
    "enterprise AI memory enquiry",
    "MCP memory support",
  ],
  openGraph: {
    title: "Contact | Parametric Memory",
    description:
      "Reach the Parametric Memory team for sales, enterprise, and technical support enquiries. Built and operated from New Zealand.",
    url: `${SITE_ORIGIN}/contact`,
    siteName: "Parametric Memory",
    type: "website",
    images: [
      {
        url: `${SITE_ORIGIN}/brand/og.png`,
        width: 1200,
        height: 630,
        alt: "Parametric Memory — Contact",
      },
    ],
  },
};

// ContactPage JSON-LD — lets search + AI answer engines surface the right
// contact route and email for sales / support intents. Mirrors the
// Organization ContactPoint nodes in src/app/layout.tsx (same SUPPORT_EMAIL).
const contactJsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact Parametric Memory",
  url: `${SITE_ORIGIN}/contact`,
  description: "Contact Parametric Memory for sales, enterprise, and technical support enquiries.",
  mainEntity: {
    "@type": "Organization",
    name: "Parametric Memory",
    url: SITE_ORIGIN,
    email: SUPPORT_EMAIL,
    contactPoint: [
      {
        "@type": "ContactPoint",
        email: SUPPORT_EMAIL,
        contactType: "sales",
        availableLanguage: "English",
      },
      {
        "@type": "ContactPoint",
        email: SUPPORT_EMAIL,
        contactType: "technical support",
        availableLanguage: "English",
      },
    ],
  },
};

export default async function ContactPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("mmpm_session");
  const isLoggedIn = !!sessionCookie?.value;

  const channels = [
    {
      label: "Sales & enterprise",
      body: "Custom arrangements for larger teams, Enterprise Cloud, and self-hosted deployments. Tell us your team size and use case and we'll put together a plan.",
      cta: "Email sales",
      href: mailto("Sales enquiry — Parametric Memory"),
    },
    {
      label: "Technical support",
      body: "Setup help, MCP connection issues, API key rotation, billing questions. Existing customers get a reply within one business day.",
      cta: "Email support",
      href: mailto("Support request — Parametric Memory"),
    },
    {
      label: "Partnerships & press",
      body: "Integrations, co-marketing, or media questions about verifiable AI memory, Merkle proofs, and Markov prediction.",
      cta: "Email the team",
      href: mailto("Partnership / press — Parametric Memory"),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }}
      />

      <SiteNavbar variant="standard" isLoggedIn={isLoggedIn} />

      <main className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-6 pt-32 pb-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#2a2a3d] bg-[#12121a] px-3 py-1 text-xs text-[#8888aa]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7c5cfc]" />
            We read every message.
          </div>

          <h1 className="font-syne mb-6 text-4xl leading-tight font-bold tracking-tight text-[#e8e8f0] sm:text-5xl">
            Get in{" "}
            <span className="bg-gradient-to-r from-[#7c5cfc] to-[#22d3ee] bg-clip-text text-transparent">
              touch.
            </span>
          </h1>

          <p className="text-lg leading-relaxed text-[#8888aa]">
            Questions about Parametric Memory, pricing for your team, or help getting your AI agent
            connected? Reach the team directly — there&apos;s a human (and a fleet of agents) on the
            other end.
          </p>
        </section>

        {/* ── Contact channels ──────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-6 pb-16">
          <div className="grid gap-4 sm:grid-cols-3">
            {channels.map(({ label, body, cta, href }) => (
              <div
                key={label}
                className="flex flex-col rounded-xl border border-[#2a2a3d] bg-[#12121a] p-6"
              >
                <div className="mb-2 font-semibold text-[#e8e8f0]">{label}</div>
                <p className="mb-5 flex-1 text-sm leading-relaxed text-[#8888aa]">{body}</p>
                <a
                  href={href}
                  className="inline-flex items-center justify-center rounded-lg border border-[#2a2a3d] px-4 py-2 text-sm font-medium text-[#b0b0c8] transition-colors hover:border-[#7c5cfc] hover:text-[#e8e8f0]"
                >
                  {cta}
                </a>
              </div>
            ))}
          </div>

          <p className="mt-6 text-sm text-[#8888aa]">
            Prefer one address?{" "}
            <a
              href={mailto()}
              className="text-[#7c5cfc] underline decoration-[#7c5cfc]/40 underline-offset-2 transition-colors hover:text-[#22d3ee]"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            reaches us for anything.
          </p>
        </section>

        {/* ── Faster answers ────────────────────────────────────────────── */}
        <section className="border-t border-[#1a1a26] bg-[#0d0d14] px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-syne mb-3 text-2xl font-bold text-[#e8e8f0]">
              Looking for a faster answer?
            </h2>
            <p className="mb-8 leading-relaxed text-[#8888aa]">
              A lot of common questions are already answered. These are the quickest paths before
              you email.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  title: "FAQ",
                  body: "Merkle proofs, Markov prediction, how we compare to Mem0 and Zep, security, and setup.",
                  href: "/faq",
                },
                {
                  title: "Documentation",
                  body: "Connect your agent over MCP, manage your substrate, rotate keys, and integrate billing.",
                  href: "/docs/introduction",
                },
                {
                  title: "Pricing",
                  body: "Shared from $5/mo, dedicated from $29/mo, plus enterprise tiers. 7-day money-back guarantee.",
                  href: "/pricing",
                },
                {
                  title: "About",
                  body: "Who builds Parametric Memory, the architecture choices behind it, and how we run on it ourselves.",
                  href: "/about",
                },
              ].map(({ title, body, href }) => (
                <Link
                  key={title}
                  href={href}
                  className="group rounded-xl border border-[#2a2a3d] bg-[#12121a] p-6 transition-colors hover:border-[#7c5cfc]"
                >
                  <div className="mb-2 font-semibold text-[#e8e8f0] group-hover:text-[#7c5cfc]">
                    {title} →
                  </div>
                  <p className="text-sm leading-relaxed text-[#8888aa]">{body}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-xl text-center">
            <p className="font-syne mb-3 text-lg font-semibold text-[#e8e8f0]">
              Ready to give your AI a memory?
            </p>
            <p className="mb-8 text-sm text-[#8888aa]">7-day money-back guarantee.</p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/signup"
                className="rounded-lg bg-[#7c5cfc] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Get started free
              </Link>
              <Link
                href="/pricing"
                className="rounded-lg border border-[#2a2a3d] px-6 py-3 text-sm font-medium text-[#8888aa] transition-colors hover:border-[#7c5cfc] hover:text-[#e8e8f0]"
              >
                View pricing →
              </Link>
            </div>
            <p className="mt-8 text-xs text-[#555570]">
              Parametric Memory is built and operated by Entity One, from New Zealand.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
