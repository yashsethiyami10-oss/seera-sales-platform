"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/** Browser-native print-to-PDF is a real, standard "Download Invoice" path
 * — no PDF-generation library exists in this project (lib/tax/invoice.ts's
 * own comment already noted the gap), and this needs no new dependency. */
export function PrintButton() {
  return (
    <Button variant="ghost" onClick={() => window.print()}>
      <Download size={15} /> Download Invoice
    </Button>
  );
}
