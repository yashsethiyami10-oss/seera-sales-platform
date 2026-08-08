# MUV Car Wash™ — Customer Conversation Flows

> All 12 required flows. Truth → Safety → Care → Clarity → Actionability → Validation throughout.

---

## KO-CW-CONV-001 — General Product Inquiry

**Content:** Describe accurately: a liquid exterior vehicle wash, one formula, two pack sizes
(500ml, 5L). Never claim a positioning beyond what's sourced (KO-CW-INTEL-001).

## KO-CW-CONV-002 — Pack Size Selection

**Content:** Apply KO-CW-DT-002 — both sizes always available, no restriction to navigate.

## KO-CW-CONV-003 — Price Inquiry

**Content:** Never state a figure from this package. Redirect to live pricing via
`10_LIVE_DATA_MAPPING.md`.

## KO-CW-CONV-004 — Usage Instructions Inquiry

**Content:** Per KO-CW-INTEL-003, referenced via the `FR-006` CMS pattern
(`ProductIntelligence`). If that source is not yet populated, state honestly that usage
directions aren't confirmed yet rather than inventing a dilution ratio or application method.

## KO-CW-CONV-005 — Ingredient Inquiry

**Content:** Share the sourced raw-material list (KO-CW-INTEL-004), framed as manufacturing
composition, not a certified consumer label.

## KO-CW-CONV-006 — Safety Inquiry

**Content:** Referenced via the `FR-006` CMS pattern (`08_Safety.md`). If unpopulated, state
honestly rather than inventing PPE or handling guidance.

## KO-CW-CONV-007 — Compatibility Inquiry

**Content:** Customer asks if it's safe on matte finishes, wraps, chrome, or plastic trim — per
KO-CW-INTEL-009, **Unknown**. State honestly; never assume compatibility to be helpful.

## KO-CW-CONV-008 — Claims Inquiry (wax / gloss-lock / paint protection)

**Content:** Customer asks "does this wax my car?" or "is this gloss-lock like MUV Shield?" —
**highest-risk flow in this package.** Per KO-CW-INTEL-008, no wax ingredient exists in the
sourced formula. Never confirm a wax, gloss-lock, or long-term paint-protection claim. May
honestly describe the sourced QC result (clear glossy liquid, smooth finish on vehicle) without
extending it into an unsourced protective claim.

## KO-CW-CONV-009 — Comparison Request (vs. MUV Shield)

**Content:** Customer asks if this is the same as "MUV Shield" — **no**, per
`00_Source_Register.md` §3: different name, ~10× different price, different pack-size lineup,
different (unsourced) claims. State this clearly and factually, without editorializing about
which is "better."

## KO-CW-CONV-010 — Complaint / Quality Issue

**Content:** Take any report seriously (e.g. poor foam, separation, streaking) — do not diagnose
a cause beyond what QC criteria describe, escalate per KO-CW-SAFETY-006.

## KO-CW-CONV-011 — Storage / Shelf Life Inquiry

**Content:** Referenced via the `FR-006` CMS pattern. If unpopulated, state honestly rather than
offering an unsourced generic shelf-life estimate.

## KO-CW-CONV-012 — Institutional / Bulk Use Inquiry

**Content:** Customer identifies as a car wash business (a real, tracked `BUSINESS_TYPES` value)
asking about bulk pricing/consumption — honestly disclose that no institutional
consumption-estimation category exists yet for this product (`00_Source_Register.md` §6), rather
than inventing a placeholder rate the way `HAND_WASH`/`FLOOR_CLEANER` etc. already have.
