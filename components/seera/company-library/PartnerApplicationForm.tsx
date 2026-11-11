"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LocationAutofill } from "@/components/seera/product/LocationAutofill";
import { captureGps } from "@/components/seera/product/gps";
import styles from "./CompanyLibrary.module.css";

type Lang = "EN" | "HI";
type AppType = "SUPER_STOCKIST" | "DISTRIBUTOR" | "DEPOT";

const TYPES: [AppType, string, string][] = [
  ["DISTRIBUTOR", "Distributor", "वितरक"],
  ["SUPER_STOCKIST", "Super Stockist", "सुपर स्टॉकिस्ट"],
  ["DEPOT", "Depot (C&F)", "डिपो (C&F)"],
];

function Field({ label, name, required, type = "text", inputMode, placeholder, maxLength, area }: {
  label: string; name: string; required?: boolean; type?: string; inputMode?: "text" | "numeric" | "tel" | "email"; placeholder?: string; maxLength?: number; area?: boolean;
}) {
  return (
    <label>
      {label}{required ? " *" : ""}
      {area ? <textarea name={name} required={required} maxLength={maxLength} rows={2} placeholder={placeholder} />
        : <input name={name} type={type} required={required} inputMode={inputMode} placeholder={placeholder} maxLength={maxLength} />}
    </label>
  );
}

