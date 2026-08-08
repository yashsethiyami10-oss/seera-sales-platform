"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Previously `onClose` unmounted this component immediately — the entrance
  // transition (opacity/scale, driven by `shown`) had no reverse counterpart,
  // so closing always snapped away instead of reversing. This plays the same
  // transition backward first (350ms, matching .muv-modal-panel's own
  // duration in styles/globals.css), then calls the real `onClose` the
  // parent passed in — no call site needs to change.
  function handleClose() {
    setShown(false);
    setTimeout(onClose, 350);
  }

  return (
    <div className="muv-modal-backdrop" style={{ opacity: shown ? 1 : 0 }} onClick={handleClose}>
      <div
        className="muv-modal-panel"
        style={{ opacity: shown ? 1 : 0, transform: shown ? "scale(1)" : "scale(0.97)", maxWidth: wide ? "760px" : "520px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-lg muv-text-solid">{title}</h3>
          <button onClick={handleClose} className="muv-icon-circle" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
