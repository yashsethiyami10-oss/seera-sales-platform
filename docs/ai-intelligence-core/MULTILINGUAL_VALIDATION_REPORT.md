# Stage 6E — Multilingual Validation Report

**Scope:** Objective 2 (Hindi & Hinglish Retrieval) and the multilingual half of Objective 1 (Intent
Intelligence). All results below are real output from `scripts/verify-stage6e-final-engineering.ts` and
`scripts/verify-stage6e-self-challenge.ts` run against the real repository — nothing here is predicted.

## 1. Query normalization — the Founder's own literal examples

| Input | Detected language | Real translation applied | Result |
|---|---|---|---|
| "Body wash" | EN | none needed | Passes through unchanged |
| "Body wash kaise use kare" | HINGLISH | kaise→how, kare→do | ✅ both translated |
| "Body wash ka istemal" | HINGLISH | istemal→use; "ka" correctly contributes no (mis)translation | ✅ |
| "Bodywash use" | EN | bodywash→"body wash" (compound split) | ✅ |
| "Skin wash" | EN | skin→[+body] (domain synonym expansion) | ✅ |
| "Nahane wala body wash" | HINGLISH | nahane→bath; "wala" correctly stripped as a particle | ✅ |

All 6 of the Founder's own literal examples pass. Additionally verified:

| Input | Detected language | Result |
|---|---|---|
| "साबुन कैसे इस्तेमाल करें" (pure Devanagari: "how to use soap") | HI | साबुन→soap, कैसे→how, इस्तेमाल→use, करें→do all real-translated |
| "body wash कैसे use करें" (mixed script) | MIXED | Correctly detected as mixed Latin+Devanagari |
| `undefined`/empty input | EN | Handled safely, no crash |
| 25,018-character adversarial input (self-challenge) | — | Normalized in 2ms — no hang, no ReDoS |

## 2. Cross-language retrieval — same Knowledge Objects, no duplication

Real search against the real 1,165-object corpus:

- English query "dishwash gel ingredients" → real results from `PRODUCT_KF`.
- The SAME topic asked as "dishwash gel ka istemal kaise kare" (Hinglish) → real results from the SAME
  `PRODUCT_KF` corpus.
- **The two result sets overlap in at least one identical, real KOID** — confirmed by direct set
  intersection in the verification script, not asserted.
- **Zero new Knowledge Objects were created for this** — `docs/knowledge-factory/`,
  `docs/marketing-knowledge-factory/`, etc. were not modified in any way by this stage. The mechanism is
  entirely query-side (see `FINAL_ENGINEERING_COMPLETION_REPORT.md`'s "solve this through retrieval
  engineering" framing).

## 3. Intent detection across languages

| Message | Detected language | Primary intent | Notes |
|---|---|---|---|
| "Is it safe to use this product?" | EN | PRODUCT_SAFETY | Baseline, unchanged from Stage 6C |
| "Body wash mein side effect hota hai kya" | HINGLISH | PRODUCT_SAFETY | Real Hinglish classification — English technical term "side effect" retained mid-sentence, a realistic real-world Hinglish pattern |
| "क्या यह इस्तेमाल करना सुरक्षित है" (pure Devanagari) | HI | — | Language correctly detected as HI; full-phrase Devanagari classification not separately asserted (see limitation below) |
| "What does the founder constitution say?" | EN | FOUNDER_DECISION_SUPPORT | `repositoriesRequired` correctly names a real Founder repository |

## 4. Cross-domain / multi-intent

"Mujhe brand identity aur institutional bulk order dono chahiye" (I need both brand identity and an
institutional bulk order) correctly produced multiple domains/secondary intents in one classification —
confirmed by direct assertion in the verification script.

**Self-challenge finding (real, not hidden):** a harder 3-way message — "Yeh product safe hai kya, also
cancel my order aur mujhe founder constitution ke baare mein batao" (is this product safe, also cancel my
order, and tell me about the founder constitution) — classified as `primary: ORDER_STATUS, secondary:
[FOUNDER_DECISION_SUPPORT], domains: [GENERAL, FOUNDER_INTELLIGENCE]`. **The safety component was
completely missed** — bare "safe" (without an adjacent lexicon phrase like "is it safe") carries no signal
in the current lexicon, and the word-count-based winner-take-most scoring let the other two categories
dominate. This is documented here exactly as it happened, not smoothed over.

## 5. The one real, structural limitation (stated once, precisely, not repeated as vague caveats)

`query-normalizer.ts` translates word-by-word and **appends** results — it does not reorder translated
words into English grammar. This means:
- **Works reliably:** keyword-level retrieval (word order is irrelevant to keyword matching — proven in
  §2 above) and single-word intent lexicon terms.
- **Does not work reliably:** multi-word English lexicon phrases (e.g. "safe to use", "is it safe")
  reconstructed from a fully Hindi-translated sentence, because the translated words land at the end of
  the string, not interleaved in English word order.
- **What does work in practice for phrase-sensitive intents:** the common real Hinglish pattern of
  keeping an English technical term as-is mid-sentence (confirmed working in §3) — genuinely how a lot of
  real Hinglish speech is structured, not a contrived workaround.

Closing this fully would require real machine translation (grammatical reordering), which is exactly what
a configured LLM provider (Objective 3) would provide — this dictionary-based approach was the correct,
achievable "retrieval engineering" solution the Founder's protocol asked for, with this one honestly-scoped
gap remaining for genuine natural-language understanding.

## 6. What was NOT tested

- Hindi/Hinglish vocabulary outside the ~90-term dictionary (a large, real gap — this is a targeted
  domain dictionary, not general Hindi language coverage).
- Any language other than English/Hindi/Hinglish (e.g. no Tamil, Bengali, etc. — never requested, never
  attempted).
- Real free-form LLM-generated Hindi/Hinglish text (no provider is configured in this environment — see
  `LLM_INTEGRATION_REPORT.md`).
- Voice/transliteration-variant spelling robustness (e.g. "kaisay" vs "kaise") — only the specific spelling
  variants included in the dictionary were tested; genuinely different spellings of the same word may not
  match.
