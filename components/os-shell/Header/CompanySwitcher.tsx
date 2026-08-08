import { Building2 } from "lucide-react";

/**
 * MUV OS™ — Sales OS Separation, Phase 10.0, Block 1, Freeze Decision item 4.
 *
 * Confirmed by the prior Company Switcher audit and re-confirmed here: this
 * was always a static, non-interactive placeholder, never a working
 * switcher. The Phase 10.0 freeze decision is explicit — the platform stays
 * single-company for MUV; no tenant support, no organization selector, no
 * company context is to be built. Per that decision this renders as a
 * plain workspace-identity badge, not a switcher-shaped affordance (no
 * chevron, no button semantics, no hover state) — so it never invites a
 * click that would only be a no-op.
 *
 * "MUV" is not a placeholder string — it is this deployment's actual
 * organization identity, the same literal this codebase already uses
 * throughout (e.g. `AiConfiguration.organizationKey: "MUV"`,
 * `ENTERPRISE_ORGANIZATION` in `lib/enterprise/context.ts`).
 */
export function CompanySwitcher() {
  return (
    <div
      className="hidden md:flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
      style={{ color: "rgba(var(--text-rgb),0.5)" }}
    >
      <Building2 size={13} aria-hidden="true" />
      MUV Workspace
    </div>
  );
}
