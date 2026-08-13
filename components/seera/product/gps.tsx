"use client";
import styles from "./FieldJourney.module.css";

export type GpsStatus = "IDLE" | "LOCATING" | "OK" | "LOW_ACCURACY" | "PERMISSION_DENIED" | "UNAVAILABLE";
export type GpsPoint = { latitude?: number; longitude?: number; accuracy?: number };

// Best-effort, explicit-consent GPS read. Never fabricates a coordinate — a denied/unavailable
// result is reported as such, and the caller decides whether to proceed with an exception reason.
export function captureGps(): Promise<{ status: GpsStatus; point: GpsPoint }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ status: "UNAVAILABLE", point: {} });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = position.coords.accuracy;
        resolve({
          status: accuracy > 150 ? "LOW_ACCURACY" : "OK",
          point: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy },
        });
      },
      (error) => {
        resolve({ status: error.code === error.PERMISSION_DENIED ? "PERMISSION_DENIED" : "UNAVAILABLE", point: {} });
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
