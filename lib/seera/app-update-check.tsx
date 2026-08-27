"use client";

import { useEffect, useState } from "react";

// Mounted once in AppShell alongside <NativeShellBridge />. A no-op in every normal browser/PWA
// context (Capacitor.isNativePlatform() guards the whole body) — this only ever runs inside the
// native Android shell.
//
// Compares the installed app's own numeric versionCode (never the versionName string) against
// /api/app/version. REQUIRED (current < minimumSupportedVersionCode) blocks usage with a
// full-screen message and no dismiss. OPTIONAL (current < latestVersionCode but still >=
// minimum) shows a small non-blocking "Later"-dismissible notice — field work is never
// interrupted for an optional update. See docs/seera/SEERA_ANDROID_RELEASE_STRATEGY.md for the
// full server-vs-native-release boundary this exists to communicate.
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=in.seeradetergent.sales";
const DISMISS_KEY = "seera:update-notice-dismissed";

type UpdateState = { kind: "required" | "optional"; latestVersionName: string } | null;

export function AppUpdateCheck({ language }: { language: "EN" | "HI" }) {
  const [state, setState] = useState<UpdateState>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform() || cancelled) return;

      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      const currentVersionCode = Number(info.build); // Android: build === versionCode
      if (!Number.isFinite(currentVersionCode) || cancelled) return;

      const res = await fetch(`/api/app/version?versionCode=${currentVersionCode}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { android: { latestVersionCode: number; minimumSupportedVersionCode: number; latestVersionName: string } };
      const { latestVersionCode, minimumSupportedVersionCode, latestVersionName } = data.android;

      if (currentVersionCode < minimumSupportedVersionCode) {
        setState({ kind: "required", latestVersionName });
      } else if (currentVersionCode < latestVersionCode) {
        setState({ kind: "optional", latestVersionName });
        try {
          if (sessionStorage.getItem(DISMISS_KEY) === latestVersionName) setDismissed(true);
        } catch {
          // sessionStorage unavailable — just don't persist the dismissal, not fatal.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const hi = language === "HI";

  if (state.kind === "required") {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 32,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 20, color: "#172554", margin: 0 }}>
          {hi ? "सीरा ऐप अपडेट आवश्यक है" : "Seera app update required"}
        </h1>
        <p style={{ color: "#475569", margin: 0, maxWidth: 320 }}>
          {hi
            ? "जारी रखने के लिए कृपया ऐप को नवीनतम संस्करण में अपडेट करें।"
            : "Please update the app to the latest version to continue."}
        </p>
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noreferrer"
          style={{
            minHeight: 48,
            minWidth: 160,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#b91c1c",
            color: "#fff",
            fontWeight: 700,
            borderRadius: 10,
            textDecoration: "none",
            padding: "0 24px",
          }}
        >
          {hi ? "ऐप अपडेट करें" : "Update App"}
        </a>
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 8,
        left: 8,
        right: 8,
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: "#eff6ff",
        border: "1px solid #93c5fd",
        borderRadius: 12,
        minHeight: 44,
      }}
    >
      <strong style={{ flex: 1, fontSize: 13, color: "#172554" }}>
        {hi ? "नया सीरा ऐप अपडेट उपलब्ध है" : "New Seera app update available"}
      </strong>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noreferrer"
        style={{ minHeight: 36, display: "inline-flex", alignItems: "center", padding: "0 12px", background: "#1d4ed8", color: "#fff", borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: "none" }}
      >
        {hi ? "अपडेट करें" : "Update"}
      </a>
      <button
        style={{ minHeight: 36, padding: "0 12px", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, fontWeight: 700, fontSize: 13 }}
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(DISMISS_KEY, state.latestVersionName);
          } catch {
            // sessionStorage unavailable — the notice will just reappear next load, not fatal.
          }
        }}
      >
        {hi ? "बाद में" : "Later"}
      </button>
    </div>
  );
}
