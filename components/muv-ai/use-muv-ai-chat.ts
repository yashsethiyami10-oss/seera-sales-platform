"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startSession, orchestrateExperience } from "@/actions/experience";
import {
  validateMuvAiSession, submitMuvAiFeedback, requestMuvAiHandoff, getMuvAiSupportContact,
  logMuvAiEvent, checkMuvAiDiagnosticsAccess, getMuvAiTurnDiagnostics,
} from "@/actions/muv-ai-beta";
import type { muvAiEventTypeValues } from "@/lib/validations/muv-ai-beta";
import type { ExecutionStatus } from "@/lib/experience/types";
import {
  MUV_AI_SUGGESTED_QUESTIONS, MUV_AI_FOLLOW_UP_WITH_PRODUCT, MUV_AI_FOLLOW_UP_DEFAULT, type SuggestedQuestion,
} from "./suggested-questions";

type MuvAiEventType = (typeof muvAiEventTypeValues)[number];

/**
 * MUV AI Website Integration — Wave 2. Still the single source of truth
 * for the widget's frontend state — every Wave 2 addition (feedback,
 * handoff, diagnostics, reset, suggested questions, event logging) is
 * more state and more functions in this same hook, never a second,
 * competing state container. `send()` is still the only path a message
 * reaches the AI — suggested questions call it directly; nothing new
 * bypasses Experience.
 */

export type ChatSegment = { kind: string; content: string; meta?: Record<string, unknown> };

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; segments: ChatSegment[]; executionStatus: ExecutionStatus; generatedAt: string; requiresHandoff: boolean; durationMs: number }
  | { id: string; role: "error"; text: string; retryText: string };

export type FeedbackState = "idle" | "submitting" | "helpful" | "not-helpful";

export type DiagnosticSnapshot = {
  sessionId: string;
  turnId: string;
  executionStatus: string;
  escalationStatus: "REQUIRED" | "NOT_REQUIRED";
  allowFollowUp: boolean;
  retrievedSourceCountProxy: number;
  responseSegmentTypes: string[];
  processingDurationMs: number;
  architectureVersion: string;
  aiVersion: string;
};

const SESSION_STORAGE_KEY = "muv-ai-session-id";
const RESPONSE_TIMEOUT_MS = 30000;
const MAX_MESSAGE_LENGTH = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("MUV_AI_TIMEOUT")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/** Best-effort — "keep analytics failure non-blocking." Never awaited by a
 * caller that's mid-conversation; fire-and-forget with its own swallow. */
function logEvent(type: MuvAiEventType, sessionId: string | null, properties?: Record<string, unknown>) {
  void logMuvAiEvent({ type, sessionId: sessionId ?? undefined, properties }).catch(() => {});
}

