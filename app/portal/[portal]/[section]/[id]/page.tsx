import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/database/client";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import {
  AccessDenied,
  PageHeading,
} from "@/components/seera/foundation/States";
import {
  CreateUserForm,
  UserGovernanceForm,
} from "@/components/seera/foundation/FoundationActions";
import styles from "@/components/seera/foundation/Workspace.module.css";
import { surfaceItem } from "@/lib/foundation/product-surface";
import { OperationalDetail } from "@/components/seera/product/OperationalDetail";
export default async function WorkspaceDetail({
  params,
}: {
  params: Promise<{ portal: string; section: string; id: string }>;
}) {
  const { portal, section, id } = await params,
    { user: actor } = await resolveRequestIdentity(),
    permissions = await effectivePermissions(prisma, actor.id),
    language = actor.preferredLanguage,
    home = `/portal/${portal}`;
  const allowed = (p: string) =>
    permissions.has(p) || permissions.has("system:super_admin");
  if (section === "users") {
    if (!allowed("user:view")) return <AccessDenied home={home} />;
    const roles = await prisma.role.findMany({
      where: { status: "ACTIVE" },
      select: { code: true, name: true },
      orderBy: { name: "asc" },
    });
    if (id === "new") {
      if (!allowed("user:create")) return <AccessDenied home={home} />;
      return (
        <>
          <PageHeading
            title={language === "HI" ? "नया उपयोगकर्ता" : "Create user"}
            description={
              language === "HI"
                ? "सुरक्षित पहचान बनाएँ और प्रारंभिक भूमिका असाइन करें।"
                : "Create a secure identity and assign its initial governed role."
            }
          />
          <section className={styles.card}>
            <CreateUserForm portal={portal} roles={roles} language={language} />
          </section>
        </>
      );
    }
    const target = await prisma.user.findUnique({
      where: { id },
      include: {
        roleAssignments: {
          where: { status: "ACTIVE" },
          include: { role: true },
        },
        sessions: {
          where: { revokedAt: null, expires: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        },
        auditEvents: { orderBy: { occurredAt: "desc" }, take: 12 },
        offlineOperations: { select: { id: true }, take: 1 },
      },
    });
    if (!target) notFound();
    const party = await prisma.seeraPartyUser.findMany({
        where: { userId: id, active: true },
        include: { partner: true },
      }),
      scope = await prisma.seeraAssignment.findMany({
        where: {
          subjectId: id,
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
        },
      });
    return (
      <>
        <PageHeading
          title={target.name ?? target.email}
          description={
            language === "HI"
              ? "उपयोगकर्ता पहचान, भूमिका, दायरा, सत्र और ऑडिट विवरण।"
              : "User identity, roles, scope, sessions and audit detail."
          }
          action={
            <Link
              className={`${styles.button} ${styles.secondary}`}
              href={`${home}/users`}
            >
              {language === "HI" ? "उपयोगकर्ताओं पर वापस" : "Back to users"}
            </Link>
          }
        />
        <div className={styles.split}>
          <UserGovernanceForm
            userId={id}
            user={{
              name: target.name ?? "",
              email: target.email,
              status: target.status,
            }}
            roles={roles}
            assignedRoleCodes={target.roleAssignments.map((a) => a.role.code)}
            canManage={allowed("user:update")}
            language={language}
          />
          <aside className={styles.stack}>
            <section className={styles.card}>
              <h3>{language === "HI" ? "पहुँच दायरा" : "Access scope"}</h3>
              <p>
                <strong>{language === "HI" ? "भागीदार" : "Partners"}:</strong>{" "}
                {party
                  .map((p) => `${p.partner.legalName} (${p.accessRole})`)
                  .join(", ") || "—"}
              </p>
              <p>
                <strong>
                  {language === "HI"
                    ? "क्षेत्र/असाइनमेंट"
                    : "Territories/assignments"}
                  :
                </strong>{" "}
                {scope.map((s) => s.targetId).join(", ") || "—"}
              </p>
            </section>
            <section className={styles.card}>
              <h3>{language === "HI" ? "सक्रिय सत्र" : "Active sessions"}</h3>
              {target.sessions.length ? (
                target.sessions.map((s) => (
                  <p key={s.id}>
                    {s.createdAt.toLocaleString()}
                    <br />
                    <small>{s.expires.toLocaleString()}</small>
                  </p>
                ))
              ) : (
                <p>—</p>
              )}
            </section>
            <section className={styles.card}>
              <h3>{language === "HI" ? "हाल का ऑडिट" : "Recent audit"}</h3>
              {target.auditEvents.map((e) => (
                <p key={e.id}>
                  <strong>{e.action}</strong>
                  <br />
                  <small>{e.occurredAt.toLocaleString()}</small>
                </p>
              ))}
            </section>
          </aside>
        </div>
      </>
    );
  }
  if (section === "roles") {
    if (!allowed("role:view")) return <AccessDenied home={home} />;
    const role = await prisma.role.findUnique({
      where: { code: id },
      include: {
        permissions: { include: { permission: true } },
        assignments: {
          where: { status: "ACTIVE" },
          include: { user: true },
          take: 50,
        },
      },
    });
    if (!role) notFound();
    const groups = Object.groupBy(
      role.permissions.map((x) => x.permission),
      (p) => p.resource,
    );
    return (
      <>
        <PageHeading
          title={role.name}
          description={
            role.isSystem
              ? language === "HI"
                ? "संरक्षित सिस्टम भूमिका — अनुमति संपादन बंद है।"
                : "Protected system role — permission editing is disabled."
              : language === "HI"
                ? "स्थिर व्यावसायिक भूमिका और प्रभावी अनुमतियाँ।"
                : "Frozen business role and effective permissions."
          }
          action={
            <Link
              className={`${styles.button} ${styles.secondary}`}
              href={`${home}/roles`}
            >
              {language === "HI" ? "भूमिकाओं पर वापस" : "Back to roles"}
            </Link>
          }
        />
        <div className={styles.split}>
          <div className={styles.stack}>
            {Object.entries(groups).map(([group, items]) => (
              <section className={styles.card} key={group}>
                <h2>{group}</h2>
                <div className={styles.permissions}>
                  {items?.map((p) => (
                    <span key={p.id}>{p.code}</span>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <aside className={styles.card}>
            <h2>
              {language === "HI" ? "असाइन किए उपयोगकर्ता" : "Assigned users"}
            </h2>
            {role.assignments.length ? (
              role.assignments.map((a) => (
                <p key={a.id}>
                  <Link href={`${home}/users/${a.userId}`}>
                    {a.user.name ?? a.user.email}
                  </Link>
                </p>
              ))
            ) : (
              <p>—</p>
            )}
          </aside>
        </div>
      </>
    );
  }
  if (section === "audit") {
    if (!allowed("audit:view")) return <AccessDenied home={home} />;
    const event = await prisma.auditLog.findUnique({
      where: { id },
      include: { actor: { select: { name: true, email: true } } },
    });
    if (!event) notFound();
    return (
      <>
        <PageHeading
          title={language === "HI" ? "ऑडिट घटना विवरण" : "Audit event detail"}
          description={
            language === "HI"
              ? "अपरिवर्तनीय नियंत्रित गतिविधि संदर्भ।"
              : "Immutable governed activity context."
          }
          action={
            <Link
              className={`${styles.button} ${styles.secondary}`}
              href={`${home}/audit`}
            >
              {language === "HI" ? "ऑडिट पर वापस" : "Back to audit"}
            </Link>
          }
        />
        <section className={styles.card}>
          <dl>
            <dt>{language === "HI" ? "कार्रवाई" : "Action"}</dt>
            <dd>{event.action}</dd>
            <dt>{language === "HI" ? "अभिनेता" : "Actor"}</dt>
            <dd>{event.actor?.name ?? event.actor?.email ?? "System"}</dd>
            <dt>{language === "HI" ? "इकाई" : "Entity"}</dt>
            <dd>
              {event.entityType} {event.entityId ?? ""}
            </dd>
            <dt>{language === "HI" ? "परिणाम" : "Outcome"}</dt>
            <dd>
              <span className={styles.badge}>{event.outcome}</span>
            </dd>
            <dt>{language === "HI" ? "समय" : "Time"}</dt>
            <dd>
              {event.occurredAt.toLocaleString(
                language === "HI" ? "hi-IN" : "en-IN",
              )}
            </dd>
            <dt>{language === "HI" ? "कारण" : "Reason"}</dt>
            <dd>{event.reason ?? "—"}</dd>
          </dl>
          {event.details && (
            <p className={styles.notice}>
              {language === "HI"
                ? "संरचित तकनीकी संदर्भ सुरक्षित रूप से दर्ज है।"
                : "Structured technical context is retained securely."}
            </p>
          )}
        </section>
      </>
    );
  }
  const product = surfaceItem(portal, section, permissions);
  if (product)
    return (
      <OperationalDetail
        db={prisma}
        userId={actor.id}
        portal={portal}
        item={product}
        id={id}
        language={language}
        canManageLifecycle={allowed("partner_lifecycle:manage")}
        canExecuteDelivery={allowed("distributor_delivery:execute") || allowed("distributor_orders:fulfil")}
      />
    );
  notFound();
}
