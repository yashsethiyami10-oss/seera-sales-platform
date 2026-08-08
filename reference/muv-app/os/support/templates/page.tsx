import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listResolutionTemplates } from "@/actions/support";
import { TemplatesManager } from "@/components/os-support/TemplatesManager";

export default async function TemplatesPage() {
  const templatesResult = await listResolutionTemplates();
  return (
    <Workspace>
      <PageHeader title="Resolution Templates" description="Reusable responses agents insert into ticket replies" />
      <div className="px-6 pb-10">
        {templatesResult.success ? (
          <TemplatesManager templates={templatesResult.data.map((t) => ({ id: t.id, title: t.title, body: t.body, category: t.category }))} />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{templatesResult.error.message}</p>
        )}
      </div>
    </Workspace>
  );
}
