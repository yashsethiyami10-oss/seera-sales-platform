"use client";
import type { ReactNode } from "react";
import styles from "./ProtectedData.module.css";

// View-only wrapper for customer data shown to partners (Distributor / Super Stockist / Retailer
// portals). The data is visible for daily work but is not offered as a download: no export
// buttons exist for it server-side, and in the browser this blocks text selection, copy / cut,
// the right-click "Save" menu, drag-out and printing of this block.
// Honest limit: nothing in a web page can stop a phone screenshot or a camera photo of the screen.
export function ProtectedData({ language, children, className }: { language: "EN" | "HI"; children: ReactNode; className?: string }) {
  const hi = language === "HI";
  const block = (e: { preventDefault: () => void }) => e.preventDefault();
  return (
    <div
      className={`${styles.protected} ${className ?? ""}`}
      data-protected="customer-data"
      onCopy={block}
      onCut={block}
      onContextMenu={block}
      onDragStart={block}
    >
      {children}
      <p className={styles.note}>🔒 {hi ? "ग्राहक डेटा सिर्फ़ देखने के लिए है — कॉपी / डाउनलोड / प्रिंट बंद है।" : "Customer data is view-only — copy, download and print are disabled."}</p>
      <p className={styles.printNote}>{hi ? "गोपनीय ग्राहक डेटा — प्रिंट की अनुमति नहीं" : "Confidential customer data — printing is not permitted"}</p>
    </div>
  );
}
