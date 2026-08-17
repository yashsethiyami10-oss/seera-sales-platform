"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./FieldJourney.module.css";
import { queueOfflineOperation, syncClientQueue, listClientQueue } from "@/lib/phase-11/offline-client";
import { captureGps, GpsBadge, type GpsStatus, type GpsPoint } from "./gps";
import { ActionMessageBanner, type ActionMessage } from "./ErrorBanner";

type BeatRetailer = {
  id: string;
  businessName: string;
  ownerName: string | null;
  mobile: string | null;
  distributorId: string | null;
  followUpAt: Date | null;
  visitStatus: string | null;
};
type Sku = { id: string; brand: string; productName: string; packLabel: string; price: string; rate: number };
type Photo = { id: string; photoType: string; capturedAt: string };
type Visit = {
  id: string;
  retailerId: string;
  retailerName: string;
  retailerMobile: string | null;
  retailerArea: string | null;
  distributorId: string | null;
  checkedInAt: string;
  photos: Photo[];
};
type Dashboard = {
  employeeName: string;
  employeeCode: string;
  manager: string | null;
  territory: string | null;
  workingDistributorLabel: string | null;
  dayStatus: "NOT_STARTED" | "ACTIVE" | "ENDED";
  target: {
    value: number;
    achieved: number;
    remaining: number;
    achievementPct: number;
    daysRemaining: number;
    requiredDailyRunRate: number;
  } | null;
  today: {
    planned: number;
    visited: number;
    productive: number;
    skipped: number;
    orders: number;
    bookedValue: number;
    followUpsDue: number;
    newRetailers: number;
    distributorProspects: number;
    photos: number;
  };
};
type OrderLine = { key: string; skuId: string; quantity: number; rate: number; brandFilter: string; search: string };
type WorkingType = "RETAILING" | "DISTRIBUTOR_SEARCH" | "DISTRIBUTOR_VISIT" | "WHOLESALE_MARKET" | "OTHER";

// Normalized action outcome — business/validation failures (photo required, duplicate customer,
// permission denied, network failure) are DATA, never a thrown exception. An uncaught throw from a
// fetch callback that nobody awaits/`.catch()`s becomes an unhandled promise rejection, which
// Next.js's dev-mode overlay surfaces as a scary runtime-error screen for what is really just a
// normal "please add a photo" validation message — that was the actual cause of the runtime
// overlay reported from this file's old send().
type ActionOutcome =
  | { success: true; data: any }
  | {
      success: false;
      code: string;
      message: string;
      details?: Record<string, unknown>;
      userMessage?: string;
      nextAction?: string;
      retryable?: boolean;
      supportRequired?: boolean;
      requestId?: string;
    };

async function send(action: string, payload: Record<string, unknown>): Promise<ActionOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/field/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
  } catch {
    // fetch() itself failed to complete — a real network-layer problem (offline/DNS/CORS), not a
    // business rejection from the server.
    return { success: false, code: "NETWORK_ERROR", message: "Could not save. Please retry.", nextAction: "Check your connection and try again.", retryable: true };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    return {
      success: false,
      code: data?.error?.code ?? "ACTION_FAILED",
      message: data?.error?.message ?? data?.error?.code ?? "Action failed",
      details: data?.error?.details,
      userMessage: data?.error?.userMessage,
      nextAction: data?.error?.nextAction,
      retryable: data?.error?.retryable,
      supportRequired: data?.error?.supportRequired,
      requestId: data?.error?.requestId,
    };
  return { success: true, data };
}
// After checkout (or starting the day, or opening Add Customer), the screen content underneath
// the user's finger swaps to a fresh state, but the browser keeps whatever scroll position it had
// on the previous (often long) form — so the new "Next customer" section renders correctly but is
// invisible below the fold, reading as if nothing happened / as if it's buried further down the
// page. Force the viewport back to the top of the journey card at every such transition.
function scrollToJourneyTop() {
  if (typeof document === "undefined") return;
  document.getElementById("field-journey-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
// PERFORMANCE PHASE 3: every GPS-gated action sets `busy`/`busyLabel` synchronously as the very
// first line, before `captureGps()` — but `captureGps()`'s underlying `getCurrentPosition()` can
// resolve near-instantly (a cached position, or this codebase's own test/emulated geolocation),
// racing the pending-feedback paint against GPS resolution instead of guaranteeing it lands first.
// One `requestAnimationFrame` round trip is the standard way to force the browser to actually
// paint the just-scheduled state update before the next expensive synchronous/async step starts —
// not an artificial delay, just ceding the frame React already asked for instead of letting the
// GPS call's own scheduling race ahead of it.
function yieldToPaint(): Promise<void> {
  if (typeof requestAnimationFrame === "undefined") return Promise.resolve();
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}
// FINAL PERFORMANCE PASS — photo pipeline root cause: unresized camera photos (routinely 3-8MB)
// were base64-encoded whole (~33% larger again) and written directly into a Postgres `bytea`
// column in one request — this, not any client-side wait-on-refresh pattern, was the real source
// of "adding a photo takes too long". Field evidence photos don't need full camera resolution to
// stay legible, so this resizes to a reasonable long edge and re-encodes as JPEG before upload —
// the ORIGINAL file is still what's shown in the instant local preview (unchanged, still instant),
// this only changes what actually gets uploaded. `imageOrientation: "from-image"` makes
// createImageBitmap apply the source's EXIF rotation itself, since re-encoding through a canvas
// otherwise silently drops EXIF (a classic "photo comes out sideways" bug this avoids introducing).
// HEIC/HEIF (common on iPhones) can't be decoded by canvas in most browsers, so those upload
// as-is, same as before — no regression for that case, just no size reduction. Any resize failure
// falls back to the original file rather than ever blocking a photo submission on this being
// safe/available; a photo that fails to upload is worse than one that uploads a bit larger than ideal.
async function prepareImageForUpload(
  file: File,
  maxDimension = 1920,
  quality = 0.82,
): Promise<{ base64: string; mimeType: string; originalName: string }> {
  const original = { base64: await blobToBase64(file), mimeType: file.type, originalName: file.name };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap === "undefined") return original;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (scale >= 1) return original; // already within target size — don't reprocess an optimal image
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const resizedBlob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
    if (!resizedBlob || resizedBlob.size >= file.size) return original;
    return { base64: await blobToBase64(resizedBlob), mimeType: "image/jpeg", originalName: file.name.replace(/\.\w+$/, ".jpg") };
  } catch {
    return original; // resize is a pure optimization — never block the actual upload on it
  }
}
const key = () => crypto.randomUUID();
// PERFORMANCE PHASE 3 (hydration mismatch fix): `key()` is genuinely random, so calling it as the
// default `useState` initializer ran once during SSR (baking one random value into the
// server-rendered HTML's `name="brand-{key}"` radio attribute) and once again during the client's
// first render before hydration reconciles — two different random values, a guaranteed mismatch.
// An optional deterministic key lets the one SSR-visible call site (the initial `useState` below)
// pass a fixed value instead, while every other call site (adding a line, resetting on visit
// change) still gets a real random key — those only ever run client-side, post-mount, in a
// useEffect/event handler, never during SSR, so they carry no hydration risk and keeping them
// random preserves correct React list-reconciliation identity across visits.
const blankOrderLine = (fixedKey?: string): OrderLine => ({ key: fixedKey ?? key(), skuId: "", quantity: 1, rate: 0, brandFilter: "ALL", search: "" });
// The offline sync API rejects any queued operation whose sessionContext.sessionId doesn't match
// the server-side Session row that's live at sync time (a deliberate staleness/identity check —
// see app/api/offline/sync/route.ts's STALE_DEVICE_SESSION check) — this used to be hardcoded to
// the literal string "field-session", which could never match a real session id, so every synced
// operation was unconditionally rejected and "Sync now" could never actually drain the queue.
// Fetched once per page load and cached; a stale cached id from a since-ended session correctly
// still gets rejected server-side (that's the check doing its job), it just won't be masked by a
// placeholder that was *always* wrong.
let cachedSessionId: string | null = null;
async function currentSessionId(): Promise<string> {
  if (cachedSessionId) return cachedSessionId;
  try {
    const response = await fetch("/api/auth/session");
    const data = await response.json();
    cachedSessionId = typeof data?.sessionId === "string" && data.sessionId ? data.sessionId : "unknown-session";
  } catch {
    cachedSessionId = "unknown-session";
  }
  return cachedSessionId ?? "unknown-session";
}
const deviceId = () => {
  if (typeof window === "undefined") return "server";
  const stored = window.localStorage.getItem("seera-device-id");
  if (stored) return stored;
  const created = `device-${crypto.randomUUID()}`;
  window.localStorage.setItem("seera-device-id", created);
  return created;
};

