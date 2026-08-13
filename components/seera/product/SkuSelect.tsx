"use client";
// SEERA and MUV must never share one flat/mixed dropdown (Founder decision) — every product
// selector in the Distributor portal (Order from S.S., Quotations, Returns, stock actions) renders
// through this one grouped <select> so the separation stays consistent everywhere it's used.
export type SkuOption = { value: string; label: string; brand: string; meta?: string; unavailable?: boolean };

export function SkuSelect({
  name,
  skus,
  language,
  required,
  value,
  onChange,
}: {
  name?: string;
  skus: SkuOption[];
  language: "EN" | "HI";
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const hi = language === "HI";
  const brands = [...new Set(skus.map((s) => s.brand))].sort((a, b) => (a === "Seera" ? -1 : b === "Seera" ? 1 : a.localeCompare(b)));
  return (
    <select
      name={name}
      required={required}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
    >
      <option value="">{hi ? "उत्पाद चुनें" : "Choose product"}</option>
      {brands.map((brand) => (
        <optgroup key={brand} label={brand.toUpperCase()}>
          {skus
            .filter((s) => s.brand === brand)
            .map((s) => (
              <option key={s.value} value={s.value} disabled={s.unavailable}>
                {s.label}
                {s.meta ? ` · ${s.meta}` : ""}
                {s.unavailable ? ` — ${hi ? "मूल्य कॉन्फ़िगर नहीं" : "price not configured yet"}` : ""}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
