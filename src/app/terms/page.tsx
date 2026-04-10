import type { Metadata } from "next";
import Link from "next/link";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Terms of Service — Parametric Memory",
  description:
    "Terms of Service for Parametric Memory. Covers subscriptions, AI disclaimers, data retention, liability limits, and dispute resolution.",
  alternates: { canonical: "https://parametric-memory.dev/terms" },
  openGraph: {
    title: "Terms of Service | Parametric Memory",
    description:
      "Terms of Service for Parametric Memory — subscription terms, AI disclaimers, liability limits.",
    url: "https://parametric-memory.dev/terms",
    images: [
      {
        url: "https://parametric-memory.dev/brand/og.png",
        width: 1200,
        height: 630,
        alt: "Parametric Memory Terms of Service",
      },
    ],
  },
};

export default async function TermsPage() {
  const cookieStore = await cookies();
  const isLoggedIn = Boolean(cookieStore.get("mmpm_session")?.value);

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <SiteNavbar isLoggedIn={isLoggedIn} />

      <main className="mx-auto max-w-3xl px-6 py-20">
        {/* Header */}
        <div className="mb-12">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            Legal
          </div>
          <h1 className="font-[family-name:var(--font-syne)] text-4xl font-bold text-white">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-white/50">
            Effective Date: 5 April 2026 &nbsp;·&nbsp; Governing Law: New Zealand
          </p>
        </div>

        {/* Legal nav */}
        <div className="mb-12 flex flex-wrap gap-3">
          {[
            { href: "/privacy", label: "Privacy Policy" },
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

        <div className="prose prose-invert prose-sm prose-headings:font-[family-name:var(--font-syne)] prose-headings:text-white prose-h2:text-2xl prose-h2:font-semibold prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-3 prose-p:text-white/70 prose-p:leading-relaxed prose-li:text-white/70 prose-strong:text-white prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline prose-table:text-sm prose-th:text-white prose-td:text-white/70 prose-th:bg-white/5 prose-tr:border-white/10 max-w-none">
          <h2>1. Agreement to Terms</h2>
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) constitute a legally binding agreement
            between you (the &ldquo;User,&rdquo; &ldquo;you,&rdquo; or &ldquo;your&rdquo;) and
            Parametric Memory Limited, a company incorporated in New Zealand (&ldquo;MMPM,&rdquo;
            &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By creating an account,
            clicking &ldquo;I agree,&rdquo; or accessing the MMPM service in any way, you signify
            that you have read, understood, and agree to be bound by these Terms.
          </p>
          <p>
            If you are entering into these Terms on behalf of a business or organization, you
            represent and warrant that you have authority to bind that entity to these Terms.
          </p>

          <h2>2. Service Description</h2>
          <p>
            Parametric Memory is a cloud-based AI memory system that stores and reconstructs
            conversation history using a probabilistic Markov-Merkle data structure. Upon
            subscription, eligible users receive a dedicated &ldquo;substrate&rdquo; — an isolated
            DigitalOcean droplet running containerized MMPM services. Substrates are user-specific,
            managed by MMPM, accessible via REST API, and subject to the storage and compute limits
            of your plan.
          </p>

          <h2>3. Eligibility</h2>
          <p>
            You represent and warrant that you are at least 18 years of age, have legal capacity to
            enter into these Terms, are not subject to applicable sanctions restrictions, and will
            use MMPM in compliance with all applicable laws.
          </p>

          <h2>4. Account Creation &amp; Security</h2>
          <p>
            MMPM uses email magic-link authentication. You are responsible for keeping your
            credentials confidential, not sharing API keys or bearer tokens, immediately notifying
            us of unauthorized access, and all activity that occurs under your account. We are not
            liable for unauthorized access resulting from your failure to secure your credentials.
          </p>

          <h2>5. Subscription Plans &amp; Payment</h2>

          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Price</th>
                  <th>Memory Atoms</th>
                  <th>Retention</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Starter</td>
                  <td>$3/mo</td>
                  <td>1,000</td>
                  <td>12 months</td>
                </tr>
                <tr>
                  <td>Solo</td>
                  <td>$9/mo</td>
                  <td>10,000</td>
                  <td>12 months</td>
                </tr>
                <tr>
                  <td>Professional</td>
                  <td>$29/mo</td>
                  <td>100,000</td>
                  <td>24 months</td>
                </tr>
                <tr>
                  <td>Team</td>
                  <td>$79/mo</td>
                  <td>500,000</td>
                  <td>36 months</td>
                </tr>
                <tr>
                  <td>Enterprise Cloud</td>
                  <td>$299/mo</td>
                  <td>Unlimited</td>
                  <td>36 months</td>
                </tr>
                <tr>
                  <td>Enterprise Self-Hosted</td>
                  <td>$499/mo</td>
                  <td>Unlimited</td>
                  <td>Unlimited</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p>
            Subscriptions auto-renew at the end of each billing period unless canceled. All payments
            are processed via Stripe. We will provide 30 days&rsquo; notice before any price
            increase. If a payment fails, we retry 3–5 times over 10 days; if unsuccessful, your
            subscription is suspended and data retained for 30 days before deletion.
          </p>

          <p>
            <strong>Refunds:</strong> Subscriptions are non-refundable except if you cancel within 7
            days of initial purchase (full refund), or where mandatory consumer law in your
            jurisdiction requires otherwise.
          </p>

          <h2>6. Cancellation &amp; Termination</h2>
          <p>
            You may cancel your subscription at any time via account settings or by contacting{" "}
            <a href="mailto:support@parametric-memory.dev">support@parametric-memory.dev</a>. Upon
            cancellation:
          </p>
          <ul>
            <li>
              <strong>30-day wind-down:</strong> You retain full API access
            </li>
            <li>
              <strong>Data export:</strong> You may export or delete your data during the 30-day
              period
            </li>
            <li>
              <strong>90-day backup purge:</strong> Automated backups are purged 90 days after
              cancellation
            </li>
            <li>
              <strong>No forensic recovery</strong> after the 90-day backup purge
            </li>
          </ul>
          <p>
            We may terminate your account immediately for breach of these Terms or our Acceptable
            Use Policy, illegal activity, non-payment after 30 days, or if required by law.
          </p>

          <h2>7. Disclaimer of Warranties</h2>

          <div className="not-prose rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
            <p className="mb-4 font-mono text-xs font-semibold tracking-wide text-amber-400 uppercase">
              Important — Please Read Carefully
            </p>
            <div className="space-y-3 text-sm leading-relaxed font-semibold text-white/80 uppercase">
              <p>
                THE SERVICE IS PROVIDED ON AN &ldquo;AS-IS&rdquo; AND &ldquo;AS-AVAILABLE&rdquo;
                BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
              </p>
              <p>
                WE DO NOT WARRANT THAT MEMORY ATOMS ARE ACCURATE, COMPLETE, OR FAITHFUL TO SOURCE.
                RECONSTRUCTED DATA IS PROBABILISTIC AND MAY BE INACCURATE, INFERRED, OR OMIT
                IMPORTANT DETAILS.
              </p>
              <p>
                WE DO NOT WARRANT UNINTERRUPTED SERVICE, FITNESS FOR A PARTICULAR PURPOSE, OR THAT
                DELETED DATA CAN BE RECOVERED.
              </p>
              <p>
                MEMORY ATOMS ARE NOT SUITABLE FOR MISSION-CRITICAL APPLICATIONS, MEDICAL, LEGAL, OR
                FINANCIAL DECISION-MAKING WITHOUT INDEPENDENT VERIFICATION.
              </p>
              <p className="text-amber-300">
                THESE DISCLAIMERS APPLY TO THE MAXIMUM EXTENT PERMITTED BY LAW. MANDATORY CONSUMER
                PROTECTION STATUTES IN YOUR JURISDICTION (INCLUDING THE EU UNFAIR TERMS DIRECTIVE,
                UK CONSUMER RIGHTS ACT 2015, AUSTRALIAN CONSUMER LAW, AND CCPA) MAY PROVIDE RIGHTS
                THAT CANNOT BE WAIVED. IF YOU ARE A CONSUMER, YOU RETAIN ALL SUCH STATUTORY RIGHTS
                REGARDLESS OF THESE DISCLAIMERS.
              </p>
            </div>
          </div>

          <h2>8. Limitation of Liability</h2>

          <div className="not-prose rounded-xl border border-red-500/20 bg-red-500/5 p-6">
            <p className="mb-4 font-mono text-xs font-semibold tracking-wide text-red-400 uppercase">
              Liability Limits
            </p>
            <div className="space-y-3 text-sm leading-relaxed font-semibold text-white/80 uppercase">
              <p>
                MMPM&rsquo;S TOTAL LIABILITY FOR ANY CLAIM SHALL NOT EXCEED THE TOTAL FEES PAID BY
                YOU IN THE 12 MONTHS PRECEDING THE CLAIM. IF YOU HAVE PAID NOTHING, LIABILITY IS
                LIMITED TO $100 USD.
              </p>
              <p>
                MMPM SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
                PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING LOST PROFITS, LOST DATA, BUSINESS
                INTERRUPTION, OR LOSS OF GOODWILL.
              </p>
            </div>
            <p className="mt-4 text-sm text-white/60">
              <strong className="text-white">Exceptions — the cap does not apply to:</strong> death
              or personal injury caused by our negligence; fraud or willful misconduct; gross
              negligence; violations of your statutory consumer protection rights; GDPR data
              processing violations; or breach of our confidentiality obligations.
            </p>
            <p className="mt-3 text-sm font-semibold text-amber-300 uppercase">
              IF YOU ARE A CONSUMER IN A JURISDICTION WITH MANDATORY CONSUMER PROTECTION LAWS, THE
              LIABILITY CAP MAY NOT FULLY APPLY. YOU RETAIN ALL STATUTORY RIGHTS THAT CANNOT BE
              WAIVED UNDER YOUR LOCAL LAW.
            </p>
          </div>

          <h2>9. AI-Specific Disclaimers</h2>
          <p>This section is critical. Please read it before relying on memory outputs.</p>

          <h3>9.1 Probabilistic Reconstruction</h3>
          <p>
            Memory atoms are outputs of a probabilistic machine learning model. The same query may
            produce different outputs on different dates (stochasticity). MMPM reconstructs context
            that was not explicitly stored — inferred content may be plausible but inaccurate. MMPM
            may generate false or misleading information that appears truthful (hallucination risk).
            Outputs may reflect biases present in underlying training data.
          </p>

          <h3>9.2 Your Responsibility to Verify</h3>
          <p>
            You are solely responsible for independently verifying all memory outputs before relying
            on them, using memory atoms for informational purposes only (not as a substitute for
            independent verification), and understanding the limitations of probabilistic AI
            systems.
          </p>

          <h3>9.3 Data Deletion &amp; Forensic Recovery</h3>
          <p>
            Deletion removes access to your data within 24 hours. Automated backups are purged
            within 90 days. After 90 days, we provide no forensic recovery guarantee. Cold-storage
            data older than 2 years is not recoverable.{" "}
            <strong>MMPM is not a backup system.</strong>
          </p>

          <h3>9.4 No Automated Decision-Making</h3>
          <p>
            MMPM does not make automatic decisions that affect your legal rights. Memory atoms are
            not used for credit decisions, hiring, loan qualification, or similar high-stakes
            determinations without explicit customer configuration and human oversight. If you
            believe MMPM is being used to make automated decisions affecting your legal rights,
            contact <a href="mailto:support@parametric-memory.dev">support@parametric-memory.dev</a>{" "}
            immediately.
          </p>

          <h2>10. Intellectual Property</h2>
          <p>
            You retain all rights to the data and memory atoms you store in MMPM. You grant us a
            limited, non-exclusive, royalty-free license to store, process, retrieve, and back up
            your data solely to provide the Service. We will not sell, commercialize, or use your
            data for training AI models without explicit opt-in consent.
          </p>
          <p>
            The MMPM platform, software, Markov-Merkle algorithms, API, and all associated
            intellectual property are our exclusive property. You receive a limited, non-exclusive,
            non-transferable license to use MMPM in accordance with these Terms. You may not
            reverse-engineer, copy, sublicense, or use MMPM to develop a competing product.
          </p>

          <h2>11. Acceptable Use</h2>
          <p>
            You agree to comply with our <Link href="/aup">Acceptable Use Policy</Link>, which is
            incorporated by reference. Key prohibitions include: illegal activities, unauthorized
            access to other substrates, reverse engineering MMPM&rsquo;s architecture, using memory
            for automated decisions affecting legal rights without human oversight, storing
            children&apos;s data without appropriate safeguards, crypto mining, spam, and training
            competing AI models on extracted atoms.
          </p>

          <h2>12. Privacy</h2>
          <p>
            Your use of MMPM is governed by our <Link href="/privacy">Privacy Policy</Link>,
            incorporated by reference. For B2B customers whose use involves processing personal data
            on behalf of end users, our <Link href="/dpa">Data Processing Agreement</Link> applies
            and is incorporated by reference.
          </p>

          <h2>13. Governing Law &amp; Dispute Resolution</h2>

          <h3>13.1 For Business / Commercial Customers</h3>
          <p>
            Governing law: New Zealand. Disputes are subject to the exclusive jurisdiction of the
            District Court or High Court of New Zealand, seated in Auckland. Either party may
            require binding UNCITRAL arbitration in Auckland for claims exceeding NZ$10,000.
          </p>

          <h3>13.2 For Consumer Customers</h3>
          <p>
            Governing law: New Zealand. However, if you are a consumer in a jurisdiction with
            mandatory consumer protection laws (EU, UK, Australia, California, and others), you
            retain the right to bring claims in the courts of your home country. We will not require
            consumers to litigate exclusively in New Zealand.
          </p>
          <p>
            <em>
              Example: An EU consumer may bring a claim under GDPR in a German court, despite NZ law
              governing this agreement. An Australian consumer may pursue remedies under the
              Australian Consumer Law in Australian courts.
            </em>
          </p>

          <h3>13.3 Informal Resolution First</h3>
          <p>
            Before formal proceedings, both parties agree to attempt good-faith negotiation via
            email for 30 days. Contact{" "}
            <a href="mailto:legal@parametric-memory.dev">legal@parametric-memory.dev</a> to
            initiate.
          </p>

          <h2>14. Changes to These Terms</h2>
          <p>
            We may update these Terms at any time. Material changes require 30 days&rsquo; prior
            written notice via email and a notice on our website. Your continued use after the
            notice period constitutes acceptance. If you object to material changes, you may cancel
            your subscription without penalty before the new Terms take effect.
          </p>

          <h2>15. General</h2>
          <p>
            <strong>Severability:</strong> If any provision is held invalid, it will be severed and
            the remainder of the Terms continues in full force.
          </p>
          <p>
            <strong>Waiver:</strong> Failure to enforce any provision is not a waiver of that right.
          </p>
          <p>
            <strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy,
            Acceptable Use Policy, and any applicable DPA, constitute the entire agreement between
            you and MMPM.
          </p>

          <h2>16. Contact</h2>
          <ul>
            <li>
              <strong>General support:</strong>{" "}
              <a href="mailto:support@parametric-memory.dev">support@parametric-memory.dev</a>
            </li>
            <li>
              <strong>Legal inquiries:</strong>{" "}
              <a href="mailto:legal@parametric-memory.dev">legal@parametric-memory.dev</a>
            </li>
            <li>
              <strong>Privacy requests:</strong>{" "}
              <a href="mailto:privacy@parametric-memory.dev">privacy@parametric-memory.dev</a>
            </li>
          </ul>

          <div className="not-prose mt-12 rounded-xl border border-white/10 bg-white/[0.03] p-6">
            <p className="mb-4 text-sm font-semibold text-white">Quick Reference Summary</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ["Warranty", "AS-IS; no accuracy, uptime, or recovery guarantee"],
                    ["Memory Atoms", "Probabilistic — may be inaccurate or inferred"],
                    ["Liability Cap", "12 months of fees paid (or $100 minimum)"],
                    ["Auto-Renewal", "Monthly; cancel anytime with 30-day wind-down"],
                    [
                      "Data Deletion",
                      "30-day access removal; 90-day backup purge; no forensic guarantee",
                    ],
                    ["B2B Disputes", "NZ courts; UNCITRAL arbitration in Auckland"],
                    ["Consumer Disputes", "Home-country courts retained per mandatory local law"],
                    ["Governing Law", "New Zealand"],
                  ].map(([topic, rule]) => (
                    <tr key={topic} className="border-b border-white/5">
                      <td className="py-2 pr-4 font-medium whitespace-nowrap text-white/80">
                        {topic}
                      </td>
                      <td className="py-2 text-white/60">{rule}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer nav */}
        <div className="mt-16 border-t border-white/10 pt-8">
          <p className="text-sm text-white/40">
            Parametric Memory Limited · New Zealand ·{" "}
            <a href="mailto:legal@parametric-memory.dev" className="text-white/60 hover:text-white">
              legal@parametric-memory.dev
            </a>
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/privacy" className="text-white/40 hover:text-white/70">
              Privacy Policy
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
