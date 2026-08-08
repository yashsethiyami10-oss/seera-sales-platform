import Link from "next/link";
import { listProductIntelligence } from "@/actions/product-intelligence";
import { listProblemIntelligence } from "@/actions/problem-intelligence";
import { listCareIntelligence } from "@/actions/care-intelligence";
import { listKnowledgeItems } from "@/actions/knowledge";
import { scanValueForConfidentiality } from "@/lib/knowledge-reconciliation/confidentiality-scanner";
import type { ConfidentialityFinding } from "@/lib/knowledge-reconciliation/confidentiality-scanner";

/**
 * MUV AI — Founder Intelligence Validation (Founder Validation & Safe UAT
 * Activation, Block A1).
 *
 * A read-only governance/inspection surface for the four frozen
 * intelligence layers (KnowledgeItem, ProductIntelligence,
 * ProblemIntelligence, CareIntelligence) — the "Founder/UAT clearance may
 * retrieve approved internal/DRAFT intelligence for validation" path the
 * task calls for. Deliberately reuses the EXISTING, already-`requireStaff`-
 * gated action modules (`actions/product-intelligence.ts` etc. — see this
 * task's own research: these already return every layer/status with zero
 * clearance filtering, because they are the authoring/review modules
 * themselves, not the customer-clearance-filtered retrieval path) rather
 * than inventing a new access mechanism. Page-level protection is the
 * same convention every `/admin/*` page already uses: `app/admin/
 * layout.tsx` redirects any non-ADMIN/STAFF session before this component
 * ever renders.
 *
 * The confidentiality scan shown here is computed live, on read, via the
 * same centralized scanner every write/retrieval/response path already
 * uses (`lib/knowledge-reconciliation/confidentiality-scanner.ts`) — this
 * page performs no write, no redaction, no promotion; it only surfaces
 * evidence for a human decision.
 */

export const dynamic = "force-dynamic";

