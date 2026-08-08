type PdfQuotation = { quotationNumber: string; versionNumber: number; issueDate: Date; validUntil: Date;
  customer: string; opportunityNumber: string; owner: string; subtotal: string; taxTotal: string; discountTotal: string;
  grandTotal: string; lines: { productName: string; sku: string; quantity: number; unitPrice: string; total: string }[]; terms: string[] };

const esc = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
export function generateQuotationPdf(input: PdfQuotation) {
  const rows = [
    "MUV — COMMERCIAL QUOTATION", `Quotation: ${input.quotationNumber}  Version: ${input.versionNumber}`,
    `Issue: ${input.issueDate.toLocaleDateString("en-IN")}  Valid until: ${input.validUntil.toLocaleDateString("en-IN")}`,
    `Customer: ${input.customer}`, `Opportunity: ${input.opportunityNumber}`, `Sales representative: ${input.owner}`, "",
    "Product / SKU                         Qty       Unit Price       Total",
    ...input.lines.map(line => `${line.productName} / ${line.sku}    ${line.quantity}       ${line.unitPrice}       ${line.total}`),
    "", `Subtotal: ${input.subtotal}`, `Discount: ${input.discountTotal}`, `Tax: ${input.taxTotal}`, `Grand Total: ${input.grandTotal}`,
    "", "Terms & Conditions", ...input.terms, "", "Authorized Signature: ____________________",
  ].slice(0, 45);
  const commands = ["BT", "/F1 16 Tf", "50 790 Td", ...rows.flatMap((line, index) => [
    index === 1 ? "/F1 10 Tf" : "", `(${esc(line)}) Tj`, "0 -16 Td",
  ]), "ET"].filter(Boolean).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n", offset = pdf.length; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(offset); const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`; pdf += chunk; offset += Buffer.byteLength(chunk); });
  const xref = offset; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
