# Session Revocation

Sessions support creation, validation, logout, one-session revoke and revoke-all. Expired/revoked/stale sessions fail server-side. Critical role and lifecycle changes increment authorization version and revoke active sessions. Tokens and password hashes never enter audit data.
