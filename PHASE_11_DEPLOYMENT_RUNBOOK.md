# Phase 11 Deployment Runbook

Production deployment is not authorized.

Pre-launch order: close all Phase 11 gates; obtain Founder authorization; verify target fingerprint; take/verify backup; deploy immutable application artifact; run migrations once through the guarded production procedure; verify readiness and smoke journeys; monitor errors/latency; roll back application on regression. Database rollback must use the reviewed reversible migration/restore procedure, never `db push` or ad-hoc destructive SQL.

Stop immediately on target mismatch, unavailable backup, failed readiness, schema drift, elevated errors, authorization ambiguity or any MUV identity.