function findingSummary(sections: unknown): { restricted: number; review: number; worst: ConfidentialityFinding["classification"] | null } {
  const findings = scanValueForConfidentiality(sections, "sections");
  const restricted = findings.filter((f) => f.classification === "RESTRICTED_INTERNAL_FORMULATION").length;
  const review = findings.filter((f) => f.classification === "FOUNDER_REVIEW_REQUIRED").length;
  const worst = restricted > 0 ? "RESTRICTED_INTERNAL_FORMULATION" : review > 0 ? "FOUNDER_REVIEW_REQUIRED" : null;
  return { restricted, review, worst };
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "danger" | "neutral"; children: React.ReactNode }) {
  const color = tone === "ok" ? "var(--success, #2e7d32)" : tone === "warn" ? "var(--warning, #b78103)" : tone === "danger" ? "var(--danger, #c0392b)" : "var(--muv-text-meta, #888)";
  return (
    <span style={{ color, border: `1px solid ${color}`, borderRadius: 4, padding: "1px 6px", fontSize: 11, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function sourceTraceOf(changeNote: string | null): string {
  if (!changeNote) return "—";
  const match = changeNote.match(/Source:\s*(\{.*\})/);
  return match ? match[1]! : changeNote.length > 80 ? changeNote.slice(0, 80) + "…" : changeNote;
}

export default async function AdminIntelligencePage() {
  const [piRes, priRes, ciRes, kiRes] = await Promise.all([
    listProductIntelligence({ pageSize: 50 }),
    listProblemIntelligence({ pageSize: 50 }),
    listCareIntelligence({ pageSize: 50 }),
    listKnowledgeItems({ pageSize: 100 }),
  ]);

  const piRows = piRes.success ? piRes.data : [];
  const priRows = priRes.success ? priRes.data : [];
  const ciRows = ciRes.success ? ciRes.data : [];
  const kiRows = kiRes.success ? kiRes.data : [];
  const kiTotal = kiRes.success ? kiRes.pagination.total : 0;

  const kiSummary = kiRows.reduce(
    (acc, item) => {
      const v = item.versions?.[0];
      if (v) {
        const s = findingSummary({ title: item.title, content: v.content });
        acc.restricted += s.restricted;
        acc.review += s.review;
      }
      acc.byLayer[item.layer] = (acc.byLayer[item.layer] ?? 0) + 1;
      return acc;
    },
    { restricted: 0, review: 0, byLayer: {} as Record<string, number> }
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display muv-text-solid text-2xl">MUV AI — Founder Intelligence Validation</h1>
        <p className="muv-text-meta text-sm mt-1">
          Read-only governance review of the four frozen intelligence layers. Nothing on this page is customer-visible — every row shown is INTERNAL/DRAFT
          unless explicitly marked otherwise, and viewing here never publishes, promotes, or approves anything.
        </p>
      </div>

      <section>
        <h2 className="muv-text-meta text-xs uppercase tracking-wide mb-3">Product Intelligence ({piRows.length})</h2>
        <div className="muv-card overflow-x-auto">
          <table className="text-sm w-full">
            <thead>
              <tr className="text-left muv-text-meta text-xs uppercase">
                <th className="pb-2 pr-3">Product</th>
                <th className="pb-2 pr-3">Layer</th>
                <th className="pb-2 pr-3">Version</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Confidentiality</th>
                <th className="pb-2">Source trace</th>
              </tr>
            </thead>
            <tbody>
              {piRows.map((pi) => {
                const v = pi.versions[0];
                const summary = v ? findingSummary(v.sections) : { restricted: 0, review: 0, worst: null };
                return (
                  <tr key={pi.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                    <td className="py-2 pr-3 muv-text-solid">{pi.product.name}</td>
                    <td className="py-2 pr-3">{pi.layer}</td>
                    <td className="py-2 pr-3">v{v?.versionNumber ?? "—"}</td>
                    <td className="py-2 pr-3">{v?.status ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {summary.worst === "RESTRICTED_INTERNAL_FORMULATION" ? (
                        <Badge tone="danger">{summary.restricted} restricted</Badge>
                      ) : summary.worst === "FOUNDER_REVIEW_REQUIRED" ? (
                        <Badge tone="warn">{summary.review} review-required</Badge>
                      ) : (
                        <Badge tone="ok">clean</Badge>
                      )}
                    </td>
                    <td className="py-2 muv-text-faint text-xs">{sourceTraceOf(v?.changeNote ?? null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="muv-text-meta text-xs uppercase tracking-wide mb-3">Problem Intelligence ({priRows.length})</h2>
        <div className="muv-card overflow-x-auto">
          <table className="text-sm w-full">
            <thead>
              <tr className="text-left muv-text-meta text-xs uppercase">
                <th className="pb-2 pr-3">Problem</th>
                <th className="pb-2 pr-3">Layer</th>
                <th className="pb-2 pr-3">Version</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Risk</th>
                <th className="pb-2">Confidentiality</th>
              </tr>
            </thead>
            <tbody>
              {priRows.map((pri) => {
                const v = pri.versions?.[0];
                const summary = v ? findingSummary({ publicTitle: v.publicTitle, summary: v.summary }) : { restricted: 0, review: 0, worst: null };
                return (
                  <tr key={pri.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                    <td className="py-2 pr-3 muv-text-solid">{v?.publicTitle ?? pri.slug}</td>
                    <td className="py-2 pr-3">{pri.layer}</td>
                    <td className="py-2 pr-3">v{v?.versionNumber ?? "—"}</td>
                    <td className="py-2 pr-3">{v?.status ?? "—"}</td>
                    <td className="py-2 pr-3">{v?.riskLevel ?? "—"}{v?.escalationRequired ? " (escalation)" : ""}</td>
                    <td className="py-2 pr-3">
                      {summary.worst ? <Badge tone={summary.worst === "RESTRICTED_INTERNAL_FORMULATION" ? "danger" : "warn"}>{summary.restricted + summary.review} finding(s)</Badge> : <Badge tone="ok">clean</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="muv-text-meta text-xs uppercase tracking-wide mb-3">Care Intelligence ({ciRows.length})</h2>
        <div className="muv-card overflow-x-auto">
          <table className="text-sm w-full">
            <thead>
              <tr className="text-left muv-text-meta text-xs uppercase">
                <th className="pb-2 pr-3">Workflow</th>
                <th className="pb-2 pr-3">Layer</th>
                <th className="pb-2 pr-3">Version</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Escalation</th>
                <th className="pb-2">Confidentiality</th>
              </tr>
            </thead>
            <tbody>
              {ciRows.map((ci) => {
                const v = ci.versions?.[0];
                const summary = v ? findingSummary({ title: v.title, situationDescription: v.situationDescription }) : { restricted: 0, review: 0, worst: null };
                return (
                  <tr key={ci.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                    <td className="py-2 pr-3 muv-text-solid">{v?.title ?? ci.slug}</td>
                    <td className="py-2 pr-3">{ci.layer}</td>
                    <td className="py-2 pr-3">v{v?.versionNumber ?? "—"}</td>
                    <td className="py-2 pr-3">{v?.status ?? "—"}</td>
                    <td className="py-2 pr-3">{v?.escalationRequired ? "Required" : "No"}</td>
                    <td className="py-2 pr-3">
                      {summary.worst ? <Badge tone={summary.worst === "RESTRICTED_INTERNAL_FORMULATION" ? "danger" : "warn"}>{summary.restricted + summary.review} finding(s)</Badge> : <Badge tone="ok">clean</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="muv-text-meta text-xs uppercase tracking-wide mb-3">Knowledge Items — summary ({kiTotal} total, first {kiRows.length} scanned)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="muv-card">
            <p className="font-display muv-text-solid text-lg">{kiTotal}</p>
            <p className="muv-text-meta text-xs mt-1">Total KnowledgeItems</p>
          </div>
          <div className="muv-card">
            <p className="font-display muv-text-solid text-lg">{Object.entries(kiSummary.byLayer).map(([l, c]) => `${l}: ${c}`).join(", ") || "—"}</p>
            <p className="muv-text-meta text-xs mt-1">By layer (sampled)</p>
          </div>
          <div className="muv-card">
            <p className="font-display muv-text-solid text-lg">{kiSummary.restricted}</p>
            <p className="muv-text-meta text-xs mt-1">Restricted findings (sampled)</p>
          </div>
          <div className="muv-card">
            <p className="font-display muv-text-solid text-lg">{kiSummary.review}</p>
            <p className="muv-text-meta text-xs mt-1">Review-required findings (sampled)</p>
          </div>
        </div>
        <p className="muv-text-faint text-xs mt-2">
          Full per-item confidentiality history for KnowledgeItem is available via <Link href="/admin/analytics/ai-gateway" className="hover:underline">AI Gateway Operations</Link> and the
          existing <code>getKnowledgeItem</code>/<code>getProductIntelligenceVersionHistory</code>-style actions for drill-down; this page intentionally shows a
          governance summary rather than all {kiTotal} rows.
        </p>
      </section>

      <section>
        <h2 className="muv-text-meta text-xs uppercase tracking-wide mb-3">Publishing state (global)</h2>
        <p className="muv-text-faint text-xs">
          See <code>docs/muv-ai/MUV_AI_FOUNDER_VALIDATION_MANIFEST.md</code> in the repository for the full Founder decision queue and
          publishing-readiness classification (SAFE TO PUBLISH / SAFE INTERNAL ONLY / FOUNDER REVIEW REQUIRED / BLOCKED) for every record above.
        </p>
      </section>
    </div>
  );
}
