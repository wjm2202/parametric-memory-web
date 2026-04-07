import type { Metadata } from "next";
import Link from "next/link";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Privacy Policy — Parametric Memory",
  description:
    "How Parametric Memory collects, uses, and protects your personal data. Covers GDPR, CCPA, NZ Privacy Act 2020, and Australian Privacy Principles.",
  alternates: { canonical: "https://parametric-memory.dev/privacy" },
};

export default async function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-white/50">
            Effective Date: 5 April 2026 &nbsp;·&nbsp; Last Updated: 5 April 2026
          </p>
        </div>

        {/* Legal nav */}
        <div className="mb-12 flex flex-wrap gap-3">
          {[
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

        {/* Body */}
        <div className="prose prose-invert prose-sm prose-headings:font-[family-name:var(--font-syne)] prose-headings:text-white prose-h2:text-2xl prose-h2:font-semibold prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-3 prose-p:text-white/70 prose-p:leading-relaxed prose-li:text-white/70 prose-strong:text-white prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline prose-table:text-sm prose-th:text-white prose-td:text-white/70 prose-th:bg-white/5 prose-tr:border-white/10 max-w-none">
          <h2>1. Introduction &amp; Who We Are</h2>
          <p>
            Parametric Memory Limited (&ldquo;Parametric Memory,&rdquo; &ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the{" "}
            <a href="https://parametric-memory.dev">parametric-memory.dev</a> website and the
            Parametric Memory SaaS platform (the &ldquo;Service&rdquo;). We take your privacy
            seriously and are committed to transparent practices around how we collect, use, and
            protect your data.
          </p>
          <ul>
            <li>
              <strong>Legal Entity:</strong> Parametric Memory Limited, New Zealand
            </li>
            <li>
              <strong>Data Controller:</strong> Parametric Memory Limited
            </li>
            <li>
              <strong>Main Purpose:</strong> We provide an AI-augmented memory platform that stores
              conversation history as &ldquo;memory atoms&rdquo; using a Markov-Merkle data
              structure, allowing AI assistants (like Claude) to retain and retrieve context across
              conversations.
            </li>
            <li>
              <strong>Website:</strong> parametric-memory.dev
            </li>
            <li>
              <strong>Jurisdiction:</strong> Governed by New Zealand law, with compliance for GDPR
              (EU/UK users), CCPA/CPRA (California users), and the Australian Privacy Principles
              (Australian users).
            </li>
          </ul>
          <p>
            <strong>Contact:</strong>{" "}
            <a href="mailto:privacy@parametric-memory.dev">privacy@parametric-memory.dev</a>
          </p>

          <h2>2. What Data We Collect</h2>

          <h3>2.1 Account Information</h3>
          <p>
            When you create an account, we collect your email address, account creation date,
            account type (free or paid subscription), and authentication tokens and session
            identifiers.
          </p>

          <h3>2.2 Memory Atoms &amp; Conversation History</h3>
          <p>
            The core of our Service is storing your AI conversation history as &ldquo;memory
            atoms.&rdquo; This includes raw conversation text (your prompts and AI responses),
            metadata (timestamp, conversation ID, model used), processed atoms (semantic tags,
            embeddings, Markov-chain relationships), and historical versions for audit purposes.
          </p>
          <p>
            <strong>Important:</strong> Memory atoms are stored on a private, customer-specific
            DigitalOcean droplet (your &ldquo;substrate&rdquo;). You retain full ownership. We do
            not use your memory atoms to train models or improve our Service beyond operational
            necessity.
          </p>

          <h3>2.3 Usage &amp; Analytics Data</h3>
          <p>
            We collect basic server-side analytics from access logs: API request metadata, error
            logs, and request timing. We do not use any third-party analytics services or tracking
            scripts. No client-side analytics cookies are set.
          </p>

          <h3>2.4 Payment Information</h3>
          <p>
            When you subscribe to a paid plan, we collect your billing email, Stripe customer ID,
            payment method information (card last 4 digits and expiry only), subscription dates, and
            invoices. <strong>We do not store full credit card numbers.</strong> Stripe handles all
            payment processing and PCI compliance.
          </p>

          <h3>2.5 Technical &amp; Infrastructure Data</h3>
          <p>
            To operate your substrate and monitor Service health: droplet ID, IP address, resource
            usage, container logs, API key (stored as SHA-256 hash in our database — the raw key is
            shown once at creation only), and health check responses.
          </p>

          <h2>3. How We Use Your Data</h2>
          <p>
            We use your data only for the following purposes, each with a lawful basis under GDPR
            Article 6:
          </p>

          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Purpose</th>
                  <th>Lawful Basis</th>
                  <th>Retention</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Provide the Service</td>
                  <td>Contractual necessity (Art. 6(1)(b))</td>
                  <td>Account duration + 30 days</td>
                </tr>
                <tr>
                  <td>Authenticate you</td>
                  <td>Contractual necessity (Art. 6(1)(b))</td>
                  <td>Account duration + 7 days</td>
                </tr>
                <tr>
                  <td>Process payments</td>
                  <td>Contractual necessity (Art. 6(1)(b))</td>
                  <td>7 years (tax/audit)</td>
                </tr>
                <tr>
                  <td>Send transactional emails</td>
                  <td>Contractual necessity (Art. 6(1)(b))</td>
                  <td>Until account deletion</td>
                </tr>
                <tr>
                  <td>Improve the Service</td>
                  <td>Legitimate interest (Art. 6(1)(f))</td>
                  <td>14 days (server logs)</td>
                </tr>
                <tr>
                  <td>Detect fraud &amp; abuse</td>
                  <td>Legitimate interest (Art. 6(1)(f))</td>
                  <td>30 days</td>
                </tr>
                <tr>
                  <td>Comply with law</td>
                  <td>Legal obligation (Art. 6(1)(c))</td>
                  <td>As required by law</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p>
            <strong>We will never</strong> sell your data to third parties, use your memory atoms to
            train AI models without explicit consent, or use your email for marketing without
            consent.
          </p>

          <h2>4. Data Retention &amp; Deletion</h2>

          <h3>4.1 Active Account Data</h3>
          <ul>
            <li>
              <strong>Account information:</strong> Retained for the duration of your account
            </li>
            <li>
              <strong>Memory atoms:</strong> Retained while your account is active
            </li>
            <li>
              <strong>Server logs:</strong> Access and error logs retained for 14 days for
              operational debugging
            </li>
          </ul>

          <h3>4.2 After Account Deletion</h3>
          <ul>
            <li>Email and authentication records deleted immediately</li>
            <li>Memory atoms deleted from your substrate within 24 hours</li>
            <li>Backups retained for 30 days as a safety measure, then permanently deleted</li>
            <li>Anonymized analytics may be retained indefinitely</li>
            <li>Stripe retains billing records for 7 years for tax compliance</li>
          </ul>

          <h2>5. Who We Share Your Data With</h2>
          <p>
            We use the following sub-processors to operate the Service, each with a Data Processing
            Agreement in place:
          </p>

          <h3>5.1 Stripe, Inc. — Payment Processing</h3>
          <p>
            Processes payments, stores billing records, issues invoices. Data: billing email, Stripe
            customer ID, payment method info. Location: United States.{" "}
            <a href="https://stripe.com/en-nz/privacy">Stripe Privacy Policy</a>
          </p>

          <h3>5.2 DigitalOcean, LLC — Infrastructure &amp; Hosting</h3>
          <p>
            Hosts your memory substrate, provides DNS, SSL, and uptime monitoring. Data: droplet
            configuration, API keys (hashed), logs, IP address. Location: United States.{" "}
            <a href="https://www.digitalocean.com/legal/privacy-policy">
              DigitalOcean Privacy Policy
            </a>
          </p>

          <h3>5.3 Resend, Inc. — Email Delivery</h3>
          <p>
            Sends transactional emails (account confirmations, billing receipts). Data: email
            address and email content. Location: United States.{" "}
            <a href="https://resend.com/legal/privacy">Resend Privacy Policy</a>
          </p>

          <p>
            We do not sell, rent, or share your personal data with third parties except when
            required by law, to prevent fraud, or with your explicit written consent.
          </p>

          <h2>6. International Data Transfers</h2>
          <p>
            <strong>For GDPR users (EU/UK):</strong> New Zealand holds an adequacy decision from the
            European Commission, meaning transfers to Parametric Memory (NZ entity) are lawful under
            GDPR Article 45 without additional safeguards. For transfers to US-based sub-processors
            (DigitalOcean, Stripe, Resend), we rely on Standard Contractual Clauses (SCCs) under
            GDPR Article 46.
          </p>
          <p>
            <strong>For Australian users:</strong> Data transfers comply with the Australian Privacy
            Principles (APPs).
          </p>
          <p>
            <strong>For California users:</strong> Sub-processors are engaged as CCPA &ldquo;Service
            Providers&rdquo; and are prohibited from using your data for any purpose other than
            providing the Service.
          </p>

          <h2>7. Your Rights</h2>

          <h3>7.1 All Users</h3>
          <ul>
            <li>Right to access your personal data (free of charge, within 30 days)</li>
            <li>Right to correct inaccurate data</li>
            <li>
              Right to delete your data (we comply within 30 days except where legally required)
            </li>
            <li>Right to data portability (request your data in JSON format)</li>
            <li>Right to withdraw consent</li>
            <li>Right to lodge a complaint with your local privacy regulator</li>
          </ul>

          <h3>7.2 GDPR Rights (EU/UK Users)</h3>
          <p>
            Additional rights under GDPR: right to restrict processing (Art. 18), right to object
            (Art. 21), right regarding automated decision-making (Art. 22 — memory atoms are not
            used for automated decisions affecting your legal rights), and right not to be
            discriminated against for exercising your rights.
          </p>
          <p>
            To exercise GDPR rights: email{" "}
            <a href="mailto:privacy@parametric-memory.dev">privacy@parametric-memory.dev</a> with
            &ldquo;GDPR Data Request.&rdquo; Response within 30 days.
          </p>

          <h3>7.3 California Rights (CCPA/CPRA)</h3>
          <p>
            California residents have the right to know, delete, correct, opt-out of data sales (we
            do not sell personal data), and non-discrimination. Submit requests to{" "}
            <a href="mailto:privacy@parametric-memory.dev">privacy@parametric-memory.dev</a> with
            &ldquo;California Privacy Request.&rdquo; Response within 45 days.
          </p>

          <h3>7.4 Australian Rights (Privacy Act 1988)</h3>
          <p>
            Right to access and correct personal information, and to complain to the Office of the
            Australian Information Commissioner (OAIC). Response within 30 days.
          </p>

          <h3>7.5 New Zealand Rights (Privacy Act 2020)</h3>
          <p>
            Rights to access and correct your information under Information Privacy Principles 6–9,
            and to complain to the NZ Privacy Commissioner. Response within 20 days.
          </p>

          <h2>8. Cookies &amp; Tracking</h2>
          <p>
            We only use essential cookies required for the Service to function. We do not use any
            analytics, advertising, or tracking cookies.
          </p>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Cookie</th>
                  <th>Purpose</th>
                  <th>Type</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>mmpm_session</code>
                  </td>
                  <td>
                    Authenticate your session after magic link or TOTP login. httpOnly, secure,
                    sameSite=lax.
                  </td>
                  <td>Essential</td>
                  <td>30 days</td>
                </tr>
                <tr>
                  <td>
                    <code>mmpm_redirect</code>
                  </td>
                  <td>Store post-login redirect destination. Cleared immediately after use.</td>
                  <td>Essential</td>
                  <td>15 minutes</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Both cookies are essential for the Service to function and cannot be disabled. Because
            we set no analytics or tracking cookies, no cookie consent banner is required.
          </p>

          <h2>9. Data Security</h2>
          <p>
            All data in transit uses TLS 1.3 encryption. Memory atoms at rest are encrypted with
            AES-256. API key hashes use SHA-256 with salt. Your substrate is logically isolated — no
            cross-tenant data sharing is architecturally possible.
          </p>
          <p>
            The Markov-Merkle data structure provides cryptographic verification: each atom&apos;s
            position in the tree is mathematically verified, making tampering detectable. In the
            event of a data breach, we will notify affected users within 72 hours and report to
            relevant regulators.
          </p>

          <h2>10. AI-Specific Disclosures</h2>
          <p>
            Memory atoms are processed using semantic analysis (embeddings, NLP) and Markov chaining
            (probabilistic linking for future retrieval). Memory retrieval is{" "}
            <strong>probabilistic, not deterministic</strong> — outputs may be inaccurate, inferred,
            or incomplete. You should verify critical memory outputs independently.
          </p>
          <p>
            <strong>Your data is not used to train Claude or any third-party AI model.</strong> When
            you connect via MCP and retrieve a memory atom, that atom is sent to Anthropic&apos;s
            servers only during the live MCP call and is subject to{" "}
            <a href="https://www.anthropic.com/legal/privacy">Anthropic&apos;s Privacy Policy</a>.
          </p>

          <h2>11. Children &amp; Minors</h2>
          <p>
            The Service is not intended for users under 18 years old. We do not knowingly collect
            personal data from children. If we become aware of an underage account, we will delete
            it and all associated data within 30 days. Contact{" "}
            <a href="mailto:privacy@parametric-memory.dev">privacy@parametric-memory.dev</a> if you
            believe a child has created an account.
          </p>

          <h2>12. Data Breach Notification</h2>
          <p>
            In the event of a breach, we will notify affected users directly via email within 72
            hours (or as required by local law), notify relevant regulators (NZ Privacy
            Commissioner, EU/UK DPA, relevant US state authorities), and provide details of what
            data was affected, how the breach occurred, and what steps we are taking to remediate.
          </p>

          <h2>13. Changes to This Policy</h2>
          <p>
            We will email you at least 30 days before any material change. Material changes require
            your affirmative consent (e.g., new data uses requiring opt-in under GDPR). Continued
            use after notice constitutes acceptance of non-material changes.
          </p>

          <h2>14. How to Contact Us</h2>
          <p>
            For privacy requests:{" "}
            <a href="mailto:privacy@parametric-memory.dev">privacy@parametric-memory.dev</a> — we
            respond within 30 days and will verify your identity before disclosing personal data.
          </p>
          <p>You can also lodge a complaint with your local regulator:</p>
          <ul>
            <li>
              <strong>New Zealand:</strong>{" "}
              <a href="https://www.privacy.org.nz/" target="_blank" rel="noopener noreferrer">
                Office of the Privacy Commissioner
              </a>
            </li>
            <li>
              <strong>EU/UK:</strong> Your local Data Protection Authority (e.g., ICO in the UK,
              CNIL in France)
            </li>
            <li>
              <strong>California:</strong>{" "}
              <a href="https://oag.ca.gov/privacy" target="_blank" rel="noopener noreferrer">
                California Attorney General
              </a>
            </li>
            <li>
              <strong>Australia:</strong>{" "}
              <a href="https://www.oaic.gov.au/" target="_blank" rel="noopener noreferrer">
                Office of the Australian Information Commissioner (OAIC)
              </a>
            </li>
          </ul>

          <h2>15. Summary of Rights by Location</h2>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Governing Law</th>
                  <th>Response Time</th>
                  <th>Regulator</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>New Zealand</td>
                  <td>Privacy Act 2020</td>
                  <td>20 days</td>
                  <td>NZ Privacy Commissioner</td>
                </tr>
                <tr>
                  <td>EU / UK</td>
                  <td>GDPR / UK GDPR</td>
                  <td>30 days</td>
                  <td>Local DPA / ICO</td>
                </tr>
                <tr>
                  <td>California</td>
                  <td>CCPA / CPRA</td>
                  <td>45 days</td>
                  <td>California CPPA</td>
                </tr>
                <tr>
                  <td>Australia</td>
                  <td>Privacy Act 1988</td>
                  <td>30 days</td>
                  <td>OAIC</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer nav */}
        <div className="mt-16 border-t border-white/10 pt-8">
          <p className="text-sm text-white/40">
            Parametric Memory Limited · New Zealand ·{" "}
            <a
              href="mailto:privacy@parametric-memory.dev"
              className="text-white/60 hover:text-white"
            >
              privacy@parametric-memory.dev
            </a>
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
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
