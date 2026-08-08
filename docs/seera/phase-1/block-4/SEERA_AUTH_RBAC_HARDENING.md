# Authentication and RBAC Hardening

Central authorization remains the sole authority. All protected APIs resolve database-backed sessions; no client role/permission payload is trusted. Denied permission/flag events are audited. Secure random session tokens remain hash-stored and cookies HttpOnly, SameSite=Lax, Secure in production. Critical changes revoke/stale sessions immediately.
