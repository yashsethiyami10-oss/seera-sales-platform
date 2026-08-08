# MUV Body Wash™ — Commercial Data Grep Check

> Real, executed verification — `Grep` run for `₹` and the six real price figures individually
> across the entire `docs/knowledge-factory/products/body-wash/` folder.

## Result (2026-07-31)

**Clean on the first pass — no corrective edit required, unlike the previous three packages
(Pure Bleach, Black Phenyl, White Phenyl), each of which had a commercial-figure leak found and
fixed during validation.** All six real price figures (Chart rows 32–37: ₹149, ₹480, ₹135 ×2,
₹420 ×2) are confined to exactly one location:

| File | Status |
|---|---|
| `00_Source_Register.md` (the Chart-row table) | ✅ Designated primary historical citation |

Every other file that discusses pricing (`02_Product_Architecture.md`'s six SKU KOs,
`10_LIVE_DATA_MAPPING.md`, `07_Objection_Handling.md` KO-BW-OBJ-008) refers to it as "Commercial
data — never stored here" without restating any figure, from the first draft.

**The unrelated "MUV Cleanse" seed-data figures (₹299/₹499) are also confined to
`00_Source_Register.md`'s own conflict-documentation section** — appropriate, since they're part
of documenting a real data-integrity finding, not a live commercial fact about this Product
Family.

**Zero hits in any customer-facing file or any AI-instruction file.**

**Verdict: PASS**, with a positive process note: the discipline improvement flagged as a
recommendation in White Phenyl's own validation report (write commercial-figure references
abstractly from the start, rather than relying on a post-hoc catch) was successfully applied
here.
