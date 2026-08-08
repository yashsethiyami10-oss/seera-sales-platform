# Settings and Flag Governance

Only approved Phase 1 setting keys and six canonical portal flags may be changed. Unknown/sensitive-looking keys fail closed; primitive types are enforced; environment secrets remain environment-managed. Flag mutation is permissioned/audited and never grants RBAC authority. Rollback is an audited update to the prior value.
