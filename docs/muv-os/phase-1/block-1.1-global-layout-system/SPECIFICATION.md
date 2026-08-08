# MUV OS™ — Phase 1 / Block 1.1
## Global Layout System Specification

**Status:** Draft specification only. No production code changed. Nothing in this document is
wired into the live application.

**Scope guard:** This is the operating-system shell — the chrome every future module will sit
inside. It contains zero business logic, zero business modules, and zero hardcoded module names.
Sales, CRM, Warehouse, and Founder Dashboard are explicitly out of scope, per the brief.

**Isolation guard:** Per explicit direction, this initiative is built **in parallel** and is
**not wired into the live app**. It does not replace, import from, or get imported by
`components/enterprise-shell/EnterpriseShell.tsx`, which today is the real, working, production
shell for `/admin`, `/dashboard`, `/sales`, `/enterprise`, `/network`, and `/finance`. Everything
below assumes a self-contained sandbox until an explicit, separate decision is made to migrate any
live route onto it. See §15 for why this boundary matters and §16 for how a future migration
should be sequenced.

**Naming note:** This repository already has three active phase-numbering tracks — the storefront
(`PHASE_1`…`PHASE_19`, root-level, frozen), Enterprise v3 Sales/ERP (`Part 3A`–`3D`), and an AI
platform track (`docs/phase-3`…`phase-8`, Modules 3–8: Problem Intelligence → Care Intelligence →
Knowledge Retrieval → Intelligence Core → Execution Core → Experience Platform). "MUV OS™ Phase 1 /
Block 1.1" is a fourth, separate numbering track — deliberately namespaced under
`docs/muv-os/phase-1/block-1.1-...` so it never collides with any of the other three "Phase 1"s
already in this repo.

---

## 1. Architecture Explanation

MUV OS is a **shell/module split**, not a page template. Two layers, one contract between them:

- **The Shell** — persistent, module-agnostic chrome (Sidebar, Header, Workspace frame, AI Panel,
  optional Status Bar). It never knows what a "Sales Order" or a "Warehouse Bin" is. It only knows
  about *regions*, *navigation entries*, and *permissions* — all supplied to it as data.
- **Modules** — everything else. A module is a route segment plus a small declarative manifest
  (id, label, icon, required permission, nav group). It plugs into the Shell by registering that
  manifest; it never edits Shell code to add itself. This is the literal mechanism behind "every
  future module must plug in without redesign."

This is not a new idea invented for MUV OS — it generalizes a pattern already proven in this
codebase. `lib/sales/navigation.ts`'s `getSalesNavigation()` already filters a nav item list by
`principal.permissions` and feature flags before handing it to `EnterpriseShell`; MUV OS takes that
same idea (data-driven nav, permission-filtered, feature-flag-aware) and makes it the *only* way
any module can appear in the shell, rather than one array a developer edits by hand.

**Rendering model:** Server-first. The Shell's static chrome (brand mark, structural containers)
renders as React Server Components — zero client JS for parts that never change. Interactive
islands (Sidebar collapse/expand, Command Palette, Notifications/Approvals/Tasks popovers, AI
Panel, Theme toggle) are Client Components, each independently hydrated, so a module page that
needs no shell interactivity pays no extra client-JS cost for chrome it isn't touching.

**Composition, not configuration:** A module doesn't configure the Shell with a giant props object.
It registers a manifest and renders its own content into the `<Workspace>` slot. The Shell decides
layout; the module decides content. This is what makes "no layout changes required later" true —
a Kanban module and a Map module both just render into the same slot differently.

---