export function useMuvAiChat() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [startingSession, setStartingSession] = useState(false);
  const [sending, setSending] = useState(false);
  const [allowFollowUp, setAllowFollowUp] = useState(true);

  // Experience v2.0 — Expand Workspace + "My Care Journey" sidebar. Pure
  // presentation state: the same mounted hook/session/messages continue
  // underneath, so toggling either never reloads, resets, or re-fetches
  // anything. Sidebar always closes when collapsing back to the floating
  // panel — it's a workspace-only surface, never shown floating.
  const [expanded, setExpanded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [feedbackByTurn, setFeedbackByTurn] = useState<Record<string, FeedbackState>>({});
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffSubmitting, setHandoffSubmitting] = useState(false);
  const [handoffResult, setHandoffResult] = useState<"success" | "error" | null>(null);
  const [supportContact, setSupportContact] = useState<{ supportEmail: string | null; supportPhone: string | null; whatsappNumber: string | null } | null>(null);

  const [diagnosticsAuthorized, setDiagnosticsAuthorized] = useState(false);
  const [diagnosticsByTurn, setDiagnosticsByTurn] = useState<Record<string, DiagnosticSnapshot | "loading" | null>>({});

  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);
  // Bumped on every reset — an in-flight send() captures the generation at
  // its start and discards its own result if the generation has since
  // changed, so a stale response can never be appended to a conversation
  // that was reset while the request was still in flight.
  const generationRef = useRef(0);

  // Founder/admin diagnostics authorization — checked once, server-side,
  // on mount. This only controls whether the UI *offers* the diagnostics
  // toggle; the real enforcement is requireAdmin() inside
  // getMuvAiTurnDiagnostics itself, re-checked on every call.
  useEffect(() => {
    void checkMuvAiDiagnosticsAccess().then((res) => {
      if (res.success) setDiagnosticsAuthorized(res.data.isAuthorized);
    });
  }, []);

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionId) return sessionId;

    if (sessionPromiseRef.current) return sessionPromiseRef.current;

    const promise = (async () => {
      setStartingSession(true);
      try {
        // "Refresh restoration may be added only through a safe
        // client-side reference to an existing valid session" — the
        // stored id is only ever a *reference*; it is proactively
        // validated server-side before reuse. An expired/invalid/
        // inaccessible session fails closed and a clean one begins
        // instead of trusting the stored string.
        const stored = typeof window !== "undefined" ? sessionStorage.getItem(SESSION_STORAGE_KEY) : null;
        if (stored) {
          const validation = await validateMuvAiSession(stored);
          if (validation.success && validation.data.valid) {
            setSessionId(stored);
            return stored;
          }
          if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }

        const result = await startSession({ channel: "WEBSITE" });
        if (!result.success) return null;
        const id = result.data.session.id;
        if (typeof window !== "undefined") sessionStorage.setItem(SESSION_STORAGE_KEY, id);
        setSessionId(id);
        logEvent("SESSION_STARTED", id);
        return id;
      } catch {
        return null;
      } finally {
        setStartingSession(false);
        sessionPromiseRef.current = null;
      }
    })();
    sessionPromiseRef.current = promise;
    return promise;
  }, [sessionId]);

  const openChat = useCallback(() => {
    setOpen(true);
    logEvent("WIDGET_OPENED", sessionId);
    void ensureSession();
  }, [ensureSession, sessionId]);

  const closeChat = useCallback(() => setOpen(false), []);

  // Pure UI state — deliberately not routed through logMuvAiEvent. Part 12
  // of the v2.0 spec ("Do NOT modify... Analytics") is read as: don't touch
  // the analytics *system* (schema, event set, pipeline) for a feature the
  // founder scoped as presentation-only; the existing event set already
  // covers everything that matters operationally (session/message/handoff).
  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      if (!next) setSidebarOpen(false); // returning to the floating panel always closes the sidebar with it
      return next;
    });
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);

  const send = useCallback(
    async (rawText: string, options?: { isSuggestion?: boolean }) => {
      const text = rawText.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!text || sending) return; // duplicate-send guard

      const myGeneration = generationRef.current;
      setMessages((prev) => [...prev, { id: `u-${Date.now()}-${prev.length}`, role: "user", text }]);
      setSending(true);
      logEvent("MESSAGE_SUBMITTED", sessionId, options?.isSuggestion ? { source: "suggested_question" } : { source: "composer" });

      try {
        let sid = await ensureSession();
        if (!sid) {
          if (myGeneration !== generationRef.current) return;
          setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "error", text: "We couldn't start a session. Please try again.", retryText: text }]);
          logEvent("RESPONSE_FAILED", sessionId, { reason: "NO_SESSION" });
          return;
        }

        const requestStart = performance.now();
        let result = await withTimeout(orchestrateExperience({ sessionId: sid, customerMessage: text }), RESPONSE_TIMEOUT_MS);

        if (!result.success && result.error.code === "SESSION_INACTIVE") {
          if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_STORAGE_KEY);
          setSessionId(null);
          sid = await ensureSession();
          if (sid) {
            result = await withTimeout(orchestrateExperience({ sessionId: sid, customerMessage: text }), RESPONSE_TIMEOUT_MS);
          }
        }
        const durationMs = performance.now() - requestStart;

        // Stale-response guard: a reset happened while this request was in
        // flight — discard the result silently rather than appending it to
        // a conversation the customer already cleared.
        if (myGeneration !== generationRef.current) return;

        if (!result.success) {
          const friendly =
            result.error.code === "RATE_LIMITED"
              ? "You're sending messages a little quickly — please wait a moment and try again."
              : "Something went wrong on our end. Please try again.";
          setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "error", text: friendly, retryText: text }]);
          logEvent("RESPONSE_FAILED", sid, { code: result.error.code });
          return;
        }

        const view = result.data.view;
        setAllowFollowUp(view.allowFollowUp);
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            segments: view.segments,
            executionStatus: view.executionStatus,
            generatedAt: view.generatedAt,
            requiresHandoff: view.requiresHandoff,
            durationMs,
          },
        ]);
        logEvent("RESPONSE_COMPLETED", sid, { executionStatus: view.executionStatus });
        if (view.requiresHandoff) logEvent("ESCALATION_OFFERED", sid);
      } catch (err) {
        if (myGeneration !== generationRef.current) return;
        const isTimeout = err instanceof Error && err.message === "MUV_AI_TIMEOUT";
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "error",
            text: isTimeout
              ? "This is taking longer than expected. Please try again."
              : "We couldn't reach Muv AI. Please check your connection and try again.",
            retryText: text,
          },
        ]);
        logEvent("RESPONSE_FAILED", sessionId, { reason: isTimeout ? "TIMEOUT" : "NETWORK" });
      } finally {
        if (myGeneration === generationRef.current) setSending(false);
      }
    },
    [sending, ensureSession, sessionId]
  );

  const retry = useCallback((text: string) => {
    logEvent("RETRY_USED", sessionId);
    void send(text);
  }, [send, sessionId]);

  const selectSuggestedQuestion = useCallback((text: string) => {
    logEvent("SUGGESTED_QUESTION_SELECTED", sessionId, { text });
    void send(text, { isSuggestion: true });
  }, [send, sessionId]);

  /** "Creates a fresh authoritative session. Clears only the relevant
   * client-side state. Does not delete audit records. Does not mutate
   * previous decisions." — a brand-new session is started (never reusing
   * the old id), and the generation counter is bumped so any in-flight
   * response from the old conversation is discarded on arrival. */
  const resetConversation = useCallback(async () => {
    generationRef.current += 1;
    logEvent("CONVERSATION_RESET", sessionId);
    if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionId(null);
    setMessages([]);
    setFeedbackByTurn({});
    setDiagnosticsByTurn({});
    setAllowFollowUp(true);
    setSending(false);
    setResetConfirmOpen(false);
    await ensureSession();
  }, [ensureSession, sessionId]);

  const submitFeedback = useCallback(
    async (turnReference: string, helpful: boolean) => {
      if (!sessionId) return;
      const current = feedbackByTurn[turnReference];
      if (current === "submitting") return; // duplicate-submission guard
      setFeedbackByTurn((prev) => ({ ...prev, [turnReference]: "submitting" }));
      try {
        const result = await submitMuvAiFeedback({ sessionId, turnReference, helpful });
        if (result.success) {
          setFeedbackByTurn((prev) => ({ ...prev, [turnReference]: helpful ? "helpful" : "not-helpful" }));
          logEvent("FEEDBACK_SUBMITTED", sessionId, { turnReference, helpful });
        } else {
          setFeedbackByTurn((prev) => ({ ...prev, [turnReference]: "idle" }));
        }
      } catch {
        // Feedback failure must never disrupt the chat itself.
        setFeedbackByTurn((prev) => ({ ...prev, [turnReference]: "idle" }));
      }
    },
    [sessionId, feedbackByTurn]
  );

  const openHandoff = useCallback(() => {
    setHandoffOpen(true);
    setHandoffResult(null);
    if (!supportContact) {
      void getMuvAiSupportContact().then((res) => {
        if (res.success) setSupportContact(res.data);
      });
    }
  }, [supportContact]);

  const closeHandoff = useCallback(() => setHandoffOpen(false), []);

  const submitHandoff = useCallback(
    async (fields: { contactEmail?: string; contactPhone?: string; message?: string }) => {
      if (!sessionId) {
        setHandoffResult("error");
        return;
      }
      setHandoffSubmitting(true);
      try {
        const result = await requestMuvAiHandoff({ sessionId, ...fields });
        // Truthful only — never claim success unless persisted.
        setHandoffResult(result.success ? "success" : "error");
        logEvent(result.success ? "HANDOFF_COMPLETED" : "HANDOFF_FAILED", sessionId);
      } catch {
        setHandoffResult("error");
        logEvent("HANDOFF_FAILED", sessionId);
      } finally {
        setHandoffSubmitting(false);
      }
    },
    [sessionId]
  );

  const fetchDiagnostics = useCallback(
    async (message: Extract<ChatMessage, { role: "assistant" }>) => {
      if (!sessionId || !diagnosticsAuthorized) return;
      const key = message.generatedAt;
      if (diagnosticsByTurn[key]) return;
      setDiagnosticsByTurn((prev) => ({ ...prev, [key]: "loading" }));
      const result = await getMuvAiTurnDiagnostics({
        sessionId,
        executionStatus: message.executionStatus,
        requiresHandoff: message.requiresHandoff,
        allowFollowUp,
        segmentKinds: message.segments.map((s) => s.kind),
        durationMs: message.durationMs,
        generatedAt: message.generatedAt,
      });
      setDiagnosticsByTurn((prev) => ({ ...prev, [key]: result.success ? result.data.snapshot : null }));
    },
    [sessionId, diagnosticsAuthorized, allowFollowUp, diagnosticsByTurn]
  );

  // Context-aware suggestions — "never random." The context signal is a
  // deterministic read of the last assistant turn already in `messages`
  // (does the most recent response include a resolved product reference?),
  // never a new AI decision or extra request.
  const lastAssistantMessage = [...messages].reverse().find((m): m is Extract<ChatMessage, { role: "assistant" }> => m.role === "assistant");
  const lastTurnHasProduct = lastAssistantMessage?.segments.some(
    (s) => s.kind === "REFERENCE_CARD" && (s.meta?.referenceType === "PRODUCT" || s.meta?.referenceType === "PRODUCT_INTELLIGENCE")
  ) ?? false;
  // Stabilization fix: the assistant's own turn already ends with a
  // specific clarifying question (Module 8's FOLLOW_UP_QUESTION segment)
  // for ASK_FOLLOW_UP_QUESTION/COLLECT_INFORMATION outcomes — showing the
  // generic "Home Care / Body Care / Customer Support" chip set
  // underneath it competes with, rather than helps answer, that specific
  // question. Suppressed only for that one case; every other outcome
  // keeps its existing suggestion set.
  const lastTurnAskedFollowUp = lastAssistantMessage?.segments.some((s) => s.kind === "FOLLOW_UP_QUESTION") ?? false;

  const suggestedQuestions: SuggestedQuestion[] =
    messages.length === 0
      ? MUV_AI_SUGGESTED_QUESTIONS
      : lastTurnHasProduct
        ? MUV_AI_FOLLOW_UP_WITH_PRODUCT
        : MUV_AI_FOLLOW_UP_DEFAULT;

  return {
    open, openChat, closeChat,
    expanded, toggleExpanded, sidebarOpen, toggleSidebar, setSidebarOpen,
    messages, send, sending, startingSession, allowFollowUp,
    retry,
    showSuggestions: messages.length === 0 || (allowFollowUp && !lastTurnAskedFollowUp),
    suggestedQuestions,
    selectSuggestedQuestion,
    resetConfirmOpen, setResetConfirmOpen, resetConversation,
    feedbackByTurn, submitFeedback,
    handoffOpen, openHandoff, closeHandoff, handoffSubmitting, handoffResult, supportContact, submitHandoff,
    diagnosticsAuthorized, diagnosticsByTurn, fetchDiagnostics,
  };
}
