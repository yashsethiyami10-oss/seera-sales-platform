import type { Metadata } from "next";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Terms of Use — Seera Sales & Distribution OS",
  description: "Terms governing authorized use of Seera Detergent's Sales & Distribution OS by its employees and business partners.",
  robots: { index: true, follow: true },
};

export default function TermsOfUsePage() {
  return (
    <article>
      <p className={styles.eyebrow}>Legal</p>
      <h1 className={styles.title}>Terms of Use</h1>
      <p className={styles.updated}>Last updated: 19 August 2026</p>

      <p>
        These Terms of Use govern access to and use of the <strong>Seera Sales &amp; Distribution OS</strong>
        (&quot;the Platform&quot;), operated for <strong>Seera Detergent</strong> at www.seeradetergent.in. By
        signing in to or otherwise using the Platform, you agree to these Terms.
      </p>

      <h2>1. Authorized Use</h2>
      <p>
        The Platform is provided exclusively for use by Seera Detergent&apos;s own employees and its onboarded
        business partners — Sales Executives, Sales Managers, Distributors, Super Stockists, and Retailers —
        acting within the scope of their role. Access is granted per account and gated by role-based
        permissions; an account may only be used by the individual or business it was issued to, and login
        credentials must not be shared. Accessing, or attempting to access, any part of the Platform outside
        your authorized role is prohibited.
      </p>

      <h2>2. Operational Messaging</h2>
      <p>
        As part of an existing business relationship with Seera Detergent, registered retailer, distributor,
        and Super Stockist contacts agree to receive operational WhatsApp Business messages — including visit,
        order, and delivery notifications, and shared business documents — relating to that relationship. See
        our <a href="/privacy">Privacy Policy</a> for details on how this messaging works.
      </p>

      <h2>3. Platform Usage</h2>
      <ul>
        <li>Information entered into the Platform (orders, visit records, quotations, billing documents, and similar) must be accurate and entered in good faith.</li>
        <li>Approval, governance, and audit workflows built into the Platform must not be circumvented.</li>
        <li>Quotations, invoices, and other business documents generated through the Platform are valid only for the specific transaction and partner they were issued to.</li>
      </ul>

      <h2>4. Confidentiality</h2>
      <p>
        Business, pricing, and partner information accessed through the Platform is confidential to the Seera
        sales and distribution network. It must not be shared outside the scope of your role or business
        relationship with Seera Detergent.
      </p>

      <h2>5. Availability and Limitations</h2>
      <p>
        The Platform is provided on an operational, &quot;as available&quot; basis. While we take reasonable steps
        to keep it available and accurate, we do not guarantee uninterrupted access, and the Platform should
        not be relied upon as a substitute for the underlying commercial agreements between Seera Detergent
        and its business partners.
      </p>

      <h2>6. Suspension</h2>
      <p>
        Access to the Platform may be suspended or revoked for an account found to be in breach of these
        Terms, misusing shared credentials, or acting outside its authorized role, without prejudice to any
        other rights Seera Detergent may have under its commercial agreements with the relevant partner.
      </p>

      <h2>7. Governing Law</h2>
      <p>These Terms are governed by the applicable laws of India.</p>

      <h2>8. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. The &quot;Last updated&quot; date above reflects the most
        recent revision, and continued use of the Platform after a change constitutes acceptance of the
        updated Terms.
      </p>
    </article>
  );
}
