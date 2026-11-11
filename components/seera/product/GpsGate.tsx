"use client";

import { useCallback, useEffect, useState } from "react";

// Shown at the top of the Sales Executive / Sales Manager portal as soon as the app opens: if the
// phone cannot give a location (GPS switched off or permission not allowed) the rep gets one big
// "Turn on GPS" button instead of discovering it later at check-in. In the Android app the native
// shell additionally opens the phone's location settings when GPS is off.
type State = "checking" | "ok" | "denied" | "off";

export function GpsGate({ language }: { language: "EN" | "HI" }) {
  const hi = language === "HI";
  const [state, setState] = useState<State>("checking");
  const check = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("off");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setState("ok"),
      (error) => setState(error.code === error.PERMISSION_DENIED ? "denied" : "off"),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, []);
  useEffect(() => {
    check();
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [check]);
  if (state === "ok" || state === "checking") return null;
  return (
    <section role="alert" style={{ margin: "0 0 14px", padding: 16, borderRadius: 14, background: "#fef2f2", border: "2px solid #dc2626", display: "grid", gap: 10 }}>
      <strong style={{ fontSize: 18, color: "#991b1b" }}>📍 {hi ? "GPS चालू करें" : "Turn on GPS"}</strong>
      <span style={{ fontSize: 14, color: "#7f1d1d", fontWeight: 600 }}>
        {state === "denied"
          ? hi
            ? "Seera App को लोकेशन की अनुमति नहीं है। फ़ोन की Settings → Apps → Seera → Permissions → Location → \"Allow\" करें, फिर नीचे बटन दबाएँ।"
            : "Location permission is blocked for Seera. Open phone Settings → Apps → Seera → Permissions → Location → Allow, then tap the button below."
          : hi
            ? "फ़ोन की लोकेशन (GPS) बंद है। ऊपर से नीचे स्वाइप करके \"Location\" चालू करें, फिर नीचे बटन दबाएँ। विज़िट और TA इसी से गिने जाते हैं।"
            : "Phone location (GPS) is off. Swipe down and turn on \"Location\", then tap the button below. Visits and TA depend on it."}
      </span>
      <button type="button" onClick={() => { setState("checking"); check(); }} style={{ minHeight: 52, border: 0, borderRadius: 12, background: "#dc2626", color: "#fff", fontWeight: 800, fontSize: 16 }}>
        {hi ? "GPS चालू कर दिया — जाँचें" : "I turned on GPS — check again"}
      </button>
    </section>
  );
}
