"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkInVisit } from "@/actions/inst-visits";
import { useToast } from "@/components/ui/toast";

export function CheckInForm({ opportunityId, customerId, leadId }: { opportunityId?: string; customerId?: string; leadId?: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  function captureLocation() {
    if (!navigator.geolocation) { showToast("Geolocation is not available on this device", { tone: "dark" }); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => { showToast("Could not read location — continuing without GPS", { tone: "dark" }); setLocating(false); },
      { timeout: 8000 }
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const result = await checkInVisit({
      opportunityId, customerId, leadId,
      visitDate: String(form.get("visitDate")),
      checkInLat: coords?.lat, checkInLng: coords?.lng,
    });
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Checked in", { tone: "dark" });
    router.push(`/os/sales/visits/${result.data.id}`);
    router.refresh();
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-md">
      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: "rgba(var(--text-rgb),0.55)" }}>Visit Date & Time</label>
        <input type="datetime-local" name="visitDate" required defaultValue={new Date().toISOString().slice(0, 16)} className={field} style={fieldStyle} />
      </div>
      <button type="button" onClick={captureLocation} disabled={locating} className="muv-os-btn-ghost rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.8)" }}>
        {locating ? "Locating…" : coords ? `GPS captured (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : "Capture GPS Location"}
      </button>
      <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 block" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
        {saving ? "Checking in…" : "Check In"}
      </button>
    </form>
  );
}
