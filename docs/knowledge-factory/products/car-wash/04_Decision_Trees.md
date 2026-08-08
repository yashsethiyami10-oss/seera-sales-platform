# MUV Car Wash™ — Decision Trees

> Lean set — no variant recommendation trees needed (single-variant product, `FR-004` Not
> Applicable). Three trees cover fit, pack size, and use-case boundaries.

---

## KO-CW-DT-001 — General Need / Purchase-Fit Tree

- **Confidence:** MEDIUM — structural logic reused from Pure Bleach's original single-SKU pattern
- **Evidence:** `02_Product_Architecture.md`

**Content:** Customer wants a vehicle exterior wash → confirm household vs. institutional use →
household: proceed to pack size (KO-CW-DT-002); institutional (a car wash business, per the real
`BUSINESS_TYPES` "Car Wash" segment): flag that no institutional consumption-estimation category
exists yet for this product (`00_Source_Register.md` §6) — do not invent a placeholder rate.

---

## KO-CW-DT-002 — Pack Size Selection Tree

- **Confidence:** HIGH — directly reflects the sourced, conflict-free matrix
- **Evidence:** `02_Product_Architecture.md` KO-CW-FAM-001

**Content:** Both 500ml and 5L are available with no restriction — unlike Hand Wash, there is no
asymmetric availability to navigate. Household/occasional use → 500ml. Frequent use or
institutional/bulk → 5L. No further branching; the formula is identical regardless of size.

---

## KO-CW-DT-003 — Use-Case Fit Tree

- **Confidence:** MEDIUM — fit criteria sourced (exterior vehicle wash); compatibility boundary
  is Unknown, not invented
- **Evidence:** `03_Product_Intelligence.md` KO-CW-INTEL-001, KO-CW-INTEL-009

**Content:** Confirmed fit: exterior vehicle washing, produces a clear glossy, foaming liquid with
a smooth-finish result per the SOP's own QC criteria. **Not confirmed:** compatibility with
specific surface types (matte finishes, vinyl wraps, chrome), or whether it is intended for
hand-wash (bucket/mitt) vs. pressure-washer application. Route any such question to
`05_Customer_Conversation.md` KO-CW-CONV-007 rather than assuming compatibility.
