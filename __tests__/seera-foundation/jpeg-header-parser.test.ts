import { describe, expect, it } from "vitest";
import { parseJpegHeader, orientedUploadTarget } from "@/components/seera/product/FieldJourney";

// P0 21-Aug live-UAT fix: real unit tests against synthetic JPEG byte sequences, not source-text
// assertions — parseJpegHeader is a pure function (ArrayBuffer in, struct out) that needs no
// DOM/File API, so it can be exercised for real under this project's node-only vitest environment.
// This is the actual novel/risky logic this pass introduces (a hand-rolled binary parser reading
// untrusted camera-file bytes) — it gets the most rigorous, execution-based coverage in the suite.

function bytes(...groups: (number | number[])[]): ArrayBuffer {
  const flat: number[] = [];
  for (const g of groups) Array.isArray(g) ? flat.push(...g) : flat.push(g);
  return new Uint8Array(flat).buffer as ArrayBuffer;
}

const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];

// SOF0 (baseline) segment: FF C0, length(2), precision(1)=8, height(2), width(2), numComponents(1).
function sof0(height: number, width: number, marker = 0xc0): number[] {
  return [0xff, marker, 0x00, 0x08, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x01];
}

// Minimal valid APP1/EXIF segment carrying only an Orientation (0x0112) SHORT tag, little-endian
// ("II") byte order, IFD0 with exactly one entry.
function app1Exif(orientation: number): number[] {
  const ifd0Offset = 8; // right after the 8-byte TIFF header
  const tiff = [0x49, 0x49, 0x2a, 0x00, ifd0Offset, 0, 0, 0]; // "II", 0x002A, IFD0 offset
  const entryCount = [0x01, 0x00]; // 1 entry, little-endian
  const entry = [
    0x12, 0x01, // tag 0x0112 (Orientation), little-endian
    0x03, 0x00, // type 3 (SHORT), little-endian
    0x01, 0x00, 0x00, 0x00, // count = 1
    orientation & 0xff, 0x00, 0x00, 0x00, // value (SHORT, first 2 bytes matter)
  ];
  const nextIfdOffset = [0x00, 0x00, 0x00, 0x00];
  const exifBody = [...tiff, ...entryCount, ...entry, ...nextIfdOffset];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...exifBody]; // "Exif\0\0"
  const length = payload.length + 2;
  return [0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...payload];
}

describe("parseJpegHeader (real synthetic JPEG bytes, no DOM/decode)", () => {
  it("A: parses width/height from a baseline SOF0 JPEG with zero image decode", () => {
    const buf = bytes(SOI, sof0(3000, 4000), EOI);
    const result = parseJpegHeader(buf);
    expect(result).toEqual({ width: 4000, height: 3000, orientation: 1 });
  });

  it("supports progressive JPEG (SOF2)", () => {
    const buf = bytes(SOI, sof0(1200, 1600, 0xc2), EOI);
    const result = parseJpegHeader(buf);
    expect(result).toEqual({ width: 1600, height: 1200, orientation: 1 });
  });

  it("D: reads EXIF orientation from APP1 alongside SOF0 dimensions", () => {
    const buf = bytes(SOI, app1Exif(6), sof0(4000, 3000), EOI);
    const result = parseJpegHeader(buf);
    expect(result).toEqual({ width: 3000, height: 4000, orientation: 6 });
  });

  it("E: rejects a non-JPEG file (wrong SOI) instead of guessing", () => {
    const buf = bytes([0x89, 0x50, 0x4e, 0x47], sof0(100, 100)); // PNG magic bytes
    expect(parseJpegHeader(buf)).toBeNull();
  });

  it("E: rejects a truncated/malformed segment rather than reading past the buffer", () => {
    // SOF0 marker claims a length that extends past the end of the buffer we actually have.
    const buf = bytes(SOI, [0xff, 0xc0, 0x00, 0xff, 0x08]); // length=255 but only 1 byte follows
    expect(parseJpegHeader(buf)).toBeNull();
  });

  it("E: rejects marker misalignment without looping forever", () => {
    const buf = bytes(SOI, [0x00, 0x01, 0x02, 0x03, 0x04]); // no 0xFF where a marker is expected
    expect(parseJpegHeader(buf)).toBeNull();
  });

  it("E: rejects implausible dimensions (defensive bound, not real-world but must not crash/misreport)", () => {
    const buf = bytes(SOI, sof0(0, 0), EOI);
    expect(parseJpegHeader(buf)).toBeNull();
  });

  it("E: returns null (never throws) on a zero-length buffer", () => {
    expect(parseJpegHeader(new ArrayBuffer(0))).toBeNull();
  });

  it("a segment length declaring less than a byte of real payload is rejected, not read out-of-bounds", () => {
    const buf = bytes(SOI, [0xff, 0xc0, 0x00, 0x01]); // length=1 (< 2, the minimum for the length field itself)
    expect(parseJpegHeader(buf)).toBeNull();
  });
});

describe("orientedUploadTarget (D: orientation-driven width/height swap)", () => {
  it("does not swap for orientation 1 (normal)", () => {
    expect(orientedUploadTarget(4000, 3000, 1)).toEqual({ width: 1280, height: 960 });
  });

  it("does not swap for orientation 3 (180deg, no dimension swap)", () => {
    expect(orientedUploadTarget(4000, 3000, 3)).toEqual({ width: 1280, height: 960 });
  });

  it("SWAPS for orientation 6 (90deg CW) — a portrait photo stored with landscape raw SOF dimensions", () => {
    // Raw SOF says landscape (4000x3000), but orientation 6 means the logical/on-screen image is
    // portrait — the resize target passed to createImageBitmap must reflect that, or the output
    // is stretched/distorted (Part C's exact concern).
    const result = orientedUploadTarget(4000, 3000, 6);
    expect(result.width).toBeLessThan(result.height);
    expect(result).toEqual({ width: 960, height: 1280 });
  });

  it("SWAPS for orientation 8 (270deg CW) the same way", () => {
    const result = orientedUploadTarget(4000, 3000, 8);
    expect(result).toEqual({ width: 960, height: 1280 });
  });

  it("never upscales beyond the source (scale is capped at 1)", () => {
    expect(orientedUploadTarget(500, 400, 1)).toEqual({ width: 500, height: 400 });
  });
});
