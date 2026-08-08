# MUV OS™ Manifest Architecture
## Phase 1 / Block 1.1 — Architecture Blueprint (no implementation)

**Status:** Architecture-only. No code, no TypeScript, no interfaces, no folders/files beyond this
document. Nothing here is implemented. This document defines what `registry/types.ts` and its
surrounding runtime will later have to be true to — it does not write any of it.

**Relationship to the previous deliverable:** [SPECIFICATION.md](./SPECIFICATION.md) (approved)
established the Shell's visual/layout architecture and named a "module manifest contract" as the
first thing to build. This document is that contract's *architecture* — the concepts, ownership
rules, and lifecycle it must express — one level below layout, one level above code.

---

## 1. Application Model

**What is an App?** The atomic unit of installable business capability MUV OS recognizes — the
same conceptual weight as an app on a phone home screen or a plugin in an IDE. Not a page, not a
route, not a feature: a self-contained capability with its own identity, its own data domain, and
its own manifest. Today, zero Apps exist — MUV OS Phase 1 is shell-only, by design. This model is
what a future "Sales" or "Warehouse" App would be built against.

**Responsibilities.** An App is responsible for, and solely for:
- Declaring its own manifest — the sum of §3 through §9 below.
- Owning its own data domain and server-side logic. MUV OS never touches an App's data directly.
- Rendering its own content into Shell-provided Workspace slots (per the Specification's §7).
- Declaring its own dependencies explicitly (see Dependencies, below) rather than assuming
  another App's internals are reachable.

**Lifecycle.** Seven states, each with a clear entry condition (expanded fully in §11, since the
same state machine also governs the manifest artifact itself, not just the App as a concept):
`Registered → Validated → Enabled → Active → Disabled → Deprecated → Removed`. An App can move
backward (`Active → Disabled`) without losing state, and `Removed` is explicitly not the same
decision as "delete the App's data" — those are separate, both must be explicit.

**Boundaries.** An App may not:
- Import another App's components, Server Actions, or database models directly.
- Register navigation, permissions, search entries, notifications, commands, or settings on
  behalf of another App.
- Assume MUV OS will introspect anything beyond its declared manifest — the manifest is the
  *entire* surface MUV OS is aware of. There is no side channel.

**Dependencies.** Apps declare dependencies on **capabilities**, not on other Apps by name — e.g.
"requires an AI context provider," "requires notification delivery" — never "requires the Sales
App." This is the mechanism that keeps Apps decoupled from each other's existence, not just their
implementation. In the rare case a genuine App-to-App dependency is unavoidable (a hypothetical
"Quotations" App needing "Pricing" App data), it must be declared as an explicit, versioned
dependency in the manifest, and MUV OS must be able to refuse that App's activation outright if the
dependency is missing or version-incompatible — never a silent runtime failure discovered by a user.

---

## 2. Module Model

**What is a Module?** The internal organizational and functional unit *within* an App. Where an
App answers "what gets installed, versioned, and permission-scoped as one unit," a Module answers
"what gets built and organized inside it." A hypothetical Sales App would have Leads, Opportunities,
and Quotations as Modules — none of which is independently installable, versionable, or removable
on its own.

**Relationship with an App.** Strictly owned, one-to-one-or-many: a Module has exactly one owning
App at all times. A Module cannot exist without an owning App, and a Module's every registration
(a nav entry, a permission, a search provider entry) is namespaced under its owning App's identity
— there is never ambiguity about accountability for what a Module does.

**Nested modules.** Modules may contain sub-modules for deep functional hierarchies (e.g.
Sales → Opportunities → Activities) — primarily to support navigation grouping and permission
scoping, not to create new independently-installable units. Nesting exists for organization, not
for a second tier of the App model. Recommend a soft depth limit (three levels) — past that,
navigation and permission trees stop being comprehensible to the humans who have to administer
them, which defeats the purpose of having structure at all.

**Reusability rules.** A Module may be designed as **shared** — its capability, not its
registration, can be mounted by more than one App (a generic "Documents/Attachments" module is the
canonical example). Reusability is always **opt-in and declared**: a mounting App must explicitly
name the shared Module in its own manifest; there is no implicit or global availability. A shared
Module's underlying data ownership remains singular — it does not fork storage per mounting App —
but the manifest must record every App that depends on it, so that versioning or removing a shared
Module can surface its real blast radius before it happens, not after.

---

## 3. Navigation Registration Model

**How applications register navigation.** Each App manifest contributes navigation entries. Every
entry references its owning Module (or the App itself, for a top-level entry), inherits its
permission requirement from that Module unless explicitly overridden, and declares a placement
(primary sidebar group, secondary/overflow, or hidden-but-directly-linkable — for pages that exist
and are reachable but shouldn't clutter primary navigation).

**Role-aware navigation.** Visibility of any entry is a pure function of three declared inputs:
the App being enabled for the current organization, the current user holding the entry's required
permission, and any feature flag the App/entry names. This must be **expressible entirely through
declared references** — an App is never permitted to compute its own ad hoc visibility logic,
because the moment visibility logic lives inside arbitrary App code, nothing else in the system
(the Shell, a future admin "who can see what" tool, an audit process) can reason about it without
executing that code. Declarative-only visibility is a hard architectural boundary, not a style
preference.

**Dynamic navigation principles.** An entry may declare a dynamic badge/count or dynamic label
(e.g. "3 Pending Approvals"). Architecturally, this dynamic content must come from a **declared,
typed data source reference** — never inline logic embedded in the manifest itself. This keeps
Sidebar rendering from ever needing to synchronously execute arbitrary App code, which is both a
performance boundary (rendering navigation must stay cheap regardless of App count) and a security
boundary (the Shell should never be in the business of trusting/executing App-supplied logic just
to draw a sidebar).

---

## 4. Permission Registration Model

**Permission ownership.** Every permission key is owned by exactly one App, namespaced by that
App's identity (mirroring this codebase's existing dot-namespaced convention, e.g.
`finance.masters.view` today belongs conceptually to a future "Finance" App). No two Apps may
declare the same permission key — this is not a convention to follow, it is a validation rule MUV
OS must enforce at manifest-validation time (§11), rejecting any manifest that collides with an
already-owned key.

**Permission inheritance.** A Module may either declare its own fine-grained permission or
reference a broader App-level permission for coarse-grained access — the same shape already
proven in this codebase's existing `ENTERPRISE_*` permission groups, where some roles get one
broad permission and others require several granular ones for the same functional area.
Inheritance flows one direction only: App-level permissions may cover Module-level actions;
a Module-level permission never grants anything at the App level.

**Visibility rules.** Holding a permission controls **visibility** (whether an entry appears in
navigation, search results, or the command palette) as a baseline — but visibility must always be
a *stricter-or-equal* gate than actual authorization, never the reverse. An entry may legitimately
be hidden even when technically reachable, but must never be shown for an action the user cannot
actually perform. This is a deliberate, explicit restatement of a rule this codebase already lives
by: every Server Action independently re-checks authorization (`requireStaff()`/`requireAdmin()`)
regardless of what the UI already hid — the manifest's permission declaration is a **rendering
hint**, never the security boundary itself. Conflating the two is the single most common way
manifest-driven UIs quietly become insecure.

**Action-level permissions.** Beyond page/route visibility, individual actions surfaced within a
Module's UI (Approve, Delete, Export, Reassign) must each declare their own permission key, so the
manifest can express "can view this record but not approve it" without needing a separate page or
route for every permission combination.

---

## 5. Search Registration Model

**How apps expose searchable entities.** An App declares which of its entity types are searchable
(Customer, Order, Product, in a future App's terms) together with a reference to a search provider
capability it owns. MUV OS's global search never indexes App data itself — it queries each
declared provider at search time, or reads from an index the App itself maintains and keeps fresh.
Which of those two an App chooses is deliberately left to the App: a low-volume App can do live
queries; a high-volume App needs a real index — the architecture defers "how," not "whether," and
generalizes this codebase's existing `SearchQuery` model (currently product-search-specific)
into a pattern any future App can adopt.

**Search providers.** A provider is a declared capability that accepts a query plus a scope
(current org/user) and returns typed result candidates — title, subtitle, icon, deep-link, and a
relevance hint. MUV OS's search aggregator merges candidates from every App's provider and does
the final ranking itself; an individual App influences its own candidates' relevance but never
controls final cross-App ordering.

**Search metadata.** Every result must carry its entity type, owning App, and required permission,
so MUV OS can filter out results the searching user isn't authorized to see **before** anything is
displayed. The same visibility-vs-authorization distinction from §4 applies here with extra force:
search must never leak the *existence* of a record through a result count or a title snippet the
user isn't otherwise permitted to see.

**Future extensibility.** The provider contract must stay engine-agnostic — assume search will
eventually be backed by a real index (full-text or vector) rather than per-App live queries, and
design the contract so that evolution is the aggregator's problem to solve, not something every
App's declaration has to change for. This is the same "swap the backend without touching call
sites" principle this codebase already applies to shipping and messaging providers.

---

## 6. AI Registration Model

**How each application exposes AI capabilities.** An App declares three things, and only these
three: what context it can supply the AI layer, what AI actions it exposes, and what knowledge it
contributes to retrieval (if any). This directly extends the Specification document's
`WorkspaceContext` concept from route-level context to entity-level context, and deliberately
aligns with this codebase's own already-documented AI pipeline (Knowledge Retrieval Core →
Intelligence Core → Execution Core → Experience Platform) rather than inventing a parallel model —
MUV OS's AI Registration Model is how a future App plugs into that existing pipeline, not a
second AI system.

**AI context.** Structured, versioned (the `WorkspaceContext.version` concern the Specification
document already flagged), and scoped. Critically, this is an **allow-list model**: an App exposes
*only* the data it explicitly declares as AI-visible. Nothing is exposed by default. Given AI
context routinely includes sensitive business data, an opt-out model (expose everything unless
excluded) is not an acceptable alternative here — it inverts the direction of the risk.

**AI actions.** Each declared AI action carries its own permission requirement — separate from,
and never weaker than, the equivalent human-triggered action's permission — plus a declared risk
tier: **read-only**, **propose-only**, or **auto-executable**. This mirrors the propose-vs-approve
and BLOCKED/ESCALATE distinctions already real in this codebase's Execution Core. Auto-executable
actions must be the rare, explicitly-flagged exception, never a default an App can reach for
casually.

**AI permissions.** A separate namespace from human permissions, with one non-negotiable rule: an
AI action's effective permission ceiling must never exceed the equivalent human action's ceiling.
An App may restrict what AI can do relative to what a human can do; it may never grant AI broader
reach than the human who's nominally directing it.

**AI data boundaries.** Everything an App exposes to AI — context or actions — must be scoped to
what the *current, real user* is authorized to see, resolved through the same clearance mechanism
already governing human access in this codebase's Modules 5–8 (`resolveCallerClearance()`), never
a separate or weaker check invented for the AI path. The AI layer is not, and must never become, a
privilege-escalation shortcut.

---

## 7. Notification Registration Model

**Notification ownership.** Every notification is created and owned by exactly one App, under a
namespaced type (e.g. a future `sales.quotation.approved`). MUV OS's Notification Center is a pure
aggregator and renderer — it never originates a notification on its own.

**Routing.** A notification declares its own recipient resolution — a specific user, a role, or
the current holders of a named permission — and the Shell resolves "who actually sees this"
generically. This spares every App from re-implementing delivery/fan-out logic, and generalizes
this codebase's existing `NotificationLog` model and pluggable messaging-provider pattern
(currently SMS/WhatsApp/email) to in-app notifications as a first-class case, not an afterthought.

**Priority.** Each notification declares a priority tier from a **fixed, shared enum**
(informational / actionable / urgent) — never a free-form value — because the Shell's rendering
rules (badge treatment, whether it interrupts, whether it's digest-eligible) must stay predictable
across every App's notifications, not vary by how each App's author happened to model priority.

**Deep-link behaviour.** Every notification must declare a deep-link target that resolves through
the same navigation and permission model as §3/§4 — a notification must never link somewhere its
recipient cannot actually open. If the underlying record later becomes inaccessible (permission
revoked, record deleted, App disabled), the deep-link must degrade to a clear "no longer available"
state rather than erroring — the same defensive posture this codebase already takes with the
redirect policy's `/access-denied` terminal fallback rather than ever looping or throwing.

---

## 8. Command Palette Registration Model

**Global commands.** MUV OS itself owns a small, fixed set of shell-level commands independent of
any App — "Toggle theme," "Open AI Panel," "Go to Settings." These exist even with zero Apps
installed.

**App commands.** Each App may register commands scoped to itself, namespaced and
permission-gated exactly like navigation entries — architecturally, a command **is** a navigable
or executable registry entry, discoverable via type-ahead rather than only via the Sidebar tree.
Commands and navigation share one underlying registration model (§3), not two parallel ones.

**Context-sensitive commands.** Some commands are only relevant given the current
`WorkspaceContext` — "Approve this Quotation" only when viewing a quotation the current user can
approve. These are declared by the App against the entity type/state they apply to, and filtered
in at command-palette query time based on live context — never hardcoded into the global command
list, and never present-but-disabled clutter for contexts where they don't apply.

**Keyboard-first behaviour.** Every command declares, or accepts a sensible default, keyboard
shortcut. MUV OS is the single arbiter of shortcut conflicts across every App — an App can never
silently claim a shortcut the Shell or another App already owns. Conflict-resolution policy (does
first-registered win, or is there an explicit priority tier between Shell/App/plugin-trust-tiers)
must be a decided rule at the platform level, not an accident of registration order — left as an
explicit open decision for the eventual implementation, called out again in §13.

---

## 9. Settings Registration Model

**Global settings.** Preferences that apply regardless of which App is active — theme, language,
notification digest frequency — owned by the Shell itself, never by an App.

**App settings.** Configuration specific to one App's own behavior (a future Sales App's default
currency, say) — owned and rendered by that App, but **discoverable through one unified Settings
surface** the Shell provides, so a user never needs to know which App owns a setting to find it.
This generalizes this codebase's existing `StoreSettings` CMS model beyond the storefront.

**User settings vs. Organization settings.** These are architecturally distinct scopes with
different permission models and different operational characteristics, and must never be treated
as one "settings" bucket:
- **User settings** are individual and private — a user can always change their own, no special
  permission required.
- **Organization settings** affect every user in the org and require an explicit elevated
  permission to change. They are also read far more often than they are written, and are shared
  across many concurrent users — the same read-heavy, org-scoped shape this codebase's existing
  `AiConfiguration` feature-flag table already has today, which should be treated as the working
  precedent for how Organization settings get implemented, not reinvented from scratch.

---

## 10. Extension / Plugin Architecture

**Future plugin support.** Beyond first-party Apps built by the MUV team, the architecture should
not foreclose eventual third-party or semi-trusted plugins, even though none exist and none are
being built now. The manifest model above — namespaced ownership, declared permissions, declared
AI/data boundaries — is already the right shape for that future, because it never assumes trusted,
unchecked App code in the first place; extending it to genuinely untrusted code is a matter of
tightening defaults, not redesigning the model.

**Registration lifecycle.** Follows the same state machine as §11, with one addition: a **trust
tier**. First-party Apps ship as part of MUV OS's own deployment and are implicitly trusted.
Future plugins would require a review/signing step before reaching `Validated`, and would run
under strictly narrower default boundaries (tighter AI data-boundary defaults, mandatory
sandboxing for any executed logic) until explicitly elevated by an administrator.

**Isolation principles.** A plugin must never read another App's or plugin's data, override
another's manifest entries, or execute code outside its own declared surface — exactly the same
boundary already required of first-party Apps in §1, simply enforced with less inherent trust.

**Version compatibility.** Every manifest — App or plugin — declares which manifest-schema version
it targets. MUV OS must refuse to activate a manifest whose declared version it cannot support,
with a clear deprecation window communicated in advance rather than a silent break at upgrade time.
This is the concrete mechanism that makes "modules built years apart don't break the system" (a
concern already raised in the Specification document) an enforced platform guarantee rather than
an aspiration.

---

## 11. Manifest Lifecycle

The manifest — the artifact, not just the App concept from §1 — moves through seven states with
explicit entry and exit conditions:

1. **Registration** — an App submits its manifest to MUV OS. Purely "MUV OS now knows this
   manifest exists." No validation is implied yet.
2. **Validation** — MUV OS checks the manifest's structure against schema, checks every declared
   namespace (permissions, notification types, commands) for collisions with already-registered
   Apps, and checks declared dependencies actually exist and are version-compatible. A manifest
   that fails validation is rejected outright — there is no partial registration state.
3. **Loading** — a validated manifest's declarations are loaded into the live registries
   (navigation, permissions, search providers, AI capabilities, notification types, commands,
   settings surface). This is a data operation; nothing is user-visible yet.
4. **Activation** — the App becomes visible/usable for a given organization or role scope. This is
   deliberately a separate step from Loading specifically so an App can be loaded (known to the
   system, previewable by an administrator) without being active for real users — the mechanism
   that enables staged rollouts.
5. **Deactivation** — the reverse of Activation: the App stops being visible/usable, but its
   manifest stays loaded (fast to reactivate) and its data is untouched. This is what "Disabled"
   in §1's App lifecycle actually means at the manifest level.
6. **Upgrade** — a new manifest version replaces the old one. Upgrade validation must be strictly
   more thorough than first-registration validation: does the new version remove a permission
   still referenced elsewhere in the system? Rename a notification type with pending, undelivered
   notifications still in flight? Upgrade is where backward-compatibility promises actually get
   tested, not just declared.
7. **Removal** — the manifest is withdrawn entirely; navigation, search, commands, and settings
   surfaces for that App disappear. Per §1, **data retention is a separate, explicit decision that
   removal never implies** — an App's underlying data may need to outlive its manifest for
   compliance or audit reasons. (This codebase already has a concrete precedent for exactly this
   distinction: `SalesAuditLog` rows are immutable by database trigger even when the user who
   created them is deactivated — the record outlives the actor. The same principle applies here:
   manifest removal outliving data is the norm to design for, not the exception.)

---

## 12. Design Principles

- **Separation of concerns.** The Shell renders chrome and enforces cross-cutting contracts
  (permission-based visibility filtering, focus management, layout). Apps own business logic and
  data. The manifest is the *only* contract between them — neither side reaches around it into the
  other's internals.
- **Loose coupling.** Apps never import each other directly (§1). All cross-App interaction goes
  through the Shell's generic registries (nav/search/notifications/commands) or through explicitly
  declared, versioned capability dependencies — never ad hoc reach-through.
- **High cohesion.** Each App's manifest sections describe *that App's* surface area only. A
  manifest is never the place to describe cross-App orchestration — that belongs in server-side
  logic an App owns, never in declarative registration data.
- **Scalability.** Every model above was designed against the Specification document's 5→50,000
  employee range: search-first navigation, paginated/virtualized notification surfaces, lazy-loaded
  per-App code, and declarative-not-executed visibility. This document reinforces those constraints
  at the manifest layer rather than re-deriving them.
- **Backward compatibility.** Manifest-schema versioning (§10, §11) exists specifically so old
  Apps don't break as MUV OS's own platform capabilities grow. This is a platform-level promise
  from version one, not something bolted on once the first breaking change is needed.

---

## 13. Risks

- **Architectural risk — designing against zero real Apps.** This entire model is being specified
  before any real App exists, per the brief's explicit "do not build business modules" constraint.
  The risk is abstractions that look complete on paper but don't survive a real App's actual
  needs. Mitigation: treat this document as a strong first version, not an immutable one — the
  first real App built against it should be explicitly treated as a validation exercise, with the
  expectation that §11's Upgrade path gets exercised early and on purpose.
- **Migration risk.** `EnterpriseShell`'s existing navigation (`lib/sales/navigation.ts`'s flat
  `ITEMS` array) has no concept of "App" at all — it is Sales-domain-flat by construction. When a
  migration decision is eventually made (explicitly deferred, per your prior direction), retrofitting
  existing Sales/Enterprise/Network/Finance functionality into this App/Module model may reveal
  that real domain boundaries don't cleanly map to "one App per existing route group" — is
  "Enterprise Operations" one App with many Modules, or several Apps? This document deliberately
  does not resolve that question now; it should be answered against a real migration plan, not
  guessed at here.
