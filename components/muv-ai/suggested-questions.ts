/**
 * MUV AI Experience v2.0 — centralized suggestion configuration. The one
 * place to edit these, per "easy to update from one centralized
 * configuration." Every entry is only a user-input shortcut: selecting one
 * submits its `text` through the exact same authoritative `send()` path as
 * anything the customer types themselves — nothing here is a precomputed
 * answer, and nothing here touches the AI pipeline.
 */
export type SuggestedQuestion = { id: string; text: string };

/** Shown in the empty state, before the conversation begins. */
export const MUV_AI_SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  { id: "help-choose", text: "Help me choose a product" },
  { id: "home-care", text: "Home Care" },
  { id: "body-care", text: "Body Care" },
  { id: "customer-support", text: "Customer Support" },
];

/**
 * Shown after the conversation begins, replacing the empty-state set.
 * "Context-aware. Never random." — the context signal is deterministic
 * and already available on the client (whether the most recent assistant
 * turn included a product reference), never a new AI decision: this is a
 * fixed lookup, the same pattern Module 8's own `CUSTOMER_MESSAGE_BY_ACTION`
 * table already established for turning a known signal into fixed copy.
 */
export const MUV_AI_FOLLOW_UP_WITH_PRODUCT: SuggestedQuestion[] = [
  { id: "compare-products", text: "Compare Products" },
  { id: "ingredients", text: "Ingredients" },
  { id: "directions", text: "Directions" },
  { id: "safety", text: "Safety" },
  { id: "similar-products", text: "Show Similar Products" },
];

export const MUV_AI_FOLLOW_UP_DEFAULT: SuggestedQuestion[] = [
  { id: "home-care-followup", text: "Home Care" },
  { id: "body-care-followup", text: "Body Care" },
  { id: "customer-support-followup", text: "Customer Support" },
];
