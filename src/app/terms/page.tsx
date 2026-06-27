import type { Metadata } from "next";
import Link from "next/link";
import SiteNavbar from "@/components/ui/SiteNavbar";
import { cookies } from "next/headers";

import { getPricingTableRows } from "@/lib/pricing";
export const metadata: Metadata = {
  title: "Terms of Service",
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
            Effective Date: 26 April 2026 &nbsp;·&nbsp; Governing Law: New Zealand
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

          <h2 data-testid="terms-section-5">5. Subscription Plans &amp; Payment</h2>

          <h3>5.1 Plans</h3>

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
                {getPricingTableRows().map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.priceLabel}</td>
                    <td>{row.atomsLabel}</td>
                    <td>{row.retentionLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p>
            Listed prices are exclusive of any applicable taxes (including GST, VAT, sales tax,
            withholding tax, or similar levies), which will be added at checkout or on invoice where
            required by law.
          </p>

          <h3>5.2 Payment &amp; Auto-Renewal</h3>
          <p>
            Subscriptions auto-renew at the end of each billing period unless canceled. All payments
            are processed via Stripe. By providing a payment method, you authorize us to charge the
            applicable fees (and any applicable taxes) to that method on each renewal until you
            cancel. If a payment fails, we retry 3&ndash;5 times over 10 days; if unsuccessful, your
            subscription is suspended (see Section&nbsp;6.2) and data retained for 30 days before
            deletion.
          </p>

          <h3 data-testid="terms-pricing-changes">5.3 Right to Change Pricing</h3>
          <p>
            We reserve the right to change pricing, plan structure, included quotas, fee components,
            or any other commercial term of the Service at any time, in our reasonable discretion,
            including (without limitation) where:
          </p>
          <ul>
            <li>
              <strong>Supplier or infrastructure costs change</strong> &mdash; for example, changes
              in pricing, terms, or availability from our infrastructure providers (such as
              DigitalOcean, payment processors, AI model providers, network and storage suppliers),
              or in the underlying open-source or commercial software we depend on.
            </li>
            <li>
              <strong>Operational costs exceed the fees charged for a plan</strong> &mdash;
              including unanticipated compute, storage, bandwidth, support, security, or compliance
              costs attributable to your usage or to the plan generally.
            </li>
            <li>
              <strong>Currency, tax, or regulatory changes</strong> &mdash; including foreign
              exchange movements affecting our cost base, new or amended taxes, levies, duties, or
              compliance obligations in any jurisdiction in which we or our suppliers operate.
            </li>
            <li>
              <strong>Material changes to the Service</strong> &mdash; including new features,
              capacity expansions, security investments, or removal of features we no longer
              commercially support.
            </li>
            <li>
              <strong>Anti-abuse or fair-use enforcement</strong> &mdash; for usage that materially
              exceeds the median for your plan, where continued provision at the listed price would
              impose a disproportionate operational, financial, or security risk on us, our
              suppliers, or other customers.
            </li>
          </ul>
          <p>
            For paid plans, price increases applicable to existing subscribers take effect on your
            next renewal following at least <strong>30 days&rsquo; advance notice</strong> by email
            and on our website. Promotional reductions, fee waivers, new optional add-ons, or
            pricing for new plans we introduce may take effect immediately. If you do not accept a
            price increase, you may cancel under Section&nbsp;6.1 before the new price takes effect;
            continued use after the effective date constitutes acceptance of the new price. Nothing
            in this Section requires us to offer any particular plan, price, discount, or promotion
            at any time, and prior pricing does not bind future pricing.
          </p>

          <h3>5.4 Refunds</h3>
          <p>
            <strong>Refunds:</strong> When you cancel (Section&nbsp;6.1) you choose how it takes
            effect: run to the end of your current billing period with no refund, or stop
            immediately and receive a pro-rata refund of the unused portion of the current period to
            your original payment method. This automatic pro-rata refund is offered to all
            customers, regardless of jurisdiction. You may also cancel within 7 days of initial
            purchase for a full refund. The pro-rata refund is time-based (calculated from your
            billing-period dates), never usage-based.
          </p>
          <p>
            <strong>Provisioning fee:</strong> Dedicated plans include a one-time provisioning fee
            (one third of the first billing period) that covers setting up your private instance.
            This fee is <strong>non-refundable</strong> once your instance is provisioned and is
            excluded from any pro-rata refund. If a tier change or provisioning fails on our side,
            we refund everything charged for that change, the provisioning fee included.
          </p>
          <p>
            No refund or service credit will be issued for periods during which your account was
            suspended or terminated for cause under Section&nbsp;6. Where a charge is under dispute
            with your card issuer, we resolve the dispute manually rather than issuing an automatic
            refund.
          </p>

          <h3 data-testid="terms-no-downgrades">5.5 Plan Changes; Upgrades Only (No Downgrades)</h3>
          <p>
            You may <strong>upgrade</strong> to a higher tier at any time through the in-app billing
            flow.{" "}
            <strong>
              Downgrades to a lower-priced tier are not technically feasible on the Service, are not
              supported, and are expressly prohibited.
            </strong>{" "}
            Each plan provisions and isolates compute, memory, and storage resources sized to that
            tier; the Service does not perform an in-place reduction of a running instance to a
            lower tier, and no downgrade path is offered through the application.
          </p>
          <p>
            You must not attempt to effect a downgrade by any means, including by modifying,
            re-pricing, or substituting the underlying subscription directly through the payment
            provider or any third party. Any such attempt is a breach of these Terms; we may reject,
            reverse, or disregard it, may continue to bill the original tier, and are not liable for
            any loss of service, data, configuration, endpoint, or connectivity resulting from an
            attempted downgrade. To use a lower tier, cancel your current subscription under
            Section&nbsp;6.1 and subscribe anew at the desired tier &mdash; this provisions a
            separate instance with its own endpoint and does not migrate your existing data, memory
            atoms, API key, or subdomain.
          </p>
          <p>
            Nothing in this Section limits your cancellation rights under Section&nbsp;6.1 or any
            mandatory consumer-protection rights in your jurisdiction: you may always cancel.
          </p>

          <h2 data-testid="terms-section-6">6. Suspension, Cancellation &amp; Termination</h2>

          <h3>6.1 Cancellation by You</h3>
          <p>
            You may cancel your subscription at any time via account settings or by contacting{" "}
            <a href="mailto:support@parametric-memory.dev">support@parametric-memory.dev</a>. At
            cancellation you choose between two options: <strong>cancel at period end</strong> (you
            keep full access until your billing period ends, then the wind-down below begins, and
            you may reactivate before it ends), or <strong>cancel now with a refund</strong> (we
            stop the subscription immediately and refund the unused portion per Section&nbsp;5.4).
            If you cancel now, deprovisioning begins right away and your data is deleted on the
            timelines below &mdash; the immediate option is irreversible and cannot be reactivated.
          </p>
          <p>For the period-end option, upon cancellation:</p>
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

          <h3 data-testid="terms-suspension">6.2 Suspension by MMPM</h3>
          <p>
            We may, at our sole and reasonable discretion, suspend, throttle, rate-limit, place into
            read-only mode, or otherwise restrict access to all or part of your account, substrate,
            or API keys, with or without prior notice, where we reasonably believe one or more of
            the following applies:
          </p>
          <ul>
            <li>
              You have breached, or are likely to breach, these Terms or the{" "}
              <Link href="/aup">Acceptable Use Policy</Link>.
            </li>
            <li>
              Your account is the source or target of fraudulent activity, payment chargebacks,
              account takeover, credential abuse, or unauthorized access.
            </li>
            <li>A payment is overdue, declined, reversed, or charged back.</li>
            <li>
              Your usage materially exceeds typical usage for your plan or imposes a
              disproportionate operational, security, capacity, or financial risk on us, our
              suppliers, or other customers.
            </li>
            <li>
              Your activity threatens the integrity, security, performance, or availability of the
              Service or any third-party system reachable from it.
            </li>
            <li>
              We are required to do so by applicable law, court order, regulatory authority, or to
              comply with the directions of a payment provider, infrastructure provider, or law
              enforcement.
            </li>
            <li>
              We need to investigate a suspected violation, security incident, or operational
              anomaly.
            </li>
            <li>
              You have made our continued service to you commercially or operationally unviable
              through abusive, threatening, or harassing behaviour toward our staff, contractors, or
              other users.
            </li>
          </ul>
          <p>
            Where reasonably practicable and not contrary to law or our security interests, we will
            notify you of the reason for suspension and provide a path to remedy. We are not
            required to provide notice in advance of suspension where we reasonably believe
            immediate action is necessary to protect the Service, our users, our suppliers, our
            staff, or to comply with law. Suspension does not, by itself, terminate your
            subscription, and fees may continue to accrue during a suspension imposed for breach or
            non-payment.
          </p>

          <h3 data-testid="terms-termination">6.3 Termination by MMPM</h3>
          <p>
            We may terminate your account, your subscription, or these Terms &mdash; in whole or in
            part &mdash; immediately and without refund where:
          </p>
          <ul>
            <li>
              The grounds for suspension under Section&nbsp;6.2 persist or are not remedied within a
              reasonable cure period (where a cure is offered).
            </li>
            <li>You commit a material or repeated breach of these Terms or the AUP.</li>
            <li>
              You engage in illegal activity, fraud, or willful misconduct in connection with the
              Service.
            </li>
            <li>
              You fail to pay any amount when due and the failure is not cured within 30 days.
            </li>
            <li>
              We discontinue the Service or a tier of the Service in your region, in which case we
              will use reasonable efforts to provide at least 30 days&rsquo; notice and a pro-rata
              refund of any prepaid, unused fees.
            </li>
            <li>
              Termination is required by law, court order, regulatory authority, or by direction of
              a payment, infrastructure, or upstream service provider.
            </li>
          </ul>

          <h3>6.4 Effect of Termination</h3>
          <p>
            On termination, your right to access the Service ends, your substrate may be
            deprovisioned, and your data is subject to the deletion timelines in Section&nbsp;6.1
            (cancellation) or Section&nbsp;9.3 (data deletion). For terminations for cause, we may
            accelerate deletion to as little as 7 days&rsquo; notice, or immediate deletion where
            required by law. Sections that by their nature should survive termination &mdash;
            including Sections&nbsp;5.4 (Refunds), 7 (Disclaimers), 8 (Liability), 10 (Intellectual
            Property), 13 (Governing Law), 14 (Indemnification), 15 (Force Majeure), and 17
            (General) &mdash; survive termination.
          </p>

          <h3 data-testid="terms-no-refund-cause">6.5 No Refund on Termination for Cause</h3>
          <p>
            No refund or service credit will be issued for periods during which your account was
            suspended or terminated for cause, including for breach of these Terms, AUP violations,
            fraud, non-payment, or chargeback. Mandatory consumer protection rights in your
            jurisdiction are unaffected.
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

          <h2 data-testid="terms-indemnification">14. Indemnification</h2>
          <p>
            To the maximum extent permitted by law, you will defend, indemnify, and hold harmless
            Parametric Memory Limited, its affiliates, and their respective officers, directors,
            employees, and agents from and against any third-party claim, demand, loss, liability,
            damage, fine, penalty, or expense (including reasonable legal fees) arising out of or
            related to:
          </p>
          <ul>
            <li>
              Your data, content, or memory atoms stored, processed, or transmitted via the Service,
              including claims that your data infringes intellectual property rights, violates
              privacy or data-protection law, or is unlawful.
            </li>
            <li>Your use of the Service in breach of these Terms or the AUP.</li>
            <li>
              Your processing of personal data of end users where you act as the data controller,
              including any failure to obtain a lawful basis, provide notices, or honor data subject
              rights.
            </li>
            <li>
              Your reliance on probabilistic memory outputs in any application, decision, or
              product, including outputs that are inaccurate, inferred, or hallucinated.
            </li>
            <li>
              Your violation of any law, regulation, or third-party right through your use of the
              Service.
            </li>
          </ul>
          <p>
            We will promptly notify you of any claim subject to indemnification and reasonably
            cooperate in the defense at your expense. We may participate in the defense with counsel
            of our choosing. You may not settle any claim that imposes any obligation or liability
            on us without our prior written consent. This section does not apply to consumers to the
            extent that mandatory consumer protection law in your jurisdiction prohibits or limits
            indemnities of this nature.
          </p>

          <h2 data-testid="terms-force-majeure">15. Force Majeure</h2>
          <p>
            Neither party will be liable for failure or delay in performing any obligation (other
            than payment of fees due) caused by events beyond its reasonable control, including:
            acts of God; natural disasters; pandemic or public health emergency; war, terrorism,
            civil unrest, or sanctions; failures or outages of telecommunications, electricity, the
            public internet, or upstream cloud, hosting, AI model, or payment providers;
            cyberattacks or denial-of-service attacks; labor disputes; or government action. The
            affected party will use reasonable efforts to mitigate the impact and resume
            performance.
          </p>

          <h2>16. Changes to These Terms</h2>
          <p>
            We may update these Terms at any time. Material changes require 30 days&rsquo; prior
            written notice via email and a notice on our website. Your continued use after the
            notice period constitutes acceptance. If you object to material changes, you may cancel
            your subscription without penalty before the new Terms take effect.
          </p>

          <h2>17. General</h2>
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

          <h2>18. Contact</h2>
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
                      "Pricing Changes",
                      "We may change prices for supplier-cost, operational, currency, tax, or fair-use reasons; 30-day notice for increases on existing subs",
                    ],
                    [
                      "Plan Changes",
                      "Upgrades only; downgrades are not technically feasible, unsupported, and prohibited — cancel and re-subscribe to use a lower tier",
                    ],
                    [
                      "Suspension",
                      "We may suspend, throttle, or limit at our reasonable discretion for AUP/Terms breach, fraud, abuse, non-payment, or operational risk",
                    ],
                    [
                      "Indemnification",
                      "Customer indemnifies MMPM for third-party claims arising from customer data, AUP violations, or downstream use of outputs",
                    ],
                    [
                      "Force Majeure",
                      "Neither party liable for events beyond reasonable control (upstream provider outages, cyberattacks, government action, etc.)",
                    ],
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
            <Link href="/copyright" className="text-white/40 hover:text-white/70">
              Copyright
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
