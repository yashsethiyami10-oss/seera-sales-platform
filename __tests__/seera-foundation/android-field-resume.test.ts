import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const activity = readFileSync("android/app/src/main/java/in/seeradetergent/sales/MainActivity.java", "utf8");
const gradle = readFileSync("android/app/build.gradle", "utf8");

describe("Android field-workflow resume", () => {
  it("persists and restores the last governed portal route", () => {
    expect(activity).toContain("last_portal_url");
    expect(activity).toContain('path.startsWith("/portal")');
    expect(activity).toContain("webView.loadUrl(");
    expect(activity).toContain("onPause()");
    expect(activity).toContain('"https://" + PROD_HOST + savedPath');
  });

  it("does not persist arbitrary external URLs", () => {
    expect(activity).toContain('!"https".equalsIgnoreCase(uri.getScheme())');
    expect(activity).toContain('PROD_HOST.equalsIgnoreCase(host)');
    expect(activity).toContain('PROD_HOST_NO_WWW.equalsIgnoreCase(host)');
  });

  it("keeps the current Android version source of truth", () => {
    expect(gradle).toContain("versionCode 3");
    expect(gradle).toContain('versionName "1.0.2"');
  });
  it("checkpoints the active visit before native camera launch", () => {
    const journey = readFileSync("components/seera/product/FieldJourney.tsx", "utf8");
    expect(journey).toContain("checkpointActiveVisitInUrl(visit.id)");
    expect(journey).toContain('url.searchParams.set("activeVisitId", visitId)');
    expect(journey).toContain("quality: 85");
  });

  it("reconstructs the checkpoint only inside the employee active work session", () => {
    const workspace = readFileSync("components/seera/product/OperationalWorkspace.tsx", "utf8");
    expect(workspace).toContain("const activeVisitId = (query.activeVisitId ?? \"\").trim() || undefined;");
    expect(workspace).toContain("workSessionId: sessionForContext.id");
    expect(workspace).toContain("checkedOutAt: null");
    expect(workspace).toContain("...(activeVisitId ? { id: activeVisitId } : {})");
  });

});
