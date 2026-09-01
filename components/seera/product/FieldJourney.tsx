"use client";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./FieldJourney.module.css";
import { queueOfflineOperation, syncClientQueue, listClientQueue } from "@/lib/phase-11/offline-client";
import { captureGps, GpsBadge, type GpsStatus, type GpsPoint } from "./gps";
import { ActionMessageBanner, type ActionMessage } from "./ErrorBanner";

type BeatRetailer = {
  id: string;
  businessName: string;
  ownerName: string | null;
  mobile: string | null;
  distributorId: string | null;
  followUpAt: Date | null;
  visitStatus: string | null;
};
// unitsPerCase/unitType (Final Master Revision Part 2, 22-Aug): the governed pack-conversion
// factor already on SeeraSku, plumbed through for the PC/BOX/BAG selector below. caseUnit is
// derived, not stored — Founder's own matrix maps every "g"-packed SKU (cakes) to BOX and every
// "kg"-packed SKU (powders) to BAG, so this is a real, general rule rather than a per-SKU guess;
// a SKU with unitsPerCase<=1 simply has no case unit to offer (PC only), same as today.
type Sku = { id: string; brand: string; productName: string; packLabel: string; price: string; rate: number; unitsPerCase: number; caseUnit: "BOX" | "BAG" | null };
type Photo = { id: string; photoType: string; capturedAt: string; secureUrl?: string | null };
type Visit = {
  id: string;
  retailerId: string;
  retailerName: string;
  retailerMobile: string | null;
  retailerArea: string | null;
  distributorId: string | null;
  checkedInAt: string;
  photos: Photo[];
  orderCount: number;
};
type Dashboard = {
  employeeName: string;
  employeeCode: string;
  manager: string | null;
  territory: string | null;
  workingDistributorLabel: string | null;
  dayStatus: "NOT_STARTED" | "ACTIVE" | "ENDED";
  target: {
    value: number;
    achieved: number;
    remaining: number;
    achievementPct: number;
    daysRemaining: number;
    requiredDailyRunRate: number;
  } | null;
  today: {
    planned: number;
    visited: number;
    productive: number;
    skipped: number;
    orders: number;
    bookedValue: number;
    followUpsDue: number;
    newRetailers: number;
    distributorProspects: number;
    photos: number;
  };
};
// `uom` (Final Master Revision Part 2, 22-Aug): "PC" or the SKU's caseUnit ("BOX"/"BAG"). `quantity`
// and `rate` are always entered AT the selected uom — a BOX order of 2 with rate ₹400/BOX, not 80
// PC at ₹10/PC — converted to base-PC quantity/rate only at submit time (see submitLines below),
// so every downstream accept/allocate/dispatch/ledger calculation keeps operating on base PC units
// completely unchanged. Defaults to "PC" so every existing line (and every SKU with no case unit)
// behaves exactly as before.
// freeQuantity/freeUom (Final Retailer Cleanup + Handover, 22-Aug): an optional scheme —
// "10 BOX purchase -> 1 PC FREE" — captured on the SAME line as the paid quantity/rate, never a
// separate line. freeUom defaults to "PC" (matches every one of the Founder's own examples) but
// stays selectable for a SKU with a case unit, supporting "5 BAG -> 1 BAG" style combinations too.
type OrderLine = { key: string; skuId: string; quantity: number; rate: number; brandFilter: string; search: string; uom: string; freeQuantity: number; freeUom: string };
type WorkingType = "RETAILING" | "DISTRIBUTOR_SEARCH" | "DISTRIBUTOR_VISIT" | "WHOLESALE_MARKET" | "OTHER";

// Normalized action outcome — business/validation failures (photo required, duplicate customer,
// permission denied, network failure) are DATA, never a thrown exception. An uncaught throw from a
// fetch callback that nobody awaits/`.catch()`s becomes an unhandled promise rejection, which
// Next.js's dev-mode overlay surfaces as a scary runtime-error screen for what is really just a
// normal "please add a photo" validation message — that was the actual cause of the runtime
// overlay reported from this file's old send().
type ActionOutcome =
  | { success: true; data: any }
  | {
      success: false;
      code: string;
      message: string;
      details?: Record<string, unknown>;
      userMessage?: string;
      nextAction?: string;
      retryable?: boolean;
      supportRequired?: boolean;
      requestId?: string;
    };

async function send(action: string, payload: Record<string, unknown>): Promise<ActionOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/field/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
  } catch {
    // fetch() itself failed to complete — a real network-layer problem (offline/DNS/CORS), not a
    // business rejection from the server.
    return { success: false, code: "NETWORK_ERROR", message: "Could not save. Please retry.", nextAction: "Check your connection and try again.", retryable: true };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    return {
      success: false,
      code: data?.error?.code ?? "ACTION_FAILED",
      message: data?.error?.message ?? data?.error?.code ?? "Action failed",
      details: data?.error?.details,
      userMessage: data?.error?.userMessage,
      nextAction: data?.error?.nextAction,
      retryable: data?.error?.retryable,
      supportRequired: data?.error?.supportRequired,
      requestId: data?.error?.requestId,
    };
  return { success: true, data };
}
// After checkout (or starting the day, or opening Add Customer), the screen content underneath
// the user's finger swaps to a fresh state, but the browser keeps whatever scroll position it had
// on the previous (often long) form — so the new "Next customer" section renders correctly but is
// invisible below the fold, reading as if nothing happened / as if it's buried further down the
// page. Force the viewport back to the top of the journey card at every such transition.
function scrollToJourneyTop() {
  if (typeof document === "undefined") return;
  document.getElementById("field-journey-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
// PERFORMANCE PHASE 3: every GPS-gated action sets `busy`/`busyLabel` synchronously as the very
// first line, before `captureGps()` — but `captureGps()`'s underlying `getCurrentPosition()` can
// resolve near-instantly (a cached position, or this codebase's own test/emulated geolocation),
// racing the pending-feedback paint against GPS resolution instead of guaranteeing it lands first.
// One `requestAnimationFrame` round trip is the standard way to force the browser to actually
// paint the just-scheduled state update before the next expensive synchronous/async step starts —
// not an artificial delay, just ceding the frame React already asked for instead of letting the
// GPS call's own scheduling race ahead of it.
function yieldToPaint(): Promise<void> {
  if (typeof requestAnimationFrame === "undefined") return Promise.resolve();
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
// P0 21-Aug live-UAT fix: the prior "2 decodes" design assumed createImageBitmap's dimension-only
// call was a cheap "metadata pass". It is not — no such mode exists in the API; the browser must
// realize a real (often native-resolution) bitmap just to report width/height, and the real device
// evidence (camera attempts 1/2 failing with a low-memory error, attempt 3 succeeding) proved this
// still isn't safe enough on high-megapixel/low-memory Android devices. For a real camera JPEG —
// the overwhelming majority of field-evidence photos — dimensions and EXIF orientation are read
// directly from the file's own header bytes (a plain byte-range read, zero image decode), so only
// ONE real createImageBitmap call ever happens: the resize-during-decode pass at the upload target.
// Non-JPEG or any file the header parser can't confidently interpret falls back to the previous,
// already-proven 2-decode path — never a guess, never a silently-wrong dimension.
const PREVIEW_MAX_DIMENSION = 800;
const PREVIEW_QUALITY = 0.7;
// JPEG camera files are uploaded unchanged; non-JPEG fallback conversion is bounded.
// Field evidence is detail-sensitive, but uploading modern 4K/50MP camera files directly can
// turn a normal mobile-network save into a 15–30s transfer. 2048px preserves readable storefront
// / counter / product evidence while keeping the network payload small enough for a fast save.
const UPLOAD_MAX_DIMENSION = 2048;
const UPLOAD_QUALITY = 0.86;
const JPEG_DIRECT_UPLOAD_MAX_BYTES = 2_500_000;
const MAX_FINAL_UPLOAD_BYTES = 10_000_000;
// JPEG uploads use direct multipart Cloudinary upload, so they are not base64-encoded through a
// Vercel JSON request. The size ceiling is enforced before upload and again authoritatively at finalize.
const MAX_SAFE_ORIGINAL_FALLBACK_BYTES = 10_000_000;
const PHOTO_TOO_LARGE_MESSAGE = "Photo is larger than 10 MB. Please retake at a lower camera resolution.";
const PHOTO_PREP_FAILED_MESSAGE = "Photo could not be prepared. Please retake.";
// Real camera JPEGs put their SOF (dimensions) and APP1/EXIF (orientation) markers within the
// first few KB; this generously covers even an unusually large EXIF/thumbnail block without ever
// reading (let alone decoding) the actual image data that follows.
const JPEG_HEADER_READ_BYTES = 256 * 1024;

type JpegHeaderInfo = { width: number; height: number; orientation: number };

// Pure, synchronous, given already-read bytes — trivially unit-testable without any File/Blob/DOM
// API. Every array access is bounds-checked against `view.byteLength` before use; `offset` strictly
// increases by at least 2 every loop iteration, so this can never infinite-loop; any ambiguity
// (truncated segment, marker misalignment, implausible dimensions) returns null rather than guess,
// so the caller falls back to the safe 2-decode path instead of trusting a bad parse.
// Exported for direct unit testing (__tests__/seera-foundation/jpeg-header-parser.test.ts) — pure,
// synchronous, no DOM/File API needed, so it can run under this project's node-only vitest
// environment without a jsdom/browser dependency.
export function parseJpegHeader(buf: ArrayBuffer): JpegHeaderInfo | null {
  const view = new DataView(buf);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // not a JPEG (no SOI)

  let offset = 2;
  let dims: { width: number; height: number } | null = null;
  let orientation = 1;

  while (offset < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null; // not marker-aligned — malformed, bail safely
    offset += 1;
    while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset += 1; // fill bytes
    if (offset >= view.byteLength) return null;
    const marker = view.getUint8(offset);
    offset += 1;

    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // no payload
    if (marker === 0xd9) break; // EOI

    if (offset + 2 > view.byteLength) return null;
    const segmentLength = view.getUint16(offset);
    if (segmentLength < 2) return null;
    const dataStart = offset + 2;
    const dataEnd = offset + segmentLength;
    if (dataEnd > view.byteLength) return null; // segment extends past what we read — bail safely

    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (dataEnd - dataStart < 5) return null;
      const height = view.getUint16(dataStart + 1);
      const width = view.getUint16(dataStart + 3);
      if (width > 0 && height > 0 && width <= 40000 && height <= 40000) dims = { width, height };
    } else if (marker === 0xe1) {
      orientation = parseExifOrientation(view, dataStart, dataEnd) ?? orientation;
    } else if (marker === 0xda) {
      break; // Start of Scan — header section is over, entropy-coded data follows
    }

    offset = dataEnd;
  }

  if (!dims) return null;
  return { width: dims.width, height: dims.height, orientation };
}

// EXIF APP1 payload: "Exif\0\0" + TIFF header (byte order + IFD0 offset) + IFD0 entries. Bounded,
// defensive: entry count and offsets are checked against `end` before every read; an implausible
// entry count aborts rather than looping far past reasonable EXIF data.
function parseExifOrientation(view: DataView, start: number, end: number): number | null {
  if (end - start < 8) return null;
  if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0x0000) return null; // "Exif\0\0"
  const tiffStart = start + 6;
  if (tiffStart + 8 > end) return null;
  const byteOrderMarker = view.getUint16(tiffStart);
  let little: boolean;
  if (byteOrderMarker === 0x4949) little = true;
  else if (byteOrderMarker === 0x4d4d) little = false;
  else return null;
  if (view.getUint16(tiffStart + 2, little) !== 0x002a) return null;
  const ifd0Offset = view.getUint32(tiffStart + 4, little);
  const ifd0Start = tiffStart + ifd0Offset;
  if (ifd0Offset < 8 || ifd0Start + 2 > end) return null;
  const entryCount = view.getUint16(ifd0Start, little);
  if (entryCount > 200) return null; // real EXIF IFD0 has a handful of entries — sanity bound
  const entriesStart = ifd0Start + 2;
  for (let i = 0; i < entryCount; i++) {
    const entryOffset = entriesStart + i * 12;
    if (entryOffset + 12 > end) return null;
    if (view.getUint16(entryOffset, little) === 0x0112) {
      const value = view.getUint16(entryOffset + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

async function readJpegHeaderInfo(file: File): Promise<JpegHeaderInfo | null> {
  if (file.type !== "image/jpeg") return null;
  try {
    const buf = await file.slice(0, JPEG_HEADER_READ_BYTES).arrayBuffer();
    return parseJpegHeader(buf);
  } catch {
    return null;
  }
}

// EXIF orientations 5-8 carry a 90/270-degree rotation, which swaps the LOGICAL (post-rotation,
// on-screen) width/height relative to the raw SOF values — createImageBitmap's resizeWidth/
// resizeHeight hints are interpreted in POST-orientation space (since imageOrientation:"from-image"
// rotates first), so this swap must happen before computing the resize target, or a portrait photo
// (extremely common — a field rep holding their phone vertically) would decode stretched/distorted.
// Exported for direct unit testing — see parseJpegHeader's export comment above.
export function orientedUploadTarget(rawWidth: number, rawHeight: number, orientation: number) {
  const swapped = orientation >= 5 && orientation <= 8;
  const logicalWidth = swapped ? rawHeight : rawWidth;
  const logicalHeight = swapped ? rawWidth : rawHeight;
  const scale = Math.min(1, UPLOAD_MAX_DIMENSION / Math.max(logicalWidth, logicalHeight));
  return { width: Math.max(1, Math.round(logicalWidth * scale)), height: Math.max(1, Math.round(logicalHeight * scale)) };
}

async function decodeAndDeriveDerivatives(file: File): Promise<{ uploadBlob: Blob; previewBlob: Blob; sourceWidth?: number; sourceHeight?: number }> {
  const header = await readJpegHeaderInfo(file);
  let uploadWidth: number, uploadHeight: number;
  let metadataBitmap: ImageBitmap | null = null;
  if (header) {
    ({ width: uploadWidth, height: uploadHeight } = orientedUploadTarget(header.width, header.height, header.orientation));
  } else {
    // Fallback: exactly ONE extra metadata-only decode, only when the zero-decode header parse
    // didn't apply (non-JPEG) or declined to interpret this file (e.g. a JPEG shape our strict,
    // safety-first parser wasn't confident about) — never a silent wrong-dimension guess.
    try {
      metadataBitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      ({ width: uploadWidth, height: uploadHeight } = orientedUploadTarget(metadataBitmap.width, metadataBitmap.height, 1));
    } finally {
      metadataBitmap?.close?.();
      metadataBitmap = null;
    }
  }

  let uploadBitmap: ImageBitmap | null = null;
  let uploadCanvas: HTMLCanvasElement | null = null;
  let previewCanvas: HTMLCanvasElement | null = null;
  try {
    // The ONLY real decode of the original file for a normal JPEG camera path (or the second/last
    // one on the non-JPEG fallback above): resize-during-decode straight to the upload target.
    uploadBitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
      resizeWidth: uploadWidth,
      resizeHeight: uploadHeight,
      resizeQuality: "high",
    });
    uploadCanvas = document.createElement("canvas");
    uploadCanvas.width = uploadWidth;
    uploadCanvas.height = uploadHeight;
    const uploadCtx = uploadCanvas.getContext("2d");
    if (!uploadCtx) throw new Error(PHOTO_PREP_FAILED_MESSAGE);
    uploadCtx.drawImage(uploadBitmap, 0, 0, uploadWidth, uploadHeight);
    uploadBitmap.close?.();
    uploadBitmap = null;
    const uploadBlob = await new Promise<Blob | null>((resolve) => uploadCanvas!.toBlob(resolve, "image/jpeg", UPLOAD_QUALITY));
    if (!uploadBlob) throw new Error(PHOTO_PREP_FAILED_MESSAGE);

    // Preview: derived from the already-bounded uploadCanvas (canvas-to-canvas draw), never from
    // `file`/a fresh createImageBitmap — this is what keeps the original-file decode count at 1.
    const previewScale = Math.min(1, PREVIEW_MAX_DIMENSION / Math.max(uploadWidth, uploadHeight));
    const previewWidth = Math.max(1, Math.round(uploadWidth * previewScale));
    const previewHeight = Math.max(1, Math.round(uploadHeight * previewScale));
    previewCanvas = document.createElement("canvas");
    previewCanvas.width = previewWidth;
    previewCanvas.height = previewHeight;
    const previewCtx = previewCanvas.getContext("2d");
    if (!previewCtx) throw new Error(PHOTO_PREP_FAILED_MESSAGE);
    previewCtx.drawImage(uploadCanvas, 0, 0, previewWidth, previewHeight);
    const previewBlob = await new Promise<Blob | null>((resolve) => previewCanvas!.toBlob(resolve, "image/jpeg", PREVIEW_QUALITY));
    if (!previewBlob) throw new Error(PHOTO_PREP_FAILED_MESSAGE);

    return { uploadBlob, previewBlob, sourceWidth: header?.width, sourceHeight: header?.height };
  } finally {
    uploadBitmap?.close?.();
    if (uploadCanvas) {
      uploadCanvas.width = 1;
      uploadCanvas.height = 1;
    }
    if (previewCanvas) {
      previewCanvas.width = 1;
      previewCanvas.height = 1;
    }
  }
}

// Single entry point for the whole camera-return pipeline.
async function preparePhotoDerivatives(file: File): Promise<{ uploadBlob: Blob; previewBlob: Blob; sourceWidth?: number; sourceHeight?: number }> {
  if (/^image\/jpeg$/i.test(file.type) && file.size <= JPEG_DIRECT_UPLOAD_MAX_BYTES) {
    return { uploadBlob: file, previewBlob: file };
  }
  let derivatives: { uploadBlob: Blob; previewBlob: Blob; sourceWidth?: number; sourceHeight?: number };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap === "undefined") {
    // Can't safely decode this format at all (e.g. HEIC/HEIF) — go straight to the fail-closed
    // fallback below rather than attempting (and always failing) the canvas pipeline first.
    if (file.size > MAX_SAFE_ORIGINAL_FALLBACK_BYTES) throw new Error(PHOTO_TOO_LARGE_MESSAGE);
    if (file.type !== "image/jpeg") throw new Error(PHOTO_PREP_FAILED_MESSAGE);
    return { uploadBlob: file, previewBlob: file };
  }
  try {
    derivatives = await decodeAndDeriveDerivatives(file);
  } catch {
    // Fail-closed fallback (unchanged from the prior design): only for a genuinely small original
    // that's already a JPEG Cloudinary can accept as-is — never a multi-megabyte fallback, which
    // would recreate the exact memory spike this whole pipeline exists to prevent.
    if (file.size > MAX_SAFE_ORIGINAL_FALLBACK_BYTES) throw new Error(PHOTO_TOO_LARGE_MESSAGE);
    if (file.type !== "image/jpeg") throw new Error(PHOTO_PREP_FAILED_MESSAGE);
    return { uploadBlob: file, previewBlob: file };
  }
  if (derivatives.uploadBlob.size > MAX_FINAL_UPLOAD_BYTES) throw new Error(PHOTO_TOO_LARGE_MESSAGE);
  return derivatives;
}

// P0 21-Aug "Invalid Signature" fix: this type (and the FormData loop below) must mirror EXACTLY
// what lib/sales-distribution/field-photo-cloudinary-service.ts's createFieldPhotoUploadSignature
// signs — no field here that isn't part of what the server signed, and nothing rebuilt/reinterpreted
// client-side. `resource_type` is intentionally present (needed for the upload URL) but intentionally
// NOT part of the signed set server-side; see that file's comment for why.
type SignedPhotoUpload = {
  cloudName: string; apiKey: string; signature: string; timestamp: number; expiresAt: number;
  folder: string; public_id: string; overwrite: false; resource_type: "image"; type: "upload";
  unique_filename: false;
};

async function postPhotoJson<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message ?? "Photo upload failed. Please retry.");
  return data as T;
}

