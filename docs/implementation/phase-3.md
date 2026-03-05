# Phase 3 Implementation Notes

Date: March 5, 2026

## Goal
Deliver portfolio holdings management and valuation APIs.

## Endpoints Added
- `GET /portfolio`
- `POST /portfolio/holdings`
- `DELETE /portfolio/holdings/{holdingId}`

## Portfolio Behavior
- Auth required via `x-user-id` on all portfolio routes
- `GET /portfolio` returns:
  - `summary`: `totalCostBasisCents`, `totalMarketValueCents`, `unrealizedPnLCents`, `unrealizedPnLBps`
  - `holdings`: base holding fields plus valuation fields and `latestPrice` (or `null`)
- `holdings` are ordered by `createdAt` descending
- No pagination in Phase 3
- Missing latest price contributes `0` market value and does not fail request

## Create Holding Idempotency
- Optional `Idempotency-Key` header supported on `POST /portfolio/holdings`
- Same user + same key + same payload:
  - returns same holding with `201`
  - does not create duplicate row
- Same user + same key + different payload:
  - returns `409 IDEMPOTENCY_CONFLICT`
- Persistence pattern:
  - primary item: `HOLDING#<holdingId>`
  - alias item: `IDEMP#<idempotencyKey>`
  - both stored in `Holdings` table

## Infra Updates
- API Gateway routes added for all 3 portfolio endpoints
- `ApiLambda` granted read/write to `Holdings`
- Existing read access to `LatestPrices` reused for valuation
- Existing cursor secret param strategy unchanged

## Verification
Run from repo root:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
