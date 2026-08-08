import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listFaqs } from "@/actions/support";
import { FaqManager } from "@/components/os-support/FaqManager";

export default async function FaqPage() {
  const faqsResult = await listFaqs(false);
  return (
    <Workspace>
      <PageHeader title="FAQ" description="Frequently asked questions" />
      <div className="px-6 pb-10">
        {faqsResult.success ? (
          <FaqManager faqs={faqsResult.data.map((f) => ({ id: f.id, question: f.question, answer: f.answer, isPublic: f.isPublic }))} />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{faqsResult.error.message}</p>
        )}
      </div>
    </Workspace>
  );
}
