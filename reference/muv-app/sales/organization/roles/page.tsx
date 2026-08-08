import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";

/**
 * RBAC Administration Completion (Enterprise UI Integration). This is a
 * read-only permission matrix, not a role/permission editor: roles and
 * permissions are seed/code-defined (prisma/seed.ts's roleDefinitions),
 * with no mutation Server Action anywhere in the codebase for editing a
 * role's permission set or a user's role assignment at runtime — building
 * an editor would mean inventing new backend authorization-mutation logic
 * with no approved spec, which is out of scope here. What genuinely was
 * missing was visibility: sales_roles/sales_permissions are real, fully
 * seeded tables with zero UI surface anywhere before this page.
 */
export default async function RolesPage() {
  await requirePermission(PERMISSIONS.USERS_VIEW);
  const roles = await prisma.salesRole.findMany({
    orderBy: { name: "asc" },
    include: {
      permissions: { include: { permission: true }, orderBy: { permission: { module: "asc" } } },
      _count: { select: { users: true } },
    },
  });

  return <section className="space-y-5 text-white">
    <header>
      <Link href="/sales/organization" className="text-sm text-zinc-400 hover:text-white">&larr; Sales organization</Link>
      <h1 className="mt-2 text-3xl font-semibold">Roles &amp; Permissions</h1>
      <p className="mt-1 text-sm text-zinc-400">{roles.length} sales roles · code and seed-defined, not runtime-editable</p>
    </header>
    <div className="grid gap-4">{roles.map((role) => (
      <article key={role.id} className="rounded-2xl border border-white/10 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">{role.name}</h2>
            <p className="text-sm text-zinc-500">{role.description ?? "No description"} · {role._count.users} users · {role.active ? "Active" : "Inactive"}</p>
          </div>
          <span className="text-sm text-amber-400">{role.permissions.length} permissions</span>
        </div>
        {role.permissions.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {role.permissions.map((rp) => (
              <span key={rp.permissionId} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">{rp.permission.displayName}</span>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-zinc-500">No permissions assigned.</p>}
      </article>
    ))}</div>
  </section>;
}
