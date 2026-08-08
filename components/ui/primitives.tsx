import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export function Button({
  variant = "primary",
  className,
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  // Phase 1D correction pass — defaults to type="button" (the native
  // default is "submit", which is easy to trip over when a Button ends up
  // inside a <form> without anyone intending it to submit). Every real
  // submit button in this codebase already passes type="submit" explicitly
  // (verified: login/signup/business-inquiry forms all do), so this only
  // closes a latent risk, it doesn't change any existing intended behavior.
  return (
    <button type={type} className={clsx(variant === "primary" ? "muv-btn-primary" : "muv-btn-ghost", className)} {...props}>
      {children}
    </button>
  );
}

export function Card({ children, hover = false, className }: { children: ReactNode; hover?: boolean; className?: string }) {
  return <div className={clsx("muv-card", hover && "muv-card-hover", className)}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "positive" | "neutral" | "muted" }) {
  const styles = {
    positive: { color: "var(--lavender)", borderColor: "rgba(183,171,240,0.4)" },
    neutral: { color: "rgba(var(--text-rgb),0.7)", borderColor: "var(--card-border)" },
    muted: { color: "rgba(var(--text-rgb),0.4)", borderColor: "rgba(var(--text-rgb),0.15)" },
  }[tone];
  return (
    <span className="muv-badge-pill" style={styles}>
      {children}
    </span>
  );
}

export function Aura({ size = 560, style = {} }: { size?: number; style?: React.CSSProperties }) {
  return <div aria-hidden className="muv-aura" style={{ width: size, height: size, ...style }} />;
}

/** The CSS-drawn placeholder bottle used everywhere a real product photo
 * will eventually go — see AUDIT.md's Performance section on why real
 * images (via next/image) are the actual next step here, not this shape. */
export function BottleVisual({ width = 46, height = 120, wellSize }: { width?: number; height?: number; wellSize?: number }) {
  const well = wellSize ?? width + 24;
  return (
    <div className="muv-product-visual" style={{ width: well, height: well }}>
      <div className="muv-bottle" style={{ width, height }} />
    </div>
  );
}
