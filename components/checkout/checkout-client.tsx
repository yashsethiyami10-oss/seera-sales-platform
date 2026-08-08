"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { ChevronRight, ChevronLeft, X, Loader2 } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/primitives";
import { createOrder } from "@/actions/orders";
import { initiatePayment, verifyPayment, recordFailedPayment } from "@/actions/payments";
import { addAddress } from "@/actions/customers";
import { detectPincodeStateMismatch } from "@/lib/utils/pincode";
import { CheckoutHero } from "@/components/checkout/checkout-hero";
import { ContactInfoStep, validateContactInfo } from "@/components/checkout/contact-info-step";
import { OrderNotesStep } from "@/components/checkout/order-notes-step";
import { BillingSummary } from "@/components/checkout/billing-summary";
import { OfferProgress } from "@/components/storefront/offer-progress";
import { StickyCheckoutSummary } from "@/components/checkout/sticky-checkout-summary";
import { TrustIndicators, CART_TRUST_ITEMS } from "@/components/storefront/trust-indicators";
import { EmptyCart } from "@/components/cart/empty-cart";

type Address = { id: string; label: string; line1: string; line2: string | null; city: string; state: string; pincode: string; phone: string; isDefault: boolean };

declare global {
  interface Window {
    Razorpay: any;
  }
}

