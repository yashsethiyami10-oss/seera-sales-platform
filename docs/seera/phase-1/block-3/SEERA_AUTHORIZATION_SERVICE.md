# Authorization Service

`authorize` is the authoritative server layer. It validates active identity, active role assignments, active roles, derived permissions and optional portal flags. `system:super_admin` is the only governed bypass. Contextual business scope remains intentionally deferred to later phases.
