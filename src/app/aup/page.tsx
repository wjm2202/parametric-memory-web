import type { Metadata } from "next";
import Link from "next/link";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Acceptable Use Policy — Parametric Memory",
  description:
    "What you may and may not do with Parametric Memory. Covers permitted uses, prohibited conduct, enforcement, and how to report violations.",
  alternates: { canonical: "https://parametric-memory.dev/aup" },
};

export default async function AUPPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token")?.value ?? null;

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <SiteNavbar sessionToken={sessionToken} />

      <main className="mx-auto max-w-3xl px-6 py-20">
        <div className="mb-12">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            Legal
          </div>
          <h1 className="font-[family-name:var(--font-syne)] text-4xl font-bold text-white">
            Acceptable Use Policy
          </h1>
          <p className="mt-3 text-sm text-white/50">
            Effective Date: 5 April 2026 &nbsp;·&nbsp; Incorporated into Terms of Service
          </p>
        </div>

        <div className="mb-12 flex flex-wrap gap-3">
          {[
            { href: "/terms", label: "Terms of Service" },
            { href: "/privacy", label: "Privacy Policy" },
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

        <div className="prose prose-invert prose-sm max-w-none prose-headings:font-[family-name:var(--font-syne)] prose-headings:text-white prose-h2:text-2xl prose-h2:font-semibold prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-3 prose-p:text-white/70 prose-p:leading-relaxed prose-li:text-white/70 prose-strong:text-white prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline">

          <h2>1. Introduction</h2>
          <p>
            This Acceptable Use Policy (&ldquo;AUP&rdquo;) is incorporated by reference into the Parametric Memory{" "}
            <Link href="/terms">Terms of Service</Link>. It sets forth permitted and prohibited uses of the Parametric Memory service. Violation of this AUP may result in immediate suspension or termination of your account and/or legal action.
          </p>

          <h2>2. Permitted Uses</h2>

          <h3>2.1 Personal &amp; Non-Commercial Use</h3>
          <ul>
            <li>Storing personal conversation context, learning notes, and memory atoms for individual use</li>
            <li>Developing, testing, and prototyping AI applications in development environments</li>
            <li>Educational purposes and research (subject to applicable laws)</li>
          </ul>

          <h3>2.2 Commercial AI Applications</h3>
          <ul>
            <li>Storing conversation memory for production AI assistants, chatbots, and agents serving end users</li>
            <li>Aggregating and retrieving contextual memory across multiple conversation threads</li>
            <li>Building enterprise AI systems that rely on persistent conversation state</li>
            <li>Integrating via our published APIs and MCP connectors</li>
          </ul>

          <h2>3. Prohibited Uses</h2>

          <h3>3.1 Illegal Content &amp; Activities</h3>
          <p>You must not store, process, or facilitate content or activities that violate New Zealand law, EU law, UK law, Australian law, or the laws of any jurisdiction where you are located. This includes stolen data, child sexual abuse material (CSAM), intellectual property you do not have the right to store, fraud, money laundering, or sanctions evasion.</p>

          <h3>3.2 Unauthorized Access &amp; Data Abuse</h3>
          <p>Do not attempt to access, retrieve, or manipulate another user&apos;s substrate, memory atoms, or API credentials. Do not share, sell, or license another user&apos;s memory atoms without explicit written consent.</p>

          <h3>3.3 Reverse Engineering</h3>
          <p>Do not reverse-engineer, decompile, or attempt to derive the proprietary Markov-Merkle tree structure. Do not perform side-channel attacks, timing attacks, or resource analysis to infer MMPM&apos;s internal architecture.</p>

          <h3>3.4 Automated Decision-Making Without Human Oversight</h3>
          <p>
            Do not use memory atoms to feed automated systems making decisions affecting a person&apos;s legal rights, financial status, credit eligibility, employment status, or access to critical services <strong>without documented human review and override mechanisms</strong>. This includes hiring decisions, credit determinations, insurance underwriting, and criminal risk assessment. If such use is necessary, you must comply with applicable AI governance laws (including the EU AI Act from August 2026).
          </p>

          <h3>3.5 Children&apos;s Data</h3>
          <p>Do not process, store, or collect personal data of individuals under 18 years of age unless you have obtained verifiable parental or guardian consent and implemented appropriate technical and organizational safeguards. Do not store conversation data from children for commercial profiling or targeting.</p>

          <h3>3.6 Sensitive Credentials &amp; Financial Data</h3>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 not-prose mb-4">
            <p className="text-sm font-semibold text-amber-400 mb-2">⚠ Security Warning</p>
            <p className="text-sm text-white/70">Do not store API keys, OAuth tokens, database credentials, passwords, full credit card numbers, bank account numbers, Social Security numbers, passport numbers, or other sensitive credentials in memory atoms. If credentials are accidentally stored, an attacker who gains access to your substrate could compromise your other systems. You are responsible for securing your own MMPM API key.</p>
          </div>

          <h3>3.7 Resource Abuse</h3>
          <p>Do not use MMPM for cryptocurrency mining, proof-of-work computation, deliberately causing denial-of-service attacks, or circumventing rate limits, quotas, or usage-based pricing through technical manipulation.</p>

          <h3>3.8 Violations of Applicable Privacy Law</h3>
          <p>Do not use MMPM in ways that violate:</p>
          <ul>
            <li><strong>GDPR (EU):</strong> Processing EU resident data without lawful basis or Data Processing Agreements</li>
            <li><strong>CCPA/CPRA (California):</strong> Storing California resident data without honoring consumer rights</li>
            <li><strong>Australian Privacy Act:</strong> Violating Australian Privacy Principles (APPs)</li>
            <li><strong>NZ Privacy Act 2020:</strong> Violating Information Privacy Principles</li>
            <li><strong>Sector laws:</strong> HIPAA, FCRA, FERPA, COPPA, or equivalent</li>
          </ul>

          <h3>3.9 Spam, Phishing &amp; Social Engineering</h3>
          <p>Do not store atoms designed to impersonate third parties, conduct phishing attacks, distribute spam or malware, or manipulate or deceive users or systems.</p>

          <h3>3.10 Training Competing Models</h3>
          <p>Do not extract memory atoms and use them to train, fine-tune, or develop competing AI models or large language models without prior written permission from Parametric Memory. This does not prohibit using atoms to improve your own single-tenant AI applications.</p>

          <h3>3.11 Prohibited Content</h3>
          <p>Do not store content that incites violence or terrorism, hate speech or dehumanizing content targeting individuals or groups based on protected characteristics, sexually exploitative material, non-consensual intimate imagery, or content sexualizing minors.</p>

          <h2>4. Security Responsibilities</h2>

          <h3>4.1 API Key Protection</h3>
          <p>You are solely responsible for keeping your MMPM API key confidential and secure, preventing unauthorized access, immediately rotating your key if compromised, and not sharing your API key in logs, version control, email, or other insecure channels. MMPM cannot be liable for unauthorized access resulting from your failure to secure your own API key.</p>

          <h3>4.2 MCP Configuration</h3>
          <p>Store your MCP connector configuration, including authentication credentials and substrate URLs, securely (e.g., in <code>~/.mcp-auth/</code>). Do not commit MCP credentials to public version control repositories. Regularly audit and revoke MCP authentication tokens if you suspect compromise.</p>

          <h2>5. Enforcement</h2>
          <p>Parametric Memory reserves the right to immediately suspend or terminate your account upon discovery of AUP violations, delete or quarantine non-compliant memory atoms without prior notice, report illegal activity to law enforcement or regulatory authorities, and refuse service to repeat violators.</p>
          <p>Deleted atoms will not be restored. Termination may be permanent and may prevent future account creation.</p>

          <h2>6. Reporting Violations</h2>
          <p>If you become aware of another user storing illegal content, unauthorized access attempts, or credentials exposed in memory atoms, please report immediately:</p>
          <ul>
            <li><strong>Email:</strong> <a href="mailto:abuse@parametric-memory.dev">abuse@parametric-memory.dev</a></li>
          </ul>
          <p>Include a description of the violation, relevant account or atom IDs, and any evidence. We will investigate within 48 business hours.</p>

          <h2>7. Changes to This Policy</h2>
          <p>Material changes will be communicated with at least 30 days&rsquo; notice. Continued use after notice constitutes acceptance.</p>

          <h2>8. Contact</h2>
          <p>
            <a href="mailto:legal@parametric-memory.dev">legal@parametric-memory.dev</a>
          </p>
        </div>

        <div className="mt-16 border-t border-white/10 pt-8">
          <p className="text-sm text-white/40">
            Parametric Memory Limited · New Zealand ·{" "}
            <a href="mailto:abuse@parametric-memory.dev" className="text-white/60 hover:text-white">
              abuse@parametric-memory.dev
            </a>
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/terms" className="text-white/40 hover:text-white/70">Terms of Service</Link>
            <Link href="/privacy" className="text-white/40 hover:text-white/70">Privacy Policy</Link>
            <Link href="/dpa" className="text-white/40 hover:text-white/70">Data Processing Agreement</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
