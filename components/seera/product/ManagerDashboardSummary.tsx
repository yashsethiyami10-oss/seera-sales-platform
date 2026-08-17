import Link from "next/link";
import styles from "./ProductSurface.module.css";
import journeyStyles from "./FieldJourney.module.css";
import { AssignDistributorForm } from "./AssignDistributorForm";

type Summary = {
  today: {
    active: number;
    notStarted: number;
    late: number;
    ended: number;
    planned: number;
    visited: number;
    productive: number;
    orders: number;
    newCustomers: number;
  };
  team: { bookedValue: number; eligibleDeliveredValue: number; orderCount: number };
  managerOwn: { bookedValue: number; eligibleDeliveredValue: number; orderCount: number };
  territory: { bookedValue: number; eligibleDeliveredValue: number; orderCount: number };
  target: { value: number; delivered: number; remaining: number; achievementPct: number | null; requiredDailyRunRate: number };
  followUps: { open: number; overdue: number };
  prospectsDue: number;
  exceptions: { offlineSyncIssues: number };
  teamSize: number;
  teamToday: {
    employeeId: string;
    employeeName: string;
    dayStatus: "NOT_STARTED" | "ACTIVE" | "ENDED";
    workingType: string | null;
    workingDistributorId: string | null;
    workingDistributorLabel: string | null;
  }[];
  unassignedOrders: {
    id: string;
    orderNumber: string;
    total: number;
    retailerName: string;
    createdAt: string | Date;
    routingReason?: "MULTIPLE_DISTRIBUTOR_CANDIDATES" | "NO_DISTRIBUTOR_MAPPING";
    candidateDistributors?: { id: string; name: string }[];
  }[];
};

