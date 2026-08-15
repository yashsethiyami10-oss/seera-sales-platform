"use client";
import styles from "./WorkflowActions.module.css";

export type ActionMessage = {
  ok: boolean;
  text: string;
  nextAction?: string;
  requestId?: string;
  retryable?: boolean;
  supportRequired?: boolean;
};

// Shared governed-error card: title / reason / next action / reference ID.
// Success messages stay a plain inline status line (unchanged from before);
// failures get the structured layout Phase 5 asks for, without a redesign
// of the surrounding form.
export function ActionMessageBanner({ message, language }: { message: ActionMessage | null; language: "EN" | "HI" }) {
  if (!message) return null;
  const hi = language === "HI";
  if (message.ok) return <p role="status" data-ok="true">{message.text}</p>;
  return (
    <div role="alert" data-ok="false" className={styles.errorCard}>
      <p className={styles.errorTitle}>{hi ? "कार्रवाई पूरी नहीं हो सकी" : "Action could not be completed"}</p>
      <p className={styles.errorReason}>{message.text}</p>
      {message.nextAction && <p className={styles.errorNextAction}>{message.nextAction}</p>}
      {message.supportRequired && (
        <p className={styles.errorHint}>{hi ? "इसके लिए Admin/Founder की मदद चाहिए हो सकती है।" : "This may need help from your Admin or Founder."}</p>
      )}
      {message.requestId && (
        <p className={styles.errorReference}>{hi ? "संदर्भ" : "Reference"}: {message.requestId}</p>
      )}
    </div>
  );
}