- **Performance risk.** The search/navigation/command aggregation model, if implemented naively —
  querying every App's provider synchronously on every keystroke or every Sidebar render — does
  not scale past a handful of Apps. This document's answer (declarative visibility, provider
  abstraction, App-chosen indexing strategy) only holds if the eventual implementation actually
  honors it; a rushed first build under deadline pressure could easily violate its own architecture.
- **Future scaling risk — namespace collisions.** Permission-key, notification-type, and
  command-shortcut collisions become likelier as App count grows into the dozens or hundreds. This
  needs a real, **enforced** namespacing/reservation mechanism at validation time (§4, §11), not a
  convention Apps are merely trusted to follow — a trust-based approach silently breaks precisely
  when App count is highest and hardest to fix.
- **AI-specific risk — allow-list erosion.** The AI Registration Model's allow-list posture (§6)
  is the safer default but adds real friction: every App must explicitly opt data into AI
  visibility. Under time pressure, this is exactly the kind of control that gets rubber-stamped
  into "expose everything" and quietly defeats its own purpose. This is a governance risk as much
  as a technical one — worth naming explicitly given this codebase's own AI-governance source
  material already treats deliberate, non-default AI data exposure as a first-class concern.

---

## 14. Recommendations

- **Build the AI and Permission Registration Models together, first.** Of everything in this
  document, §4 (Permissions) and §6 (AI) have the most real precedent already in this codebase —
  the existing `PERMISSIONS` constant and the documented Modules 5–8 AI pipeline. Validating the
  architecture against real prior art first reduces the "designed on paper only" risk in §13 more
  than starting anywhere else would.
