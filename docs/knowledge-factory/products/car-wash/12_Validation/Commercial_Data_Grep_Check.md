# MUV Car Wash™ — Commercial Data Grep Check

> Real, executed verification — `Grep` (via PowerShell `Select-String`) run for `₹` across every
> `.md` and `.json` file in `docs/knowledge-factory/products/car-wash/`, excluding the two
> sanctioned locations (`00_Source_Register.md` and `10_LIVE_DATA_MAPPING.md`).

## Result (2026-07-31)

**Not clean on the first pass — 2 leaks found and corrected, in `README.md`'s headline findings
(points 2 and 4), which restated the Chart/SOP pack-size pricing and the MUV Shield price
comparison in prose.** Fixed by replacing the bare figures with pointers to
`00_Source_Register.md` §1–§3. This is the same recurring leak category found in Pure Bleach,
Black Phenyl, White Phenyl, and Hand Wash's own README/headline-findings sections — confirming
this specific location (README headline findings, when they narrate a pricing comparison) needs
the abstract-reference discipline applied from the first draft, not just the more obviously
commercial files.

After correction, a second full-folder scan (excluding the two sanctioned locations) confirms
**zero remaining hits.**

**All real price figures (Chart rows 18–19; SOP Packing Standard table; the MUV Shield
comparison figures) are confined to exactly two locations:**

| File | Status |
|---|---|
| `00_Source_Register.md` | ✅ Designated primary historical citation |
| `10_LIVE_DATA_MAPPING.md` | ✅ Designated secondary citation location |

**Zero hits in any customer-facing file, any AI-instruction file, or any JSON export.**

**Verdict: PASS, after correction.**
