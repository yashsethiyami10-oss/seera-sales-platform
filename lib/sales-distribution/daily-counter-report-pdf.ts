import { readFileSync } from "node:fs";
import "regenerator-runtime/runtime";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { amountInWords, money } from "./document-pdf";
import type { CounterRow, DailyCounterReport } from "./daily-counter-report";

// Daily Counter Report PDF — the branded, distributor-facing version of the Executive's day:
// counter-wise summary, every order as a dispatch-ready block, and a product-wise loading summary.
// Same pdf-lib + fontkit + embedded Noto fonts + Seera logo pipeline as the other Seera documents
// (document-pdf.ts / statement-pdf.ts) — no new PDF framework.

const W = 595.28;
const H = 841.89;
const M = 36;
const CW = W - M * 2;
const FOOTER_H = 34;

const NAVY = rgb(0.07, 0.13, 0.32);
const NAVY_SOFT = rgb(0.9, 0.93, 0.98);
const ACCENT = rgb(0.95, 0.62, 0.11);
const INK = rgb(0.08, 0.1, 0.16);
const MUTED = rgb(0.42, 0.46, 0.54);
const RULE = rgb(0.84, 0.87, 0.91);
const ZEBRA = rgb(0.972, 0.977, 0.988);
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.06, 0.52, 0.3);
const GREEN_SOFT = rgb(0.87, 0.96, 0.91);
const RED = rgb(0.72, 0.14, 0.14);
const RED_SOFT = rgb(0.99, 0.91, 0.91);
const AMBER = rgb(0.68, 0.42, 0.02);
const AMBER_SOFT = rgb(1, 0.95, 0.84);
const SLATE_SOFT = rgb(0.93, 0.94, 0.96);

const fontFile = (name: string) => path.join(process.cwd(), "node_modules", "@fontsource", name);
const DEVANAGARI = /[ऀ-ॿ]/;
const IST = "Asia/Kolkata";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric", weekday: "long" });
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: true }) : "—");
const fmtStamp = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
const qty = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
const rs = (n: number) => money(n);
const rsShort = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;

const STATUS: Record<CounterRow["outcome"], { label: string; fg: RGB; bg: RGB }> = {
  ORDER: { label: "ORDER", fg: GREEN, bg: GREEN_SOFT },
  NO_ORDER: { label: "NO ORDER", fg: RED, bg: RED_SOFT },
  FOLLOW_UP: { label: "FOLLOW-UP", fg: AMBER, bg: AMBER_SOFT },
  SKIPPED: { label: "SKIPPED", fg: MUTED, bg: SLATE_SOFT },
  CLOSED: { label: "SHOP CLOSED", fg: MUTED, bg: SLATE_SOFT },
  VISITED: { label: "VISITED", fg: NAVY, bg: NAVY_SOFT },
};

const WORK_TYPE: Record<string, string> = {
  RETAILING: "Retail Market / Beat Work",
  DISTRIBUTOR_SEARCH: "Distributor Search",
  DISTRIBUTOR_VISIT: "Distributor Visit",
  WHOLESALE_MARKET: "Wholesale Market Work",
  OTHER: "Other Field Work",
};

