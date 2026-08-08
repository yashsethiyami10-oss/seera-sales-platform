import type { ChatMessage, DiagnosticSnapshot, FeedbackState } from "./use-muv-ai-chat";
import { MuvAiFeedback } from "./muv-ai-feedback";
import { MuvAiDiagnostics } from "./muv-ai-diagnostics";
import { MuvAiProductCard } from "./muv-ai-product-card";
import { MuvAiMarkdown } from "./muv-ai-markdown";

/**
 * Pure rendering — every string shown here (beyond the retry/feedback/
 * diagnostics affordances' own labels) comes directly from
 * `WebsiteExperienceSegment.content`, already produced by the existing AI
 * pipeline. This component performs no reasoning, no classification, no
 * reordering of segments — it maps each segment's `kind` to a visual
 * style and nothing else. Feedback/diagnostics are read-only overlays on
 * top of an already-rendered response; neither can alter it.
 */
export function MuvAiMessage({
  message,
  onRetry,
  feedbackState,
  onFeedback,
  diagnosticsAuthorized,
  diagnosticsState,
  diagnosticsExpanded,
  onToggleDiagnostics,
}: {
  message: ChatMessage;
  onRetry?: (text: string) => void;
  feedbackState?: FeedbackState;
  onFeedback?: (helpful: boolean) => void;
  diagnosticsAuthorized?: boolean;
  diagnosticsState?: DiagnosticSnapshot | "loading" | null;
  diagnosticsExpanded?: boolean;
  onToggleDiagnostics?: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="muv-ai-turn muv-ai-turn-user">
        <div className="muv-ai-bubble muv-ai-bubble-user">{message.text}</div>
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="muv-ai-turn muv-ai-turn-assistant">
        <div className="muv-ai-bubble muv-ai-bubble-error" role="alert">
          {message.text}
        </div>
        {onRetry && (
          <button type="button" className="muv-ai-retry-btn" onClick={() => onRetry(message.retryText)}>
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="muv-ai-turn muv-ai-turn-assistant">
      {message.segments.map((segment, idx) => {
        const key = `${message.id}-${idx}`;
        switch (segment.kind) {
          case "REFERENCE_CARD": {
            const referenceType = typeof segment.meta?.referenceType === "string" ? segment.meta.referenceType : null;
            const referenceId = typeof segment.meta?.id === "string" ? segment.meta.id : null;
            if (referenceType && referenceId && (referenceType === "PRODUCT" || referenceType === "PRODUCT_INTELLIGENCE")) {
              return <MuvAiProductCard key={key} referenceType={referenceType} referenceId={referenceId} label={segment.content} />;
            }
            return (
              <div key={key} className="muv-ai-reference-card">
                <span className="muv-ai-reference-card-dot" aria-hidden />
                {segment.content}
              </div>
            );
          }
          case "ESCALATION_NOTICE":
            return (
              <div key={key} className="muv-ai-bubble muv-ai-bubble-escalation">
                <MuvAiMarkdown text={segment.content} />
              </div>
            );
          case "FOLLOW_UP_QUESTION":
          case "MESSAGE":
          default:
            return (
              <div key={key} className="muv-ai-bubble muv-ai-bubble-assistant">
                <MuvAiMarkdown text={segment.content} />
              </div>
            );
        }
      })}

      <div className="muv-ai-turn-footer">
        {onFeedback && feedbackState && <MuvAiFeedback state={feedbackState} onSubmit={onFeedback} />}
        {diagnosticsAuthorized && onToggleDiagnostics && (
          <MuvAiDiagnostics
            snapshot={diagnosticsState}
            onRequest={onToggleDiagnostics}
            state={diagnosticsExpanded ? "expanded" : "collapsed"}
          />
        )}
      </div>
    </div>
  );
}
