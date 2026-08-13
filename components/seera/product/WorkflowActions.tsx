"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import styles from "./WorkflowActions.module.css";
import journeyStyles from "./FieldJourney.module.css";
import { captureGps, GpsBadge, type GpsStatus } from "./gps";
type Option = { value: string; label: string; meta?: string };
async function send(url: string, body: unknown) {
  const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw Object.assign(
      new Error(data?.error?.message ?? data?.error?.code ?? "Request failed"),
      { code: data?.error?.code as string | undefined, details: data?.error?.details as Record<string, unknown> | undefined },
    );
  return data;
}
type SimilarProspect = { id: string; businessName: string; normalizedMobile: string; stage: string };
const key = () => crypto.randomUUID();
type EndDaySummary = {
  workingType: string;
  executivesWorkedWith: string[];
  retailerVisits: number;
  distributorVisits: number;
  superStockistVisits: number;
  distributorProspects: number;
  ordersCount: number;
  bookedValue: number;
  photos: number;
  followUps: number;
  distanceKm: number | null;
};

const MANAGER_WORK_TYPES: [string, string, string][] = [
  ["RETAILING", "Retailing", "रिटेलिंग"],
  ["JOINT_WORKING", "Joint working", "संयुक्त कार्य"],
  ["DISTRIBUTOR_VISIT", "Distributor visit", "वितरक विज़िट"],
  ["SUPER_STOCKIST_VISIT", "Super Stockist visit", "सुपर स्टॉकिस्ट विज़िट"],
  ["DISTRIBUTOR_SEARCH", "Distributor search", "वितरक खोज"],
  ["COLLECTION_FOLLOW_UP", "Collection follow-up", "संग्रह फॉलो-अप"],
  ["TEAM_REVIEW", "Team review", "टीम समीक्षा"],
  ["MARKET_DEVELOPMENT", "Market development", "बाज़ार विकास"],
  ["OTHER", "Other authorized work", "अन्य अधिकृत कार्य"],
];

