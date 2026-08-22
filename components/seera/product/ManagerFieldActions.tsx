"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import styles from "./WorkflowActions.module.css";
import journeyStyles from "./FieldJourney.module.css";
import { captureGps, GpsBadge, type GpsStatus } from "./gps";
import { EmptyOptionHint } from "./EmptyOptionHint";

type Option = { value: string; label: string; meta?: string };
type SkuOption = Option & { unit?: string };
type LinkedActivity = {
  shopsVisited: number;
  productive: number;
  orders: number;
  bookedValue: number;
  eligibleDeliveredValue: number;
  photos: number;
  followUpsDue: number;
  exceptions: number;
};

async function send(body: unknown) {
  const response = await fetch("/api/manager/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result?.error?.message ?? result?.error?.code ?? "Action failed");
  return result;
}

const PARTNER_PURPOSES: [string, string, string][] = [
  ["STOCK_REVIEW", "Stock review", "स्टॉक समीक्षा"],
  ["PAYMENT_FOLLOW_UP", "Payment follow-up", "भुगतान फॉलो-अप"],
  ["ORDER_REVIEW", "Order review", "ऑर्डर समीक्षा"],
  ["MARKET_DEVELOPMENT", "Market development", "बाज़ार विकास"],
  ["COMPLAINT", "Complaint", "शिकायत"],
  ["CREDIT_REVIEW", "Credit review", "क्रेडिट समीक्षा"],
  ["RETURNS_CLAIMS", "Returns / claims", "वापसी / दावे"],
  ["GENERAL_MEETING", "General meeting", "सामान्य बैठक"],
  ["OTHER", "Other", "अन्य"],
];
const JOINT_OBJECTIVES: [string, string, string][] = [
  ["COACHING", "Coaching", "कोचिंग"],
  ["TARGET_RECOVERY", "Target recovery", "लक्ष्य पुनर्प्राप्ति"],
  ["MARKET_DEVELOPMENT", "Market development", "बाज़ार विकास"],
  ["PRODUCT_PUSH", "Product push", "उत्पाद पुश"],
  ["PAYMENT_FOLLOW_UP", "Payment follow-up", "भुगतान फॉलो-अप"],
  ["RETAILER_RELATIONSHIP", "Retailer relationship", "रिटेलर संबंध"],
  ["PERFORMANCE_REVIEW", "Performance review", "प्रदर्शन समीक्षा"],
  ["OTHER", "Other", "अन्य"],
];

export function ManagerFieldActions({
  kind,
  language,
  sessionId,
  activeVisit,
  activeJoint,
  jointExecutiveName,
  jointExecutiveSyncNote,
  linkedActivity,
  retailers = [],
  executives = [],
  geographies = [],
  skus = [],
  partners = [],
  distributors = [],
}: {
  kind: "retailing" | "joint" | "partner";
  language: "EN" | "HI";
  sessionId?: string;
  activeVisit?: string;
  activeJoint?: string;
  jointExecutiveName?: string;
  jointExecutiveSyncNote?: string;
  linkedActivity?: LinkedActivity;
  retailers?: Option[];
  executives?: Option[];
  geographies?: Option[];
  skus?: SkuOption[];
  partners?: Option[];
  distributors?: Option[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [outcome, setOutcome] = useState("ORDER_BOOKED"),
    [paymentType, setPaymentType] = useState<"CASH" | "CREDIT">("CREDIT"),
    [showAddCustomer, setShowAddCustomer] = useState(false),
    [showAddParty, setShowAddParty] = useState(false),
    [gpsStatus, setGpsStatus] = useState<GpsStatus>("IDLE"),
    [photoPreview, setPhotoPreview] = useState<string | null>(null),
    [orderLines, setOrderLines] = useState<{ key: string; skuId: string; quantity: number; rate: number }[]>([
      { key: crypto.randomUUID(), skuId: "", quantity: 1, rate: 0 },
    ]);
  const skuById = new Map(skus.map((s) => [s.value, s]));

  const run = async (body: unknown) => {
    setBusy(true);
    setMessage("");
    try {
      await send(body);
      setMessage(hi ? "कार्रवाई सफलतापूर्वक पूरी हुई।" : "Action completed successfully.");
      router.refresh();
      // Every successful action here is a step forward (Add Customer -> Check-in -> Order ->
      // Photo/Complete) — without this the next screen renders correctly but below the user's
      // current scroll position on a long form, reading as if nothing happened. Same fix pattern
      // as the Executive's scrollToJourneyTop().
      document.getElementById("manager-field-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const withGps = async (extra: Record<string, unknown>) => {
    setGpsStatus("LOCATING");
    const { status, point } = await captureGps();
    setGpsStatus(status);
    let gpsExceptionReason: string | undefined;
    if (status === "PERMISSION_DENIED" || status === "UNAVAILABLE") {
      gpsExceptionReason = window.prompt(hi ? "GPS उपलब्ध नहीं — कारण दर्ज करें" : "GPS unavailable — enter a reason") ?? undefined;
      if (!gpsExceptionReason) return null;
    }
    return { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, gpsExceptionReason, ...extra };
  };

  const capturePhotoButton = (visitId: string | undefined) => (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => setPhotoPreview(String(reader.result));
          reader.readAsDataURL(file);
        }}
      />
      <div className={journeyStyles.quickActions}>
        <button type="button" onClick={() => fileRef.current?.click()}>
          {photoPreview ? (hi ? "फिर से लें" : "Retake") : hi ? "कैमरा खोलें" : "Open camera"}
        </button>
        {photoPreview && (
          <button
            type="button"
            disabled={busy || !visitId}
            onClick={() => {
              const file = fileRef.current?.files?.[0];
              if (!file || !visitId) return;
              setBusy(true);
              const reader = new FileReader();
              reader.onload = async () => {
                try {
                  const base64 = String(reader.result).split(",")[1] ?? "";
                  await send({
                    action: "capture-photo-manager",
                    payload: { visitId, photoType: "SHOPFRONT", fileBase64: base64, mimeType: file.type, originalName: file.name, idempotencyKey: crypto.randomUUID() },
                  });
                  setPhotoPreview(null);
                  setMessage(hi ? "फ़ोटो जोड़ी गई।" : "Photo added.");
                  router.refresh();
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Photo upload failed");
                } finally {
                  setBusy(false);
                }
              };
              reader.readAsDataURL(file);
            }}
          >
            {hi ? "फ़ोटो सहेजें" : "Save photo"}
          </button>
        )}
      </div>
      {photoPreview && <img src={photoPreview} alt="" style={{ maxWidth: 160, borderRadius: 10, marginTop: 8 }} />}
    </div>
  );

  if (kind === "retailing") {
    if (showAddCustomer)
      return (
        <section className={styles.panel} id="manager-field-panel">
          <div>
            <small>{hi ? "मैनेजर रिटेलिंग" : "MANAGER RETAILING"}</small>
            <h2>{hi ? "ग्राहक जोड़ें" : "Add customer"}</h2>
          </div>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const withPoint = await withGps({});
              if (!withPoint) return;
              const idempotencyKey = crypto.randomUUID();
              await run({
                action: "retailer-check-in",
                payload: {
                  workSessionId: sessionId,
                  newRetailer: {
                    businessName: String(form.get("businessName")),
                    address: { area: String(form.get("area")) },
                    ownerName: String(form.get("ownerName") ?? "") || undefined,
                    mobile: String(form.get("mobile") ?? "") || undefined,
                    customerType: String(form.get("customerType") ?? "") || undefined,
                    distributorId: String(form.get("distributorId") ?? "") || undefined,
                    notes: String(form.get("notes") ?? "") || undefined,
                  },
                  ...withPoint,
                  idempotencyKey,
                },
              });
              setShowAddCustomer(false);
            }}
          >
            <label>{hi ? "दुकान / फर्म का नाम *" : "Firm / Shop name *"}<input name="businessName" required /></label>
            <label>{hi ? "क्षेत्र / पता *" : "Area / Address *"}<input name="area" required /></label>
            <label>{hi ? "मालिक" : "Owner"}<input name="ownerName" /></label>
            <label>{hi ? "मोबाइल" : "Mobile"}<input name="mobile" inputMode="tel" /></label>
            <label>
              {hi ? "ग्राहक प्रकार" : "Customer type"}
              <select name="customerType" defaultValue="RETAILER">
                <option value="RETAILER">{hi ? "खुदरा विक्रेता" : "Retailer"}</option>
                <option value="WHOLESALER">{hi ? "थोक विक्रेता" : "Wholesaler"}</option>
                <option value="INSTITUTIONAL_OTHER">{hi ? "संस्थागत / अन्य" : "Institutional / other"}</option>
              </select>
            </label>
            <label>
              {hi ? "वितरक (वैकल्पिक)" : "Distributor (optional)"}
              <select name="distributorId" defaultValue="">
                <option value="">{hi ? "स्वतः निर्धारित करें" : "Auto-assign if possible"}</option>
                {distributors.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </label>
            <label>{hi ? "टिप्पणी" : "Notes"}<input name="notes" /></label>
            <button className={styles.list} disabled={busy}>{hi ? "सहेजें और चेक-इन करें" : "Save & check in"}</button>
            <button type="button" onClick={() => setShowAddCustomer(false)}>{hi ? "रद्द करें" : "Cancel"}</button>
          </form>
          {message && <p role="status">{message}</p>}
        </section>
      );
    return (
      <section className={styles.panel} id="manager-field-panel">
        <div>
          <small>{hi ? "मैनेजर रिटेलिंग" : "MANAGER RETAILING"}</small>
          <h2>{activeVisit ? (hi ? "विज़िट पूरी करें" : "Complete visit") : hi ? "रिटेलर पर चेक-इन" : "Check in at retailer"}</h2>
        </div>
        {gpsStatus !== "IDLE" && <div className={journeyStyles.gpsRow}><GpsBadge language={language} status={gpsStatus} /></div>}
        {!activeVisit ? (
          <>
            <div className={styles.inlineActions}>
              <button onClick={() => setShowAddCustomer(true)}>{hi ? "+ ग्राहक जोड़ें" : "+ Add customer"}</button>
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const withPoint = await withGps({});
                if (!withPoint) return;
                void run({ action: "retailer-check-in", payload: { workSessionId: sessionId, retailerId: String(form.get("retailerId")), idempotencyKey: crypto.randomUUID(), ...withPoint } });
              }}
            >
              <label>
                {hi ? "रिटेलर" : "Retailer"}
                <select name="retailerId" required>
                  <option value="">{hi ? "नाम से चुनें" : "Choose by name"}</option>
                  {retailers.map((x) => <option key={x.value} value={x.value}>{x.label}{x.meta ? ` · ${x.meta}` : ""}</option>)}
                </select>
              </label>
              {!retailers.length && <EmptyOptionHint language={language} fallback={hi ? "ऊपर '+ ग्राहक जोड़ें' का उपयोग करें।" : "Use '+ Add customer' above."} />}
              <button disabled={busy || !sessionId || !retailers.length}>{hi ? "चेक-इन" : "Check in"}</button>
            </form>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void (async () => {
                // Booking an order IS the checkout for this visit (the backend closes the visit
                // as part of booking) — a separate check-out call afterward would find the visit
                // already closed and be rejected, so GPS/photo-exception/route-deviation are
                // folded into the SAME book-order call for the ORDER_BOOKED path.
                if (outcome === "ORDER_BOOKED") {
                  const validLines = orderLines.filter((l) => l.skuId && l.quantity > 0);
                  if (validLines.some((l) => !(l.rate > 0))) {
                    setMessage(hi ? "हर उत्पाद के लिए दर (₹0 से अधिक) दर्ज करें।" : "Enter a rate greater than ₹0 for every product.");
                    return;
                  }
                  const withPoint = await withGps({
                    visitId: activeVisit,
                    notes: String(form.get("notes") || "") || undefined,
                    commercialPaymentType: paymentType,
                    lines: validLines.map((l) => ({ skuId: l.skuId, quantity: l.quantity, rate: l.rate })),
                    idempotencyKey: crypto.randomUUID(),
                    photoExceptionReason: String(form.get("photoExceptionReason") || "") || undefined,
                    routeDeviationReason: String(form.get("routeDeviationReason") || "") || undefined,
                  });
                  if (!withPoint) return;
                  const { gpsExceptionReason: _ignored, ...bookPayload } = withPoint;
                  await run({ action: "book-order", payload: bookPayload });
                  return;
                }
                const withPoint = await withGps({
                  visitId: activeVisit,
                  outcome,
                  noOrderReason: String(form.get("reason") || "") || undefined,
                  notes: String(form.get("notes") || "") || undefined,
                  photoExceptionReason: String(form.get("photoExceptionReason") || "") || undefined,
                  routeDeviationReason: String(form.get("routeDeviationReason") || "") || undefined,
                });
                if (!withPoint) return;
                await run({ action: "retailer-check-out", payload: withPoint });
              })();
            }}
          >
            <label>
              {hi ? "परिणाम" : "Outcome"}
              <select name="outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
                <option value="ORDER_BOOKED">ORDER_BOOKED</option>
                <option value="NO_ORDER">NO_ORDER</option>
                <option value="FOLLOW_UP">FOLLOW_UP</option>
                <option value="COLLECTION">COLLECTION</option>
                <option value="MARKET_INTELLIGENCE">MARKET_INTELLIGENCE</option>
              </select>
            </label>
            {outcome === "ORDER_BOOKED" ? (
              <>
                {orderLines.map((line, index) => {
                  const sku = skuById.get(line.skuId);
                  const lineTotal = (line.rate || 0) * (line.quantity || 0);
                  return (
                    <div key={line.key} className={styles.orderLine}>
                      <label>
                        {hi ? "उत्पाद / वेरिएंट" : "Product / Variant"}
                        <select
                          value={line.skuId}
                          onChange={(event) => {
                            const chosen = skuById.get(event.target.value);
                            setOrderLines((c) =>
                              c.map((x, i) => (i === index ? { ...x, skuId: event.target.value, rate: chosen ? Number(chosen.meta ?? 0) : x.rate } : x)),
                            );
                          }}
                          required
                        >
                          <option value="">{hi ? "उत्पाद चुनें" : "Choose product"}</option>
                          {skus.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                        </select>
                        {!skus.length && <EmptyOptionHint language={language} fallback={hi ? "कोई सक्रिय उत्पाद उपलब्ध नहीं है — Admin से जांच करें।" : "No active product is available — check with Admin."} />}
                      </label>
                      <label>
                        {hi ? "मात्रा" : "Quantity"}
                        {sku?.unit ? ` (${sku.unit})` : ""}
                        <input type="number" min={1} value={line.quantity} onChange={(event) => setOrderLines((c) => c.map((x, i) => (i === index ? { ...x, quantity: Number(event.target.value) } : x)))} required />
                      </label>
                      <label>
                        {hi ? "दर (GST सहित)" : "Rate (Incl. GST)"}
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={line.rate || ""}
                          placeholder={hi ? "दर दर्ज करें" : "Enter rate"}
                          onChange={(event) => setOrderLines((c) => c.map((x, i) => (i === index ? { ...x, rate: Number(event.target.value) } : x)))}
                          required
                        />
                      </label>
                      <label>
                        {hi ? "कुल" : "Total"}
                        <input value={line.skuId ? `₹${lineTotal.toFixed(2)}` : "—"} readOnly />
                      </label>
                      {orderLines.length > 1 && <button type="button" onClick={() => setOrderLines((c) => c.filter((x) => x.key !== line.key))}>{hi ? "हटाएं" : "Remove"}</button>}
                    </div>
                  );
                })}
                <button type="button" onClick={() => setOrderLines((c) => [...c, { key: crypto.randomUUID(), skuId: "", quantity: 1, rate: 0 }])}>{hi ? "और आइटम जोड़ें" : "Add another item"}</button>
                <div className={journeyStyles.quickActions}>
                  <strong>{hi ? "ऑर्डर कुल" : "Order total"}</strong>
                  <span>₹{orderLines.reduce((sum, l) => sum + (l.rate || 0) * (l.quantity || 0), 0).toFixed(2)}</span>
                </div>
                <label>
                  {hi ? "भुगतान प्रकार" : "Payment type"}
                  <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as "CASH" | "CREDIT")}>
                    <option value="CREDIT">{hi ? "उधार" : "CREDIT"}</option>
                    <option value="CASH">{hi ? "नकद" : "CASH"}</option>
                  </select>
                </label>
              </>
            ) : (
              <label>{hi ? "बिना ऑर्डर का कारण" : "No-order reason"}<input name="reason" /></label>
            )}
            <label>{hi ? "टिप्पणी" : "Notes"}<input name="notes" /></label>
            <label>
              {hi ? "फ़ोटो न होने का कारण (यदि लागू)" : "Reason no photo (if applicable)"}
              <select name="photoExceptionReason" defaultValue="">
                <option value="">{hi ? "फ़ोटो संलग्न है" : "Photo attached"}</option>
                <option value="RETAILER_REFUSED">{hi ? "रिटेलर ने मना किया" : "Retailer refused"}</option>
                <option value="CAMERA_ISSUE">{hi ? "कैमरा समस्या" : "Camera issue"}</option>
                <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
              </select>
            </label>
            <label>
              {hi ? "मार्ग विचलन (यदि लागू)" : "Route deviation (if applicable)"}
              <input name="routeDeviationReason" placeholder={hi ? "वैकल्पिक" : "Optional"} />
            </label>
            {capturePhotoButton(activeVisit)}
            <button disabled={busy}>{outcome === "ORDER_BOOKED" ? (hi ? "ऑर्डर बुक करें और चेक-आउट करें" : "Book order & check out") : hi ? "चेक-आउट" : "Check out"}</button>
          </form>
        )}
        {message && <p role="status">{message}</p>}
      </section>
    );
  }

  if (kind === "partner") {
    if (showAddParty)
      return (
        <section className={styles.panel} id="manager-field-panel">
          <div>
            <small>{hi ? "डिस्ट्रीब्यूटर / एस.एस. विज़िट" : "DISTRIBUTOR / S.S. VISIT"}</small>
            <h2>{hi ? "नई पार्टी जोड़ें" : "Add new party"}</h2>
          </div>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const withPoint = await withGps({ purpose: String(form.get("purpose")) });
              if (!withPoint) return;
              await run({
                action: "partner-check-in",
                payload: {
                  workSessionId: sessionId,
                  partnerType: String(form.get("partnerType")),
                  newParty: {
                    businessName: String(form.get("businessName")),
                    area: String(form.get("area")),
                    contactPerson: String(form.get("contactPerson") ?? "") || undefined,
                    mobile: String(form.get("mobile") ?? "") || undefined,
                    notes: String(form.get("notes") ?? "") || undefined,
                  },
                  ...withPoint,
                  idempotencyKey: crypto.randomUUID(),
                },
              });
              setShowAddParty(false);
            }}
          >
            <label>
              {hi ? "प्रकार" : "Type"}
              <select name="partnerType" required>
                <option value="DISTRIBUTOR">{hi ? "वितरक" : "Distributor"}</option>
                <option value="SUPER_STOCKIST">{hi ? "सुपर स्टॉकिस्ट" : "Super Stockist"}</option>
              </select>
            </label>
            <label>{hi ? "फर्म का नाम *" : "Firm name *"}<input name="businessName" required /></label>
            <label>{hi ? "क्षेत्र / पता *" : "Area / address *"}<input name="area" required /></label>
            <label>{hi ? "संपर्क व्यक्ति" : "Contact person"}<input name="contactPerson" /></label>
            <label>{hi ? "मोबाइल" : "Mobile"}<input name="mobile" inputMode="tel" /></label>
            <label>
              {hi ? "विज़िट का उद्देश्य" : "Visit purpose"}
              <select name="purpose" required>
                {PARTNER_PURPOSES.map(([v, en, hiLabel]) => <option key={v} value={v}>{hi ? hiLabel : en}</option>)}
              </select>
            </label>
            <label>{hi ? "टिप्पणी" : "Notes"}<input name="notes" /></label>
            <button disabled={busy}>{hi ? "सहेजें और चेक-इन करें" : "Save & check in"}</button>
            <button type="button" onClick={() => setShowAddParty(false)}>{hi ? "रद्द करें" : "Cancel"}</button>
          </form>
          {message && <p role="status">{message}</p>}
        </section>
      );
    return (
      <section className={styles.panel} id="manager-field-panel">
        <div>
          <small>{hi ? "डिस्ट्रीब्यूटर / एस.एस. विज़िट" : "DISTRIBUTOR / S.S. VISIT"}</small>
          <h2>{activeVisit ? (hi ? "पार्टनर विज़िट पूरी करें" : "Complete partner visit") : hi ? "डिस्ट्रीब्यूटर / एस.एस. पर चेक-इन" : "Check in at Distributor / S.S."}</h2>
        </div>
        {gpsStatus !== "IDLE" && <div className={journeyStyles.gpsRow}><GpsBadge language={language} status={gpsStatus} /></div>}
        {!activeVisit ? (
          <>
            <div className={styles.inlineActions}>
              <button onClick={() => setShowAddParty(true)}>{hi ? "+ नई पार्टी जोड़ें" : "+ Add new party"}</button>
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const [partnerId, partnerType] = String(form.get("partnerId")).split("::");
                const withPoint = await withGps({ purpose: String(form.get("purpose")) });
                if (!withPoint) return;
                void run({ action: "partner-check-in", payload: { workSessionId: sessionId, partnerType, partnerId, ...withPoint, idempotencyKey: crypto.randomUUID() } });
              }}
            >
              <label>
                {hi ? "डिस्ट्रीब्यूटर / एस.एस." : "Distributor / S.S."}
                <select name="partnerId" required>
                  <option value="">{hi ? "नाम से चुनें" : "Choose by name"}</option>
                  {partners.map((x) => <option key={x.value} value={x.value}>{x.label}{x.meta ? ` · ${x.meta}` : ""}</option>)}
                </select>
              </label>
              {!partners.length && <EmptyOptionHint language={language} fallback={hi ? "ऊपर '+ नई पार्टी जोड़ें' का उपयोग करें।" : "Use '+ Add new party' above."} />}
              <label>
                {hi ? "विज़िट का उद्देश्य" : "Visit purpose"}
                <select name="purpose" required>
                  {PARTNER_PURPOSES.map(([v, en, hiLabel]) => <option key={v} value={v}>{hi ? hiLabel : en}</option>)}
                </select>
              </label>
              <button disabled={busy || !sessionId || !partners.length}>{hi ? "चेक-इन" : "Check in"}</button>
            </form>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void (async () => {
                const withPoint = await withGps({
                  visitId: activeVisit,
                  outcome: String(form.get("outcome")),
                  notes: String(form.get("notes") || "") || undefined,
                  nextAction: String(form.get("nextAction") || "") || undefined,
                  followUpAt: String(form.get("followUpAt") || "") || undefined,
                  photoExceptionReason: String(form.get("photoExceptionReason") || "") || undefined,
                });
                if (!withPoint) return;
                await run({ action: "partner-check-out", payload: withPoint });
              })();
            }}
          >
            <label>
              {hi ? "परिणाम" : "Outcome"}
              <select name="outcome" defaultValue="PRODUCTIVE">
                <option value="PRODUCTIVE">PRODUCTIVE</option>
                <option value="FOLLOW_UP">FOLLOW_UP</option>
                <option value="NO_ORDER">NO_ORDER</option>
              </select>
            </label>
            <label>{hi ? "चर्चा (स्टॉक / भुगतान / दावे / बाज़ार प्रतिक्रिया)" : "Discussion (stock / payment / claims / market feedback)"}<textarea name="notes" rows={3} /></label>
            <label>{hi ? "अगला कदम" : "Next action"}<input name="nextAction" /></label>
            <label>{hi ? "फॉलो-अप तिथि" : "Follow-up date"}<input name="followUpAt" type="date" /></label>
            <label>
              {hi ? "फ़ोटो न होने का कारण (यदि लागू)" : "Reason no photo (if applicable)"}
              <select name="photoExceptionReason" defaultValue="">
                <option value="">{hi ? "फ़ोटो संलग्न है" : "Photo attached"}</option>
                <option value="PARTY_REFUSED">{hi ? "पार्टी ने मना किया" : "Party refused"}</option>
                <option value="CAMERA_ISSUE">{hi ? "कैमरा समस्या" : "Camera issue"}</option>
                <option value="EMERGENCY">{hi ? "आपातकाल" : "Emergency"}</option>
                <option value="MANAGER_APPROVED">{hi ? "स्वीकृत छूट" : "Manager-approved exception"}</option>
                <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
              </select>
            </label>
            {capturePhotoButton(activeVisit)}
            <button disabled={busy}>{hi ? "चेक-आउट" : "Check out"}</button>
          </form>
        )}
        {message && <p role="status">{message}</p>}
      </section>
    );
  }

  // kind === "joint"
  return (
    <section className={styles.panel} id="manager-field-panel">
      <div>
        <small>{hi ? "संयुक्त कार्य" : "JOINT WORKING"}</small>
        <h2>{activeJoint ? (hi ? "संयुक्त कार्य पूरा करें" : "Close joint work") : hi ? "टीम के साथ कार्य शुरू करें" : "Start work with team"}</h2>
      </div>
      {!activeJoint ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run({ action: "start-joint", payload: { salesExecutiveId: String(form.get("executiveId")), objective: String(form.get("objective")) } });
          }}
        >
          <label>
            {hi ? "सेल्स एग्जीक्यूटिव" : "Sales Executive"}
            <select name="executiveId" required>
              <option value="">{hi ? "नाम से चुनें" : "Choose by name"}</option>
              {executives.map((x) => <option key={x.value} value={x.value}>{x.label}{x.meta ? ` · ${x.meta}` : ""}</option>)}
            </select>
          </label>
          {!executives.length && <EmptyOptionHint language={language} fallback={hi ? "पहले टीम में एक्ज़ीक्यूटिव जोड़ें।" : "Add an Executive to your team first."} />}
          <label>
            {hi ? "उद्देश्य" : "Objective"}
            <select name="objective" required>
              {JOINT_OBJECTIVES.map(([v, en, hiLabel]) => <option key={v} value={v}>{hi ? hiLabel : en}</option>)}
            </select>
          </label>
          <button disabled={busy || !executives.length}>{hi ? "संयुक्त कार्य शुरू करें" : "Start joint work"}</button>
        </form>
      ) : (
        <>
          <p className={styles.emptyHint}>
            {hi
              ? `${jointExecutiveName ?? "एग्जीक्यूटिव"} इस समय अपनी सामान्य विज़िट प्रक्रिया दर्ज कर रहे हैं — नीचे उनकी लाइव गतिविधि दिखाई गई है।`
              : `${jointExecutiveName ?? "The Executive"} is logging their own visits as usual — their live activity during this session is shown below.`}
          </p>
          {jointExecutiveSyncNote && (
            <p className={styles.emptyHint} role="status" data-tone="warn">
              {jointExecutiveSyncNote}
            </p>
          )}
          {linkedActivity && (
            <dl className={journeyStyles.statGrid} style={{ gridColumn: "1/-1" }}>
              <div><dt>{hi ? "दुकानें देखीं" : "Shops visited"}</dt><dd>{linkedActivity.shopsVisited}</dd></div>
              <div><dt>{hi ? "उत्पादक" : "Productive"}</dt><dd>{linkedActivity.productive}</dd></div>
              <div><dt>{hi ? "ऑर्डर" : "Orders"}</dt><dd>{linkedActivity.orders}</dd></div>
              <div><dt>{hi ? "बुक मूल्य" : "Booked value"}</dt><dd>₹{linkedActivity.bookedValue.toLocaleString("en-IN")}</dd></div>
              <div><dt>{hi ? "फ़ोटो" : "Photos"}</dt><dd>{linkedActivity.photos}</dd></div>
              <div><dt>{hi ? "अपवाद" : "Exceptions"}</dt><dd>{linkedActivity.exceptions}</dd></div>
            </dl>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run({ action: "close-joint", payload: { jointWorkId: activeJoint, observations: String(form.get("observations")), coaching: String(form.get("coaching")) } });
            }}
          >
            <label>{hi ? "अवलोकन" : "Observation"}<textarea name="observations" rows={3} required /></label>
            <label>{hi ? "कोचिंग नोट" : "Coaching note"}<textarea name="coaching" rows={3} required /></label>
            <button disabled={busy}>{hi ? "संयुक्त कार्य पूरा करें" : "Close joint work"}</button>
          </form>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
