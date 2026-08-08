"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitSurvey } from "@/actions/inst-visits";
import { useToast } from "@/components/ui/toast";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";

/** Module 5 — Customer Survey. Submitting this immediately triggers Module 6's AI Consumption Intelligence engine server-side. */
export function SurveyForm({ visitId }: { visitId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const raw: Record<string, unknown> = { visitId };
    for (const [key, value] of form.entries()) {
      if (value === "") continue;
      if (["floors", "rooms", "beds", "washrooms", "kitchens", "parkingSpaces", "shifts", "housekeepingStaff", "laundryStaff", "cleaningStaff"].includes(key)) raw[key] = Number(value);
      else if (["totalBuiltUpAreaSqft", "cleaningAreaSqft", "outdoorAreaSqft"].includes(key)) raw[key] = Number(value);
      else if (key === "hasLobby" || key === "monthlyConsumptionKnown") raw[key] = value === "on";
      else raw[key] = value;
    }
    raw.hasLobby = form.get("hasLobby") === "on";
    raw.monthlyConsumptionKnown = form.get("monthlyConsumptionKnown") === "on";

    const result = await submitSurvey(raw);
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Survey saved — AI consumption estimate generated", { tone: "dark" });
    router.refresh();
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
  const label = "text-xs font-medium mb-1 block";
  const labelStyle = { color: "rgba(var(--text-rgb),0.55)" } as const;
  const num = (n: string) => <input type="number" min={0} name={n} className={field} style={fieldStyle} />;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section>
        <SectionHeader title="Building Profile" />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div><label className={label} style={labelStyle}>Institution Type</label><input name="institutionType" placeholder="Hotel, Hospital, School…" className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Business Type</label><input name="businessType" className={field} style={fieldStyle} /></div>
        </div>
      </section>

      <section>
        <SectionHeader title="Infrastructure" />
        <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
          <div><label className={label} style={labelStyle}>Floors</label>{num("floors")}</div>
          <div><label className={label} style={labelStyle}>Rooms</label>{num("rooms")}</div>
          <div><label className={label} style={labelStyle}>Beds</label>{num("beds")}</div>
          <div><label className={label} style={labelStyle}>Washrooms</label>{num("washrooms")}</div>
          <div><label className={label} style={labelStyle}>Kitchens</label>{num("kitchens")}</div>
          <div><label className={label} style={labelStyle}>Parking Spaces</label>{num("parkingSpaces")}</div>
          <div className="flex items-end gap-2 pb-2"><input type="checkbox" name="hasLobby" id="hasLobby" /><label htmlFor="hasLobby" className="text-sm" style={{ color: "rgba(var(--text-rgb),0.75)" }}>Has Lobby</label></div>
        </div>
      </section>

      <section>
        <SectionHeader title="Area Information (sqft)" />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div><label className={label} style={labelStyle}>Total Built-up Area</label>{num("totalBuiltUpAreaSqft")}</div>
          <div><label className={label} style={labelStyle}>Cleaning Area</label>{num("cleaningAreaSqft")}</div>
          <div><label className={label} style={labelStyle}>Outdoor Area</label>{num("outdoorAreaSqft")}</div>
        </div>
      </section>

      <section>
        <SectionHeader title="Operations & Staff" />
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div><label className={label} style={labelStyle}>Working Hours</label><input name="workingHours" placeholder="e.g. 6am–11pm" className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Shifts</label>{num("shifts")}</div>
          <div><label className={label} style={labelStyle}>Housekeeping Staff</label>{num("housekeepingStaff")}</div>
          <div><label className={label} style={labelStyle}>Laundry Staff</label>{num("laundryStaff")}</div>
          <div><label className={label} style={labelStyle}>Cleaning Staff</label>{num("cleaningStaff")}</div>
          <div><label className={label} style={labelStyle}>Cleaning Frequency</label><input name="cleaningFrequency" placeholder="Daily, Alternate days…" className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Laundry Capacity (Kg/day)</label><input name="laundryCapacity" className={field} style={fieldStyle} /></div>
        </div>
      </section>

      <section>
        <SectionHeader title="Current Products & Vendor" />
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div><label className={label} style={labelStyle}>Floor Cleaner</label><input name="currentFloorCleaner" className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Detergent</label><input name="currentDetergent" className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Glass Cleaner</label><input name="currentGlassCleaner" className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Toilet Cleaner</label><input name="currentToiletCleaner" className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Hand Wash</label><input name="currentHandWash" className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Dishwash</label><input name="currentDishwash" className={field} style={fieldStyle} /></div>
          <div className="sm:col-span-2"><label className={label} style={labelStyle}>Other Chemicals</label><input name="currentOtherChemicals" className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Current Vendor</label><input name="currentVendor" className={field} style={fieldStyle} /></div>
        </div>
      </section>

      <section>
        <SectionHeader title="Consumption" />
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2"><input type="checkbox" name="monthlyConsumptionKnown" id="mck" /><label htmlFor="mck" className="text-sm" style={{ color: "rgba(var(--text-rgb),0.75)" }}>Customer knows their current monthly consumption</label></div>
          <textarea name="monthlyConsumptionNotes" rows={2} placeholder="Monthly consumption notes (if known)" className={field} style={fieldStyle} />
          <textarea name="additionalNotes" rows={2} placeholder="Additional notes" className={field} style={fieldStyle} />
        </div>
      </section>

      <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
        {saving ? "Generating AI estimate…" : "Save Survey & Generate AI Estimate"}
      </button>
    </form>
  );
}