export function WorkflowActions({
  kind,
  language,
  options = [],
  activeId,
  prospectEndpoint = "/api/manager/operations",
  prospectAction = "create-distributor-prospect",
  endDaySummary,
}: {
  kind: "manager-day" | "prospect" | "finance-payment" | "ta-verify";
  language: "EN" | "HI";
  options?: Option[];
  activeId?: string;
  prospectEndpoint?: string;
  prospectAction?: string;
  endDaySummary?: EndDaySummary | null;
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [gpsStatus, setGpsStatus] = useState<GpsStatus>("IDLE"),
    [confirmEndDay, setConfirmEndDay] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
      null,
    );
  const prospectFormRef = useRef<HTMLFormElement>(null);
  const [prospectBusy, setProspectBusy] = useState(false);
  const [prospectCreated, setProspectCreated] = useState<{ id: string; businessName: string; stage: string } | null>(null);
  const [prospectDuplicate, setProspectDuplicate] = useState<SimilarProspect[] | null>(null);
  const [prospectMessage, setProspectMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const submitProspect = async (form: HTMLFormElement, confirmDuplicate: boolean) => {
    const f = new FormData(form);
    setProspectBusy(true);
    setProspectMessage(null);
    try {
      const result = await send(prospectEndpoint, {
        action: prospectAction,
        payload: {
          businessName: String(f.get("businessName")),
          mobile: String(f.get("mobile")),
          alternateMobile: String(f.get("alternateMobile") ?? "") || undefined,
          areaId: String(f.get("areaId") ?? "") || undefined,
          geographyType: String(f.get("geographyType") ?? "") || undefined,
          existingBrands: String(f.get("existingBrands") ?? "") || undefined,
          expectedVolume: String(f.get("expectedVolume") ?? "") || undefined,
          sampleGiven: String(f.get("sampleGiven")) === "yes",
          sampleDetails: String(f.get("sampleDetails") ?? "") || undefined,
          notes: String(f.get("notes") ?? "") || undefined,
          profile: { source: "PORTAL" },
          followUpAt: String(f.get("followUpAt") ?? "") || undefined,
          confirmDuplicate,
        },
      });
      setProspectDuplicate(null);
      setProspectCreated({ id: result.id, businessName: result.businessName, stage: result.stage });
      form.reset();
      router.refresh();
    } catch (e) {
      const details = e && typeof e === "object" && "details" in e ? (e as { details?: { similar?: SimilarProspect[] } }).details : undefined;
      if (details?.similar?.length) {
        setProspectDuplicate(details.similar);
      } else {
        setProspectMessage({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
      }
    } finally {
      setProspectBusy(false);
    }
  };
  const scheduleProspectFollowUp = async (prospectId: string, stage: string, followUpAt: string) => {
    setProspectBusy(true);
    try {
      await send(prospectEndpoint, {
        action: "update-prospect",
        payload: { prospectId, stage, followUpAt },
      });
      setProspectMessage({ ok: true, text: hi ? "फॉलो-अप निर्धारित किया गया।" : "Follow-up scheduled." });
      router.refresh();
    } catch (e) {
      setProspectMessage({ ok: false, text: e instanceof Error ? e.message : "Could not schedule follow-up" });
    } finally {
      setProspectBusy(false);
    }
  };
  const updateExistingProspect = async (prospectId: string, stage: string) => {
    setProspectBusy(true);
    try {
      await send(prospectEndpoint, { action: "update-prospect", payload: { prospectId, stage } });
      setProspectDuplicate(null);
      setProspectMessage({ ok: true, text: hi ? "मौजूदा संभावना अपडेट की गई।" : "Existing prospect updated." });
      router.refresh();
    } catch (e) {
      setProspectMessage({ ok: false, text: e instanceof Error ? e.message : "Could not update" });
    } finally {
      setProspectBusy(false);
    }
  };
  const withGps = async () => {
    setGpsStatus("LOCATING");
    const { status, point } = await captureGps();
    setGpsStatus(status);
    let exceptionReason: string | undefined;
    if (status === "PERMISSION_DENIED" || status === "UNAVAILABLE") {
      exceptionReason = window.prompt(hi ? "GPS उपलब्ध नहीं — कारण दर्ज करें" : "GPS unavailable — enter a reason") ?? undefined;
    }
    return { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, exceptionReason };
  };
  const run = async (task: () => Promise<unknown>, successText?: { en: string; hi: string }) => {
    setBusy(true);
    setMessage(null);
    try {
      await task();
      setMessage({
        ok: true,
        text: successText ? (hi ? successText.hi : successText.en) : hi ? "सहेजा गया।" : "Saved.",
      });
      router.refresh();
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof Error ? e.message : "Action failed",
      });
    } finally {
      setBusy(false);
    }
  };
  if (kind === "manager-day")
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "दैनिक कार्य" : "DAILY WORKING"}</small>
          <h2>
            {activeId
              ? hi
                ? "सक्रिय कार्य दिवस"
                : "Active work day"
              : hi
                ? "आज का काम शुरू करें"
                : "Start today’s work"}
          </h2>
        </div>
        {gpsStatus !== "IDLE" && (
          <div className={journeyStyles.gpsRow}>
            <GpsBadge language={language} status={gpsStatus} />
          </div>
        )}
        {activeId ? (
          !confirmEndDay ? (
            <>
              {endDaySummary && (
                <dl className={journeyStyles.statGrid} style={{ gridColumn: "1/-1" }}>
                  <div><dt>{hi ? "कार्य प्रकार" : "Work type"}</dt><dd>{endDaySummary.workingType}</dd></div>
                  <div><dt>{hi ? "साथ काम किया" : "Worked with"}</dt><dd>{endDaySummary.executivesWorkedWith.join(", ") || "—"}</dd></div>
                  <div><dt>{hi ? "रिटेलर विज़िट" : "Retailer visits"}</dt><dd>{endDaySummary.retailerVisits}</dd></div>
                  <div><dt>{hi ? "वितरक विज़िट" : "Distributor visits"}</dt><dd>{endDaySummary.distributorVisits}</dd></div>
                  <div><dt>{hi ? "एस.एस. विज़िट" : "S.S. visits"}</dt><dd>{endDaySummary.superStockistVisits}</dd></div>
                  <div><dt>{hi ? "वितरक संभावना" : "Distributor prospects"}</dt><dd>{endDaySummary.distributorProspects}</dd></div>
                  <div><dt>{hi ? "अपना ऑर्डर" : "Own orders"}</dt><dd>{endDaySummary.ordersCount} · ₹{endDaySummary.bookedValue.toLocaleString("en-IN")}</dd></div>
                  <div><dt>{hi ? "फ़ोटो" : "Photos"}</dt><dd>{endDaySummary.photos}</dd></div>
                  <div><dt>{hi ? "फॉलो-अप" : "Follow-ups"}</dt><dd>{endDaySummary.followUps}</dd></div>
                </dl>
              )}
              <button className={journeyStyles.primary} disabled={busy} onClick={() => setConfirmEndDay(true)}>
                {hi ? "दिन समाप्त करने के लिए आगे बढ़ें" : "Proceed to end day"}
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  const gps = await withGps();
                  return send("/api/manager/operations", {
                    action: "end-day",
                    payload: {
                      sessionId: activeId,
                      outcome: String(f.get("outcome")),
                      remarks: String(f.get("remarks") ?? ""),
                      latitude: gps.latitude,
                      longitude: gps.longitude,
                      accuracy: gps.accuracy,
                      endExceptionReason: gps.exceptionReason,
                    },
                  });
                }, { en: "Day ended. Summary saved.", hi: "दिन समाप्त हुआ। सारांश सहेजा गया।" });
              }}
            >
              <label>
                {hi ? "परिणाम" : "Outcome"}
                <select name="outcome">
                  <option>COMPLETED</option>
                  <option>PARTIAL</option>
                </select>
              </label>
              <label>
                {hi ? "टिप्पणी" : "Remarks"}
                <input name="remarks" />
              </label>
              <button disabled={busy}>
                {hi ? "पुष्टि करें और दिन समाप्त करें" : "Confirm & end day"}
              </button>
            </form>
          )
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const gps = await withGps();
                return send("/api/manager/operations", {
                  action: "start-day",
                  payload: {
                    workingType: String(f.get("workingType")),
                    remarks: String(f.get("remarks") ?? ""),
                    latitude: gps.latitude,
                    longitude: gps.longitude,
                    accuracy: gps.accuracy,
                    startExceptionReason: gps.exceptionReason,
                  },
                });
              }, { en: "Day started. Ready to work.", hi: "दिन शुरू हुआ। काम के लिए तैयार।" });
            }}
          >
            <label>
              {hi ? "कार्य प्रकार" : "Working type"}
              <select name="workingType">
                {MANAGER_WORK_TYPES.map(([v, en, hiLabel]) => (
                  <option key={v} value={v}>{hi ? hiLabel : en}</option>
                ))}
              </select>
            </label>
            <label>
              {hi ? "दिन की टिप्पणी" : "Day note"}
              <input name="remarks" />
            </label>
            <button disabled={busy}>
              {hi ? "दिन शुरू करें" : "Start day"}
            </button>
          </form>
        )}
        {message && (
          <p role="status" data-ok={message.ok}>
            {message.text}
          </p>
        )}
      </section>
    );
  if (kind === "prospect")
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "वितरक विकास" : "DISTRIBUTOR DEVELOPMENT"}</small>
          <h2>{hi ? "नई संभावना दर्ज करें" : "Add a prospect"}</h2>
        </div>
        {prospectDuplicate && (
          <div className={styles.notice} data-ok="false">
            <p>
              <strong>{hi ? "एक समान संभावना पहले से मौजूद है" : "A similar prospect already exists"}</strong>
            </p>
            <ul className={styles.list}>
              {prospectDuplicate.map((s) => (
                <li key={s.id} id={`prospect-${s.id}`}>
                  {s.businessName} · {s.normalizedMobile} · <span className={styles.badge}>{s.stage}</span>
                </li>
              ))}
            </ul>
            <div className={styles.inlineActions}>
              <a href={`#prospect-${prospectDuplicate[0]!.id}`}>{hi ? "मौजूदा खोलें" : "Open existing"}</a>
              <button type="button" disabled={prospectBusy} onClick={() => void updateExistingProspect(prospectDuplicate[0]!.id, prospectDuplicate[0]!.stage)}>
                {hi ? "मौजूदा अपडेट करें" : "Update existing"}
              </button>
              <button type="button" onClick={() => setProspectDuplicate(null)}>
                {hi ? "रद्द करें" : "Cancel"}
              </button>
            </div>
          </div>
        )}
        {prospectCreated && (
          <div className={styles.notice} data-ok="true">
            <p role="status">
              {hi ? "संभावना सहेजी गई: " : "Prospect saved: "}
              <strong>{prospectCreated.businessName}</strong>
            </p>
            <div className={styles.inlineActions}>
              <a href={`#prospect-${prospectCreated.id}`}>{hi ? "संभावना खोलें" : "Open prospect"}</a>
              <button type="button" onClick={() => setProspectCreated(null)}>
                {hi ? "एक और संभावना जोड़ें" : "Add another prospect"}
              </button>
              <button
                type="button"
                disabled={prospectBusy}
                onClick={() => {
                  const d = window.prompt(hi ? "फॉलो-अप तारीख (YYYY-MM-DD)" : "Follow-up date (YYYY-MM-DD)");
                  if (d) void scheduleProspectFollowUp(prospectCreated.id, prospectCreated.stage, d);
                }}
              >
                {hi ? "फॉलो-अप निर्धारित करें" : "Schedule follow-up"}
              </button>
            </div>
          </div>
        )}
        {!prospectCreated && (
          <form
            ref={prospectFormRef}
            onSubmit={(e) => {
              e.preventDefault();
              void submitProspect(e.currentTarget, false);
            }}
          >
          <label>
            {hi ? "व्यवसाय का नाम" : "Business name"}
            <input name="businessName" required />
          </label>
          <label>
            {hi ? "मोबाइल" : "Mobile"}
            <input name="mobile" inputMode="tel" required />
          </label>
          <label>
            {hi ? "वैकल्पिक मोबाइल" : "Alternate mobile"}
            <input name="alternateMobile" inputMode="tel" />
          </label>
          <label>
            {hi ? "क्षेत्र" : "Area"}
            <input name="areaId" />
          </label>
          <label>
            {hi ? "भौगोलिक प्रकार" : "Geography type"}
            <select name="geographyType" defaultValue="">
              <option value="">—</option>
              <option value="VILLAGE">{hi ? "गाँव" : "Village"}</option>
              <option value="TOWN">{hi ? "कस्बा" : "Town"}</option>
              <option value="CITY">{hi ? "शहर" : "City"}</option>
              <option value="AREA_LOCALITY">{hi ? "क्षेत्र / इलाका" : "Area / Locality"}</option>
              <option value="DISTRICT">{hi ? "जिला" : "District"}</option>
              <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
            </select>
          </label>
          <label>
            {hi ? "मौजूदा ब्रांड" : "Existing brands"}
            <input name="existingBrands" />
          </label>
          <label>
            {hi ? "अपेक्षित मात्रा" : "Expected volume"}
            <input name="expectedVolume" />
          </label>
          <label>
            {hi ? "नमूना दिया गया?" : "Sample given?"}
            <select name="sampleGiven" defaultValue="no">
              <option value="no">{hi ? "नहीं" : "No"}</option>
              <option value="yes">{hi ? "हाँ" : "Yes"}</option>
            </select>
          </label>
          <label>
            {hi ? "नमूना विवरण" : "Sample details"}
            <input name="sampleDetails" />
          </label>
          <label>
            {hi ? "अगला फॉलो-अप" : "Follow-up date"}
            <input type="date" name="followUpAt" />
          </label>
          <label>
            {hi ? "टिप्पणी / चर्चा नोट्स" : "Notes / discussion notes"}
            <textarea name="notes" rows={3} />
          </label>
          <button disabled={prospectBusy}>
            {hi ? "संभावना सहेजें" : "Save prospect"}
          </button>
          </form>
        )}
        {prospectMessage && (
          <p role="status" data-ok={prospectMessage.ok}>
            {prospectMessage.text}
          </p>
        )}
      </section>
    );
  if (kind === "finance-payment")
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "निर्माता-जाँचकर्ता" : "MAKER-CHECKER"}</small>
          <h2>
            {hi
              ? "भुगतान सत्यापन / मिलान"
              : "Payment verification / reconciliation"}
          </h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              action = String(f.get("action")),
              paymentId = String(f.get("paymentId"));
            void run(() =>
              send(
                "/api/finance/operations",
                action === "verify"
                  ? {
                      action: "verify-payment",
                      payload: {
                        paymentId,
                        matchedAmount: Number(f.get("amount")),
                        reason: String(f.get("reason")),
                      },
                    }
                  : {
                      action: "reconcile-payment",
                      payload: { paymentId, idempotencyKey: key() },
                    },
              ),
              action === "verify"
                ? { en: "Payment verified.", hi: "भुगतान सत्यापित किया गया।" }
                : { en: "Payment reconciled.", hi: "भुगतान का मिलान किया गया।" },
            );
          }}
        >
          <label>
            {hi ? "भुगतान चुनें" : "Select payment"}
            <select name="paymentId" required>
              <option value="">
                {hi ? "व्यावसायिक नंबर से चुनें" : "Choose by business number"}
              </option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {o.meta ? ` · ${o.meta}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "कार्रवाई" : "Action"}
            <select name="action">
              <option value="verify">
                {hi ? "धन सत्यापित करें" : "Verify funds"}
              </option>
              <option value="reconcile">
                {hi ? "मिलान करें" : "Reconcile"}
              </option>
            </select>
          </label>
          <label>
            {hi ? "मिलान राशि" : "Matched amount"}
            <input
              type="number"
              min="0"
              step="0.01"
              name="amount"
              defaultValue="0"
            />
          </label>
          <label>
            {hi ? "कारण" : "Reason"}
            <input name="reason" defaultValue="Portal review" required />
          </label>
          <button disabled={busy || !options.length}>
            {hi ? "नियंत्रित कार्रवाई करें" : "Run governed action"}
          </button>
        </form>
        {message && (
          <p role="status" data-ok={message.ok}>
            {message.text}
          </p>
        )}
      </section>
    );
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "यात्रा दावा" : "TA CLAIM"}</small>
        <h2>{hi ? "दावे का सत्यापन" : "Verify claim"}</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(() =>
            send("/api/travel/operations", {
              action: "verify",
              payload: {
                claimId: String(f.get("claimId")),
                approvedDistanceKm: Number(f.get("distance")),
                reason: String(f.get("reason")),
              },
            }),
          );
        }}
      >
        <label>
          {hi ? "दावा चुनें" : "Select claim"}
          <select name="claimId" required>
            <option value="">
              {hi ? "दावा नंबर चुनें" : "Choose claim number"}
            </option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
                {o.meta ? ` · ${o.meta}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "स्वीकृत दूरी (किमी)" : "Approved distance (km)"}
          <input type="number" min="0" step="0.1" name="distance" required />
        </label>
        <label>
          {hi ? "सत्यापन कारण" : "Verification reason"}
          <input name="reason" required />
        </label>
        <button disabled={busy || !options.length}>
          {hi ? "सत्यापित करें" : "Verify claim"}
        </button>
      </form>
      {message && (
        <p role="status" data-ok={message.ok}>
          {message.text}
        </p>
      )}
    </section>
  );
}

