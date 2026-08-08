# Seera Infrastructure Setup Checklist

Status: **Founder handoff — do not execute automatically**  
Prepared: 2026-08-08

This is the exact gate between architecture and Phase 1 implementation. Do not reuse, copy, rotate, test, or inspect MUV secrets to satisfy it.

## 1. Repository

- [ ] Confirm `C:\Users\KE\seera-sales-platform` is not inside another Git worktree.
- [ ] Initialize independent Git in that directory only.
- [ ] Confirm no `.git` file/worktree pointer references MUV.
- [ ] Add secret/build/upload exclusions before the first baseline commit.
- [ ] Record the copied-code baseline and architecture documents without modifying MUV.

## 2. Environment contract

Create Seera-owned values using a local uncommitted environment file and deployment secret store. Required foundation variables:

```text
APP_ENV=development|test|production
APP_NAME=Seera Sales & Distribution OS
APP_ORIGIN=https://...
DATABASE_URL=postgresql://.../seera_production
TEST_DATABASE_URL=postgresql://.../seera_test
AUTH_SECRET=<independent high-entropy secret>
DATA_ENCRYPTION_KEY=<independent managed key where required>
STORAGE_PROVIDER=...
STORAGE_BUCKET=...
STORAGE_REGION=...
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
EMAIL_PROVIDER=disabled|...
WHATSAPP_PROVIDER=disabled|...
LOG_LEVEL=...
ERROR_TRACKING_DSN=...  # optional until configured
```

- [ ] Remove every known MUV host, key, sender, bucket, callback URL, and credential from Seera files.
- [ ] Keep only non-secret placeholders in `.env.example`.
- [ ] Confirm no `NEXT_PUBLIC_` variable contains a secret.
- [ ] Add startup redaction so values are never printed.

## 3. Databases

- [ ] Provision a new Seera production database/project.
- [ ] Provision a physically/logically separate Seera test database with different identity and credentials.
- [ ] Use least-privilege application roles; separate migration/admin privilege where supported.
- [ ] Verify normalized host, project, database, and account identifiers differ from MUV and from each other.
- [ ] Implement a database identity table/marker and startup guard.
- [ ] Make test startup fail if `TEST_DATABASE_URL` is absent, equals production, lacks the Seera-test marker, or matches a denylisted MUV fingerprint.
- [ ] Establish backup/PITR policy for production before production data.
- [ ] Do not run a migration until the Phase 1 schema and rollback plan are reviewed.

## 4. Storage

- [ ] Provision a Seera-only private bucket/container and service identity.
- [ ] Block public access by default; enable encryption, lifecycle, and access logging.
- [ ] Define prefixes by environment and document class.
- [ ] Configure signed-read expiry and revocation strategy.
- [ ] Select upload MIME/extension/size limits and malware scanning/quarantine approach.
- [ ] Verify test storage cannot access production objects.

## 5. Authentication and bootstrap

- [ ] Generate Seera-only auth/session secrets.
- [ ] Set trusted origins and secure cookie policy for each environment.
- [ ] Define Founder bootstrap identity and one-time secure activation process.
- [ ] Define password, MFA/step-up, recovery, lockout, and session-duration policy.
- [ ] Ensure no MUV user/account/session is copied or queried.

## 6. Email and WhatsApp

- [ ] Choose Seera-owned email sender/domain or leave provider explicitly disabled.
- [ ] Choose an approved WhatsApp Business provider/account or leave disabled.
- [ ] Obtain template and consent/compliance approval before messaging users.
- [ ] Configure environment-specific webhook secrets and URLs.
- [ ] Verify provider failure leaves internal inbox/business transactions intact.

## 7. Deployment and operations

- [ ] Provision a Seera-only project/service and domain.
- [ ] Separate preview/test/production secrets and databases.
- [ ] Configure TLS, headers, logs, monitoring, error tracking, and alert ownership.
- [ ] Define deployment rollback, migration order, health checks, backup restore, RPO/RTO, and incident contacts.
- [ ] Prevent deployment tooling from reading or deploying the MUV directory.

## 8. Evidence required before Phase 1

- [ ] Independent Git verification.
- [ ] Sanitized environment fingerprint report (no secrets).
- [ ] Production/test/MUV database inequality proof.
- [ ] Runtime dependency and filesystem-link scan.
- [ ] Empty/new Seera database confirmation.
- [ ] Storage isolation confirmation.
- [ ] Founder confirmation that infrastructure is configured.

Only after every blocking item is evidenced may Phase 1 — Independent Seera Foundation begin.

