import Link from "next/link";
import type { UiLanguage } from "@prisma/client";
import { surfaceItems, surfaceLabel } from "@/lib/foundation/product-surface";
import styles from "./ProductHome.module.css";

export function ProductHome({
  portal,
  permissions,
  language,
}: {
  portal: string;
  permissions: Set<string>;
  language: UiLanguage;
}) {
  const hi = language === "HI",
    items = surfaceItems(portal, permissions).filter(
      (x) =>
        ![
          "profile",
          "notifications",
          "settings",
          "roles",
          "users",
          "system",
        ].includes(x.slug),
    );
  return (
    <section className={styles.work}>
      <div>
        <p className={styles.eyebrow}>{hi ? "त्वरित पहुँच" : "QUICK ACCESS"}</p>
        <h2>{hi ? "आपका संचालन कार्यक्षेत्र" : "Your operating workspace"}</h2>
        <p>
          {hi
            ? "व्यावसायिक नाम, स्थिति और दायरे के साथ लाइव रिकॉर्ड खोलें।"
            : "Open live records with business names, statuses and your authorized scope."}
        </p>
      </div>
      <div className={styles.grid}>
        {items.slice(0, 15).map((x) => (
          <Link key={x.slug} href={`/portal/${portal}/${x.slug}`}>
            <b aria-hidden>{x.icon}</b>
            <span>
              <strong>{surfaceLabel(x, language)}</strong>
              <small>
                {hi ? "अधिकृत कार्यक्षेत्र खोलें" : "Open authorized workspace"}
              </small>
            </span>
            <i aria-hidden>→</i>
          </Link>
        ))}
      </div>
    </section>
  );
}
