# AD-008 — GPS Privacy and Retention

Status: Founder-approved direction; 90-day precise-GPS retention is provisional pending policy review.

## Decision

Collect GPS only during explicit Start Day–End Day field-work sessions and valid business visits. No hidden off-duty continuous tracking. Restrict raw location by role/team scope, show employees their route, support correction/dispute, audit location access and require manager verification before TA approval.

## Context and alternatives

Institutional visits capture check-in/out points but have no governed work session, retention or access-audit model. Always-on tracking was rejected. Check-in-only remains a possible degraded mode but cannot support every route metric.

## Reasons and consequences

Purpose limitation protects employees while enabling attendance, route and approved travel estimates. Precise raw points are proposed for 90 days; aggregate/expense evidence retention needs separate policy.

## Migration/security impact

New work-session/location/access-audit/dispute concepts are future phases, not authorized here. Encrypt, minimize logs, validate membership/team scope and treat fake-GPS indicators as review signals.

## MUV regression risk

Low if Seera-additive; privacy risk is high. Existing institutional coordinates require classification before any shared policy migration.

## Acceptance tests

- No points accepted outside an active work session/authorized visit.
- Employee can view and dispute own route.
- Unauthorized manager/export access is denied and audited.
- Retention job removes precise points per policy without corrupting approved expense evidence.

