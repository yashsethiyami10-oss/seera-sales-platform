import { readFileSync } from "node:fs";
import "regenerator-runtime/runtime";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

// contactName/mobile (Final Master Revision Part 6, 22-Aug): optional so every historical
// document's already-issued, immutable snapshot (Part 14 — never rewritten) keeps rendering
// exactly as before when it predates these fields; only newly issued documents populate them.
export type LegalPartySnapshot = { legalName: string; tradeName?: string; gstin?: string; address: string; state?: string; stateCode?: string; contactName?: string; mobile?: string };
export type DocumentLineSnapshot = { description: string; hsn?: string; quantity: number; unit: string; rate: number; discount?: number; taxableValue: number; cgst?: number; sgst?: number; igst?: number; total: number };
export type IssuedDocumentSnapshot = {
  type: string; documentNumber: string; issueDate: string; issuer: LegalPartySnapshot; buyer: LegalPartySnapshot;
  orderReference?: string; lines: DocumentLineSnapshot[]; subtotal: number; taxableTotal: number;
  cgstTotal: number; sgstTotal: number; igstTotal: number; grandTotal: number; currency?: string;
  paymentTerms?: string; notes?: string;
  // Billing/Quotation Finalization (23-Aug): validUntil is real Prisma data (SeeraCommercialDocument.
  // validUntil) that already existed but was silently dropped before reaching the PDF — Quotations
  // only. originalDocumentNumber/Date resolve a Credit/Debit Note's real originalDocumentId link (the
  // invoice it corrects) so the printed document names what it's against, never invented for a
  // document type that has no such link.
  validUntil?: string;
  originalDocumentNumber?: string;
  originalDocumentDate?: string;
};

