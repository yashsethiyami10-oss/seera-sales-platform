"use client";

import { useEffect, useState } from "react";

// Mounted once in AppShell (every /portal/* page). A no-op in every normal browser context —
// the entire body only runs when this exact page is loaded inside the Capacitor Android WebView
// (Capacitor.isNativePlatform()), so regular web/PWA usage (still the primary usage) is untouched.
//
// Why this exists: a plain Capacitor BridgeActivity with no JS-side back-button listener falls
// through to the default Android back-press behavior, which finishes the Activity — i.e. ANY
// hardware/gesture back press anywhere in the app (mid-order, mid-checkout) instantly exits the
// app with no confirmation and no chance to go back a screen first. @capacitor/app's 'backButton'
// event lets the web layer decide: step back through in-app history first, and only exit on a
// second press within 2s at the true root (double-back-to-exit is standard Android UX).
export function NativeShellBridge() {
  const [showExitHint, setShowExitHint] = useState(false);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    let hintTimer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform() || cancelled) return;

      const { App } = await import("@capacitor/app");
      let lastBackPressAt = 0;

      const handle = await App.addListener("backButton", ({ canGoBack }) => {
        // canGoBack comes from the native WebView's own back-stack (webView.canGoBack()), which
        // correctly reflects Next.js App Router's client-side pushState navigations too — no need
        // to reimplement that check in JS.
        if (canGoBack) {
          window.history.back();
          return;
        }
        const now = Date.now();
        if (now - lastBackPressAt < 2000) {
          void App.exitApp();
          return;
        }
        lastBackPressAt = now;
        setShowExitHint(true);
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => setShowExitHint(false), 2000);
      });

      cleanup = () => {
        void handle.remove();
        clearTimeout(hintTimer);
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  if (!showExitHint) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(17, 17, 17, 0.9)",
        color: "#fff",
        padding: "10px 18px",
        borderRadius: "999px",
        fontSize: "14px",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      Press back again to exit
    </div>
  );
}
