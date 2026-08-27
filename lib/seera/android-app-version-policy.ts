// Bump ONLY when cutting a new native Android release (a new signed APK/AAB actually uploaded to
// Play Store) — never for a server-only web deployment. See docs/seera/
// SEERA_ANDROID_RELEASE_STRATEGY.md's "CHANGE TYPE" table for the full server-vs-native boundary.
//
// minimumSupportedVersionCode intentionally starts equal to latestVersionCode: since versionCode
// 1 is the only build that has ever existed, every installed app is trivially compliant (1 >= 1)
// — the required-update gate is real code, wired end-to-end, but genuinely inert until a Founder
// deliberately raises this floor after a second native release exists and an older one needs to
// be retired. Never raise it just because a newer version was published — only when an older
// build has become truly incompatible (e.g. a breaking manifest/permission change).
export const ANDROID_APP_VERSION_POLICY = {
  latestVersionCode: 1,
  latestVersionName: "1.0.0",
  minimumSupportedVersionCode: 1,
} as const;
