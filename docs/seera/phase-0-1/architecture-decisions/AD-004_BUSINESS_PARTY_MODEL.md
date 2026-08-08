# AD-004 — Governed Business Party Model

Status: Founder-approved direction; exact table names/profiles open.

## Decision

Introduce organisation-scoped governed parties capable of retailer, distributor, super stockist, institution, vendor and future commercial profiles. Preserve existing MUV Customer and integrate through adapters/mappings until migration is proven.

## Context and alternatives

`Customer` has global unique identity/code and MUV storefront/CRM meaning. Extending it directly risks coupling; separate unrelated retailer/distributor tables duplicate identity and ledger relationships. Enterprise `NetworkPartner` provides reusable hierarchy/effective-date patterns.

## Reasons and consequences

A party core gives stable legal/commercial identity while typed profiles hold channel fields. Relationships, addresses, contacts, KYC, tax registrations, users and finance accounts remain organisation-scoped.

## Migration/security impact

Additive party/profile/mapping records; validate every Customer mapping explicitly. Partner users need active membership plus effective party assignment. KYC/files require private access.

## MUV regression risk

Medium/high around duplicate matching, quotes and orders. Never auto-merge by phone/email alone.

## Acceptance tests

- Same real-world party can have independent MUV and Seera records.
- Retailer sees only assigned organisation/party data.
- Effective hierarchy changes preserve history.
- Existing MUV Customer workflows work through compatibility adapters.

