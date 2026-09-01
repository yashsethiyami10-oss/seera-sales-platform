import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const journey = readFileSync("components/seera/product/FieldJourney.tsx", "utf8");
const settings = readFileSync("android/capacitor.settings.gradle", "utf8");
const build = readFileSync("android/app/capacitor.build.gradle", "utf8");
const gradle = readFileSync("android/app/build.gradle", "utf8");
const pkg = readFileSync("package.json", "utf8");

describe("Android native camera regression", () => {
  it("does not use the HTML capture button as the native Android camera path", () => {
    expect(journey).toContain('Capacitor.isNativePlatform()');
    expect(journey).toContain('Camera.takePhoto(');
    expect(journey).toContain('appRestoredResult');
    expect(journey).toContain('seera:camera-pending:');
    expect(journey).toContain('quality: 88');
    expect(journey).toContain('targetWidth: 2048');
    expect(journey).toContain('targetHeight: 2048');
    expect(journey).toContain('const MAX_FINAL_UPLOAD_BYTES = 10_000_000;');
    expect(journey).toContain('const uploadBlob = blob;');
    expect(journey).toContain('Do not render the full-resolution camera blob before upload.');
    expect(journey).toContain('uploadFieldPhotoDirect(visit.id, capturePhotoType, uploadBlob, signedOverride)');
  });

  it("registers the Capacitor camera plugin in the Android project", () => {
    expect(settings).toContain("include ':capacitor-camera'");
    expect(build).toContain("implementation project(':capacitor-camera')");
    expect(pkg).toContain('"@capacitor/camera": "^8.2.2"');
  });

  it("bumps the Android build version for the native camera fix", () => {
    expect(gradle).toContain("versionCode 3");
    expect(gradle).toContain('versionName "1.0.2"');
  });
});

