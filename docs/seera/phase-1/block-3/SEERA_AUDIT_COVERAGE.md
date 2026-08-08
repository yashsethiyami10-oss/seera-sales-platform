# Audit Coverage

Audited events include Founder bootstrap, login security outcomes, user creation/state, role grant/removal, session revoke/revoke-all, settings and feature flags. Records contain actor/entity/reason/before/after where relevant. Tests verify absence of bootstrap password, token, password hash and database URL.
