# MUV Car Wash™ — Safety

> First package where this file is structurally transformed by `FR-006`: five fields (Safety,
> Contraindications, First Aid, Storage, Shelf Life — Usage lives in `03_Product_Intelligence.md`
> KO-CW-INTEL-003) are referenced via the CMS pattern rather than authored inline. The source SOP
> has zero safety content of any kind (same pattern as every prior MUV SOP), but that absence is
> now the expected, `FR-006`-governed state for this package, not a gap requiring field-by-field
> `Unknown` documentation.

---

## KO-CW-SAFETY-001 — Safety

```
Source: Website Product Master
Authority: CMS
Retrieval: Runtime
Status: Single Source of Truth
```

---

## KO-CW-SAFETY-002 — Contraindications

```
Source: Website Product Master
Authority: CMS
Retrieval: Runtime
Status: Single Source of Truth
```

---

## KO-CW-SAFETY-003 — First Aid (eye contact, skin contact, ingestion)

```
Source: Website Product Master
Authority: CMS
Retrieval: Runtime
Status: Single Source of Truth
```

---

## KO-CW-SAFETY-004 — Storage Conditions

```
Source: Website Product Master
Authority: CMS
Retrieval: Runtime
Status: Single Source of Truth
```

---

## KO-CW-SAFETY-005 — Shelf Life

```
Source: Website Product Master
Authority: CMS
Retrieval: Runtime
Status: Single Source of Truth
```

---

## KO-CW-SAFETY-006 — Emergency Guidance (AI behavior, not medical content)

- **Confidence:** HIGH — a behavioral rule, not delegated CMS content
- **Evidence:** `lib/eios/cognitive-state.ts`
- **Reused pattern:** behavioral rule reused from every prior package's own emergency-guidance KO
  (Pure Bleach → Black Phenyl → White Phenyl → Body Wash → Hand Wash)

**Content:** For any real reported irritation, eye contact, or ingestion incident, the AI: (1)
takes the report seriously and responds immediately, (2) directs the person to discontinue use
and rinse where relevant, as universally-known, non-prescriptive first response, (3) directs them
to seek professional medical help, and (4) escalates to a human within MUV. This behavioral rule
is not delegated to the CMS — it is a real, code-grounded AI response discipline that applies
regardless of what the CMS eventually contains.

---

## KO-CW-SAFETY-007 — Claims Validation Cross-Reference

- **Confidence:** HIGH — accurate pointer

**Content:** See `03_Product_Intelligence.md` KO-CW-INTEL-008 — no wax, gloss-lock, paint-safe, or
scratch-free claim is sourced for this product, regardless of what safety/CMS content is
eventually populated. Claims Validation is governed separately from the six `FR-006` fields; it
is ordinary Knowledge Factory content, not delegated to the CMS.

---

## Real, disclosed limitation (not to be papered over)

Per `ARCHITECTURE.md` §5.3 and `FOUNDER_RULES.md` FR-006: the CMS source
(`ProductIntelligence`/`ProductIntelligenceVersion`) referenced by KO-CW-SAFETY-001 through 005 is
**not yet populated for this product, or for any MUV product**. The reference pattern above is
architecturally correct and mandatory; it does not itself supply Safety, Contraindications, First
Aid, Storage, or Shelf Life content. This is recorded plainly here and in `14_FOUNDER_GAPS.md`
rather than left implicit.
