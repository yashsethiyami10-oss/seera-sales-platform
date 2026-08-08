import { readFileSync } from "node:fs";
import "regenerator-runtime/runtime";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type LegalPartySnapshot = { legalName: string; tradeName?: string; gstin?: string; address: string; state?: string; stateCode?: string };
export type DocumentLineSnapshot = { description: string; hsn?: string; quantity: number; unit: string; rate: number; discount?: number; taxableValue: number; cgst?: number; sgst?: number; igst?: number; total: number };
export type IssuedDocumentSnapshot = {
  type: string; documentNumber: string; issueDate: string; issuer: LegalPartySnapshot; buyer: LegalPartySnapshot;
  orderReference?: string; lines: DocumentLineSnapshot[]; subtotal: number; taxableTotal: number;
  cgstTotal: number; sgstTotal: number; igstTotal: number; grandTotal: number; currency?: string;
  paymentTerms?: string; notes?: string;
};

const devanagari = /[\u0900-\u097F]/;
const safeFile = (name: string) => path.join(process.cwd(), "node_modules", "@fontsource", name);

export function documentPdfFilename(input: Pick<IssuedDocumentSnapshot, "type" | "documentNumber">) {
  return `${input.type}-${input.documentNumber}`.replace(/[^A-Za-z0-9._-]+/g, "_") + ".pdf";
}

export async function renderIssuedDocumentPdf(snapshot: IssuedDocumentSnapshot): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const latin = await pdf.embedFont(readFileSync(safeFile("noto-sans/files/noto-sans-latin-400-normal.woff")), { subset: true });
  const hindi = await pdf.embedFont(readFileSync(safeFile("noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff")), { subset: true });
  const bold = await pdf.embedFont(readFileSync(safeFile("noto-sans/files/noto-sans-latin-700-normal.woff")), { subset: true });
  let page = pdf.addPage([595.28, 841.89]); let y = 800;
  const selectFont = (text: string, strong = false): PDFFont => devanagari.test(text) ? hindi : strong ? bold : latin;
  const line = (text: string, options: { size?: number; strong?: boolean; x?: number } = {}) => {
    const size = options.size ?? 9; if (y < 45) { page = pdf.addPage([595.28, 841.89]); y = 800; }
    page.drawText(String(text), { x: options.x ?? 40, y, size, font: selectFont(String(text), options.strong), color: rgb(0.08, 0.1, 0.16), maxWidth: 515 }); y -= size + 6;
  };
  const rule = (target: PDFPage = page) => { target.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.7, color: rgb(0.72, 0.75, 0.8) }); y -= 10; };
  line(snapshot.type.replaceAll("_", " "), { size: 18, strong: true }); line(snapshot.documentNumber, { size: 11, strong: true }); line(`Date: ${snapshot.issueDate}`); if (snapshot.orderReference) line(`Reference: ${snapshot.orderReference}`); rule();
  line(`Issuer: ${snapshot.issuer.legalName}`, { strong: true }); if (snapshot.issuer.tradeName) line(snapshot.issuer.tradeName); line(snapshot.issuer.address); if (snapshot.issuer.gstin) line(`GSTIN: ${snapshot.issuer.gstin}`); line(`State: ${snapshot.issuer.state ?? ""} ${snapshot.issuer.stateCode ?? ""}`); y -= 5;
  line(`Buyer: ${snapshot.buyer.legalName}`, { strong: true }); line(snapshot.buyer.address); if (snapshot.buyer.gstin) line(`GSTIN: ${snapshot.buyer.gstin}`); rule();
  line("Item | HSN | Qty/Unit | Rate | Discount | Taxable | CGST | SGST | IGST | Total", { size: 7, strong: true });
  snapshot.lines.forEach((item, index) => line(`${index + 1}. ${item.description} | ${item.hsn ?? "-"} | ${item.quantity}/${item.unit} | ${item.rate.toFixed(2)} | ${(item.discount ?? 0).toFixed(2)} | ${item.taxableValue.toFixed(2)} | ${(item.cgst ?? 0).toFixed(2)} | ${(item.sgst ?? 0).toFixed(2)} | ${(item.igst ?? 0).toFixed(2)} | ${item.total.toFixed(2)}`, { size: 7 }));
  rule(); line(`Subtotal: ${snapshot.subtotal.toFixed(2)} ${snapshot.currency ?? "INR"}`, { x: 340 }); line(`Taxable: ${snapshot.taxableTotal.toFixed(2)}`, { x: 340 }); line(`CGST: ${snapshot.cgstTotal.toFixed(2)} | SGST: ${snapshot.sgstTotal.toFixed(2)} | IGST: ${snapshot.igstTotal.toFixed(2)}`, { x: 340 }); line(`Grand Total: ${snapshot.grandTotal.toFixed(2)} ${snapshot.currency ?? "INR"}`, { x: 340, size: 12, strong: true });
  if (snapshot.paymentTerms) { y -= 8; line(`Payment/Credit Terms: ${snapshot.paymentTerms}`); } if (snapshot.notes) line(`Notes: ${snapshot.notes}`);
  y -= 12; line("System generated from immutable issuance-time snapshots. Legal values are rendered without master-data recomputation.", { size: 7 });
  pdf.setTitle(`${snapshot.type} ${snapshot.documentNumber}`); pdf.setCreator("Seera Sales & Distribution OS");
  return pdf.save();
}
