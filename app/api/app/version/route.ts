import { NextResponse } from "next/server";
import { ANDROID_APP_VERSION_POLICY } from "@/lib/seera/android-app-version-policy";

// Public, unauthenticated, read-only — same class of route as app/api/health/*. Returns only
// non-sensitive version metadata; no secrets, no per-user data. The native Android shell (see
// lib/seera/app-update-check.tsx) polls this to decide REQUIRED vs OPTIONAL vs no update, always
// comparing numeric versionCode — never the human-readable versionName string.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const callerVersionCode = Number(searchParams.get("versionCode"));
  const hasCallerVersion = Number.isFinite(callerVersionCode) && callerVersionCode > 0;

  return NextResponse.json(
    {
      android: {
        latestVersionCode: ANDROID_APP_VERSION_POLICY.latestVersionCode,
        latestVersionName: ANDROID_APP_VERSION_POLICY.latestVersionName,
        minimumSupportedVersionCode: ANDROID_APP_VERSION_POLICY.minimumSupportedVersionCode,
        // Only meaningful when ?versionCode= is passed (the native shell always passes its own).
        // Without it there is nothing to compare against, so this defaults to false rather than
        // guessing — callers that care must supply their own versionCode.
        updateRequired: hasCallerVersion ? callerVersionCode < ANDROID_APP_VERSION_POLICY.minimumSupportedVersionCode : false,
      },
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
