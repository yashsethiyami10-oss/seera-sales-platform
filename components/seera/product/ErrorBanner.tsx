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

function localizeFieldError(text: string, language: "EN" | "HI") {
  if (language === "EN") return text;
  const exact: Record<string, string> = {
    "An unexpected system error occurred.": "एक अप्रत्याशित सिस्टम त्रुटि हुई।",
    "You already have an active work day.": "आपका आज का फील्ड कार्य दिवस पहले से सक्रिय है।",
    "You need an active work day to do this.": "यह कार्रवाई करने के लिए सक्रिय फील्ड कार्य दिवस आवश्यक है।",
    "Active visit unavailable": "सक्रिय विज़िट उपलब्ध नहीं है।",
    "Could not save. Please retry.": "सहेजा नहीं जा सका। कृपया फिर से प्रयास करें।",
    "Photo upload failed. Please retry.": "फ़ोटो अपलोड नहीं हो सकी। कृपया फिर से प्रयास करें।",
    "Photo upload failed. Please retake.": "फ़ोटो अपलोड नहीं हो सकी। कृपया फिर से फ़ोटो लें।",
    "The action could not be completed. Please try again.": "कार्रवाई पूरी नहीं हो सकी। कृपया फिर से प्रयास करें।",
  };
  return exact[text] ?? text;
}

function localizeNextAction(text: string | undefined, language: "EN" | "HI") {
  if (!text || language === "EN") return text;
  const exact: Record<string, string> = {
    "End your current work day before starting a new one.": "नया दिन शुरू करने से पहले अपना वर्तमान कार्य दिवस समाप्त करें।",
    "Start your work day first, then try again.": "पहले अपना कार्य दिवस शुरू करें, फिर दोबारा प्रयास करें।",
    "Please try again in a moment. If this keeps happening, share the Error ID below with your Admin.": "कुछ देर बाद फिर प्रयास करें। समस्या बनी रहे तो नीचे दिया Error ID Admin को दें।",
    "Check your connection and try again.": "अपना इंटरनेट कनेक्शन जाँचें और फिर प्रयास करें।",
  };
  return exact[text] ?? text;
}

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
      <p className={styles.errorReason}>{localizeFieldError(message.text, language)}</p>
      {message.nextAction && <p className={styles.errorNextAction}>{localizeNextAction(message.nextAction, language)}</p>}
      {message.supportRequired && (
        <p className={styles.errorHint}>{hi ? "इसके लिए Admin/Founder की मदद चाहिए हो सकती है।" : "This may need help from your Admin or Founder."}</p>
      )}
      {message.requestId && (
        <p className={styles.errorReference}>{hi ? "संदर्भ" : "Reference"}: {message.requestId}</p>
      )}
    </div>
  );
}
