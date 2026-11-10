import Link from "@/components/seera/foundation/PortalLink";
import type { PrismaClient } from "@prisma/client";
import { PageHeading } from "@/components/seera/foundation/States";
import {
  BUILTIN_LIBRARY_DOCUMENTS,
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_LABELS,
  type LibraryCategory,
} from "@/lib/sales-distribution/company-library";
import { listUploadedLibraryDocuments, livePriceList, type LivePriceRow } from "@/lib/sales-distribution/company-library-service";
import { ArchiveLibraryDocumentButton, LibraryUploadForm, PrintPriceListButton } from "./CompanyLibraryActions";
import styles from "./CompanyLibrary.module.css";

type Lang = "EN" | "HI";
const inr = (n: number | null) => (n == null ? "—" : `₹ ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const label = (category: string, language: Lang) => {
  const l = LIBRARY_CATEGORY_LABELS[category as LibraryCategory];
  return l ? (language === "HI" ? l[1] : l[0]) : category;
};
const size = (bytes: number) => (bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);

export async function CompanyLibrarySection({
  db, userId, portal, slug, language, query, canManage,
}: {
  db: PrismaClient;
  userId: string;
  portal: string;
  slug: string;
  language: Lang;
  query: Record<string, string | undefined>;
  canManage: boolean;
}) {
  const hi = language === "HI";
  const base = `/portal/${portal}/${slug}`;
  const tab = query.tab === "price-list" ? "price-list" : "documents";
  return (
    <>
      <PageHeading
        title={hi ? "कंपनी दस्तावेज़ और रेट लिस्ट" : "Company documents & price list"}
        description={
          hi
            ? "सुपर स्टॉकिस्ट, वितरक और डिपो नियुक्ति के फ़ॉर्म, अनुबंध और नियम — और कंपनी की लाइव रेट लिस्ट।"
            : "Appointment forms, agreements and rules for Super Stockists, Distributors and Depots — plus the Company's live price list."
        }
      />
      <nav className={styles.tabs} aria-label={hi ? "अनुभाग" : "Sections"}>
        <Link className={`${styles.tab} ${tab === "documents" ? styles.tabOn : ""}`} href={base}>
          {hi ? "दस्तावेज़" : "Documents"}
        </Link>
        <Link className={`${styles.tab} ${tab === "price-list" ? styles.tabOn : ""}`} href={`${base}?tab=price-list`}>
          {hi ? "लाइव रेट लिस्ट" : "Live price list"}
        </Link>
      </nav>
      {tab === "price-list" ? (
        <PriceList db={db} userId={userId} language={language} />
      ) : (
        <Documents db={db} userId={userId} language={language} canManage={canManage} />
      )}
    </>
  );
}

async function Documents({ db, userId, language, canManage }: { db: PrismaClient; userId: string; language: Lang; canManage: boolean }) {
  const hi = language === "HI";
  const uploaded = await listUploadedLibraryDocuments(db, userId);
  const order: LibraryCategory[] = ["SUPER_STOCKIST", "DISTRIBUTOR", "DEPOT", "GENERAL", "SALES_TEAM"];
  return (
    <>
      {order.map((category) => {
        const builtins = BUILTIN_LIBRARY_DOCUMENTS.filter((d) => d.category === category);
        const extra = uploaded.documents.filter((d) => d.category === category);
        if (!builtins.length && !extra.length) return null;
        return (
          <section className={styles.section} key={category}>
            <h2>{label(category, language)}</h2>
            <div className={styles.docs}>
              {builtins.map((d) => (
                <article className={styles.doc} key={d.slug}>
                  <h3>{hi ? d.title[1] : d.title[0]}</h3>
                  <p>{hi ? d.description[1] : d.description[0]}</p>
                  <div className={styles.meta}>
                    <span className={styles.pill}>PDF · {d.pages} {hi ? "पेज" : d.pages === 1 ? "page" : "pages"}</span>
                  </div>
                  <div className={styles.actions}>
                    <a className={styles.download} href={`/api/company-library/builtin/${d.slug}`}>
                      {hi ? "डाउनलोड करें" : "Download"}
                    </a>
                  </div>
                </article>
              ))}
              {extra.map((d) => (
                <article className={styles.doc} key={d.id}>
                  <h3>{d.title}</h3>
                  {d.description && <p>{d.description}</p>}
                  <div className={styles.meta}>
                    <span className={`${styles.pill} ${styles.pillNew}`}>{hi ? "कंपनी द्वारा जोड़ा गया" : "Added by Company"}</span>
                    <span>{d.mimeType === "application/pdf" ? "PDF" : "Image"} · {size(d.sizeBytes)} · {d.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
                  </div>
                  <div className={styles.actions}>
                    <a className={styles.download} href={`/api/company-library/${encodeURIComponent(d.id)}`}>
                      {hi ? "डाउनलोड करें" : "Download"}
                    </a>
                    {canManage && <ArchiveLibraryDocumentButton id={d.id} language={language} />}
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
      {canManage && (
        <section className={styles.section}>
          <h2>{hi ? "नया दस्तावेज़ जोड़ें" : "Add a document"}</h2>
          {uploaded.available ? (
            <LibraryUploadForm
              language={language}
              categories={LIBRARY_CATEGORIES.map((c) => ({ value: c, label: label(c, language) }))}
            />
          ) : (
            <p className={styles.note}>
              {hi
                ? "अपलोड अभी उपलब्ध नहीं है — डेटाबेस माइग्रेशन (company library) लागू होना बाकी है।"
                : "Uploads are not available yet — the company-library database migration has not been applied."}
            </p>
          )}
        </section>
      )}
    </>
  );
}

async function PriceList({ db, userId, language }: { db: PrismaClient; userId: string; language: Lang }) {
  const hi = language === "HI";
  const rows = await livePriceList(db, userId);
  const brands = [...new Set(rows.map((r) => r.brand))];
  const latest = rows.reduce<Date | null>((max, r) => (r.effectiveFrom && (!max || r.effectiveFrom > max) ? r.effectiveFrom : max), null);
  return (
    <section className={styles.section}>
      <p className={styles.note}>
        {hi
          ? "यह रेट लिस्ट सीधे कंपनी के मास्टर रेट से आती है — कंपनी रेट बदलते ही यहाँ और ऑर्डर में अपने-आप बदल जाती है। रेट बेसिक (GST अलग) हैं।"
          : "This list reads the Company's governed master rates — when the Company changes a rate it updates here and in orders automatically. Rates are basic (GST extra)."}
        {latest && <> {hi ? "नवीनतम बदलाव:" : "Latest change:"} <b>{latest.toLocaleDateString("en-IN", { dateStyle: "medium" })}</b>.</>}
      </p>
      <div className={`${styles.actions} ${styles.noPrint}`}>
        <PrintPriceListButton language={language} />
      </div>
      {rows.length === 0 ? (
        <p className={styles.muted}>{hi ? "अभी कोई सक्रिय SKU / रेट नहीं है।" : "No active SKUs / rates yet."}</p>
      ) : (
        <div className={styles.priceWrap}>
          <table className={styles.price}>
            <thead>
              <tr>
                <th>{hi ? "उत्पाद" : "Product"}</th>
                <th>{hi ? "S.S. रेट" : "S.S. rate"}</th>
                <th>{hi ? "वितरक रेट" : "Distributor"}</th>
                <th className={styles.wide}>MRP</th>
                <th className={styles.wide}>GST</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => (
                <BrandRows key={brand} brand={brand} rows={rows.filter((r) => r.brand === brand)} language={language} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BrandRows({ brand, rows, language }: { brand: string; rows: LivePriceRow[]; language: Lang }) {
  const hi = language === "HI";
  return (
    <>
      <tr className={styles.brand}><td colSpan={5}>{brand}</td></tr>
      {rows.map((r) => (
        <tr key={r.skuId}>
          <td>{r.productName}<div className={styles.muted}>{r.packSize} {r.unitType} · {r.unitsPerCase} / {hi ? "केस" : "case"} · {r.code}</div>
            <div className={`${styles.muted} ${styles.narrow}`}>MRP {inr(r.mrp)} · GST {r.taxRatePercent == null ? "—" : `${r.taxRatePercent}%`}</div></td>
          <td className={styles.num}>{inr(r.ssRate)}</td>
          <td className={styles.num}>
            {inr(r.distributorRate)}
            {r.distributorRateSource === "DERIVED_FROM_COMPANY_TO_SS" && <div className={styles.muted}>{hi ? "S.S. रेट से" : "via S.S. rate"}</div>}
          </td>
          <td className={`${styles.num} ${styles.wide}`}>{inr(r.mrp)}</td>
          <td className={`${styles.num} ${styles.wide}`}>{r.taxRatePercent == null ? "—" : `${r.taxRatePercent}%`}</td>
        </tr>
      ))}
    </>
  );
}
