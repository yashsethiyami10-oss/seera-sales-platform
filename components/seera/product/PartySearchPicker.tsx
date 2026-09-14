"use client";
import { useState } from "react";

// Founder mission Priority 4 — "Do NOT make Founder scroll/swipe through a huge customer list."
// ledgerPartyOptions() already loads up to 2000 retailers into one flat `{id,name}[]` list, which
// every party picker (Create Invoice, Guided Money In) rendered as a single native <select> with
// up to 2000 <option>s — real production data confirmed this. This is a pure client-side filter
// over the SAME already-fetched list (no new endpoint, no new data shape): typing filters by
// substring match against the name (which already includes the phone number for retailers, e.g.
// "Shree Traders (9876543210)"), so name-or-phone search works today with zero backend change.
// Area/beat search would need the report to return that field — flagged as a follow-up, not done
// here since it needs a data-shape change, not just UI.
export function PartySearchPicker({
  parties,
  value,
  onChange,
  placeholder,
  hi,
}: {
  parties: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  hi?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = parties.find((p) => p.id === value);
  const q = query.trim().toLowerCase();
  const matches = (q ? parties.filter((p) => p.name.toLowerCase().includes(q)) : parties).slice(0, 30);

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={open ? query : (selected?.name ?? "")}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => { setQuery(e.target.value); if (value) onChange(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? (hi ? "नाम या फ़ोन नंबर खोजें…" : "Search name or phone number…")}
        autoComplete="off"
      />
      {open && (
        <div
          style={{
            position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0,
            background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8,
            maxHeight: 240, overflowY: "auto", boxShadow: "0 8px 24px #0f172a1a", marginTop: 2,
          }}
        >
          {parties.length === 0 ? (
            <div style={{ padding: "10px 12px", color: "#94a3b8" }}>{hi ? "कोई पार्टी नहीं मिली" : "No parties found"}</div>
          ) : matches.length === 0 ? (
            <div style={{ padding: "10px 12px", color: "#94a3b8" }}>{hi ? "कोई मेल नहीं मिला" : "No matches — try a different name or number"}</div>
          ) : (
            matches.map((p) => (
              <div
                key={p.id}
                onMouseDown={() => { onChange(p.id); setQuery(""); setOpen(false); }}
                style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #f0ece3" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                {p.name}
              </div>
            ))
          )}
          {parties.length > 30 && q === "" && (
            <div style={{ padding: "6px 12px", color: "#94a3b8", fontSize: 11 }}>
              {hi ? `${parties.length} में से 30 दिखाए जा रहे हैं — खोजने के लिए टाइप करें` : `Showing 30 of ${parties.length} — type to search`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