export function dailyCounterReportFilename(report: Pick<DailyCounterReport, "businessDate" | "executive" | "distributor">) {
  const d = new Date(new Date(report.businessDate).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const clean = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `Seera-Daily-Counter-Report-${d}${report.distributor ? `-${clean(report.distributor.name)}` : ""}-${clean(report.executive.name) || "Executive"}.pdf`;
}

export async function renderDailyCounterReportPdf(report: DailyCounterReport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Seera Daily Counter Report — ${fmtDate(report.businessDate)}`);
  pdf.setAuthor("Seera Sales App");
  pdf.setSubject(report.reportNumber);
  const regular = await pdf.embedFont(readFileSync(fontFile("noto-sans/files/noto-sans-latin-400-normal.woff")), { subset: true });
  const bold = await pdf.embedFont(readFileSync(fontFile("noto-sans/files/noto-sans-latin-700-normal.woff")), { subset: true });
  const hindi = await pdf.embedFont(readFileSync(fontFile("noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff")), { subset: true });
  let logo: PDFImage | undefined;
  try {
    logo = await pdf.embedPng(readFileSync(path.join(process.cwd(), "public", "seera logo.png")));
  } catch {
    logo = undefined;
  }

  // ---- text primitives: mixed Hindi / English strings are drawn as script runs, because the
  // Devanagari font has no Latin digits and the Latin font has no Devanagari.
  type Style = { size?: number; strong?: boolean; color?: RGB };
  const runs = (s: string) => {
    const out: { text: string; hi: boolean }[] = [];
    for (const ch of s) {
      const hi = DEVANAGARI.test(ch) || (ch === " " && out.at(-1)?.hi === true);
      const last = out.at(-1);
      if (last && last.hi === hi) last.text += ch;
      else out.push({ text: ch, hi });
    }
    return out;
  };
  const fontFor = (hi: boolean, strong?: boolean): PDFFont => (hi ? hindi : strong ? bold : regular);
  const safe = (s: string) => s.replace(/[–—]/g, "-").replace(/[^\S\n]+/g, " ").replace(/[^\x20-\x7E -ÿऀ-ॿ•…]/g, "");
  const width = (s: string, st: Style = {}) => runs(safe(s)).reduce((w, r) => w + fontFor(r.hi, st.strong).widthOfTextAtSize(r.text, st.size ?? 9), 0);
  let page!: PDFPage;
  const draw = (s: string, x: number, yTop: number, st: Style = {}) => {
    const size = st.size ?? 9;
    let cx = x;
    for (const r of runs(safe(s))) {
      const f = fontFor(r.hi, st.strong);
      page.drawText(r.text, { x: cx, y: yTop - size, size, font: f, color: st.color ?? INK });
      cx += f.widthOfTextAtSize(r.text, size);
    }
  };
  const drawRight = (s: string, right: number, yTop: number, st: Style = {}) => draw(s, right - width(s, st), yTop, st);
  const drawCenter = (s: string, cx: number, yTop: number, st: Style = {}) => draw(s, cx - width(s, st) / 2, yTop, st);
  const wrap = (s: string, maxW: number, st: Style = {}, maxLines = 4): string[] => {
    const words = safe(s).split(" ").filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (width(next, st) <= maxW) cur = next;
      else {
        if (cur) lines.push(cur);
        cur = w;
        while (width(cur, st) > maxW && cur.length > 1) {
          let cut = cur.length - 1;
          while (cut > 1 && width(cur.slice(0, cut), st) > maxW) cut--;
          lines.push(cur.slice(0, cut));
          cur = cur.slice(cut);
        }
      }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      let last = kept[maxLines - 1]!;
      while (last.length > 1 && width(`${last}…`, st) > maxW) last = last.slice(0, -1);
      kept[maxLines - 1] = `${last}…`;
      return kept;
    }
    return lines.length ? lines : [""];
  };
  const box = (x: number, yTop: number, w: number, h: number, fill?: RGB, border?: RGB, radius = 0) => {
    if (radius) {
      // Rounded rectangle via SVG path (pdf-lib draws SVG paths relative to the given origin).
      const r = Math.min(radius, h / 2, w / 2);
      const p = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
      page.drawSvgPath(p, { x, y: yTop, color: fill, borderColor: border, borderWidth: border ? 0.7 : 0 });
      return;
    }
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, color: fill, borderColor: border, borderWidth: border ? 0.7 : 0 });
  };
  const hline = (x1: number, x2: number, yy: number, color = RULE, thickness = 0.6) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color });
  const pill = (label: string, x: number, yTop: number, fg: RGB, bg: RGB) => {
    const st = { size: 6.8, strong: true, color: fg };
    const w = width(label, st) + 10;
    box(x, yTop, w, 12, bg, undefined, 6);
    draw(label, x + 5, yTop - 2.2, st);
    return w;
  };

  // ---- pages
  let y = 0;
  const pages: PDFPage[] = [];
  const newPage = (continued: boolean) => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    if (continued) {
      box(0, H, W, 30, NAVY);
      box(0, H - 30, W, 2.5, ACCENT);
      draw("SEERA  ·  Daily Counter Report", M, H - 9, { size: 10, strong: true, color: WHITE });
      drawRight(`${fmtDate(report.businessDate)}  ·  ${report.reportNumber}`, W - M, H - 10.5, { size: 7.5, color: WHITE });
      y = H - 48;
    }
  };
  const ensure = (need: number, onBreak?: () => void) => {
    if (y - need < M + FOOTER_H) {
      newPage(true);
      onBreak?.();
    }
  };
  const sectionTitle = (title: string, hint?: string) => {
    ensure(40);
    y -= 6;
    box(M, y, 3.5, 15, ACCENT);
    draw(title, M + 10, y - 0.5, { size: 11.5, strong: true, color: NAVY });
    if (hint) drawRight(hint, M + CW, y - 3, { size: 7.5, color: MUTED });
    y -= 24;
  };

  // ================= Page 1 header =================
  newPage(false);
  const bandH = 92;
  box(0, H, W, bandH, NAVY);
  box(0, H - bandH, W, 3.5, ACCENT);
  let brandX = M;
  if (logo) {
    const lh = 50;
    const lw = Math.min(110, (logo.width / logo.height) * lh);
    box(M, H - 20, lw + 14, lh + 4, WHITE, undefined, 8);
    page.drawImage(logo, { x: M + 7, y: H - 22 - lh, width: lw, height: lh });
    brandX = M + lw + 28;
  }
  draw("SEERA", brandX, H - 24, { size: 22, strong: true, color: WHITE });
  draw("Sales & Distribution", brandX, H - 52, { size: 9, color: rgb(0.8, 0.85, 0.95) });
  drawRight("DAILY COUNTER REPORT", W - M, H - 20, { size: 15, strong: true, color: WHITE });
  drawRight("दैनिक काउंटर रिपोर्ट", W - M, H - 42, { size: 10, color: rgb(0.99, 0.82, 0.5) });
  drawRight(fmtDate(report.businessDate), W - M, H - 60, { size: 9, strong: true, color: WHITE });
  drawRight(`Report No. ${report.reportNumber}`, W - M, H - 74, { size: 7.5, color: rgb(0.8, 0.85, 0.95) });
  y = H - bandH - 18;

  // ================= Parties =================
  const colW = (CW - 12) / 2;
  const partyBox = (x: number, label: string, title: string, lines: string[]) => {
    const h = 74;
    box(x, y, colW, h, WHITE, RULE, 8);
    box(x, y, colW, 18, NAVY_SOFT, undefined, 8);
    box(x, y - 9, colW, 9, NAVY_SOFT);
    draw(label, x + 10, y - 4.5, { size: 7.2, strong: true, color: NAVY });
    const t = wrap(title, colW - 20, { size: 11, strong: true }, 1)[0]!;
    draw(t, x + 10, y - 24, { size: 11, strong: true });
    let ly = y - 41;
    for (const l of lines.slice(0, 2)) {
      draw(wrap(l, colW - 20, { size: 8 }, 1)[0]!, x + 10, ly, { size: 8, color: MUTED });
      ly -= 12;
    }
  };
  partyBox(M, "PREPARED BY  ·  SALES EXECUTIVE", report.executive.name, [
    [report.executive.mobile ? `Mobile: ${report.executive.mobile}` : null, `Emp. code: ${report.executive.code}`].filter(Boolean).join("   ·   "),
    `Day: ${fmtTime(report.day.startedAt)} to ${report.day.endedAt ? fmtTime(report.day.endedAt) : "in progress"}${report.day.workingType ? `   ·   ${WORK_TYPE[report.day.workingType] ?? report.day.workingType}` : ""}`,
  ]);
  partyBox(
    M + colW + 12,
    "FOR  ·  DISTRIBUTOR",
    report.distributor?.name ?? "All distributors",
    report.distributor
      ? [[report.distributor.town, report.distributor.code ? `Code: ${report.distributor.code}` : null].filter(Boolean).join("   ·   ") || "—", report.distributor.mobile ? `Mobile: ${report.distributor.mobile}` : "Orders below are for dispatch from this distributor"]
      : ["Orders across every distributor for the day", ""],
  );
  y -= 74 + 14;

  // ================= KPI tiles =================
  const tiles: { label: string; value: string; color: RGB; soft: RGB }[] = [
    { label: "Counters covered", value: String(report.totals.counters), color: NAVY, soft: NAVY_SOFT },
    { label: "Order counters", value: String(report.totals.ordered), color: GREEN, soft: GREEN_SOFT },
    { label: "No order", value: String(report.totals.noOrder), color: RED, soft: RED_SOFT },
    { label: "New counters", value: String(report.totals.newCounters), color: AMBER, soft: AMBER_SOFT },
    { label: "Total order value", value: rsShort(report.totals.value), color: NAVY, soft: rgb(1, 0.97, 0.9) },
  ];
  const gap = 8;
  const tw = (CW - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach((t, i) => {
    const x = M + i * (tw + gap);
    box(x, y, tw, 52, t.soft, undefined, 8);
    box(x, y - 8, 3, 36, t.color);
    const vs = { size: t.value.length > 10 ? 12 : 17, strong: true, color: t.color };
    draw(t.value, x + 11, y - (t.value.length > 10 ? 12 : 9), vs);
    draw(t.label.toUpperCase(), x + 11, y - 37, { size: 6.4, strong: true, color: MUTED });
  });
  y -= 52 + 10;
  const productivity = report.totals.counters ? Math.round((report.totals.ordered / report.totals.counters) * 100) : 0;
  draw(
    `Productivity ${productivity}%   ·   ${report.totals.orders} order${report.totals.orders === 1 ? "" : "s"}   ·   ${qty(report.totals.pieces)} PC ordered${report.totals.freePieces ? ` + ${qty(report.totals.freePieces)} PC free` : ""}   ·   Generated ${fmtStamp(report.generatedAt)}`,
    M,
    y,
    { size: 7.8, color: MUTED },
  );
  y -= 20;

  if (!report.counters.length) {
    box(M, y, CW, 60, SLATE_SOFT, undefined, 8);
    drawCenter("No counters were recorded for this day.", W / 2, y - 18, { size: 11, strong: true, color: MUTED });
    drawCenter("आज के लिए कोई काउंटर दर्ज नहीं है।", W / 2, y - 36, { size: 9, color: MUTED });
    y -= 70;
  } else {
    // ================= Counter-wise summary =================
    sectionTitle("Counter-wise Summary", `${report.counters.length} counter${report.counters.length === 1 ? "" : "s"} in visit order`);
    const cols = [
      { label: "#", w: 22 },
      { label: "COUNTER / SHOP", w: 168 },
      { label: "AREA / ADDRESS", w: 150 },
      { label: "TIME", w: 52 },
      { label: "STATUS", w: 64 },
      { label: "ORDER VALUE", w: CW - 22 - 168 - 150 - 52 - 64, right: true },
    ];
    const tableHead = () => {
      box(M, y, CW, 18, NAVY, undefined, 4);
      let x = M;
      for (const c of cols) {
        if (c.right) drawRight(c.label, x + c.w - 6, y - 5, { size: 6.8, strong: true, color: WHITE });
        else draw(c.label, x + 6, y - 5, { size: 6.8, strong: true, color: WHITE });
        x += c.w;
      }
      y -= 18;
    };
    tableHead();
    report.counters.forEach((c, idx) => {
      const nameLines = wrap(c.shopName, cols[1]!.w - 12, { size: 8.6, strong: true }, 2);
      const sub = [c.ownerName, c.mobile].filter(Boolean).join(" · ");
      const reasonLine = c.outcome !== "ORDER" && c.reason ? `Reason: ${c.reason}` : null;
      const subLines = [...(sub ? wrap(sub, cols[1]!.w - 12, { size: 7.2 }, 1) : []), ...(reasonLine ? wrap(reasonLine, cols[1]!.w - 12, { size: 7.2 }, 2) : [])];
      const addrLines = wrap(c.address ?? "—", cols[2]!.w - 12, { size: 7.4 }, 3);
      const rowH = Math.max(28, 8 + nameLines.length * 11 + subLines.length * 9.5 + 4, 10 + addrLines.length * 9.5);
      ensure(rowH, tableHead);
      if (idx % 2 === 1) box(M, y, CW, rowH, ZEBRA);
      let x = M;
      draw(String(c.sequence), x + 6, y - 7, { size: 8.4, strong: true, color: NAVY });
      x += cols[0]!.w;
      let ty = y - 6;
      nameLines.forEach((l) => {
        draw(l, x + 6, ty, { size: 8.6, strong: true });
        ty -= 11;
      });
      subLines.forEach((l, i) => {
        draw(l, x + 6, ty, { size: 7.2, color: reasonLine && i === subLines.length - 1 && l.startsWith("Reason") ? RED : MUTED });
        ty -= 9.5;
      });
      if (c.isNewCounter || c.source === "PHONE_OR_REPEAT") {
        const tag = c.isNewCounter ? "NEW" : "PHONE";
        const tagW = width(tag, { size: 6, strong: true }) + 8;
        const nx = Math.min(x + 6 + width(nameLines[0]!, { size: 8.6, strong: true }) + 4, x + cols[1]!.w - tagW - 2);
        box(nx, y - 6.5, tagW, 10, c.isNewCounter ? AMBER_SOFT : NAVY_SOFT, undefined, 5);
        draw(tag, nx + 4, y - 8, { size: 6, strong: true, color: c.isNewCounter ? AMBER : NAVY });
      }
      x += cols[1]!.w;
      let ay = y - 7;
      addrLines.forEach((l) => {
        draw(l, x + 6, ay, { size: 7.4, color: INK });
        ay -= 9.5;
      });
      x += cols[2]!.w;
      draw(fmtTime(c.checkedInAt), x + 6, y - 7, { size: 7.6 });
      x += cols[3]!.w;
      const s = STATUS[c.outcome];
      pill(s.label, x + 5, y - 6, s.fg, s.bg);
      x += cols[4]!.w;
      const value = c.orders.reduce((sum, o) => sum + o.total, 0);
      drawRight(value ? rs(value) : "—", x + cols[5]!.w - 6, y - 7, { size: 8.4, strong: !!value, color: value ? INK : MUTED });
      y -= rowH;
      hline(M, M + CW, y);
    });
    // total row
    ensure(24);
    box(M, y, CW, 22, NAVY_SOFT);
    draw(`TOTAL  ·  ${report.totals.ordered} of ${report.totals.counters} counters ordered`, M + 28, y - 7, { size: 8.2, strong: true, color: NAVY });
    drawRight(rs(report.totals.value), M + CW - 6, y - 6.5, { size: 9.5, strong: true, color: NAVY });
    y -= 22 + 16;

    // ================= Order details / dispatch sheet =================
    const withOrders = report.counters.filter((c) => c.orders.length);
    if (withOrders.length) {
      sectionTitle("Order Details  ·  Dispatch Sheet", "Rates are GST-inclusive");
      const lc = [
        { label: "PRODUCT", w: 205 },
        { label: "SKU", w: 78 },
        { label: "QUANTITY", w: 120 },
        { label: "RATE", w: 50, right: true },
        { label: "AMOUNT", w: CW - 205 - 78 - 120 - 50, right: true },
      ];
      for (const c of withOrders) {
        for (const o of c.orders) {
          const lineHeights = o.lines.map((l) => Math.max(wrap(`${l.product}`, lc[0]!.w - 12, { size: 8 }, 2).length, wrap(l.quantityText, lc[2]!.w - 12, { size: 7.6 }, 2).length) * 10 + 6);
          const headerH = 40;
          ensure(headerH + 16 + (lineHeights[0] ?? 0) + 20);
          // card header
          box(M, y, CW, headerH, NAVY_SOFT, undefined, 6);
          box(M, y, 24, headerH, NAVY, undefined, 6);
          box(M + 12, y, 12, headerH, NAVY);
          drawCenter(String(c.sequence), M + 12, y - 13, { size: 11, strong: true, color: WHITE });
          const shopTitle = wrap(c.shopName, 300, { size: 10, strong: true }, 1)[0]!;
          draw(shopTitle, M + 32, y - 6, { size: 10, strong: true, color: NAVY });
          const info = [c.ownerName, c.mobile ? `Mob. ${c.mobile}` : null, c.address].filter(Boolean).join("  ·  ");
          draw(wrap(info || "—", 330, { size: 7.4 }, 1)[0]!, M + 32, y - 22, { size: 7.4, color: MUTED });
          drawRight(`Order ${o.orderNumber}`, M + CW - 10, y - 6, { size: 7.6, strong: true, color: NAVY });
          drawRight(`${c.source === "PHONE_OR_REPEAT" ? "Phone / repeat order" : `Booked ${fmtTime(c.checkedInAt)}`}${o.distributorName && !report.distributor ? `  ·  ${o.distributorName}` : ""}`, M + CW - 10, y - 20, { size: 7, color: MUTED });
          y -= headerH + 2;
          const lineHead = () => {
            let x = M;
            for (const col of lc) {
              if (col.right) drawRight(col.label, x + col.w - 6, y - 4, { size: 6.6, strong: true, color: MUTED });
              else draw(col.label, x + 6, y - 4, { size: 6.6, strong: true, color: MUTED });
              x += col.w;
            }
            y -= 14;
            hline(M, M + CW, y, RULE);
          };
          lineHead();
          o.lines.forEach((l, i) => {
            const h = lineHeights[i]!;
            ensure(h, lineHead);
            let x = M;
            let py = y - 4;
            wrap(l.product, lc[0]!.w - 12, { size: 8 }, 2).forEach((t) => {
              draw(t, x + 6, py, { size: 8 });
              py -= 10;
            });
            x += lc[0]!.w;
            draw(wrap(l.skuCode, lc[1]!.w - 10, { size: 7.2 }, 1)[0]!, x + 6, y - 4.6, { size: 7.2, color: MUTED });
            x += lc[1]!.w;
            let qy = y - 4.4;
            wrap(l.quantityText, lc[2]!.w - 12, { size: 7.6 }, 2).forEach((t) => {
              draw(t, x + 6, qy, { size: 7.6, strong: true });
              qy -= 10;
            });
            x += lc[2]!.w;
            drawRight(l.rate.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), x + lc[3]!.w - 6, y - 4.4, { size: 7.8 });
            x += lc[3]!.w;
            drawRight(rs(l.amount), x + lc[4]!.w - 6, y - 4.4, { size: 8 });
            y -= h;
            hline(M, M + CW, y, RULE, 0.4);
          });
          ensure(20);
          if (o.notes) {
            draw(wrap(`Note: ${o.notes}`, CW - 180, { size: 7.2 }, 1)[0]!, M + 6, y - 6, { size: 7.2, color: MUTED });
          }
          drawRight("Order total", M + CW - 100, y - 5.5, { size: 7.6, strong: true, color: MUTED });
          drawRight(rs(o.total), M + CW - 6, y - 5, { size: 9.4, strong: true, color: NAVY });
          y -= 30;
        }
      }
    }

    // ================= Product-wise loading summary =================
    if (report.productSummary.length) {
      sectionTitle("Product-wise Loading Summary", "Total quantity to load for the day");
      const pc = [
        { label: "#", w: 22 },
        { label: "PRODUCT", w: 170 },
        { label: "SKU", w: 72 },
        { label: "COUNTERS", w: 54, right: true },
        { label: "QTY (PC)", w: 58, right: true },
        { label: "FREE (PC)", w: 56, right: true },
        { label: "AMOUNT", w: CW - 22 - 170 - 72 - 54 - 58 - 56, right: true },
      ];
      const head = () => {
        box(M, y, CW, 18, NAVY, undefined, 4);
        let x = M;
        for (const c of pc) {
          if (c.right) drawRight(c.label, x + c.w - 6, y - 5, { size: 6.8, strong: true, color: WHITE });
          else draw(c.label, x + 6, y - 5, { size: 6.8, strong: true, color: WHITE });
          x += c.w;
        }
        y -= 18;
      };
      head();
      report.productSummary.forEach((p, i) => {
        const names = wrap(p.product, pc[1]!.w - 12, { size: 8 }, 2);
        const h = names.length * 10 + 8;
        ensure(h, head);
        if (i % 2 === 1) box(M, y, CW, h, ZEBRA);
        let x = M;
        draw(String(i + 1), x + 6, y - 5, { size: 7.8, color: MUTED });
        x += pc[0]!.w;
        let ny = y - 5;
        names.forEach((n) => {
          draw(n, x + 6, ny, { size: 8 });
          ny -= 10;
        });
        x += pc[1]!.w;
        draw(wrap(p.skuCode, pc[2]!.w - 10, { size: 7.2 }, 1)[0]!, x + 6, y - 5.6, { size: 7.2, color: MUTED });
        x += pc[2]!.w;
        drawRight(String(p.counters), x + pc[3]!.w - 6, y - 5, { size: 8 });
        x += pc[3]!.w;
        drawRight(qty(p.baseQuantity), x + pc[4]!.w - 6, y - 5, { size: 8, strong: true });
        x += pc[4]!.w;
        drawRight(p.freeBaseQuantity ? qty(p.freeBaseQuantity) : "—", x + pc[5]!.w - 6, y - 5, { size: 8, color: p.freeBaseQuantity ? GREEN : MUTED });
        x += pc[5]!.w;
        drawRight(rs(p.amount), x + pc[6]!.w - 6, y - 5, { size: 8 });
        y -= h;
        hline(M, M + CW, y);
      });
      ensure(40);
      box(M, y, CW, 22, NAVY_SOFT);
      draw("GRAND TOTAL", M + 28, y - 7, { size: 8.4, strong: true, color: NAVY });
      const colRight = (index: number) => M + pc.slice(0, index + 1).reduce((sum, c) => sum + c.w, 0) - 6;
      drawRight(qty(report.totals.pieces), colRight(4), y - 7, { size: 8.4, strong: true, color: NAVY });
      drawRight(report.totals.freePieces ? qty(report.totals.freePieces) : "—", colRight(5), y - 7, { size: 8.4, strong: true, color: GREEN });
      drawRight(rs(report.totals.value), M + CW - 6, y - 6.5, { size: 9.5, strong: true, color: NAVY });
      y -= 22 + 6;
      draw(wrap(`Amount in words: ${amountInWords(report.totals.value)}`, CW, { size: 7.6 }, 2)[0]!, M, y, { size: 7.6, color: MUTED });
      y -= 16;
    }
  }

  // ================= Sign-off =================
  ensure(70);
  y -= 26;
  const sw = 180;
  hline(M, M + sw, y, INK, 0.6);
  hline(M + CW - sw, M + CW, y, INK, 0.6);
  draw(report.executive.name, M, y - 5, { size: 8, strong: true });
  draw("Sales Executive", M, y - 17, { size: 7.2, color: MUTED });
  drawRight(report.distributor?.name ?? "Distributor", M + CW, y - 5, { size: 8, strong: true });
  drawRight("Received by (Distributor)", M + CW, y - 17, { size: 7.2, color: MUTED });
  y -= 30;

  // ================= Footer on every page =================
  pages.forEach((p, i) => {
    page = p;
    hline(M, W - M, M + 16, RULE, 0.6);
    draw("Seera  ·  Computer-generated report from the Seera Sales App  ·  Please verify stock before dispatch", M, M + 11, { size: 6.8, color: MUTED });
    drawRight(`Page ${i + 1} of ${pages.length}`, W - M, M + 11, { size: 6.8, strong: true, color: MUTED });
  });

  return pdf.save();
}
