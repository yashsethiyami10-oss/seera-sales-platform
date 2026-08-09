import { prisma } from "@/lib/database/client";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { PageHeading } from "@/components/seera/foundation/States";
import { ProductHome } from "@/components/seera/product/ProductHome";
import styles from "@/components/seera/foundation/Workspace.module.css";

export default async function AuditorHome() {
  const { user } = await resolveRequestIdentity();
  const hi = user.preferredLanguage === "HI";
  const permissions = await effectivePermissions(prisma, user.id);
  // Sequential reads preserve connection headroom in the shared TEST pool.
  const events = await prisma.auditLog.count();
  const denied = await prisma.auditLog.count({ where: { outcome: "DENIED" } });
  const users = await prisma.user.count();
  return (
    <>
      <PageHeading
        title={hi ? "ऑडिटर कार्यक्षेत्र" : "Auditor workspace"}
        description={
          hi
            ? "सुरक्षा, पहुँच और नियंत्रित गतिविधि के लिए स्वतंत्र केवल-पठन दृश्य।"
            : "Independent read-only visibility into security, access and governed activity."
        }
      />
      <p className={styles.notice}>
        {hi
          ? "केवल पढ़ने के लिए: इस कार्यक्षेत्र में निर्माण, संपादन, हटाने या अनुमोदन नियंत्रण नहीं हैं।"
          : "Read only: this workspace contains no create, edit, delete or approval controls."}
      </p>
      <div className={styles.grid}>
        {[
          [hi ? "ऑडिट घटनाएँ" : "Audit events", events],
          [hi ? "अस्वीकृत गतिविधि" : "Denied activity", denied],
          [hi ? "नियंत्रित पहचान" : "Governed identities", users],
        ].map(([label, value]) => (
          <article className={styles.card} key={String(label)}>
            <small>{label}</small>
            <strong style={{ fontSize: 34, display: "block", marginTop: 8 }}>
              {value}
            </strong>
          </article>
        ))}
      </div>
      <ProductHome
        portal="auditor"
        permissions={permissions}
        language={user.preferredLanguage}
      />
    </>
  );
}
