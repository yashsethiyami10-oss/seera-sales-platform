import { Terminal } from "lucide-react";
import type { DiagnosticSnapshot } from "./use-muv-ai-chat";

/**
 * Founder-only diagnostics. Rendering this component at all is already
 * gated by `diagnosticsAuthorized` (server-verified, see
 * `checkMuvAiDiagnosticsAccess` / `getMuvAiTurnDiagnostics`'s own
 * `requireAdmin()`) — this component itself performs no access check, it
 * only formats what the caller already fetched. Visually distinct
 * (monospace, bordered, labeled) from the customer-facing bubble it sits
 * below, per "be visually separate from the customer response." Contains
 * only fields Module 8's authoritative response already safely returned —
 * no confidence score, no safety reasoning text, no retrieved content, no
 * system prompt: none of that is available to this component because none
 * of it is available in `WebsiteExperienceView` to begin with.
 */
export function MuvAiDiagnostics({ snapshot, onRequest, state }: { snapshot: DiagnosticSnapshot | "loading" | null | undefined; onRequest: () => void; state: "collapsed" | "expanded" }) {
  if (state === "collapsed") {
    return (
      <button type="button" className="muv-ai-diagnostics-toggle" onClick={onRequest} aria-label="Show founder diagnostics for this response">
        <Terminal size={11} aria-hidden /> Diagnostics
      </button>
    );
  }

  if (snapshot === "loading" || snapshot === undefined) {
    return <div className="muv-ai-diagnostics-panel muv-ai-diagnostics-loading">Loading diagnostics…</div>;
  }

  if (snapshot === null) {
    return <div className="muv-ai-diagnostics-panel">Diagnostics unavailable for this response.</div>;
  }

  const rows: [string, string | number | boolean][] = [
    ["Session", snapshot.sessionId],
    ["Turn", snapshot.turnId],
    ["Execution status", snapshot.executionStatus],
    ["Escalation", snapshot.escalationStatus],
    ["Follow-up allowed", snapshot.allowFollowUp],
    ["Retrieved-source count", snapshot.retrievedSourceCountProxy],
    ["Response segments", snapshot.responseSegmentTypes.join(", ") || "—"],
    ["Duration (ms)", snapshot.processingDurationMs],
    ["Architecture version", snapshot.architectureVersion],
    ["AI version", snapshot.aiVersion],
  ];

  return (
    <div className="muv-ai-diagnostics-panel" role="region" aria-label="Founder diagnostics">
      {rows.map(([label, value]) => (
        <div key={label} className="muv-ai-diagnostics-row">
          <span className="muv-ai-diagnostics-label">{label}</span>
          <span className="muv-ai-diagnostics-value">{String(value)}</span>
        </div>
      ))}
    </div>
  );
}