// P0 21-Aug telemetry gap fix: fire-and-forget — telemetry must never block or fail the real photo
// flow, so failures here are swallowed rather than surfaced. Never sends photo binary/base64 or
// any Cloudinary secret; the payload shape is enforced server-side by recordPhotoTelemetry's own
// type signature (lib/sales-distribution/field-portal-service.ts), not just trusted from the client.
function sendPhotoTelemetry(event: string, fields: Record<string, unknown> = {}) {
  void fetch("/api/field/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "photo-telemetry", payload: { event, ...fields } }),
  }).catch(() => {});
}

async function uploadFieldPhotoDirect(visitId: string, photoType: string, blob: Blob, signedOverride?: SignedPhotoUpload) {
  const uploadStart = performance.now();
  sendPhotoTelemetry("UPLOAD_START", { visitId, outputBytes: blob.size });
  const signed = signedOverride ?? await postPhotoJson<SignedPhotoUpload>("/api/field/photos/upload-signature", { visitId });
  if (signed.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error("Photo upload authorization expired. Please retry.");
  const form = new FormData();
  form.set("file", blob, "field-visit.jpg");
  // Only the fields the server actually signed, copied verbatim (String() on a number/boolean is
  // the same serialization `cloudinary.utils.api_sign_request`'s own value handling expects) — no
  // client-side reconstruction of any of these values. `api_key` is the one field never signed
  // (Cloudinary's own convention), added here alongside `signature`.
  for (const [name, value] of Object.entries({ api_key: signed.apiKey, timestamp: signed.timestamp, signature: signed.signature, folder: signed.folder, public_id: signed.public_id, overwrite: signed.overwrite, type: signed.type, unique_filename: signed.unique_filename }))
    form.set(name, String(value));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/${signed.resource_type}/upload`, { method: "POST", body: form });
  const uploaded = await response.json().catch(() => ({}));
  if (!response.ok || typeof uploaded.public_id !== "string") {
    // P0 21-Aug fix: never surface Cloudinary's raw provider error (which can include the literal
    // signing string/parameter names) to field staff — log it for developer diagnostics only.
    if (uploaded?.error?.message) console.error("cloudinary_upload_failed", uploaded.error.message);
    sendPhotoTelemetry("UPLOAD_FAILED", { visitId, elapsedMs: Math.round(performance.now() - uploadStart), errorCode: String(response.status) });
    throw new Error("Photo upload failed. Please retry.");
  }
  sendPhotoTelemetry("UPLOAD_SUCCESS", { visitId, elapsedMs: Math.round(performance.now() - uploadStart) });

  // Finalize is the authoritative save, but do not block the UI on a telemetry POST.
  // The old implementation emitted telemetry immediately before finalize; keep telemetry
  // observational and completely outside the critical save path.
  const finalizeStart = performance.now();
  try {
    const result = await postPhotoJson<{ id: string; photoType: string; capturedAt: string; secureUrl: string }>("/api/field/photos/finalize", {
      visitId,
      photoType,
      publicId: uploaded.public_id,
      version: Number(uploaded.version),
      signature: String(uploaded.signature),
      secureUrl: String(uploaded.secure_url),
      bytes: Number(uploaded.bytes),
      width: Number(uploaded.width),
      height: Number(uploaded.height),
      format: String(uploaded.format),
    });
    sendPhotoTelemetry("FINALIZE_SUCCESS", { visitId, elapsedMs: Math.round(performance.now() - finalizeStart) });
    return result;
  } catch (error) {
    sendPhotoTelemetry("FINALIZE_FAILED", { visitId, elapsedMs: Math.round(performance.now() - finalizeStart), errorCode: error instanceof Error ? error.message.slice(0, 64) : "unknown" });
    throw error;
  }
}
const key = () => crypto.randomUUID();
// PERFORMANCE PHASE 3 (hydration mismatch fix): `key()` is genuinely random, so calling it as the
// default `useState` initializer ran once during SSR (baking one random value into the
// server-rendered HTML's `name="brand-{key}"` radio attribute) and once again during the client's
// first render before hydration reconciles — two different random values, a guaranteed mismatch.
// An optional deterministic key lets the one SSR-visible call site (the initial `useState` below)
// pass a fixed value instead, while every other call site (adding a line, resetting on visit
// change) still gets a real random key — those only ever run client-side, post-mount, in a
// useEffect/event handler, never during SSR, so they carry no hydration risk and keeping them
// random preserves correct React list-reconciliation identity across visits.
const blankOrderLine = (fixedKey?: string): OrderLine => ({ key: fixedKey ?? key(), skuId: "", quantity: 1, rate: 0, brandFilter: "ALL", search: "", uom: "PC", freeQuantity: 0, freeUom: "PC" });

// Final Master Revision (Part 2, 22-Aug) + Final Retailer Cleanup scheme support (22-Aug):
// converts a UOM-scoped order line (quantity/rate entered at the selected pack unit, plus an
// optional free-goods scheme) into the base-PC quantity/rate placeRetailerOrder has always
// expected. `rate`/`quantity` (and therefore taxable/GST/lineTotal) are derived from the PAID
// quantity ONLY — a scheme's free units are carried purely as informational uom/scheme metadata,
// never folded into the priced quantity, so free goods can never inflate tax or the grand total.
// packSnapshot carries the human-readable text ("2 BOX (80 PC) + 1 PC FREE") since it's already
// the one field every order-line display (Distributor/S.S. order cards, receipts) renders
// everywhere — no document-rendering code needs to change to show it.
function toBasePcLine(line: OrderLine, skuById: Map<string, Sku>) {
  const sku = skuById.get(line.skuId);
  const packFactor = line.uom !== "PC" && sku && sku.unitsPerCase > 1 ? sku.unitsPerCase : 1;
  const freePackFactor = line.freeUom !== "PC" && sku && sku.unitsPerCase > 1 ? sku.unitsPerCase : 1;
  const freeBaseQuantity = line.freeQuantity > 0 ? line.freeQuantity * freePackFactor : 0;
  return {
    skuId: line.skuId,
    quantity: line.quantity * packFactor,
    rate: packFactor > 1 ? line.rate / packFactor : line.rate,
    uom: packFactor > 1 ? { unit: line.uom, packFactor, uomQuantity: line.quantity } : undefined,
    scheme:
      line.freeQuantity > 0
        ? { freeQuantity: line.freeQuantity, freeUom: line.freeUom, freeBaseQuantity }
        : undefined,
  };
}

// Part A (repeat business / phone orders): extracted so the SAME brand/search/product/qty/rate
// line-item editor can be reused by both the in-visit ORDER tab and the new no-visit order panel
// (My Route "New Order" / top-level "+ New order") — the two previously-identical JSX blocks this
// replaces were never allowed to drift, per this codebase's "extraction, not duplication" convention.
function OrderLineItemsEditor({
  hi,
  lines,
  setLines,
  skus,
}: {
  hi: boolean;
  lines: OrderLine[];
  setLines: (updater: (current: OrderLine[]) => OrderLine[]) => void;
  skus: Sku[];
}) {
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const brands = Array.from(new Set(skus.map((s) => s.brand))).sort();
  const total = lines.reduce((sum, line) => sum + (line.rate || 0) * (line.quantity || 0), 0);
  return (
    <div className={styles.lineItems}>
      <strong>{hi ? "ऑर्डर उत्पाद" : "Order products"}</strong>
      {lines.map((line, index) => {
        const sku = skuById.get(line.skuId);
        const lineTotal = (line.rate || 0) * (line.quantity || 0);
        const searchText = line.search.trim().toLowerCase();
        const visibleSkus = skus.filter(
          (s) =>
            (line.brandFilter === "ALL" || s.brand === line.brandFilter) &&
            (!searchText ||
              s.productName.toLowerCase().includes(searchText) ||
              s.brand.toLowerCase().includes(searchText) ||
              s.packLabel.toLowerCase().includes(searchText)),
        );
        const visibleBrands = Array.from(new Set(visibleSkus.map((s) => s.brand)));
        return (
          <div className={styles.lineItem} key={line.key}>
            <label>
              {hi ? "ब्रांड" : "Brand"}
              <div className={styles.workTypeGrid}>
                {["ALL", ...brands].map((b) => (
                  <label key={b} className={styles.workTypeOption} data-active={line.brandFilter === b}>
                    <input
                      type="radio"
                      name={`brand-${line.key}`}
                      checked={line.brandFilter === b}
                      onChange={() => setLines((current) => current.map((item) => (item.key === line.key ? { ...item, brandFilter: b } : item)))}
                    />
                    {b === "ALL" ? (hi ? "सभी" : "All") : b}
                  </label>
                ))}
              </div>
            </label>
            <label>
              {hi ? "खोजें (नाम / पैक)" : "Search (name / pack)"}
              <input
                type="search"
                value={line.search}
                placeholder={hi ? "उदा. डिटर्जेंट, 1 kg" : "e.g. Detergent, 1 kg"}
                onChange={(event) => setLines((current) => current.map((item) => (item.key === line.key ? { ...item, search: event.target.value } : item)))}
              />
            </label>
            <label>
              {hi ? "उत्पाद / वेरिएंट" : "Product / Variant"}
              <select
                data-testid="order-line-product-select"
                value={line.skuId}
                onChange={(event) => {
                  const chosen = skuById.get(event.target.value);
                  // Final Production Closure (23-Aug), P0-14: the governed wholesale default is the
                  // SKU's case unit (Cake -> BOX, Powder -> BAG) — PC stays available as the
                  // secondary option in the "Sell by" selector above, but must never be what a
                  // product change silently resets the line back to.
                  const defaultUom = chosen && chosen.caseUnit && chosen.unitsPerCase > 1 ? chosen.caseUnit : "PC";
                  setLines((current) =>
                    current.map((item) => (item.key === line.key ? { ...item, skuId: event.target.value, rate: chosen?.rate || item.rate, uom: defaultUom } : item)),
                  );
                }}
                required
              >
                <option value="">{hi ? "उत्पाद चुनें" : "Choose product"}</option>
                {visibleBrands.map((b) => (
                  <optgroup key={b} label={b}>
                    {visibleSkus
                      .filter((s) => s.brand === b)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.productName} — {s.packLabel}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {sku && sku.caseUnit && sku.unitsPerCase > 1 && (
              <label>
                {hi ? "बेचें" : "Sell by"}
                <select
                  value={line.uom}
                  onChange={(event) => setLines((current) => current.map((item) => (item.key === line.key ? { ...item, uom: event.target.value } : item)))}
                >
                  <option value="PC">{hi ? "पीस" : "PC"}</option>
                  <option value={sku.caseUnit}>
                    {sku.caseUnit} ({sku.unitsPerCase} PC)
                  </option>
                </select>
              </label>
            )}
            <label>
              {hi ? "मात्रा" : "Quantity"} {line.uom !== "PC" ? `(${line.uom})` : ""}
              <input
                type="number"
                min="1"
                step="1"
                value={line.quantity}
                onChange={(event) => setLines((current) => current.map((item) => (item.key === line.key ? { ...item, quantity: Number(event.target.value) } : item)))}
                required
              />
              {sku && line.uom !== "PC" && (
                <small>{hi ? `= ${line.quantity * sku.unitsPerCase} PC` : `= ${line.quantity * sku.unitsPerCase} PC`}</small>
              )}
            </label>
            <label>
              {hi ? `बिक्री दर / ${line.uom} (GST सहित)` : `Selling Rate / ${line.uom} (Incl. GST)`}
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={line.rate || ""}
                placeholder={hi ? "दर दर्ज करें" : "Enter rate"}
                onChange={(event) => setLines((current) => current.map((item) => (item.key === line.key ? { ...item, rate: Number(event.target.value) } : item)))}
                required
              />
            </label>
            <label>
              {hi ? "स्कीम — फ्री मात्रा (वैकल्पिक)" : "Scheme — free quantity (optional)"}
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={line.freeQuantity || ""}
                  placeholder="0"
                  onChange={(event) => setLines((current) => current.map((item) => (item.key === line.key ? { ...item, freeQuantity: Math.max(0, Number(event.target.value)) } : item)))}
                />
                <select
                  value={line.freeUom}
                  onChange={(event) => setLines((current) => current.map((item) => (item.key === line.key ? { ...item, freeUom: event.target.value } : item)))}
                >
                  <option value="PC">PC</option>
                  {sku && sku.caseUnit && sku.unitsPerCase > 1 && <option value={sku.caseUnit}>{sku.caseUnit}</option>}
                </select>
              </div>
              {line.freeQuantity > 0 && (
                <small>{hi ? `स्कीम: +${line.freeQuantity} ${line.freeUom} फ्री (कर/कुल में शामिल नहीं)` : `Scheme: +${line.freeQuantity} ${line.freeUom} FREE (not included in tax/total)`}</small>
              )}
            </label>
            <label>
              {hi ? "कुल" : "Total"}
              <input value={sku ? `₹${lineTotal.toFixed(2)}` : "—"} readOnly />
            </label>
            {lines.length > 1 && (
              <button
                className={styles.removeLine}
                type="button"
                onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                aria-label={`${hi ? "उत्पाद हटाएँ" : "Remove product"} ${index + 1}`}
              >
                {hi ? "हटाएँ" : "Remove"}
              </button>
            )}
          </div>
        );
      })}
      <button className={styles.addLine} type="button" onClick={() => setLines((current) => [...current, blankOrderLine()])}>
        {hi ? "+ उत्पाद जोड़ें" : "+ Add product"}
      </button>
      <div className={styles.orderTotalRow}>
        <strong>{hi ? "ऑर्डर कुल" : "Order total"}</strong>
        <span>₹{total.toFixed(2)}</span>
      </div>
    </div>
  );
}
// The offline sync API rejects any queued operation whose sessionContext.sessionId doesn't match
// the server-side Session row that's live at sync time (a deliberate staleness/identity check —
// see app/api/offline/sync/route.ts's STALE_DEVICE_SESSION check) — this used to be hardcoded to
// the literal string "field-session", which could never match a real session id, so every synced
// operation was unconditionally rejected and "Sync now" could never actually drain the queue.
// Fetched once per page load and cached; a stale cached id from a since-ended session correctly
// still gets rejected server-side (that's the check doing its job), it just won't be masked by a
// placeholder that was *always* wrong.
let cachedSessionId: string | null = null;
async function currentSessionId(): Promise<string> {
  if (cachedSessionId) return cachedSessionId;
  try {
    const response = await fetch("/api/auth/session");
    const data = await response.json();
    cachedSessionId = typeof data?.sessionId === "string" && data.sessionId ? data.sessionId : "unknown-session";
  } catch {
    cachedSessionId = "unknown-session";
  }
  return cachedSessionId ?? "unknown-session";
}
const deviceId = () => {
  if (typeof window === "undefined") return "server";
  const stored = window.localStorage.getItem("seera-device-id");
  if (stored) return stored;
  const created = `device-${crypto.randomUUID()}`;
  window.localStorage.setItem("seera-device-id", created);
  return created;
};

// Tries the live API first; if the browser genuinely has no network (or the fetch itself fails at
// the network layer, not a business-rule rejection), the same action is queued idempotently through
// the existing offline engine instead of being lost. A conflict (e.g. Distributor mapping changed)
// surfaces later, at sync time, through the shared offline queue/status UI.
async function runOrQueue(
  action: string,
  payload: Record<string, unknown>,
  offline: { entityType: string; actionType: string } | null,
): Promise<ActionOutcome | { queued: true }> {
  const offlineCapable = Boolean(offline);
  if (offlineCapable && typeof navigator !== "undefined" && !navigator.onLine) {
    await queueOfflineOperation({
      clientOperationId: String(payload.idempotencyKey ?? key()),
      deviceId: deviceId(),
      sessionContext: { sessionId: await currentSessionId(), appVersion: "1", platform: "web" },
      entityType: offline!.entityType,
      actionType: offline!.actionType,
      localCreatedAt: new Date().toISOString(),
      payloadVersion: 1,
      payload,
    });
    return { queued: true as const };
  }
  const result = await send(action, payload);
  if (!result.success && result.code === "NETWORK_ERROR" && offlineCapable) {
    await queueOfflineOperation({
      clientOperationId: String(payload.idempotencyKey ?? key()),
      deviceId: deviceId(),
      sessionContext: { sessionId: await currentSessionId(), appVersion: "1", platform: "web" },
      entityType: offline!.entityType,
      actionType: offline!.actionType,
      localCreatedAt: new Date().toISOString(),
      payloadVersion: 1,
      payload,
    });
    return { queued: true as const };
  }
  return result;
}

function DashboardHeader({
  language,
  dashboard,
}: {
  language: "EN" | "HI";
  dashboard: Dashboard;
}) {
  const hi = language === "HI";
  return (
    <section id="field-journey-top" className={styles.journey}>
      <div className={styles.dashboard}>
        <div className="idRow">
          <span>
            <strong>{dashboard.employeeName}</strong> · {dashboard.employeeCode}
          </span>
          {dashboard.manager && (
            <span>
              {hi ? "प्रबंधक" : "Manager"}: {dashboard.manager}
            </span>
          )}
          {dashboard.territory && (
            <span>
              {hi ? "क्षेत्र" : "Territory"}: {dashboard.territory}
            </span>
          )}
          {dashboard.workingDistributorLabel && (
            <span>
              {hi ? "आज का कार्यरत वितरक" : "Today's Working Distributor"}: {dashboard.workingDistributorLabel}
            </span>
          )}
          <span className={styles.pill} data-status={dashboard.dayStatus === "ACTIVE" ? "PRODUCTIVE" : undefined}>
            {dashboard.dayStatus === "ACTIVE"
              ? hi
                ? "दिन सक्रिय"
                : "Day active"
              : dashboard.dayStatus === "ENDED"
                ? hi
                  ? "दिन समाप्त"
                  : "Day ended"
                : hi
                  ? "दिन शुरू नहीं हुआ"
                  : "Day not started"}
          </span>
        </div>
        {dashboard.target && (
          <dl className={styles.statGrid}>
            <div>
              <dt>{hi ? "मासिक लक्ष्य" : "Monthly target"}</dt>
              <dd>₹{dashboard.target.value.toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>{hi ? "योग्य वितरित" : "Eligible delivered"}</dt>
              <dd>₹{dashboard.target.achieved.toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>{hi ? "शेष" : "Remaining"}</dt>
              <dd>₹{dashboard.target.remaining.toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>{hi ? "उपलब्धि %" : "Achievement %"}</dt>
              <dd>{dashboard.target.achievementPct}%</dd>
            </div>
            <div>
              <dt>{hi ? "शेष दिन" : "Days remaining"}</dt>
              <dd>{dashboard.target.daysRemaining}</dd>
            </div>
            <div>
              <dt>{hi ? "आवश्यक दैनिक दर" : "Required daily run rate"}</dt>
              <dd>₹{dashboard.target.requiredDailyRunRate.toLocaleString("en-IN")}</dd>
            </div>
          </dl>
        )}
        <dl className={styles.statGrid}>
          <div>
            <dt>{hi ? "योजनाबद्ध" : "Planned"}</dt>
            <dd>{dashboard.today.planned}</dd>
          </div>
          <div>
            <dt>{hi ? "देखे गए" : "Visited"}</dt>
            <dd>{dashboard.today.visited}</dd>
          </div>
          <div>
            <dt>{hi ? "उत्पादक" : "Productive"}</dt>
            <dd>{dashboard.today.productive}</dd>
          </div>
          <div>
            <dt>{hi ? "छोड़े गए" : "Skipped"}</dt>
            <dd>{dashboard.today.skipped}</dd>
          </div>
          <div>
            <dt>{hi ? "ऑर्डर" : "Orders"}</dt>
            <dd>{dashboard.today.orders}</dd>
          </div>
          <div>
            <dt>{hi ? "बुक मूल्य" : "Booked value"}</dt>
            <dd>₹{dashboard.today.bookedValue.toLocaleString("en-IN")}</dd>
          </div>
          <div>
            <dt>{hi ? "फॉलो-अप देय" : "Follow-ups due"}</dt>
            <dd>{dashboard.today.followUpsDue}</dd>
          </div>
          <div>
            <dt>{hi ? "फ़ोटो" : "Photos"}</dt>
            <dd>{dashboard.today.photos}</dd>
          </div>
          <div>
            <dt>{hi ? "वितरक संभावना" : "Distributor prospects"}</dt>
            <dd>{dashboard.today.distributorProspects}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

const CUSTOMER_TYPES = [
  ["RETAILER", "Retailer", "खुदरा विक्रेता"],
  ["WHOLESALER", "Wholesaler", "थोक विक्रेता"],
  ["DISTRIBUTOR_PROSPECT", "Distributor prospect", "वितरक संभावना"],
  ["INSTITUTIONAL_OTHER", "Institutional / other business", "संस्थागत / अन्य व्यवसाय"],
] as const;

const WORK_TYPES = [
  ["RETAILING", "Retail Market / Beat Work", "खुदरा बाज़ार / बीट कार्य"],
  ["DISTRIBUTOR_SEARCH", "Distributor Search / Appointment", "वितरक खोज / नियुक्ति"],
  ["DISTRIBUTOR_VISIT", "Distributor Visit", "वितरक विज़िट"],
  ["WHOLESALE_MARKET", "Wholesale Market Work", "थोक बाज़ार कार्य"],
  ["OTHER", "Other Authorized Field Work", "अन्य अधिकृत फील्ड कार्य"],
] as const;

// Mirrors workflow-service.ts's WORKING_TYPES_REQUIRING_DISTRIBUTOR exactly — this is UI-side
// UX gating only (disable Start Day, show the required marker); the server independently
// re-validates the same requirement, so this list drifting would only ever produce an extra
// server-side rejection, never a security gap.
const DISTRIBUTOR_REQUIRED_WORK_TYPES: readonly WorkingType[] = ["RETAILING", "DISTRIBUTOR_VISIT"];

export function FieldJourney({
  language,
  dashboard,
  session,
  visit: rawVisit,
  beatRetailers,
  hasPublishedPlan,
  skus,
  distributorOptions,
  beatOptions,
}: {
  language: "EN" | "HI";
  dashboard: Dashboard;
  session?: { id: string; startedAt: string; workingType: string; workingDistributorId: string | null };
  visit?: Visit;
  beatRetailers: BeatRetailer[];
  hasPublishedPlan: boolean;
  skus: Sku[];
  distributorOptions: { value: string; label: string }[];
  // Final Retailer Cleanup + Handover (22-Aug): real, existing Beat nodes (never freshly typed/
  // guessed) the Executive can optionally assign at Add Customer time, so a real retailer created
  // going forward has proper geography from the start — governed the same way Beat Planner's own
  // nodes are, no second geography system.
  beatOptions: { value: string; label: string; territoryId: string }[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    fileRef = useRef<HTMLInputElement>(null),
    photoPreviewUrlRef = useRef<string | null>(null),
    // P0 21-Aug double-tap hardening (Part H): a synchronous ref, checked and set BEFORE any
    // async work starts — React's own `disabled={busy}` on the submit button only takes effect on
    // the NEXT render, which is not guaranteed to land before a second, near-simultaneous tap/
    // native form resubmit fires. This is the actual non-reentrancy guard; `busy` still drives the
    // visible disabled state for the normal single-tap case.
    checkoutSubmittingRef = useRef(false),
    dayActionSubmittingRef = useRef(false),
    [busy, setBusy] = useState(false),
    [busyLabel, setBusyLabel] = useState<string | null>(null),
    [message, setMessage] = useState<ActionMessage | null>(null),
    [mode, setMode] = useState<"ORDER" | "COLLECTION" | "PHOTO" | "FOLLOW_UP">(
      rawVisit && (rawVisit.orderCount > 0 || rawVisit.photos.length > 0) ? "PHOTO" : "ORDER",
    ),
    [orderLines, setOrderLines] = useState<OrderLine[]>([blankOrderLine("initial")]),
    [paymentType, setPaymentType] = useState<"CASH" | "CREDIT">("CREDIT"),
    // Collection capture (SR-011/SR-009): Sales Executives can never accept cash on behalf of the
    // company (recordCollection itself rejects CASH — EXECUTIVE_CASH_PROHIBITED), so the mode list
    // deliberately starts on BANK, matching the governed reference-required paths only.
    [collectionMode, setCollectionMode] = useState<"BANK" | "UPI" | "CHEQUE">("BANK"),
    [photoPreview, setPhotoPreview] = useState<string | null>(null),
    // P0 21-Aug fix: photo type is chosen BEFORE opening the camera and read directly from this
    // state at capture time, since the upload now fires automatically the instant a photo is
    // selected (see the file input's onChange below) — there is no longer a separate "Add photo"
    // form/submit step whose FormData this used to come from.
    [capturePhotoType, setCapturePhotoType] = useState("SHOPFRONT"),
    [showEndDayPreview, setShowEndDayPreview] = useState(false),
    [showAddCustomer, setShowAddCustomer] = useState(false),
    // Section-1 fix: idempotencyKey/checkInIdempotencyKey were previously generated fresh via
    // key() (crypto.randomUUID()) on EVERY call to submitAddCustomer — including a manual retry
    // after the user sees an error. If the first attempt's mutation had actually already
    // committed server-side (a network drop after the request reached the server, before the
    // response came back — a real, common mobile-network failure mode, not hypothetical), a
    // retry with a brand-new key defeats server-side idempotency entirely and creates a genuine
    // duplicate retailer+visit. Caching the keys for the CURRENT open Add Customer attempt here
    // means a retry (including the "Save anyway" duplicate-confirm path, which is a continuation
    // of the same attempt) reuses the same keys, so the server's own idempotencyKey lookup in
    // createRetailerAndCheckIn correctly recognizes it as the same intent and returns the
    // already-created record instead of creating a second one. Reset only on genuine success or
    // explicit cancel — never on a mere failed/retried attempt.
    addCustomerKeysRef = useRef<{ idempotencyKey: string; checkInIdempotencyKey: string } | null>(null),
    // Same bug, same fix, for Save Order (visit.id-scoped since a visit can legitimately have
    // multiple distinct orders — resets on genuine success so the NEXT order for this same visit
    // gets its own key, and naturally resets on visit change since the whole visit subtree remounts
    // via key={visit.id} below).
    orderKeyRef = useRef<string | null>(null),
    [duplicateWarning, setDuplicateWarning] = useState<{ similar: { id: string; businessName: string; mobile: string | null }[] } | null>(null),
    [gpsStatus, setGpsStatus] = useState<GpsStatus>("IDLE"),
    [startWorkingType, setStartWorkingType] = useState<WorkingType>("RETAILING"),
    [startWorkingDistributorId, setStartWorkingDistributorId] = useState(""),
    [pendingSyncCount, setPendingSyncCount] = useState(0),
    // Checkout already durably completes server-side before this ever gets set (see the checkout
    // handler below) — this is not an optimistic-before-success write, it's skipping an UNRELATED
    // wait: previously the screen stayed on "Loading next customer…" until the entire portal
    // server-refresh (dashboard+beat+follow-up+catalog) round-tripped, even though the beat list
    // needed to show the next retailer was already sitting in `beatRetailers` props the whole
    // time. Clearing this locally the instant checkout succeeds lets the beat list reappear
    // immediately; router.refresh() (kicked off by run()) still lands moments later in the
    // background to reconcile dashboard/beat counters, and resets this flag once real props arrive.
    [optimisticVisitCleared, setOptimisticVisitCleared] = useState(false),
    // PERFORMANCE PHASE 3: mirrors optimisticVisitCleared's reasoning in the other direction — set
    // ONLY after check-in has already durably succeeded server-side (never on the offline-queued
    // path, since that has no durable confirmation yet), from the server response's own
    // authoritative id/retailerId/checkedInAt plus retailer display fields already sitting in the
    // beatRetailers prop. Lets the active-visit workspace render immediately instead of waiting for
    // the unrelated full-portal router.refresh() to deliver the same visit back through props.
    // rawVisit (the real prop) always wins once it catches up — see the `visit` derivation below.
    [localOptimisticVisit, setLocalOptimisticVisit] = useState<Visit | null>(null),
    // FINAL PERFORMANCE PASS: same reasoning again for photo capture/delete — the durable write
    // already succeeded server-side before either of these gets touched, so this isn't showing a
    // fake result, it's just not waiting for the background router.refresh() to deliver the same
    // photo list back through `visit.photos` before the count/grid/checkout-gate reflect it.
    [localAddedPhotos, setLocalAddedPhotos] = useState<Photo[]>([]),
    [locallyDeletedPhotoIds, setLocallyDeletedPhotoIds] = useState<Set<string>>(new Set()),
    // Part A (repeat business / phone orders): a brand-new, independent order against an EXISTING
    // retailer that needs no physical check-in — "My Route" row action or the top-level launcher
    // below both just set this, no fake visit/GPS/SeeraVisit involved at any point.
    [noVisitOrder, setNoVisitOrder] = useState<{ retailerId: string; retailerName: string } | null>(null),
    [noVisitOrderLines, setNoVisitOrderLines] = useState<OrderLine[]>([blankOrderLine()]),
    [noVisitSource, setNoVisitSource] = useState<"PHONE_CALL" | "WHATSAPP" | "OTHER">("PHONE_CALL"),
    [noVisitPaymentType, setNoVisitPaymentType] = useState<"CASH" | "CREDIT">("CREDIT"),
    [retailerSearchOpen, setRetailerSearchOpen] = useState(false),
    [retailerSearchQuery, setRetailerSearchQuery] = useState(""),
    [retailerSearchResults, setRetailerSearchResults] = useState<{ id: string; businessName: string; mobile: string | null; code: string }[]>([]);

  const visit = optimisticVisitCleared ? undefined : (rawVisit ?? localOptimisticVisit ?? undefined);
  const effectivePhotos = visit ? [...visit.photos, ...localAddedPhotos].filter((p) => !locallyDeletedPhotoIds.has(p.id)) : [];

  const revokePhotoPreview = () => {
    if (!photoPreviewUrlRef.current) return;
    URL.revokeObjectURL(photoPreviewUrlRef.current);
    photoPreviewUrlRef.current = null;
  };

  useEffect(() => () => {
    if (photoPreviewUrlRef.current) URL.revokeObjectURL(photoPreviewUrlRef.current);
  }, []);

  // FieldJourney stays mounted as the SAME component instance across the whole day — moving from
  // an active visit to "Next customer", or from one customer's visit to the next, only changes
  // props (visit goes from defined -> undefined -> a new id), it never remounts the component. Without
  // this, local state (photo preview, order lines, payment type, the success/error message, the
  // uncontrolled file input's selected file) silently carries over from the previous customer —
  // showing a stale photo, a stale "saved successfully" message, or stale order data on what looks
  // like a fresh screen. Reset everything visit-scoped whenever the active visit identity changes.
  //
  // Keyed on `visit?.id` (the derived, optimistic-aware value), NOT `rawVisit?.id` directly:
  // after check-in, `localOptimisticVisit` makes `visit` resolve to the just-created visit's real
  // id immediately, while `rawVisit` itself stays undefined until the background router.refresh()
  // lands moments later. `rawVisit?.id` would then jump from undefined -> that same id, re-firing
  // this effect and wiping out any order-line edits the user already made in that window. Since
  // `visit?.id` is the SAME value throughout the optimistic-then-confirmed transition, it only
  // changes when the user genuinely moves to a different visit (or back to none) — exactly the
  // cases this reset is meant to catch.
  useEffect(() => {
    setMessage(null);
    const storageKey = visit ? `seera:field-visit:${visit.id}:mode` : null;
    const storedMode = storageKey ? sessionStorage.getItem(storageKey) : null;
    setMode(
      visit && (visit.orderCount > 0 || visit.photos.length > 0)
        ? "PHOTO"
        : storedMode === "PHOTO" || storedMode === "FOLLOW_UP"
          ? storedMode
          : "ORDER",
    );
    setOrderLines([blankOrderLine()]);
    setPaymentType("CREDIT");
    revokePhotoPreview();
    setPhotoPreview(null);
    setDuplicateWarning(null);
    setBusy(false);
    setBusyLabel(null);
    setOptimisticVisitCleared(false);
    setLocalOptimisticVisit(null);
    setLocalAddedPhotos([]);
    setLocallyDeletedPhotoIds(new Set());
    if (fileRef.current) fileRef.current.value = "";
    checkoutSubmittingRef.current = false;
    // P0 21-Aug telemetry: a leftover "in flight" marker for THIS visit means the last thing this
    // browser did was start preparing/uploading a photo and never reached a terminal outcome —
    // exactly the signature of a renderer reload during the camera-return decode/upload burst this
    // whole pass exists to fix. Fires once per mount (this effect also runs on initial mount for
    // the visit the server hands back), then clears the marker so it's not reported twice.
    if (visit && typeof sessionStorage !== "undefined") {
      const inflightKey = `seera:photo-inflight:${visit.id}`;
      if (sessionStorage.getItem(inflightKey)) {
        sessionStorage.removeItem(inflightKey);
        sendPhotoTelemetry("RENDERER_RELOAD_RESUME", { visitId: visit.id });
      }
    }
    scrollToJourneyTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit?.id]);

  useEffect(() => {
    if (visit) sessionStorage.setItem(`seera:field-visit:${visit.id}:mode`, mode);
  }, [visit, mode]);

  // Same reasoning as above, for the transition into today's very first screen once Start Day
  // succeeds (session goes from undefined to defined) — the Start Day button can sit low on the
  // page, so the freshly-rendered "Next customer" screen needs the same explicit scroll-up.
  useEffect(() => {
    if (session?.id) scrollToJourneyTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  // Part A: debounced typeahead for the top-level "+ New order" launcher (an existing retailer
  // that may not even be in today's beat) — executiveRetailerSearch already scopes to the
  // Executive's own retailer book server-side, this is just a light debounce so every keystroke
  // doesn't fire its own request.
  useEffect(() => {
    if (!retailerSearchOpen || retailerSearchQuery.trim().length < 2) {
      setRetailerSearchResults([]);
      return;
    }
    const handle = setTimeout(() => {
      void send("retailer-search", { q: retailerSearchQuery.trim() }).then((result) => {
        if (result.success) setRetailerSearchResults(result.data as { id: string; businessName: string; mobile: string | null; code: string }[]);
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [retailerSearchOpen, retailerSearchQuery]);

  const skuById = new Map(skus.map((s) => [s.id, s]));
  const brands = Array.from(new Set(skus.map((s) => s.brand))).sort();
  // Rate is editable by the Executive (Founder decision — no fixed catalog price is forced on the
  // field-order screen), so the order total is always computed from what's actually typed into
  // each line's Rate field, never silently re-derived from the catalog price behind the scenes.
  const orderTotal = orderLines.reduce((sum, line) => sum + (line.rate || 0) * (line.quantity || 0), 0);

  // Never throws — a business/validation failure is reported through `message` like any other
  // outcome, so `void run(...)` at every call site is safe with no `.catch()` required anywhere,
  // and a failed action can never surface as an unhandled-promise-rejection runtime overlay.
  const run = async (
    action: string,
    payload: Record<string, unknown>,
    offline: { entityType: string; actionType: string } | null = null,
    successText?: string,
    busyText?: string,
  ): Promise<ActionOutcome | { queued: true }> => {
    setBusy(true);
    setBusyLabel(busyText ?? null);
    setMessage(null);
    try {
      const result = await runOrQueue(action, payload, offline);
      if ("queued" in result) {
        setMessage({
          ok: true,
          text: hi
            ? "कोई नेटवर्क नहीं — कार्रवाई सुरक्षित रूप से सिंक के लिए कतार में है।"
            : "No network — action is safely queued to sync.",
        });
      } else if (result.success) {
        setMessage({
          ok: true,
          text: successText ?? (hi ? "कार्रवाई सुरक्षित रूप से सहेजी गई।" : "Action saved securely."),
        });
        router.refresh();
      } else {
        setMessage({
          ok: false,
          text: result.userMessage ?? result.message,
          nextAction: result.nextAction,
          requestId: result.requestId,
          retryable: result.retryable,
          supportRequired: result.supportRequired,
        });
      }
      return result;
    } catch (error) {
      // The governed API path normally returns ActionOutcome rather than throwing. This final
      // boundary protects the field UI from an unexpected client/IndexedDB/queue exception becoming
      // an unhandled promise rejection and ejecting the rep from the visit flow.
      const requestId = error && typeof error === "object" && "requestId" in error ? String((error as { requestId?: unknown }).requestId ?? "") : undefined;
      const text = error instanceof Error ? error.message : hi ? "कार्रवाई पूरी नहीं हो सकी। कृपया फिर से प्रयास करें।" : "The action could not be completed. Please try again.";
      setMessage({
        ok: false,
        text,
        requestId: requestId || undefined,
        retryable: true,
        supportRequired: false,
      });
      return { success: false, code: "CLIENT_ACTION_ERROR", message: text, requestId, retryable: true };
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  };

  // Native-camera resume checkpoint. Android may recreate the WebView while the camera Activity
  // is foregrounded. The URL checkpoint lets the server reconstruct this exact open visit after
  // recreation; server-side work-session ownership remains authoritative.
  function checkpointActiveVisitInUrl(visitId: string | undefined) {
    if (typeof window === "undefined" || !visitId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("activeVisitId") === visitId) return;
    url.searchParams.set("activeVisitId", visitId);
    window.history.replaceState(window.history.state, "", url.toString());
  }

  function clearActiveVisitUrl() {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("activeVisitId")) return;
    url.searchParams.delete("activeVisitId");
    window.history.replaceState(window.history.state, "", url.toString());
  }

  const photoSignatureRef = useRef<{ visitId: string; promise: Promise<SignedPhotoUpload> } | null>(null);

  function getPhotoUploadSignature(visitId: string) {
    const cached = photoSignatureRef.current;
    if (cached?.visitId === visitId) return cached.promise;
    const promise = postPhotoJson<SignedPhotoUpload>("/api/field/photos/upload-signature", { visitId });
    photoSignatureRef.current = { visitId, promise };
    return promise;
  }

  // Android camera hardening:
  // The old <input type="file" capture="environment"> path hands camera capture back through the
  // WebView's WebChromeClient. On real Android devices that can terminate/recreate the WebView while
  // returning from the camera, which is exactly the "photo -> dashboard" symptom seen in field UAT.
  // Native Capacitor Camera owns the camera Activity and returns a bounded JPEG URI instead, so the
  // web renderer never has to receive the raw camera file through an HTML file input.
  useEffect(() => {
    checkpointActiveVisitInUrl(visit?.id);
  }, [visit?.id]);

  const uploadNativeCameraResult = async (result: {
    uri?: string;
    webPath?: string;
    thumbnail?: string;
    metadata?: { format?: string; size?: number };
  }, signedOverride?: SignedPhotoUpload) => {
    if (!visit) return;
    const inflightKey = `seera:photo-inflight:${visit.id}`;
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(inflightKey, "1");
    setBusy(true);
    setBusyLabel(hi ? "फ़ोटो सहेजी जा रही है…" : "Saving photo…");
    setMessage(null);

    try {
      let blob: Blob | null = null;
      const candidateUrls = [result.webPath, result.uri ? Capacitor.convertFileSrc(result.uri) : undefined].filter(
        (value): value is string => Boolean(value),
      );

      for (const url of candidateUrls) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            const candidate = await response.blob();
            if (candidate.size > 0) {
              blob = candidate;
              break;
            }
          }
        } catch {
          // Try the next native URL representation.
        }
      }

      // Last-resort restored-result path: the Camera plugin supplies a lower-resolution thumbnail
      // specifically so an app can recover a photo after Android killed the Activity/WebView.
      if (!blob && result.thumbnail) {
        const binary = atob(result.thumbnail);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        blob = new Blob([bytes], { type: `image/${result.metadata?.format === "jpg" ? "jpeg" : result.metadata?.format ?? "jpeg"}` });
      }

      if (!blob || blob.size === 0) throw new Error(hi ? "फ़ोटो वापस नहीं मिल सकी। कृपया फिर से लें।" : "The captured photo could not be recovered. Please retake.");

      // Upload the native camera JPEG as-is. Do NOT decode it through canvas/ImageBitmap:
      // high-megapixel Android/browser devices can run out of renderer memory during a second
      // full-resolution decode. Cloudinary receives the original JPEG and the server performs the
      // authoritative size/dimension validation. Native quality 90 keeps normal evidence photos
      // materially smaller than quality 95 while preserving high visual quality.
      if (blob.size > MAX_FINAL_UPLOAD_BYTES) {
        throw new Error(hi ? "फ़ोटो 10 MB से बड़ी है। कृपया कम resolution पर दोबारा लें।" : "Photo is larger than 10 MB. Please retake at a lower camera resolution.");
      }
      if (!/^image\/jpeg$/i.test(blob.type)) {
        throw new Error(hi ? "कैमरा JPEG फ़ोटो उपलब्ध नहीं है। कृपया फिर से लें।" : "Camera did not return a JPEG photo. Please retake.");
      }

      // Do not render the full-resolution camera blob before upload. An <img> preview
      // forces Android Chrome/WebView to decode the entire original JPEG and can reproduce the
      // exact low-memory renderer failure seen in field UAT. The upload itself is a Blob/FormData
      // operation and does not require decoding the image.
      const uploadBlob = blob;
      const data = await uploadFieldPhotoDirect(visit.id, capturePhotoType, uploadBlob, signedOverride);
      setLocalAddedPhotos((current) => [...current, data]);
      revokePhotoPreview();
      setPhotoPreview(null);
      setMessage({ ok: true, text: hi ? "फ़ोटो जोड़ी गई ✓" : "Photo added ✓" });
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(inflightKey);
    } catch (error) {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(inflightKey);
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : hi ? "फ़ोटो अपलोड नहीं हो सकी। कृपया फिर से लें।" : "Photo upload failed. Please retake.",
      });
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  };

  const openNativeCamera = async () => {
    if (!visit || busy || !Capacitor.isNativePlatform()) return;
    setMessage(null);
    setBusy(true);
    setBusyLabel(hi ? "कैमरा खुल रहा है…" : "Opening camera…");
    checkpointActiveVisitInUrl(visit.id);
    // Request the signed Cloudinary upload authorization while the camera Activity is open.
    // This removes the post-capture auth/audit round-trip from the user's "Uploading…" wait.
    const signaturePromise = getPhotoUploadSignature(visit.id);
    await yieldToPaint();

    try {
      const { Camera } = await import("@capacitor/camera");
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(`seera:camera-pending:${visit.id}`, "1");
      const result = await Camera.takePhoto({
        quality: 88,
        targetWidth: 2048,
        targetHeight: 2048,
        correctOrientation: true,
        includeMetadata: true,
      });
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(`seera:camera-pending:${visit.id}`);
      await uploadNativeCameraResult(result, await signaturePromise);
    } catch (error) {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(`seera:camera-pending:${visit.id}`);
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : hi ? "कैमरा नहीं खुल सका। कृपया फिर से प्रयास करें।" : "Camera could not be opened. Please try again.",
      });
      setBusy(false);
      setBusyLabel(null);
    }
  };

  // Capacitor explicitly recommends appRestoredResult for camera activities because Android can kill
  // the app while the native camera Activity is in the foreground. Re-hydrate the returned native
  // result instead of dropping the rep at the portal dashboard after process recreation.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !visit) return;
    let cancelled = false;
    let handle: { remove: () => Promise<void> } | null = null;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const listener = await App.addListener("appRestoredResult", async (restored) => {
          if (cancelled || restored.pluginId !== "Camera" || restored.methodName !== "takePhoto") return;
          const pendingKey = `seera:camera-pending:${visit.id}`;
          if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(pendingKey)) return;
          if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(pendingKey);
          const data = (restored.data ?? {}) as {
            uri?: string;
            webPath?: string;
            thumbnail?: string;
            metadata?: { format?: string; size?: number; resolution?: string };
          };
          await uploadNativeCameraResult(data);
        });
        if (cancelled) {
          await listener.remove();
        } else {
          handle = listener;
        }
      } catch {
        // Native app plugin is optional at compile/runtime; camera failures are handled by
        // openNativeCamera and the governed error banner.
      }
    })();
    return () => {
      cancelled = true;
      if (handle) void handle.remove();
    };
  }, [visit?.id, capturePhotoType, hi]);

  // Shared by both the primary "Start visit" button (retailer not yet visited today) and the
  // secondary "Check In Again" button (retailer already has a completed visit today) — same
  // governed check-in action/API either way, so every backend rule (authorization, retailer
  // scope, and the OPEN_VISIT_EXISTS guard against a DIFFERENT retailer already being open)
  // applies identically regardless of which button was clicked. A fresh crypto.randomUUID()
  // idempotencyKey (key()) on every call means a same-day revisit always creates a genuinely
  // new, independent SeeraVisit row — the earlier completed visit is never reopened or touched.
  const startVisitFor = async (retailer: BeatRetailer) => {
    if (!session) return;
    setBusy(true);
    setGpsStatus("LOCATING");
    await yieldToPaint();
    const { status, point } = await captureGps();
    setGpsStatus(status);
    let gpsExceptionReason: string | undefined;
    if (status === "PERMISSION_DENIED" || status === "UNAVAILABLE") {
      gpsExceptionReason = window.prompt(hi ? "GPS उपलब्ध नहीं — कारण दर्ज करें" : "GPS unavailable — enter a reason") ?? undefined;
      if (!gpsExceptionReason) {
        setBusy(false);
        return;
      }
    }
    const result = await run(
      "check-in",
      {
        workSessionId: session.id,
        retailerId: retailer.id,
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy,
        gpsExceptionReason,
        idempotencyKey: key(),
      },
      { entityType: "SeeraVisit", actionType: "VISIT_DRAFT" },
      hi ? "विज़िट शुरू हुई।" : "Visit started.",
      hi ? "चेक-इन हो रहा है…" : "Checking in…",
    );
    // Only on a REAL server response confirming the durable write — never on the offline-queued
    // path, which has no durable confirmation yet. Jump straight to the active-visit workspace
    // using the response's own authoritative id/checkedInAt plus retailer fields already in
    // props, instead of waiting for the unrelated full-portal router.refresh() to deliver the
    // same visit back through props.
    if (!("queued" in result) && result.success) {
      const data = result.data as { id: string; checkedInAt: string };
      setLocalOptimisticVisit({
        id: data.id,
        retailerId: retailer.id,
        retailerName: retailer.businessName,
        retailerMobile: retailer.mobile,
        retailerArea: null,
        distributorId: retailer.distributorId,
        checkedInAt: data.checkedInAt,
        photos: [],
        orderCount: 0,
      });
    }
  };

  const header = <DashboardHeader language={language} dashboard={dashboard} />;

  // ---------------------------------------------------------------- Start Day ----
  if (!session)
    return (
      <>
        {header}
        <section className={styles.journey}>
          <header>
            <span>1</span>
            <div>
              <small>{hi ? "फील्ड दिवस" : "FIELD DAY"}</small>
              <h2>{hi ? "आज का काम शुरू करें" : "Start today’s work"}</h2>
              <p>
                {hasPublishedPlan
                  ? hi
                    ? `आज ${beatRetailers.length} खुदरा विक्रेता योजनाबद्ध हैं।`
                    : `${beatRetailers.length} customers are planned for today.`
                  : hi
                    ? "आज के लिए कोई मार्ग निर्दिष्ट नहीं किया गया है — फिर भी काम शुरू करें और ग्राहक जोड़ें।"
                    : "No route assigned for today — you can still start work and add customers as you go."}
              </p>
            </div>
          </header>
          <div>
            <strong>{hi ? "आज का कार्य प्रकार" : "Today's work type"}</strong>
            <div className={styles.workTypeGrid}>
              {WORK_TYPES.map(([value, en, hiLabel]) => (
                <label key={value} className={styles.workTypeOption} data-active={startWorkingType === value}>
                  <input
                    type="radio"
                    name="workingType"
                    value={value}
                    checked={startWorkingType === value}
                    onChange={() => setStartWorkingType(value as WorkingType)}
                  />
                  {hi ? hiLabel : en}
                </label>
              ))}
            </div>
          </div>
          {(() => {
            const distributorRequired = DISTRIBUTOR_REQUIRED_WORK_TYPES.includes(startWorkingType);
            const distributorBlocked = distributorRequired && distributorOptions.length === 0;
            return (
              <div>
                <strong>
                  {hi ? "आज का कार्यरत वितरक" : "Today's working Distributor"}
                  {distributorRequired ? " *" : hi ? " (वैकल्पिक)" : " (optional)"}
                </strong>
                {distributorOptions.length > 0 ? (
                  <select
                    value={startWorkingDistributorId}
                    onChange={(e) => setStartWorkingDistributorId(e.target.value)}
                    required={distributorRequired}
                  >
                    <option value="">{hi ? "चुनें…" : "Choose…"}</option>
                    {distributorOptions.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className={styles.note}>
                    {distributorRequired
                      ? hi
                        ? "आपके कार्य क्षेत्र में कोई वितरक असाइन नहीं है। कृपया अपने सेल्स मैनेजर/एडमिन से संपर्क करें।"
                        : "No distributor is assigned to your working area. Please contact your Sales Manager/Admin."
                      : hi
                        ? "आपके कार्य क्षेत्र में अभी कोई वितरक असाइन नहीं है — इस कार्य प्रकार के लिए आवश्यक नहीं।"
                        : "No distributor is assigned to your working area yet — not required for this work type."}
                  </p>
                )}
              </div>
            );
          })()}
          <div className={styles.gpsRow}>
            <GpsBadge language={language} status={gpsStatus} />
          </div>
          <button
            type="button"
            className={styles.primary}
            disabled={
              busy ||
              (DISTRIBUTOR_REQUIRED_WORK_TYPES.includes(startWorkingType) &&
                (distributorOptions.length === 0 || !startWorkingDistributorId))
            }
            onClick={async () => {
              // Synchronous ref guard: React's disabled={busy} lands on the next render, so two
              // fast taps can otherwise both pass before the first GPS lookup paints.
              if (dayActionSubmittingRef.current) return;
              dayActionSubmittingRef.current = true;
              // Set busy synchronously, before the GPS await, so a second tap while the (often
              // slow, permission-prompting) location lookup is in flight can't fire a second,
              // concurrent submission — that race was the actual cause of "Active workday not
              // found" / duplicate-start reports: the button only looked disabled once run()
              // itself set busy, well after captureGps() had already started.
              setBusy(true);
              setGpsStatus("LOCATING");
              await yieldToPaint();
              const { status, point } = await captureGps();
              setGpsStatus(status);
              let startExceptionReason: string | undefined;
              if (status === "PERMISSION_DENIED" || status === "UNAVAILABLE") {
                startExceptionReason =
                  window.prompt(
                    hi
                      ? "GPS उपलब्ध नहीं है। दिन शुरू करने का कारण दर्ज करें।"
                      : "GPS is not available. Enter a reason to start the day anyway.",
                  ) ?? undefined;
                if (!startExceptionReason) {
                  dayActionSubmittingRef.current = false;
                  setBusy(false);
                  return;
                }
              }
              void run(
                "start-day",
                {
                  workingType: startWorkingType,
                  latitude: point.latitude,
                  longitude: point.longitude,
                  accuracy: point.accuracy,
                  startExceptionReason,
                  remarks: "Started from field portal",
                  workingDistributorId: startWorkingDistributorId || undefined,
                },
                null,
                hi ? "दिन शुरू हुआ।" : "Day started.",
                hi ? "दिन शुरू हो रहा है…" : "Starting day…",
              ).then((result) => {
                if (!("queued" in result) && !result.success) dayActionSubmittingRef.current = false;
              });
            }}
          >
            {busy ? (busyLabel ?? (hi ? "दिन शुरू हो रहा है…" : "Starting day…")) : hi ? "दिन शुरू करें" : "Start day"}
          </button>
          <ActionMessageBanner message={message} language={language} />
        </section>
      </>
    );

  const isProspectMode = session.workingType === "DISTRIBUTOR_SEARCH" || session.workingType === "DISTRIBUTOR_VISIT";

  const addCustomerForm = (
    <section className={styles.journey}>
      <header>
        <span>+</span>
        <div>
          <small>{hi ? "नया ग्राहक" : "NEW CUSTOMER"}</small>
          <h2>{hi ? "ग्राहक जोड़ें" : "Add customer"}</h2>
          <p>
            {hi
              ? "केवल दुकान का नाम और क्षेत्र आवश्यक है। बाकी सब वैकल्पिक है।"
              : "Only the shop name and area are required. Everything else is optional."}
          </p>
        </div>
      </header>
      {duplicateWarning ? (
        <div className={styles.note}>
          <strong>{hi ? "मिलती-जुलती दुकान पहले से मौजूद है" : "A similar customer may already exist"}</strong>
          <ul>
            {duplicateWarning.similar.map((s) => (
              <li key={s.id}>
                {s.businessName} {s.mobile ? `· ${s.mobile}` : ""}
              </li>
            ))}
          </ul>
          <div className={styles.quickActions}>
            <button
              type="button"
              className={styles.primary}
              disabled={busy}
              onClick={async () => {
                const form = document.getElementById("add-customer-form") as HTMLFormElement | null;
                if (!form) return;
                await submitAddCustomer(new FormData(form), true);
              }}
            >
              {hi ? "फिर भी सहेजें" : "Save anyway"}
            </button>
            <button type="button" onClick={() => setDuplicateWarning(null)}>{hi ? "वापस" : "Back"}</button>
          </div>
        </div>
      ) : (
        <form
          id="add-customer-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await submitAddCustomer(new FormData(e.currentTarget), false);
          }}
        >
          <label>
            {hi ? "दुकान / फर्म का नाम *" : "Firm / Shop / Customer name *"}
            <input name="businessName" required />
          </label>
          <label>
            {hi ? "क्षेत्र / पता *" : "Area / Address *"}
            <input name="area" required />
          </label>
          <label>
            {hi ? "मालिक / संपर्क व्यक्ति" : "Owner / Contact person"}
            <input name="ownerName" />
          </label>
          <label>
            {hi ? "मोबाइल" : "Mobile"}
            <input name="mobile" inputMode="tel" />
          </label>
          <label>
            {hi ? "वैकल्पिक मोबाइल" : "Alternate mobile"}
            <input name="alternateMobile" inputMode="tel" />
          </label>
          <label>
            {hi ? "ग्राहक प्रकार" : "Customer type"}
            <select name="customerType" defaultValue="RETAILER">
              {CUSTOMER_TYPES.map(([value, en, hiLabel]) => (
                <option key={value} value={value}>
                  {hi ? hiLabel : en}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "पिनकोड" : "Pincode"}
            <input name="pincode" inputMode="numeric" />
          </label>
          {beatOptions.length > 0 && (
            <label>
              {hi ? "बीट / रूट (वैकल्पिक)" : "Beat / Route (optional)"}
              <select name="beatId" defaultValue="">
                <option value="">{hi ? "बाद में असाइन करें" : "Assign later"}</option>
                {beatOptions.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {hi ? "GSTIN" : "GSTIN"}
            <input name="gstin" />
          </label>
          <label>
            {hi ? "टिप्पणी" : "Notes"}
            <input name="notes" />
          </label>
          <button className={styles.primary} disabled={busy}>
            {busy ? (busyLabel ?? (hi ? "सहेज रहे हैं…" : "Saving…")) : hi ? "सहेजें और चेक-इन करें" : "Save & check in"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              addCustomerKeysRef.current = null;
              setShowAddCustomer(false);
            }}
          >
            {hi ? "रद्द करें" : "Cancel"}
          </button>
        </form>
      )}
      <ActionMessageBanner message={message} language={language} />
    </section>
  );

  // PERFORMANCE PHASE 3 (P0 Add Customer latency): previously 2 SEQUENTIAL server round trips
  // (create-retailer, then check-in only after it resolved) — collapsed into the single
  // create-retailer-and-check-in action (createRetailerAndCheckIn, field-portal-service.ts),
  // which composes both writes in one transaction server-side. Duplicate-warning handling is
  // unchanged (same SIMILAR_RETAILER_EXISTS shape, same confirmDuplicate re-submit path).
  async function submitAddCustomer(f: FormData, confirmDuplicate: boolean) {
    setBusy(true);
    setBusyLabel(hi ? "ग्राहक जोड़ा जा रहा है…" : "Adding customer…");
    setMessage(null);
    setGpsStatus("LOCATING");
    await yieldToPaint();
    const { status, point } = await captureGps();
    setGpsStatus(status);
    if (!addCustomerKeysRef.current) addCustomerKeysRef.current = { idempotencyKey: key(), checkInIdempotencyKey: key() };
    const { idempotencyKey, checkInIdempotencyKey } = addCustomerKeysRef.current;
    const result = await send("create-retailer-and-check-in", {
      businessName: String(f.get("businessName")),
      address: { area: String(f.get("area")) },
      ownerName: String(f.get("ownerName") ?? "") || undefined,
      mobile: String(f.get("mobile") ?? "") || undefined,
      alternateMobile: String(f.get("alternateMobile") ?? "") || undefined,
      customerType: String(f.get("customerType") ?? "") || undefined,
      pincode: String(f.get("pincode") ?? "") || undefined,
      gstin: String(f.get("gstin") ?? "") || undefined,
      notes: String(f.get("notes") ?? "") || undefined,
      beatId: String(f.get("beatId") ?? "") || undefined,
      territoryId: beatOptions.find((b) => b.value === String(f.get("beatId") ?? ""))?.territoryId,
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: point.accuracy,
      confirmDuplicate,
      idempotencyKey,
      workSessionId: session!.id,
      checkInIdempotencyKey,
    });
    setBusy(false);
    setBusyLabel(null);
    if (!result.success) {
      const similar = result.details?.similar as { id: string; businessName: string; mobile: string | null }[] | undefined;
      if (similar?.length) setDuplicateWarning({ similar });
      else
        setMessage({
          ok: false,
          text:
            result.code === "SIMILAR_RETAILER_EXISTS"
              ? hi
                ? "मिलती-जुलती दुकान पहले से मौजूद है। उसे खोलें या फिर भी सहेजें।"
                : "A similar customer already exists. Open it or save anyway."
              : result.message,
        });
      return;
    }
    addCustomerKeysRef.current = null;
    setDuplicateWarning(null);
    setShowAddCustomer(false);
    setMessage({ ok: true, text: hi ? "ग्राहक जोड़ा गया — विज़िट शुरू।" : "Customer added successfully — visit started." });
    // Same durable-success-gated optimistic transition as the main check-in flow — the write
    // above already completed successfully server-side before this runs.
    const data = result.data as {
      retailer: { id: string; businessName: string; mobile: string | null; distributorId: string | null };
      visit: { id: string; checkedInAt: string };
    };
    setLocalOptimisticVisit({
      id: data.visit.id,
      retailerId: data.retailer.id,
      retailerName: data.retailer.businessName,
      retailerMobile: data.retailer.mobile,
      retailerArea: null,
      distributorId: data.retailer.distributorId,
      checkedInAt: data.visit.checkedInAt,
      photos: [],
      orderCount: 0,
    });
    router.refresh();
  }

  // Part A (repeat business / phone orders): reuses the SAME governed place-order action every
  // field-visit order already goes through — no fake visit, no second "phone order" system, just
  // an explicit non-FIELD_VISIT source and no visitId. placeRetailerOrder resolves the retailer's
  // own distributor/Company-Direct entity server-side exactly as it always has.
  async function submitNoVisitOrder(notes: string) {
    if (!noVisitOrder) return;
    const skuById = new Map(skus.map((s) => [s.id, s]));
    const lines = noVisitOrderLines
      .filter((line) => line.skuId && line.quantity > 0)
      .map((line) => toBasePcLine(line, skuById));
    if (!lines.length) {
      setMessage({ ok: false, text: hi ? "कम से कम एक उत्पाद और मात्रा चुनें।" : "Choose at least one product and quantity." });
      return;
    }
    if (lines.some((line) => !(line.rate > 0))) {
      setMessage({ ok: false, text: hi ? "हर उत्पाद के लिए दर (₹0 से अधिक) दर्ज करें।" : "Enter a rate greater than ₹0 for every product." });
      return;
    }
    const outcome = await run(
      "place-order",
      {
        retailerId: noVisitOrder.retailerId,
        idempotencyKey: key(),
        notes,
        commercialPaymentType: noVisitPaymentType,
        lines,
        source: noVisitSource,
      },
      null,
      hi ? "ऑर्डर सहेजा गया।" : "Order saved.",
      hi ? "ऑर्डर सहेजा जा रहा है…" : "Saving order…",
    );
    if ("queued" in outcome || outcome.success) {
      setNoVisitOrder(null);
      setNoVisitOrderLines([blankOrderLine()]);
      setNoVisitSource("PHONE_CALL");
      setRetailerSearchOpen(false);
      setRetailerSearchQuery("");
    }
  }

  // ---------------------------------------------------------------- Next customer ----
  if (!visit)
    return (
      <>
        {header}
        {showAddCustomer ? (
          addCustomerForm
        ) : (
          <section className={styles.journey}>
            <header>
              <span>2</span>
              <div>
                <small>{hi ? "आज की बीट" : "TODAY'S WORK"}</small>
                <h2>{hi ? "अगला ग्राहक / विज़िट" : "Next customer / visit"}</h2>
                <p>
                  {hi
                    ? `दिन ${new Date(session.startedAt).toLocaleTimeString("hi-IN", { hour: "2-digit", minute: "2-digit" })} पर शुरू हुआ।`
                    : `Day started at ${new Date(session.startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`}
                </p>
              </div>
            </header>
            {gpsStatus !== "IDLE" && (
              <div className={styles.gpsRow}>
                <GpsBadge language={language} status={gpsStatus} />
              </div>
            )}
            <div className={styles.quickActions}>
              <button
                type="button"
                className={styles.addCustomerCta}
                onClick={() => {
                  setMessage(null);
                  setShowAddCustomer(true);
                  scrollToJourneyTop();
                }}
              >
                {hi ? "+ ग्राहक जोड़ें" : "+ Add customer"}
              </button>
              {/* P0 fix (Founder UAT): a relative "../prospects" href resolves to /portal/prospects
                  (one directory too high from /portal/sales-executive/today), which 404s and
                  bounces back to the dashboard — every sibling component in this codebase uses an
                  absolute path instead; FieldJourney only ever renders for sales-executive. */}
              <Link href="/portal/sales-executive/prospects">
                {hi ? "+ वितरक / संभावना विज़िट" : "+ Distributor / prospect visit"}
              </Link>
              {/* Part A4 (phone/WhatsApp order): existing retailer, no fake check-in. Opens a
                  typeahead scoped to the Executive's own retailer book (executiveRetailerSearch) —
                  works for ANY existing retailer, not only today's planned beat. */}
              <button
                type="button"
                onClick={() => {
                  setMessage(null);
                  setNoVisitOrder(null);
                  setRetailerSearchOpen(true);
                  scrollToJourneyTop();
                }}
              >
                {hi ? "+ नया ऑर्डर" : "+ New order"}
              </button>
            </div>
            {isProspectMode && (
              <p className={styles.note}>
                {hi
                  ? "आज का कार्य प्रकार वितरक खोज/विज़िट है। ऊपर 'वितरक / संभावना विज़िट' खोलें, या किसी वास्तविक दुकान पर रुकने के लिए ग्राहक जोड़ें।"
                  : "Today's work type is Distributor Search/Visit. Open “Distributor / prospect visit” above, or Add customer if you stop at an actual shop."}
              </p>
            )}
            {retailerSearchOpen && !noVisitOrder && (
              <div className={styles.note}>
                <strong>{hi ? "मौजूदा रिटेलर खोजें" : "Search an existing retailer"}</strong>
                <input
                  autoFocus
                  type="search"
                  value={retailerSearchQuery}
                  placeholder={hi ? "दुकान का नाम, कोड या मोबाइल" : "Shop name, code, or mobile"}
                  onChange={(e) => setRetailerSearchQuery(e.target.value)}
                />
                {retailerSearchResults.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => {
                      setNoVisitOrder({ retailerId: r.id, retailerName: r.businessName });
                      setNoVisitOrderLines([blankOrderLine()]);
                    }}
                  >
                    {r.businessName} · {r.code} · {r.mobile ?? (hi ? "मोबाइल नहीं" : "no mobile")}
                  </button>
                ))}
                <button type="button" className={styles.secondary} onClick={() => { setRetailerSearchOpen(false); setRetailerSearchQuery(""); }}>
                  {hi ? "रद्द करें" : "Cancel"}
                </button>
              </div>
            )}
            {noVisitOrder && (
              <form
                className={styles.note}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void submitNoVisitOrder(String(f.get("notes") ?? ""));
                }}
              >
                <strong>
                  {hi ? "नया ऑर्डर — " : "New order — "}
                  {noVisitOrder.retailerName}
                </strong>
                <label>
                  {hi ? "स्रोत" : "Source"}
                  <select value={noVisitSource} onChange={(e) => setNoVisitSource(e.target.value as "PHONE_CALL" | "WHATSAPP" | "OTHER")}>
                    <option value="PHONE_CALL">{hi ? "फ़ोन कॉल" : "Phone call"}</option>
                    <option value="WHATSAPP">{hi ? "व्हाट्सएप" : "WhatsApp"}</option>
                    <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
                  </select>
                </label>
                <OrderLineItemsEditor hi={hi} lines={noVisitOrderLines} setLines={setNoVisitOrderLines} skus={skus} />
                <label>
                  {hi ? "भुगतान प्रकार" : "Payment type"}
                  <select value={noVisitPaymentType} onChange={(e) => setNoVisitPaymentType(e.target.value as "CASH" | "CREDIT")}>
                    <option value="CREDIT">{hi ? "उधार" : "CREDIT"}</option>
                    <option value="CASH">{hi ? "नकद" : "CASH"}</option>
                  </select>
                </label>
                <label>
                  {hi ? "ऑर्डर टिप्पणी" : "Order note"}
                  <input name="notes" />
                </label>
                <button className={styles.primary} disabled={busy || !skus.length}>
                  {busy ? (busyLabel ?? (hi ? "सहेज रहे हैं…" : "Saving…")) : hi ? "ऑर्डर सहेजें" : "Save order"}
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => {
                    setNoVisitOrder(null);
                    setRetailerSearchOpen(false);
                    setRetailerSearchQuery("");
                  }}
                >
                  {hi ? "रद्द करें" : "Cancel"}
                </button>
              </form>
            )}
            {beatRetailers.length > 0 && (
              <>
                <strong>{hi ? "योजनाबद्ध ग्राहक" : "PLANNED CUSTOMERS"}</strong>
                <div className={styles.beatList}>
                  {beatRetailers.map((retailer, index) => (
                    <div className={styles.beatCard} key={retailer.id}>
                      <header>
                        <div>
                          {/* Final closure (23-Aug), Part 1: array order now reflects the frozen
                              publish-time stop sequence (see executiveBeat, field-portal-service.ts)
                              — surfaced as a visible visit-order number. */}
                          <h3>{index + 1}. {retailer.businessName}</h3>
                          <p className="meta">
                            {retailer.ownerName ?? "—"} · {retailer.mobile ?? (hi ? "मोबाइल नहीं" : "No mobile")}
                          </p>
                        </div>
                        {retailer.visitStatus && retailer.visitStatus !== "PENDING" && (
                          <span className={styles.pill} data-status={retailer.visitStatus}>
                            {retailer.visitStatus}
                          </span>
                        )}
                        {retailer.followUpAt && new Date(retailer.followUpAt) <= new Date() && (
                          <span className={styles.pill} data-status="FOLLOW_UP">
                            {hi ? "फॉलो-अप देय" : "Follow-up due"}
                          </span>
                        )}
                      </header>
                      {(!retailer.visitStatus || retailer.visitStatus === "PENDING") && (
                        <div className="rowActions">
                          <button type="button" data-primary="true" disabled={busy} onClick={() => startVisitFor(retailer)}>
                            {busy ? (busyLabel ?? (hi ? "चेक-इन हो रहा है…" : "Checking in…")) : hi ? "विज़िट शुरू करें" : "Start visit"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const reason = window.prompt(
                                hi
                                  ? "छोड़ने का कारण (दुकान बंद / अनुपलब्ध / मार्ग बाधा / आपातकाल / प्रबंधक निर्देश / अन्य)"
                                  : "Skip reason (Shop Closed / Unavailable / Route Constraint / Emergency / Manager Instruction / Other)",
                              );
                              if (!reason) return;
                              void run(
                                "skip-retailer",
                                {
                                  workSessionId: session.id,
                                  retailerId: retailer.id,
                                  reason,
                                  idempotencyKey: key(),
                                },
                                null,
                                hi ? "रिटेलर छोड़ा गया।" : "Retailer skipped.",
                              );
                            }}
                          >
                            {hi ? "छोड़ें" : "Skip"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setMessage(null);
                              setRetailerSearchOpen(false);
                              setNoVisitOrder({ retailerId: retailer.id, retailerName: retailer.businessName });
                              setNoVisitOrderLines([blankOrderLine()]);
                              scrollToJourneyTop();
                            }}
                          >
                            {hi ? "नया ऑर्डर" : "New Order"}
                          </button>
                        </div>
                      )}
                      {retailer.visitStatus && retailer.visitStatus !== "PENDING" && (
                        <div className="rowActions">
                          <button type="button" disabled={busy} onClick={() => startVisitFor(retailer)}>
                            {busy ? (busyLabel ?? (hi ? "चेक-इन हो रहा है…" : "Checking in…")) : hi ? "फिर से चेक-इन करें" : "Check In Again"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setMessage(null);
                              setRetailerSearchOpen(false);
                              setNoVisitOrder({ retailerId: retailer.id, retailerName: retailer.businessName });
                              setNoVisitOrderLines([blankOrderLine()]);
                              scrollToJourneyTop();
                            }}
                          >
                            {hi ? "नया ऑर्डर" : "New Order"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={() => {
                setShowEndDayPreview(true);
                listClientQueue()
                  .then((items) => setPendingSyncCount(items.filter((i) => !["SYNCED", "CANCELLED"].includes(i.status)).length))
                  .catch(() => {});
              }}
            >
              {hi ? "दिन समाप्त करें" : "End day"}
            </button>
            {showEndDayPreview && (
              <div className={styles.note}>
                <strong>{hi ? "दिन समाप्ति सारांश" : "End-day summary"}</strong>
                <dl className={styles.statGrid}>
                  <div>
                    <dt>{hi ? "शुरू समय" : "Start time"}</dt>
                    <dd>
                      {new Date(session.startedAt).toLocaleTimeString(hi ? "hi-IN" : "en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt>{hi ? "देखे गए" : "Visited"}</dt>
                    <dd>{dashboard.today.visited}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "उत्पादक" : "Productive"}</dt>
                    <dd>{dashboard.today.productive}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "छोड़े गए" : "Skipped"}</dt>
                    <dd>{dashboard.today.skipped}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "ऑर्डर" : "Orders"}</dt>
                    <dd>{dashboard.today.orders}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "बुक मूल्य" : "Booked value"}</dt>
                    <dd>₹{dashboard.today.bookedValue.toLocaleString("en-IN")}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "नए ग्राहक" : "New customers"}</dt>
                    <dd>{dashboard.today.newRetailers}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "वितरक संभावना" : "Distributor prospects"}</dt>
                    <dd>{dashboard.today.distributorProspects}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "फ़ोटो" : "Photos"}</dt>
                    <dd>{dashboard.today.photos}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "फॉलो-अप देय" : "Follow-ups due"}</dt>
                    <dd>{dashboard.today.followUpsDue}</dd>
                  </div>
                  <div>
                    <dt>{hi ? "सिंक लंबित" : "Pending sync"}</dt>
                    <dd>{pendingSyncCount}</dd>
                  </div>
                </dl>
                {pendingSyncCount > 0 && (
                  <p className={styles.note}>
                    {hi
                      ? `${pendingSyncCount} आइटम अभी भी सिंक होना बाकी है — पुष्टि करने पर पहले सिंक करने की कोशिश की जाएगी। यह डेटा सुरक्षित है और नेटवर्क वापस आने पर बाद में भी सिंक हो सकता है।`
                      : `${pendingSyncCount} item(s) still need to sync — confirming will try to sync first. This data is safe and can also sync later once you're back online.`}
                  </p>
                )}
                <div className={styles.quickActions}>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      // Best-effort: try to drain the local offline queue before ending the day,
                      // so pending visits/orders/photos are synchronized where possible rather
                      // than silently left behind. Never blocks End Day indefinitely — a real
                      // network outage just leaves items PENDING (still safe, still queued) and
                      // the flow continues; only a hung network call could stall this, same risk
                      // any fetch already carries.
                      if (typeof navigator !== "undefined" && navigator.onLine) {
                        setBusyLabel(hi ? "पहले सिंक हो रहा है…" : "Syncing first…");
                        await syncClientQueue().catch(() => {});
                      }
                      setGpsStatus("LOCATING");
                      await yieldToPaint();
                      const { status, point } = await captureGps();
                      setGpsStatus(status);
                      let endExceptionReason: string | undefined;
                      if (status === "PERMISSION_DENIED" || status === "UNAVAILABLE") {
                        endExceptionReason =
                          window.prompt(
                            hi ? "GPS उपलब्ध नहीं — कारण दर्ज करें" : "GPS unavailable — enter a reason",
                          ) ?? undefined;
                        if (!endExceptionReason) {
                          setBusy(false);
                          return;
                        }
                      }
                      // Section-2 hard-state-correction fix: run()'s router.refresh() alone does
                      // not clear this component's own local useState — without explicitly
                      // resetting it here, showEndDayPreview stays true forever after a SUCCESSFUL
                      // end-day, so this whole summary panel (including the "Confirm & end day"
                      // button itself) kept rendering, letting the same session be ended again.
                      // Only reset on genuine success — a failed/offline-queued end-day should
                      // leave the preview open so the user can see what happened and retry.
                      const outcome = await run(
                        "end-day",
                        {
                          sessionId: session.id,
                          outcome: "COMPLETED",
                          latitude: point.latitude,
                          longitude: point.longitude,
                          accuracy: point.accuracy,
                          endExceptionReason,
                          remarks: "Completed from field portal",
                        },
                        { entityType: "SeeraWorkSession", actionType: "DAY_END_DRAFT" },
                        hi ? "दिन समाप्त हुआ।" : "Day ended.",
                        hi ? "दिन समाप्त हो रहा है…" : "Ending day…",
                      );
                      if (!("queued" in outcome) && outcome.success) setShowEndDayPreview(false);
                    }}
                  >
                    {busy ? (busyLabel ?? (hi ? "दिन समाप्त हो रहा है…" : "Ending day…")) : hi ? "पुष्टि करें और समाप्त करें" : "Confirm & end day"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setShowEndDayPreview(false)}>{hi ? "वापस" : "Back"}</button>
                </div>
              </div>
            )}
            <ActionMessageBanner message={message} language={language} />
          </section>
        )}
      </>
    );

  const currentDistributorId = beatRetailers.find((r) => r.id === visit.retailerId)?.distributorId ?? visit.distributorId;

  return (
    <>
      {header}
      {/* Keyed by visit.id: this is the hard state boundary the checkout->next-customer flow
          needs. React fully unmounts and remounts this whole subtree whenever the active visit
          changes identity (a new check-in, or going back to no visit at all) — which clears every
          uncontrolled input (order note, checkout note/reason fields, follow-up note) that the
          visit?.id useEffect above can't reach, since those inputs live in plain DOM, not React
          state. Without this, Customer B's order form could silently start with Customer A's typed
          note still sitting in the field. */}
      <section className={styles.journey} key={visit.id}>
        <header>
          <span>3</span>
          <div>
            <small>{hi ? "सक्रिय विज़िट" : "ACTIVE VISIT"}</small>
            <h2>{visit.retailerName}</h2>
            <p>
              {visit.retailerMobile ?? (hi ? "मोबाइल उपलब्ध नहीं" : "No mobile")}
              {visit.retailerArea ? ` · ${visit.retailerArea}` : ""} ·{" "}
              {hi ? "चेक-इन" : "Checked in"}{" "}
              {new Date(visit.checkedInAt).toLocaleTimeString(hi ? "hi-IN" : "en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </header>
        <div className={styles.tabs}>
          {(["ORDER", "COLLECTION", "PHOTO", "FOLLOW_UP"] as const).map((x) => (
            <button type="button" key={x} data-active={mode === x} onClick={() => setMode(x)}>
              {x === "ORDER"
                ? hi
                  ? "ऑर्डर"
                  : "Order"
                : x === "COLLECTION"
                  ? hi
                    ? "कलेक्शन"
                    : "Collection"
                  : x === "PHOTO"
                    ? hi
                      ? "फ़ोटो"
                      : "Photo"
                    : hi
                      ? "फॉलो-अप"
                      : "Follow-up"}
            </button>
          ))}
        </div>
        {mode === "ORDER" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const skuById = new Map(skus.map((s) => [s.id, s]));
              const lines = orderLines
                .filter((line) => line.skuId && line.quantity > 0)
                .map((line) => toBasePcLine(line, skuById));
              if (!lines.length) {
                setMessage({
                  ok: false,
                  text: hi ? "कम से कम एक उत्पाद और मात्रा चुनें।" : "Choose at least one product and quantity.",
                });
                return;
              }
              if (lines.some((line) => !(line.rate > 0))) {
                setMessage({
                  ok: false,
                  text: hi ? "हर उत्पाद के लिए दर (₹0 से अधिक) दर्ज करें।" : "Enter a rate greater than ₹0 for every product.",
                });
                return;
              }
              void (async () => {
                if (!orderKeyRef.current) orderKeyRef.current = key();
                const outcome = await run(
                  "place-order",
                  {
                    retailerId: visit.retailerId,
                    commercialPartyId: currentDistributorId,
                    idempotencyKey: orderKeyRef.current,
                    notes: String(f.get("notes") ?? ""),
                    commercialPaymentType: paymentType,
                    lines,
                    source: "FIELD_VISIT",
                    visitId: visit.id,
                  },
                  {
                    entityType: "SeeraSalesOrder",
                    actionType: "ORDER_DRAFT",
                  },
                  hi ? "ऑर्डर सहेजा गया।" : "Order saved.",
                  hi ? "ऑर्डर सहेजा जा रहा है…" : "Saving order…",
                );
                // Save Order should flow straight into Photo, not leave the Executive on the
                // same tab (final UI reachability audit fix) — advance on both a live success and
                // an offline-queued outcome, since either means the order step is done. A genuine
                // success also means this key's job is done — reset so a second, distinct order
                // for this same visit gets its own key instead of resolving to this one's result.
                if ("queued" in outcome || outcome.success) {
                  orderKeyRef.current = null;
                  setMode("PHOTO");
                }
              })();
            }}
          >
            <OrderLineItemsEditor hi={hi} lines={orderLines} setLines={setOrderLines} skus={skus} />
            <label>
              {hi ? "भुगतान प्रकार" : "Payment type"}
              <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as "CASH" | "CREDIT")}>
                <option value="CREDIT">{hi ? "उधार" : "CREDIT"}</option>
                <option value="CASH">{hi ? "नकद" : "CASH"}</option>
              </select>
            </label>
            <label>
              {hi ? "ऑर्डर टिप्पणी" : "Order note"}
              <input name="notes" />
            </label>
            <button className={styles.primary} disabled={busy || !skus.length}>
              {busy ? (busyLabel ?? (hi ? "सहेज रहे हैं…" : "Saving…")) : hi ? "ऑर्डर सहेजें" : "Save order"}
            </button>
          </form>
        )}
        {mode === "COLLECTION" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const amount = Number(f.get("amount"));
              const reference = String(f.get("reference") ?? "").trim();
              if (!(amount > 0)) {
                setMessage({ ok: false, text: hi ? "राशि ₹0 से अधिक दर्ज करें।" : "Enter an amount greater than ₹0." });
                return;
              }
              if (!reference) {
                setMessage({
                  ok: false,
                  text: hi ? "बैंक, UPI या चेक संदर्भ आवश्यक है।" : "A bank, UPI or cheque reference is required.",
                });
                return;
              }
              void run(
                "collection",
                {
                  retailerId: visit.retailerId,
                  amount,
                  paymentMode: collectionMode,
                  reference,
                  remarks: String(f.get("remarks") ?? "") || undefined,
                  idempotencyKey: key(),
                },
                { entityType: "SeeraCollectionEntry", actionType: "COLLECTION_DRAFT" },
                hi ? "कलेक्शन दर्ज किया गया।" : "Collection recorded.",
                hi ? "कलेक्शन दर्ज हो रहा है…" : "Recording collection…",
              );
            }}
          >
            <p className={styles.note}>
              {hi
                ? "एक्ज़िक्यूटिव नकद स्वीकार नहीं कर सकते — बैंक, UPI या चेक संदर्भ आवश्यक है।"
                : "Executives cannot accept cash — a bank, UPI or cheque reference is required."}
            </p>
            <label>
              {hi ? "राशि" : "Amount"}
              <input name="amount" type="number" min="1" step="0.01" required />
            </label>
            <label>
              {hi ? "भुगतान माध्यम" : "Payment mode"}
              <select value={collectionMode} onChange={(e) => setCollectionMode(e.target.value as "BANK" | "UPI" | "CHEQUE")}>
                <option value="BANK">{hi ? "बैंक ट्रांसफर" : "Bank transfer"}</option>
                <option value="UPI">UPI</option>
                <option value="CHEQUE">{hi ? "चेक" : "Cheque"}</option>
              </select>
            </label>
            <label>
              {hi ? "संदर्भ (UTR / UPI / चेक नंबर)" : "Reference (UTR / UPI / cheque no.)"}
              <input name="reference" required />
            </label>
            <label>
              {hi ? "टिप्पणी" : "Remarks"}
              <input name="remarks" />
            </label>
            <button className={styles.primary} disabled={busy}>
              {busy ? (busyLabel ?? (hi ? "सहेज रहे हैं…" : "Saving…")) : hi ? "कलेक्शन सहेजें" : "Save collection"}
            </button>
          </form>
        )}
        {mode === "PHOTO" && (
          <div>
            <div className={styles.photoGrid}>
              {effectivePhotos.map((photo) => (
                <div className={styles.photoThumb} key={photo.id}>
                  <img src={photo.secureUrl ?? `/api/field/photos/${photo.id}`} alt={photo.photoType} />
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={hi ? "हटाएँ" : "Remove"}
                    onClick={async () => {
                      const reason = window.prompt(hi ? "हटाने का कारण" : "Reason for removing this photo");
                      if (!reason) return;
                      const result = await run("delete-photo", { photoId: photo.id, reason }, null, hi ? "फ़ोटो हटाई गई।" : "Photo removed.");
                      if (!("queued" in result) && result.success)
                        setLocallyDeletedPhotoIds((current) => new Set(current).add(photo.id));
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <label>
              {hi ? "फ़ोटो प्रकार" : "Photo type"}
              <select
                value={capturePhotoType}
                disabled={busy}
                onChange={(event) => setCapturePhotoType(event.target.value)}
              >
                <option value="SHOPFRONT">{hi ? "दुकान का सामने का हिस्सा" : "Shopfront"}</option>
                <option value="COUNTER">{hi ? "काउंटर" : "Counter"}</option>
                <option value="PRODUCT_DISPLAY">{hi ? "उत्पाद प्रदर्शन" : "Product display"}</option>
                <option value="BANNER_BRANDING">{hi ? "बैनर / ब्रांडिंग" : "Banner / branding"}</option>
                <option value="MERCHANDISING">{hi ? "मर्चेंडाइजिंग" : "Merchandising"}</option>
                <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
              </select>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg"
              capture="environment"
              style={{ display: "none" }}
              onChange={(event) => {
                setMessage(null);
                const file = event.target.files?.[0];
                if (!file) return;
                revokePhotoPreview();
                setPhotoPreview(null);
                // P0 21-Aug fix (real founder UAT evidence): the upload used to wait for a SEPARATE
                // "Add photo" tap after the camera returned a file. That gap was exactly wide enough
                // for a native-camera return + an arriving WhatsApp notification + a mobile browser
                // reclaiming the tab to strand an un-persisted photo the user believed was already
                // saved. Uploading begins the instant a photo is captured/selected — no second
                // required action.
                // P0 21-Aug screen-recording regression fix: the original file is decoded at most
                // twice total (see preparePhotoDerivatives above — the preview is derived from the
                // already-bounded upload canvas, never a second decode of the original), and a real
                // browser yield separates preview render from the network upload below, so this
                // still-single-tap flow can't stack two back-to-back decode bursts with zero
                // breathing room the way the immediately-prior version did.
                void (async () => {
                  setBusy(true);
                  setBusyLabel(hi ? "फ़ोटो तैयार हो रही है…" : "Preparing photo…");
                  // Start authorization immediately while the browser prepares the JPEG, so the
                  // upload path does not pay the signature/audit round-trip after preparation.
                  const signaturePromise = getPhotoUploadSignature(visit.id);
                  await yieldToPaint();
                  const prepStart = performance.now();
                  const inflightKey = `seera:photo-inflight:${visit.id}`;
                  // Set BEFORE any decode work starts — a renderer reload any time between here and
                  // the matching clear below (on any terminal outcome) leaves this marker behind for
                  // the next mount's RENDERER_RELOAD_RESUME check to find.
                  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(inflightKey, "1");
                  sendPhotoTelemetry("IMAGE_PREP_START", { visitId: visit.id, sourceMime: file.type, sourceBytes: file.size });
                  let derivatives: { uploadBlob: Blob; previewBlob: Blob; sourceWidth?: number; sourceHeight?: number };
                  try {
                    derivatives = await preparePhotoDerivatives(file);
                  } catch (error) {
                    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(inflightKey);
                    sendPhotoTelemetry("IMAGE_PREP_FAILED", {
                      visitId: visit.id,
                      elapsedMs: Math.round(performance.now() - prepStart),
                      errorCode: error instanceof Error ? error.message.slice(0, 64) : "unknown",
                      sourceMime: file.type,
                      sourceBytes: file.size,
                    });
                    setBusy(false);
                    setBusyLabel(null);
                    setMessage({ ok: false, text: error instanceof Error ? error.message : PHOTO_PREP_FAILED_MESSAGE });
                    return;
                  }
                  sendPhotoTelemetry("IMAGE_PREP_SUCCESS", {
                    visitId: visit.id,
                    elapsedMs: Math.round(performance.now() - prepStart),
                    sourceMime: file.type,
                    sourceBytes: file.size,
                    sourceWidth: derivatives.sourceWidth,
                    sourceHeight: derivatives.sourceHeight,
                    outputBytes: derivatives.uploadBlob.size,
                  });
                  // Do not decode/render the full-resolution original before upload.
                  // The saved Cloudinary URL becomes the authoritative preview after finalize.
                  setBusyLabel(hi ? "फ़ोटो अपलोड हो रही है…" : "Uploading photo…");
                  // Let the browser paint the preview and reclaim the decode/canvas memory from the
                  // pass above before the network upload starts — the exact breathing room the
                  // prior two-tap flow gave for free, restored explicitly instead of depending on a
                  // second user gesture to create it.
                  await yieldToPaint();
                  try {
                    const data = await uploadFieldPhotoDirect(visit.id, capturePhotoType, derivatives.uploadBlob, await signaturePromise);
                    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(inflightKey);
                    setLocalAddedPhotos((current) => [...current, data]);
                    revokePhotoPreview();
                    setPhotoPreview(null);
                    if (fileRef.current) fileRef.current.value = "";
                    setMessage({ ok: true, text: hi ? "फ़ोटो जोड़ी गई ✓" : "Photo added ✓" });
                  } catch (error) {
                    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(inflightKey);
                    // Uploaded/finalized rows remain the ONLY authoritative "saved" state (matches
                    // checkout's own server-side count) — a failed upload here must never be
                    // reported as success. The preview + selected file are kept so "Retake" can
                    // immediately retry without reopening the camera from scratch.
                    setMessage({
                      ok: false,
                      text:
                        (error instanceof Error ? error.message : hi ? "फ़ोटो अपलोड नहीं हो सकी। कृपया फिर से लें।" : "Photo upload failed. Please retake.") +
                        (hi ? " (फ़ोटो अभी सहेजी नहीं गई है)" : " (Photo is NOT saved yet)"),
                    });
                  }
                  setBusy(false);
                  setBusyLabel(null);
                })();
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (Capacitor.isNativePlatform()) void openNativeCamera();
                else fileRef.current?.click();
              }}
            >
              {hi ? "कैमरा खोलें" : "Open camera"}
            </button>
            {photoPreview && (
              <div>
                <img src={photoPreview} alt="" style={{ maxWidth: 220, borderRadius: 10 }} />
                <p className={styles.note}>
                  {busy
                    ? busyLabel ?? (hi ? "अपलोड हो रहा है…" : "Uploading…")
                    : hi
                      ? "अपलोड विफल — यह फ़ोटो अभी सहेजी नहीं गई है।"
                      : "Upload failed — this photo is NOT saved yet."}
                </p>
                <div className={styles.quickActions}>
                  <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
                    {hi ? "फिर से लें" : "Retake"}
                  </button>
                </div>
              </div>
            )}
            <p className={styles.note}>
              {hi
                ? "फ़ोटो नहीं ले सकते? चेकआउट पर कारण दर्ज करें (रिटेलर ने मना किया / कैमरा खराब / आपातकाल / प्रबंधक-स्वीकृत छूट / अन्य)।"
                : "Can’t take a photo? Record a reason at checkout (Retailer refused / Camera issue / Emergency / Manager-approved exception / Other)."}
            </p>
          </div>
        )}
        {mode === "FOLLOW_UP" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(
                "create-follow-up",
                {
                  type: String(f.get("type")),
                  retailerId: visit.retailerId,
                  visitId: visit.id,
                  dueDate: String(f.get("dueDate")),
                  priority: String(f.get("priority")),
                  note: String(f.get("note")),
                  idempotencyKey: key(),
                },
                { entityType: "SeeraFollowUp", actionType: "FOLLOW_UP_DRAFT" },
                hi ? "फॉलो-अप सहेजा गया।" : "Follow-up saved.",
                hi ? "फॉलो-अप सहेजा जा रहा है…" : "Saving follow-up…",
              );
            }}
          >
            <label>
              {hi ? "प्रकार" : "Type"}
              <select name="type">
                <option value="RETAIL_ORDER">{hi ? "खुदरा ऑर्डर" : "Retail order"}</option>
                <option value="PAYMENT">{hi ? "भुगतान" : "Payment"}</option>
                <option value="DISTRIBUTOR">{hi ? "वितरक" : "Distributor"}</option>
                <option value="PROSPECT">{hi ? "संभावना" : "Prospect"}</option>
                <option value="COMPLAINT">{hi ? "शिकायत" : "Complaint"}</option>
                <option value="PRODUCT_AVAILABILITY">{hi ? "उत्पाद उपलब्धता" : "Product availability"}</option>
                <option value="SAMPLE_FEEDBACK">{hi ? "नमूना प्रतिक्रिया" : "Sample feedback"}</option>
                <option value="RETURN_ISSUE">{hi ? "वापसी / समस्या" : "Return / issue"}</option>
                <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
              </select>
            </label>
            <label>
              {hi ? "देय तिथि" : "Due date"}
              <input name="dueDate" type="date" required />
            </label>
            <label>
              {hi ? "प्राथमिकता" : "Priority"}
              <select name="priority">
                <option value="NORMAL">{hi ? "सामान्य" : "Normal"}</option>
                <option value="HIGH">{hi ? "उच्च" : "High"}</option>
              </select>
            </label>
            <label>
              {hi ? "टिप्पणी" : "Note"}
              <input name="note" required />
            </label>
            <button className={styles.primary} disabled={busy}>
              {busy ? (busyLabel ?? (hi ? "सहेज रहे हैं…" : "Saving…")) : hi ? "फॉलो-अप सहेजें" : "Save follow-up"}
            </button>
          </form>
        )}
        <div className={styles.note}>
          <strong>{hi ? "विज़िट सारांश" : "Visit summary"}</strong>
          <p>
            {hi ? "ऑर्डर कुल" : "Order total"}: ₹{orderTotal.toFixed(2)} ·{" "}
            {hi ? "भुगतान" : "Payment"}: {paymentType} · {hi ? "फ़ोटो" : "Photos"}: {effectivePhotos.length}
          </p>
          {gpsStatus !== "IDLE" && (
            <div className={styles.gpsRow}>
              <GpsBadge language={language} status={gpsStatus} />
            </div>
          )}
        </div>
        <form
          className={styles.checkout}
          onSubmit={(e) => {
            e.preventDefault();
            // P0 21-Aug double-tap hardening (Part H): checked and set synchronously, before
            // anything else — the real production incident this fixes was a second checkout
            // submission racing the first (whether from a double-tap or a slow-response resend)
            // and getting rejected with "Active visit unavailable" even though the first had
            // already succeeded.
            if (checkoutSubmittingRef.current) return;
            checkoutSubmittingRef.current = true;
            const f = new FormData(e.currentTarget),
              deviation = String(f.get("routeDeviationReason") ?? ""),
              // P0 21-Aug checkout idempotency (Part F/G): deterministically derived from the
              // visit's own id, NOT a fresh random key per tap — a visit can only ever be
              // legitimately checked out once, so every submission attempt for THIS visit
              // (a genuine retry after a failure, a double-tap that slips past the ref guard
              // above, or an offline-queue replay racing a direct send) carries the IDENTICAL key,
              // letting the server treat all of them as the same intent instead of only literal
              // simultaneous clicks.
              checkoutIdempotencyKey = `checkout:${visit.id}`;
            void (async () => {
              setBusy(true);
              setBusyLabel(hi ? "विज़िट पूरी हो रही है…" : "Completing visit…");
              setGpsStatus("LOCATING");
              await yieldToPaint();
              const { status, point } = await captureGps();
              setGpsStatus(status);
              if (deviation) await run("route-deviation", { visitId: visit.id, reason: deviation });
              const result = await run(
                "check-out",
                {
                  visitId: visit.id,
                  outcome: String(f.get("outcome")),
                  noOrderReason: String(f.get("noOrderReason") ?? "") || undefined,
                  followUpAt: String(f.get("followUpAt") ?? "") || undefined,
                  notes: String(f.get("notes") ?? ""),
                  photoExceptionReason: String(f.get("photoExceptionReason") ?? "") || undefined,
                  latitude: point.latitude,
                  longitude: point.longitude,
                  accuracy: point.accuracy,
                  idempotencyKey: checkoutIdempotencyKey,
                },
                { entityType: "SeeraVisit", actionType: "VISIT_CHECK_OUT" },
                hi ? "विज़िट पूरी हुई।" : "Visit completed.",
                hi ? "विज़िट पूरी हो रही है…" : "Completing visit…",
              );
              // Checkout has already durably succeeded server-side at this point (or is safely
              // queued offline) — jump straight to the beat list using data already in props
              // instead of waiting for the unrelated full-portal router.refresh() that run() also
              // kicked off. That refresh still lands moments later in the background to reconcile
              // dashboard/beat counters; the rawVisit?.id effect resets this flag once it does.
              if ("queued" in result || result.success) {
                clearActiveVisitUrl();
                // P0 21-Aug stale-visit fix (Part K): clear the local optimistic visit + this
                // visit's own sessionStorage mode marker immediately, synchronously with success —
                // do not leave the just-closed visit's screen/state actionable while
                // router.refresh() is still in flight in the background. checkoutSubmittingRef is
                // deliberately NOT reset here: this visit is now closed and this exact form
                // instance must never submit again (the next visit gets a fresh ref value via the
                // reset effect below, keyed on visit?.id).
                sessionStorage.removeItem(`seera:field-visit:${visit.id}:mode`);
                setOptimisticVisitCleared(true);
              } else {
                // Only a genuine failure re-arms the guard — a legitimate retry (same
                // checkoutIdempotencyKey) must be allowed to reach the server again.
                checkoutSubmittingRef.current = false;
              }
            })();
          }}
        >
          <label>
            {hi ? "विज़िट परिणाम" : "Visit outcome"}
            <select name="outcome">
              <option value="ORDER_BOOKED">{hi ? "ऑर्डर बुक किया गया" : "Order booked"}</option>
              <option value="FOLLOW_UP">{hi ? "फॉलो-अप" : "Follow up"}</option>
              <option value="NO_ORDER">{hi ? "कोई ऑर्डर नहीं" : "No order"}</option>
              <option value="MARKET_INTELLIGENCE">{hi ? "बाज़ार जानकारी" : "Market intelligence"}</option>
            </select>
          </label>
          <label>
            {hi ? "कारण (यदि कोई ऑर्डर नहीं)" : "Reason (if no order)"}
            <input name="noOrderReason" />
          </label>
          <label>
            {hi ? "फॉलो-अप तिथि (वैकल्पिक)" : "Follow-up date (optional)"}
            <input name="followUpAt" type="date" />
          </label>
          <label>
            {hi ? "विज़िट टिप्पणी" : "Visit note"}
            <input name="notes" />
          </label>
          {effectivePhotos.length === 0 && (
            <label>
              {hi ? "फ़ोटो न होने का कारण" : "Reason no photo was taken"}
              <select name="photoExceptionReason" defaultValue="">
                <option value="">{hi ? "फ़ोटो संलग्न है" : "Photo attached"}</option>
                <option value="RETAILER_REFUSED">{hi ? "रिटेलर ने मना किया" : "Retailer refused"}</option>
                <option value="CAMERA_ISSUE">{hi ? "कैमरा / डिवाइस समस्या" : "Camera / device issue"}</option>
                <option value="EMERGENCY">{hi ? "आपातकाल" : "Emergency"}</option>
                <option value="MANAGER_APPROVED">{hi ? "प्रबंधक-स्वीकृत छूट" : "Manager-approved exception"}</option>
                <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
              </select>
            </label>
          )}
          <label>
            {hi ? "मार्ग विचलन (यदि लागू हो)" : "Route deviation (if applicable)"}
            <select name="routeDeviationReason" defaultValue="">
              <option value="">{hi ? "कोई विचलन नहीं" : "No deviation"}</option>
              <option value="NEW_OUTLET_OPPORTUNITY">{hi ? "नया आउटलेट अवसर" : "New outlet opportunity"}</option>
              <option value="URGENT_PAYMENT_FOLLOW_UP">{hi ? "अत्यावश्यक भुगतान फॉलो-अप" : "Urgent payment follow-up"}</option>
              <option value="SHOP_CLOSURE">{hi ? "दुकान बंद" : "Shop closure"}</option>
              <option value="ROAD_TRAFFIC">{hi ? "सड़क / यातायात" : "Road / traffic"}</option>
              <option value="MANAGER_INSTRUCTION">{hi ? "प्रबंधक निर्देश" : "Manager instruction"}</option>
              <option value="EMERGENCY">{hi ? "आपातकाल" : "Emergency"}</option>
              <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
            </select>
          </label>
          <button className={styles.secondary} disabled={busy}>
            {busy ? (busyLabel ?? (hi ? "हो रहा है…" : "Working…")) : hi ? "चेकआउट और अगला ग्राहक" : "Checkout & next customer"}
          </button>
        </form>
        <ActionMessageBanner message={message} language={language} />
      </section>
    </>
  );
}
