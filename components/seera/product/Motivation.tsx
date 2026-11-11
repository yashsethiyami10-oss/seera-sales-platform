"use client";

import styles from "./Motivation.module.css";

// Shared motivation surfaces for the field and partner portals: a tilted 3D target ring that is
// always visible on the day screen, and a short celebration after each finished visit. Pure CSS —
// no animation library, no canvas — so it costs nothing on low-end Android phones and respects
// prefers-reduced-motion (see Motivation.module.css).

export type TargetPulseProps = {
  language: "EN" | "HI";
  // Monthly target in rupees; null when no target is assigned yet.
  target: { value: number; achieved: number; achievementPct: number; daysRemaining: number; requiredDailyRunRate: number } | null;
  today: { visited: number; planned: number; orders: number; bookedValue: number };
  // Overrides the default headline (e.g. "Team target" on the manager screen).
  title?: string;
  // One-line strip (used while a visit is open).
  compact?: boolean;
};

const inr = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

// Month progress (how much of the month has passed) vs target progress decides the tone. Pure
// function of the inputs so the server render and client render always agree.
export function motivationLine(input: Pick<TargetPulseProps, "target" | "today" | "language">): { tone: "ahead" | "on" | "push" | "start"; text: string } {
  const hi = input.language === "HI";
  const { target, today } = input;
  if (!target || target.value <= 0) {
    if (today.visited === 0) return { tone: "start", text: hi ? "पहली दुकान से दिन की शुरुआत करें — आज का पहला ऑर्डर आपका इंतज़ार कर रहा है!" : "Start with the first shop — today’s first order is waiting for you!" };
    if (today.orders === 0) return { tone: "push", text: hi ? `${today.visited} विज़िट हो गईं — अब पहला ऑर्डर लेने का समय!` : `${today.visited} visits done — time to land the first order!` };
    return { tone: "ahead", text: hi ? `शानदार! आज ${today.orders} ऑर्डर, ${inr(today.bookedValue)} बुक।` : `Great! ${today.orders} orders, ${inr(today.bookedValue)} booked today.` };
  }
  if (target.achievementPct >= 100) return { tone: "ahead", text: hi ? "लक्ष्य पूरा! अब रिकॉर्ड बनाइए 🏆" : "Target achieved! Now set a record 🏆" };
  const daysInMonth = 30;
  const elapsedPct = Math.max(0, Math.min(100, ((daysInMonth - target.daysRemaining) / daysInMonth) * 100));
  if (target.achievementPct >= elapsedPct + 5)
    return { tone: "ahead", text: hi ? "आप लक्ष्य से आगे चल रहे हैं — यही रफ़्तार रखें!" : "You are ahead of target pace — keep this speed!" };
  if (target.achievementPct >= elapsedPct - 5)
    return { tone: "on", text: hi ? `सही रास्ते पर! रोज़ ${inr(target.requiredDailyRunRate)} और चाहिए।` : `On track! ${inr(target.requiredDailyRunRate)} a day gets you there.` };
  return { tone: "push", text: hi ? `थोड़ा ज़ोर लगाइए — रोज़ ${inr(target.requiredDailyRunRate)} चाहिए, आप कर सकते हैं!` : `Push a little harder — ${inr(target.requiredDailyRunRate)} a day needed. You can do it!` };
}

export function TargetPulse({ language, target, today, title, compact = false }: TargetPulseProps) {
  const hi = language === "HI";
  const hasTarget = Boolean(target && target.value > 0);
  const pct = hasTarget
    ? Math.max(0, Math.min(100, target!.achievementPct))
    : today.planned > 0
      ? Math.max(0, Math.min(100, Math.round((today.visited / today.planned) * 100)))
      : 0;
  const motivation = motivationLine({ language, target, today });
  if (compact)
    return (
      <div className={styles.strip} data-tone={motivation.tone}>
        <div className={styles.stripBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={hi ? "प्रगति" : "Progress"}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className={styles.stripText}>
          {hasTarget ? `🎯 ${Math.round(target!.achievementPct)}% ${hi ? "लक्ष्य" : "of target"}` : `🏪 ${today.visited}/${today.planned || "–"} ${hi ? "विज़िट" : "visits"}`} · 📦 {today.orders} · {inr(today.bookedValue)}
        </span>
      </div>
    );
  return (
    <section className={styles.pulse} data-tone={motivation.tone} aria-label={hi ? "लक्ष्य प्रगति" : "Target progress"}>
      <div className={styles.ringStage}>
        <div
          className={styles.ring}
          style={{ ["--pct" as string]: `${pct}` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={hasTarget ? (hi ? "मासिक लक्ष्य" : "Monthly target") : hi ? "आज की विज़िट" : "Today’s visits"}
        >
          <div className={styles.ringFace}>
            <strong>{hasTarget ? `${Math.round(target!.achievementPct)}%` : `${today.visited}/${today.planned || "–"}`}</strong>
            <small>{hasTarget ? (hi ? "लक्ष्य" : "of target") : hi ? "विज़िट" : "visits"}</small>
          </div>
        </div>
      </div>
      <div className={styles.copy}>
        <small className={styles.eyebrow}>{title ?? (hasTarget ? (hi ? "इस महीने का लक्ष्य" : "This month’s target") : hi ? "आज का खेल" : "Today’s game")}</small>
        {hasTarget ? (
          <p className={styles.big}>
            {inr(target!.achieved)} <span>/ {inr(target!.value)}</span>
          </p>
        ) : (
          <p className={styles.big}>
            {inr(today.bookedValue)} <span>{hi ? "आज बुक" : "booked today"}</span>
          </p>
        )}
        <p className={styles.line}>{motivation.text}</p>
        <div className={styles.chips}>
          <span>📦 {today.orders} {hi ? "ऑर्डर" : "orders"}</span>
          <span>🏪 {today.visited} {hi ? "विज़िट" : "visits"}</span>
          {hasTarget && <span>⏳ {target!.daysRemaining} {hi ? "दिन बाकी" : "days left"}</span>}
          {!hasTarget && <span className={styles.muted}>{hi ? "मासिक लक्ष्य अभी सेट नहीं" : "Monthly target not set yet"}</span>}
        </div>
      </div>
    </section>
  );
}

export function CelebrationBurst({ title, line, onClose }: { title: string; line: string; onClose: () => void }) {
  return (
    <div className={styles.burstLayer} role="status" aria-live="polite" onClick={onClose}>
      <div className={styles.burst}>
        <div className={styles.confetti} aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ ["--i" as string]: `${i}` }} />
          ))}
        </div>
        <div className={styles.badge3d} aria-hidden>✓</div>
        <strong>{title}</strong>
        <p>{line}</p>
      </div>
    </div>
  );
}
