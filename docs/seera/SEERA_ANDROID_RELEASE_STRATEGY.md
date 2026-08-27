# Seera Android Release Strategy

Status: V1 code-complete, physical-device UAT pending (Founder-required).
Baseline commit: `ff74e74` + offline/back-button/App-Links/size work + mobile Logout fix and
server-driven app-update architecture (this pass).

## What this app is

A Capacitor native shell (`android/`) wrapping the production web app in a WebView. It is
**not** a second implementation — `capacitor.config.ts`'s `server.url` points the WebView
directly at `https://www.seeradetergent.in`, so every screen, Server Action, and API route the
app uses is the exact same code path the browser/PWA uses. There is no bundled local build of the
Next.js app inside the APK/AAB (see "Why webDir is not `public`" below) — the app has nothing to
update independently of the website except native shell concerns (permissions, icons, back-button
behavior, deep links).

Package: `in.seeradetergent.sales`. Version: `1.0.0` (`versionCode 1`).

## Environment safety

Production builds only ever reach `https://www.seeradetergent.in`. There is no build flavor, no
env var, and no code path that points the app at `localhost`, a TEST database, or a Vercel preview
deployment — `capacitor.config.ts`'s `server.url` is a single hardcoded value, and
`allowNavigation` is scoped to `www.seeradetergent.in` / `seeradetergent.in` only.

## Why `webDir` is not `public`

Capacitor requires a local `webDir` to exist even in `server.url` mode (it's copied into the APK
as a fallback/placeholder), but the Bridge always navigates to `server.url` on launch when it's
set (confirmed in `node_modules/@capacitor/android` `Bridge.java`: `appUrl = server.url`, always
loaded — the only fallback path is `errorUrl` for a device whose WebView is too old to run at all,
unrelated to `webDir` content). Pointing `webDir` at the Next.js project's shared `public/` folder
— the obvious first choice, and what the initial scaffold did — silently bundled the *entire*
shared public folder (~72MB, mostly MUV storefront hero imagery that this field app never
touches) into every APK/AAB build for zero functional benefit. Fixed by pointing `webDir` at
`android-webview-shell/`, a dedicated ~2KB directory containing one branded loading page that is
never actually shown except in the WebView-too-old edge case. This dropped `assets/public` in the
built APK from 73MB to 4KB.

## Permissions

`CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `INTERNET` — nothing else. Verified
repo-wide (no `getUserMedia`, no continuous `watchPosition`, no contacts/SMS/call-log/microphone
API usage anywhere in the field workflow). Photo capture uses `<input type="file" capture>`
(native camera intent handoff, doesn't require the CAMERA permission on most devices but declared
for the guaranteed-camera-app path); GPS is one-shot checkpoint capture only
(`components/seera/product/gps.tsx`, `getCurrentPosition`, never background tracking).

## Signing

Release keystore: `seera-release` alias, RSA 2048, ~27-year validity, generated locally and
handed to the Founder directly (password shown once in chat, never written to any persisted file
or committed). **The Founder holds the only copy of the keystore and password from this point
on** — losing both permanently loses the ability to publish updates to this app under
`in.seeradetergent.sales` on Play Store. Back up both (keystore file + password) somewhere durable
and outside this machine.

`android/app/build.gradle`'s release `signingConfig` reads from `android/keystore.properties`
(gitignored, machine-local). A machine without that file still builds `assembleDebug` fine —
only `assembleRelease`/`bundleRelease` need it present.

## Native-shell JS bridge

`lib/seera/native-shell-bridge.tsx` (`<NativeShellBridge />`, mounted once in `AppShell.tsx`,
which every `/portal/*` page renders) is the one piece of Capacitor-JS-aware code in the actual
web app. It is a no-op in every normal browser/PWA context (`Capacitor.isNativePlatform()` guards
the entire body) and only does one thing: implements Android hardware back-button handling —
step back through in-app history first (via the WebView's own `canGoBack()`, which correctly
reflects Next.js App Router's client-side navigation), and require a second press within 2s to
actually exit at the true root ("press back again to exit"). Without this, a plain
`BridgeActivity` with no JS-side listener exits the app on the very first back press anywhere,
including mid-order or mid-checkout.

## Android App Links

`https://www.seeradetergent.in/portal/...` opens directly in the app (no browser chooser) once
Google verifies `public/.well-known/assetlinks.json` against the app's signing certificate.
Configured via `android:autoVerify="true"` on a `VIEW`/`BROWSABLE` intent-filter scoped to
`/portal` only in `AndroidManifest.xml` — storefront/blog links are deliberately left alone and
open in the browser as before.

`assetlinks.json` lists two SHA-256 cert fingerprints: the real release signing cert (for
production installs) and Capacitor/Android's standard auto-generated debug keystore fingerprint
(so `adb install`-ed debug builds during UAT also get App Links working, not just the signed
release). Verification is asynchronous after publish — Google typically confirms within minutes to
a few hours; until then, links open in the browser as a safe fallback (standard Android behavior,
not a bug).

## Offline / poor-network architecture (already existed, audited not rebuilt)

Every gated field action (Start Day, Check-In, Order, Checkout, End Day) routes through a
`runOrQueue()` wrapper in `FieldJourney.tsx` that queues to IndexedDB
(`lib/phase-11/offline-client.ts`) on `navigator.onLine === false` or a network-level fetch
failure, and replays via `/api/offline/sync` when connectivity returns. Server-side,
`syncOfflineOperation` deduplicates every queued operation by a unique
`(userId, clientOperationId)` key before ever re-dispatching it — this is a general mechanism
covering every queueable action type uniformly, on top of which check-in, checkout, and order
creation each carry their own DB-level idempotency key/upsert as a second, independent guard (so
the direct/online path — not just the offline-queue replay path — is also duplicate-safe). Full
findings: see the audit summary in this project's session history; the one fix made in this pass
was mounting the existing `OfflinePendingStatus` indicator (`components/seera/phase-11/
OfflineStatus.tsx`) on the actual field-workflow screen (`OperationalWorkspace.tsx`, next to
`<FieldJourney>`) — it previously only rendered on the portal index page, so a rep mid-visit had
no persistent way to see "am I offline right now / how many actions are still unsynced."

**Known residual gap, not fixed in this pass (flagged, not silently ignored):** photo
upload/finalize is not itself a queueable offline action — a network failure during photo upload
fails synchronously with an explicit "Photo is NOT saved yet, please retake" message rather than
queueing for background retry. This is a deliberate existing design (photos are large binary
payloads, unlike small JSON drafts) but means a rep who loses signal mid-upload must manually
retry once connectivity returns, rather than it happening automatically. Worth a future pass if
field reports show this as a real friction point; not blocking V1.

## App resume / process recreation

`FieldJourney` receives session/visit state as **props from a server-rendered page**, not
reconstructed client-side state — `OperationalWorkspace.tsx` re-derives "what visit am I in" from
a fresh Prisma query (`checkedOutAt: null`) on every page load. Since an Android WebView reloads
its last URL after the OS kills the process and the user reopens the app, this resume path is
correct by construction: there's no separate client-side "restore session" logic to get wrong,
because the server is always asked for current truth on (re)load. The offline queue itself lives
in IndexedDB (durable storage), so any operations queued before a process kill are not lost either.

## Push notifications — explicitly Phase 1.1

Not implemented in V1, by design (per Founder direction: don't delay V1 for this). No
`@capacitor/push-notifications` dependency, no FCM configuration, no `google-services.json`.
`android/app/build.gradle` already has a defensive `try/catch` around the Google Services plugin
apply so its absence doesn't break any build.

## Known size/perf tradeoff not addressed

`minifyEnabled` is `false` and R8/ProGuard shrinking is off. This keeps the APK/AAB larger than a
minified build would be (`classes.dex` is ~6.8MB, mostly AndroidX + Capacitor/Cordova plugin
bridge code) but avoids the real risk of ProGuard breaking reflection-based plugin loading without
carefully hand-tuned keep rules — deliberately not attempted in this pass per explicit instruction
not to trade field reliability for size. Play Store's own dynamic delivery (AAB → per-device APK
splits) already means no single install downloads unused ABI/density resources regardless of this
setting.

## Mobile Logout fix — proof this architecture actually works

The mobile Logout visibility/accessibility fix (header overflow risk on narrow screens hiding the
user/logout menu; the menu trigger had no `aria-label`, so a screen reader announced nothing
useful once the name text is hidden on mobile) was implemented entirely in
`components/seera/foundation/AppShell.tsx` and `AppShell.module.css` — no native code, no new
Capacitor plugin, no AndroidManifest change. It ships the moment it's deployed to
`www.seeradetergent.in`; **the currently-installed APK gets it on its next reload, with no
reinstall**, because the WebView always loads that live URL (`server.url` in
`capacitor.config.ts`) rather than a bundled copy of the UI. Verified directly (not just reasoned
about): logged in against a local server as a review Sales Executive at a 360px mobile viewport,
confirmed no horizontal header overflow, confirmed the user-menu trigger now has a real
`aria-label` ("Sales Executive North One — My profile / Sign out"), confirmed tapping it reveals a
fully on-screen Sign out button, then exercised the actual logout end-to-end: session cookie is
cleared, `POST /api/auth/logout` revokes the session server-side (`revokeSession(...)`, a real DB
write, not just a cookie clear), browser Back after logout lands on `/login?next=...` (never a
cached dashboard — enforced by `/portal/*`'s `Cache-Control: private, no-store, max-age=0`, which
also blocks Chromium bfcache), and a direct fetch of a protected portal route after logout returns
a 307 redirect to login, confirmed server-side, not just a client-side UI illusion. Only the
`page.goto`/`page.request` origin was `localhost` (a local dev server) — the fix itself is the
literal file that's already deployed to production and live-verified separately (see "Server
changes deployed this pass" below).

## Server-driven app: what needs a new APK/AAB and what doesn't

The app is deliberately a thin native shell, not a second implementation of Seera. Nearly
everything a Founder or field rep actually experiences — dashboards, navigation, role menus,
Logout placement, forms, retailer/order workflow UI, Money Desk, ledgers, reports, pricing/business
rules, TA/DA presentation, most validation, every backend API, server-side security fixes,
responsive layout — is server-rendered HTML/CSS/JS loaded fresh from `www.seeradetergent.in` on
every page view, exactly like the browser/PWA experience. None of it is duplicated into native
Android code, and none of it needs a new Play Store release to change.

A new APK/AAB is required only when the **native shell itself** changes — anything that has to be
compiled into the Android binary or declared in `AndroidManifest.xml`:

| Change type | Server deploy only | New APK/AAB required |
|---|---|---|
| Logout button position/visibility | ✅ | |
| Money Desk UI | ✅ | |
| Pricing rule | ✅ | |
| TA/DA logic/presentation | ✅ | |
| Dashboards, navigation, role menus | ✅ | |
| Retailer/order workflow forms | ✅ | |
| Reports, ledgers, statements | ✅ | |
| Most validation, backend APIs | ✅ | |
| Server security fixes (e.g. the geolocation Permissions-Policy P0 fix) | ✅ | |
| Responsive/mobile layout changes | ✅ | |
| Launcher icon | | ✅ |
| Splash screen | | ✅ |
| Android permissions (Camera/GPS/etc.) | | ✅ |
| `AndroidManifest.xml` changes | | ✅ |
| Adding/changing a Capacitor/native plugin | | ✅ |
| Native camera behavior changes | | ✅ |
| Native geolocation plugin changes (not the web `navigator.geolocation` call itself) | | ✅ |
| Native share-sheet behavior | | ✅ |
| App Links intent-filter changes | | ✅ |
| Push notifications (Phase 1.1) | | ✅ |
| Minimum/target Android SDK version | | ✅ |
| Native security configuration | | ✅ |
| `applicationId` | | ✅ (never change this — see Version 1 policy below) |
| Signing key/config | | ✅ (never change signing identity) |
| Any Java/Kotlin native code | | ✅ |

This is a hard architecture rule, not a guideline: do not duplicate server-driven features into
native Android code "for speed" or "for offline" — the existing IndexedDB offline-queue
architecture (see above) already covers the real offline need without native duplication.

## App update system (versionCode-based, Play-Store-governed)

`GET /api/app/version` (`app/api/app/version/route.ts`) is a public, unauthenticated, read-only
endpoint — same class as `/api/health/*` — returning only non-sensitive version metadata:

```json
{ "android": { "latestVersionCode": 1, "latestVersionName": "1.0.0", "minimumSupportedVersionCode": 1, "updateRequired": false } }
```

Values come from `lib/seera/android-app-version-policy.ts`, a small hand-edited constants module —
**not** a database table or admin UI, deliberately, since these numbers change only when a
developer cuts an actual new native release (see Version 1 policy below), which is rare and always
a manual, deliberate act.

`lib/seera/app-update-check.tsx` (mounted in `AppShell.tsx` alongside `NativeShellBridge`, native-only
no-op everywhere else) reads the app's own `versionCode` via `@capacitor/app`'s `App.getInfo()`
(`build` field — Android's `versionCode`, confirmed from `@capacitor/app`'s own type definitions),
fetches `/api/app/version?versionCode=<current>`, and compares **numeric versionCode only** —
never the `versionName` string, exactly as specified:

- **REQUIRED update** (`current < minimumSupportedVersionCode`): full-screen, non-dismissible
  overlay ("Seera app update required" / Hindi equivalent) with an "Update App" button linking to
  the Play Store listing. No bypass.
- **OPTIONAL update** (`minimumSupportedVersionCode <= current < latestVersionCode`): small
  non-blocking bottom banner ("New Seera app update available") with "Update" / "Later" — "Later"
  is remembered for the session (`sessionStorage`) so it doesn't nag on every navigation. Field
  work is never interrupted.
- Neither state renders if `current >= latestVersionCode`.

**Architecture prepared, not activated as blocking in production**, per instruction: since
versionCode `1` is the only build that has ever existed, `minimumSupportedVersionCode` currently
equals `latestVersionCode` (both `1`) — every installed app is trivially compliant today, so the
required-update path is real, wired, end-to-end-testable code that simply has nothing to block yet.
It becomes a real floor only when a Founder deliberately raises `minimumSupportedVersionCode` after
a second native release exists and an older one needs to be retired — never automatically, never
just because a newer version was published.

The Play Store URL (`https://play.google.com/store/apps/details?id=in.seeradetergent.sales`) is
hardcoded now even though no listing exists yet — a stable placeholder that starts working the
moment the app is actually published, with no code change needed later.

**Not built, deliberately**: no OTA/dynamic native-code update system. Native binary updates are
Play-Store-governed only — this app will never download and swap in native code outside Google
Play. Business/UI content updates through the existing server architecture described above; native
shell updates go through Play Store, full stop.

**One nuance worth recording**: the update-check feature itself depends on `@capacitor/app`, a
native plugin already compiled into the APK from the back-button work earlier in this same pass —
so it did not by itself require yet another native release on top of that. This is exactly the
distinction the table above exists to make precise: adding a *new* native plugin capability is a
native-release event; writing more JS that *uses* a capability already present in the installed
build is not.

## Version 1 policy

`applicationId` (`in.seeradetergent.sales`) and the signing identity (`seera-release` keystore) are
permanent — never change either for any future release; doing so would make the app appear as a
different application to both Android and Play Store, breaking every existing install's ability to
update. For the next native build, increment `versionCode` in `android/app/build.gradle` (and
`android/keystore.properties`/the release keystore stay exactly as already generated). Do **not**
bump `versionCode` for a server-only web deployment — per the table above, that's the overwhelming
majority of changes and none of them touch the native shell at all.

## Play Store distribution model (once a listing exists)

Team members should not manually download/sideload APKs for routine releases once Play Store
distribution is live — see `docs/seera/SEERA_ANDROID_PLAY_STORE_CHECKLIST.md` for the full
submission checklist. Release track progression: **Internal testing → Closed testing →
Production**. For each native update: upload the new signed AAB, increment `versionCode`, publish
— the team receives it as a normal Play Store update, no manual distribution needed.
