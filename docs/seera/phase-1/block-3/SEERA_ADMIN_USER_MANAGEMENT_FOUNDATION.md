# Admin User Management Foundation

Services implement authorized user creation, lifecycle changes, multi-role grant/removal and session revocation. Duplicate identities/active assignments fail. Company Admin cannot grant Founder authority; payload permissions are ignored; self-lockout and removal of the last active Founder are blocked. All critical mutations are audited.
