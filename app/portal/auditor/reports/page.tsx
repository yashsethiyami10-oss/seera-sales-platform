import { prisma } from "@/lib/database/client";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { PageHeading } from "@/components/seera/foundation/States";
import styles from "@/components/seera/foundation/Workspace.module.css";

export default async function AuditorReports() {
  const { user } = await resolveRequestIdentity(), hi = user.preferredLanguage === "HI";
  const users = await prisma.user.count();
  const activeUsers = await prisma.user.count({ where: { status: "ACTIVE" } });
  const audits = await prisma.auditLog.count();
  const deniedEvents = await prisma.auditLog.count({ where: { outcome: "DENIED" } });
  const cards = [[hi ? "कुल उपयोगकर्ता" : "Total users", users], [hi ? "सक्रिय उपयोगकर्ता" : "Active users", activeUsers], [hi ? "ऑडिट घटनाएँ" : "Audit events", audits], [hi ? "अस्वीकृत घटनाएँ" : "Denied events", deniedEvents]];
  return <><PageHeading title={hi ? "केवल-पठन रिपोर्ट" : "Read-only reports"} description={hi ? "नियंत्रित पहचान और सुरक्षा सारांश।" : "Governed identity and security summaries."} /><div className={styles.grid}>{cards.map(([label, value]) => <article className={styles.card} key={String(label)}><small>{label}</small><strong style={{ display: "block", fontSize: 32, marginTop: 10 }}>{value}</strong></article>)}</div><p className={styles.notice}>{hi ? "यह दृश्य केवल पढ़ने के लिए है। कोई परिवर्तन नियंत्रण उपलब्ध नहीं है।" : "This view is read-only. No mutation controls are available."}</p></>;
}
