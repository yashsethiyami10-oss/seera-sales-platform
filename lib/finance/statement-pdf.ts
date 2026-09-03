import { readFileSync } from "node:fs";
import "regenerator-runtime/runtime";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import { money, amountInWords, type DocumentBranding } from "@/lib/sales-distribution/document-pdf";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;

// Deliberately plain (Standard Helvetica, no custom font/fontkit) — statement
// PDFs are internal Finance exports, not the branded customer-facing
// documents document-pdf.ts renders, so the heavier font-embedding pipeline
// used there isn't warranted here. "Rs." not "₹" — WinAnsi-encoded standard
// fonts can't render the Rupee glyph.
export async function renderStatementPdf(input: { title: string; subtitle: string; rows: { label: string; value: string; indent?: boolean }[]; footer?: string }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const draw = (text: string, opts: { size?: number; useBold?: boolean; x?: number } = {}) => {
    if (y < MARGIN + 20) { page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]); y = PAGE_HEIGHT - MARGIN; }
    page.drawText(text, { x: opts.x ?? MARGIN, y, size: opts.size ?? 10, font: opts.useBold ? bold : font, color: rgb(0.08, 0.08, 0.08) });
    y -= (opts.size ?? 10) + 6;
  };

  draw(input.title, { size: 16, useBold: true });
  draw(input.subtitle, { size: 10 });
  y -= 8;
  for (const row of input.rows) {
    draw(row.label, { x: row.indent ? MARGIN + 16 : MARGIN, size: 9.5 });
    page.drawText(row.value, { x: PAGE_WIDTH - MARGIN - 100, y: y + (9.5 + 6), size: 9.5, font, color: rgb(0.08, 0.08, 0.08) });
  }
  if (input.footer) { y -= 10; draw(input.footer, { size: 8 }); }
  return pdf.save();
}

// Professional Ledger Statement PDF (GAP 2, Final 100% Gap Closure) — rewritten to use the SAME
// branded rendering pipeline as document-pdf.ts's renderIssuedDocumentPdf (pdf-lib + fontkit +
// embedded Noto fonts + the real configured logo/signature/seal + money()/amountInWords()) instead
// of a separate plain-Helvetica renderer — no new PDF framework, no new engine, same document
// family as Sales Invoice / Purchase Bill / Payment Receipt. Input shape is backward compatible
// (every new field optional); a call site that passes only companyName/company/party/period/rows/
// totals/normalSide still renders correctly, just without a logo/signature/seal until the caller
// passes `branding` and the fuller `company` fields.
const LP = [595.28, 841.89] as const;
const LMARGIN = 40;
const LWIDTH = LP[0] - LMARGIN * 2;
const L_INK = rgb(0.08, 0.1, 0.16);
const L_MUTED = rgb(0.42, 0.46, 0.54);
const L_RULE = rgb(0.82, 0.85, 0.89);
const L_BRAND = rgb(0.09, 0.14, 0.33);
const L_HEADER_FILL = rgb(0.94, 0.95, 0.98);
const devanagari = /[ऀ-ॿ]/;
const safeFile = (name: string) => path.join(process.cwd(), "node_modules", "@fontsource", name);

// Column widths: real SeeraCommercialDocument numbers (e.g. "SEERA/INV/2026-27/000001") run
// noticeably longer than the short, fixed Particulars labels (FINANCIAL_ENTRY_LABEL — "Tax
// Invoice", "Payment Received", etc.) — Voucher/Ref No. is widened accordingly so a real invoice
// reference is never illegibly truncated on a professional financial document.
const LEDGER_COLS: { key: string; label: string; width: number; right?: boolean }[] = [
  { key: "date", label: "Date", width: 56 },
  { key: "particulars", label: "Particulars", width: 110 },
  { key: "voucher", label: "Voucher / Ref No.", width: 150 },
  { key: "debit", label: "Debit (Dr)", width: 72, right: true },
  { key: "credit", label: "Credit (Cr)", width: 72, right: true },
  { key: "balance", label: "Balance", width: 55, right: true },
];

