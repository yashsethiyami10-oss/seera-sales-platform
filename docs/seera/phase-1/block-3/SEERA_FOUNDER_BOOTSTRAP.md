# Founder Bootstrap

`bootstrapFounderFromEnvironment` requires TEST role plus environment-supplied email and 16+ character secret. It seeds catalogs idempotently, creates at most one normalized identity, assigns `FOUNDER_SUPER_ADMIN`, and audits creation without credentials. Missing/malformed inputs and production role fail closed.
