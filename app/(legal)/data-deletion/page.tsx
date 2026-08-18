import type { Metadata } from "next";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Data Deletion — Seera Sales & Distribution OS",
  description: "How to request deletion of personal data held by Seera Detergent's Sales & Distribution OS, including WhatsApp Business contact data.",
  robots: { index: true, follow: true },
};

export default function DataDeletionPage() {
  return (
    <article>
      <p className={styles.eyebrow}>Legal</p>
      <h1 className={styles.title}>Data Deletion</h1>
      <p className={styles.updated}>Last updated: 19 August 2026</p>

      <p>
        This page explains how to request deletion of the personal information Seera Detergent&apos;s Sales
        &amp; Distribution OS (&quot;the Platform&quot;) holds about you, including data associated with WhatsApp
        Business operational messaging described in our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>1. What Can Be Deleted</h2>
      <p>On request and after verification, we will delete or de-identify:</p>
      <ul>
        <li>your Platform account and profile information (name, email, mobile number);</li>
        <li>field operations data tied to your account that is not otherwise required to be retained (see Section 2); and</li>
        <li>your registered WhatsApp contact record, so no further operational messages are sent to it.</li>
      </ul>

      <div className={styles.callout}>
        You can also stop receiving WhatsApp messages directly from WhatsApp at any time, by blocking or
        reporting the Seera Detergent WhatsApp Business number from within WhatsApp itself.
      </div>

      <h2>2. What May Be Retained</h2>
      <p>
        Some records cannot be deleted on request because Seera Detergent is required to keep them for legal,
        tax (including GST), financial, or audit purposes. This includes issued orders, quotations and
        invoices, payment and ledger entries, and entries already recorded in the Platform&apos;s audit trail.
        These are retained only for as long as the applicable legal or audit obligation requires, and access
        to them remains restricted by the same role-based access control described in our Privacy Policy.
      </p>

      <h2>3. How to Request Deletion</h2>
      <p>
        To request deletion, contact Seera Detergent through your onboarding Seera representative, or via the
        official Seera Detergent WhatsApp Business number you receive operational messages from, and provide:
      </p>
      <ul>
        <li>your full name;</li>
        <li>the mobile number registered on your Platform account or business record; and</li>
        <li>your role or the business (retailer, distributor, or Super Stockist) the record is associated with.</li>
      </ul>

      <h2>4. Verification</h2>
      <p>
        Before acting on a deletion request, we verify that the request comes from the person or business the
        record actually belongs to, so that data cannot be deleted on someone else&apos;s behalf without
        authorization. We may ask follow-up questions to complete this verification.
      </p>

      <h2>5. Processing Time</h2>
      <p>
        We aim to complete a verified deletion request, or provide a status update, within 30 days of
        verification.
      </p>

      <h2>6. Questions</h2>
      <p>
        If you have questions about this process, contact Seera Detergent through the same channels described
        in Section 3.
      </p>
    </article>
  );
}
