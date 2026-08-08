/**
 * MUV OS™ — Manifest Foundation
 *
 * Phase 1 / Block 1.1, Controlled Implementation pass 1. This is the shared
 * kernel every future manifest-driven file (Application, Module,
 * Navigation, Permission, Search, AI, Notification, Command Palette,
 * Settings, Plugin) will import from — see
 * docs/muv-os/phase-1/block-1.1-global-layout-system/MANIFEST_ARCHITECTURE.md.
 *
 * Scope boundary, deliberate and exact: this file defines only the
 * identity, versioning, and lifecycle-state primitives that are true of any
 * manifest in general (Manifest Architecture §11 — "the manifest, the
 * artifact, not just the App concept from §1"). It does NOT define the
 * Application or Module descriptor shapes themselves (§1, §2), and it does
 * NOT define any registration-model content (Navigation §3, Permission §4,
 * Search §5, AI §6, Notification §7, Command Palette §8, Settings §9,
 * Plugin/Extension §10) — every one of those is out of scope for this pass
 * and will be its own, separately approved file.
 *
 * This is a types-only module: no runtime values, no logic, nothing to
 * execute or import at runtime.
 */

/**
 * Nominal ("branded") typing utility. Plain `string` types are structurally
 * interchangeable in TypeScript — without this, an AppId could be passed
 * anywhere a ModuleId or a ManifestVersion is expected, and the compiler
 * would never catch it. Every identity/version primitive below is branded
 * with this so mixing them up is a compile-time error, not a runtime bug
 * discovered later. Exported so future registration-model files (each of
 * which will need its own namespaced identifiers — a permission key, a
 * notification type, a command id) can brand their own identifiers the same
 * way, instead of every file reinventing this pattern.
 */
export type Brand<Value, BrandName extends string> = Value & { readonly __brand: BrandName };

/**
 * Identifies an App — the unit Manifest Architecture §1 defines as "the
 * atomic unit of installable business capability... the permission-boundary
 * root." Every future namespaced identifier (a permission key, a
 * notification type, a command id) is scoped under one of these.
 *
 * This is intentionally only the identity primitive. The full App
 * descriptor (name, responsibilities, declared dependencies, etc.) is
 * Application Model territory (§1) and is explicitly not implemented in
 * this pass.
 */
export type AppId = Brand<string, "AppId">;

/**
 * Identifies a Module — the internal organizational/functional unit owned
 * by exactly one App (Manifest Architecture §2). Unique within its owning
 * App, not necessarily globally.
 *
 * As with AppId, this is only the identity primitive. The full Module
 * descriptor (owning App reference, parent module for nesting, the
 * shared/reusable-module flag) is Module Model territory (§2) and is
 * explicitly not implemented in this pass.
 */
export type ModuleId = Brand<string, "ModuleId">;

/**
 * Identifies the manifest-schema version a given manifest targets
 * (Manifest Architecture §10 "Version compatibility", §11 "Upgrade"). This
 * is the primitive that makes it possible for MUV OS to later refuse to
 * activate a manifest it can't support, with a real deprecation window
 * instead of a silent break.
 *
 * The exact format (semver, integer, or otherwise) and the
 * compatibility-comparison logic are deliberately not decided here — that
 * belongs to whichever future file implements Application/Plugin
 * validation. This type only gives every future manifest shape a
 * consistent, type-safe way to declare one.
 */
export type ManifestVersion = Brand<string, "ManifestVersion">;

/**
 * The resting states a manifest moves through, per Manifest Architecture
 * §11 ("Manifest Lifecycle"). Modeled directly from §11's own
 * state-producing steps:
 *
 *   Registration → "registered"
 *   Validation   → "validated"
 *   Loading      → "loaded"
 *   Activation   → "active"
 *   Deactivation → "deactivated"
 *   Removal      → "removed"
 *
 * §11's seventh step, Upgrade, is deliberately not a member of this union:
 * per its own description, an upgrade replaces an active manifest's version
 * and leaves it "active" again (at a new ManifestVersion) rather than
 * producing a new resting state of its own.
 *
 * Note for whoever implements the Application Model next: §1 separately
 * describes an App-specific lifecycle (Registered → Validated → Enabled →
 * Active → Disabled → Deprecated → Removed) that does not use identical
 * terms to this list — it names "Enabled" and "Deprecated", which §11 does
 * not, and §11 names "Loaded", which §1 does not. That is a real
 * inconsistency between two sections of the approved architecture, not a
 * decision this file makes; it is called out in this pass's implementation
 * report rather than silently resolved. This type follows §11's own
 * wording only, since this file concerns the generic manifest artifact, not
 * the App-specific lifecycle that will be built on top of it.
 */
export type ManifestLifecycleState =
  | "registered"
  | "validated"
  | "loaded"
  | "active"
  | "deactivated"
  | "removed";
