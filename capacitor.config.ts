import type { CapacitorConfig } from "@capacitor/cli";

// Production Android shell: the WebView loads the real production origin directly (server.url),
// sharing the exact same backend/database/auth/RBAC/Money Desk/ledgers/TA-DA/pricing as the web
// app — this is a native wrapper, not a second copy of the business logic. No localhost, no TEST
// DB, no preview deployment is ever reachable from this config.
const config: CapacitorConfig = {
  appId: "in.seeradetergent.sales",
  appName: "Seera",
  webDir: "public",
  server: {
    url: "https://www.seeradetergent.in",
    androidScheme: "https",
    cleartext: false,
    allowNavigation: ["www.seeradetergent.in", "seeradetergent.in"],
  },
  android: {
    allowMixedContent: false,
    // Not set explicitly: Capacitor's generated MainActivity already gates WebView debugging on
    // BuildConfig.DEBUG automatically, so it is on for debug builds (useful for our own UAT) and
    // off for release builds without needing to hardcode false here (which would disable it for
    // debug builds too and defeat the point of a debug APK).
  },
};

export default config;
