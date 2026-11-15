"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

// One way to download / share a file everywhere in the Seera portal.
//
// - Seera Android app (v1.0.3+): the page fetches the file with its own session and hands the
//   bytes to the native SeeraFiles plugin, which saves it in Downloads/Seera and opens it, or
//   opens WhatsApp directly with the file attached. (A WebView by itself ignores target="_blank"
//   links and blob: downloads — that is why downloads "did nothing" in the app.)
// - Older app without the plugin: falls back to a normal navigation, which the old shell's
//   DownloadManager hook handles, and tells the user to update.
// - Normal browser: a regular download; sharing uses the phone's share sheet (Web Share API).

type SeeraFiles = {
  save(o: { base64: string; fileName: string; mimeType: string; open?: boolean }): Promise<{ location: string; fileName: string; opened: boolean }>;
  share(o: { base64: string; fileName: string; mimeType: string; text?: string; target?: "whatsapp" | "any" }): Promise<{ app: string }>;
};
const SeeraFilesNative = registerPlugin<SeeraFiles>("SeeraFiles");

export const isNativeApp = () => Capacitor.isNativePlatform();
export const hasNativeFiles = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("SeeraFiles");

export type FileResult = { ok: true; message: string } | { ok: false; message: string };

function fileNameFrom(res: Response, fallback: string) {
  const cd = res.headers.get("Content-Disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1];
  if (star) {
    try {
      return decodeURIComponent(star);
    } catch {
      /* fall through */
    }
  }
  return /filename="?([^";]+)"?/i.exec(cd)?.[1]?.trim() || fallback;
}

export async function fetchFile(url: string, fallbackName = "Seera-file.pdf"): Promise<{ blob: Blob; fileName: string }> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const body = (await res.clone().json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  return { blob, fileName: fileNameFrom(res, fallbackName) };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(blob);
  });
}

const mimeOf = (blob: Blob, fileName: string) =>
  blob.type && blob.type !== "application/octet-stream"
    ? blob.type.split(";")[0]!
    : /\.pdf$/i.test(fileName)
      ? "application/pdf"
      : /\.csv$/i.test(fileName)
        ? "text/csv"
        : /\.xlsx$/i.test(fileName)
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/octet-stream";

function browserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function saveBlob(blob: Blob, fileName: string): Promise<FileResult> {
  if (hasNativeFiles()) {
    const r = await SeeraFilesNative.save({ base64: await blobToBase64(blob), fileName, mimeType: mimeOf(blob, fileName), open: true });
    return { ok: true, message: `✓ Saved in ${r.location} / ${r.location} में सेव हुआ` };
  }
  browserDownload(blob, fileName);
  return { ok: true, message: "✓ Downloaded / डाउनलोड हो गया" };
}

export async function downloadUrl(url: string, fallbackName?: string): Promise<FileResult> {
  if (isNativeApp() && !hasNativeFiles()) {
    // Old app: let the shell's DownloadManager hook take it, and ask for the update.
    window.location.href = url;
    return { ok: true, message: "Downloading… If nothing arrives, please update the Seera app. / डाउनलोड नहीं हो तो Seera ऐप अपडेट करें।" };
  }
  try {
    const { blob, fileName } = await fetchFile(url, fallbackName);
    return await saveBlob(blob, fileName);
  } catch (e) {
    return { ok: false, message: `${e instanceof Error ? e.message : "Download failed"} — try again / फिर कोशिश करें` };
  }
}

// Share a file, straight into WhatsApp in the app. `source` is a URL to fetch or a ready Blob.
export async function shareFile(source: string | Blob, opts: { fileName?: string; text?: string; title?: string; whatsapp?: boolean } = {}): Promise<FileResult> {
  try {
    const { blob, fileName } = typeof source === "string" ? await fetchFile(source, opts.fileName) : { blob: source, fileName: opts.fileName ?? "Seera-file" };
    const mimeType = mimeOf(blob, fileName);
    if (hasNativeFiles()) {
      const r = await SeeraFilesNative.share({ base64: await blobToBase64(blob), fileName, mimeType, text: opts.text, target: opts.whatsapp === false ? "any" : "whatsapp" });
      return { ok: true, message: r.app === "chooser" ? "Choose WhatsApp to send / WhatsApp चुनें" : "✓ WhatsApp opened / WhatsApp खुल गया" };
    }
    if (isNativeApp()) {
      // Old app (no SeeraFiles plugin): its DownloadManager hook saves the PDF to Downloads, then
      // WhatsApp is opened (wa.me leaves the app and opens WhatsApp) so the user attaches it with 📎.
      if (typeof source !== "string") return { ok: false, message: "Update the Seera app to share this file. / यह फ़ाइल भेजने के लिए Seera ऐप अपडेट करें।" };
      window.location.href = source;
      window.setTimeout(() => {
        window.location.href = `https://wa.me/?text=${encodeURIComponent(opts.text ?? "Seera")}`;
      }, 2500);
      return { ok: true, message: "PDF is downloading — WhatsApp will open: choose the chat → 📎 → Document → Downloads. / PDF डाउनलोड हो रही है — WhatsApp खुलेगा: चैट चुनें → 📎 → Document → Downloads से PDF भेजें।" };
    }
    const file = new File([blob], fileName, { type: mimeType });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] }) && navigator.share) {
      try {
        await navigator.share({ files: [file], title: opts.title ?? fileName, text: opts.text });
        return { ok: true, message: "✓ Shared / भेजा गया" };
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return { ok: true, message: "" };
        throw e;
      }
    }
    browserDownload(blob, fileName);
    return { ok: true, message: "PDF downloaded — attach it in WhatsApp from Downloads. / PDF डाउनलोड हुई — WhatsApp में 📎 से भेजें।" };
  } catch (e) {
    return { ok: false, message: `${e instanceof Error ? e.message : "Could not share"} — try again / फिर कोशिश करें` };
  }
}

