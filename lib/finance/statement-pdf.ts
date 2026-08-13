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