export function PartnerLifecycleActions({
  partnerId,
  lifecycle,
  language,
  approvers,
  obligations,
}: {
  partnerId: string;
  lifecycle: string;
  language: "EN" | "HI";
  approvers: Option[];
  // Founder/Admin UAT correction (P0, section 14): "Before deactivation: show meaningful warnings
  // if active: orders, stock, outstanding, claims... Do not silently abandon live commercial
  // obligations." transitionPartnerLifecycle already computes and permanently records an
  // obligationsSnapshot server-side — this surfaces the same figures to the actor BEFORE they
  // submit, not just after the fact in the audit trail. STAGE 14: added `stock` (physical on-hand
  // units) — previously always 0/never computed server-side, so a Distributor with real remaining
  // stock could be closed with no warning at all; see distributor-closure stock-settlement panel
  // (rendered separately, only when stock > 0) for the governed way to resolve it before CLOSE.
  obligations?: { openOrders: number; outstanding: number; openClaims: number; stock: number };
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const actions =
    lifecycle === "ACTIVE"
      ? ["SUSPEND", "DEACTIVATE", "CLOSE"]
      : ["SUSPENDED", "DEACTIVATED"].includes(lifecycle)
        ? ["REACTIVATE"]
        : [];
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "भागीदार जीवनचक्र" : "PARTNER LIFECYCLE"}</small>
        <h2>
          {hi ? "नियंत्रित स्थिति परिवर्तन" : "Governed status transition"}
        </h2>
      </div>
      {lifecycle === "ACTIVE" && obligations && (obligations.openOrders > 0 || obligations.outstanding > 0 || obligations.openClaims > 0 || obligations.stock > 0) && (
        <p role="alert" className={styles.cardError} style={{ gridColumn: "1 / -1" }}>
          {hi ? "चेतावनी: सक्रिय दायित्व मौजूद हैं — " : "Warning — active obligations exist: "}
          {obligations.openOrders > 0 && `${obligations.openOrders} ${hi ? "खुले ऑर्डर" : "open orders"}`}
          {obligations.openOrders > 0 && (obligations.outstanding > 0 || obligations.openClaims > 0 || obligations.stock > 0) && ", "}
          {obligations.outstanding > 0 && `₹${obligations.outstanding.toLocaleString("en-IN")} ${hi ? "बकाया" : "outstanding"}`}
          {obligations.outstanding > 0 && (obligations.openClaims > 0 || obligations.stock > 0) && ", "}
          {obligations.openClaims > 0 && `${obligations.openClaims} ${hi ? "खुले दावे" : "open claims"}`}
          {obligations.openClaims > 0 && obligations.stock > 0 && ", "}
          {obligations.stock > 0 && `${obligations.stock} ${hi ? "भौतिक स्टॉक इकाइयाँ" : "physical stock units on hand"}`}
          {hi ? " — सस्पेंड/डीएक्टिवेट/क्लोज करने से पहले इन्हें हल करें।" : " — resolve these before suspending, deactivating, or closing this partner."}
        </p>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const form = new FormData(event.currentTarget);
            await send(`/api/partners/${partnerId}/lifecycle`, {
              action: String(form.get("action")),
              reason: String(form.get("reason")),
              approverId: String(form.get("approverId")),
              idempotencyKey: key(),
            });
            setMessage(hi ? "जीवनचक्र अपडेट हुआ।" : "Lifecycle updated.");
            router.refresh();
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Action failed",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {hi ? "वर्तमान स्थिति" : "Current status"}
          <input value={lifecycle} readOnly />
        </label>
        <label>
          {hi ? "अगली कार्रवाई" : "Next action"}
          <select name="action" required>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "अनुमोदक" : "Approver"}
          <select name="approverId" required>
            <option value="">{hi ? "नाम से चुनें" : "Choose by name"}</option>
            {approvers.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "कारण" : "Reason"}
          <input name="reason" minLength={3} required />
        </label>
        <button disabled={busy || !actions.length || !approvers.length}>
          {hi ? "स्थिति अपडेट करें" : "Update lifecycle"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