// ---------------------------------------------------------------------------------------------
// App-wide download fix (Android app only). Installed once by NativeShellBridge, so every
// existing download button / link works without being rewritten one by one:
//   1. clicks on same-origin /api/ file links (download attribute, target="_blank", or a
//      download / pdf / export path) are fetched and saved natively;
//   2. programmatic blob: downloads (client-side CSV exports: `a.click()` on a detached link)
//      are saved natively too — the Blob is remembered when its object URL is created, because
//      callers revoke the URL right after clicking.
// ---------------------------------------------------------------------------------------------
const FILE_PATH = /\/api\/.*(download|pdf|export|statement|report|receipt|invoice|\/files\/|\/file\/|company-library)/i;
let installed = false;

export function looksLikeFileLink(a: HTMLAnchorElement): boolean {
  const raw = a.getAttribute("href");
  if (!raw || raw.startsWith("#") || raw.startsWith("javascript:")) return false;
  let url: URL;
  try {
    url = new URL(raw, window.location.href);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return false;
  return a.hasAttribute("download") || a.target === "_blank" || FILE_PATH.test(url.pathname);
}

export function installNativeDownloadHandling(notify: (r: FileResult) => void): () => void {
  if (installed || !isNativeApp()) return () => {};
  installed = true;
  if (!hasNativeFiles()) {
    // Old app (v1.0.2, no SeeraFiles plugin): the WebView ignores target="_blank" links, but a
    // same-window navigation to an attachment URL reaches the shell's DownloadManager hook, which
    // saves the file to Downloads with a notification. So send every file link there.
    const legacyClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !(a instanceof HTMLAnchorElement) || a.href.startsWith("blob:") || !looksLikeFileLink(a)) return;
      e.preventDefault();
      e.stopPropagation();
      notify({ ok: true, message: "Downloading… see the notification / डाउनलोड हो रहा है… नोटिफ़िकेशन देखें" });
      window.location.href = a.href;
    };
    const origLegacyClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function legacyPatchedClick(this: HTMLAnchorElement) {
      if (!this.href.startsWith("blob:") && looksLikeFileLink(this)) {
        window.location.href = this.href;
        return;
      }
      if (this.href.startsWith("blob:")) notify({ ok: false, message: "Update the Seera app to save this export. / यह एक्सपोर्ट सेव करने के लिए Seera ऐप अपडेट करें।" });
      return origLegacyClick.call(this);
    };
    document.addEventListener("click", legacyClick, true);
    return () => {
      document.removeEventListener("click", legacyClick, true);
      HTMLAnchorElement.prototype.click = origLegacyClick;
      installed = false;
    };
  }
  const blobs = new Map<string, Blob>();
  const origCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = ((obj: Blob | MediaSource) => {
    const url = origCreate(obj);
    if (obj instanceof Blob) {
      blobs.set(url, obj);
      if (blobs.size > 50) blobs.delete(blobs.keys().next().value as string);
    }
    return url;
  }) as typeof URL.createObjectURL;

  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function patchedClick(this: HTMLAnchorElement) {
    const href = this.href;
    const blob = href.startsWith("blob:") ? blobs.get(href) : undefined;
    if (blob && this.hasAttribute("download")) {
      void saveBlob(blob, this.getAttribute("download") || "Seera-file").then(notify, (e: unknown) => notify({ ok: false, message: e instanceof Error ? e.message : "Save failed" }));
      return;
    }
    if (!href.startsWith("blob:") && looksLikeFileLink(this)) {
      void downloadUrl(href).then(notify);
      return;
    }
    return origClick.call(this);
  };

  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const a = (e.target as Element | null)?.closest?.("a");
    if (!a || !(a instanceof HTMLAnchorElement)) return;
    if (a.href.startsWith("blob:")) {
      const blob = blobs.get(a.href);
      if (!blob) return;
      e.preventDefault();
      void saveBlob(blob, a.getAttribute("download") || "Seera-file").then(notify);
      return;
    }
    if (!looksLikeFileLink(a)) return;
    e.preventDefault();
    e.stopPropagation();
    notify({ ok: true, message: "Downloading… / डाउनलोड हो रहा है…" });
    void downloadUrl(a.href).then(notify);
  };
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    URL.createObjectURL = origCreate as typeof URL.createObjectURL;
    HTMLAnchorElement.prototype.click = origClick;
    installed = false;
  };
}
