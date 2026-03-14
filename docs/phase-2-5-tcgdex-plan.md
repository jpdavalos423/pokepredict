# PokePredict Phase 2.5 Plan v1.1
## TCGdex Migration and Backend Contract Stabilization

## Summary
Phase 2.5 migrates the pricing ingestion source from the old paid API to TCGdex while preserving the existing public backend API contract used by the frontend.

This phase is a **backend normalization and contract-stabilization phase**, not a frontend redesign.

### Phase goal
Keep the frontend-facing API stable while replacing the upstream pricing source.

### Locked v1 strategy
- Keep public API routes unchanged.
- Use TCGdex as the upstream market/pricing provider.
- Ingest **TCGplayer USD pricing only** for v1.
- Use **`pricing.tcgplayer.normal`** as the canonical v1 source.
- Defer multi-market, multi-currency, and variant-aware support until after v1.

---

## Why This Phase Exists
The previous upstream provider is no longer viable for the project budget. TCGdex now becomes the pricing source.

TCGdex materially changes the upstream shape:
- pricing is embedded directly in each card response
- providers are nested under `pricing`
- TCGplayer and Cardmarket use different currencies
- variants are nested under provider objects
- providers may be missing entirely for some cards

Because of that, the backend must absorb this provider shift and present a stable contract to the existing frontend plan.

---

## Locked Public Contract Decision
### Public backend routes remain unchanged in v1
Keep these routes and response shapes stable for the frontend:

- `GET /cards`
- `GET /cards/{cardId}`
- `GET /cards/{cardId}/price/latest`
- `GET /cards/{cardId}/prices`
- `GET /cards/{cardId}/signals/latest`

### Contract preservation rule
The frontend should not consume raw TCGdex pricing objects directly in v1.

All TCGdex-specific normalization must happen in the backend and pipeline layers.

---

## Locked Canonical Mapping Policy (v1)
### Canonical upstream source
Use:

- `pricing.tcgplayer.normal`

from the TCGdex full card object as the sole canonical v1 price source.

### Canonical currency
- `USD`

### Canonical latest-price mapping
For every ingested card:

- `sourceCardId = card.id`
- `sourceName = "tcgdex"`
- `currency = "USD"`
- `marketPrice = pricing.tcgplayer.normal.marketPrice`
- `lowPrice = pricing.tcgplayer.normal.lowPrice`
- `highPrice = pricing.tcgplayer.normal.highPrice`
- `midPrice = pricing.tcgplayer.normal.midPrice` if current raw schema supports it, otherwise ignore for v1
- `recordedAt = pricing.tcgplayer.updated` if present and parseable
- fallback `recordedAt = pipeline asOf timestamp` if missing or invalid

### Canonical record inclusion rule
A card is eligible for v1 price ingestion only if:

- `pricing.tcgplayer.normal` exists
- `pricing.tcgplayer.normal.marketPrice` exists and is numeric

If either is missing:
- skip the card for price ingestion
- do not fail the run solely for that reason
- record skip reason in structured logs/metrics

### Explicit non-goals for v1 mapping
Do not ingest these in v1:
- `cardmarket`
- `tcgplayer.reverse`
- `tcgplayer.holo`
- provider fallback selection
- FX conversion
- blended pricing
- variant-specific holdings valuation

---

## History Policy for `/prices`
This must be locked now.

### Decision
`GET /cards/{cardId}/prices` remains backed by **our own stored historical snapshots**, not by a raw upstream TCGdex history endpoint.

### Source of truth for history
History will come from the project’s own `Prices` storage over time, populated by recurring ingestion runs.

### Cutover behavior
- Existing historical rows remain valid if already present.
- After migration, new historical points are appended from TCGdex-derived snapshots.
- No guarantee is made that all pre-cutover and post-cutover cards have continuous long-range history.
- Frontend charts must tolerate sparse or short histories.

### v1 guarantee
The endpoint contract remains stable, but historical depth may vary by card after cutover.

---

## Backend Changes Required

### 1. Provider implementation
Build a new `tcgdex` provider for the pipeline and register it in the fetch step.

Responsibilities:
- fetch card lists from TCGdex
- paginate through card results
- fetch full card details where pricing is needed
- emit raw canonical records consumable by normalize/store steps

### 2. Provider registry update
Update provider selection so scheduled ingestion can use `SOURCE_NAME=tcgdex`.

### 3. Default source update
Update infra/config defaults where the project still assumes `fixture` as the default pricing source.

### 4. Mapping layer
Add a dedicated raw-to-canonical mapping layer for TCGdex card responses.

This layer must:
- validate provider presence
- validate `normal` variant presence
- validate numeric `marketPrice`
- parse/normalize `recordedAt`
- emit structured skip reasons for dropped cards

### 5. Normalize/store compatibility
Confirm normalized records continue to fit existing storage schemas without immediate public API changes.

---

## ID Compatibility Requirement
Before cutover, validate that TCGdex `card.id` values match the card IDs expected by the existing `Cards` table and downstream normalization/storage logic.

### Required acceptance rule
Before production cutover, prove one of these is true:

1. TCGdex `card.id` is directly compatible with the current internal card ID format
2. a deterministic ID translation layer is implemented and tested

### Failure condition
Do not cut over if sampled ingestion shows systemic ID mismatch that would trigger normalize skip-ratio failures.

