import type { Metadata } from "next";
import { prisma } from "@/lib/database/client";
import { resolveCatalogueLink } from "@/lib/sales-distribution/market-survey-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seera catalogue", robots: { index: false, follow: false } };

/**
 * Personalised catalogue link from a market survey follow-up (revocable, expiring, unguessable;
 * only a hash of the token is stored). Read-only: shows active Seera products and MRP. It never
 * creates an order, and does not quote stock, delivery dates or the retailer's purchase rate —
 * those are confirmed by the Seera representative through the normal order workflow.
 */
export default async function CataloguePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const catalogue = await resolveCatalogueLink(prisma, token);
  const shell = { maxWidth: 720, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif", color: "#172554" } as const;
  if (!catalogue)
    return (
      <main style={shell}>
        <h1>Seera</h1>
        <p>This link has expired or is no longer active. Please contact your Seera representative for an updated catalogue.</p>
        <p lang="hi">यह लिंक अब सक्रिय नहीं है। नई कैटलॉग के लिए अपने सीरा प्रतिनिधि से संपर्क करें।</p>
      </main>
    );
  return (
    <main style={shell}>
      <p style={{ color: "#dc2626", fontWeight: 800, letterSpacing: ".08em", margin: 0 }}>SEERA DETERGENT</p>
      <h1 style={{ marginTop: 4 }}>Catalogue for {catalogue.shopName}</h1>
      <p>Current Seera products and MRP. Your purchase rate, scheme and delivery are confirmed by your Seera representative when you place an order.</p>
      <p lang="hi">सीरा के मौजूदा उत्पाद और MRP। आपका खरीद रेट, स्कीम और डिलीवरी ऑर्डर देते समय आपके सीरा प्रतिनिधि द्वारा बताए जाएँगे।</p>
      {catalogue.skus.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#f8fafc" }}>
                <th style={{ padding: 10 }}>Product</th>
                <th style={{ padding: 10 }}>Pack</th>
                <th style={{ padding: 10 }}>Units / case</th>
                <th style={{ padding: 10 }}>MRP ₹</th>
              </tr>
            </thead>
            <tbody>
              {catalogue.skus.map((sku) => (
                <tr key={sku.code} style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td style={{ padding: 10 }}>{sku.productName}<br /><small style={{ color: "#64748b" }}>{sku.category}</small></td>
                  <td style={{ padding: 10 }}>{Number(sku.packSize)} {sku.unitType}</td>
                  <td style={{ padding: 10 }}>{sku.unitsPerCase}</td>
                  <td style={{ padding: 10 }}>{Number(sku.mrp).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>The catalogue is being updated. Please contact your Seera representative.</p>
      )}
    </main>
  );
}
