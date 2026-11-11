"use client";
import { useMemo, useState } from "react";
import type { SkuOption } from "./SkuSelect";
import styles from "./QuickOrderPicker.module.css";

// One-screen partner ordering: every orderable product in a single list with a −/+ stepper, a
// "Repeat last order" shortcut, and a sticky bar with the count, an estimate and the submit button.
// Must be rendered inside the caller's <form>; the submit button here submits that form, and the
// caller keeps owning validation, the API call and the governed server-side pricing.
export function QuickOrderPicker({
  language,
  skus,
  quantities,
  onChange,
  lastOrderLines = [],
  busy,
  submitLabel,
}: {
  language: "EN" | "HI";
  skus: SkuOption[];
  quantities: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  lastOrderLines?: { skuId: string; quantity: number }[];
  busy: boolean;
  submitLabel: string;
}) {
  const hi = language === "HI";
  const [brand, setBrand] = useState("ALL");
  const [search, setSearch] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const brands = useMemo(() => [...new Set(skus.map((s) => s.brand))].sort((a, b) => (a === "Seera" ? -1 : b === "Seera" ? 1 : a.localeCompare(b))), [skus]);
  const orderable = new Set(skus.filter((s) => !s.unavailable).map((s) => s.value));
  const q = search.trim().toLowerCase();
  // Orderable products first; ones without a configured price stay visible (never hidden) but last.
  const visible = skus
    .filter(
      (s) =>
        (brand === "ALL" || s.brand === brand) &&
        (!q || s.label.toLowerCase().includes(q) || (s.meta ?? "").toLowerCase().includes(q)) &&
        (!onlySelected || (quantities[s.value] ?? 0) > 0),
    )
    .sort((a, b) => Number(Boolean(a.unavailable)) - Number(Boolean(b.unavailable)));
  const set = (skuId: string, quantity: number) => {
    const next = { ...quantities };
    if (quantity > 0) next[skuId] = Math.min(100000, Math.round(quantity));
    else delete next[skuId];
    onChange(next);
  };
  const selected = Object.entries(quantities).filter(([, n]) => n > 0);
  const estimate = selected.reduce((sum, [id, n]) => sum + (skus.find((s) => s.value === id)?.rate ?? 0) * n, 0);
  const repeatable = lastOrderLines.filter((l) => orderable.has(l.skuId) && l.quantity > 0);

  return (
    <div className={styles.picker}>
      {repeatable.length > 0 && (
        <button
          type="button"
          className={styles.repeat3d}
          disabled={busy}
          onClick={() => {
            onChange(Object.fromEntries(repeatable.map((l) => [l.skuId, Math.round(l.quantity)])));
            setOnlySelected(true);
          }}
        >
          ↻ {hi ? `पिछला ऑर्डर दोहराएँ (${repeatable.length} उत्पाद)` : `Repeat last order (${repeatable.length} products)`}
        </button>
      )}
      <div className={styles.filters}>
        <div className={styles.brandTabs} role="tablist">
          {["ALL", ...brands].map((b) => (
            <button key={b} type="button" role="tab" aria-selected={brand === b} data-active={brand === b} onClick={() => setBrand(b)}>
              {b === "ALL" ? (hi ? "सभी" : "All") : b}
            </button>
          ))}
        </div>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={hi ? "उत्पाद खोजें" : "Search products"} aria-label={hi ? "उत्पाद खोजें" : "Search products"} />
        <label className={styles.onlySelected}>
          <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} />
          {hi ? "सिर्फ़ चुने हुए" : "Only selected"}
        </label>
      </div>
      <ul className={styles.list}>
        {visible.map((s) => {
          const n = quantities[s.value] ?? 0;
          return (
            <li key={s.value} data-selected={n > 0} data-unavailable={Boolean(s.unavailable)}>
              <button type="button" className={styles.name} disabled={s.unavailable || busy} onClick={() => set(s.value, n + 1)}>
                <strong>{s.label}</strong>
                <small>{s.unavailable ? (hi ? "मूल्य कॉन्फ़िगर नहीं" : "Price not configured yet") : s.meta}</small>
              </button>
              <div className={styles.stepper}>
                <button type="button" aria-label={`${hi ? "घटाएँ" : "Decrease"} ${s.label}`} disabled={n === 0 || busy} onClick={() => set(s.value, n - 1)}>−</button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={n || ""}
                  placeholder="0"
                  disabled={s.unavailable || busy}
                  aria-label={`${hi ? "मात्रा" : "Quantity"} ${s.label}`}
                  onChange={(e) => set(s.value, Number(e.target.value) || 0)}
                />
                <button type="button" aria-label={`${hi ? "बढ़ाएँ" : "Increase"} ${s.label}`} disabled={s.unavailable || busy} onClick={() => set(s.value, n + 1)}>+</button>
              </div>
            </li>
          );
        })}
        {!visible.length && <li className={styles.empty}>{hi ? "कोई उत्पाद नहीं मिला" : "No products match"}</li>}
      </ul>
      <div className={styles.bar}>
        <span>
          <strong>{selected.length}</strong> {hi ? "उत्पाद" : "products"}
          {estimate > 0 && (
            <small>
              {" "}· {hi ? "अनुमान" : "est."} ₹{Math.round(estimate).toLocaleString("en-IN")} {hi ? "(अंतिम राशि GST सहित सबमिट पर)" : "(final incl. GST on submit)"}
            </small>
          )}
        </span>
        {selected.length > 0 && (
          <button type="button" className={styles.clear} disabled={busy} onClick={() => onChange({})}>
            {hi ? "साफ़ करें" : "Clear"}
          </button>
        )}
        <button type="submit" className={styles.submit3d} disabled={busy || !selected.length}>
          {busy ? (hi ? "भेज रहे हैं…" : "Sending…") : `${submitLabel} →`}
        </button>
      </div>
    </div>
  );
}
