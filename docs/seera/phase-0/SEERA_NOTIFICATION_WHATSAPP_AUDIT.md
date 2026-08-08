# Seera Notification and WhatsApp Audit

## Existing capability

- `lib/messaging/index.ts` selects Twilio, MSG91, Interakt or WhatsApp Business providers through a common interface.
- `lib/notify/send-messaging.ts`, `send.ts`, provider email code and `NotificationLog` provide outbound delivery patterns and status logging.
- Founder notifications have recipient/read fields and organisation keys.
- Templates exist in code (`lib/notify/templates.ts`); shipping/payment webhooks demonstrate verified inbound event handling.

## Capability classification

| Capability | State | Finding / change |
|---|---|---|
| Email and WhatsApp send adapters | Existing | Add organisation-owned credentials/sender identity and consent |
| Delivery attempt log | Existing/partial | `NotificationLog` lacks universal org/inbox semantics |
| In-app inbox/read state | Partial | Founder-only pattern; create shared organisation inbox |
| Role/entity targeting | Partial | Resolve recipients through active memberships and assignments |
| Templates/variables | Partial | Code templates; need versioned org templates, variable schemas, locale and approval |
| Retry/backoff/dead letter | Missing/partial | Durable outbox, attempt history, provider error classification and replay |
| Provider webhooks | Missing for messaging | Signature verification, delivery/read status, idempotency and tenant routing |
| Preferences/quiet hours | Missing | Per membership/event/channel preference; transactional exceptions documented |
| Consent/opt-out | Partial customer marketing opt-in | Separate lawful WhatsApp consent and audit evidence |
| Organisation sender | Missing | Seera WABA/email identity must never fall back to MUV |

## Required event catalogue

Create versioned events for checkout/order confirmation, distributor receipt/pending delivery, completed/failed delivery, payment reminder/proof accepted/rejected, quotation generation/expiry, target warning, manager instruction, stock shortage, claim and expense updates. Each event carries `organizationId`, source type/id/version, audience policy, dedupe key, template version and correlation ID.

## Architecture recommendation

Use transactional outbox -> recipient resolver -> preference/consent policy -> renderer -> provider adapter -> attempt log. Create an inbox row independently of external delivery. Recipient resolution must validate current membership/partner/territory at dispatch time. Templates and sender configuration are organisation-owned and fail closed if Seera configuration is missing. Attachments/links use short-lived signed authorization, not public cross-entity URLs.

## Operational controls

Rate limits per organisation/recipient/event, provider circuit breaker, exponential backoff, bounded retry, manual replay permission, redacted logs, webhook signature verification against raw body, template-variable allowlists, delivery-status idempotency and dashboards for failures/opt-outs. Notification content must minimize ledger/bank/GPS detail.

