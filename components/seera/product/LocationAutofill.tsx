"use client";

import { useEffect, useRef, useState } from "react";
import { captureGps } from "./gps";

type Place = { landmark: string | null; locality: string | null; village: string | null; town: string | null; city: string | null; district: string | null; state: string | null; pincode: string | null; formatted: string };
type Target = "address" | "area" | "city" | "state" | "pincode" | "district" | "landmark";

const values = (p: Place): Record<Target, string> => {
  const place = p.city ?? p.town ?? p.village ?? p.district ?? "";
  const near = [p.landmark, p.locality].filter(Boolean).join(", ");
  return {
    address: p.formatted,
    area: [near, p.village && p.village !== place ? p.village : null, place].filter(Boolean).join(", "),
    city: place,
    state: p.state ?? "",
    pincode: p.pincode ?? "",
    district: p.district ?? "",
    landmark: p.landmark ?? p.locality ?? "",
  };
};

// Drop inside a <form>: reads GPS, asks /api/field/reverse-geocode for the place, and fills the
// form's empty fields (by input name) — landmark, village / town / city, district, state, PIN.
// Runs once automatically and can be re-run with the button; never overwrites typed text.
export function LocationAutofill({ language, fields, auto = true }: { language: "EN" | "HI"; fields: Partial<Record<Target, string>>; auto?: boolean }) {
  const hi = language === "HI";
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ busy: boolean; text: string | null; ok?: boolean }>({ busy: false, text: null });
  const run = async (overwrite: boolean) => {
    const form = ref.current?.closest("form");
    if (!form) return;
    setState({ busy: true, text: hi ? "लोकेशन ढूँढ रहे हैं…" : "Finding your location…" });
    const gps = await captureGps();
    if (gps.point.latitude == null || gps.point.longitude == null) {
      setState({ busy: false, text: hi ? "GPS नहीं मिला — लोकेशन चालू करके फिर कोशिश करें।" : "No GPS fix — turn location on and try again.", ok: false });
      return;
    }
    try {
      const res = await fetch(`/api/field/reverse-geocode?lat=${gps.point.latitude}&lng=${gps.point.longitude}`);
      if (!res.ok) throw new Error();
      const place = (await res.json()) as Place;
      const v = values(place);
      for (const [target, name] of Object.entries(fields) as [Target, string][]) {
        const input = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
        if (input && v[target] && (overwrite || !input.value.trim())) {
          input.value = v[target];
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      setState({ busy: false, text: `${hi ? "भरा गया" : "Filled"}: ${place.formatted}`, ok: true });
    } catch {
      setState({ busy: false, text: hi ? "जगह का नाम नहीं मिला — हाथ से भरें।" : "Could not get the place name — please type it.", ok: false });
    }
  };
  useEffect(() => {
    if (auto) void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={ref} style={{ gridColumn: "1/-1", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 13 }}>
      <button type="button" disabled={state.busy} onClick={() => void run(true)} style={{ minHeight: 40, borderRadius: 10, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontWeight: 700, padding: "0 12px" }}>
        📍 {hi ? "मेरी लोकेशन से पता भरें" : "Fill address from my location"}
      </button>
      {state.text && <span style={{ color: state.ok === false ? "#b91c1c" : "#475569", fontWeight: 600 }}>{state.text}</span>}
    </div>
  );
}
