import type { ComponentType } from "react";

export type TrustCardProps = {
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  heading: string;
  description: string;
};

/**
 * Reusable icon + heading + short-description card. Generic on purpose —
 * used by WhyChooseMuv today, but takes no section-specific data, so it's
 * equally usable anywhere else a small trust/feature grid is needed later.
 */
export function TrustCard({ icon: Icon, heading, description }: TrustCardProps) {
  return (
    <div className="muv-trust-card">
      <span className="muv-trust-card-icon" aria-hidden>
        <Icon size={22} strokeWidth={1.3} />
      </span>
      <h3 className="font-display muv-text-solid text-lg" style={{ fontWeight: 500 }}>
        {heading}
      </h3>
      <p className="muv-text-meta text-sm mt-2" style={{ lineHeight: 1.6 }}>
        {description}
      </p>
    </div>
  );
}
