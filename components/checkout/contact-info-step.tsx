/**
 * Real fields — prefilled from the signed-in customer's actual email/phone
 * when logged in, blank for a guest. Guest checkout (Phase 18) reuses this
 * same step with `name` shown and required only when there's no session to
 * source a name from; the logged-in path is completely unchanged.
 *
 * Final Customer Experience Sprint, Phase 7 — this used to be its own
 * checkout step with its own "Continue" button; it's now rendered together
 * with the address fields under one "Customer Information" step
 * (checkout-client.tsx owns the combined Continue button/validation), so
 * contact and address no longer feel like two separate pages.
 */
export function validateContactInfo({ name, email, phone, isGuest }: { name: string; email: string; phone: string; isGuest: boolean }) {
  const validName = !isGuest || name.trim().length > 0;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validPhone = /^[6-9]\d{9}$/.test(phone);
  return validName && validEmail && validPhone;
}

export function ContactInfoStep({
  name,
  email,
  phone,
  isGuest,
  onChange,
}: {
  name: string;
  email: string;
  phone: string;
  isGuest: boolean;
  onChange: (field: "name" | "email" | "phone", value: string) => void;
}) {
  const validName = !isGuest || name.trim().length > 0;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validPhone = /^[6-9]\d{9}$/.test(phone);

  return (
    <div className="space-y-4">
      {isGuest && (
        <div>
          <label htmlFor="checkout-name" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Full Name</label>
          <input id="checkout-name" type="text" value={name} onChange={(e) => onChange("name", e.target.value)} className="muv-input" aria-invalid={name.length > 0 && !validName} />
        </div>
      )}
      <div>
        <label htmlFor="checkout-email" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Email</label>
        <input id="checkout-email" type="email" value={email} onChange={(e) => onChange("email", e.target.value)} className="muv-input" aria-invalid={email.length > 0 && !validEmail} />
      </div>
      <div>
        <label htmlFor="checkout-phone" className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Phone</label>
        <input id="checkout-phone" type="tel" value={phone} onChange={(e) => onChange("phone", e.target.value)} className="muv-input" aria-invalid={phone.length > 0 && !validPhone} placeholder="10-digit mobile number" />
      </div>
      <p className="muv-text-faint text-xs">We'll only use these to confirm your order and delivery — never for marketing without your consent.</p>
    </div>
  );
}