export async function renderLedgerStatementPdf(input: {
  companyName: string;
  // Money Desk 2.0 (Part F) — real Founder-configured company identity on the ledger header
  // (GSTIN/address/phone/email), when available. Every field optional so an unconfigured Company
  // Profile still renders the exact same header as before (just the company name), never invented.
  company?: { gstin?: string | null; pan?: string | null; address?: string | null; phone?: string | null; email?: string | null; website?: string | null };
  party: { name: string; type: string; address?: string | null; mobile?: string | null; gstin?: string | null; territory?: string | null };
  period: { from: string; to: string };
  openingBalance: number;
  rows: { date: string; particulars: string; voucher: string; debit: number; credit: number; balance: number }[];
  totals: { debit: number; credit: number; closingBalance: number };
  normalSide: "DEBIT" | "CREDIT";
  // GAP 2 — real signature/seal images and signatory name/designation, exactly the same
  // DocumentBranding shape every other issued document already uses (document-pdf.ts). Optional —
  // when absent, the same text-only "computer-generated statement" footer renders as before.
  branding?: DocumentBranding;
}) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const latin = await pdf.embedFont(readFileSync(safeFile("noto-sans/files/noto-sans-latin-400-normal.woff")), { subset: true });
  const hindi = await pdf.embedFont(readFileSync(safeFile("noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff")), { subset: true });
  const bold = await pdf.embedFont(readFileSync(safeFile("noto-sans/files/noto-sans-latin-700-normal.woff")), { subset: true });
  let logo: PDFImage | undefined;
  try {
    logo = await pdf.embedPng(readFileSync(path.join(process.cwd(), "public", "seera logo.png")));
  } catch {
    logo = undefined;
  }
  const embedBrandingImage = async (image?: { bytes: Uint8Array; mimeType: string }): Promise<PDFImage | undefined> => {
    if (!image) return undefined;
    try {
      return image.mimeType === "image/png" ? await pdf.embedPng(image.bytes) : await pdf.embedJpg(image.bytes);
    } catch {
      return undefined;
    }
  };
  const signatureImage = await embedBrandingImage(input.branding?.signatureImage);
  const sealImage = await embedBrandingImage(input.branding?.sealImage);

  let page = pdf.addPage(LP as unknown as [number, number]);
  let y = LP[1] - LMARGIN;
  const selectFont = (str: string, strong = false): PDFFont => (devanagari.test(str) ? hindi : strong ? bold : latin);
  const newPage = () => {
    page = pdf.addPage(LP as unknown as [number, number]);
    y = LP[1] - LMARGIN;
  };
  const ensureRoom = (need: number) => {
    if (y - need < LMARGIN + 30) newPage();
  };
  const text = (str: string, x: number, yy: number, opts: { size?: number; strong?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    page.drawText(String(str), { x, y: yy, size: opts.size ?? 9, font: selectFont(String(str), opts.strong), color: opts.color ?? L_INK });
  };
  const rightText = (str: string, rightEdge: number, yy: number, opts: { size?: number; strong?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const size = opts.size ?? 9;
    const font = selectFont(str, opts.strong);
    text(str, rightEdge - font.widthOfTextAtSize(String(str), size), yy, opts);
  };
  const truncate = (str: string, font: PDFFont, size: number, maxWidth: number) => {
    let s = str;
    while (s.length > 1 && font.widthOfTextAtSize(s, size) > maxWidth) s = s.slice(0, -1);
    return s.length < str.length ? `${s.slice(0, -1)}…` : s;
  };
  // Greedy word-wrap against the font's actual measured width — pdf-lib has no built-in wrapping,
  // and unwrapped text drawn past the page's own edge is silently clipped (not just visually, but
  // from pdftotext's extraction too), which is exactly the real bug this fixes for a long company
  // identity line (address + GSTIN + PAN + phone + email + website all on one row).
  const wrap = (str: string, font: PDFFont, size: number, maxWidth: number): string[] => {
    const words = String(str).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const attempt = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(attempt, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else current = attempt;
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };
  const fmt = (v: number) => `${money(Math.abs(v))}${v === 0 ? "" : v > 0 === (input.normalSide === "DEBIT") ? " Dr" : " Cr"}`;

  // ---- Header: logo + brand, document title, statement period ----
  const headerTop = y;
  if (logo) {
    const h = 42;
    const w = (logo.width / logo.height) * h;
    page.drawImage(logo, { x: LMARGIN, y: headerTop - h, width: w, height: h });
  }
  rightText("PARTY LEDGER STATEMENT", LMARGIN + LWIDTH, headerTop - 14, { size: 15, strong: true, color: L_BRAND });
  rightText(`${new Date(input.period.from).toLocaleDateString("en-IN")} to ${new Date(input.period.to).toLocaleDateString("en-IN")}`, LMARGIN + LWIDTH, headerTop - 30, { size: 9, color: L_MUTED });
  rightText(`Generated: ${new Date().toLocaleString("en-IN")}`, LMARGIN + LWIDTH, headerTop - 44, { size: 7.5, color: L_MUTED });
  y = headerTop - 60;
  page.drawLine({ start: { x: LMARGIN, y }, end: { x: LMARGIN + LWIDTH, y }, thickness: 1.2, color: L_BRAND });
  y -= 8;
  text(input.companyName, LMARGIN, y, { size: 11, strong: true });
  y -= 13;
  const companyBits = [input.company?.address, input.company?.gstin ? `GSTIN: ${input.company.gstin}` : null, input.company?.pan ? `PAN: ${input.company.pan}` : null, input.company?.phone ? `Phone: ${input.company.phone}` : null, input.company?.email ? `Email: ${input.company.email}` : null, input.company?.website ? `Web: ${input.company.website}` : null].filter(Boolean).join("   ·   ");
  if (companyBits) {
    const companyBitsLines = wrap(companyBits, latin, 7.5, LWIDTH);
    companyBitsLines.forEach((l) => { text(l, LMARGIN, y, { size: 7.5, color: L_MUTED }); y -= 10; });
    y -= 6;
  } else y -= 6;

  // ---- Party box + Account Summary box, side by side ----
  const colGap = 16;
  const colWidth = (LWIDTH - colGap) / 2;
  // Overdue/ageing is deliberately NOT shown here — a ledger row has no due-date field to compute
  // it from honestly; fabricating one would be exactly the kind of invented figure this mission
  // forbids. Opening/Total Debit/Total Credit/Closing are the real, available account summary.
  const partyLines = [input.party.address, input.party.mobile ? `Mobile: ${input.party.mobile}` : null, input.party.gstin ? `GSTIN: ${input.party.gstin}` : null, input.party.territory ? `Territory: ${input.party.territory}` : null].filter((v): v is string => Boolean(v));
  const boxHeight = Math.max(16 + partyLines.length * 11 + 24, 78);
  page.drawRectangle({ x: LMARGIN, y: y - boxHeight, width: colWidth, height: boxHeight, borderColor: L_RULE, borderWidth: 0.8, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: LMARGIN + colWidth + colGap, y: y - boxHeight, width: colWidth, height: boxHeight, borderColor: L_RULE, borderWidth: 0.8, color: rgb(1, 1, 1) });
  let py = y - 13;
  text("PARTY", LMARGIN + 8, py, { size: 7.5, strong: true, color: L_MUTED }); py -= 13;
  text(`${input.party.name} (${input.party.type.replace(/_/g, " ")})`, LMARGIN + 8, py, { size: 10, strong: true }); py -= 13;
  for (const l of partyLines) { text(l, LMARGIN + 8, py, { size: 8.5 }); py -= 11; }
  let sy = y - 13;
  const sx = LMARGIN + colWidth + colGap + 8;
  text("ACCOUNT SUMMARY", sx, sy, { size: 7.5, strong: true, color: L_MUTED }); sy -= 13;
  text(`Opening Balance: ${fmt(input.openingBalance)}`, sx, sy, { size: 8.5, strong: true }); sy -= 12;
  text(`Total Debit: ${money(input.totals.debit)}`, sx, sy, { size: 8.5 }); sy -= 11;
  text(`Total Credit: ${money(input.totals.credit)}`, sx, sy, { size: 8.5 }); sy -= 11;
  text(`Closing / Current Outstanding: ${fmt(input.totals.closingBalance)}`, sx, sy, { size: 8.5, strong: true }); sy -= 12;
  y -= boxHeight + 18;

  // ---- Transaction table ----
  const positioned: (typeof LEDGER_COLS[number] & { x: number })[] = [];
  { let cx = LMARGIN; for (const c of LEDGER_COLS) { positioned.push({ ...c, x: cx }); cx += c.width; } }
  const drawTableHeader = () => {
    ensureRoom(30);
    const headerY = y;
    page.drawRectangle({ x: LMARGIN, y: headerY - 16, width: LWIDTH, height: 16, color: L_HEADER_FILL });
    positioned.forEach((c) => {
      const tx = c.right ? c.x + c.width - 4 - bold.widthOfTextAtSize(c.label, 7) : c.x + 3;
      text(c.label, tx, headerY - 11, { size: 7, strong: true, color: L_BRAND });
    });
    y = headerY - 16;
    page.drawLine({ start: { x: LMARGIN, y }, end: { x: LMARGIN + LWIDTH, y }, thickness: 0.8, color: L_BRAND });
  };
  drawTableHeader();
  for (const row of input.rows) {
    ensureRoom(20);
    if (y === LP[1] - LMARGIN) drawTableHeader();
    const rowY = y - 10;
    const values: Record<string, string> = {
      date: new Date(row.date).toLocaleDateString("en-IN"),
      particulars: truncate(row.particulars, latin, 7.5, 103),
      voucher: truncate(row.voucher, latin, 7.5, 143),
      debit: row.debit > 0 ? money(row.debit) : "—",
      credit: row.credit > 0 ? money(row.credit) : "—",
      balance: fmt(row.balance),
    };
    positioned.forEach((c) => {
      const v = values[c.key] ?? "";
      const size = 7.5;
      const w = latin.widthOfTextAtSize(v, size);
      const tx = c.right ? c.x + c.width - 4 - w : c.x + 3;
      text(v, tx, rowY, { size });
    });
    y -= 15;
    page.drawLine({ start: { x: LMARGIN, y }, end: { x: LMARGIN + LWIDTH, y }, thickness: 0.5, color: L_RULE });
  }
  if (input.rows.length === 0) { ensureRoom(16); text("No transactions in this period.", LMARGIN, y - 10, { size: 9, color: L_MUTED }); y -= 20; }

  // ---- Totals block ----
  ensureRoom(60);
  y -= 10;
  const totalsX = LMARGIN + LWIDTH - 210;
  const totalsRight = LMARGIN + LWIDTH;
  const totalsRow = (label: string, value: string, opts: { strong?: boolean; size?: number } = {}) => {
    text(label, totalsX, y, { size: opts.size ?? 9, color: opts.strong ? L_INK : L_MUTED, strong: opts.strong });
    rightText(value, totalsRight, y, { size: opts.size ?? 9, strong: opts.strong });
    y -= (opts.size ?? 9) + 6;
  };
  page.drawLine({ start: { x: totalsX - 8, y: y + 4 }, end: { x: totalsRight, y: y + 4 }, thickness: 0.8, color: L_RULE });
  y -= 6;
  totalsRow("Total Debit", money(input.totals.debit));
  totalsRow("Total Credit", money(input.totals.credit));
  page.drawLine({ start: { x: totalsX - 8, y: y + 4 }, end: { x: totalsRight, y: y + 4 }, thickness: 0.8, color: L_BRAND });
  y -= 12;
  totalsRow("CLOSING BALANCE", fmt(input.totals.closingBalance), { strong: true, size: 12 });
  y -= 6;
  ensureRoom(16);
  text(`Amount in words: ${amountInWords(Math.abs(input.totals.closingBalance))}${input.totals.closingBalance === 0 ? "" : input.totals.closingBalance > 0 === (input.normalSide === "DEBIT") ? " (Receivable / Dr)" : " (Payable / Cr)"}`, LMARGIN, y, { size: 8, strong: true, color: L_MUTED });
  y -= 20;

  // ---- Signatory block — same real configured signature/seal every other document uses ----
  ensureRoom(70);
  const sigWidth = 180;
  const sigX = LMARGIN + LWIDTH - sigWidth;
  text(`For ${input.companyName}`, sigX, y, { size: 8.5, strong: true });
  y -= 6;
  if (sealImage) { const s = 44; page.drawImage(sealImage, { x: sigX - s - 8, y: y - s, width: s, height: s, opacity: 0.85 }); }
  if (signatureImage) { const h = 30; const w = (signatureImage.width / signatureImage.height) * h; page.drawImage(signatureImage, { x: sigX + (sigWidth - w) / 2, y: y - h - 4, width: w, height: h }); }
  y -= 42;
  page.drawLine({ start: { x: sigX, y }, end: { x: sigX + sigWidth, y }, thickness: 0.6, color: L_RULE });
  y -= 10;
  if (input.branding?.signatoryName) {
    rightText(input.branding.signatoryName, sigX + sigWidth, y, { size: 8, strong: true });
    y -= 11;
    if (input.branding.signatoryDesignation) { rightText(input.branding.signatoryDesignation, sigX + sigWidth, y, { size: 7.5, color: L_MUTED }); y -= 11; }
  } else {
    text("Computer-generated statement — Authorised Signatory / Seal", sigX, y, { size: 7, color: L_MUTED });
    y -= 16;
  }

  // ---- Footer with pagination on every page ----
  const pageCount = pdf.getPageCount();
  pdf.getPages().forEach((p, i) => {
    p.drawLine({ start: { x: LMARGIN, y: LMARGIN + 20 }, end: { x: LMARGIN + LWIDTH, y: LMARGIN + 20 }, thickness: 0.6, color: L_RULE });
    p.drawText("System-generated Party Ledger Statement — Seera Sales & Distribution OS", { x: LMARGIN, y: LMARGIN + 8, size: 6.5, font: latin, color: L_MUTED });
    const pageLabel = `Page ${i + 1} of ${pageCount}`;
    const w = latin.widthOfTextAtSize(pageLabel, 6.5);
    p.drawText(pageLabel, { x: LMARGIN + LWIDTH - w, y: LMARGIN + 8, size: 6.5, font: latin, color: L_MUTED });
  });

  pdf.setTitle(`Ledger Statement — ${input.party.name}`);
  pdf.setCreator("Seera Sales & Distribution OS");
  return pdf.save();
}
