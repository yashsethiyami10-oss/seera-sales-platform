"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./WorkflowActions.module.css";

export type RowAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  disabled?: boolean;
  title?: string;
  tone?: "primary" | "danger";
};

// Final Master Revision (Part 11/12, 22-Aug): the Founder's own complaint was a "wall of buttons" —
// Quotation's ISSUED row alone showed Accept/Reject/Expire/Duplicate/Download/Send all inline at
// once. One PRIMARY action (the one thing this status most wants next) stays a visible button;
// everything else collapses into a "More" menu — matching the exact DRAFT/ISSUED/ACCEPTED/
// CONVERTED action grouping the Founder specified. Shared by QuotationActions.tsx and
// BillingActions.tsx (Part 12: same presentation for Distributor and S.S. documents, issuer-
// specific data only) rather than two separately-maintained button lists.
export function DocumentRowActions({ primary, secondary }: { primary: RowAction | null; secondary: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const renderAction = (a: RowAction, closeOnClick: boolean) =>
    a.href ? (
      <a
        key={a.label}
        href={a.href}
        target={a.external ? "_blank" : undefined}
        rel={a.external ? "noreferrer" : undefined}
        style={closeOnClick ? { display: "block", padding: "6px 10px", whiteSpace: "nowrap" } : undefined}
        onClick={closeOnClick ? () => setOpen(false) : undefined}
      >
        {a.label}
      </a>
    ) : (
      <button
        key={a.label}
        type="button"
        disabled={a.disabled}
        title={a.title}
        className={a.tone === "primary" ? styles.primaryBig : a.tone === "danger" ? styles.dangerBig : undefined}
        style={closeOnClick ? { display: "block", width: "100%", textAlign: "left", padding: "6px 10px", whiteSpace: "nowrap", background: "none", border: "none" } : undefined}
        onClick={() => {
          a.onClick?.();
          if (closeOnClick) setOpen(false);
        }}
      >
        {a.label}
      </button>
    );

  return (
    <div className={styles.inlineActions} style={{ position: "relative" }}>
      {primary && renderAction(primary, false)}
      {secondary.length > 0 && (
        <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            More ⋮
          </button>
          {open && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "100%",
                zIndex: 20,
                background: "#fff",
                border: "1px solid #d8dbe0",
                borderRadius: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                marginTop: 4,
                overflow: "hidden",
              }}
            >
              {secondary.map((a) => renderAction(a, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
