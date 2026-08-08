# Phase 10 Intelligence Rules

Implemented explainable rules: next retailer/action, dormant retailer, reorder signal, stock-shortage risk, target gap/run-rate and collection priority. Results expose code, severity, explanation, source metrics, generation/expiry time, confidence and optional action path. Reorder signals never create orders and collection signals never change contractual credit or original due dates.

Severity vocabulary is INFO, SUCCESS, WARNING, HIGH and CRITICAL. Persistence supports active, dismissed, resolved and expired states with unique deduplication keys.
