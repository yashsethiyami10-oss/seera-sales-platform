# Phase 10 Intelligence Rules

Implemented explainable rules: next retailer/action, dormant retailer, reorder signal, stock-shortage risk, target gap/run-rate and collection priority. Results expose code, severity, explanation, source metrics, generation/expiry time, confidence and optional action path. Reorder signals never create orders and collection signals never change contractual credit or original due dates.

Closure adds configurable slow-moving SKU (movement/window/threshold), distributor-development (staleness/follow-up/pipeline state with explicit no-auto-activation) and fulfilment-risk (pending duration, partial quantity, stock, credit hold and operational exceptions) rules.

Severity vocabulary is INFO, SUCCESS, WARNING, HIGH and CRITICAL. Persistence supports active, dismissed, resolved and expired states with unique deduplication keys.