const money = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function ManagerDashboardSummary({
  language,
  summary,
  portal,
  mappedDistributors = [],
}: {
  language: "EN" | "HI";
  summary: Summary;
  portal: string;
  mappedDistributors?: { value: string; label: string }[];
}) {
  const hi = language === "HI";
  return (
    <section className={styles.panel} style={{ marginBottom: 18 }}>
      <div>
        <small>{hi ? "टीम कमांड सेंटर" : "TEAM COMMAND CENTER"}</small>
        <h2>{hi ? "आज की स्थिति" : "Today's status"}</h2>
      </div>
      <dl className={journeyStyles.statGrid} style={{ gridColumn: "1/-1" }}>
        <div><dt>{hi ? "सक्रिय" : "Active"}</dt><dd>{summary.today.active}</dd></div>
        <div><dt>{hi ? "शुरू नहीं हुआ" : "Not started"}</dt><dd>{summary.today.notStarted}</dd></div>
        <div><dt>{hi ? "देर से" : "Late"}</dt><dd>{summary.today.late}</dd></div>
        <div><dt>{hi ? "समाप्त" : "Ended"}</dt><dd>{summary.today.ended}</dd></div>
        <div><dt>{hi ? "योजनाबद्ध" : "Planned"}</dt><dd>{summary.today.planned}</dd></div>
        <div><dt>{hi ? "देखे गए" : "Visited"}</dt><dd>{summary.today.visited}</dd></div>
        <div><dt>{hi ? "उत्पादक" : "Productive"}</dt><dd>{summary.today.productive}</dd></div>
        <div><dt>{hi ? "ऑर्डर" : "Orders"}</dt><dd>{summary.today.orders}</dd></div>
        <div><dt>{hi ? "नए ग्राहक" : "New customers"}</dt><dd>{summary.today.newCustomers}</dd></div>
      </dl>
      {summary.teamToday.length > 0 && (
        <>
          <div>
            <small>{hi ? "टीम — आज" : "TEAM — TODAY"}</small>
            <h2>{hi ? "कार्यरत वितरक" : "Working Distributor"}</h2>
          </div>
          <ul style={{ gridColumn: "1/-1", display: "grid", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
            {summary.teamToday.map((e) => (
              <li key={e.employeeId} style={{ padding: 8, border: "1px solid #ead8d2", borderRadius: 9 }}>
                <strong>{e.employeeName}</strong> ·{" "}
                {e.dayStatus === "ACTIVE" ? (hi ? "सक्रिय" : "Active") : e.dayStatus === "ENDED" ? (hi ? "समाप्त" : "Ended") : hi ? "शुरू नहीं हुआ" : "Not started"}
                {e.workingDistributorLabel && (
                  <>
                    {" "}
                    · {hi ? "वितरक" : "Distributor"}: {e.workingDistributorLabel}
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <div>
        <small>{hi ? "मासिक बिक्री (अलग)" : "MONTH-TO-DATE SALES (SEPARATED)"}</small>
      </div>
      <dl className={journeyStyles.statGrid} style={{ gridColumn: "1/-1" }}>
        <div><dt>{hi ? "टीम (एग्जीक्यूटिव)" : "Team (Executives)"}</dt><dd>{money(summary.team.eligibleDeliveredValue)}</dd></div>
        <div><dt>{hi ? "मैनेजर स्वयं" : "Manager own"}</dt><dd>{money(summary.managerOwn.eligibleDeliveredValue)}</dd></div>
        <div><dt>{hi ? "कुल क्षेत्र" : "Territory total"}</dt><dd>{money(summary.territory.eligibleDeliveredValue)}</dd></div>
        <div><dt>{hi ? "लक्ष्य" : "Target"}</dt><dd>{money(summary.target.value)}</dd></div>
        <div><dt>{hi ? "शेष" : "Remaining"}</dt><dd>{money(summary.target.remaining)}</dd></div>
        <div><dt>{hi ? "उपलब्धि %" : "Achievement %"}</dt><dd>{summary.target.achievementPct == null ? "—" : `${summary.target.achievementPct}%`}</dd></div>
        <div><dt>{hi ? "आवश्यक दैनिक दर" : "Required daily run rate"}</dt><dd>{money(summary.target.requiredDailyRunRate)}</dd></div>
      </dl>
      <div className={journeyStyles.quickActions} style={{ gridColumn: "1/-1" }}>
        <Link href={`/portal/${portal}/team-review`}>{hi ? "फॉलो-अप" : "Follow-ups"}: {summary.followUps.open} ({summary.followUps.overdue} {hi ? "बकाया" : "overdue"})</Link>
        <Link href={`/portal/${portal}/distributor-search`}>{hi ? "संभावना देय" : "Prospects due"}: {summary.prospectsDue}</Link>
        <Link href={`/portal/${portal}/my-day`}>{hi ? "सिंक अपवाद" : "Sync exceptions"}: {summary.exceptions.offlineSyncIssues}</Link>
      </div>
      {summary.teamSize === 0 && (
        // Dashboard reminder fix (cross-portal re-audit): a Manager with no assigned team
        // previously found out only by clicking into Beat Planner/Distributor Oversight/Retailing
        // and seeing each one silently empty. Ask Founder/Admin to fix it — a Manager themself
        // cannot create their own team assignment (see FieldForceAssignmentPanel).
        <p style={{ gridColumn: "1/-1", padding: 10, border: "1px solid #ead8d2", borderRadius: 9, background: "#fff8f0" }}>
          {hi
            ? "आपकी टीम में अभी तक कोई एग्जीक्यूटिव असाइन नहीं है — बीट प्लानर, वितरक निरीक्षण और रिटेलिंग खाली दिखेंगे। Founder/Admin से \"Field force\" में असाइनमेंट के लिए कहें।"
            : "No Executive is assigned to your team yet — Beat Planner, Distributor Oversight and Retailing will show empty until then. Ask Founder/Admin to assign one under \"Field force\"."}
        </p>
      )}
      {summary.unassignedOrders.length > 0 && (
        <>
          <div>
            <small>{hi ? "वितरक असाइनमेंट लंबित" : "AWAITING DISTRIBUTOR ASSIGNMENT"}</small>
            <h2>{hi ? "बिना वितरक के ऑर्डर" : "Orders with no Distributor yet"}</h2>
          </div>
          <ul style={{ gridColumn: "1/-1", display: "grid", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
            {summary.unassignedOrders.map((o) => (
              <li key={o.id} style={{ padding: 10, border: "1px solid #ead8d2", borderRadius: 9 }}>
                <strong>{o.orderNumber}</strong> · {o.retailerName} · {money(o.total)} ·{" "}
                {new Date(o.createdAt).toLocaleDateString(hi ? "hi-IN" : "en-IN")}
                <br />
                <small>
                  {o.routingReason === "MULTIPLE_DISTRIBUTOR_CANDIDATES"
                    ? hi
                      ? `कई वितरक उपलब्ध — असाइनमेंट आवश्यक (${(o.candidateDistributors ?? []).map((c) => c.name).join(", ")})`
                      : `Multiple Distributors match this territory — assignment required (${(o.candidateDistributors ?? []).map((c) => c.name).join(", ")})`
                    : hi
                      ? "इस क्षेत्र के लिए कोई सक्रिय वितरक मैप नहीं है।"
                      : "No active Distributor is mapped to this territory."}
                </small>
                {mappedDistributors.length > 0 && (
                  <AssignDistributorForm language={language} orderId={o.id} distributors={mappedDistributors} />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
