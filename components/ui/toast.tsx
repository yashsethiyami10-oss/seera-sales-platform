"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

/**
 * MUV OS™ refinement pass — `tone` is additive and optional. Every existing
 * `showToast("message")` call site (storefront, admin, etc.) is unaffected
 * — it still renders the original white pill. Only a caller that opts in
 * with `showToast("message", { tone: "dark" })` gets the dark variant,
 * which right now is just MUV OS's own components (see
 * styles/globals.css's `.muv-toast-dark` for why: the white pill is
 * deliberate site-wide branding elsewhere, but wrong for MUV OS's own
 * explicit all-dark requirement).
 */
type ToastOptions = { tone?: "light" | "dark" };
type ToastContextValue = { showToast: (message: string, options?: ToastOptions) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/**
 * Mounted once in the root layout. Every original .jsx file implemented its
 * own `const [toast, setToast] = useState(null)` + `showToast` + a
 * `<div className="muv-toast">` — one provider here replaces all of that
 * duplicated state and markup.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"light" | "dark">("light");
  const [leaving, setLeaving] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((msg: string, options?: ToastOptions) => {
    clearTimeout(hideTimerRef.current);
    clearTimeout(removeTimerRef.current);
    setLeaving(false);
    setMessage(msg);
    setTone(options?.tone ?? "light");
    // Previously cleared `message` directly after 2200ms, so the toast
    // vanished instantly instead of reversing its entrance. Now plays
    // .muv-toast-leaving (250ms, styles/globals.css) first and only removes
    // the element from the DOM once that's had time to finish.
    hideTimerRef.current = setTimeout(() => {
      setLeaving(true);
      removeTimerRef.current = setTimeout(() => {
        setMessage(null);
        setLeaving(false);
      }, 250);
    }, 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message && (
        <div className={`muv-toast${tone === "dark" ? " muv-toast-dark" : ""}${leaving ? " muv-toast-leaving" : ""}`}>
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