## 2. Desktop Layout (≥1280px)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Header  (56px)  [≡] [Breadcrumb]      [⌘K Search]      [AI][🔔][✓][👤]   │
├───────────┬────────────────────────────────────────────┬─────────────────┤
│           │                                            │                 │
│  Sidebar  │              Workspace                     │   AI Panel      │
│  260px    │              fluid, min 640px               │   380px         │
│  (72px    │                                            │  (0–420px,      │
│  collapsed)│                                            │   collapsible)  │
│           │                                            │                 │
├───────────┴────────────────────────────────────────────┴─────────────────┤
│ Status Bar (28px, optional — connection state, background job progress)  │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Sidebar:** 260px expanded / 72px icon-rail collapsed. Toggled by the user, state persisted.
- **Header:** fixed 56px height, never scrolls with content.
- **Workspace:** the only region that scrolls internally by default; owns its own overflow.
- **AI Panel:** starts closed by default on first visit; docked right when open, pushes Workspace
  rather than overlaying it (desktop only — see §8 for why this differs on smaller viewports).
- **Status Bar:** omitted unless a module genuinely needs it (e.g. a long-running background job,
  live connection state during an import). Per the brief, "only if useful" — the Shell renders
  nothing here by default.

---

## 3. Tablet Layout (768px–1279px)

```
┌──────────────────────────────────────────────────────────┐
│ Header (52px)  [≡] [Breadcrumb]        [🔍][AI][🔔][👤]   │
├───────────┬────────────────────────────────────────────┤
│  Sidebar  │                                            │
│  72px     │              Workspace                    │
│  icon-rail│              fluid                         │
│  (overlay │                                            │
│  on tap)  │                                            │
└───────────┴────────────────────────────────────────────┘
```

- Sidebar defaults to the **icon rail**; tapping a rail icon that has children opens a temporary
  overlay flyout rather than permanently reflowing the layout.
- The AI Panel loses its persistent dock and becomes a **right-edge overlay** (slides over the
  Workspace, not beside it) — there isn't enough width to keep three columns comfortable at
  768–1279px without starving the Workspace.
- Global Search collapses from an always-visible input to an icon that opens the Command Palette
  full-width.
- Status Bar, if present, remains but drops non-essential segments (keeps connection state, drops
  verbose text).

---

## 4. Mobile Layout (<768px)

```
┌────────────────────────────┐
│ Header (48px)               │
│ [≡]      [🔍]      [👤]      │
├────────────────────────────┤
│                            │
│        Workspace           │
│        full width          │
│                            │
├────────────────────────────┤
│ (optional) Bottom Nav 56px  │
└────────────────────────────┘
```

- **Sidebar** becomes a full-screen drawer, triggered by the hamburger icon; closes on
  navigation or outside tap (same interaction EnterpriseShell's existing mobile drawer already
  uses today — MUV OS keeps that proven interaction rather than inventing a new one).
- **Header** shrinks to icon-only: menu, search, avatar. Notifications/Approvals/Tasks collapse
  into a single overflow icon rather than three separate icons.
- **AI Panel** becomes a full-screen modal (slide-up sheet), never a docked column.
- **Bottom Nav** is optional and off by default — the brief lists it only for desktop as a status
  bar; on mobile it's offered here as the equivalent affordance *if* a deployment wants one-tap
  access to 3–5 pinned modules, but the Shell ships with it disabled until a real usage need
  justifies the extra chrome.
- Tables inside Workspace content degrade to stacked cards below 640px — this is a Workspace
  content-pattern rule (§7), not a Shell rule, since the Shell never renders tables itself.

---

## 5. Sidebar Specification

**Composition (top to bottom):**
1. Brand mark / Company switcher (future-ready — see §14) — collapses to a monogram when the rail
   is collapsed.
2. Sidebar search (`/` or `⌘/` focuses it) — filters the nav tree in place, not a separate palette.
3. Pinned / Favorites — user-curated, reorderable, persisted per user.
4. Primary navigation — grouped, collapsible groups, rendered **entirely from data** (see below).
5. Recents — last N visited destinations, most-recent-first, capped and de-duplicated.
6. Collapse/expand toggle, pinned to the bottom edge.

