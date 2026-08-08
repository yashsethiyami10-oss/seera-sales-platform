# MUV Body Wash™ — Product Knowledge Package

> Product Family 10 of the MUV Product Knowledge Factory™. First package built under `FR-004`
> (Variant Inheritance Architecture) and the first **Body Care** category product this session —
> every prior product was a household/fabric cleaning chemical. This category shift brings a new
> risk class (direct, sustained skin contact) and a new invention risk (cosmetic/dermatological
> claims), both handled with heightened discipline throughout this package.

---

## Governing documents (authoritative, and the only ones — per Founder Instruction)

- `docs/knowledge-factory/CONSTITUTION.md`
- `docs/knowledge-factory/ARCHITECTURE.md`
- `docs/knowledge-factory/VALIDATION_RULES.md`
- `docs/knowledge-factory/FOUNDER_RULES.md` (see `FR-001`, `FR-002`, `FR-003`, `FR-004`)

## Package structure

Same structure as Black Phenyl/White Phenyl (`README.md`/`00`–`09`/`10_LIVE_DATA_MAPPING`/
`14_FOUNDER_GAPS`/`11_JSON`/`12_Validation`/`13_Reports`/`MASTER_*.md`). The Variant Inheritance
Map required by `FR-004` is embedded as a dedicated section within `02_Product_Architecture.md`
(this task's file list does not name a standalone Variant Inheritance Map file, unlike Floor
Cleaner's `17_Variant_Inheritance_Map.md` — no new file was invented beyond what was specified).

## KOID prefix

`KO-BW-` (Parent), with `-CV-` (Crimson Veil), `-VO-` (Velvet Oak), `-MF-` (Midnight Frost)
variant infixes — same convention as Floor Cleaner's `-VM-`/`-CW-`/`-RW-`.

## Product identity — three variants, fully and symmetrically sourced

Unlike Floor Cleaner's Rose Water (named but zero corroborating source), **all three named
variants — Crimson Veil, Velvet Oak, Midnight Frost — are fully sourced**, each with its own two
Product Chart rows (250ml, 950ml) and a named fragrance-family label in the shared Production
SOP's Variant Matrix. See `00_Source_Register.md`.

## A real, newly-discovered conflict — flagged up front

`prisma/seed.ts` contains a pre-existing placeholder product, **"MUV Cleanse,"** that is
**not** one of the three real, chart/SOP-sourced variants — different name, different fragrance
("Citrus, Bergamot"), different pack sizes (250ml/500ml vs. the real 250ml/950ml), different
pricing, and marketing claims ("never strips the skin," "deep-cleanses pores without over-
drying") not present in any authoritative source. This package never uses "MUV Cleanse" as a
source for Crimson Veil, Velvet Oak, or Midnight Frost. See `00_Source_Register.md` and
`14_FOUNDER_GAPS.md`.

## Cosmetic/dermatological claim discipline

No source states any cosmetic or dermatological claim ("sensitive skin," "dermatologically
tested," "pH balanced," "hypoallergenic," "moisturizing") for this product. The Knowledge
Library itself contains a real, sourced governance rule explicitly forbidding unsupported "safe,"
"non-toxic," "chemical-free," or "dermatologically tested" claims — this package follows that
rule strictly throughout. The SOP's real pH 4.5–5.0 figure is an internal manufacturing/QC
specification, never converted into a "pH balanced" marketing claim.

## Safety finding — the most severe gap of any product this session

**This SOP contains zero safety content of any kind** — no PPE, no mixing restriction, no
ventilation instruction, nothing. This is a more severe gap than every one of the nine prior
products, all of which had at least some sourced safety text. See `08_Safety.md` and
`14_FOUNDER_GAPS.md`.

## Stop Rule

Per the Founder's explicit instruction: after this package is complete, **STOP**. Do not begin
MUV Hand Wash™ or any other Product Family without explicit Founder approval.
