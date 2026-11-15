"use client";
import styles from "./FieldJourney.module.css";

export type GpsStatus = "IDLE" | "LOCATING" | "OK" | "LOW_ACCURACY" | "PERMISSION_DENIED" | "UNAVAILABLE";
export type GpsPoint = { latitude?: number; longitude?: number; accuracy?: number };

// Best-effort, explicit-consent GPS read. Never fabricates a coordinate — a denied/unavailable
// result is reported as such, and the caller decides whether to proceed with an exception reason.
// The most recent real fix seen by the day's route tracker (FieldGpsTracker's watchPosition).
// A check-in / checkout a few seconds later reuses it instead of asking the GPS chip again: faster
// on the phone, and it avoids browsers where a getCurrentPosition() issued while a
// watchPosition() is active never calls back at all (seen as "Checking in…" stuck forever).
let lastTrackedFix: { point: GpsPoint; at: number } | null = null;
const FRESH_FIX_MS = 30_000;
// Hard ceiling on one GPS read, independent of the browser honouring its own `timeout` option.
const GPS_HARD_TIMEOUT_MS = 12_000;

export function rememberTrackedFix(point: { latitude: number; longitude: number; accuracy: number | null }) {
  lastTrackedFix = { point: { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy ?? undefined }, at: Date.now() };
}

function statusFor(accuracy: number | undefined): GpsStatus {
  return accuracy !== undefined && accuracy > 150 ? "LOW_ACCURACY" : "OK";
}

export function captureGps(): Promise<{ status: GpsStatus; point: GpsPoint }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ status: "UNAVAILABLE", point: {} });
      return;
    }
    if (lastTrackedFix && Date.now() - lastTrackedFix.at < FRESH_FIX_MS) {
      resolve({ status: statusFor(lastTrackedFix.point.accuracy), point: lastTrackedFix.point });
      return;
    }
    let settled = false;
    const finish = (result: { status: GpsStatus; point: GpsPoint }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(guard);
      resolve(result);
    };
    const guard = window.setTimeout(() => finish({ status: "UNAVAILABLE", point: {} }), GPS_HARD_TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = position.coords.accuracy;
        finish({
          status: statusFor(accuracy),
          point: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy },
        });
      },
      (error) => {
        finish({ status: error.code === error.PERMISSION_DENIED ? "PERMISSION_DENIED" : "UNAVAILABLE", point: {} });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}

export function GpsBadge({ language, status }: { language: "EN" | "HI"; status: GpsStatus }) {
  const hi = language === "HI";
  const text: Record<GpsStatus, string> = {
    IDLE: hi ? "GPS निष्क्रिय" : "GPS idle",
    LOCATING: hi ? "स्थान खोजा जा रहा है…" : "Locating…",
    OK: hi ? "GPS प्राप्त हुआ" : "GPS captured",
    LOW_ACCURACY: hi ? "कम सटीकता GPS" : "Low accuracy GPS",
    PERMISSION_DENIED: hi ? "स्थान अनुमति अस्वीकृत" : "Location permission denied",
    UNAVAILABLE: hi ? "GPS उपलब्ध नहीं" : "GPS unavailable",
  };
  return (
    <span
      className={styles.pill}
      data-status={status === "OK" ? "PRODUCTIVE" : status === "LOW_ACCURACY" || status === "PERMISSION_DENIED" || status === "UNAVAILABLE" ? "SKIPPED" : undefined}
    >
      {text[status]}
    </span>
  );
}
