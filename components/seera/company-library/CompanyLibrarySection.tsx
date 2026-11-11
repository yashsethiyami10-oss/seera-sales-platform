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
import { PartnerApplicationForm } from "./PartnerApplicationForm";
import { listPartnerApplications } from "@/lib/sales-distribution/partner-application-service";
import styles from "./CompanyLibrary.module.css";

type Lang = "EN" | "HI";
const inr = (n: number | null) => (n == null ? "—" : `₹ ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const label = (category: string, language: Lang) => {
  const l = LIBRARY_CATEGORY_LABELS[category as LibraryCategory];
  return l ? (language === "HI" ? l[1] : l[0]) : category;
};
const size = (bytes: number) => (bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);

export async function CompanyLibrarySection({
  db, userId, portal, slug, language, query, canManage, canApply,
}: {
  db: PrismaClient;
  userId: string;
  portal: string;
  slug: string;
  language: Lang;
  query: Record<string, string | undefined>;
  canManage: boolean;
  canApply: boolean;
}) {
  const hi = language === "HI";
  const base = `/portal/${portal}/${slug}`;
  const tabs = ["documents", "price-list", ...(canApply ? ["apply"] : []), ...(canApply || canManage ? ["applications"] : [])];
  const tab = tabs.includes(query.tab ?? "") ? (query.tab as string) : "documents";
  const appType = query.type === "SUPER_STOCKIST" || query.type === "DEPOT" ? query.type : "DISTRIBUTOR";
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
        {tabs.includes("apply") && (
          <Link className={`${styles.tab} ${tab === "apply" ? styles.tabOn : ""}`} href={`${base}?tab=apply`}>
            {hi ? "ऑनलाइन फ़ॉर्म भरें" : "Fill form online"}
          </Link>
        )}
        {tabs.includes("applications") && (
          <Link className={`${styles.tab} ${tab === "applications" ? styles.tabOn : ""}`} href={`${base}?tab=applications`}>
            {hi ? "जमा आवेदन" : "Submitted applications"}
          </Link>
        )}
      </nav>
      {tab === "price-list" ? (
        <PriceList db={db} userId={userId} language={language} />
      ) : tab === "apply" ? (
        <section className={styles.section}>
          <p className={styles.note}>
            {hi
              ? "आवेदक के साथ बैठकर फ़ोन पर भरें। जमा होते ही यह आपकी वितरक खोज (प्रॉस्पेक्ट) में \"Evaluation\" चरण में आ जाएगा — पेपर फ़ॉर्म की ज़रूरत नहीं।"
              : "Fill this on the phone with the applicant. On submit it lands in your Distributor search (prospects) at stage \"Evaluation\" — no paper form needed."}
          </p>
          <PartnerApplicationForm language={language} initialType={appType} />
        </section>
      ) : tab === "applications" ? (
        <Applications db={db} userId={userId} language={language} />
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
          ? "यह रेट लिस्ट सीधे कंपनी के मास्टर रेट से आती है — कंपनी रेट बदलते ही यहाँ और ऑर्डर में अपने-आप बदल जाती है। रेट GST सहित हैं (नीचे छोटे अक्षरों में बेसिक रेट)।"
          : "This list reads the Company's governed master rates — when the Company changes a rate it updates here and in orders automatically. Rates include GST (basic rate shown below in small text)."}
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
                <th>{hi ? "S.S. रेट (GST सहित)" : "S.S. rate (incl. GST)"}</th>
                <th>{hi ? "वितरक रेट (GST सहित)" : "Distributor (incl. GST)"}</th>
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
          <td className={styles.num}>
            <RateCell incl={r.ssRateInclGst} basic={r.ssRate} mode={r.priceMode} language={language} />
          </td>
          <td className={styles.num}>
            <RateCell incl={r.distributorRateInclGst} basic={r.distributorRate} mode={r.priceMode} language={language} />
            {r.distributorRateSource === "DERIVED_FROM_COMPANY_TO_SS" && <div className={styles.muted}>{hi ? "S.S. रेट से" : "via S.S. rate"}</div>}
          </td>
          <td className={`${styles.num} ${styles.wide}`}>{inr(r.mrp)}</td>
          <td className={`${styles.num} ${styles.wide}`}>{r.taxRatePercent == null ? "—" : `${r.taxRatePercent}%`}</td>
        </tr>
      ))}
    </>
  );
}

const APPLICATION_LABELS: [string, string, string][] = [
  ["tradeName", "Trade name", "ट्रेड नाम"], ["constitution", "Constitution", "फर्म का प्रकार"], ["yearEstablished", "Established", "स्थापना"],
  ["gstStatus", "GST status", "GST स्थिति"], ["gstin", "GSTIN", "GSTIN"], ["pan", "PAN", "PAN"], ["address", "Address", "पता"],
  ["city", "Village / Town / City", "गाँव / कस्बा / शहर"], ["district", "District", "ज़िला"], ["state", "State", "राज्य"], ["pincode", "PIN", "पिन"],
  ["ownerName", "Owner", "मालिक"], ["fatherName", "Father's name", "पिता का नाम"], ["alternateMobile", "Alternate mobile", "दूसरा मोबाइल"],
  ["email", "Email", "ईमेल"], ["aadhaarLast4", "Aadhaar (last 4)", "आधार (आख़िरी 4)"], ["yearsInBusiness", "Years in business", "व्यवसाय के साल"],
  ["turnover", "Turnover", "टर्नओवर"], ["brandsHandled", "Brands handled", "ब्रांड"], ["reach", "Reach", "पहुँच"], ["godown", "Godown", "गोदाम"],
  ["vehicles", "Vehicles", "गाड़ियाँ"], ["staff", "Staff", "स्टाफ़"], ["depotDetails", "Depot details", "डिपो विवरण"],
  ["areasApplied", "Areas applied", "क्षेत्र"], ["mappedSuperStockist", "Mapped S.S.", "मैप्ड एस.एस."], ["openingOrderValue", "Opening order", "पहला ऑर्डर"],
  ["monthlyPurchase", "Monthly purchase", "मासिक ख़रीद"], ["securityDeposit", "Security deposit", "डिपॉज़िट"], ["bankName", "Bank", "बैंक"],
  ["accountHolder", "Account holder", "खाताधारक"], ["accountNumber", "Account no.", "खाता संख्या"], ["ifsc", "IFSC", "IFSC"],
  ["references", "References", "रेफ़रेंस"], ["remarks", "Remarks", "टिप्पणी"],
];

async function Applications({ db, userId, language }: { db: PrismaClient; userId: string; language: Lang }) {
  const hi = language === "HI";
  const rows = await listPartnerApplications(db, userId);
  if (!rows.length) return <p className={styles.muted}>{hi ? "अभी कोई ऑनलाइन आवेदन नहीं है।" : "No online applications yet."}</p>;
  return (
    <section className={styles.section}>
      {rows.map((r) => (
        <details className={styles.doc} key={r.id}>
          <summary style={{ cursor: "pointer" }}>
            <strong>{r.firmName}</strong> · {label(r.type === "SUPER_STOCKIST" ? "SUPER_STOCKIST" : r.type === "DEPOT" ? "DEPOT" : "DISTRIBUTOR", language)} · {r.mobile}
            <div className={styles.meta}>
              <span className={styles.pill}>{r.stage}</span>
              <span>{r.submittedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })} · {hi ? "द्वारा" : "by"} {r.submittedBy}</span>
            </div>
          </summary>
          <dl style={{ display: "grid", gridTemplateColumns: "minmax(110px,170px) 1fr", gap: "4px 12px", margin: "8px 0 0", fontSize: 13 }}>
            {APPLICATION_LABELS.filter(([k]) => r.application[k] != null && r.application[k] !== "").map(([k, en, h]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt style={{ color: "#475569", fontWeight: 700 }}>{hi ? h : en}</dt>
                <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{String(r.application[k])}</dd>
              </div>
            ))}
            {typeof r.application.latitude === "number" && typeof r.application.longitude === "number" && (
              <div style={{ display: "contents" }}>
                <dt style={{ color: "#475569", fontWeight: 700 }}>GPS</dt>
                <dd style={{ margin: 0 }}>
                  <a href={`https://www.google.com/maps?q=${r.application.latitude},${r.application.longitude}`} target="_blank" rel="noreferrer">
                    {(r.application.latitude as number).toFixed(5)}, {(r.application.longitude as number).toFixed(5)}
                  </a>
                </dd>
              </div>
            )}
          </dl>
          {r.documentCount > 0 && (
            <div className={styles.actions}>
              {Array.from({ length: r.documentCount }, (_, i) => (
                <a key={i} className={styles.ghost} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} href={`/api/partner-applications/${encodeURIComponent(r.id)}/files/${i}`}>
                  {hi ? "दस्तावेज़" : "Document"} {i + 1}
                </a>
              ))}
            </div>
          )}
        </details>
      ))}
    </section>
  );
}

function RateCell({ incl, basic, mode, language }: { incl: number | null; basic: number | null; mode: "GST_INCLUSIVE" | "GST_EXCLUSIVE"; language: Lang }) {
  const hi = language === "HI";
  if (basic == null) return <>—</>;
  if (incl == null)
    return (
      <>
        {inr(basic)}
        <div className={styles.muted}>{hi ? "बेसिक · GST % सेट नहीं" : "basic · GST % not set"}</div>
      </>
    );
  return (
    <>
      <strong>{inr(incl)}</strong>
      {mode === "GST_EXCLUSIVE" && <div className={styles.muted}>{hi ? "बेसिक" : "basic"} {inr(basic)}</div>}
    </>
  );
}
