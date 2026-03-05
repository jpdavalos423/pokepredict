# Phase 2 Implementation Notes

Date: March 4, 2026

## Goal
Deliver the public read API for cards and prices on top of Phase 1 data.

## Endpoints Added
- `GET /cards`
- `GET /cards/{cardId}`
- `GET /cards/{cardId}/price/latest`
- `GET /cards/{cardId}/prices?range=30d|90d|1y`

## Query and Pagination Rules
- `limit` default `25`, max `50`
- At least one of `set` or `query` required
- Query minimum length:
  - query-only: `>= 2`
  - set+query: `>= 1`
- Cursor is signed and context-bound. Any route/index/params/limit mismatch returns `400 INVALID_CURSOR`.

## Cursor Format (v1)
`<payload>.<signature>` (base64url)

Payload fields:
- `v`
- `route`
- `index`
- `params`
- `limit`
- `lek`

## Infra Additions
- `ApiLambda` (NodejsFunction + esbuild bundling)
- API Gateway HTTP API routes for Phase 2 + `/health`
- Stage throttling (`burst=100`, `rate=50`)
- IAM read grants for `Cards`, `Prices`, `LatestPrices`
- CloudWatch alarms for ApiLambda errors and API 5XX
- Outputs:
  - `ApiBaseUrl`
  - `ApiLambdaName`

## Environment
New API/CDK variable:
- `CURSOR_SIGNING_SECRET`

## Verification
Run from repo root:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
