# Known Limitations

## No admin UI
Same gap as Modules 1–3. All 10 actions have no human-usable caller — verified by direct script, not a
real form.

## No per-child-section granular editing
Because this module's action list has no `addCareX`/`updateCareX`-per-row functions,
`requiredInformation`/`careActions`/`evidenceSources` can only be edited as a **full array replacement**
through `updateCareIntelligence` — there is no way to edit or remove a single care-action row without
resending the entire array for that version. This is a direct, disclosed consequence of the module's own
10-action scope (see `architecture.md`), not an oversight — but it is a real ergonomic limitation
whoever eventually builds the admin UI (or an AI-assisted authoring tool) on top of this will need to
work around, most likely by having the UI itself track the full current array client-side and always
submit the complete set.

## RBAC branch logic not live-tested
Every `STAFF`/`ADMIN` gate is implemented and type-checked but not exercised against a real
authenticated session — no test runner exists in this repository to script that. Same disclosed
limitation as Modules 1–3.

## No database-level "one published version" constraint
Enforced by a `$transaction` in `publishCareIntelligence`, not a partial-unique index — same limitation
as every prior module, for the same reason (Prisma's schema DSL has no partial-index syntax; this
project uses `db push`, not hand-written migrations).

## Institutional Sales support is structural, not operational
This module's Institutional Sales Requirement asks CIF to be "capable of storing structured care
workflows for B2B customers including lead qualification, sample request, quotation support,
negotiation guidance, follow-up process, complaint resolution, contract support, account management."
This is satisfied by the existing extensible `category` and `applicableCustomerSegments` free-text
fields — a CIF item with `category: "Quotation Support"` and
`applicableCustomerSegments: ["Distributor", "Hotel"]` is fully representable today. What this module
does **not** do: validate that a workflow tagged as institutional-sales-relevant actually has the fields
an institutional sales AI would eventually need (e.g. no dedicated "minimum order quantity" or "credit
terms" field exists) — those are domain specifics this module's spec didn't itemize, and inventing them
would have been exactly the kind of unrequested schema expansion this project's rules warn against. If
future Institutional Sales AI needs fields beyond what generic Care Actions/Required Information can
express, that's new schema for a future module, not a gap in this one.

## `category`/`applicableCustomerSegments` have no fixed vocabulary
Same reasoning as Module 3's `problemCategory` — free text because the spec explicitly requires new
values without a schema change, and gives example lists, not closed ones.

## Cross-module relation fetches are shallow
`relatedProductIntelligence`/`relatedProblemIntelligence`/`relatedKnowledgeItems` store only the
relation itself (an id link); `getCareIntelligence`'s include selects a few identifying fields (e.g.
`ProductIntelligence`'s `productId`, not its full `sections` content) rather than deep-including the
related module's full record. This is intentional — CIF references those modules, it doesn't re-display
their full content — but worth noting for whoever builds a UI that wants to show "what this workflow
relates to" in full: that UI will need its own follow-up call into Module 2/3's own `get*` actions.

## Reviewed-by and published-by are always the same actor today
Same as Module 3 — both column-pairs exist, but this lifecycle only ever sets them together, at
`publishCareIntelligence`.
