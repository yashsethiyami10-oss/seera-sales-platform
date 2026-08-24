import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

// Professional Ledger Statement PDF (Money Desk maturity pass, 24-Aug §27) — a real
// Date/Particulars/Voucher/Debit/Credit/Balance table, header repeated on every page, used for
// every party type (Distributor/S.S./Vendor/Employee) via the same renderer so no party type can
// ever drift from another's layout or totals math.
const LEDGER_COLS: { key: string; label: string; x: number; width: number; right?: boolean }[] = [
  { key: "date", label: "Date", x: 0, width: 62 },
  { key: "particulars", label: "Particulars", x: 62, width: 158 },
  { key: "voucher", label: "Voucher", x: 220, width: 92 },
  { key: "debit", label: "Debit (Dr)", x: 312, width: 78, right: true },
  { key: "credit", label: "Credit (Cr)", x: 390, width: 78, right: true },
  { key: "balance", label: "Balance", x: 468, width: 79, right: true },
];

function truncate(text: string, maxChars: number) {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

export async function renderLedgerStatementPdf(input: {
  companyName: string;
  party: { name: string; type: string; address?: string | null; mobile?: string | null; gstin?: string | null; territory?: string | null };
  period: { from: string; to: string };
  openingBalance: number;
  rows: { date: string; particulars: string; voucher: string; debit: number; credit: number; balance: number }[];
  totals: { debit: number; credit: number; closingBalance: number };
  normalSide: "DEBIT" | "CREDIT";
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const fmt = (v: number) => `Rs. ${Math.round(Math.abs(v)).toLocaleString("en-IN")}${v === 0 ? "" : v > 0 === (input.normalSide === "DEBIT") ? " Dr" : " Cr"}`;
  const line = (text: string, opts: { size?: number; useBold?: boolean; x?: number } = {}) => {
    page.drawText(text, { x: opts.x ?? MARGIN, y, size: opts.size ?? 10, font: opts.useBold ? bold : font, color: rgb(0.08, 0.08, 0.08) });
  };

  const drawTableHeader = () => {
    y -= 4;
    page.drawRectangle({ x: MARGIN, y: y - 14, width: PAGE_WIDTH - MARGIN * 2, height: 16, color: rgb(0.92, 0.92, 0.92) });
    for (const col of LEDGER_COLS) {
      const textX = MARGIN + col.x + (col.right ? col.width - font.widthOfTextAtSize(col.label, 8.5) : 0);
      page.drawText(col.label, { x: textX, y: y - 10, size: 8.5, font: bold, color: rgb(0.08, 0.08, 0.08) });
    }
    y -= 20;
  };

  const newPage = (withHeader: boolean) => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    if (withHeader) drawTableHeader();
  };

  // Statement header block
  line(input.companyName, { size: 16, useBold: true }); y -= 20;
  line("LEDGER STATEMENT", { size: 12, useBold: true }); y -= 18;
  line(`${input.party.name} (${input.party.type.replace(/_/g, " ")})`, { size: 10.5, useBold: true }); y -= 14;
  if (input.party.address) { line(input.party.address, { size: 9 }); y -= 12; }
  const contactBits = [input.party.mobile ? `Mobile: ${input.party.mobile}` : null, input.party.gstin ? `GSTIN: ${input.party.gstin}` : null, input.party.territory ? `Territory: ${input.party.territory}` : null].filter(Boolean).join("   ");
  if (contactBits) { line(contactBits, { size: 9 }); y -= 12; }
  line(`Statement Period: ${new Date(input.period.from).toLocaleDateString("en-IN")} to ${new Date(input.period.to).toLocaleDateString("en-IN")}`, { size: 9 }); y -= 12;
  line(`Opening Balance: ${fmt(input.openingBalance)}`, { size: 9.5, useBold: true }); y -= 16;

  drawTableHeader();
  for (const row of input.rows) {
    if (y < MARGIN + 60) newPage(true);
    const rowY = y;
    page.drawText(new Date(row.date).toLocaleDateString("en-IN"), { x: MARGIN, y: rowY, size: 8.5, font });
    page.drawText(truncate(row.particulars, 30), { x: MARGIN + 62, y: rowY, size: 8.5, font });
    page.drawText(truncate(row.voucher, 18), { x: MARGIN + 220, y: rowY, size: 8.5, font });
    const debitText = row.debit > 0 ? Math.round(row.debit).toLocaleString("en-IN") : "-";
    const creditText = row.credit > 0 ? Math.round(row.credit).toLocaleString("en-IN") : "-";
    const balanceText = fmt(row.balance);
    page.drawText(debitText, { x: MARGIN + 312 + 78 - font.widthOfTextAtSize(debitText, 8.5), y: rowY, size: 8.5, font });
    page.drawText(creditText, { x: MARGIN + 390 + 78 - font.widthOfTextAtSize(creditText, 8.5), y: rowY, size: 8.5, font });
    page.drawText(balanceText, { x: MARGIN + 468 + 79 - font.widthOfTextAtSize(balanceText, 8.5), y: rowY, size: 8.5, font });
    y -= 15;
  }
  if (input.rows.length === 0) { line("No transactions in this period.", { size: 9 }); y -= 16; }

  if (y < MARGIN + 60) newPage(false);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 4 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  y -= 12;
  line(`Total Debit: Rs. ${Math.round(input.totals.debit).toLocaleString("en-IN")}`, { size: 9.5, useBold: true }); y -= 14;
  line(`Total Credit: Rs. ${Math.round(input.totals.credit).toLocaleString("en-IN")}`, { size: 9.5, useBold: true }); y -= 14;
  line(`Closing Balance: ${fmt(input.totals.closingBalance)}`, { size: 10.5, useBold: true }); y -= 18;
  line(`Generated on ${new Date().toLocaleString("en-IN")} — computer-generated statement, no signature required.`, { size: 7.5 });

  return pdf.save();
}