// Tries the live API first; if the browser genuinely has no network (or the fetch itself fails at
// the network layer, not a business-rule rejection), the same action is queued idempotently through
// the existing offline engine instead of being lost. A conflict (e.g. Distributor mapping changed)
// surfaces later, at sync time, through the shared offline queue/status UI.
async function runOrQueue(
  action: string,
  payload: Record<string, unknown>,
  offline: { entityType: string; actionType: string } | null,
): Promise<ActionOutcome | { queued: true }> {
  const offlineCapable = Boolean(offline);
  if (offlineCapable && typeof navigator !== "undefined" && !navigator.onLine) {
    await queueOfflineOperation({
      clientOperationId: String(payload.idempotencyKey ?? key()),
      deviceId: deviceId(),
      sessionContext: { sessionId: await currentSessionId(), appVersion: "1", platform: "web" },
      entityType: offline!.entityType,
      actionType: offline!.actionType,
      localCreatedAt: new Date().toISOString(),
      payloadVersion: 1,
      payload,
    });
    return { queued: true as const };
  }
  const result = await send(action, payload);
  if (!result.success && result.code === "NETWORK_ERROR" && offlineCapable) {
    await queueOfflineOperation({
      clientOperationId: String(payload.idempotencyKey ?? key()),
      deviceId: deviceId(),
      sessionContext: { sessionId: await currentSessionId(), appVersion: "1", platform: "web" },
      entityType: offline!.entityType,
      actionType: offline!.actionType,
      localCreatedAt: new Date().toISOString(),
      payloadVersion: 1,
      payload,
    });
    return { queued: true as const };
  }
  return result;
}

