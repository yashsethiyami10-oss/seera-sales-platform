import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/database/client";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import { phase1Copy } from "@/lib/foundation/phase1-ui";
import {
  AccessDenied,
  EmptyState,
  PageHeading,
} from "@/components/seera/foundation/States";
import {
  NotificationActions,
  SettingsForm,
} from "@/components/seera/foundation/FoundationActions";
import { surfaceItem } from "@/lib/foundation/product-surface";
import { OperationalWorkspace } from "@/components/seera/product/OperationalWorkspace";
import { ChangePasswordActions } from "@/components/seera/product/ChangePasswordActions";
import styles from "@/components/seera/foundation/Workspace.module.css";
const valid = new Set([
  "users",
  "roles",
  "settings",
  "audit",
  "reports",
  "system",
  "profile",
  "notifications",
]);
export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ portal: string; section: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { portal, section } = await params;
  const { user, session } = await resolveRequestIdentity(),
    permissions = await effectivePermissions(prisma, user.id),
    language = user.preferredLanguage,
    t = phase1Copy(language),
    query = await searchParams,
    home = `/portal/${portal}`;
  const product = surfaceItem(portal, section, permissions);
  if (!valid.has(section) && !product) notFound();
  const denied = (permission: string) =>
    !permissions.has(permission) && !permissions.has("system:super_admin");
  if (section === "users") {
    if (denied("user:view")) return <AccessDenied home={home} />;
    const search = (query.q ?? "").trim(),
      status = query.status;
    const users = await prisma.user.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(status && status !== "ALL" ? { status: status as never } : {}),
      },
      include: {
        roleAssignments: {
          where: { status: "ACTIVE" },
          include: { role: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return (
      <>
        <PageHeading
          title={
            language === "HI" ? "उपयोगकर्ता प्रशासन" : "Users administration"
          }
          description={
            language === "HI"
              ? "पहचान, भूमिका, स्थिति और पहुँच का नियंत्रित प्रबंधन।"
              : "Governed identity, role, status and access management."
          }
          action={
            permissions.has("user:create") ||
            permissions.has("system:super_admin") ? (
              <Link className={styles.button} href={`${home}/users/new`}>
                {t.create}
              </Link>
            ) : undefined
          }
        />
        <form className={styles.filters} method="get">
          <input
            name="q"
            defaultValue={search}
            placeholder={
              language === "HI" ? "नाम या ईमेल खोजें" : "Search name or email"
            }
          />
          <select name="status" defaultValue={status ?? "ALL"}>
            <option value="ALL">
              {language === "HI" ? "सभी स्थितियाँ" : "All statuses"}
            </option>
            {["ACTIVE", "INACTIVE", "SUSPENDED", "DISABLED"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <button className={`${styles.button} ${styles.secondary}`}>
            {t.filter}
          </button>
        </form>
        {users.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{language === "HI" ? "उपयोगकर्ता" : "User"}</th>
                  <th>{t.role}</th>
                  <th>{t.status}</th>
                  <th>{language === "HI" ? "दायरा" : "Scope"}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name ?? "—"}</strong>
                      <br />
                      <small>{item.email}</small>
                    </td>
                    <td>
                      {item.roleAssignments
                        .map((a) => a.role.name)
                        .join(", ") || "—"}
                    </td>
                    <td>
                      <span className={styles.badge}>{item.status}</span>
                    </td>
                    <td>
                      {item.roleAssignments.some(
                        (a) =>
                          a.role.code.includes("DISTRIBUTOR") ||
                          a.role.code.includes("STOCKIST"),
                      )
                        ? language === "HI"
                          ? "भागीदार-आधारित"
                          : "Partner scoped"
                        : language === "HI"
                          ? "संगठन-आधारित"
                          : "Organization scoped"}
                    </td>
                    <td>
                      <Link href={`${home}/users/${item.id}`}>
                        {language === "HI" ? "विवरण खोलें" : "Open detail"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={t.empty}
            description={
              language === "HI"
                ? "खोज या स्थिति फ़िल्टर बदलें।"
                : "Change the search or status filter."
            }
          />
        )}
      </>
    );
  }
  if (section === "roles") {
    if (denied("role:view")) return <AccessDenied home={home} />;
    const roles = await prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: { name: "asc" },
    });
    return (
      <>
        <PageHeading
          title={
            language === "HI" ? "भूमिकाएँ और अनुमतियाँ" : "Roles & permissions"
          }
          description={
            language === "HI"
              ? "स्थिर आरबीएसी कैटलॉग और प्रभावी अनुमति श्रेणियाँ।"
              : "Frozen RBAC catalogue and effective permission categories."
          }
        />
        <div className={styles.grid}>
          {roles.map((role) => (
            <Link
              key={role.id}
              href={`${home}/roles/${role.code}`}
              className={styles.card}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <span className={styles.badge}>{role.status}</span>
              <h2>{role.name}</h2>
              <p>
                {role.permissions.length}{" "}
                {language === "HI" ? "अनुमतियाँ" : "permissions"} ·{" "}
                {role._count.assignments}{" "}
                {language === "HI" ? "असाइनमेंट" : "assignments"}
              </p>
              <small>
                {role.isSystem
                  ? language === "HI"
                    ? "संरक्षित सिस्टम भूमिका"
                    : "Protected system role"
                  : language === "HI"
                    ? "नियंत्रित व्यावसायिक भूमिका"
                    : "Governed business role"}
              </small>
            </Link>
          ))}
        </div>
      </>
    );
  }
  if (section === "settings") {
    if (denied("settings:view")) return <AccessDenied home={home} />;
    const [flags, settings] = await Promise.all([
      prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
      prisma.appSetting.findMany({
        where: { active: true },
        orderBy: { key: "asc" },
      }),
    ]);
    return (
      <>
        <PageHeading
          title={
            language === "HI"
              ? "सेटिंग्स और सुविधा नियंत्रण"
              : "Settings & feature controls"
          }
          description={
            language === "HI"
              ? "संगठन प्राथमिकताओं और नियंत्रित पोर्टल उपलब्धता का सुरक्षित दृश्य।"
              : "Safe organization preferences and governed portal availability."
          }
        />
        <SettingsForm
          flags={flags.map((x) => ({
            key: x.key,
            enabled: x.enabled,
            description: x.description,
          }))}
          settings={settings.map((x) => ({
            key: x.key,
            value: x.value,
            version: x.version,
          }))}
          canManage={
            permissions.has("settings:manage") ||
            permissions.has("system:super_admin")
          }
          language={language}
        />
      </>
    );
  }
  if (section === "audit") {
    if (denied("audit:view")) return <AccessDenied home={home} />;
    const search = (query.q ?? "").trim(),
      outcome = query.outcome;
    const events = await prisma.auditLog.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { action: { contains: search, mode: "insensitive" } },
                { entityType: { contains: search, mode: "insensitive" } },
                { reason: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(outcome && outcome !== "ALL" ? { outcome: outcome as never } : {}),
      },
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { occurredAt: "desc" },
      take: 100,
    });
    return (
      <>
        <PageHeading
          title={language === "HI" ? "ऑडिट कार्यक्षेत्र" : "Audit workspace"}
          description={
            portal === "auditor"
              ? t.readOnly
              : language === "HI"
                ? "महत्वपूर्ण सुरक्षा और व्यावसायिक गतिविधि का नियंत्रित रिकॉर्ड।"
                : "Governed record of significant security and business activity."
          }
        />
        <form className={styles.filters} method="get">
          <input
            name="q"
            defaultValue={search}
            placeholder={
              language === "HI"
                ? "कार्रवाई, इकाई या कारण खोजें"
                : "Search action, entity or reason"
            }
          />
          <select name="outcome" defaultValue={outcome ?? "ALL"}>
            <option value="ALL">
              {language === "HI" ? "सभी परिणाम" : "All outcomes"}
            </option>
            {["SUCCESS", "DENIED", "FAILURE"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <button className={`${styles.button} ${styles.secondary}`}>
            {t.filter}
          </button>
        </form>
        {events.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{language === "HI" ? "समय" : "Time"}</th>
                  <th>{language === "HI" ? "अभिनेता" : "Actor"}</th>
                  <th>{language === "HI" ? "कार्रवाई" : "Action"}</th>
                  <th>{language === "HI" ? "इकाई" : "Entity"}</th>
                  <th>{language === "HI" ? "परिणाम" : "Outcome"}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      {event.occurredAt.toLocaleString(
                        language === "HI" ? "hi-IN" : "en-IN",
                      )}
                    </td>
                    <td>
                      {event.actor?.name ?? event.actor?.email ?? "System"}
                    </td>
                    <td>{event.action}</td>
                    <td>{event.entityType}</td>
                    <td>
                      <span className={styles.badge}>{event.outcome}</span>
                    </td>
                    <td>
                      <Link href={`${home}/audit/${event.id}`}>
                        {language === "HI" ? "विवरण" : "Detail"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={t.empty}
            description={
              language === "HI"
                ? "कोई ऑडिट घटना इस फ़िल्टर से मेल नहीं खाती।"
                : "No audit event matches this filter."
            }
          />
        )}
      </>
    );
  }
  if (section === "reports" && portal === "auditor") {
    if (denied("audit:view")) return <AccessDenied home={home} />;
    const [users, activeUsers, audits, deniedEvents] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { outcome: "DENIED" } }),
    ]);
    return (
      <>
        <PageHeading
          title={language === "HI" ? "केवल-पठन रिपोर्ट" : "Read-only reports"}
          description={t.readOnly}
        />
        <div className={styles.grid}>
          {[
            [language === "HI" ? "कुल उपयोगकर्ता" : "Total users", users],
            [
              language === "HI" ? "सक्रिय उपयोगकर्ता" : "Active users",
              activeUsers,
            ],
            [language === "HI" ? "ऑडिट घटनाएँ" : "Audit events", audits],
            [
              language === "HI" ? "अस्वीकृत घटनाएँ" : "Denied events",
              deniedEvents,
            ],
          ].map(([label, value]) => (
            <article className={styles.card} key={String(label)}>
              <small>{label}</small>
              <strong style={{ display: "block", fontSize: 32, marginTop: 10 }}>
                {value}
              </strong>
            </article>
          ))}
        </div>
        <p className={styles.notice}>
          {language === "HI"
            ? "यह दृश्य केवल पढ़ने के लिए है। कोई परिवर्तन नियंत्रण उपलब्ध नहीं है।"
            : "This view is read-only. No mutation controls are available."}
        </p>
      </>
    );
  }
  if (section === "system") {
    if (!permissions.has("system:super_admin"))
      return (
        <AccessDenied
          home={home}
          title={
            language === "HI"
              ? "संस्थापक प्राधिकरण आवश्यक"
              : "Founder authority required"
          }
        />
      );
    return (
      <>
        <PageHeading
          title={language === "HI" ? "सिस्टम प्राधिकरण" : "System authority"}
          description={
            language === "HI"
              ? "संरक्षित संस्थापक नियंत्रण सीमा।"
              : "Protected Founder governance boundary."
          }
        />
        <div className={styles.grid}>
          <article className={styles.card}>
            <h2>
              {language === "HI"
                ? "अंतिम संस्थापक सुरक्षा"
                : "Last-Founder protection"}
            </h2>
            <p>
              {language === "HI"
                ? "सिस्टम अंतिम सक्रिय संस्थापक भूमिका को हटाने से रोकता है।"
                : "The system prevents removal of the final active Founder role."}
            </p>
          </article>
          <article className={styles.card}>
            <h2>
              {language === "HI" ? "उत्पादन नियंत्रण" : "Production control"}
            </h2>
            <p>
              {language === "HI"
                ? "इस स्थानीय कार्यक्षेत्र से उत्पादन परिनियोजन उपलब्ध नहीं है।"
                : "Production deployment is unavailable from this local workspace."}
            </p>
          </article>
        </div>
      </>
    );
  }
  if (section === "profile") {
    const assignment = await prisma.userRoleAssignment.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        include: { role: true },
      }),
      party = await prisma.seeraPartyUser.findMany({
        where: { userId: user.id, active: true },
        include: { partner: true },
      }),
      scope = await prisma.seeraAssignment.findMany({
        where: {
          subjectId: user.id,
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
        },
      }),
      sessions = await prisma.session.findMany({
        where: {
          userId: user.id,
          revokedAt: null,
          expires: { gt: new Date() },
        },
        select: { id: true, createdAt: true, expires: true },
        orderBy: { createdAt: "desc" },
      });
    return (
      <>
        <PageHeading
          title={language === "HI" ? "मेरी प्रोफ़ाइल" : "My profile"}
          description={
            language === "HI"
              ? "पहचान, भूमिका, दायरा, भाषा और सक्रिय सत्र।"
              : "Identity, role, scope, language and active sessions."
          }
        />
        <div className={styles.split}>
          <section className={styles.card}>
            <h2>{user.name ?? user.email}</h2>
            <p>{user.email}</p>
            <p>
              <strong>{t.role}:</strong>{" "}
              {assignment.map((a) => a.role.name).join(", ")}
            </p>
            <p>
              <strong>{language === "HI" ? "भाषा" : "Language"}:</strong>{" "}
              {language === "HI" ? "हिन्दी" : "English"}
            </p>
            <p>
              <strong>{language === "HI" ? "भागीदार" : "Partner"}:</strong>{" "}
              {party.map((p) => p.partner.legalName).join(", ") || "—"}
            </p>
            <p>
              <strong>
                {language === "HI" ? "क्षेत्र/दायरा" : "Territory/scope"}:
              </strong>{" "}
              {scope.map((s) => s.targetId).join(", ") || "—"}
            </p>
          </section>
          <section className={styles.card}>
            <h2>{language === "HI" ? "सक्रिय सत्र" : "Active sessions"}</h2>
            {sessions.map((s) => (
              <p key={s.id}>
                {s.createdAt.toLocaleString()}
                <br />
                <small>
                  {language === "HI" ? "समाप्ति" : "Expires"}:{" "}
                  {s.expires.toLocaleString()}
                </small>
              </p>
            ))}
          </section>
        </div>
        <ChangePasswordActions language={language} />
      </>
    );
  }
  if (section === "notifications") {
    const items = await prisma.notification.findMany({
      where: { recipientId: user.id, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return (
      <>
        <PageHeading
          title={t.notifications}
          description={
            language === "HI"
              ? "आपके लिए नियंत्रित सिस्टम और संचालन सूचनाएँ।"
              : "Governed system and operational messages for you."
          }
        />
        {items.length ? (
          <div className={styles.stack}>
            {items.map((item) => (
              <article className={styles.card} key={item.id}>
                <span className={styles.badge}>{item.status}</span>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
                <small>{item.createdAt.toLocaleString()}</small>
                <NotificationActions id={item.id} language={language} />
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title={t.empty}
            description={
              language === "HI"
                ? "आपके पास कोई नई सूचना नहीं है।"
                : "You have no new notifications."
            }
          />
        )}
      </>
    );
  }
  if (product)
    return (
      <OperationalWorkspace
        db={prisma}
        userId={user.id}
        sessionId={session.id}
        portal={portal}
        item={product}
        language={language}
        query={query}
        permissions={permissions}
      />
    );
  notFound();
}