- **Alternatives considered and rejected:**
  - *A single flat manifest per App, no Module concept.* Rejected — nested/grouped navigation and
    permission scoping both need a unit below "App" without granting that unit independent
    installability; collapsing the two would force every App to be either trivially small or
    unmanageably flat.
  - *Fully dynamic/runtime App loading (a true plugin marketplace) from day one.* Rejected as
    premature for a platform with zero Apps and one team building them. §10's trust-tier concept
    explicitly keeps that door open for later without requiring it now.
  - *Apps pushing directly into shared, mutable Sidebar/Search/Command state.* Rejected — this
    reintroduces exactly the imperative, order-dependent coupling the entire declarative-manifest
    model exists to avoid, and would make the "no layout changes required later" promise from the
    Specification document false in practice.
- **Long-term evolution strategy.** Treat this document as v1 of the manifest schema — the version
  field named throughout (§10, §11) is precisely what makes future revisions safe rather than
  breaking. Recommend the first real App, once separately approved, be explicitly used as an
  architecture-validation exercise, with a short written retro against this document before a
  second App is built. It is far cheaper to correct this architecture after one App than after five.

---

## Self-Review

**As an Enterprise Software Architect:** the App/Module boundary (§1, §2) is declared clearly, but
declaration alone doesn't make it enforceable. Tightened in response: manifest **validation**
(§11) must be the actual enforcement point for ownership/namespace rules — not a convention
document Apps are trusted to read and follow. Every "must" in §3–§9 above is written assuming
validation-time enforcement, not developer discipline.

