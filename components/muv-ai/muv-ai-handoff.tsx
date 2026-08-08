"use client";

import { useState } from "react";
import { X, Mail, Phone, MessageCircle } from "lucide-react";

type SupportContact = { supportEmail: string | null; supportPhone: string | null; whatsappNumber: string | null };

/**
 * Human-support handoff. Two honest, truthful paths, never a fake promise:
 * (1) already-configured contact info (StoreSettings — the same info the
 * storefront's own /contact page would show), shown immediately, no form
 * needed; (2) an optional persisted request, so a founder/staff member has
 * a real, tracked record of who asked and why. Never claims a human is
 * "available now" and never claims a request was saved unless it actually
 * was (`result` reflects the real Server Action outcome, nothing else).
 */
export function MuvAiHandoff({
  contact,
  submitting,
  result,
  onSubmit,
  onClose,
}: {
  contact: SupportContact | null;
  submitting: boolean;
  result: "success" | "error" | null;
  onSubmit: (fields: { contactEmail?: string; contactPhone?: string; message?: string }) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() && !phone.trim()) return;
    onSubmit({
      contactEmail: email.trim() || undefined,
      contactPhone: phone.trim() || undefined,
      message: message.trim() || undefined,
    });
  }

  const hasAnyContact = contact?.supportEmail || contact?.supportPhone || contact?.whatsappNumber;

  return (
    <div className="muv-ai-handoff" role="dialog" aria-modal="true" aria-labelledby="muv-ai-handoff-title">
      <div className="muv-ai-handoff-header">
        <span id="muv-ai-handoff-title" className="muv-ai-panel-title">Talk to our team</span>
        <button type="button" className="muv-icon-circle" onClick={onClose} aria-label="Close support options">
          <X size={14} />
        </button>
      </div>

      {hasAnyContact && (
        <div className="muv-ai-handoff-contacts">
          {contact?.supportEmail && (
            <a className="muv-ai-handoff-contact-link" href={`mailto:${contact.supportEmail}`}>
              <Mail size={13} aria-hidden /> {contact.supportEmail}
            </a>
          )}
          {contact?.supportPhone && (
            <a className="muv-ai-handoff-contact-link" href={`tel:${contact.supportPhone}`}>
              <Phone size={13} aria-hidden /> {contact.supportPhone}
            </a>
          )}
          {contact?.whatsappNumber && (
            <a
              className="muv-ai-handoff-contact-link"
              href={`https://wa.me/${contact.whatsappNumber.replace(/[^\d]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={13} aria-hidden /> WhatsApp
            </a>
          )}
        </div>
      )}

      {result === "success" ? (
        <p className="muv-ai-handoff-status muv-ai-handoff-status-success" role="status">
          Your request has been sent to our team. They'll reach out using the details you shared.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="muv-ai-handoff-form">
          <p className="muv-ai-handoff-hint">Prefer we contact you? Leave your details and a brief note.</p>
          <label className="muv-ai-handoff-label" htmlFor="muv-ai-handoff-email">Email</label>
          <input
            id="muv-ai-handoff-email"
            type="email"
            className="muv-ai-input muv-ai-handoff-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <label className="muv-ai-handoff-label" htmlFor="muv-ai-handoff-phone">Phone</label>
          <input
            id="muv-ai-handoff-phone"
            type="tel"
            className="muv-ai-input muv-ai-handoff-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
          />
          <label className="muv-ai-handoff-label" htmlFor="muv-ai-handoff-message">Note (optional)</label>
          <textarea
            id="muv-ai-handoff-message"
            className="muv-ai-input muv-ai-handoff-input"
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What can we help with?"
          />
          {result === "error" && (
            <p className="muv-ai-handoff-status muv-ai-handoff-status-error" role="alert">
              We couldn't send your request. Please try again, or use a contact option above.
            </p>
          )}
          <button type="submit" className="muv-btn-primary muv-ai-handoff-submit" disabled={submitting || (!email.trim() && !phone.trim())}>
            {submitting ? "Sending…" : "Request a callback"}
          </button>
        </form>
      )}
    </div>
  );
}
