import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1) sandbox page.
 *
 * Global Layout Specification §16's own recommendation: a page the Shell
 * can be reviewed against with no real module or live route involved. This
 * is the platform's only page today — deliberately not linked from any
 * live navigation, per the isolation boundary.
 */
export default function OSSandboxPage() {
  return (
    <Workspace>
      <PageHeader
        title="MUV OS"
        description="Core Platform Foundation — Milestone 1. No applications are installed yet."
      />
      <div className="px-6 pb-6">
        <div className="rounded-2xl p-8 text-center" style={{ border: "1px solid var(--card-border)" }}>
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.55)" }}>
            This is the platform shell with zero Apps registered — Sidebar, Search, Notifications,
            and the AI Panel are all real and working, and are all correctly empty.
          </p>
        </div>
      </div>
    </Workspace>
  );
}
