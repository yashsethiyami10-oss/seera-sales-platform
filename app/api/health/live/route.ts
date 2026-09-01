import { NextResponse } from "next/server";
// VERCEL_GIT_COMMIT_SHA/_MESSAGE and VERCEL_DEPLOYMENT_ID are populated automatically by Vercel at
// build time (not secrets — the commit itself is already public in git history) — exposing them
// here is the direct, objective answer to "is production actually running the commit I think it
// is", which repeatedly could not be answered otherwise (Android's APK is a thin shell that only
// ever loads this production origin — see capacitor.config.ts — so this endpoint also answers that
// question for the APK, with no Android build/rebuild involved).
export async function GET(){return NextResponse.json({status:"alive",app:"seera-sales-distribution-os",commitSha:process.env.VERCEL_GIT_COMMIT_SHA??null,commitMessage:process.env.VERCEL_GIT_COMMIT_MESSAGE??null,deploymentId:process.env.VERCEL_DEPLOYMENT_ID??null},{headers:{"Cache-Control":"no-store"}});}
