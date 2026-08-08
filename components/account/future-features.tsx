import { Sparkles, Gift, RefreshCw, Droplet, Users, Package2 } from "lucide-react";

/**
 * Every card is visibly disabled and labeled "Muving Soon™" — no reward
 * points, referral counts, subscription status, or AI suggestions are
 * displayed or implied, because none of those exist anywhere in the schema.
 * This is a real extension-point surface, not a feature.
 */
const FUTURE = [
  { icon: Sparkles, label: "Muv Ritual™" },
  { icon: Gift, label: "Rewards" },
  { icon: RefreshCw, label: "Auto Refill" },
  { icon: Package2, label: "Subscription" },
  { icon: Droplet, label: "Skin Care" },
  { icon: Users, label: "Refer & Earn" },
];

export function FutureFeatures() {
  return (
    <section className="mt-10">
      <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Muving Soon™</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {FUTURE.map((f) => (
          <div key={f.label} className="muv-card text-center" style={{ padding: "18px 10px", opacity: 0.5 }} aria-disabled>
            <f.icon size={20} strokeWidth={1.3} style={{ color: "var(--lavender)", margin: "0 auto" }} aria-hidden />
            <p className="muv-text-solid text-xs font-medium mt-2.5">{f.label}</p>
            <p className="muv-text-faint text-[10px] uppercase tracking-widest mt-1">Muving Soon™</p>
          </div>
        ))}
      </div>
    </section>
  );
}