**No hardcoded modules.** The Sidebar renders from a `NavRegistry`: an array of
`{ id, label, icon, href, group, permission }` entries contributed by each module's manifest and
merged at request time. This is the same shape `getSalesNavigation()` already uses today
(`lib/sales/navigation.ts`'s `ITEMS` array, filtered by `principal.permissions`) — MUV OS
generalizes that exact filtering rule (`!item.permission || principal.permissions.has(item.permission)`)
so it's no longer specific to the Sales domain.

**Interaction contract:**
- **Keyboard:** roving `tabindex` across visible items; `↑/↓` moves focus, `→` expands a group,
  `←` collapses it, `Enter`/`Space` activates, `Home`/`End` jump to first/last item, `/` focuses
  sidebar search from anywhere the sidebar has focus.
- **Expand/collapse:** a single boolean, persisted to `localStorage`, independent per breakpoint
  (see §13 — a desktop preference must never fight a forced mobile drawer state).
- **Animation:** width/opacity transition, 160ms, `ease-out`; respects `prefers-reduced-motion`
  by swapping to an instant state change.
- **Empty/zero-module state:** the Sidebar must render sensibly with a `NavRegistry` of length
  zero (a brand-new 5-person deployment with nothing installed yet) — just the brand mark, search,
  and an empty-state hint, never a broken layout.

---

## 6. Header Specification

Left-to-right:

| Region | Behavior |
|---|---|
| Sidebar toggle | Collapses/expands (desktop) or opens drawer (mobile) |
| Breadcrumb | Derived from the current route + module manifest labels, truncates on narrow widths |
| Company/workspace switcher | Future-ready; renders as a no-op single-entry switcher until multi-company exists (see §14) |
| Global Search / Command Palette trigger | `⌘K` / `Ctrl+K` anywhere in the app opens it |
| AI Quick Access | Opens the AI Panel directly to its Chat tab |
| Tasks | Popover, badge count, virtualized list (see §14) |
| Approvals | Popover, badge count, same list primitive as Tasks — different data, same component |
| Notifications | Popover, badge count, grouped by recency |
| Theme toggle | Light / Dark / System, persisted, no flash-of-wrong-theme (resolved before paint) |
| Connection status | Small indicator (online / reconnecting / offline) — sets up the "future offline support" requirement in §12 without implementing it yet |
| User profile menu | Name, email, role label, log out — directly modeled on `EnterpriseShell`'s existing `UserMenu`, since that component already solved this well |

**Command Palette:** fuzzy search across a single merged index — nav destinations (from the same
`NavRegistry` as the Sidebar), and, once modules exist, module-contributed actions/records. Recent
+ suggested entries shown with an empty query. This is the *primary* discovery mechanism at scale
(see §14) — Sidebar browsing is secondary once module count grows past what fits comfortably in a
tree.

---

## 7. Workspace Specification

The Workspace is a **layout primitive**, not a page template:

```
<Workspace>
  <Workspace.Header>            // title, breadcrumb continuation, primary/secondary actions
  <Workspace.StickyActions />    // optional — save/cancel bars, bulk-action bars
  <Workspace.Body>               // the only scrollable region; owns its own overflow
    {module content}
  </Workspace.Body>
</Workspace>
```

It must render every content pattern named in the brief — Dashboards, Forms, Tables, Kanban,
Timeline, Analytics/Charts, Maps, AI conversation views — **without the Shell caring which one it
is**. The Shell's job stops at "give the module a header slot, an optional sticky-action slot, and
a scrollable body." Everything past that is the module's own component tree.

**Split View** is the one additional Workspace primitive worth naming explicitly, because
master-detail (a list + a detail pane) recurs across nearly every enterprise content pattern above
(a table with a row detail, a Kanban card with a detail drawer, a map with a selected-record
panel). Building it once as `<SplitView left right minLeftWidth resizable />` means every future
module reuses it instead of re-solving "resizable two-pane layout" per module.

---

## 8. AI Panel Specification

**Modes:** collapsed (icon only, in the Header's AI Quick Access slot) → expanded (docked 380px on
desktop, overlay on tablet, full-screen on mobile — per §2–4).

**Tabs:**
- **Chat** — open-ended conversation.
- **Summary** — a context-aware summary of whatever the user is currently looking at.
- **Suggestions** — proactive, dismissible recommendations tied to the current Workspace context.
- **Context-Aware Help** — documentation/help scoped to the current module, not generic search.

**The context contract** is the actual design decision here, not the visual chrome: the AI Panel
receives a typed `WorkspaceContext` (`{ moduleId, route, recordType?, recordId?, version }`)
through React Context, supplied by whatever module is currently mounted in the Workspace. Any
future module gets a working, contextual AI Panel automatically, by virtue of setting this context
when it mounts — it never hand-wires a connection to the panel itself. `version` on the context is
a deliberate scalability hedge (§14): modules built years apart, by different teams, must not
silently break the panel's assumptions about the context shape.

**Relationship to the real AI system already in this repo:** this codebase already has a genuine,
multi-module AI pipeline documented under `docs/phase-5` through `docs/phase-8`
(Knowledge Retrieval Core → Intelligence Core → Execution Core → **Experience Platform**, whose own
`orchestrateExperience` Server Action is the actual "what does the person actually see" boundary).
MUV OS's AI Panel is deliberately specified as a **consumer of that contract**, not a second AI
implementation — Phase 1/Block 1.1 defines the panel's shape and the `WorkspaceContext` it expects,
but wiring it to `orchestrateExperience` (or any AI backend) is explicitly out of scope for a
layout-only phase, per the brief's "DO NOT build business modules" instruction. The panel ships
with a typed interface and a mock/empty implementation until that wiring is separately approved.

**Persistence:** open/closed state and last width are `localStorage`-backed per user, not global
app state — mirrors how `lib/cart-context.tsx` already persists client state in this app.

---

## 9. Component Hierarchy

```
<OSShellProvider>                         // client: sidebar/panel/palette UI state (Zustand, §12)
  <OSShell>
    <Sidebar>
      <SidebarBrand />
      <SidebarSearch />
      <SidebarSection label="Pinned">...<NavItem /></SidebarSection>
      <SidebarSection label="{group}">...<NavItem /></SidebarSection>
      <SidebarSection label="Recents">...<NavItem /></SidebarSection>
    </Sidebar>
    <div class="main-column">
      <Header>
        <SidebarToggle /> <Breadcrumb /> <CompanySwitcher />
        <SearchTrigger /> <AIQuickAccess />
        <TasksPopover /> <ApprovalsPopover /> <NotificationsPopover />
        <ThemeToggle /> <ConnectionStatus /> <UserMenu />
      </Header>
      <Workspace>
        <Workspace.Header /> <Workspace.StickyActions /> <Workspace.Body>{children}</Workspace.Body>
      </Workspace>
    </div>
    <AIPanel>
      <AIPanel.Tabs /> <AIPanel.Chat /> <AIPanel.Summary /> <AIPanel.Suggestions /> <AIPanel.Help />
    </AIPanel>
    <StatusBar />                         // optional, off by default
  </OSShell>
  <CommandPalette />                      // portal, mounted once at the provider root
  <DrawerPortal /> <ModalPortal />         // shared overlay portals — see §15 for why "shared"
</OSShellProvider>
```

**Reusable primitives** (the brief's "Component Rules" list, with their contract in one line each):

| Component | Contract |
|---|---|
| `PageLayout` | Top-level page wrapper: title, description, actions slot |
| `Workspace` | Header/StickyActions/Body slots, owns scroll |
| `Card` | Padding/elevation/border presets, no business meaning |
| `Panel` | A boxed content region, used inside Workspace or AI Panel |
| `SectionHeader` | Title + optional description + right-aligned actions |
| `StickyActions` | Bottom or top action bar, sticks within its scroll container |
| `Drawer` | Slide-in overlay, left/right/bottom, focus-trapped |
| `Modal` | Centered overlay, focus-trapped, `Escape`-dismissible |
| `Sidebar` | As specified in §5 |
| `Header` | As specified in §6 |
| `AIPanel` | As specified in §8 |
| `SplitView` | Resizable two-pane layout, per §7 |

---

## 10. Folder Structure

Deliberately isolated — nothing here is imported by, or imports from, today's live shell.

```
app/(os)/                                  # isolated route group — NOT linked from live nav
  layout.tsx                               # mounts OSShellProvider + OSShell
  page.tsx                                 # placeholder/sandbox Workspace page only

components/os-shell/                       # new, sibling to components/enterprise-shell/ — no
  OSShellProvider.tsx                      # cross-imports either direction until migration
  Sidebar/
    Sidebar.tsx
    SidebarSearch.tsx
    SidebarSection.tsx
    NavItem.tsx
  Header/
    Header.tsx
    CommandPalette.tsx
    NotificationsPopover.tsx
    ApprovalsPopover.tsx
    TasksPopover.tsx
    UserMenu.tsx
    ThemeToggle.tsx
    ConnectionStatus.tsx
    CompanySwitcher.tsx
  Workspace/
    Workspace.tsx
    PageHeader.tsx
    StickyActionBar.tsx
    SplitView.tsx
  AIPanel/
    AIPanel.tsx
    ChatTab.tsx
    SummaryTab.tsx
    SuggestionsTab.tsx
    HelpTab.tsx
  primitives/
    Card.tsx  Panel.tsx  Drawer.tsx  Modal.tsx  SectionHeader.tsx
  registry/
    types.ts                               # the module manifest contract — see §16, build first
    module-registry.ts                     # merges manifests into NavRegistry + Command Palette index

lib/os-shell/
  use-os-shell-store.ts                    # Zustand store — sidebar/panel/palette UI state only
  keyboard-shortcuts.ts
  nav-permission-filter.ts                 # generalizes lib/sales/navigation.ts's filter rule

docs/muv-os/phase-1/block-1.1-global-layout-system/
  SPECIFICATION.md                         # this document
```

**Why this shape:** `app/(os)` as a route group costs nothing to the existing router — Next.js
route groups don't affect URLs, so this can exist, be visited directly in dev, and be reviewed
without touching `(storefront)`, `(auth)`, `admin/`, `account/`, `sales/`, `dashboard/`,
`enterprise/`, `network/`, or `finance/`. `components/os-shell/` mirrors `components/enterprise-shell/`
deliberately — same problem, parallel solution — so a future side-by-side comparison (and eventual
migration decision) is easy to reason about.

---

## 11. Routing Strategy

- **One shared layout, many modules.** `app/(os)/layout.tsx` mounts the Shell once; every module
  route beneath it (once modules are approved and added — none exist yet) is a sibling segment,
  e.g. `app/(os)/{module-slug}/...`. Because Next.js keeps a shared layout mounted across sibling
  navigations, the Sidebar/Header/AI Panel **never remount** when switching modules — only the
  Workspace's children swap. This is the actual mechanism behind "no layout changes required
  later," not just a phrase.
- **Deep-linkable shell state.** Anything a user might want to share or refresh-and-keep (AI Panel
  open + active tab, Command Palette open) lives in the URL's search params (e.g. `?ai=chat`),
  not only in client state — recommend the `nuqs` library for this specifically, since it keeps
  search-param state typed and in sync with the Zustand UI store without hand-rolled
  `useSearchParams`/`router.replace` plumbing at every call site.
- **Module registration is route-driven.** Each module folder exports a `manifest.ts` matching
  `registry/types.ts`'s contract. A single aggregator (`module-registry.ts`) collects every
  manifest under `app/(os)/*/manifest.ts` at request time (or build time once module count makes
  that worthwhile) into the `NavRegistry` the Sidebar and Command Palette both read. Adding a
  module is: add a folder + a manifest. Nothing in `components/os-shell/` changes.

---

## 12. State Management Recommendation

Three distinct kinds of state need three distinct answers — conflating them is the #1 way shells
like this rot:

| State kind | Examples | Recommendation |
|---|---|---|
| Server/business data | anything module-owned | Stays server-first: RSC + Server Actions, exactly as the rest of this app already works. The Shell has an opinion on none of it. |
| Ephemeral shell UI state | sidebar collapsed?, AI Panel open/width, Command Palette open, pinned items, recents | **Zustand.** A small (~1KB), selector-based store. This is a deliberate, narrow addition — the app's existing precedent (`lib/cart-context.tsx`) uses plain React Context, but Context re-renders every consumer on every change, and the Shell has several independent, high-frequency UI slices (palette keystrokes, sidebar hover, panel resize) that would otherwise cause cross-component re-render storms. Zustand's selector subscriptions avoid that. This should be the **only** new client state dependency Phase 1 introduces — resist reaching for it outside shell UI state. |
| Persisted user preference | theme, sidebar pinned/collapsed default, panel width | `localStorage`-backed, same pattern `cart-context.tsx` already uses. |
| Shareable/refreshable UI state | AI Panel open+tab, Command Palette open | URL search params via `nuqs` (§11) — deliberately *not* Zustand, so it survives refresh and is shareable. |
| Server-pushed live state | Notifications, Approvals, Tasks, Connection status | Start **polling-first** (no websocket infra exists in this app yet), but define the interface so it can swap to SSE/WebSocket later without call-site changes — this directly mirrors the existing `lib/shipping/index.ts` / `lib/messaging/index.ts` swap-by-provider pattern already proven in this codebase for exactly this "start simple, upgrade later" situation. |

---

## 13. Responsive Rules

| Breakpoint | Sidebar default | AI Panel | Header |
|---|---|---|---|
| ≥1440px (Large Display) | Expanded | Dockable, can default open for power users | Full |
| 1280–1439px (Desktop) | Expanded | Dockable, closed by default | Full |
| 768–1279px (Tablet) | Icon rail, flyout on tap | Overlay | Condensed (search → icon) |
| <768px (Mobile) | Full-screen drawer | Full-screen modal | Minimal (icon-only) |

**Non-negotiable rules:**
- The page shell itself **never** horizontal-scrolls; any wide content (tables, timelines) scrolls
  within its own container inside the Workspace.
- Sidebar/AI Panel open-state is stored **per breakpoint bucket**, not as one global boolean — a
  desktop user's "keep sidebar pinned open" preference must not force a mobile drawer open on a
  phone.
- Touch targets ≥44×44px whenever the viewport is touch-capable, regardless of breakpoint (a
  touchscreen laptop at desktop width still needs this).
- Every overlay (Drawer, Modal, Command Palette, mobile AI Panel) shares one focus-trap
  implementation — see §15's accessibility risk.

---

## 14. Future Scalability Notes (5 → 50,000 employees)

- **Search-first navigation is not optional at scale.** A tree that's fine at 20 modules becomes
  unusable at 200. Sidebar search and the Command Palette are specified as first-class from Phase
  1 (§5, §6) specifically so navigation doesn't need a redesign when module count grows — only the
  underlying `NavRegistry` grows.
- **Multi-tenant is a data shape decision made now, paid for later.** The Company/Workspace
  switcher in the Header is a real slot from day one (even though it renders as a no-op
  single-entry switcher today) so that when multi-company support is needed, it's a data change
  (more entries) not a layout change. This mirrors a pattern already in this repo's own schema —
  `AiConfiguration.organizationKey` already scopes configuration by organization even though this
  deployment currently only has one.
- **Module registry must lazy-load.** At 50,000-employee scale, dozens of modules may be
  installed, but any one user touches a handful. The registry aggregates manifests (cheap,
  metadata-only) but each module's actual component tree must be code-split so the Shell's
  baseline bundle doesn't grow with total installed modules — only with modules a given user
  actually opens.
- **Header popovers (Notifications/Approvals/Tasks) must assume high volume from day one** —
  paginated/virtualized lists, not "fetch all and render," so a 50,000-employee deployment's
  approval queue doesn't degrade the header that a 5-person deployment also uses.
- **`WorkspaceContext.version`** (§8) exists so modules built years apart by different teams don't
  silently break the AI Panel's assumptions — a scale/longevity concern, not a v1 nicety.

---

## 15. Potential Risks

1. **Becoming a second, unused shell.** `EnterpriseShell` is real, working, and in production on
   six routes today. Building MUV OS "in parallel" is the right call for a first pass, but without
   an explicit, later migration decision, this risks becoming permanent dead weight that nobody
   ever adopts. Recommendation in §16 addresses this directly.
2. **Scope creep from the Header's own spec.** Notifications/Approvals/Tasks/Command Palette
   *imply* real backend contracts, but the brief is layout-only. Every one of those components
   must be specified here as a typed interface with a mock/empty data source — not accidentally
   grow real business logic during "just the layout" implementation.
3. **State-management sprawl.** Introducing Zustand alongside this app's existing plain-Context
   precedent needs a documented, narrow rule (§12 states it) or future contributors will pick
   inconsistently between the two for unrelated reasons.
4. **Duplicate design languages.** This repo already has one frozen design system
   (`styles/globals.css`, Phase 5 Design System) with its own token set. If the OS Shell invents
   its own tokens instead of consuming Phase 5's, MUV ends up maintaining two visual languages
   that will visibly disagree the moment they're ever shown side by side.
5. **Overlay accessibility regressions.** Drawer, Modal, Command Palette, and the mobile AI Panel
   are all portal/overlay patterns. If each is built independently, focus-trap and return-focus
   behavior *will* drift between them. Specified in §13 as one shared implementation for exactly
   this reason.
6. **Chrome re-render cost.** A naive per-module layout (rather than the shared-layout routing
   strategy in §11) would remount Sidebar/Header/AI Panel on every navigation, defeating the whole
   "instant navigation" performance goal. The routing strategy avoids this by construction, but
   it's the one thing worth explicitly verifying once real modules exist.

---

## 16. Recommended Improvements

1. **Build `registry/types.ts` first, before any visual component.** Every other piece (Sidebar
   rendering, Command Palette indexing, routing, permission filtering) depends on the module
   manifest's shape being right. Getting this contract right early is cheaper than fixing it after
   five modules already depend on it.
2. **Consume Phase 5's existing design tokens, don't reinvent them**, even while the Shell itself
   stays isolated — a shared token layer costs nothing today and avoids risk #4 above entirely.
3. **Reuse the existing pluggable-provider pattern** (`lib/shipping/index.ts` /
   `lib/messaging/index.ts`) for the eventual Notifications/live-status backend, rather than
   inventing a new approach — this codebase has already solved "start simple, swap provider later"
   once; no reason to solve it twice.
4. **Write a short ADR before any live route migrates.** "Migrate `EnterpriseShell` → MUV OS Shell"
   deserves its own one-page decision doc with a route-by-route cutover plan, given six production
   routes currently depend on the shell being replaced. This spec intentionally does not attempt
   that plan — it's a separate decision, for a separate approval.
5. **Add a sandbox page** (`app/(os)/page.tsx`, already in the folder structure in §10) so the
   Shell can be visually reviewed and iterated on with fake data, without needing a real module or
   touching production routes.

---

## Self-Review

- **As a product designer:** the Header risks feeling busy (Search, AI, Tasks, Approvals,
  Notifications, Theme, Connection, User — eight regions). Mitigated by collapsing
  Tasks/Approvals/Notifications into one overflow affordance below tablet width (§4), but worth
  watching even at desktop width once real badge counts appear.
- **As a UX expert:** Sidebar search-first vs. browse-first is the single highest-leverage
  decision in this spec at scale (§14) — got explicit treatment rather than being an afterthought.
- **As an enterprise architect:** the isolation boundary (§10) and the explicit non-decision about
  migration (§16 point 4) are the two things protecting this from becoming shelfware *or* a
  premature rewrite — both risks were real given a working shell already exists.
- **As a senior frontend engineer:** the one new dependency this spec asks for is Zustand, scoped
  narrowly to shell UI state (§12), with an explicit reason it's needed over the app's existing
  Context precedent rather than a default reach for "the modern library."
- **As a performance engineer:** the shared-layout routing strategy (§11) is what actually
  delivers "instant navigation" — everything else in this spec is chrome around that one
  structural decision.