// Indian numbering (Lakh/Crore), standard on printed Indian commercial documents — every rupee
// figure on this PDF is INR (money() above hardcodes "Rs." for the same reason), so no other
// numbering convention applies here.
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n]!;
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}
function threeDigitWords(n: number): string {
  if (n < 100) return twoDigitWords(n);
  return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${twoDigitWords(n % 100)}` : ""}`;
}
function integerWords(n: number): string {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${threeDigitWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitWords(thousand)} Thousand`);
  if (rest) parts.push(threeDigitWords(rest));
  return parts.join(" ");
}
export function amountInWords(value: number, currency = "INR"): string {
  const rupees = Math.floor(Math.abs(value));
  const paise = Math.round((Math.abs(value) - rupees) * 100);
  const unit = currency === "INR" ? "Rupees" : currency;
  const words = `${unit} ${integerWords(rupees)} Only`;
  return paise ? `${unit} ${integerWords(rupees)} and ${twoDigitWords(paise)} Paise Only` : words;
}

const devanagari = /[ऀ-ॿ]/;
const safeFile = (name: string) => path.join(process.cwd(), "node_modules", "@fontsource", name);
const PAGE = [595.28, 841.89] as const;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE[0] - MARGIN * 2;
const INK = rgb(0.08, 0.1, 0.16);
const MUTED = rgb(0.42, 0.46, 0.54);
const RULE = rgb(0.82, 0.85, 0.89);
const BRAND = rgb(0.09, 0.14, 0.33);
const HEADER_FILL = rgb(0.94, 0.95, 0.98);
// "Rs." rather than the ₹ glyph deliberately: Noto Sans Latin (the embedded PDF font) has no ₹
// glyph, and Noto Sans Devanagari — which does — has no Western digit glyphs, so routing a whole
// money string through it renders every digit as a missing-glyph box. "Rs." avoids the font-
// coverage problem entirely and is standard on printed Indian business documents.
// Exported (Gap 2, Final 100% Gap Closure) — the Ledger Statement PDF now reuses this exact same
// money formatter instead of its own separate one, so a rupee figure never looks different between
// document types in the same professional document family.
export const money = (n: number, currency = "INR") => `${currency === "INR" ? "Rs. " : currency + " "}${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function documentPdfFilename(input: Pick<IssuedDocumentSnapshot, "type" | "documentNumber">) {
  return `${input.type}-${input.documentNumber}`.replace(/[^A-Za-z0-9._-]+/g, "_") + ".pdf";
}

// Professional Seera commercial-document layout (Founder UAT correction): the previous renderer
// packed everything into single pipe-delimited text lines with no logo, no sectioning, and no real
// table — functional but not something a real FMCG business could hand a partner. This keeps the
// exact same IssuedDocumentSnapshot input (zero changes needed at either call site in
// document-service.ts) and only rewrites how it's drawn: branded header, boxed issuer/buyer
// sections, a real bordered item table with every GST column the Founder asked for, and a clearly
// separated totals block.
// Money Desk 2.0 (Part N) — optional, render-time-only branding: a real signature/seal image and
// signatory name/designation, when the Founder has configured a Company Profile. Deliberately NOT
// part of IssuedDocumentSnapshot (which stays the immutable issuance-time financial/party record) —
// the signature/seal reflects the CURRENT Company Profile at download/print time, same as how a
// real letterhead can be updated without needing to reissue every historical invoice. Every field
// is optional; when none are supplied, the exact previous text-only "Authorised Signatory / Seal"
// line renders unchanged.
export type DocumentBranding = {
  signatoryName?: string;
  signatoryDesignation?: string;
  signatureImage?: { bytes: Uint8Array; mimeType: string };
  sealImage?: { bytes: Uint8Array; mimeType: string };
  // Money Desk 2.0 (Part 16 fix) — which party's name the "For {}" signatory line names. Defaults
  // to "issuer" (unchanged behaviour for every existing Sales Invoice/Quotation/etc. call site,
  // where the issuer — SEERA or a Distributor/S.S. — is the one authorizing their own outgoing
  // document). A Purchase Bill sets this to "buyer": there, `issuer` is the VENDOR (they issued the
  // original bill to us, shown correctly in the ISSUED BY box) but the signatory authorizing OUR
  // OWN internal record of that purchase is the Company itself — without this, the block would
  // read "For <Vendor>" directly above the Company's own configured signatory name, which is
  // backwards. Verified against a real generated PDF (pdftotext) before this fix existed.
  signatoryParty?: "issuer" | "buyer";
};

export async function renderIssuedDocumentPdf(snapshot: IssuedDocumentSnapshot, branding?: DocumentBranding): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const latin = await pdf.embedFont(readFileSync(safeFile("noto-sans/files/noto-sans-latin-400-normal.woff")), { subset: true });
  const hindi = await pdf.embedFont(readFileSync(safeFile("noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff")), { subset: true });
  const bold = await pdf.embedFont(readFileSync(safeFile("noto-sans/files/noto-sans-latin-700-normal.woff")), { subset: true });
  let logo: PDFImage | undefined;
  try {
    logo = await pdf.embedPng(readFileSync(path.join(process.cwd(), "public", "seera logo.png")));
  } catch {
    logo = undefined; // Never let a missing/unreadable logo asset block document issuance.
  }
  const embedBrandingImage = async (image?: { bytes: Uint8Array; mimeType: string }): Promise<PDFImage | undefined> => {
    if (!image) return undefined;
    try {
      return image.mimeType === "image/png" ? await pdf.embedPng(image.bytes) : await pdf.embedJpg(image.bytes);
    } catch {
      return undefined; // A corrupt/unreadable configured asset degrades to the text-only fallback, never blocks issuance.
    }
  };
  const signatureImage = await embedBrandingImage(branding?.signatureImage);
  const sealImage = await embedBrandingImage(branding?.sealImage);

  let page = pdf.addPage(PAGE as unknown as [number, number]);
  let y = PAGE[1] - MARGIN;
  const selectFont = (text: string, strong = false): PDFFont => (devanagari.test(text) ? hindi : strong ? bold : latin);
  const newPage = () => {
    page = pdf.addPage(PAGE as unknown as [number, number]);
    y = PAGE[1] - MARGIN;
  };
  const ensureRoom = (need: number) => {
    if (y - need < MARGIN + 30) newPage();
  };
  const text = (
    str: string,
    x: number,
    yy: number,
    opts: { size?: number; strong?: boolean; color?: ReturnType<typeof rgb>; maxWidth?: number } = {},
  ) => {
    page.drawText(String(str), { x, y: yy, size: opts.size ?? 9, font: selectFont(String(str), opts.strong), color: opts.color ?? INK, maxWidth: opts.maxWidth });
  };
  // pdf-lib has no built-in wrapping — greedy word-wrap against the font's actual measured width.
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
  const rightText = (str: string, rightEdge: number, yy: number, opts: { size?: number; strong?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const size = opts.size ?? 9;
    const font = selectFont(str, opts.strong);
    const w = font.widthOfTextAtSize(String(str), size);
    text(str, rightEdge - w, yy, opts);
  };

  // ---- Header: logo + brand, document title/number/date on the right ----
  const headerTop = y;
  if (logo) {
    const h = 42;
    const w = (logo.width / logo.height) * h;
    page.drawImage(logo, { x: MARGIN, y: headerTop - h, width: w, height: h });
  }
  const title = snapshot.type.replaceAll("_", " ");
  rightText(title, MARGIN + CONTENT_WIDTH, headerTop - 14, { size: 17, strong: true, color: BRAND });
  rightText(snapshot.documentNumber, MARGIN + CONTENT_WIDTH, headerTop - 30, { size: 10, strong: true });
  rightText(`Date: ${snapshot.issueDate}`, MARGIN + CONTENT_WIDTH, headerTop - 44, { size: 9, color: MUTED });
  let headerLineY = headerTop - 56;
  if (snapshot.validUntil) {
    rightText(`Valid until: ${snapshot.validUntil}`, MARGIN + CONTENT_WIDTH, headerLineY, { size: 8, color: MUTED });
    headerLineY -= 12;
  }
  if (snapshot.orderReference) {
    rightText(`Order ref: ${snapshot.orderReference}`, MARGIN + CONTENT_WIDTH, headerLineY, { size: 8, color: MUTED });
    headerLineY -= 12;
  }
  if (snapshot.originalDocumentNumber) {
    rightText(`Against Invoice: ${snapshot.originalDocumentNumber}${snapshot.originalDocumentDate ? ` (${snapshot.originalDocumentDate})` : ""}`, MARGIN + CONTENT_WIDTH, headerLineY, { size: 8, color: MUTED });
    headerLineY -= 12;
  }
  y = Math.min(headerTop - 68, headerLineY - 12);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_WIDTH, y }, thickness: 1.2, color: BRAND });
  y -= 18;

  // ---- Issuer / Buyer boxed sections, side by side ----
  const colGap = 16;
  const colWidth = (CONTENT_WIDTH - colGap) / 2;
  const partyBlockLines = (party: LegalPartySnapshot, isBuyer: boolean) => {
    const lines: { label: string; value: string }[] = [{ label: "", value: party.tradeName ? `${party.legalName} (${party.tradeName})` : party.legalName }];
    if (party.contactName) lines.push({ label: "Contact", value: party.contactName });
    if (party.mobile) lines.push({ label: "Mobile", value: party.mobile });
    if (party.address) lines.push({ label: "", value: party.address });
    if (party.state) lines.push({ label: isBuyer ? "Place of Supply" : "State", value: party.stateCode ? `${party.state} · ${party.stateCode}` : party.state });
    lines.push({ label: "GSTIN", value: party.gstin ?? "Unregistered" });
    return lines;
  };
  const issuerLines = partyBlockLines(snapshot.issuer, false);
  const buyerLines = partyBlockLines(snapshot.buyer, true);
  const drawParty = (label: string, party: LegalPartySnapshot, x: number, isBuyer: boolean) => {
    let yy = y;
    text(label, x, yy, { size: 7.5, strong: true, color: MUTED });
    yy -= 13;
    const lines = partyBlockLines(party, isBuyer);
    lines.forEach((l, i) => {
      const wrapped = wrap(l.value, selectFont(l.value, i === 0), i === 0 ? 10 : 8.5, colWidth - 4);
      wrapped.forEach((w) => {
        text(l.label ? `${l.label}: ${w}` : w, x, yy, { size: i === 0 ? 10 : 8.5, strong: i === 0 });
        yy -= i === 0 ? 13 : 11;
      });
    });
    return yy;
  };
  const boxHeight = 16 + Math.max(issuerLines.length, buyerLines.length) * 13 + 10;
  page.drawRectangle({ x: MARGIN, y: y - boxHeight, width: colWidth, height: boxHeight, borderColor: RULE, borderWidth: 0.8, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: MARGIN + colWidth + colGap, y: y - boxHeight, width: colWidth, height: boxHeight, borderColor: RULE, borderWidth: 0.8, color: rgb(1, 1, 1) });
  drawParty("ISSUED BY", snapshot.issuer, MARGIN + 8, false);
  drawParty("BILLED TO", snapshot.buyer, MARGIN + colWidth + colGap + 8, true);
  y -= boxHeight + 18;

  // ---- Item table ----
  const cols = [
    { key: "sr", label: "Sr.", width: 18, align: "left" as const },
    { key: "item", label: "Item / Variant / Pack", width: 98, align: "left" as const },
    { key: "hsn", label: "HSN", width: 34, align: "left" as const },
    { key: "qty", label: "Qty", width: 30, align: "right" as const },
    // Commercial UOM (Billing/Quotation Finalization, 23-Aug) made this column's real content much
    // wider than the old "180 g" / "PCS" strings it was sized for — e.g. "10 BOX (400 PC)". Widened
    // from the old 34pt (stolen from "item", which already wraps) and now wrapped the same way the
    // item column always has been, rather than guessing a fixed width that a future long pack string
    // could still overflow. See the rowLineCount computation below, which now accounts for both.
    { key: "unit", label: "Unit", width: 58, align: "left" as const },
    { key: "rate", label: "Rate", width: 46, align: "right" as const },
    { key: "disc", label: "Disc %", width: 32, align: "right" as const },
    { key: "taxable", label: "Taxable", width: 50, align: "right" as const },
    { key: "cgst", label: "CGST", width: 40, align: "right" as const },
    { key: "sgst", label: "SGST", width: 40, align: "right" as const },
    { key: "igst", label: "IGST", width: 42, align: "right" as const },
    { key: "total", label: "Line Total", width: 47, align: "right" as const },
  ];
  const positioned: (typeof cols[number] & { x: number })[] = [];
  {
    let cx = MARGIN;
    for (const c of cols) {
      positioned.push({ ...c, x: cx });
      cx += c.width;
    }
  }
  const itemCol = positioned.find((c) => c.key === "item")!;
  const unitCol = positioned.find((c) => c.key === "unit")!;
  const drawTableHeader = () => {
    ensureRoom(30);
    const headerY = y;
    page.drawRectangle({ x: MARGIN, y: headerY - 16, width: CONTENT_WIDTH, height: 16, color: HEADER_FILL });
    positioned.forEach((c) => {
      const tx = c.align === "right" ? c.x + c.width - 4 - bold.widthOfTextAtSize(c.label, 6.5) : c.x + 3;
      text(c.label, tx, headerY - 11, { size: 6.5, strong: true, color: BRAND });
    });
    y = headerY - 16;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_WIDTH, y }, thickness: 0.8, color: BRAND });
  };
  drawTableHeader();
  snapshot.lines.forEach((item, index) => {
    const nameLines = wrap(item.description, latin, 7.5, itemCol.width - 6);
    const unitLines = wrap(item.unit, latin, 7.5, unitCol.width - 6);
    const rowLineCount = Math.max(1, nameLines.length, unitLines.length);
    const rowHeight = rowLineCount * 9.5 + 6;
    ensureRoom(rowHeight + 4);
    if (y === PAGE[1] - MARGIN) drawTableHeader(); // continued on a new page
    const rowTop = y;
    const cellY = rowTop - 9;
    const values: Record<string, string> = {
      sr: String(index + 1),
      hsn: item.hsn ?? "—",
      qty: String(item.quantity),
      rate: money(item.rate, snapshot.currency),
      disc: item.discount ? item.discount.toFixed(1) : "—",
      taxable: money(item.taxableValue, snapshot.currency),
      cgst: item.cgst ? money(item.cgst, snapshot.currency) : "—",
      sgst: item.sgst ? money(item.sgst, snapshot.currency) : "—",
      igst: item.igst ? money(item.igst, snapshot.currency) : "—",
      total: money(item.total, snapshot.currency),
    };
    positioned.forEach((c) => {
      if (c.key === "item") {
        nameLines.forEach((line, li) => text(line, c.x + 3, cellY - li * 9.5, { size: 7.5 }));
        return;
      }
      if (c.key === "unit") {
        unitLines.forEach((line, li) => text(line, c.x + 3, cellY - li * 9.5, { size: 7.5 }));
        return;
      }
      const v = values[c.key] ?? "";
      const size = 7.5;
      const w = latin.widthOfTextAtSize(v, size);
      const tx = c.align === "right" ? c.x + c.width - 4 - w : c.x + 3;
      text(v, tx, cellY, { size });
    });
    y = rowTop - rowHeight;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_WIDTH, y }, thickness: 0.5, color: RULE });
  });
  y -= 14;

  // ---- Totals block, right-aligned ----
  ensureRoom(90);
  const totalsX = MARGIN + CONTENT_WIDTH - 210;
  const totalsRight = MARGIN + CONTENT_WIDTH;
  const totalsRow = (label: string, value: string, opts: { strong?: boolean; size?: number } = {}) => {
    text(label, totalsX, y, { size: opts.size ?? 9, color: opts.strong ? INK : MUTED, strong: opts.strong });
    rightText(value, totalsRight, y, { size: opts.size ?? 9, strong: opts.strong });
    y -= (opts.size ?? 9) + 6;
  };
  page.drawLine({ start: { x: totalsX - 8, y: y + 4 }, end: { x: totalsRight, y: y + 4 }, thickness: 0.8, color: RULE });
  y -= 6;
  totalsRow("Taxable total", money(snapshot.taxableTotal, snapshot.currency));
  if (snapshot.cgstTotal) totalsRow("CGST", money(snapshot.cgstTotal, snapshot.currency));
  if (snapshot.sgstTotal) totalsRow("SGST", money(snapshot.sgstTotal, snapshot.currency));
  if (snapshot.igstTotal) totalsRow("IGST", money(snapshot.igstTotal, snapshot.currency));
  totalsRow("GST total", money(snapshot.cgstTotal + snapshot.sgstTotal + snapshot.igstTotal, snapshot.currency));
  page.drawLine({ start: { x: totalsX - 8, y: y + 4 }, end: { x: totalsRight, y: y + 4 }, thickness: 0.8, color: BRAND });
  y -= 12;
  totalsRow("GRAND TOTAL", money(snapshot.grandTotal, snapshot.currency), { strong: true, size: 13 });
  y -= 8;

  // ---- Amount in words ----
  ensureRoom(16);
  const wordsLine = wrap(`Amount in words: ${amountInWords(snapshot.grandTotal, snapshot.currency)}`, latin, 8, CONTENT_WIDTH);
  wordsLine.forEach((l) => {
    text(l, MARGIN, y, { size: 8, strong: true, color: MUTED });
    y -= 11;
  });
  y -= 4;

  // ---- Terms / notes ----
  if (snapshot.paymentTerms) {
    ensureRoom(16);
    text(`Payment / Credit terms: ${snapshot.paymentTerms}`, MARGIN, y, { size: 8.5 });
    y -= 14;
  }
  if (snapshot.notes) {
    ensureRoom(16);
    text(`Notes: ${snapshot.notes}`, MARGIN, y, { size: 8.5, maxWidth: CONTENT_WIDTH });
    y -= 14;
  }

  // ---- Signatory block ----
  // Part N: a real configured seal image draws to the left of the signature line (the standard
  // Indian-business placement, often overlapping/adjacent to the line), a real configured
  // signature image draws just above it. Either, both, or neither may be configured — the text
  // fallback ("Authorised Signatory / Seal") always still renders, so an unconfigured Company
  // Profile never looks broken, exactly as Part N requires.
  ensureRoom(70);
  y -= 8;
  const sigWidth = 180;
  const sigX = MARGIN + CONTENT_WIDTH - sigWidth;
  const signatoryOwner = branding?.signatoryParty === "buyer" ? snapshot.buyer : snapshot.issuer;
  text(`For ${signatoryOwner.tradeName ?? signatoryOwner.legalName}`, sigX, y, { size: 8.5, strong: true });
  y -= 6;
  if (sealImage) {
    const sealSize = 44;
    page.drawImage(sealImage, { x: sigX - sealSize - 8, y: y - sealSize, width: sealSize, height: sealSize, opacity: 0.85 });
  }
  if (signatureImage) {
    const sigImgH = 30;
    const sigImgW = (signatureImage.width / signatureImage.height) * sigImgH;
    page.drawImage(signatureImage, { x: sigX + (sigWidth - sigImgW) / 2, y: y - sigImgH - 4, width: sigImgW, height: sigImgH });
  }
  y -= 42;
  page.drawLine({ start: { x: sigX, y }, end: { x: sigX + sigWidth, y }, thickness: 0.6, color: RULE });
  y -= 10;
  if (branding?.signatoryName) {
    rightText(branding.signatoryName, sigX + sigWidth, y, { size: 8, strong: true });
    y -= 11;
    if (branding.signatoryDesignation) {
      rightText(branding.signatoryDesignation, sigX + sigWidth, y, { size: 7.5, color: MUTED });
      y -= 11;
    }
  } else {
    text("Authorised Signatory / Seal", sigX, y, { size: 7.5, color: MUTED });
    y -= 16;
  }

  // ---- Footer ----
  ensureRoom(20);
  page.drawLine({ start: { x: MARGIN, y: MARGIN + 22 }, end: { x: MARGIN + CONTENT_WIDTH, y: MARGIN + 22 }, thickness: 0.6, color: RULE });
  const pageCount = pdf.getPageCount();
  pdf.getPages().forEach((p, i) => {
    p.drawText("System-issued from immutable issuance-time records — Seera Sales & Distribution OS", { x: MARGIN, y: MARGIN + 10, size: 6.5, font: latin, color: MUTED });
    const pageLabel = `Page ${i + 1} of ${pageCount}`;
    const w = latin.widthOfTextAtSize(pageLabel, 6.5);
    p.drawText(pageLabel, { x: MARGIN + CONTENT_WIDTH - w, y: MARGIN + 10, size: 6.5, font: latin, color: MUTED });
  });

  pdf.setTitle(`${snapshot.type} ${snapshot.documentNumber}`);
  pdf.setCreator("Seera Sales & Distribution OS");
  return pdf.save();
}
