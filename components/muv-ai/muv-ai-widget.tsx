"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X, Send, RotateCcw, Headset, Maximize2, Minimize2, Menu } from "lucide-react";
import { useMuvAiChat } from "./use-muv-ai-chat";
import { MuvAiMessage } from "./muv-ai-message";
import { MuvAiHandoff } from "./muv-ai-handoff";
import { MuvAiSidebar } from "./muv-ai-sidebar";

const WELCOME_MESSAGE = "Hello! Muv AI is here to take care of you. Please ask your query.";

/**
 * MUV AI Website Integration — Wave 2. Still only UI state (input text,
 * scroll position, panel-open transitions, which turn's diagnostics panel
 * is expanded) on top of `useMuvAiChat()`, which remains the single
 * source of truth for everything conversational. This file never
 * recalculates a decision, modifies AI output, interprets safety, or
 * generates an answer itself — every new control here (reset, feedback,
 * suggestions, handoff, diagnostics) is a thin affordance over a function
 * the hook already exposes.
 *
 * NON-NEGOTIABLE DESIGN FREEZE: the Wave 1 launcher, panel, typography,
 * spacing, colors, animations, and message styles are unchanged below —
 * every new control reuses the same `muv-` token vocabulary and visually
 * nests inside the existing panel rather than altering its structure.
 */
