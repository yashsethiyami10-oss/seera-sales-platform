import type { Metadata } from "next";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy — Seera Sales & Distribution OS",
  description: "How Seera Detergent's Sales & Distribution OS collects, uses, and protects information, including WhatsApp Business operational messaging.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <article>
      <p className={styles.eyebrow}>Legal</p>
      <h1 className={styles.title}>Privacy Policy</h1>
      <p className={styles.updated}>Last updated: 19 August 2026</p>

      <p>
        This Privacy Policy explains how the <strong>Seera Sales &amp; Distribution OS</strong> (&quot;the
        Platform&quot;), operated for <strong>Seera Detergent</strong> at www.seeradetergent.in, collects, uses,
        and protects information. The Platform is a governed, role-based operating workspace used by Seera
        Detergent&apos;s own employees and its onboarded business partners — Sales Executives, Sales Managers,
        Distributors, Super Stockists, and Retailers — to run day-to-day sales, distribution, and field
        operations. It is not a public consumer application, and account access is granted only to onboarded
        personnel and business partners.
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li>
          <strong>Account &amp; role information</strong> — name, email address, registered mobile number, and
          the portal role(s) assigned to an account (for example Sales Executive, Distributor Owner, Super
          Stockist Owner).
        </li>
        <li>
          <strong>Field operations data</strong> — check-in/check-out location captured during business visits,
          visit photographs, visit outcomes, and related field notes, all captured as part of an employee&apos;s
          own working day.
        </li>
        <li>
          <strong>Business transaction data</strong> — orders, quotations, GST invoices and other billing
          documents, payment and collection records, and credit/ledger entries tied to a partner account.
        </li>
        <li>
          <strong>Communications data</strong> — WhatsApp Business messages sent to registered retailer,
          distributor, and Super Stockist contacts for order, visit, and delivery notifications, and the
          delivery/read status returned for those messages (see Section 3).
        </li>
        <li>
          <strong>Platform activity data</strong> — login sessions and an internal audit trail of actions taken
          on the Platform, used for security and governance.
        </li>
      </ul>

      <h2>2. How We Use Information</h2>
      <p>Information collected through the Platform is used to:</p>
      <ul>
        <li>operate and coordinate the Seera sales and distribution network;</li>
        <li>generate GST-compliant quotations, invoices, and other business documents;</li>
        <li>send operational WhatsApp notifications tied to an existing business relationship;</li>
        <li>maintain an audit trail for governance, dispute resolution, and financial/tax compliance; and</li>
        <li>secure account access and detect misuse.</li>
      </ul>

      <h2>3. WhatsApp Business Messaging</h2>
      <p>
        The Platform sends operational notifications — such as visit-completion confirmations, order status,
        and delivery updates — to registered retailer, distributor, and Super Stockist contacts through Meta&apos;s
        WhatsApp Business Cloud API, using Seera Detergent&apos;s own registered WhatsApp Business sender number.
        These messages are sent only to numbers already associated with an existing Seera business relationship,
        and only for the operational purpose described at the time the relationship was established. Meta
        returns delivery and read status for these messages, which is recorded against the corresponding
        business record so it can be tracked and, where needed, retried. The Platform does not use WhatsApp
        Business messaging for unsolicited marketing to numbers outside its registered partner network.
      </p>

      <h2>4. Data Retention</h2>
      <p>
        Operational, transactional, and audit records are retained for as long as necessary to run the
        business relationship they relate to, and for as long as required by applicable legal, tax (including
        GST), and audit obligations. Records forming part of the Platform&apos;s audit trail are append-only —
        they are not silently altered or deleted, so that a complete and accurate record of business activity
        is preserved.
      </p>

      <h2>5. Service Providers</h2>
      <p>The Platform relies on the following categories of service providers to operate:</p>
      <ul>
        <li><strong>Hosting and application delivery</strong> — Vercel Inc.</li>
        <li><strong>Database hosting</strong> — a managed PostgreSQL database provider.</li>
        <li><strong>Business messaging</strong> — Meta Platforms, Inc., via the WhatsApp Business Cloud API.</li>
      </ul>
      <p>Each provider processes information solely to deliver the service described above, under its own applicable terms.</p>

      <h2>6. Security</h2>
      <p>
        Access to the Platform is controlled through role-based access control, so an account can only reach
        the data and actions its role is authorized for. Traffic to the Platform is encrypted in transit
        (HTTPS/TLS), account credentials are stored using industry-standard one-way hashing rather than in
        plain text, sign-in attempts are rate-limited, and administrative and business-critical actions are
        recorded in an audit log.
      </p>

      <h2>7. Your Rights</h2>
      <p>
        Depending on your relationship with Seera Detergent, you may request access to, correction of, or
        deletion of your personal information held on the Platform. Deletion requests are handled as described
        on our <a href="/data-deletion">Data Deletion</a> page, subject to the legal, tax, and audit retention
        obligations described in Section 4.
      </p>

      <h2>8. Contact</h2>
      <p>
        For questions about this Privacy Policy, or to exercise the rights described above, contact Seera
        Detergent through your onboarding Seera representative, or via the official Seera Detergent WhatsApp
        Business number you receive operational messages from.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time to reflect changes to the Platform or applicable
        law. The &quot;Last updated&quot; date above reflects the most recent revision, and continued use of the
        Platform after a change constitutes acceptance of the updated policy.
      </p>
    </article>
  );
}
