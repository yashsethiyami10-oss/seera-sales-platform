"use client";

/**
 * Split out of components/ui/primitives.tsx (Phase 16) — it was the only
 * component in that file needing "use client" (an onClick handler), but the
 * whole file carried the directive, forcing every Server Component that
 * imported Button/Card/Badge/Aura/BottleVisual (used broadly across the
 * storefront) into the client bundle even when rendered with zero
 * interactivity. Behavior is unchanged — same markup, same props.
 */
export function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="muv-toggle"
      style={{ background: checked ? "rgba(183,171,240,0.5)" : "rgba(120,120,130,0.25)" }}
    >
      <span
        className="muv-toggle-knob"
        style={{ transform: checked ? "translateX(18px)" : "translateX(0)", background: checked ? "var(--lavender)" : "#fff" }}
      />
    </button>
  );
}
