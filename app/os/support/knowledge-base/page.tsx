import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listKbCategories, listKbArticles } from "@/actions/support";
import { KnowledgeBaseManager } from "@/components/os-support/KnowledgeBaseManager";

export default async function KnowledgeBasePage() {
  const [categoriesResult, articlesResult] = await Promise.all([
    listKbCategories(),
    listKbArticles({ pageSize: 100 }),
  ]);
  return (
    <Workspace>
      <PageHeader title="Knowledge Base" description="Draft -> In Review -> Approved -> Published — author and approver are always different people" />
      <div className="px-6 pb-10">
        {categoriesResult.success && articlesResult.success ? (
          <KnowledgeBaseManager
            categories={categoriesResult.data.map((c) => ({ id: c.id, name: c.name }))}
            articles={articlesResult.data.items.map((a) => ({ id: a.id, title: a.title, slug: a.slug, status: a.status, visibility: a.visibility, version: a.version, categoryName: a.category.name }))}
          />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{!categoriesResult.success ? categoriesResult.error.message : !articlesResult.success ? articlesResult.error.message : ""}</p>
        )}
      </div>
    </Workspace>
  );
}
