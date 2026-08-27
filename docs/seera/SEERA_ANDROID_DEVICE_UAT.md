# Seera Android — Physical Device UAT Script

**This has not been run.** Nothing in this document is a completed test result — it's the script
for the Founder (or a field rep, with the Founder's sign-off) to run on a real Android phone.
Build success, emulator testing, or code review does not substitute for this. Every item needs an
explicit PASS/FAIL against a real device on a real mobile network.

## Before you start

1. Get the APK onto the phone. Easiest path: connect the phone via USB with Developer
   Options → USB debugging enabled, then from this machine:
   `adb install android/app/build/outputs/apk/release/app-release.apk`
   (or the debug APK at `.../apk/debug/app-debug.apk` if you want the more permissive debug build
   for early testing — its WebView remote-debugging is enabled, useful for diagnosing issues via
   `chrome://inspect` on a connected desktop Chrome).
2. Use a **real SIM/mobile data connection** for at least the poor-network section below — Wi-Fi
   only testing will miss real field conditions.
3. Use a **real production account** for at least one Sales Executive — not a test/review account
   — so the data created is real and traceable.

## 1. Install & first launch

- [ ] APK installs without a Play Protect warning blocking install (a self-signed release cert can
      trigger a generic "unknown app" prompt outside Play Store — expected, not a bug; only
      escalate if it's flagged as literally malicious/tampered)
- [ ] App icon appears correctly on the home screen/app drawer (real Seera mark, not a placeholder)
- [ ] First launch shows the branded splash briefly, then loads the real login page from
      `www.seeradetergent.in` (check the URL bar isn't visible/doesn't matter — but confirm via
      behavior: login works exactly like the website)
- [ ] Login with a real Sales Executive account succeeds and lands on the correct portal

## 2. Core field workflow — Start Day → End Day

Run the full daily loop once, on a real retailer if possible (or a safe test-labeled one):

- [ ] **Start Day**: GPS permission prompt appears (first time only), granting it lets Start Day
      complete; location is captured (not silently failing — this exact bug was found and fixed
      earlier this session, verify it stays fixed on-device)
- [ ] **Check-In**: retailer check-in captures GPS successfully
- [ ] **Photo**: tapping photo capture opens the real camera app (not a broken permission dialog),
      taking a photo returns to the app correctly with the photo attached/uploading
- [ ] **Order**: create a real order line, confirm pricing displays correctly (spot-check against
      a known SKU's price on the website)
- [ ] **Checkout**: visit checkout completes
- [ ] **End Day**: end-of-day summary shows the correct counts for everything done above

## 3. Retry/idempotency — do this deliberately

- [ ] During Check-In, force-close the app (swipe away from recent apps) the instant you tap
      submit, then reopen — confirm you do NOT end up with two check-ins for the same visit
- [ ] Same test for Order submission — force-close mid-submit, reopen, confirm no duplicate order
- [ ] Same test for Checkout

## 4. App resume / interruption behavior

- [ ] Mid-visit (checked in, before checkout), lock the phone, wait 30+ seconds, unlock — app
      resumes to the correct in-progress state, not a blank/broken screen
- [ ] Mid-visit, switch to another app (e.g. Camera, Maps) then switch back — same check
- [ ] Mid-visit, force-close the app entirely via Android's recent-apps/force-stop, then reopen the
      app from the home screen icon — confirm it correctly resumes the same active visit rather
      than losing track of it or showing stale/wrong data (this is the "process killed by OS"
      scenario — the real-world equivalent of low memory on a budget field-rep device)
- [ ] After taking a photo, confirm returning from the camera app back to Seera works cleanly (no
      crash, no lost screen state)

## 5. Poor network — FOUNDER REQUIRED, cannot be simulated from this environment

- [ ] Turn on Airplane Mode, then attempt Check-In — confirm the app shows a clear "queued, will
      sync" message rather than a confusing error or silent failure
- [ ] With Airplane Mode still on, attempt an Order — same check
- [ ] Turn Airplane Mode back off, confirm the queued actions sync automatically (or via the
      "Sync now" button on the offline-status indicator) within a reasonable time, and that the
      pending-sync count visible on screen goes to zero
- [ ] Find a real low-signal spot (or use a network-throttling option if the device supports it)
      and repeat Check-In/Order there — confirm behavior is reasonable (queues rather than hanging
      indefinitely)
- [ ] Confirm the offline/pending-sync indicator is visible on the actual field-workflow screen
      (not just the portal home page) throughout — this was a real gap found and fixed this pass

## 6. Back button & navigation

- [ ] From the portal home screen, press the hardware/gesture back button once — confirm you see
      "Press back again to exit" rather than the app closing immediately
- [ ] Press back again within ~2 seconds — app exits
- [ ] From several screens deep (e.g. mid-Order), press back once — confirm it steps back one
      screen within the app (not exiting, not doing nothing)

## 7. Deep links

- [ ] Send yourself a link to `https://www.seeradetergent.in/portal/sales-executive` (e.g. via
      WhatsApp/SMS to yourself) and tap it on the device with the app installed — confirm it opens
      directly in the Seera app, not the browser (may take a few hours after Play Store publish for
      Android's automatic verification to complete — if it opens in browser immediately after
      installing a sideloaded APK, that's expected until verification completes, not a failure)

## 8. Real device/OS spread (if more than one device is available)

- [ ] Test on at least one budget/older Android device if the field team uses them, not just a
      flagship — confirm acceptable performance and that nothing requires a newer Android version
      than field devices actually run (minSdkVersion is 24 = Android 7.0, but the real field
      device fleet's actual OS versions should be spot-checked against this)

## Sign-off

Do not mark "READY FOR FOUNDER PHONE TEST: YES" as delivered/complete until every checkbox above
has a real PASS recorded against a real device. Record failures with enough detail (device model,
Android version, exact steps, screenshot if possible) to hand back for a fix — don't just mark FAIL
with no repro detail.