**As a Product Architect:** a real risk is forcing genuinely different business shapes (a Sales
App and a Warehouse App are not the same kind of thing) into one mold. The Module/nesting model
(§2) and the "declare capabilities, not App names" dependency rule (§1) are the specific answers
to this — they let an App's internal shape vary freely while keeping the *registration* surface
uniform. Where this is still unresolved is exactly the migration-risk item in §13 (does one
existing domain become one App or several) — left open deliberately rather than guessed.

**As a Frontend Architect:** the biggest latent danger was navigation/search/command visibility
requiring *executed App code* to resolve — that would make Sidebar rendering only as fast as the
slowest App's logic. Tightened in response: §3, §5, and §8 all now explicitly require
**declarative-only** visibility and dynamic-content references, never inline logic, specifically
so rendering the Shell's chrome never depends on executing arbitrary App code synchronously.

**As a Platform Architect:** the original draft of this document treated namespace collisions and
manifest versioning as conventions. Tightened in response: §4, §10, and §11 now state explicitly
that collision checking and version-compatibility refusal are **validation-time platform
guarantees**, not documentation. This is the difference between a rule that holds at App #3 and
one that survives to App #300.

**As an AI Systems Architect:** the highest-stakes rule in this entire document is the AI
permission ceiling never exceeding the human permission ceiling for the same action (§6). It's
stated as non-negotiable rather than a guideline deliberately — this is the one rule where "we'll
tighten it later if needed" is not an acceptable posture, given the same principle already governs
the real AI pipeline this future App layer will plug into (Execution Core's BLOCKED/ESCALATE
distinctions, clearance resolution). The allow-list-erosion governance risk in §13 is the
remaining open concern here, and is explicitly a process risk, not something a schema alone can
close.
