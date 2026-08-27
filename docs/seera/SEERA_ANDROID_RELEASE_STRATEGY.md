# Seera Android Release Strategy

Status: V1 code-complete, physical-device UAT pending (Founder-required).
Baseline commit: `ff74e74` + the offline/back-button/App-Links/size work in this pass.

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

## Update strategy

Because the app is a thin remote-loading shell, **the overwhelming majority of product changes
need no app update at all** — a Server Action fix, a new portal screen, a pricing rule change, a
UI tweak all ship the instant they're deployed to `www.seeradetergent.in`, exactly like the
browser/PWA experience, with zero Play Store review wait. A new APK/AAB build (and Play Store
release) is only needed when the **native shell itself** changes: permissions, app icon/splash,
back-button/App-Links native behavior, minimum Android version, or adding a new native plugin
(e.g. push notifications in Phase 1.1). Bump `versionCode`/`versionName` in
`android/app/build.gradle` for each such release; the web app's own versioning is independent and
unaffected.
