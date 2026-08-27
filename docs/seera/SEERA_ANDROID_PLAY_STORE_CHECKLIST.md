# Seera Android — Play Store Submission Checklist

Use this when the Founder is ready to actually submit to Play Store. Nothing here has been
submitted — this is preparation only.

## Already done

- [x] Signed release AAB built and verified (`android/app/build/outputs/bundle/release/app-release.aab`)
- [x] Package name reserved in code: `in.seeradetergent.sales`
- [x] App icon (all densities, adaptive foreground/background) generated from real Seera branding
- [x] Splash screen generated from real Seera branding
- [x] Minimal permission set (Camera, GPS, Internet) — matches what Play Console's Data Safety
      form should declare
- [x] Signing keystore generated, custody handed to Founder, `keystore.properties` gitignored
- [x] Security audit: release APK/AAB contain zero secrets (`DATABASE_URL`, tokens, worker
      secrets, keystore password, `.env` files, private keys — all checked, all absent)
- [x] `android:autoVerify` App Links + `assetlinks.json` for `www.seeradetergent.in/portal/*`

## Founder/account-level items (cannot be done from this environment)

- [ ] Google Play Console developer account (one-time $25 registration if not already held)
- [ ] Play Console app listing created for `in.seeradetergent.sales`
- [ ] Store listing content: short description, full description, screenshots (phone + optionally
      tablet), feature graphic (1024×500), app icon (512×512 — can be regenerated from
      `public/icons/seera.svg` at that size)
- [ ] Privacy policy URL — this app requests Camera + Location; Play Console **requires** a
      published privacy policy URL covering that before the listing can go live. Check whether
      `https://www.seeradetergent.in/privacy` (referenced in the web app's route structure per
      CLAUDE.md) already covers native-app camera/location use, or needs an addendum
- [ ] Data Safety form (Play Console) — declare: Location (collected, used for app functionality —
      checkpoint GPS on visit actions — not shared with third parties, not used for ads), Photos
      (collected, used for app functionality — retailer visit documentation, uploaded to
      Cloudinary), no other data categories collected by the native shell itself (auth/orders/
      Money Desk data flows through the existing web backend under the existing privacy policy,
      not through anything new the native shell adds)
- [ ] Content rating questionnaire (this is an internal B2B field-sales tool — rate accordingly,
      not a consumer app)
- [ ] Target audience / Play Families declaration — not applicable, internal employee-only tool
- [ ] App access: since this app requires login (no anonymous/demo mode), Play Console review
      needs **test credentials** to review the app — provide a real or dedicated review account
      (do not reuse a Founder's personal production login for this)
- [ ] Decide release track: **Internal testing** track first (fast, no review wait, exactly the
      right fit for Founder + field team device UAT before any public listing) → Closed testing
      (if piloting with more field staff before general release) → Production
- [ ] Country/region availability (likely India-only given the business, but confirm)

## Before uploading the AAB to Play Console

- [ ] Re-confirm `versionCode`/`versionName` in `android/app/build.gradle` match what's intended
      for this release (currently `1` / `"1.0.0"`)
- [ ] Re-run the full build from a clean state (`./gradlew clean bundleRelease`) immediately before
      upload, so the uploaded artifact is guaranteed to match the exact commit being shipped
- [ ] Google requires **Play App Signing** — when uploading the AAB for the first time, Play
      Console will ask to either let Google manage the app signing key (recommended, Google
      re-signs the app for distribution using their own key, your upload key just proves you're
      the same developer on future updates) or use your own. Recommended: let Google manage it,
      and keep the `seera-release.jks` upload key safe regardless — it's still required for every
      future upload.

## Post-submission

- [ ] Once Internal Testing track is live, confirm the App Links verification actually resolved
      (a real device install should open `https://www.seeradetergent.in/portal/...` links directly
      in the app, not a browser chooser — if it doesn't, check the `assetlinks.json` fingerprint
      matches Play App Signing's re-signed cert, not just the local upload key, once Google-managed
      signing is enabled, since Play re-signs the app with a different cert than the upload key)
- [ ] Monitor Play Console's pre-launch report (automated device/OS matrix testing Google runs on
      every upload) for crashes Founder-device UAT might not catch
