# MUV Hand Wash™ — Customer Conversation Flows

> All 12 required flows. Every flow follows Care Intelligence sequence: Truth → Safety → Care →
> Clarity → Actionability → Validation. Two flows (KO-HW-CONV-005, KO-HW-CONV-008) are new
> categories introduced specifically for this package's asymmetric availability and the Life
> Shield antibacterial-claim risk.

---

## KO-HW-CONV-001 — General Product Inquiry

**Content:** Customer asks "what is MUV Hand Wash?" → describe accurately: a pearlescent liquid
hand wash, four variants (Silk Blossom, Ocean Fresh, Citrus Blast, Life Shield), each a different
colour, formula and process identical across all four. Never claim a positioning or benefit
beyond what's sourced (KO-HW-INTEL-001).

## KO-HW-CONV-002 — Pack Size Selection

**Content:** Customer asks about pack sizes → apply KO-HW-DT-002 exactly. State only the real
combinations; never mention a non-existent combination even to say it's unavailable, unless the
customer specifically asks about it (in which case, route to KO-HW-CONV-005).

## KO-HW-CONV-003 — Fragrance / Variant Selection

**Content:** Customer unsure which variant to choose → apply KO-HW-DT-003, offer colour/name-based
guidance only, never invented scent-note language.

## KO-HW-CONV-004 — Price Inquiry

**Content:** Customer asks the price → never state a figure from this package. Redirect to live
pricing via `10_LIVE_DATA_MAPPING.md`'s resolution path (`ProductVariant.price`/`mrp`). This
package's own Product Chart/SOP figures are historical citations only, never quoted to customers.

## KO-HW-CONV-005 — Availability Inquiry (new flow, specific to this package)

**Content:** Customer asks for a combination KO-HW-AVAIL-001 marks as not real (e.g. "Silk
Blossom in 250ml," "Life Shield in 5L") → **Truth first:** state honestly that this specific
combination is not offered — this is not a stock-outage and should never be phrased as "currently
out of stock" or "temporarily unavailable" (both would misleadingly imply it might return). Offer
the real alternatives for that variant instead (per KO-HW-AVAIL-001). Never apologize as if this
were a defect in service.

## KO-HW-CONV-006 — Ingredient Inquiry

**Content:** Customer asks what's inside → share the sourced raw-material list
(KO-HW-INTEL-004), clearly framed as manufacturing composition, not a certified consumer label.
State plainly that a consumer-facing INCI ingredient list is not yet confirmed
(KO-HW-INTEL-011) — never present the raw-material table as an official ingredient label.

## KO-HW-CONV-007 — Safety / Skin-Sensitivity Inquiry

**Content:** Customer asks if it's safe for sensitive skin → **the highest-caution flow in this
package alongside KO-HW-CONV-008.** No skin-type suitability data is sourced (KO-HW-INTEL-010).
Respond honestly: this specific information isn't available yet, avoid product use if any
sensitivity is known or suspected, and consult a healthcare professional for a personal
recommendation. Never state or imply "safe for sensitive skin," "dermatologically tested," or
"gentle" — the real, sourced Knowledge Library governance rule (line 12614) forbids this
explicitly, and `FR-005` extends the same discipline with the word "skin-safe" named directly.

## KO-HW-CONV-008 — Antibacterial / Protective Claim Inquiry (new flow, Life Shield-specific)

**Content:** Customer asks "does Life Shield kill germs?" or "is Life Shield antibacterial?" —
**the single highest-risk conversation in this package, explicitly anticipated by `FR-005`.**
Respond honestly: MUV has not published or sourced an antibacterial or germ-protection claim for
Life Shield; the name should not be read as a confirmed claim. Never confirm, imply, hedge toward
"yes," or use language like "helps protect" or "designed to shield against germs" — any of these
would constitute inventing an antibacterial claim. If the customer needs antibacterial-specific
protection, be honest that MUV Hand Wash™ does not currently have a sourced antibacterial claim
for any variant, rather than guessing which one might qualify.

## KO-HW-CONV-009 — Usage Instructions Inquiry

**Content:** Customer asks how to use it → per KO-HW-INTEL-003, no MUV-specific usage instruction
is sourced. May offer universally-known, non-product-specific practice (wet hands, apply, lather,
rinse) clearly labeled as general guidance, never presented as MUV-confirmed instructions.

## KO-HW-CONV-010 — Comparison Request

**Content:** Customer asks how the four variants differ → apply KO-HW-DT-COMPARE-001. State only
colour, name, and real availability — never invent a functional or performance differentiator.

## KO-HW-CONV-011 — Complaint / Quality Issue

**Content:** Customer reports an issue (irritation, separation, off appearance) → take the report
seriously, do not diagnose, do not offer a home remedy, direct to discontinue use if
irritation-related, escalate per `08_Safety.md` KO-HW-SAFETY-011 (reused emergency behavioral
rule).

## KO-HW-CONV-012 — Shelf Life / Storage Inquiry

**Content:** Customer asks how long it lasts or how to store it → per `08_Safety.md`
KO-HW-SAFETY-007/008, both are `Unknown — Founder Decision Required`. State honestly that this
specific information isn't confirmed yet rather than offering a generic guess (e.g. "store in a
cool, dry place, use within 24 months" is common industry practice but is never presented here as
a MUV-confirmed fact without sourcing).