export function CheckoutClient({
  customerId,
  customerName,
  customerEmail,
  customerPhone,
  addresses,
  shippingFee: shippingFeeSetting,
  freeShippingThreshold,
  codEnabled,
  codFee,
}: {
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  addresses: Address[];
  // Phase 1C (GAP-004) — real, admin-editable StoreSettings values, fetched
  // server-side in app/(storefront)/checkout/page.tsx. Standard Delivery's
  // price and COD availability below are derived from these instead of
  // being hardcoded, so they match what createOrder (actions/orders.ts)
  // actually charges/allows.
  shippingFee: number;
  freeShippingThreshold: number;
  codEnabled: boolean;
  codFee: number;
}) {
  const { items, subtotal, clear, coupon, updateQuantity, removeItem } = useCart();
  const couponDiscount = coupon?.discount ?? 0;
  const { showToast } = useToast();
  const router = useRouter();
  const isGuest = customerId === null;

  const [step, setStep] = useState(0);
  const checkoutTopRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  // Founder Final Consolidated Polish, Part 2 — after Continue/Back,
  // automatically scroll to the top of the next step instead of leaving
  // the customer wherever they happened to be on the previous, possibly
  // much longer, step (e.g. scrolled deep into a long address list).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    checkoutTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);
  const [name, setName] = useState(customerName);
  const [email, setEmail] = useState(customerEmail);
  const [phone, setPhone] = useState(customerPhone ?? "");
  const [selectedAddressId, setSelectedAddressId] = useState(addresses[0]?.id ?? "");
  const [showNewAddressForm, setShowNewAddressForm] = useState(addresses.length === 0);
  const [newAddress, setNewAddress] = useState({ label: "Home", line1: "", line2: "", city: "", state: "", pincode: "", phone: "" });
  const pincodeMismatch = detectPincodeStateMismatch(newAddress.pincode, newAddress.state);
  const [shipping, setShipping] = useState("standard");
  const [paymentMethod, setPaymentMethod] = useState<"UPI" | "CARD" | "NETBANKING" | "COD">("UPI");
  const [orderNotes, setOrderNotes] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [placing, setPlacing] = useState(false);
  // Sprint 2 Part 6 — clear() below empties the cart the instant an order
  // succeeds, and this component stays mounted for the brief window before
  // router.push finishes navigating away, so the `items.length === 0` check
  // further down used to render EmptyCart for one frame. This flag keeps
  // that check from firing during the redirect-to-confirmation window.
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Phase 1D — approved delivery policy: Standard is ₹49 below the
  // StoreSettings free-shipping threshold and FREE at/above it (real,
  // admin-editable, same values createOrder charges). Express uses the
  // same threshold as its own boundary — ₹99 below, ₹50 at/above — matching
  // actions/orders.ts's EXPRESS_SHIPPING_FEE/EXPRESS_SHIPPING_FEE_ABOVE_THRESHOLD
  // exactly, so what's shown here is what's actually charged.
  const meetsThreshold = subtotal - couponDiscount >= freeShippingThreshold;
  const standardPrice = meetsThreshold ? 0 : shippingFeeSetting;
  const expressPrice = meetsThreshold ? 50 : 99;
  const SHIPPING_OPTIONS = [
    { id: "standard", label: "Standard Delivery", eta: "4–6 business days", price: standardPrice },
    { id: "express", label: "Express Delivery", eta: "1–2 business days", price: expressPrice },
  ];
  const shippingFee = SHIPPING_OPTIONS.find((s) => s.id === shipping)?.price ?? 0;
  const codSurcharge = paymentMethod === "COD" ? codFee : 0;
  const total = subtotal - couponDiscount + shippingFee + codSurcharge;

  async function handleSaveAddress() {
    // Only reachable for a logged-in customer — guests never see the "Save
    // Address" button (their address is submitted inline with the order
    // instead, see handlePlaceOrder), so customerId is always real here.
    if (!customerId) return;
    const result = await addAddress({ customerId, ...newAddress, isDefault: addresses.length === 0 });
    if (result.success) {
      setSelectedAddressId(result.data.id);
      setShowNewAddressForm(false);
      showToast("Address saved");
    } else {
      showToast(result.error.message);
    }
  }

  function guestAddressComplete() {
    return Boolean(newAddress.line1 && newAddress.city && newAddress.state && /^\d{6}$/.test(newAddress.pincode) && /^[6-9]\d{9}$/.test(newAddress.phone));
  }

  async function handlePlaceOrder() {
    if (isGuest ? !guestAddressComplete() : !selectedAddressId) {
      showToast("Complete your delivery address first");
      return;
    }
    if (!termsAccepted) {
      showToast("Please accept the Terms and Privacy Policy to continue");
      return;
    }
    setPlacing(true);
    setOrderError(null);

    const orderResult = await createOrder({
      ...(isGuest ? { guest: { name, email, phone, address: newAddress } } : { addressId: selectedAddressId }),
      paymentMethod,
      // Phase 1D — the delivery option selected in step 4 now actually
      // reaches the server; previously this was never sent, so Express's
      // ₹99 shown on screen here was never what createOrder charged.
      shippingMethod: shipping.toUpperCase() as "STANDARD" | "EXPRESS",
      couponCode: coupon?.code ?? undefined,
      deliveryInstructions: orderNotes || undefined,
      items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    });

    if (!orderResult.success) {
      setOrderError(orderResult.error.message);
      setPlacing(false);
      return;
    }

    const { orderId, orderNumber } = orderResult.data;
    // Guests have no session to prove order ownership on the success page —
    // it looks the order up by number + this email together instead (see
    // app/(storefront)/checkout/success/page.tsx). A logged-in customer's
    // URL is unchanged.
    const successUrl = isGuest ? `/checkout/success?order=${orderNumber}&email=${encodeURIComponent(email)}` : `/checkout/success?order=${orderNumber}`;

    if (paymentMethod === "COD") {
      setOrderPlaced(true);
      clear();
      router.push(successUrl);
      return;
    }

    // Non-COD: open Razorpay checkout.js — the real integration from
    // actions/payments.ts, not a placeholder redirect.
    const paymentResult = await initiatePayment(orderId);
    if (!paymentResult.success) {
      setOrderError(paymentResult.error.message);
      setPlacing(false);
      return;
    }

    const { razorpayOrderId, amount, currency, keyId } = paymentResult.data;

    const razorpay = new window.Razorpay({
      key: keyId,
      order_id: razorpayOrderId,
      amount,
      currency,
      name: "Muv",
      theme: { color: "#B7ABF0" },
      handler: async (response: any) => {
        const verifyResult = await verifyPayment({
          orderId,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
        if (verifyResult.success) {
          setOrderPlaced(true);
          clear();
          router.push(successUrl);
        } else {
          setOrderError("Payment verification failed — please contact support with your order number.");
        }
        setPlacing(false);
      },
      modal: {
        ondismiss: async () => {
          await recordFailedPayment({ orderId, reason: "Checkout dismissed by user" });
          setOrderError("Payment was cancelled — your order is saved, you can try paying again below.");
          setPlacing(false);
        },
      },
    });
    razorpay.open();
  }

  if (items.length === 0 && !orderPlaced) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <EmptyCart />
      </div>
    );
  }

  // Order placed, cart cleared, navigation to the confirmation page is in
  // flight — render nothing rather than either the (now-stale) checkout
  // form or a flash of EmptyCart.
  if (orderPlaced) return null;

  return (
    <div ref={checkoutTopRef} className="max-w-6xl mx-auto px-6 py-12 pb-24 lg:pb-12" style={{ scrollMarginTop: 100 }}>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <CheckoutHero step={step} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {orderError && (
            <div className="muv-error-banner" role="alert">
              <span>{orderError}</span>
            </div>
          )}

          {/* ---- 2. Customer Information (Final Customer Experience Sprint,
              Phase 7: contact + address merged into one step so they no
              longer feel like two separate pages — one combined Continue
              button gates on both). ---- */}
          {step === 0 && isGuest && (
            <p className="muv-text-meta text-xs mb-1">
              Have an account?{" "}
              <Link href={`/login?callbackUrl=${encodeURIComponent("/checkout")}`} className="muv-footer-link muv-text-solid">Sign in</Link> for faster checkout and order tracking — or continue as a guest below.
            </p>
          )}
          {step === 0 && (
            <div className="space-y-6">
              <ContactInfoStep
                name={name}
                email={email}
                phone={phone}
                isGuest={isGuest}
                onChange={(field, value) => (field === "name" ? setName(value) : field === "email" ? setEmail(value) : setPhone(value))}
              />

              <div>
                <p className="muv-text-meta text-xs uppercase tracking-wide mb-3">Delivery Address</p>
                <div className="space-y-4">
                  {/* Guests have no saved addresses to pick from — they always
                      fill this in fresh, submitted with the order itself rather
                      than saved as a standalone Address ahead of time. */}
                  {!isGuest && addresses.map((a) => (
                    <label key={a.id} className="flex gap-3 p-4 rounded-2xl border cursor-pointer" style={{ borderColor: selectedAddressId === a.id ? "var(--lavender)" : "var(--card-border)" }}>
                      <input type="radio" name="address" checked={selectedAddressId === a.id} onChange={() => setSelectedAddressId(a.id)} className="mt-1" />
                      <div>
                        <p className="muv-text-solid text-sm font-medium">{customerName} · {a.label}</p>
                        <p className="muv-text-body text-sm">{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} – {a.pincode}</p>
                        <p className="muv-text-meta text-xs mt-0.5">India · {a.phone}</p>
                      </div>
                    </label>
                  ))}

                  {!isGuest && !showNewAddressForm ? (
                    <button onClick={() => setShowNewAddressForm(true)} className="muv-btn-ghost">+ Add New Address</button>
                  ) : (
                    <div className="muv-card grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input placeholder="Address line 1" aria-label="Address line 1" className="muv-input sm:col-span-2" value={newAddress.line1} onChange={(e) => setNewAddress({ ...newAddress, line1: e.target.value })} />
                      <input placeholder="Address line 2 (optional)" aria-label="Address line 2" className="muv-input sm:col-span-2" value={newAddress.line2} onChange={(e) => setNewAddress({ ...newAddress, line2: e.target.value })} />
                      <input placeholder="City" aria-label="City" className="muv-input" value={newAddress.city} onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })} />
                      <input placeholder="State" aria-label="State" className="muv-input" value={newAddress.state} onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })} />
                      <input placeholder="PIN code" aria-label="PIN code" className="muv-input" value={newAddress.pincode} onChange={(e) => setNewAddress({ ...newAddress, pincode: e.target.value })} maxLength={6} inputMode="numeric" />
                      <input placeholder="Phone" aria-label="Phone" className="muv-input" value={newAddress.phone} onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })} />
                      {/* Founder Final Consolidated Polish, Part 2 — real
                          PIN/state cross-check via India Post's own postal
                          zone system (lib/utils/pincode.ts), not a full
                          fabricated pincode database. Warns, doesn't block —
                          it can only ever flag a genuine mismatch, never
                          reject a real address it doesn't recognize. */}
                      {pincodeMismatch && (
                        <p className="sm:col-span-2 text-xs" style={{ color: "#f0b429" }}>⚠ {pincodeMismatch}</p>
                      )}
                      {!isGuest && (
                        <div className="sm:col-span-2 flex items-center gap-2">
                          <input value="India" disabled className="muv-input" style={{ opacity: 0.6, flex: 1 }} aria-label="Country" />
                          <Button variant="primary" onClick={handleSaveAddress}>Save Address</Button>
                        </div>
                      )}
                      {!isGuest && (
                        <p className="sm:col-span-2 muv-text-faint text-[11px]">Save this address, then continue below.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="primary"
                  onClick={() => setStep(1)}
                  disabled={!validateContactInfo({ name, email, phone, isGuest }) || (isGuest ? !guestAddressComplete() : !selectedAddressId)}
                >
                  Continue to Delivery <ChevronRight size={15} />
                </Button>
              </div>
            </div>
          )}

          {/* ---- 3. Delivery Options ---- */}
          {step === 1 && (
            <div className="space-y-4">
              {SHIPPING_OPTIONS.map((s) => (
                <label key={s.id} className="flex items-center gap-3 p-4 rounded-2xl border cursor-pointer" style={{ borderColor: shipping === s.id ? "var(--lavender)" : "var(--card-border)" }}>
                  <input type="radio" name="shipping" checked={shipping === s.id} onChange={() => setShipping(s.id)} />
                  <div className="flex-1">
                    <p className="muv-text-solid text-sm font-medium">{s.label}</p>
                    <p className="muv-text-meta text-xs">{s.eta}</p>
                  </div>
                  <span className="muv-text-solid text-sm">{s.price === 0 ? "FREE" : `₹${s.price}`}</span>
                </label>
              ))}
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setStep(0)}><ChevronLeft size={15} /> Back</Button>
                <Button variant="primary" onClick={() => setStep(2)}>Continue to Payment <ChevronRight size={15} /></Button>
              </div>
            </div>
          )}

          {/* ---- 4. Payment Methods ---- */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Phase 1C (GAP-004) — COD is genuinely removed from the
                    options (not just visually disabled) when the admin has
                    turned it off in /admin/settings; createOrder rejects a
                    forged COD request server-side regardless. */}
                {(["UPI", "CARD", "NETBANKING", "COD"] as const).filter((m) => m !== "COD" || codEnabled).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    aria-pressed={paymentMethod === m}
                    className="p-4 rounded-2xl border text-sm muv-text-solid text-left"
                    style={{ borderColor: paymentMethod === m ? "var(--lavender)" : "var(--card-border)" }}
                  >
                    {m === "UPI" ? "UPI" : m === "CARD" ? "Credit / Debit Card" : m === "NETBANKING" ? "Net Banking" : "Cash on Delivery"}
                  </button>
                ))}
                <button disabled aria-disabled className="p-4 rounded-2xl border text-sm text-left col-span-2" style={{ borderColor: "var(--card-border)", opacity: 0.45, cursor: "not-allowed" }}>
                  Wallet <span className="muv-text-faint text-xs">— Muving Soon™</span>
                </button>
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setStep(1)}><ChevronLeft size={15} /> Back</Button>
                <Button variant="primary" onClick={() => setStep(3)}>Review Order <ChevronRight size={15} /></Button>
              </div>
            </div>
          )}

          {/* ---- Review: items + Order Notes (8) + Terms Acceptance (9) ---- */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Founder Final Customer Experience Sprint — Checkout Cart Editing:
                  quantity/remove now work directly from the review step, using
                  the same useCart() actions the cart page itself calls, so a
                  customer never has to leave checkout to fix their order. */}
              <div className="muv-card space-y-3">
                {items.map((i) => (
                  <div key={i.variantId} className="flex items-center justify-between gap-3 muv-text-body text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{i.name} ({i.size})</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="flex items-center border rounded-full px-1 py-0.5" style={{ borderColor: "var(--card-border)" }}>
                        <button
                          type="button"
                          onClick={() => (i.quantity > 1 ? updateQuantity(i.variantId, i.quantity - 1) : removeItem(i.variantId))}
                          className="muv-text-solid muv-tap-target"
                          style={{ minWidth: 32, minHeight: 32 }}
                          aria-label={i.quantity <= 1 ? `Remove ${i.name} from order` : `Decrease quantity of ${i.name}`}
                        >
                          −
                        </button>
                        <span className="muv-text-solid text-sm px-1">{i.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(i.variantId, i.quantity + 1)}
                          className="muv-text-solid muv-tap-target"
                          style={{ minWidth: 32, minHeight: 32 }}
                          aria-label={`Increase quantity of ${i.name}`}
                        >
                          +
                        </button>
                      </div>
                      <span style={{ minWidth: 56, textAlign: "right" }}>₹{i.price * i.quantity}</span>
                      <button type="button" onClick={() => removeItem(i.variantId)} className="muv-text-meta muv-tap-target" aria-label={`Remove ${i.name} from order`}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <OrderNotesStep value={orderNotes} onChange={setOrderNotes} />

              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-1" style={{ accentColor: "var(--lavender)" }} />
                <span className="muv-text-body">
                  I agree to the{" "}
                  <Link href="/terms" className="muv-footer-link muv-text-solid" target="_blank">Terms of Service</Link>,{" "}
                  <Link href="/privacy" className="muv-footer-link muv-text-solid" target="_blank">Privacy Policy</Link>, and{" "}
                  <Link href="/returns" className="muv-footer-link muv-text-solid" target="_blank">Return Policy</Link>.
                </span>
              </label>

              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setStep(2)} disabled={placing}><ChevronLeft size={15} /> Back</Button>
                <Button variant="primary" onClick={handlePlaceOrder} disabled={placing || !termsAccepted} aria-busy={placing}>
                  {placing ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Placing Order…
                    </>
                  ) : (
                    "Place Order"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ---- 6. Billing Summary ---- */}
        <div className="space-y-4">
          <OfferProgress subtotal={subtotal - couponDiscount} threshold={freeShippingThreshold} />
          <BillingSummary
            subtotal={subtotal}
            shippingFee={shippingFee + codSurcharge}
          />
        </div>
      </div>

      {/* ---- 7. Trust Section ---- */}
      <TrustIndicators items={CART_TRUST_ITEMS} />

      {/* ---- 11. Mobile Sticky Summary ---- */}
      {step === 3 && (
        <StickyCheckoutSummary total={total} onPlaceOrder={handlePlaceOrder} placing={placing} disabled={!termsAccepted} />
      )}
    </div>
  );
}
