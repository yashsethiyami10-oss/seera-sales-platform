import { FileText } from "lucide-react";
import { useWorkspaceContext } from "@/lib/os-shell/workspace-context";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), AI Panel Foundation.
 * Reads the real `WorkspaceContext` to show what it would summarize once
 * connected — with zero Apps mounted, `appId` is genuinely `null`, so the
 * honest empty state says exactly that rather than a generic placeholder.
 */
export function SummaryTab() {
  const context = useWorkspaceContext();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <FileText size={22} style={{ color: "rgba(var(--text-rgb),0.3)" }} aria-hidden="true" />
      <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.55)" }}>
        {context.appId ? "No summary available for this page yet." : "Nothing to summarize — no application is open."}
      </p>
    </div>
  );
}
