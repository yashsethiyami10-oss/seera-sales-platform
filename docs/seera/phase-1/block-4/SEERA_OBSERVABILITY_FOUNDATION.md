# Observability Foundation

Operational logs are structured JSON with timestamp, level, event, sanitized app/environment identity and recursively redacted secret-shaped keys. API internal errors receive correlation IDs and safe responses while server logs retain event/request ID. Operational logging and immutable business audit remain separate. No third-party provider is required; a future adapter may forward structured entries.