export function PartnerApplicationForm({ language, initialType }: { language: Lang; initialType: AppType }) {
  const hi = language === "HI";
  const t = (en: string, h: string) => (hi ? h : en);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<AppType>(initialType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (done)
    return (
      <div className={styles.upload}>
        <p className={styles.ok}>{t(`Application submitted for ${done}. It is now in Distributor search at stage "Evaluation".`, `${done} का आवेदन जमा हो गया। यह अब वितरक खोज में "Evaluation" चरण में है।`)}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => { setDone(null); setDuplicate(false); }}>{t("Fill another application", "दूसरा आवेदन भरें")}</button>
        </div>
      </div>
    );

  return (
    <form
      ref={formRef}
      className={styles.upload}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fd = new FormData(form);
        const data: Record<string, unknown> = { type };
        for (const [k, v] of fd.entries()) if (k !== "files" && typeof v === "string") data[k] = v;
        data.declarationAccepted = fd.get("declarationAccepted") === "on";
        if (duplicate) data.confirmDuplicate = fd.get("confirmDuplicate") === "on";
        delete data.confirmDuplicateBox;
        setBusy(true);
        setError(null);
        const gps = await captureGps();
        if (gps.point.latitude != null && gps.point.longitude != null) {
          data.latitude = gps.point.latitude;
          data.longitude = gps.point.longitude;
        }
        const body = new FormData();
        body.set("data", JSON.stringify(data));
        for (const f of fd.getAll("files")) if (f instanceof File && f.size) body.append("files", f);
        try {
          const res = await fetch("/api/partner-applications", { method: "POST", body });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
            if (err.error?.code === "SIMILAR_PROSPECT_EXISTS") setDuplicate(true);
            throw new Error(err.error?.message ?? t("Submit failed", "जमा नहीं हुआ"));
          }
          setDone(String(data.firmName));
          form.reset();
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        {t("Applying as", "आवेदन का प्रकार")} *
        <select value={type} onChange={(e) => setType(e.target.value as AppType)}>
          {TYPES.map(([v, en, h]) => <option key={v} value={v}>{hi ? h : en}</option>)}
        </select>
      </label>

      <h3>{t("A. Firm", "A. फर्म")}</h3>
      <Field label={t("Legal name of firm", "फर्म का कानूनी नाम")} name="firmName" required maxLength={160} />
      <Field label={t("Trade / shop name (if different)", "दुकान / ट्रेड नाम (अगर अलग हो)")} name="tradeName" maxLength={160} />
      <label>
        {t("Constitution", "फर्म का प्रकार")} *
        <select name="constitution" defaultValue="PROPRIETORSHIP">
          <option value="PROPRIETORSHIP">{t("Proprietorship", "प्रोप्राइटरशिप")}</option>
          <option value="PARTNERSHIP">{t("Partnership", "पार्टनरशिप")}</option>
          <option value="LLP">LLP</option>
          <option value="PRIVATE_LIMITED">Pvt. Ltd.</option>
          <option value="OTHER">{t("Other", "अन्य")}</option>
        </select>
      </label>
      <Field label={t("Year of establishment", "स्थापना वर्ष")} name="yearEstablished" inputMode="numeric" maxLength={4} />
      <label>
        {t("GST status", "GST स्थिति")} *
        <select name="gstStatus" defaultValue="REGULAR">
          <option value="REGULAR">{t("Regular", "रेगुलर")}</option>
          <option value="COMPOSITION">{t("Composition", "कंपोज़िशन")}</option>
          <option value="UNREGISTERED">{t("Unregistered", "अपंजीकृत")}</option>
        </select>
      </label>
      <Field label="GSTIN" name="gstin" maxLength={15} placeholder="09ABCDE1234F1Z5" />
      <Field label={t("Firm PAN", "फर्म PAN")} name="pan" maxLength={10} placeholder="ABCDE1234F" />

      <h3>{t("B. Address", "B. पता")}</h3>
      <LocationAutofill language={language} fields={{ address: "address", city: "city", district: "district", state: "state", pincode: "pincode" }} />
      <Field label={t("Business / godown address", "व्यवसाय / गोदाम का पता")} name="address" required area maxLength={400} />
      <Field label={t("Village / Town / City", "गाँव / कस्बा / शहर")} name="city" required maxLength={120} />
      <Field label={t("District", "ज़िला")} name="district" maxLength={120} />
      <Field label={t("State", "राज्य")} name="state" required maxLength={80} />
      <Field label={t("PIN code", "पिन कोड")} name="pincode" inputMode="numeric" maxLength={6} />

      <h3>{t("C. Owner", "C. मालिक")}</h3>
      <Field label={t("Proprietor / managing partner name", "मालिक / मैनेजिंग पार्टनर का नाम")} name="ownerName" required maxLength={120} />
      <Field label={t("Father's name", "पिता का नाम")} name="fatherName" maxLength={120} />
      <Field label={t("Mobile", "मोबाइल")} name="mobile" required inputMode="tel" maxLength={10} placeholder="9876543210" />
      <Field label={t("Alternate / WhatsApp mobile", "दूसरा / WhatsApp मोबाइल")} name="alternateMobile" inputMode="tel" maxLength={15} />
      <Field label={t("Email", "ईमेल")} name="email" type="email" inputMode="email" maxLength={160} />
      <Field label={t("Aadhaar — last 4 digits only", "आधार — सिर्फ़ आख़िरी 4 अंक")} name="aadhaarLast4" inputMode="numeric" maxLength={4} />

      <h3>{t("D. Business", "D. व्यवसाय")}</h3>
      <Field label={t("Years in business", "व्यवसाय में कितने साल")} name="yearsInBusiness" inputMode="numeric" maxLength={10} />
      <Field label={t("Last year turnover (₹)", "पिछले साल का टर्नओवर (₹)")} name="turnover" maxLength={40} />
      <Field label={t("Brands / companies handled", "कौन-कौन से ब्रांड / कंपनी")} name="brandsHandled" area maxLength={400} />
      <Field label={type === "SUPER_STOCKIST" ? t("Distributors serviced (number / towns)", "कितने वितरक (संख्या / कस्बे)") : type === "DEPOT" ? t("Parties that can be served from the depot", "डिपो से कौन-कौन सी पार्टी") : t("Outlets billed per month", "हर महीने कितने आउटलेट")} name="reach" maxLength={200} />
      <Field label={t("Godown (owned / rented, sq ft)", "गोदाम (अपना / किराए, वर्ग फुट)")} name="godown" maxLength={200} />
      <Field label={t("Vehicles", "गाड़ियाँ")} name="vehicles" maxLength={120} />
      <Field label={t("Staff (sales / delivery / accounts)", "स्टाफ़ (सेल्स / डिलीवरी / अकाउंट)")} name="staff" maxLength={120} />
      {type === "DEPOT" && <Field label={t("Depot details: height, loading, fire safety, insurance, C&F experience", "डिपो: ऊँचाई, लोडिंग, फ़ायर सेफ़्टी, बीमा, C&F अनुभव")} name="depotDetails" area maxLength={600} />}

      <h3>{t("E. Coverage & commercials", "E. क्षेत्र और व्यापार")}</h3>
      <Field label={t("Areas / districts applied for", "किन क्षेत्रों / ज़िलों के लिए")} name="areasApplied" required area maxLength={400} />
      {type === "DISTRIBUTOR" && <Field label={t("Mapped Super Stockist (name / code)", "किस सुपर स्टॉकिस्ट से जुड़ेंगे")} name="mappedSuperStockist" maxLength={160} />}
      <Field label={t("Opening order value (₹)", "पहला ऑर्डर (₹)")} name="openingOrderValue" maxLength={40} />
      <Field label={t("Expected monthly purchase (₹)", "अनुमानित मासिक ख़रीद (₹)")} name="monthlyPurchase" maxLength={80} />
      <Field label={t("Security deposit (₹ and mode)", "सिक्योरिटी डिपॉज़िट (₹ और तरीका)")} name="securityDeposit" maxLength={80} />

      <h3>{t("F. Bank (business account)", "F. बैंक (व्यापार खाता)")}</h3>
      <Field label={t("Bank & branch", "बैंक और शाखा")} name="bankName" maxLength={120} />
      <Field label={t("Account holder name", "खाताधारक का नाम")} name="accountHolder" maxLength={120} />
      <Field label={t("Account number", "खाता संख्या")} name="accountNumber" inputMode="numeric" maxLength={20} />
      <Field label="IFSC" name="ifsc" maxLength={11} />

      <h3>{t("G. References & documents", "G. रेफ़रेंस और दस्तावेज़")}</h3>
      <Field label={t("Two trade references (name, firm, mobile)", "दो रेफ़रेंस (नाम, फर्म, मोबाइल)")} name="references" area maxLength={400} />
      <label>
        {t("KYC photos / PDFs — PAN, GST, Aadhaar, cheque, godown photos (up to 6, 8 MB each)", "KYC फ़ोटो / PDF — PAN, GST, आधार, चेक, गोदाम फ़ोटो (6 तक, 8 MB तक)")}
        <input name="files" type="file" multiple accept="application/pdf,image/png,image/jpeg" />
      </label>
      <Field label={t("Remarks", "टिप्पणी")} name="remarks" area maxLength={600} />

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontWeight: 600 }}>
        <input name="declarationAccepted" type="checkbox" required style={{ width: 22, minHeight: 22, marginTop: 2 }} />
        <span>{t(
          "The applicant declares that this information is true, and agrees to buy only from the mapped supplier / Company, sell only in the allotted area at Company rates (never above MRP), pay only into the Company's / mapped supplier's account, and that appointment is final only after Company approval, agreement, security deposit and Seera App onboarding.",
          "आवेदक घोषणा करता है कि जानकारी सही है, और वह सिर्फ़ मैप्ड सप्लायर / कंपनी से ख़रीदेगा, तय क्षेत्र में कंपनी रेट पर बेचेगा (MRP से ज़्यादा नहीं), भुगतान सिर्फ़ कंपनी / सप्लायर के खाते में करेगा, और नियुक्ति कंपनी की मंज़ूरी, अनुबंध, डिपॉज़िट और Seera App ऑनबोर्डिंग के बाद ही पक्की होगी।",
        )}</span>
      </label>
      {duplicate && (
        <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 700 }}>
          <input name="confirmDuplicate" type="checkbox" style={{ width: 22, minHeight: 22 }} />
          {t("A similar prospect exists — tick to save this application anyway", "मिलता-जुलता प्रॉस्पेक्ट पहले से है — फिर भी सेव करने के लिए टिक करें")}
        </label>
      )}
      {error && <p className={styles.err}>{error}</p>}
      <div>
        <button className={styles.primary} disabled={busy}>{busy ? t("Submitting…", "जमा हो रहा है…") : t("Submit application", "आवेदन जमा करें")}</button>
      </div>
    </form>
  );
}
