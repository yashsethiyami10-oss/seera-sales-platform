# User Lifecycle

`ACTIVE` alone may authenticate. `INACTIVE`, `SUSPENDED`, and `DISABLED` deny login and protected access. Suspension/disable increments authorization version and revokes sessions; audited reactivation returns `ACTIVE`. Users are not deleted to remove access, and self-lockout is denied.
