"use client";

import { useId, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/primitives";
import { submitBusinessInquiry } from "@/actions/inquiries";
import { BUSINESS_TYPES } from "@/lib/validations/inquiry";

const EMPTY_FORM = {
  companyName: "",
  contactPerson: "",
  email: "",
  phone: "",
  businessType: "" as (typeof BUSINESS_TYPES)[number] | "",
  city: "",
  state: "",
  message: "",
};

/**
 * Reusable business-inquiry form — used on /contact today, written so any
 * future surface (e.g. a homepage modal) can mount it unmodified. Mirrors
 * the signup form's exact validation/error/loading pattern (app/(auth)/signup)
 * so this doesn't invent a second way of doing the same thing.
 */
export function BusinessInquiryForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { showToast } = useToast();
  const formId = useId();
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setFieldErrors({});

    const result = await submitBusinessInquiry(form);
    setLoading(false);

    if (!result.success) {
      setFieldErrors(result.error.fieldErrors ?? { _: [result.error.message] });
      // Move focus to the error summary so keyboard/screen-reader users land
      // on what needs fixing instead of staying wherever they last were.
      errorSummaryRef.current?.focus();
      return;
    }

    setSubmitted(true);
    setForm(EMPTY_FORM);
    showToast("Enquiry received — our business team will reach out shortly");
  }

  const errorMessages = Object.values(fieldErrors).flat();
  const field = (name: keyof typeof EMPTY_FORM) => fieldErrors[name]?.[0];

  if (submitted) {
    return (
      <div className="muv-card text-center py-12" role="status">
        <p className="font-display text-white text-xl" style={{ fontWeight: 500 }}>
          Enquiry received
        </p>
        <p className="muv-text-meta text-sm mt-3">
          Thank you — our business team will reach out within 1–2 business days.
        </p>
        <button type="button" onClick={() => setSubmitted(false)} className="muv-footer-link muv-text-meta hover:text-white text-sm mt-6">
          Submit another enquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate aria-describedby={errorMessages.length ? `${formId}-errors` : undefined}>
      {errorMessages.length > 0 && (
        <div ref={errorSummaryRef} id={`${formId}-errors`} tabIndex={-1} role="alert" className="muv-error-banner" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          {errorMessages.map((msg, i) => (
            <span key={i}>{msg}</span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${formId}-companyName`} className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">
            Company Name
          </label>
          <input
            id={`${formId}-companyName`}
            required
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            className={`muv-input ${field("companyName") ? "muv-input-error" : ""}`}
            aria-invalid={!!field("companyName")}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-contactPerson`} className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">
            Contact Person
          </label>
          <input
            id={`${formId}-contactPerson`}
            required
            value={form.contactPerson}
            onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
            className={`muv-input ${field("contactPerson") ? "muv-input-error" : ""}`}
            aria-invalid={!!field("contactPerson")}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-email`} className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">
            Email
          </label>
          <input
            id={`${formId}-email`}
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={`muv-input ${field("email") ? "muv-input-error" : ""}`}
            aria-invalid={!!field("email")}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-phone`} className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">
            Phone
          </label>
          <input
            id={`${formId}-phone`}
            type="tel"
            required
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className={`muv-input ${field("phone") ? "muv-input-error" : ""}`}
            aria-invalid={!!field("phone")}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-businessType`} className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">
            Business Type
          </label>
          <select
            id={`${formId}-businessType`}
            required
            value={form.businessType}
            onChange={(e) => setForm({ ...form, businessType: e.target.value as typeof form.businessType })}
            className={`muv-input ${field("businessType") ? "muv-input-error" : ""}`}
            aria-invalid={!!field("businessType")}
          >
            <option value="" disabled>
              Select a business type
            </option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${formId}-city`} className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">
              City
            </label>
            <input
              id={`${formId}-city`}
              required
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className={`muv-input ${field("city") ? "muv-input-error" : ""}`}
              aria-invalid={!!field("city")}
            />
          </div>
          <div>
            <label htmlFor={`${formId}-state`} className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">
              State
            </label>
            <input
              id={`${formId}-state`}
              required
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              className={`muv-input ${field("state") ? "muv-input-error" : ""}`}
              aria-invalid={!!field("state")}
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor={`${formId}-message`} className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">
          Message
        </label>
        <textarea
          id={`${formId}-message`}
          required
          rows={4}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Tell us what you need — categories, approximate volume, how often you'd reorder."
          className={`muv-input muv-textarea ${field("message") ? "muv-input-error" : ""}`}
          aria-invalid={!!field("message")}
        />
      </div>

      <Button variant="primary" type="submit" disabled={loading} className="w-full sm:w-auto">
        {loading ? "Sending…" : <>Submit Enquiry <ArrowRight size={15} /></>}
      </Button>
    </form>
  );
}
