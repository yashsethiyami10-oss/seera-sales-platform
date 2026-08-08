# AD-001 — Shared Identity and Organisation Membership

Status: Founder-approved architecture direction; implementation details open.

## Decision

Retain one global authentication `User` identity only if all MUV/Seera business access is granted by active `OrganizationMembership` records and membership-scoped roles/permissions. A User alone grants no business access.

## Context and alternatives

Current `User` has global base role, one SalesRole and one territory. Alternatives were separate authentication deployments or global roles. Separate auth gives stronger deployment isolation but duplicates identity and administration; global roles fail the legal-entity boundary.

## Reasons and consequences

Shared identity supports one person in both entities and independent removal from either. Every protected service must migrate from user role to membership authority. Customer identities and employees need explicit onboarding/backfill rules.

## Migration/security impact

Additive identity-to-membership migration with compatibility adapters; no deletion of legacy roles until parity. Version memberships so suspension/role changes invalidate stale authority. Platform break-glass access, invitation, duplicate-email and customer-membership policy remain unresolved.

## MUV regression risk

High: login may work while authorization changes. Preserve MUV access through controlled membership backfill and dual-read observation before cutover.

## Acceptance tests

- User without membership cannot access either entity.
- One user can hold different roles in MUV and Seera.
- Suspending Seera leaves MUV intact and immediately denies Seera.
- Global User fields never satisfy a business permission check.

