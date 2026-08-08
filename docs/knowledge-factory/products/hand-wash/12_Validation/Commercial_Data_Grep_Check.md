# MUV Hand Wash™ — Commercial Data Grep Check

> Real, executed verification — `Grep` (via PowerShell `Select-String`) run for `₹` across every
> `.md` and `.json` file in `docs/knowledge-factory/products/hand-wash/`, excluding the two
> sanctioned locations (`00_Source_Register.md` and `10_LIVE_DATA_MAPPING.md`'s own historical/
> institutional citation sections).

## Result (2026-07-31)

**Not clean on the first pass — five leaks found and corrected during this package's own
validation, the same recurring pattern found in Pure Bleach, Black Phenyl, and White Phenyl (and
avoided by Body Wash only because it had no institutional consumption category or Chart-conflict
prose to leak from).** Found and fixed:

| File | Leak | Fix |
|---|---|---|
| `02_Product_Architecture.md` (KO-HW-AVAIL-001) | Restated the Chart's Citrus Blast 5L price (₹650) in prose | Replaced with a pointer to `00_Source_Register.md` §1 |
| `04_Decision_Trees.md` (KO-HW-DT-001) | Restated the institutional placeholder rate (₹160/Ltr) in prose | Replaced with a pointer to `10_LIVE_DATA_MAPPING.md` |
| `14_FOUNDER_GAPS.md` (gap 17) | Same institutional placeholder rate restated | Removed the figure, kept the finding |
| `README.md` (headline findings, 2 places) | Restated both the Chart conflict price and the SOP's flat per-pack-size prices | Replaced with pointers / generic description |
| `11_JSON/variant_availability.json` | Restated the Chart's Citrus Blast 5L price in an inline note | Replaced with a pointer to `source_register.json` |

After correction, a second full-folder scan (excluding the two sanctioned locations) confirms
**zero remaining hits.**

**All real price figures (Chart rows 24–31; SOP §1's generic pack-size table; the institutional
₹160/Ltr placeholder) are confined to exactly two locations, matching the established pattern:**

| File | Status |
|---|---|
| `00_Source_Register.md` (the Chart-row table, SOP pricing table, and §6 institutional-rules quote) | ✅ Designated primary historical citation |
| `10_LIVE_DATA_MAPPING.md` (Historical source citations + Institutional/placeholder pricing note sections) | ✅ Designated secondary citation location, per established pattern |

**Zero hits in any customer-facing file, any AI-instruction file, or any other JSON export.**

**Verdict: PASS, after correction.** Process note: unlike Body Wash (which was clean on the first
pass because it had neither an institutional consumption category nor a Chart-vs-Founder
availability conflict to narrate), this package reintroduced the leak risk precisely because two
new content types — the Variant Availability conflict narrative and the institutional-pricing
reference — created new places for a figure to slip into prose. The lesson carried forward:
**every new content category this package structure grows (not just the established ones) needs
the same abstract-reference discipline applied to it, not just the previously-known leak points.**
