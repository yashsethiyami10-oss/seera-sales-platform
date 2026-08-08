# AD-002 — Active Organisation Context

Status: Founder-approved architecture direction; transport and storage mechanism open.

## Decision

Every protected request resolves authenticated user, active organisation, active membership, role/permission and applicable territory/partner/ownership scope on the server. Static `MUV` context is not authoritative for organisation-owned operations.

## Context and alternatives

`ENTERPRISE_ORGANIZATION` is currently the literal `MUV`; the shell company badge is static. Client-supplied organisation IDs and route-only context were rejected because they permit tampering. Separate subdomains remain an optional routing aid, not authority.

## Reasons and consequences

One central resolver makes tenant checks reviewable and allows safe switching. Every query, aggregate, export, cache, file, job and notification must receive its organisation from the validated principal.

## Migration/security impact

Introduce server-validated context, membership version, switch audit and CSRF-safe switch action. Decide signed-cookie/session claim details, default organisation and no-membership UX during Phase 1 design.

## MUV regression risk

Critical if introduced as a big-bang replacement. Use MUV compatibility context only for classified legacy routes, never for Seera.

## Acceptance tests

- Changing URL/body/cookie organisation cannot bypass membership.
- Switching changes all selectors, reports, files and caches.
- Disabled membership and stale session are denied.
- Cross-organisation IDs return not-found/denied without data disclosure.