export function MuvAiWidget() {
  const pathname = usePathname();
  const {
    open, openChat, closeChat, messages, send, sending, startingSession, allowFollowUp, retry,
    expanded, toggleExpanded, sidebarOpen, toggleSidebar, setSidebarOpen,
    showSuggestions, suggestedQuestions, selectSuggestedQuestion,
    resetConfirmOpen, setResetConfirmOpen, resetConversation,
    feedbackByTurn, submitFeedback,
    handoffOpen, openHandoff, closeHandoff, handoffSubmitting, handoffResult, supportContact, submitHandoff,
    diagnosticsAuthorized, diagnosticsByTurn, fetchDiagnostics,
  } = useMuvAiChat();

  const [inputValue, setInputValue] = useState("");
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(false);

  // Entrance/exit transition — same JS-driven pattern as components/ui/modal.tsx,
  // so the panel reverses its own opening animation on close instead of
  // snapping away. Unchanged from Wave 1.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setShown(true), 10);
      return () => clearTimeout(t);
    }
    setShown(false);
  }, [open]);

  // Focus management: move focus into the panel on open, return it to the
  // launcher button on close. Unchanged from Wave 1.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 260);
      return () => clearTimeout(t);
    }
    launcherRef.current?.focus();
  }, [open]);

  // Escape closes the topmost surface first — handoff/reset overlay, then
  // the sidebar, then the expanded workspace (back to the floating panel),
  // and only then the panel itself — so a single Escape press never skips
  // a step or loses more context than the customer intended.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (handoffOpen) return closeHandoff();
      if (resetConfirmOpen) return setResetConfirmOpen(false);
      if (sidebarOpen) return setSidebarOpen(false);
      if (expanded) return toggleExpanded();
      closeChat();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, closeChat, handoffOpen, closeHandoff, resetConfirmOpen, setResetConfirmOpen, sidebarOpen, setSidebarOpen, expanded, toggleExpanded]);

  // Auto-scroll to the latest message/typing indicator. Unchanged from Wave 1.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, sending]);

  // Staff/admin tooling, not the storefront — unchanged from Wave 1.
  if (pathname?.startsWith("/admin")) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim() || sending || !allowFollowUp) return;
    void send(inputValue);
    setInputValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleToggleDiagnostics(turnKey: string, message: Extract<(typeof messages)[number], { role: "assistant" }>) {
    setExpandedDiagnostics((prev) => {
      const next = new Set(prev);
      if (next.has(turnKey)) next.delete(turnKey);
      else next.add(turnKey);
      return next;
    });
    void fetchDiagnostics(message);
  }

  const isEmpty = messages.length === 0;

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className="muv-ai-launcher"
        onClick={open ? closeChat : openChat}
        aria-label={open ? "Close Muv AI chat" : "Chat with Muv AI"}
        aria-expanded={open}
        aria-controls="muv-ai-panel"
      >
        {!open && <span className="muv-ai-launcher-pulse" aria-hidden />}
        {open ? <X size={24} /> : <img src="/muv-ai-logo-icon.png" alt="" className="muv-ai-launcher-logo" />}
      </button>

      {open && (
        <div
          id="muv-ai-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="muv-ai-panel-title"
          className={`muv-ai-panel${expanded ? " muv-ai-panel-expanded" : ""}${sidebarOpen ? " muv-ai-panel-with-sidebar" : ""}`}
          style={{ opacity: shown ? 1 : 0, transform: shown ? "translateY(0) scale(1)" : "translateY(12px) scale(0.97)" }}
        >
          {expanded && sidebarOpen && (
            <MuvAiSidebar
              messages={messages}
              onClose={() => setSidebarOpen(false)}
              onNewConversation={() => setResetConfirmOpen(true)}
              onContactSupport={openHandoff}
            />
          )}

          <div className="muv-ai-panel-main">
          <div className="muv-ai-panel-header">
            <div className="muv-ai-panel-header-brand">
              {expanded && (
                <button type="button" className="muv-icon-circle" onClick={toggleSidebar} aria-label="My Care Journey" aria-expanded={sidebarOpen}>
                  <Menu size={15} />
                </button>
              )}
              <div className="muv-ai-panel-logo" aria-hidden>
                <img src="/muv-ai-logo-icon.png" alt="" />
              </div>
              <div>
                <div id="muv-ai-panel-title" className="muv-ai-panel-title">
                  Muv AI
                  <span className="muv-ai-panel-subtitle">Your Care Companion</span>
                </div>
                <div className="muv-ai-panel-status">
                  <span className="muv-ai-status-dot" aria-hidden />
                  {startingSession && "Connecting…"}
                </div>
              </div>
            </div>
            <div className="muv-ai-panel-header-actions">
              {!isEmpty && (
                <button type="button" className="muv-icon-circle" onClick={() => setResetConfirmOpen(true)} aria-label="Start a new conversation">
                  <RotateCcw size={14} />
                </button>
              )}
              <button type="button" className="muv-icon-circle" onClick={openHandoff} aria-label="Talk to our support team">
                <Headset size={14} />
              </button>
              <button
                type="button"
                className="muv-icon-circle"
                onClick={toggleExpanded}
                aria-label={expanded ? "Return to Website" : "Expand Workspace"}
                title={expanded ? "Return to Website" : "Expand Workspace"}
              >
                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button type="button" className="muv-icon-circle" onClick={closeChat} aria-label="Close chat">
                <X size={16} />
              </button>
            </div>
          </div>

          {resetConfirmOpen && (
            <div className="muv-ai-confirm" role="alertdialog" aria-modal="true" aria-labelledby="muv-ai-confirm-title">
              <p id="muv-ai-confirm-title">Start a new conversation? This clears the current chat.</p>
              <div className="muv-ai-confirm-actions">
                <button type="button" className="muv-btn-ghost muv-ai-confirm-btn" onClick={() => setResetConfirmOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="muv-btn-primary muv-ai-confirm-btn" onClick={() => void resetConversation()}>
                  Start new
                </button>
              </div>
            </div>
          )}

          {handoffOpen && (
            <MuvAiHandoff
              contact={supportContact}
              submitting={handoffSubmitting}
              result={handoffResult}
              onSubmit={(fields) => void submitHandoff(fields)}
              onClose={closeHandoff}
            />
          )}

          <div className="muv-ai-panel-body" ref={bodyRef} role="log" aria-live="polite" aria-relevant="additions">
            {isEmpty && (
              <div className="muv-ai-empty-state">
                <div className="muv-ai-empty-state-logo-wrap">
                  <div className="muv-ai-empty-state-glow" aria-hidden />
                  <img src="/muv-ai-logo-full.png" alt="Muv AI — Your Care Companion" className="muv-ai-empty-state-logo" />
                </div>
                <p>{WELCOME_MESSAGE}</p>
              </div>
            )}

            {messages.map((message) => {
              const turnKey = message.role === "assistant" ? message.generatedAt : message.id;
              return (
                <MuvAiMessage
                  key={message.id}
                  message={message}
                  onRetry={retry}
                  feedbackState={message.role === "assistant" ? feedbackByTurn[turnKey] ?? "idle" : undefined}
                  onFeedback={message.role === "assistant" ? (helpful) => void submitFeedback(turnKey, helpful) : undefined}
                  diagnosticsAuthorized={diagnosticsAuthorized && message.role === "assistant"}
                  diagnosticsState={message.role === "assistant" ? diagnosticsByTurn[turnKey] : undefined}
                  diagnosticsExpanded={expandedDiagnostics.has(turnKey)}
                  onToggleDiagnostics={
                    message.role === "assistant" ? () => handleToggleDiagnostics(turnKey, message) : undefined
                  }
                />
              );
            })}

            {sending && (
              <div className="muv-ai-typing" role="status" aria-label="Muv AI is typing">
                <span className="muv-ai-typing-dot" />
                <span className="muv-ai-typing-dot" />
                <span className="muv-ai-typing-dot" />
              </div>
            )}

            {showSuggestions && !sending && (
              <div className="muv-ai-suggestions" role="group" aria-label="Suggested questions">
                {suggestedQuestions.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    className="muv-ai-suggestion-chip"
                    onClick={() => selectSuggestedQuestion(q.text)}
                  >
                    {q.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form className="muv-ai-panel-footer" onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              className="muv-ai-input"
              rows={1}
              maxLength={2000}
              placeholder={allowFollowUp ? "Ask your query…" : "This conversation has ended"}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending || !allowFollowUp}
              aria-label="Message Muv AI"
            />
            <button
              type="submit"
              className="muv-ai-send-btn"
              disabled={sending || !allowFollowUp || !inputValue.trim()}
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </form>
          {!allowFollowUp && !isEmpty && (
            <p className="muv-ai-input-note">Please start a new conversation to continue.</p>
          )}
          </div>
        </div>
      )}
    </>
  );
}