---

## Ingestion Execution Rules

### TCGdex fetch model assumption
The cards list/search response is brief; pricing is embedded in the full card object, so pricing ingestion requires:
- list pagination
- per-card detail fetches

### Pagination rules
- Use TCGdex pagination explicitly
- Assume page size up to the documented max where supported
- Make page size configurable
- Default page size should be chosen for throughput without overloading the provider

### Concurrency rules
Use bounded concurrency for per-card detail fetches.

#### Locked v1 rule
- concurrency must be configurable
- start with a conservative default such as `5` or `10`
- do not use unbounded fan-out

### Retry/backoff rules
For transient upstream failures:
- retry up to `2` additional times per request
- use exponential backoff with jitter
- treat 4xx hard validation/not-found responses as non-retriable unless clearly temporary

### Partial-failure rules
- A single failed card fetch must not fail the entire run.
- Failed card fetches should be counted and logged.
- Page-level progress should continue unless a systemic upstream outage is detected.

### Run-level failure policy
Fail the run only when one of these happens:
- normalize skip-ratio exceeds threshold
- upstream failure rate crosses an unacceptable threshold
- required persistence step fails
- the run cannot produce a meaningful snapshot

### Timeout review
Revisit pipeline timeout settings to ensure the run still completes under:
- paginated list fetching
- bounded concurrent detail fetching
- retries/backoff

---

## Logging and Metrics
Phase 2.5 should improve observability for migration safety.

### Minimum required structured metrics
Track:
- total cards scanned
- total cards with full detail fetched
- total cards successfully mapped
- total cards skipped
- skip reason counts
- total request failures
- retry counts
- normalize skip-ratio
- run duration

### Required skip reasons
At minimum:
- missing `pricing`
- missing `tcgplayer`
- missing `normal`
- missing `marketPrice`
- invalid timestamp
- unknown card ID / normalization miss

---

## API Behavior Requirements After Migration

### `/cards/{cardId}/price/latest`
Must continue returning the existing payload shape.

### `/cards/{cardId}/prices`
Must continue returning the existing payload shape backed by stored historical snapshots.

### `/cards/{cardId}/signals/latest`
No immediate signal redesign is required in Phase 2.5.

If current signal generation depends on previous pricing assumptions:
- preserve current behavior if compatible, or
- temporarily degrade gracefully without breaking the response contract

### Currency behavior
Public API continues to present canonical v1 prices in USD only.

Do not expose mixed-currency payloads in v1.

---

## UI Impact Statement
Frontend impact should remain low if this phase succeeds.

### Expected frontend impact
- no route changes
- no raw provider-shape handling in the UI
- possible reduced history depth for some cards after cutover
- possible more frequent `PRICE_NOT_FOUND` states for cards lacking `tcgplayer.normal.marketPrice`

### Explicit frontend non-goals in Phase 2.5
Do not add:
- source pickers
- currency toggles
- variant selectors
- provider comparison UI

---

## Test Plan

### Unit tests
Add unit tests for TCGdex mapping:
- happy path with valid `tcgplayer.normal`
- missing `pricing`
- missing `tcgplayer`
- missing `normal`
- missing `marketPrice`
- missing or invalid `updated`
- unknown card ID / normalize miss
- numeric parsing/validation behavior

### Provider tests
Add tests for:
- pagination behavior
- bounded concurrency
- retry and backoff logic
- partial request failure handling
- run continuation after isolated upstream failures

### Pipeline integration tests
Add integration tests confirming:
- successful ingest on a representative TCGdex sample corpus
- normalize skip-ratio stays below threshold
- latest-price rows are written correctly
- historical snapshots append correctly

### API regression tests
Confirm:
- `/cards/{cardId}/price/latest` response contract is unchanged
- `/cards/{cardId}/prices` response contract is unchanged
- error envelopes remain unchanged
- USD formatting assumptions remain valid

### UI smoke tests
Confirm card detail still behaves correctly for:
- valid latest price + valid history
- valid latest price + sparse history
- missing price resulting in `PRICE_NOT_FOUND`
- unchanged USD formatting

---

## Acceptance Criteria
Phase 2.5 is complete when all of the following are true:

1. TCGdex is the active pricing source in the backend pipeline
2. Public API routes and response shapes remain stable
3. v1 canonical mapping is locked to `pricing.tcgplayer.normal`
4. USD continuity is preserved
5. ID compatibility is validated or translated deterministically
6. `/prices` is backed by stored snapshots with an explicit continuity policy
7. pagination, concurrency, retry, and timeout strategy are implemented
8. structured migration metrics and skip reasons are available
9. regression tests pass
10. frontend Phase 2 pages can continue without route redesign

---

## Out of Scope
The following are explicitly deferred:
- Cardmarket ingestion
- EUR support
- multi-currency API responses
- variant-aware pricing and holdings valuation
- provider fallback hierarchy
- aggregated provider comparison UI
- advanced provenance dashboards
- full historical backfill repair

---

## Post-Phase Follow-up
After Phase 2.5, the next step should be a small frontend reconciliation pass:
- verify dashboard/market/card-detail pages still render correctly
- verify chart behavior with real migrated data
- verify empty/error states on cards lacking canonical price data

That follow-up can be treated as a small frontend Phase 2.6 or folded into the next frontend phase.