function DashboardHeader({
  language,
  dashboard,
}: {
  language: "EN" | "HI";
  dashboard: Dashboard;
}) {
  const hi = language === "HI";
  return (
    <section id="field-journey-top" className={styles.journey}>
      <div className={styles.dashboard}>
        <div className="idRow">
          <span>
            <strong>{dashboard.employeeName}</strong> · {dashboard.employeeCode}
          </span>
          {dashboard.manager && (
            <span>
              {hi ? "प्रबंधक" : "Manager"}: {dashboard.manager}
            </span>
          )}
          {dashboard.territory && (
            <span>
              {hi ? "क्षेत्र" : "Territory"}: {dashboard.territory}
            </span>
          )}
          {dashboard.workingDistributorLabel && (
            <span>
              {hi ? "आज का कार्यरत वितरक" : "Today's Working Distributor"}: {dashboard.workingDistributorLabel}
            </span>
          )}
          <span className={styles.pill} data-status={dashboard.dayStatus === "ACTIVE" ? "PRODUCTIVE" : undefined}>
            {dashboard.dayStatus === "ACTIVE"
              ? hi
                ? "दिन सक्रिय"
                : "Day active"
              : dashboard.dayStatus === "ENDED"
                ? hi
                  ? "दिन समाप्त"
                  : "Day ended"
                : hi
                  ? "दिन शुरू नहीं हुआ"
                  : "Day not started"}
          </span>
        </div>
        {dashboard.target && (
          <dl className={styles.statGrid}>
            <div>
              <dt>{hi ? "मासिक लक्ष्य" : "Monthly target"}</dt>
              <dd>₹{dashboard.target.value.toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>{hi ? "योग्य वितरित" : "Eligible delivered"}</dt>
              <dd>₹{dashboard.target.achieved.toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>{hi ? "शेष" : "Remaining"}</dt>
              <dd>₹{dashboard.target.remaining.toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>{hi ? "उपलब्धि %" : "Achievement %"}</dt>
              <dd>{dashboard.target.achievementPct}%</dd>
            </div>
            <div>
              <dt>{hi ? "शेष दिन" : "Days remaining"}</dt>
              <dd>{dashboard.target.daysRemaining}</dd>
            </div>
            <div>
              <dt>{hi ? "आवश्यक दैनिक दर" : "Required daily run rate"}</dt>
              <dd>₹{dashboard.target.requiredDailyRunRate.toLocaleString("en-IN")}</dd>
            </div>
          </dl>
        )}
        <dl className={styles.statGrid}>
          <div>
            <dt>{hi ? "योजनाबद्ध" : "Planned"}</dt>
            <dd>{dashboard.today.planned}</dd>
          </div>
          <div>
            <dt>{hi ? "देखे गए" : "Visited"}</dt>
            <dd>{dashboard.today.visited}</dd>
          </div>
          <div>
            <dt>{hi ? "उत्पादक" : "Productive"}</dt>
            <dd>{dashboard.today.productive}</dd>
          </div>
          <div>
            <dt>{hi ? "छोड़े गए" : "Skipped"}</dt>
            <dd>{dashboard.today.skipped}</dd>
          </div>
          <div>
            <dt>{hi ? "ऑर्डर" : "Orders"}</dt>
            <dd>{dashboard.today.orders}</dd>
          </div>
          <div>
            <dt>{hi ? "बुक मूल्य" : "Booked value"}</dt>
            <dd>₹{dashboard.today.bookedValue.toLocaleString("en-IN")}</dd>
          </div>
          <div>
            <dt>{hi ? "फॉलो-अप देय" : "Follow-ups due"}</dt>
            <dd>{dashboard.today.followUpsDue}</dd>
          </div>
          <div>
            <dt>{hi ? "फ़ोटो" : "Photos"}</dt>
            <dd>{dashboard.today.photos}</dd>
          </div>
          <div>
            <dt>{hi ? "वितरक संभावना" : "Distributor prospects"}</dt>
            <dd>{dashboard.today.distributorProspects}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

const CUSTOMER_TYPES = [
  ["RETAILER", "Retailer", "खुदरा विक्रेता"],
  ["WHOLESALER", "Wholesaler", "थोक विक्रेता"],
  ["DISTRIBUTOR_PROSPECT", "Distributor prospect", "वितरक संभावना"],
  ["INSTITUTIONAL_OTHER", "Institutional / other business", "संस्थागत / अन्य व्यवसाय"],
] as const;

const WORK_TYPES = [
  ["RETAILING", "Retail Market / Beat Work", "खुदरा बाज़ार / बीट कार्य"],
  ["DISTRIBUTOR_SEARCH", "Distributor Search / Appointment", "वितरक खोज / नियुक्ति"],
  ["DISTRIBUTOR_VISIT", "Distributor Visit", "वितरक विज़िट"],
  ["WHOLESALE_MARKET", "Wholesale Market Work", "थोक बाज़ार कार्य"],
  ["OTHER", "Other Authorized Field Work", "अन्य अधिकृत फील्ड कार्य"],
] as const;

// Mirrors workflow-service.ts's WORKING_TYPES_REQUIRING_DISTRIBUTOR exactly — this is UI-side
// UX gating only (disable Start Day, show the required marker); the server independently
// re-validates the same requirement, so this list drifting would only ever produce an extra
// server-side rejection, never a security gap.
const DISTRIBUTOR_REQUIRED_WORK_TYPES: readonly WorkingType[] = ["RETAILING", "DISTRIBUTOR_VISIT"];

export function FieldJourney({
  language,
  dashboard,
  session,
  visit: rawVisit,
  beatRetailers,
  hasPublishedPlan,
  skus,
  distributorOptions,
}: {
  language: "EN" | "HI";
  dashboard: Dashboard;
  session?: { id: string; startedAt: string; workingType: string; workingDistributorId: string | null };
  visit?: Visit;
  beatRetailers: BeatRetailer[];
  hasPublishedPlan: boolean;
  skus: Sku[];
  distributorOptions: { value: string; label: string }[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    fileRef = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false),
    [busyLabel, setBusyLabel] = useState<string | null>(null),
    [message, setMessage] = useState<ActionMessage | null>(null),
    [mode, setMode] = useState<"ORDER" | "PHOTO" | "FOLLOW_UP">("ORDER"),
    [orderLines, setOrderLines] = useState<OrderLine[]>([blankOrderLine("initial")]),
    [paymentType, setPaymentType] = useState<"CASH" | "CREDIT">("CREDIT"),
    [photoPreview, setPhotoPreview] = useState<string | null>(null),
    [showEndDayPreview, setShowEndDayPreview] = useState(false),
    [showAddCustomer, setShowAddCustomer] = useState(false),
    [duplicateWarning, setDuplicateWarning] = useState<{ similar: { id: string; businessName: string; mobile: string | null }[] } | null>(null),
    [gpsStatus, setGpsStatus] = useState<GpsStatus>("IDLE"),
    [startWorkingType, setStartWorkingType] = useState<WorkingType>("RETAILING"),
    [startWorkingDistributorId, setStartWorkingDistributorId] = useState(""),
    [pendingSyncCount, setPendingSyncCount] = useState(0),
    // Checkout already durably completes server-side before this ever gets set (see the checkout
    // handler below) — this is not an optimistic-before-success write, it's skipping an UNRELATED
    // wait: previously the screen stayed on "Loading next customer…" until the entire portal
    // server-refresh (dashboard+beat+follow-up+catalog) round-tripped, even though the beat list
    // needed to show the next retailer was already sitting in `beatRetailers` props the whole
    // time. Clearing this locally the instant checkout succeeds lets the beat list reappear
    // immediately; router.refresh() (kicked off by run()) still lands moments later in the
    // background to reconcile dashboard/beat counters, and resets this flag once real props arrive.
    [optimisticVisitCleared, setOptimisticVisitCleared] = useState(false),
    // PERFORMANCE PHASE 3: mirrors optimisticVisitCleared's reasoning in the other direction — set
    // ONLY after check-in has already durably succeeded server-side (never on the offline-queued
    // path, since that has no durable confirmation yet), from the server response's own
    // authoritative id/retailerId/checkedInAt plus retailer display fields already sitting in the
    // beatRetailers prop. Lets the active-visit workspace render immediately instead of waiting for
    // the unrelated full-portal router.refresh() to deliver the same visit back through props.
    // rawVisit (the real prop) always wins once it catches up — see the `visit` derivation below.
    [localOptimisticVisit, setLocalOptimisticVisit] = useState<Visit | null>(null),
    // FINAL PERFORMANCE PASS: same reasoning again for photo capture/delete — the durable write
    // already succeeded server-side before either of these gets touched, so this isn't showing a
    // fake result, it's just not waiting for the background router.refresh() to deliver the same
    // photo list back through `visit.photos` before the count/grid/checkout-gate reflect it.
    [localAddedPhotos, setLocalAddedPhotos] = useState<Photo[]>([]),
    [locallyDeletedPhotoIds, setLocallyDeletedPhotoIds] = useState<Set<string>>(new Set());

  const visit = optimisticVisitCleared ? undefined : (rawVisit ?? localOptimisticVisit ?? undefined);
  const effectivePhotos = visit ? [...visit.photos, ...localAddedPhotos].filter((p) => !locallyDeletedPhotoIds.has(p.id)) : [];

  // FieldJourney stays mounted as the SAME component instance across the whole day — moving from
  // an active visit to "Next customer", or from one customer's visit to the next, only changes
  // props (visit goes from defined -> undefined -> a new id), it never remounts the component. Without
  // this, local state (photo preview, order lines, payment type, the success/error message, the
  // uncontrolled file input's selected file) silently carries over from the previous customer —
  // showing a stale photo, a stale "saved successfully" message, or stale order data on what looks
  // like a fresh screen. Reset everything visit-scoped whenever the active visit identity changes.
  //
  // Keyed on `visit?.id` (the derived, optimistic-aware value), NOT `rawVisit?.id` directly:
  // after check-in, `localOptimisticVisit` makes `visit` resolve to the just-created visit's real
  // id immediately, while `rawVisit` itself stays undefined until the background router.refresh()
  // lands moments later. `rawVisit?.id` would then jump from undefined -> that same id, re-firing
  // this effect and wiping out any order-line edits the user already made in that window. Since
  // `visit?.id` is the SAME value throughout the optimistic-then-confirmed transition, it only
  // changes when the user genuinely moves to a different visit (or back to none) — exactly the
  // cases this reset is meant to catch.
  useEffect(() => {
    setMessage(null);
    setMode("ORDER");
    setOrderLines([blankOrderLine()]);
    setPaymentType("CREDIT");
    setPhotoPreview(null);
    setDuplicateWarning(null);
    setBusy(false);
    setBusyLabel(null);
    setOptimisticVisitCleared(false);
    setLocalOptimisticVisit(null);
    setLocalAddedPhotos([]);
    setLocallyDeletedPhotoIds(new Set());
    if (fileRef.current) fileRef.current.value = "";
    scrollToJourneyTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit?.id]);

  // Same reasoning as above, for the transition into today's very first screen once Start Day
  // succeeds (session goes from undefined to defined) — the Start Day button can sit low on the
  // page, so the freshly-rendered "Next customer" screen needs the same explicit scroll-up.
  useEffect(() => {
    if (session?.id) scrollToJourneyTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const skuById = new Map(skus.map((s) => [s.id, s]));
  const brands = Array.from(new Set(skus.map((s) => s.brand))).sort();
  // Rate is editable by the Executive (Founder decision — no fixed catalog price is forced on the
  // field-order screen), so the order total is always computed from what's actually typed into
  // each line's Rate field, never silently re-derived from the catalog price behind the scenes.
  const orderTotal = orderLines.reduce((sum, line) => sum + (line.rate || 0) * (line.quantity || 0), 0);

  // Never throws — a business/validation failure is reported through `message` like any other
  // outcome, so `void run(...)` at every call site is safe with no `.catch()` required anywhere,
  // and a failed action can never surface as an unhandled-promise-rejection runtime overlay.
  const run = async (
    action: string,
    payload: Record<string, unknown>,
    offline: { entityType: string; actionType: string } | null = null,
    successText?: string,
    busyText?: string,
  ): Promise<ActionOutcome | { queued: true }> => {
    setBusy(true);
    setBusyLabel(busyText ?? null);
    setMessage(null);
    const result = await runOrQueue(action, payload, offline);
    setBusy(false);
    setBusyLabel(null);
    if ("queued" in result) {
      setMessage({
        ok: true,
        text: hi
          ? "कोई नेटवर्क नहीं — कार्रवाई सुरक्षित रूप से सिंक के लिए कतार में है।"
          : "No network — action is safely queued to sync.",
      });
    } else if (result.success) {
      setMessage({
        ok: true,
        text: successText ?? (hi ? "कार्रवाई सुरक्षित रूप से सहेजी गई।" : "Action saved securely."),
      });
      router.refresh();
    } else {
      setMessage({
        ok: false,
        text: result.userMessage ?? result.message,
        nextAction: result.nextAction,
        requestId: result.requestId,
        retryable: result.retryable,
        supportRequired: result.supportRequired,
      });
    }
    return result;
  };

  const header = <DashboardHeader language={language} dashboard={dashboard} />;

  // ---------------------------------------------------------------- Start Day ----
  if (!session)
    return (
      <>
        {header}
        <section className={styles.journey}>
          <header>
            <span>1</span>
            <div>
              <small>{hi ? "फील्ड दिवस" : "FIELD DAY"}</small>
              <h2>{hi ? "आज का काम शुरू करें" : "Start today’s work"}</h2>
              <p>
                {hasPublishedPlan
                  ? hi
                    ? `आज ${beatRetailers.length} खुदरा विक्रेता योजनाबद्ध हैं।`
                    : `${beatRetailers.length} customers are planned for today.`
                  : hi
                    ? "आज के लिए कोई मार्ग निर्दिष्ट नहीं किया गया है — फिर भी काम शुरू करें और ग्राहक जोड़ें।"
                    : "No route assigned for today — you can still start work and add customers as you go."}
              </p>
            </div>
          </header>
          <div>
            <strong>{hi ? "आज का कार्य प्रकार" : "Today's work type"}</strong>
            <div className={styles.workTypeGrid}>
              {WORK_TYPES.map(([value, en, hiLabel]) => (
                <label key={value} className={styles.workTypeOption} data-active={startWorkingType === value}>
                  <input
                    type="radio"
                    name="workingType"
                    value={value}
                    checked={startWorkingType === value}
                    onChange={() => setStartWorkingType(value as WorkingType)}
                  />
                  {hi ? hiLabel : en}
                </label>
              ))}
            </div>
          </div>
          {(() => {
            const distributorRequired = DISTRIBUTOR_REQUIRED_WORK_TYPES.includes(startWorkingType);
            const distributorBlocked = distributorRequired && distributorOptions.length === 0;
            return (
              <div>
                <strong>
                  {hi ? "आज का कार्यरत वितरक" : "Today's working Distributor"}
                  {distributorRequired ? " *" : hi ? " (वैकल्पिक)" : " (optional)"}
                </strong>
                {distributorOptions.length > 0 ? (
                  <select
                    value={startWorkingDistributorId}
                    onChange={(e) => setStartWorkingDistributorId(e.target.value)}
                    required={distributorRequired}
                  >
                    <option value="">{hi ? "चुनें…" : "Choose…"}</option>
                    {distributorOptions.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className={styles.note}>
                    {distributorRequired
                      ? hi
                        ? "आपके कार्य क्षेत्र में कोई वितरक असाइन नहीं है। कृपया अपने सेल्स मैनेजर/एडमिन से संपर्क करें।"
                        : "No distributor is assigned to your working area. Please contact your Sales Manager/Admin."
                      : hi
                        ? "आपके कार्य क्षेत्र में अभी कोई वितरक असाइन नहीं है — इस कार्य प्रकार के लिए आवश्यक नहीं।"
                        : "No distributor is assigned to your working area yet — not required for this work type."}
                  </p>
                )}
              </div>
            );
          })()}
          <div className={styles.gpsRow}>
            <GpsBadge language={language} status={gpsStatus} />
          </div>
          <button
            className={styles.primary}
            disabled={
              busy ||
              (DISTRIBUTOR_REQUIRED_WORK_TYPES.includes(startWorkingType) &&
                (distributorOptions.length === 0 || !startWorkingDistributorId))
            }
            onClick={async () => {
              // Set busy synchronously, before the GPS await, so a second tap while the (often
              // slow, permission-prompting) location lookup is in flight can't fire a second,
              // concurrent submission — that race was the actual cause of "Active workday not
              // found" / duplicate-start reports: the button only looked disabled once run()
              // itself set busy, well after captureGps() had already started.
              setBusy(true);
              setGpsStatus("LOCATING");
              await yieldToPaint();
              const { status, point } = await captureGps();
              setGpsStatus(status);
              let startExceptionReason: string | undefined;
              if (status === "PERMISSION_DENIED" || status === "UNAVAILABLE") {
                startExceptionReason =
                  window.prompt(
                    hi
                      ? "GPS उपलब्ध नहीं है। दिन शुरू करने का कारण दर्ज करें।"
                      : "GPS is not available. Enter a reason to start the day anyway.",
                  ) ?? undefined;
                if (!startExceptionReason) {
                  setBusy(false);
                  return;
                }
              }
              void run(
                "start-day",
                {
                  workingType: startWorkingType,
                  latitude: point.latitude,
                  longitude: point.longitude,
                  accuracy: point.accuracy,
                  startExceptionReason,
                  remarks: "Started from field portal",
                  workingDistributorId: startWorkingDistributorId || undefined,
                },
                null,
                hi ? "दिन शुरू हुआ।" : "Day started.",
                hi ? "दिन शुरू हो रहा है…" : "Starting day…",
              );
            }}
          >
            {busy ? (busyLabel ?? (hi ? "दिन शुरू हो रहा है…" : "Starting day…")) : hi ? "दिन शुरू करें" : "Start day"}
          </button>
          <ActionMessageBanner message={message} language={language} />
        </section>
      </>
    );

  const isProspectMode = session.workingType === "DISTRIBUTOR_SEARCH" || session.workingType === "DISTRIBUTOR_VISIT";

  const addCustomerForm = (
    <section className={styles.journey}>
      <header>
        <span>+</span>
        <div>
          <small>{hi ? "नया ग्राहक" : "NEW CUSTOMER"}</small>
          <h2>{hi ? "ग्राहक जोड़ें" : "Add customer"}</h2>
          <p>
            {hi
              ? "केवल दुकान का नाम और क्षेत्र आवश्यक है। बाकी सब वैकल्पिक है।"
              : "Only the shop name and area are required. Everything else is optional."}
          </p>
        </div>
      </header>
      {duplicateWarning ? (
        <div className={styles.note}>
          <strong>{hi ? "मिलती-जुलती दुकान पहले से मौजूद है" : "A similar customer may already exist"}</strong>
          <ul>
            {duplicateWarning.similar.map((s) => (
              <li key={s.id}>
                {s.businessName} {s.mobile ? `· ${s.mobile}` : ""}
              </li>
            ))}
          </ul>
          <div className={styles.quickActions}>
            <button
              className={styles.primary}
              disabled={busy}
              onClick={async () => {
                const form = document.getElementById("add-customer-form") as HTMLFormElement | null;
                if (!form) return;
                await submitAddCustomer(new FormData(form), true);
              }}
            >
              {hi ? "फिर भी सहेजें" : "Save anyway"}
            </button>
            <button onClick={() => setDuplicateWarning(null)}>{hi ? "वापस" : "Back"}</button>
          </div>
        </div>
      ) : (
        <form
          id="add-customer-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await submitAddCustomer(new FormData(e.currentTarget), false);
          }}
        >
          <label>
            {hi ? "दुकान / फर्म का नाम *" : "Firm / Shop / Customer name *"}
            <input name="businessName" required />
          </label>
          <label>
            {hi ? "क्षेत्र / पता *" : "Area / Address *"}
            <input name="area" required />
          </label>
          <label>
            {hi ? "मालिक / संपर्क व्यक्ति" : "Owner / Contact person"}
            <input name="ownerName" />
          </label>
          <label>
            {hi ? "मोबाइल" : "Mobile"}
            <input name="mobile" inputMode="tel" />
          </label>
          <label>
            {hi ? "वैकल्पिक मोबाइल" : "Alternate mobile"}
            <input name="alternateMobile" inputMode="tel" />
          </label>
          <label>
            {hi ? "ग्राहक प्रकार" : "Customer type"}
            <select name="customerType" defaultValue="RETAILER">
              {CUSTOMER_TYPES.map(([value, en, hiLabel]) => (
                <option key={value} value={value}>
                  {hi ? hiLabel : en}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "पिनकोड" : "Pincode"}
            <input name="pincode" inputMode="numeric" />
          </label>
          <label>
            {hi ? "GSTIN" : "GSTIN"}
            <input name="gstin" />
          </label>
          <label>
            {hi ? "टिप्पणी" : "Notes"}
            <input name="notes" />
          </label>
          <button className={styles.primary} disabled={busy}>
            {busy ? (busyLabel ?? (hi ? "सहेज रहे हैं…" : "Saving…")) : hi ? "सहेजें और चेक-इन करें" : "Save & check in"}
          </button>
          <button type="button" disabled={busy} onClick={() => setShowAddCustomer(false)}>
            {hi ? "रद्द करें" : "Cancel"}
          </button>
        </form>
      )}
      <ActionMessageBanner message={message} language={language} />
    </section>
  );

  async function submitAddCustomer(f: FormData, confirmDuplicate: boolean) {
    setBusy(true);
    setBusyLabel(hi ? "ग्राहक जोड़ा जा रहा है…" : "Adding customer…");
    setMessage(null);
    setGpsStatus("LOCATING");
    await yieldToPaint();
    const { status, point } = await captureGps();
    setGpsStatus(status);
    const idempotencyKey = key();
    const createResult = await send("create-retailer", {
      businessName: String(f.get("businessName")),
      address: { area: String(f.get("area")) },
      ownerName: String(f.get("ownerName") ?? "") || undefined,
      mobile: String(f.get("mobile") ?? "") || undefined,
      alternateMobile: String(f.get("alternateMobile") ?? "") || undefined,
      customerType: String(f.get("customerType") ?? "") || undefined,
      pincode: String(f.get("pincode") ?? "") || undefined,
      gstin: String(f.get("gstin") ?? "") || undefined,
      notes: String(f.get("notes") ?? "") || undefined,
      latitude: point.latitude,
      longitude: point.longitude,
      confirmDuplicate,
      idempotencyKey,
    });
    if (!createResult.success) {
      setBusy(false);
      setBusyLabel(null);
      const similar = createResult.details?.similar as { id: string; businessName: string; mobile: string | null }[] | undefined;
      if (similar?.length) setDuplicateWarning({ similar });
      else
        setMessage({
          ok: false,
          text:
            createResult.code === "SIMILAR_RETAILER_EXISTS"
              ? hi
                ? "मिलती-जुलती दुकान पहले से मौजूद है। उसे खोलें या फिर भी सहेजें।"
                : "A similar customer already exists. Open it or save anyway."
              : createResult.message,
        });
      return;
    }
    setDuplicateWarning(null);
    setShowAddCustomer(false);
    setBusyLabel(hi ? "चेक-इन हो रहा है…" : "Checking in…");
    const checkinResult = await send("check-in", {
      workSessionId: session!.id,
      retailerId: createResult.data.id,
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: point.accuracy,
      idempotencyKey: key(),
    });
    setBusy(false);
    setBusyLabel(null);
    if (!checkinResult.success) {
      setMessage({ ok: false, text: checkinResult.message });
      return;
    }
    setMessage({ ok: true, text: hi ? "ग्राहक जोड़ा गया — विज़िट शुरू।" : "Customer added successfully — visit started." });
    // Same durable-success-gated optimistic transition as the main check-in flow — both writes
    // above already completed successfully server-side before this runs.
    const newRetailer = createResult.data as { id: string; businessName: string; mobile: string | null; distributorId: string | null };
    const newVisit = checkinResult.data as { id: string; checkedInAt: string };
    setLocalOptimisticVisit({
      id: newVisit.id,
      retailerId: newRetailer.id,
      retailerName: newRetailer.businessName,
      retailerMobile: newRetailer.mobile,
      retailerArea: null,
      distributorId: newRetailer.distributorId,
      checkedInAt: newVisit.checkedInAt,
      photos: [],
    });
    router.refresh();
  }

  // ---------------------------------------------------------------- Next customer ----
  if (!visit)
    return (
      <>
        {header}
        {showAddCustomer ? (
          addCustomerForm
        ) : (
          <section className={styles.journey}>
            <header>
              <span>2</span>
              <div>
                <small>{hi ? "आज की बीट" : "TODAY'S WORK"}</small>
                <h2>{hi ? "अगला ग्राहक / विज़िट" : "Next customer / visit"}</h2>
                <p>
                  {hi
                    ? `दिन ${new Date(session.startedAt).toLocaleTimeString("hi-IN", { hour: "2-digit", minute: "2-digit" })} पर शुरू हुआ।`
                    : `Day started at ${new Date(session.startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`}
                </p>
              </div>
            </header>
            {gpsStatus !== "IDLE" && (
              <div className={styles.gpsRow}>
                <GpsBadge language={language} status={gpsStatus} />
              </div>
            )}
            <div className={styles.quickActions}>
              <button
                className={styles.addCustomerCta}
                onClick={() => {
                  setMessage(null);
                  setShowAddCustomer(true);
                  scrollToJourneyTop();
                }}
              >
                {hi ? "+ ग्राहक जोड़ें" : "+ Add customer"}
              </button>
              {/* P0 fix (Founder UAT): a relative "../prospects" href resolves to /portal/prospects
                  (one directory too high from /portal/sales-executive/today), which 404s and
                  bounces back to the dashboard — every sibling component in this codebase uses an
                  absolute path instead; FieldJourney only ever renders for sales-executive. */}
              <Link href="/portal/sales-executive/prospects">
                {hi ? "+ वितरक / संभावना विज़िट" : "+ Distributor / prospect visit"}
              </Link>
            </div>
            {isProspectMode && (
              <p className={styles.note}>
                {hi
                  ? "आज का कार्य प्रकार वितरक खोज/विज़िट है। ऊपर 'वितरक / संभावना विज़िट' खोलें, या किसी वास्तविक दुकान पर रुकने के लिए ग्राहक जोड़ें।"
                  : "Today's work type is Distributor Search/Visit. Open “Distributor / prospect visit” above, or Add customer if you stop at an actual shop."}
              </p>
            )}
            {beatRetailers.length > 0 && (
              <>
                <strong>{hi ? "योजनाबद्ध ग्राहक" : "PLANNED CUSTOMERS"}</strong>
                <div className={styles.beatList}>
                  {beatRetailers.map((retailer) => (
                    <div className={styles.beatCard} key={retailer.id}>
                      <header>
                        <div>
                          <h3>{retailer.businessName}</h3>
                          <p className="meta">
                            {retailer.ownerName ?? "—"} · {retailer.mobile ?? (hi ? "मोबाइल नहीं" : "No mobile")}
                          </p>
                        </div>
                        {retailer.visitStatus && retailer.visitStatus !== "PENDING" && (
                          <span className={styles.pill} data-status={retailer.visitStatus}>
                            {retailer.visitStatus}
                          </span>
                        )}
                        {retailer.followUpAt && new Date(retailer.followUpAt) <= new Date() && (
                          <span className={styles.pill} data-status="FOLLOW_UP">
                            {hi ? "फॉलो-अप देय" : "Follow-up due"}
                          </span>
                        )}
                      </header>
                      {(!retailer.visitStatus || retailer.visitStatus === "PENDING") && (
                        <div className="rowActions">
                          <button
                            data-primary="true"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              setGpsStatus("LOCATING");
                              await yieldToPaint();
                              const { status, point } = await captureGps();
                              setGpsStatus(status);
                              let gpsExceptionReason: string | undefined;
                              if (status === "PERMISSION_DENIED" || status === "UNAVAILABLE") {
                                gpsExceptionReason =
                                  window.prompt(
                                    hi ? "GPS उपलब्ध नहीं — कारण दर्ज करें" : "GPS unavailable — enter a reason",
                                  ) ?? undefined;
                                if (!gpsExceptionReason) {
                                  setBusy(false);
                                  return;
                                }
                              }
                              const result = await run(
                                "check-in",
                                {
                                  workSessionId: session.id,
                                  retailerId: retailer.id,
                                  latitude: point.latitude,
                                  longitude: point.longitude,
                                  accuracy: point.accuracy,
                                  gpsExceptionReason,
                                  idempotencyKey: key(),
                                },
                                { entityType: "SeeraVisit", actionType: "VISIT_DRAFT" },
                                hi ? "विज़िट शुरू हुई।" : "Visit started.",
                                hi ? "चेक-इन हो रहा है…" : "Checking in…",
                              );
                              // Only on a REAL server response confirming the durable write — never
                              // on the offline-queued path, which has no durable confirmation yet.
                              // Jump straight to the active-visit workspace using the response's own
                              // authoritative id/checkedInAt plus retailer fields already in props,
                              // instead of waiting for the unrelated full-portal router.refresh() to
                              // deliver the same visit back through props.
                              if (!("queued" in result) && result.success) {
                                const data = result.data as { id: string; checkedInAt: string };
                                setLocalOptimisticVisit({
                                  id: data.id,
                                  retailerId: retailer.id,
                                  retailerName: retailer.businessName,
                                  retailerMobile: retailer.mobile,
                                  retailerArea: null,
                                  distributorId: retailer.distributorId,
                                  checkedInAt: data.checkedInAt,
                                  photos: [],
                                });
                              }
                            }}
                          >
                            {busy ? (busyLabel ?? (hi ? "चेक-इन हो रहा है…" : "Checking in…")) : hi ? "विज़िट शुरू करें" : "Start visit"}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => {
                              const reason = window.prompt(
                                hi
                                  ? "छोड़ने का कारण (दुकान बंद / अनुपलब्ध / मार्ग बाधा / आपातकाल / प्रबंधक निर्देश / अन्य)"
                                  : "Skip reason (Shop Closed / Unavailable / Route Constraint / Emergency / Manager Instruction / Other)",
                              );
                              if (!reason) return;
                              void run(
                                "skip-retailer",
                                {
                                  workSessionId: session.id,
                                  retailerId: retailer.id,
                                  reason,
                                  idempotencyKey: key(),
                                },
                                null,
                                hi ? "रिटेलर छोड़ा गया।" : "Retailer skipped.",
                              );
                            }}
                          >
                            {hi ? "छोड़ें" : "Skip"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            <button
              className={styles.secondary}
              disabled={busy}
              onClick={() => {
                setShowEndDayPreview(true);
                listClientQueue()
                  .then((items) => setPendingSyncCount(items.filter((i) => !["SYNCED", "CANCELLED"].includes(i.status)).length))
                  .catch(() => {});
              }}
            >
              {hi ? "दिन समाप्त करें" : "End day"}
            </button>
            {showEndDayPreview && (
              <div className={styles.note}>
                <strong>{hi ? "दिन समाप्ति सारांश" : "End-day summary"}</strong>
                <dl className={styles.statGrid}>
                  <div>
                    <dt>{hi ? "शुरू समय" : "Start time"}</dt>
                    <dd>
                      {new Date(session.startedAt).toLocaleTimeString(hi ? "hi-IN" : "en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt>{hi ? "देखे गए" : "Visited"}</dt>
                    <dd>{dashboard.today.visited}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "उत्पादक" : "Productive"}</dt>
                    <dd>{dashboard.today.productive}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "छोड़े गए" : "Skipped"}</dt>
                    <dd>{dashboard.today.skipped}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "ऑर्डर" : "Orders"}</dt>
                    <dd>{dashboard.today.orders}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "बुक मूल्य" : "Booked value"}</dt>
                    <dd>₹{dashboard.today.bookedValue.toLocaleString("en-IN")}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "नए ग्राहक" : "New customers"}</dt>
                    <dd>{dashboard.today.newRetailers}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "वितरक संभावना" : "Distributor prospects"}</dt>
                    <dd>{dashboard.today.distributorProspects}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "फ़ोटो" : "Photos"}</dt>
                    <dd>{dashboard.today.photos}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "फॉलो-अप देय" : "Follow-ups due"}</dt>
                    <dd>{dashboard.today.followUpsDue}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "सिंक लंबित" : "Pending sync"}</dt>
                    <dd>{pendingSyncCount}</dd>
                  </div>
                </dl>
                {pendingSyncCount > 0 && (
                  <p className={styles.note}>
                    {hi
                      ? `${pendingSyncCount} आइटम अभी भी सिंक होना बाकी है — पुष्टि करने पर पहले सिंक करने की कोशिश की जाएगी। यह डेटा सुरक्षित है और नेटवर्क वापस आने पर बाद में भी सिंक हो सकता है।`
                      : `${pendingSyncCount} item(s) still need to sync — confirming will try to sync first. This data is safe and can also sync later once you're back online.`}
                  </p>
                )}
                <div className={styles.quickActions}>
                  <button
                    className={styles.primary}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      // Best-effort: try to drain the local offline queue before ending the day,
                      // so pending visits/orders/photos are synchronized where possible rather
                      // than silently left behind. Never blocks End Day indefinitely — a real
                      // network outage just leaves items PENDING (still safe, still queued) and
                      // the flow continues; only a hung network call could stall this, same risk
                      // any fetch already carries.
                      if (typeof navigator !== "undefined" && navigator.onLine) {
                        setBusyLabel(hi ? "पहले सिंक हो रहा है…" : "Syncing first…");
                        await syncClientQueue().catch(() => {});
                      }
                      setGpsStatus("LOCATING");
                      await yieldToPaint();
                      const { status, point } = await captureGps();
                      setGpsStatus(status);
                      let endExceptionReason: string | undefined;
                      if (status === "PERMISSION_DENIED" || status === "UNAVAILABLE") {
                        endExceptionReason =
                          window.prompt(
                            hi ? "GPS उपलब्ध नहीं — कारण दर्ज करें" : "GPS unavailable — enter a reason",
                          ) ?? undefined;
                        if (!endExceptionReason) {
                          setBusy(false);
                          return;
                        }
                      }
                      void run(
                        "end-day",
                        {
                          sessionId: session.id,
                          outcome: "COMPLETED",
                          latitude: point.latitude,
                          longitude: point.longitude,
                          accuracy: point.accuracy,
                          endExceptionReason,
                          remarks: "Completed from field portal",
                        },
                        { entityType: "SeeraWorkSession", actionType: "DAY_END_DRAFT" },
                        hi ? "दिन समाप्त हुआ।" : "Day ended.",
                        hi ? "दिन समाप्त हो रहा है…" : "Ending day…",
                      );
                    }}
                  >
                    {busy ? (busyLabel ?? (hi ? "दिन समाप्त हो रहा है…" : "Ending day…")) : hi ? "पुष्टि करें और समाप्त करें" : "Confirm & end day"}
                  </button>
                  <button disabled={busy} onClick={() => setShowEndDayPreview(false)}>{hi ? "वापस" : "Back"}</button>
                </div>
              </div>
            )}
            <ActionMessageBanner message={message} language={language} />
          </section>
        )}
      </>
    );

  const currentDistributorId = beatRetailers.find((r) => r.id === visit.retailerId)?.distributorId ?? visit.distributorId;

  return (
    <>
      {header}
      {/* Keyed by visit.id: this is the hard state boundary the checkout->next-customer flow
          needs. React fully unmounts and remounts this whole subtree whenever the active visit
          changes identity (a new check-in, or going back to no visit at all) — which clears every
          uncontrolled input (order note, checkout note/reason fields, follow-up note) that the
          visit?.id useEffect above can't reach, since those inputs live in plain DOM, not React
          state. Without this, Customer B's order form could silently start with Customer A's typed
          note still sitting in the field. */}
      <section className={styles.journey} key={visit.id}>
        <header>
          <span>3</span>
          <div>
            <small>{hi ? "सक्रिय विज़िट" : "ACTIVE VISIT"}</small>
            <h2>{visit.retailerName}</h2>
            <p>
              {visit.retailerMobile ?? (hi ? "मोबाइल उपलब्ध नहीं" : "No mobile")}
              {visit.retailerArea ? ` · ${visit.retailerArea}` : ""} ·{" "}
              {hi ? "चेक-इन" : "Checked in"}{" "}
              {new Date(visit.checkedInAt).toLocaleTimeString(hi ? "hi-IN" : "en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </header>
        <div className={styles.tabs}>
          {(["ORDER", "PHOTO", "FOLLOW_UP"] as const).map((x) => (
            <button key={x} data-active={mode === x} onClick={() => setMode(x)}>
              {x === "ORDER"
                ? hi
                  ? "ऑर्डर"
                  : "Order"
                : x === "PHOTO"
                  ? hi
                    ? "फ़ोटो"
                    : "Photo"
                  : hi
                    ? "फॉलो-अप"
                    : "Follow-up"}
            </button>
          ))}
        </div>
        {mode === "ORDER" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const lines = orderLines
                .filter((line) => line.skuId && line.quantity > 0)
                .map(({ skuId, quantity, rate }) => ({ skuId, quantity, rate }));
              if (!lines.length) {
                setMessage({
                  ok: false,
                  text: hi ? "कम से कम एक उत्पाद और मात्रा चुनें।" : "Choose at least one product and quantity.",
                });
                return;
              }
              if (lines.some((line) => !(line.rate > 0))) {
                setMessage({
                  ok: false,
                  text: hi ? "हर उत्पाद के लिए दर (₹0 से अधिक) दर्ज करें।" : "Enter a rate greater than ₹0 for every product.",
                });
                return;
              }
              void (async () => {
                const outcome = await run(
                  "place-order",
                  {
                    retailerId: visit.retailerId,
                    commercialPartyId: currentDistributorId,
                    idempotencyKey: key(),
                    notes: String(f.get("notes") ?? ""),
                    commercialPaymentType: paymentType,
                    lines,
                  },
                  {
                    entityType: "SeeraSalesOrder",
                    actionType: "ORDER_DRAFT",
                  },
                  hi ? "ऑर्डर सहेजा गया।" : "Order saved.",
                  hi ? "ऑर्डर सहेजा जा रहा है…" : "Saving order…",
                );
                // Save Order should flow straight into Photo, not leave the Executive on the
                // same tab (final UI reachability audit fix) — advance on both a live success and
                // an offline-queued outcome, since either means the order step is done.
                if ("queued" in outcome || outcome.success) setMode("PHOTO");
              })();
            }}
          >
            <div className={styles.lineItems}>
              <strong>{hi ? "ऑर्डर उत्पाद" : "Order products"}</strong>
              {orderLines.map((line, index) => {
                const sku = skuById.get(line.skuId);
                const lineTotal = (line.rate || 0) * (line.quantity || 0);
                const searchText = line.search.trim().toLowerCase();
                const visibleSkus = skus.filter(
                  (s) =>
                    (line.brandFilter === "ALL" || s.brand === line.brandFilter) &&
                    (!searchText ||
                      s.productName.toLowerCase().includes(searchText) ||
                      s.brand.toLowerCase().includes(searchText) ||
                      s.packLabel.toLowerCase().includes(searchText)),
                );
                const visibleBrands = Array.from(new Set(visibleSkus.map((s) => s.brand)));
                return (
                  <div className={styles.lineItem} key={line.key}>
                    <label>
                      {hi ? "ब्रांड" : "Brand"}
                      <div className={styles.workTypeGrid}>
                        {["ALL", ...brands].map((b) => (
                          <label key={b} className={styles.workTypeOption} data-active={line.brandFilter === b}>
                            <input
                              type="radio"
                              name={`brand-${line.key}`}
                              checked={line.brandFilter === b}
                              onChange={() =>
                                setOrderLines((current) =>
                                  current.map((item) => (item.key === line.key ? { ...item, brandFilter: b } : item)),
                                )
                              }
                            />
                            {b === "ALL" ? (hi ? "सभी" : "All") : b}
                          </label>
                        ))}
                      </div>
                    </label>
                    <label>
                      {hi ? "खोजें (नाम / पैक)" : "Search (name / pack)"}
                      <input
                        type="search"
                        value={line.search}
                        placeholder={hi ? "उदा. डिटर्जेंट, 1 kg" : "e.g. Detergent, 1 kg"}
                        onChange={(event) =>
                          setOrderLines((current) =>
                            current.map((item) => (item.key === line.key ? { ...item, search: event.target.value } : item)),
                          )
                        }
                      />
                    </label>
                    <label>
                      {hi ? "उत्पाद / वेरिएंट" : "Product / Variant"}
                      <select
                        data-testid="order-line-product-select"
                        value={line.skuId}
                        onChange={(event) => {
                          const chosen = skuById.get(event.target.value);
                          setOrderLines((current) =>
                            current.map((item) =>
                              item.key === line.key
                                ? { ...item, skuId: event.target.value, rate: chosen?.rate || item.rate }
                                : item,
                            ),
                          );
                        }}
                        required
                      >
                        <option value="">{hi ? "उत्पाद चुनें" : "Choose product"}</option>
                        {visibleBrands.map((b) => (
                          <optgroup key={b} label={b}>
                            {visibleSkus
                              .filter((s) => s.brand === b)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.productName} — {s.packLabel}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                    <label>
                      {hi ? "मात्रा" : "Quantity"}
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={line.quantity}
                        onChange={(event) =>
                          setOrderLines((current) =>
                            current.map((item) =>
                              item.key === line.key ? { ...item, quantity: Number(event.target.value) } : item,
                            ),
                          )
                        }
                        required
                      />
                    </label>
                    <label>
                      {hi ? "दर (GST सहित)" : "Rate (Incl. GST)"}
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.rate || ""}
                        placeholder={hi ? "दर दर्ज करें" : "Enter rate"}
                        onChange={(event) =>
                          setOrderLines((current) =>
                            current.map((item) =>
                              item.key === line.key ? { ...item, rate: Number(event.target.value) } : item,
                            ),
                          )
                        }
                        required
                      />
                    </label>
                    <label>
                      {hi ? "कुल" : "Total"}
                      <input value={sku ? `₹${lineTotal.toFixed(2)}` : "—"} readOnly />
                    </label>
                    {orderLines.length > 1 && (
                      <button
                        className={styles.removeLine}
                        type="button"
                        onClick={() => setOrderLines((current) => current.filter((item) => item.key !== line.key))}
                        aria-label={`${hi ? "उत्पाद हटाएँ" : "Remove product"} ${index + 1}`}
                      >
                        {hi ? "हटाएँ" : "Remove"}
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                className={styles.addLine}
                type="button"
                onClick={() => setOrderLines((current) => [...current, blankOrderLine()])}
              >
                {hi ? "+ उत्पाद जोड़ें" : "+ Add product"}
              </button>
              <div className={styles.orderTotalRow}>
                <strong>{hi ? "ऑर्डर कुल" : "Order total"}</strong>
                <span>₹{orderTotal.toFixed(2)}</span>
              </div>
            </div>
            <label>
              {hi ? "भुगतान प्रकार" : "Payment type"}
              <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as "CASH" | "CREDIT")}>
                <option value="CREDIT">{hi ? "उधार" : "CREDIT"}</option>
                <option value="CASH">{hi ? "नकद" : "CASH"}</option>
              </select>
            </label>
            <label>
              {hi ? "ऑर्डर टिप्पणी" : "Order note"}
              <input name="notes" />
            </label>
            <button className={styles.primary} disabled={busy || !skus.length}>
              {busy ? (busyLabel ?? (hi ? "सहेज रहे हैं…" : "Saving…")) : hi ? "ऑर्डर सहेजें" : "Save order"}
            </button>
          </form>
        )}
        {mode === "PHOTO" && (
          <div>
            <div className={styles.photoGrid}>
              {effectivePhotos.map((photo) => (
                <div className={styles.photoThumb} key={photo.id}>
                  <img src={`/api/field/photos/${photo.id}`} alt={photo.photoType} />
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={hi ? "हटाएँ" : "Remove"}
                    onClick={async () => {
                      const reason = window.prompt(hi ? "हटाने का कारण" : "Reason for removing this photo");
                      if (!reason) return;
                      const result = await run("delete-photo", { photoId: photo.id, reason }, null, hi ? "फ़ोटो हटाई गई।" : "Photo removed.");
                      if (!("queued" in result) && result.success)
                        setLocallyDeletedPhotoIds((current) => new Set(current).add(photo.id));
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(event) => {
                setMessage(null);
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setPhotoPreview(String(reader.result));
                reader.readAsDataURL(file);
              }}
            />
            {photoPreview && (
              <div>
                <img src={photoPreview} alt="" style={{ maxWidth: 220, borderRadius: 10 }} />
                <div className={styles.quickActions}>
                  <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
                    {hi ? "फिर से लें" : "Retake"}
                  </button>
                </div>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  file = fileRef.current?.files?.[0];
                if (!file) {
                  setMessage({ ok: false, text: hi ? "पहले एक फ़ोटो चुनें।" : "Choose a photo first." });
                  return;
                }
                const photoType = String(f.get("photoType"));
                void (async () => {
                  // Set busy/feedback synchronously before the resize step (not just once the
                  // network request starts) so "Uploading…" appears the instant the user taps "Add
                  // photo" — the resize itself is typically much faster than the upload it shrinks,
                  // so folding it into the same visible busy window keeps the UI simple without
                  // adding a wait the user would perceive as new.
                  setBusy(true);
                  setBusyLabel(hi ? "फ़ोटो अपलोड हो रही है…" : "Uploading photo…");
                  await yieldToPaint();
                  const { base64, mimeType, originalName } = await prepareImageForUpload(file);
                  const result = await run(
                    "capture-photo",
                    {
                      visitId: visit.id,
                      photoType,
                      fileBase64: base64,
                      mimeType,
                      originalName,
                      idempotencyKey: key(),
                    },
                    null,
                    hi ? "फ़ोटो जोड़ी गई ✓" : "Photo added ✓",
                    hi ? "फ़ोटो अपलोड हो रही है…" : "Uploading photo…",
                  );
                  // Only clear the preview/selected file once it's actually persisted — on
                  // failure (unsupported format, too large, network) the preview and the
                  // selected file stay exactly as they were so the user can just press
                  // "Add photo" again without re-picking anything, and the inline error from
                  // `message` explains exactly why it didn't go through.
                  if ("queued" in result || result.success) {
                    setPhotoPreview(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }
                  // Only on a REAL server response (never the offline-queued path, which has no
                  // durable id yet) — merge the new photo into the visible count/grid immediately
                  // instead of waiting for the background router.refresh() to deliver it.
                  if (!("queued" in result) && result.success) {
                    const data = result.data as { id: string; photoType: string; capturedAt: string };
                    setLocalAddedPhotos((current) => [...current, { id: data.id, photoType: data.photoType, capturedAt: data.capturedAt }]);
                  }
                })();
              }}
            >
              <label>
                {hi ? "फ़ोटो प्रकार" : "Photo type"}
                <select name="photoType">
                  <option value="SHOPFRONT">{hi ? "दुकान का सामने का हिस्सा" : "Shopfront"}</option>
                  <option value="COUNTER">{hi ? "काउंटर" : "Counter"}</option>
                  <option value="PRODUCT_DISPLAY">{hi ? "उत्पाद प्रदर्शन" : "Product display"}</option>
                  <option value="BANNER_BRANDING">{hi ? "बैनर / ब्रांडिंग" : "Banner / branding"}</option>
                  <option value="MERCHANDISING">{hi ? "मर्चेंडाइजिंग" : "Merchandising"}</option>
                  <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
                </select>
              </label>
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
                {hi ? "कैमरा खोलें" : "Open camera"}
              </button>
              <button className={styles.primary} disabled={busy || !photoPreview}>
                {busy ? (busyLabel ?? (hi ? "अपलोड हो रहा है…" : "Uploading…")) : hi ? "फ़ोटो जोड़ें" : "Add photo"}
              </button>
            </form>
            <p className={styles.note}>
              {hi
                ? "फ़ोटो नहीं ले सकते? चेकआउट पर कारण दर्ज करें (रिटेलर ने मना किया / कैमरा खराब / आपातकाल / प्रबंधक-स्वीकृत छूट / अन्य)।"
                : "Can’t take a photo? Record a reason at checkout (Retailer refused / Camera issue / Emergency / Manager-approved exception / Other)."}
            </p>
          </div>
        )}
        {mode === "FOLLOW_UP" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(
                "create-follow-up",
                {
                  type: String(f.get("type")),
                  retailerId: visit.retailerId,
                  visitId: visit.id,
                  dueDate: String(f.get("dueDate")),
                  priority: String(f.get("priority")),
                  note: String(f.get("note")),
                  idempotencyKey: key(),
                },
                { entityType: "SeeraFollowUp", actionType: "FOLLOW_UP_DRAFT" },
                hi ? "फॉलो-अप सहेजा गया।" : "Follow-up saved.",
                hi ? "फॉलो-अप सहेजा जा रहा है…" : "Saving follow-up…",
              );
            }}
          >
            <label>
              {hi ? "प्रकार" : "Type"}
              <select name="type">
                <option value="RETAIL_ORDER">{hi ? "खुदरा ऑर्डर" : "Retail order"}</option>
                <option value="PAYMENT">{hi ? "भुगतान" : "Payment"}</option>
                <option value="DISTRIBUTOR">{hi ? "वितरक" : "Distributor"}</option>
                <option value="PROSPECT">{hi ? "संभावना" : "Prospect"}</option>
                <option value="COMPLAINT">{hi ? "शिकायत" : "Complaint"}</option>
                <option value="PRODUCT_AVAILABILITY">{hi ? "उत्पाद उपलब्धता" : "Product availability"}</option>
                <option value="SAMPLE_FEEDBACK">{hi ? "नमूना प्रतिक्रिया" : "Sample feedback"}</option>
                <option value="RETURN_ISSUE">{hi ? "वापसी / समस्या" : "Return / issue"}</option>
                <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
              </select>
            </label>
            <label>
              {hi ? "देय तिथि" : "Due date"}
              <input name="dueDate" type="date" required />
            </label>
            <label>
              {hi ? "प्राथमिकता" : "Priority"}
              <select name="priority">
                <option value="NORMAL">{hi ? "सामान्य" : "Normal"}</option>
                <option value="HIGH">{hi ? "उच्च" : "High"}</option>
              </select>
            </label>
            <label>
              {hi ? "टिप्पणी" : "Note"}
              <input name="note" required />
            </label>
            <button className={styles.primary} disabled={busy}>
              {busy ? (busyLabel ?? (hi ? "सहेज रहे हैं…" : "Saving…")) : hi ? "फॉलो-अप सहेजें" : "Save follow-up"}
            </button>
          </form>
        )}
        <div className={styles.note}>
          <strong>{hi ? "विज़िट सारांश" : "Visit summary"}</strong>
          <p>
            {hi ? "ऑर्डर कुल" : "Order total"}: ₹{orderTotal.toFixed(2)} ·{" "}
            {hi ? "भुगतान" : "Payment"}: {paymentType} · {hi ? "फ़ोटो" : "Photos"}: {effectivePhotos.length}
          </p>
          {gpsStatus !== "IDLE" && (
            <div className={styles.gpsRow}>
              <GpsBadge language={language} status={gpsStatus} />
            </div>
          )}
        </div>
        <form
          className={styles.checkout}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              deviation = String(f.get("routeDeviationReason") ?? "");
            void (async () => {
              setBusy(true);
              setBusyLabel(hi ? "विज़िट पूरी हो रही है…" : "Completing visit…");
              setGpsStatus("LOCATING");
              await yieldToPaint();
              const { status, point } = await captureGps();
              setGpsStatus(status);
              if (deviation) await run("route-deviation", { visitId: visit.id, reason: deviation });
              const result = await run(
                "check-out",
                {
                  visitId: visit.id,
                  outcome: String(f.get("outcome")),
                  noOrderReason: String(f.get("noOrderReason") ?? "") || undefined,
                  followUpAt: String(f.get("followUpAt") ?? "") || undefined,
                  notes: String(f.get("notes") ?? ""),
                  photoExceptionReason: String(f.get("photoExceptionReason") ?? "") || undefined,
                  latitude: point.latitude,
                  longitude: point.longitude,
                  accuracy: point.accuracy,
                },
                { entityType: "SeeraVisit", actionType: "VISIT_CHECK_OUT" },
                hi ? "विज़िट पूरी हुई।" : "Visit completed.",
                hi ? "विज़िट पूरी हो रही है…" : "Completing visit…",
              );
              // Checkout has already durably succeeded server-side at this point (or is safely
              // queued offline) — jump straight to the beat list using data already in props
              // instead of waiting for the unrelated full-portal router.refresh() that run() also
              // kicked off. That refresh still lands moments later in the background to reconcile
              // dashboard/beat counters; the rawVisit?.id effect resets this flag once it does.
              if ("queued" in result || result.success) {
                setOptimisticVisitCleared(true);
              }
            })();
          }}
        >
          <label>
            {hi ? "विज़िट परिणाम" : "Visit outcome"}
            <select name="outcome">
              <option value="ORDER_BOOKED">{hi ? "ऑर्डर बुक किया गया" : "Order booked"}</option>
              <option value="FOLLOW_UP">{hi ? "फॉलो-अप" : "Follow up"}</option>
              <option value="NO_ORDER">{hi ? "कोई ऑर्डर नहीं" : "No order"}</option>
              <option value="MARKET_INTELLIGENCE">{hi ? "बाज़ार जानकारी" : "Market intelligence"}</option>
            </select>
          </label>
          <label>
            {hi ? "कारण (यदि कोई ऑर्डर नहीं)" : "Reason (if no order)"}
            <input name="noOrderReason" />
          </label>
          <label>
            {hi ? "फॉलो-अप तिथि (वैकल्पिक)" : "Follow-up date (optional)"}
            <input name="followUpAt" type="date" />
          </label>
          <label>
            {hi ? "विज़िट टिप्पणी" : "Visit note"}
            <input name="notes" />
          </label>
          {effectivePhotos.length === 0 && (
            <label>
              {hi ? "फ़ोटो न होने का कारण" : "Reason no photo was taken"}
              <select name="photoExceptionReason" defaultValue="">
                <option value="">{hi ? "फ़ोटो संलग्न है" : "Photo attached"}</option>
                <option value="RETAILER_REFUSED">{hi ? "रिटेलर ने मना किया" : "Retailer refused"}</option>
                <option value="CAMERA_ISSUE">{hi ? "कैमरा / डिवाइस समस्या" : "Camera / device issue"}</option>
                <option value="EMERGENCY">{hi ? "आपातकाल" : "Emergency"}</option>
                <option value="MANAGER_APPROVED">{hi ? "प्रबंधक-स्वीकृत छूट" : "Manager-approved exception"}</option>
                <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
              </select>
            </label>
          )}
          <label>
            {hi ? "मार्ग विचलन (यदि लागू हो)" : "Route deviation (if applicable)"}
            <select name="routeDeviationReason" defaultValue="">
              <option value="">{hi ? "कोई विचलन नहीं" : "No deviation"}</option>
              <option value="NEW_OUTLET_OPPORTUNITY">{hi ? "नया आउटलेट अवसर" : "New outlet opportunity"}</option>
              <option value="URGENT_PAYMENT_FOLLOW_UP">{hi ? "अत्यावश्यक भुगतान फॉलो-अप" : "Urgent payment follow-up"}</option>
              <option value="SHOP_CLOSURE">{hi ? "दुकान बंद" : "Shop closure"}</option>
              <option value="ROAD_TRAFFIC">{hi ? "सड़क / यातायात" : "Road / traffic"}</option>
              <option value="MANAGER_INSTRUCTION">{hi ? "प्रबंधक निर्देश" : "Manager instruction"}</option>
              <option value="EMERGENCY">{hi ? "आपातकाल" : "Emergency"}</option>
              <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
            </select>
          </label>
          <button className={styles.secondary} disabled={busy}>
            {busy ? (busyLabel ?? (hi ? "हो रहा है…" : "Working…")) : hi ? "चेकआउट और अगला ग्राहक" : "Checkout & next customer"}
          </button>
        </form>
        <ActionMessageBanner message={message} language={language} />
      </section>
    </>
  );
}
