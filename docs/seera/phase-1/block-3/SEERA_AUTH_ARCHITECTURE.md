# Authentication Architecture

Credentials are validated server-side with Zod and bcrypt. Random session tokens are returned only in HttpOnly SameSite cookies; only SHA-256 token hashes are stored. Every resolution rechecks expiry, revocation, user `ACTIVE` state and `authorizationVersion`. Middleware is an anonymous fast-path; pages and APIs remain authoritative.
