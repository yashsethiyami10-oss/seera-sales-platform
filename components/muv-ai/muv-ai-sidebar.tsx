"use client";

import { CalendarDays, RotateCcw, Headset, X } from "lucide-react";
import type { ChatMessage } from "./use-muv-ai-chat";

/**
 * "My Care Journey" — Experience v2.0. Sidebar shell only inside the
 * expanded workspace; hidden by default, opened via the header ☰.
 *
 * Final Founder Correction: only sections with real, working data are
 * shown — "Today's Care" (this hook's own live `messages`) and "Quick
 * Actions" (the existing reset/handoff affordances Wave 2 already built).
 * The earlier draft also listed Yesterday/Previous Conversations/Saved
 * Recommendations as labeled coming-soon placeholders; per the Founder's
 * explicit correction ("remove placeholder sections rather than showing
 * unavailable functionality"), those are removed outright rather than
 * shown disabled — no frozen module persists cross-session history or
 * bookmarking today, and inventing UI for it would misrepresent what the
 * product can do.
 */
export function MuvAiSidebar({
  messages,
  onClose,
  onNewConversation,
  onContactSupport,
}: {
  messages: ChatMessage[];
  onClose: () => void;
  onNewConversation: () => void;
  onContactSupport: () => void;
}) {
  const userTurns = messages.filter((m) => m.role === "user").length;

  return (
    <aside className="muv-ai-sidebar" aria-label="My Care Journey">
      <div className="muv-ai-sidebar-header">
        <div className="muv-ai-sidebar-brand">
          <img src="/muv-ai-logo-icon.png" alt="" className="muv-ai-sidebar-brand-logo" />
          <span>My Care Journey</span>
        </div>
        <button type="button" className="muv-icon-circle" onClick={onClose} aria-label="Close sidebar">
          <X size={14} />
        </button>
      </div>

      <div className="muv-ai-sidebar-section">
        <div className="muv-ai-sidebar-section-title">
          <CalendarDays size={13} aria-hidden />
          Today&rsquo;s Care
        </div>
        {userTurns > 0 ? (
          <p className="muv-ai-sidebar-section-body">
            {userTurns} {userTurns === 1 ? "message" : "messages"} in this conversation.
          </p>
        ) : (
          <p className="muv-ai-sidebar-section-body muv-ai-sidebar-muted">No messages yet — say hello to get started.</p>
        )}
      </div>

      <div className="muv-ai-sidebar-section">
        <div className="muv-ai-sidebar-section-title">Quick Actions</div>
        <div className="muv-ai-sidebar-actions">
          <button type="button" className="muv-ai-sidebar-action" onClick={onNewConversation}>
            <RotateCcw size={14} aria-hidden />
            Start a new conversation
          </button>
          <button type="button" className="muv-ai-sidebar-action" onClick={onContactSupport}>
            <Headset size={14} aria-hidden />
            Talk to our support team
          </button>
        </div>
      </div>
    </aside>
  );
}
