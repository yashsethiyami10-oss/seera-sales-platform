"use client";
import styles from "./WorkflowActions.module.css";

// Founder's global Manager-UX rule: a closed dropdown with zero options must never render silently
// unexplained. Every Manager select that can legitimately be empty (master data incomplete, no team
// assigned yet, etc.) pairs with this — a plain, honest "No options available" message, plus
// whatever fallback the caller can offer (type manually, add new, or nothing yet).
export function EmptyOptionHint({ language, fallback }: { language: "EN" | "HI"; fallback?: string }) {
  const hi = language === "HI";
  return (
    <p className={styles.emptyHint}>
      {hi ? "कोई विकल्प उपलब्ध नहीं है।" : "No options available."} {fallback}
    </p>
  );
}
