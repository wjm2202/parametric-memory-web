import type { Metadata } from "next";
import Link from "next/link";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Data Processing Agreement — Parametric Memory",
  description:
    "GDPR Article 28-compliant Data Processing Agreement for B2B customers. Covers processor obligations, sub-processors, breach notification, and data subject rights.",
  alternates: { canonical: "https://parametric-memory.dev/dpa" },
};

export default async function DPAPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token")?.value ?? null;

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <SiteNavbar sessionToken={sessionToken} />

      <main className="mx-auto max-w-3xl px-6 py-20">
        <div className="mb-12">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            Legal · B2B
          </div>
          <h1 className="font-[family-name:var(--font-syne)] text-4xl font-bold text-white">
            Data Processing Agreement
          </h1>
          <p className="mt-3 text-sm text-white/50">
            GDPR Article 28 Compliant &nbsp;·&nbsp; Effective Date: 5 April 2026 &nbsp;·&nbsp; Governing Law: New Zealand
          </p>
        </div>

        <div className="mb-8 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5 not-prose">
          <p className="text-sm text-indigo-300 font-medium mb-2">For B2B Customers</p>
          <p className="text-sm text-white/70">
            This DPA applies when you use Parametric Memory to process personal data on behalf of your own end users. It is incorporated by reference into your subscription agreement. To execute a signed DPA for your records, contact{" "}
            <a href="mailto:legal@parametric-memory.dev" className="text-indigo-400 hover:underline">
              legal@parametric-memory.dev
            </a>.
          </p>
        </div>

        <div className="mb-12 flex flex-wrap gap-3">
          {[
            { href: "/terms", label: "Terms of Service" },
            { href: "/privacy", label: "Privacy Policy" },
            { href: "/aup", label: "Acceptable Use" },
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

        <div className="prose prose-invert prose-sm max-w-none prose-headings:font-[family-name:var(--font-syne)] prose-headings:text-white prose-h2:text-2xl prose-h2:font-semibold prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-3 prose-p:text-white/70 prose-p:leading-relaxed prose-li:text-white/70 prose-strong:text-white prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline prose-table:text-sm prose-th:text-white prose-td:text-white/70 prose-th:bg-white/5 prose-tr:border-white/10">

          <h2>1. Definitions</h2>
          <ul>
            <li><strong>Controller:</strong> The entity (you, the Customer) that determines the purposes and means of processing Personal Data.</li>
            <li><strong>Processor:</strong> Parametric Memory Limited, which processes Personal Data on the Controller&apos;s behalf.</li>
            <li><strong>Data Subject:</strong> Any identified or identifiable natural person whose Personal Data is processed.</li>
            <li><strong>Personal Data:</strong> Any information relating to an identified or identifiable natural person.</li>
            <li><strong>Processing:</strong> Any operation performed on Personal Data (collection, storage, use, disclosure, erasure, etc.).</li>
            <li><strong>Breach of Security:</strong> Accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to Personal Data.</li>
            <li><strong>Sub-processor:</strong> Any party engaged by Parametric Memory to process Personal Data on its behalf.</li>
          </ul>

          <h2>2. Scope &amp; Role Definition</h2>
          <p>
            Customer (as Controller) appoints Parametric Memory (as Processor) to process Personal Data solely in accordance with the subscription agreement and this DPA, and only on documented instructions from Customer. Parametric Memory does not determine the purposes or means of processing — that responsibility rests solely with Customer.
          </p>

          <h2>3. Customer&apos;s Obligations as Controller</h2>
          <p>Customer is responsible for establishing a lawful basis for processing each category of Personal Data, providing privacy notices to Data Subjects that include information about processing by Parametric Memory, ensuring Personal Data is accurate and subject to lawful retention schedules, and complying with all applicable data protection law in its jurisdiction.</p>
          <p>Customer must not intentionally process special categories of Personal Data (health, biometric, racial/ethnic origin, etc.) without documented lawful basis and prior written agreement with Parametric Memory.</p>

          <h2>4. Parametric Memory&apos;s Obligations as Processor</h2>

          <h3>4.1 Processing on Instructions Only</h3>
          <p>We process Personal Data only on documented written instructions from Customer, for no other purpose. If we receive an instruction that we believe violates applicable law, we will notify Customer and may refuse to execute the instruction pending clarification.</p>

          <h3>4.2 Personnel Confidentiality</h3>
          <p>All personnel with access to Personal Data are bound by legally binding confidentiality obligations that survive termination of employment, and are trained on data protection obligations.</p>

          <h3>4.3 Security Measures</h3>
          <p>Parametric Memory implements and maintains:</p>
          <ul>
            <li><strong>Encryption in transit:</strong> TLS 1.2 or higher for all data transfer</li>
            <li><strong>Encryption at rest:</strong> AES-256 on all DigitalOcean infrastructure</li>
            <li><strong>Access controls:</strong> Role-based access control (RBAC); MFA required for system access; access logs retained for 12 months</li>
            <li><strong>Merkle proof integrity:</strong> Cryptographic verification of memory atom integrity; tampering is detectable and triggers immediate alerts</li>
            <li><strong>Substrate isolation:</strong> Each customer&apos;s substrate is logically isolated; cross-tenant data access is architecturally prevented</li>
            <li><strong>Incident response:</strong> Security incidents involving Personal Data are escalated and investigated within 24 hours of discovery</li>
            <li><strong>Regular testing:</strong> Quarterly penetration testing and vulnerability scans by independent third parties; results available to Customer on request</li>
          </ul>

          <h3>4.4 Sub-processor Management</h3>
          <p>Current approved sub-processors (Customer is deemed to have consented):</p>

          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr><th>Sub-processor</th><th>Location</th><th>Purpose</th></tr>
              </thead>
              <tbody>
                <tr><td>DigitalOcean, Inc.</td><td>USA (Virginia)</td><td>Cloud infrastructure, compute, storage, backups</td></tr>
                <tr><td>Stripe, Inc.</td><td>USA</td><td>Payment processing, billing, fraud prevention</td></tr>
                <tr><td>Resend, Inc.</td><td>USA</td><td>Transactional email delivery</td></tr>
                <tr><td>PostHog, Inc.</td><td>USA</td><td>Product analytics (aggregated, non-PII)</td></tr>
              </tbody>
            </table>
          </div>

          <p>We will provide at least 30 days&rsquo; written notice before adding or replacing a sub-processor. Customer may object on reasonable grounds within that period; if unresolved, Customer may terminate the affected service. We remain fully liable for sub-processor compliance.</p>

          <h3>4.5 Data Subject Rights Assistance</h3>
          <p>Upon Customer&apos;s documented request, we will assist in responding to Data Subject requests within the following timeframes:</p>
          <ul>
            <li><strong>Access (GDPR Art. 15 / CCPA):</strong> Provide relevant Personal Data within 10 business days</li>
            <li><strong>Rectification (GDPR Art. 16):</strong> Modify or correct inaccurate data on instruction</li>
            <li><strong>Erasure (GDPR Art. 17 / CCPA):</strong> Delete or anonymize Personal Data; purge backups within 30 days; provide written confirmation</li>
            <li><strong>Restriction (GDPR Art. 18):</strong> Cease active processing while retaining data pending resolution</li>
            <li><strong>Portability (GDPR Art. 20):</strong> Provide Personal Data in structured JSON format within 20 business days</li>
            <li><strong>Object (GDPR Art. 21):</strong> Notify Customer immediately; cease processing pending instructions</li>
          </ul>
          <p>Parametric Memory does not use Personal Data for solely automated decision-making that produces legal or similarly significant effects.</p>

          <h3>4.6 Breach Notification</h3>
          <p>Upon discovery of a Breach of Security, we will notify Customer in writing <strong>within 72 hours</strong> with: description of the breach, categories and approximate number of Data Subjects affected, likely consequences, measures taken to remediate, and contact details for follow-up. We will provide daily updates until resolved.</p>
          <p>Customer is responsible for notifying the Competent Authority (data protection regulator) and affected Data Subjects where required by law.</p>

          <h3>4.7 DPIA Assistance</h3>
          <p>Upon request, we will provide information about our processing activities, security measures, and retention periods to support Customer&apos;s Data Protection Impact Assessment.</p>

          <h3>4.8 Deletion &amp; Return of Data on Termination</h3>
          <p>Upon termination, we will at Customer&apos;s election: (a) securely delete all Personal Data and memory atoms (including backups) within 30 days, with written certification; or (b) return all Personal Data in structured JSON format within 20 business days. We may retain data as required by law (legal hold, regulatory investigations), and will notify Customer unless prohibited.</p>

          <h3>4.9 Audit Rights</h3>
          <p>Customer may conduct one audit per year (or more following an incident), with 10 business days&rsquo; written notice. Audits cover security measures, processing records, and access logs. Customer bears the cost of additional audits beyond the annual right. We will address critical findings within 30 days.</p>

          <h2>5. International Data Transfers</h2>

          <h3>5.1 EU to New Zealand</h3>
          <p>New Zealand holds an adequacy decision from the European Commission (reaffirmed 2024). Personal Data can transfer from EU Member States to Parametric Memory in New Zealand without additional safeguards under GDPR Article 45.</p>

          <h3>5.2 Beyond New Zealand (to US Sub-processors)</h3>
          <p>Transfers to US-based sub-processors are governed by their respective Data Processing Agreements and Standard Contractual Clauses (EU Commission Decision 2021/914), incorporated by reference. SCCs are available in signed form on request.</p>

          <h3>5.3 UK Transfers</h3>
          <p>Transfers to New Zealand are permitted under the UK Data Protection Act 2018. Downstream transfers to US sub-processors are governed by UK International Data Transfer Agreement templates.</p>

          <h2>6. Regulatory Compliance</h2>

          <h3>6.1 GDPR</h3>
          <p>This DPA complies with GDPR Chapter II, Section 5, including Article 28 (Processor Obligations). Both parties acknowledge that GDPR applies to processing of EU resident Personal Data.</p>

          <h3>6.2 Australian Privacy Act</h3>
          <p>Parametric Memory commits to: implementing security consistent with APP 11, assisting with access requests under APP 12, and notifying Customer of Breaches of Security under the Notifiable Data Breaches scheme.</p>

          <h3>6.3 CCPA/CPRA Service Provider Obligations</h3>
          <p>
            <strong>Parametric Memory is a &ldquo;Service Provider&rdquo; under CCPA/CPRA.</strong> We process Personal Information solely on Customer&apos;s documented instructions, do not sell or share Personal Information, do not retain or use Personal Information outside the direct business relationship, and do not combine Personal Information with information from other sources except as required to provide the service. See Exhibit A below for the full CCPA Service Provider Addendum.
          </p>

          <h2>7. Liability</h2>
          <p>Parametric Memory is fully liable to Customer for: breaches of confidentiality by our personnel, unauthorized access or disclosure of Personal Data, failure to implement required security measures, failure to honor Data Subject rights, failure to notify of Breaches of Security, and unauthorized sub-processor engagement. Liability for data protection breaches is not capped and is assessed in accordance with applicable law.</p>

          <h2>8. Term &amp; Termination</h2>
          <p>This DPA commences on the subscription effective date and continues for the duration of the subscription agreement. Upon termination, we cease processing Personal Data (except as required by law) and delete or return data per Section 4.8.</p>

          <h2>9. Governing Law</h2>
          <p>This DPA is governed by New Zealand law. Disputes are subject to NZ courts. Either party may file a complaint with a Competent Authority (data protection regulator) at any time; we commit to cooperating fully with regulatory investigations.</p>

          <h2>10. Order of Precedence</h2>
          <p>In the event of conflict: this DPA takes precedence over the Terms of Service, which takes precedence over any other ancillary agreements. This DPA prevails over the Terms of Service with respect to data protection obligations.</p>

          <div className="mt-12 rounded-xl border border-white/10 bg-white/[0.03] p-6 not-prose">
            <p className="text-sm font-semibold text-white mb-2">Exhibit A — CCPA/CPRA Service Provider Addendum</p>
            <div className="mt-4 text-sm text-white/70 space-y-3">
              <p>Parametric Memory certifies that it is a &ldquo;Service Provider&rdquo; under Cal. Civ. Code § 1798.140(ag) and CPRA. We:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Process Personal Information only on documented instructions from Customer</li>
                <li>Do not sell or share Personal Information (Cal. Civ. Code § 1798.140(t) and § 1798.140(ai))</li>
                <li>Do not retain, use, or disclose Personal Information outside the direct business relationship</li>
                <li>Do not combine Personal Information with data received from other customers or sources except as required to provide services</li>
                <li>Ensure sub-contractors agree to the same restrictions</li>
                <li>Certify compliance annually and permit audit on 10 business days&rsquo; notice</li>
              </ul>
              <p className="text-white/50 text-xs mt-4">To execute a signed copy of this DPA and Addendum, contact legal@parametric-memory.dev.</p>
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-white/10 pt-8">
          <p className="text-sm text-white/40">
            Parametric Memory Limited · New Zealand ·{" "}
            <a href="mailto:legal@parametric-memory.dev" className="text-white/60 hover:text-white">
              legal@parametric-memory.dev
            </a>
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/terms" className="text-white/40 hover:text-white/70">Terms of Service</Link>
            <Link href="/privacy" className="text-white/40 hover:text-white/70">Privacy Policy</Link>
            <Link href="/aup" className="text-white/40 hover:text-white/70">Acceptable Use Policy</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
