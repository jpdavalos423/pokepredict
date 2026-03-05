# Pokepredict API Contract

Version: v1  
Last Updated: March 5, 2026

Base: API Gateway HTTP API

## Auth (MVP)
- User-scoped routes require `x-user-id: <string>`.
- Future migration target: Cognito JWT (`sub` maps to internal user id).

## Global Headers
- `Content-Type: application/json`
- `x-user-id` required for `/portfolio*` and `/alerts*`
- `Idempotency-Key` optional for create endpoints:
  - `POST /portfolio/holdings`
  - `POST /alerts`

## Response Envelope
Success:
```json
{ "ok": true, "data": {}, "error": null }
```

Error:
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "BAD_REQUEST",
    "message": "...",
    "requestId": "req_123",
    "details": { "field": ["reason"] }
  }
}
```

## HTTP Status Codes
- `200` success
- `201` created
- `204` deleted/no content
- `400` bad request / invalid cursor
- `401` missing or invalid auth header
- `404` entity not found
- `409` conflict
- `422` validation error
- `429` throttled
- `500` internal error

## Pagination
- Query params: `limit`, `cursor`
- `limit` default: `25`, max: `50`
- `cursor` is opaque signed token (`payload.signature`, base64url)
- Cursor payload (v1):
  - `route` (must match endpoint)
  - `index` (`gsi1` or `gsi2`)
  - `params` (must match request `set`/`query`)
  - `limit` (must match request `limit`)
  - `lek` (DynamoDB LastEvaluatedKey)
- Invalid cursor returns `400 INVALID_CURSOR`

## Endpoints

### GET /cards?query=&set=&limit=&cursor=
Returns paginated card browse/search results.

Validation:
- At least one of `set` or `query` is required.
- If `set` is omitted and `query` is provided: `query.length >= 2`.
- If `set` is provided and `query` is provided: `query.length >= 1`.
- `limit` must be between `1` and `50`.

Success `200` sample:
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "cardId": "sv3-198",
        "name": "Venusaur ex",
        "set": { "id": "sv3", "name": "151" },
        "number": "198",
        "rarity": "Special Illustration Rare",
        "imageUrl": "https://example.com/card.png"
      }
    ],
    "cursor": null
  },
  "error": null
}
```

### GET /cards/{cardId}
Returns card detail.
- `404 CARD_NOT_FOUND` when absent.

### GET /cards/{cardId}/price/latest
Returns latest normalized price snapshot.
- `404 PRICE_NOT_FOUND` if no ingested price exists.

### GET /cards/{cardId}/prices?range=30d|90d|1y
Returns ordered time-series points.
- Invalid range: `422 VALIDATION_ERROR`
- Empty result is valid `200` with `points: []`

### GET /cards/{cardId}/signals/latest
Returns latest signals record.
- `404 SIGNALS_NOT_FOUND` if no signal exists yet.

### GET /portfolio
Auth: `x-user-id`

Success shape:
- `summary`: `totalCostBasisCents`, `totalMarketValueCents`, `unrealizedPnLCents`, `unrealizedPnLBps`
- `holdings`: list of user holdings with computed valuation fields
- Holding order is `createdAt` descending
- No pagination in Phase 3
- Missing latest price returns `latestPrice: null` and contributes `0` to `marketValueCents`

### POST /portfolio/holdings
Auth: `x-user-id`

Request sample:
```json
{
  "cardId": "sv3-198",
  "qty": 1,
  "variant": "raw",
  "grade": null,
  "condition": "NM",
  "buyPriceCents": 9500,
  "buyDate": "2026-02-01",
  "notes": "local trade"
}
```

Behavior:
- Returns `201` with generated opaque `holdingId`
- Same `x-user-id` + same `Idempotency-Key` + same payload returns the same resource with `201` and does not create a duplicate row
- Same `x-user-id` + same `Idempotency-Key` + different payload returns `409 IDEMPOTENCY_CONFLICT`
- Without `Idempotency-Key`, normal create path still returns `201`

### DELETE /portfolio/holdings/{holdingId}
Auth: `x-user-id`

Behavior:
- `204` on success
- `404 HOLDING_NOT_FOUND` when holding does not exist for user

### GET /alerts
Auth: `x-user-id`

Returns all user alerts. Pagination is optional in MVP; if enabled, follows global cursor contract.

### POST /alerts
Auth: `x-user-id`

Request sample:
```json
{
  "cardId": "sv3-198",
  "type": "PRICE_ABOVE",
  "thresholdCents": 12000,
  "cooldownHours": 24,
  "notifyEmail": "user@example.com"
}
```

Behavior:
- Returns `201` with generated opaque `alertId`
- Valid types: `PRICE_ABOVE`, `PRICE_BELOW`

### DELETE /alerts/{alertId}
Auth: `x-user-id`

Behavior:
- `204` on success
- `404` when alert does not exist for user

## Alert Trigger Semantics (Pipeline)
Crossing-only model:
- `PRICE_ABOVE`: trigger when previous price `<= threshold` and current price `> threshold`
- `PRICE_BELOW`: trigger when previous price `>= threshold` and current price `< threshold`

Cooldown:
- If `lastTriggeredAt + cooldownHours` is in the future, suppress notification.

## Error Codes (Initial Set)
- `BAD_REQUEST`
- `UNAUTHORIZED`
- `NOT_FOUND`
- `CONFLICT`
- `VALIDATION_ERROR`
- `TOO_MANY_REQUESTS`
- `INTERNAL_ERROR`
- `INVALID_CURSOR`
- `CARD_NOT_FOUND`
- `PRICE_NOT_FOUND`
- `SIGNALS_NOT_FOUND`
- `HOLDING_NOT_FOUND`
- `IDEMPOTENCY_CONFLICT`

## Changelog
- v1 (March 5, 2026): Phase 3 portfolio contract finalized: `GET /portfolio`, `POST /portfolio/holdings`, `DELETE /portfolio/holdings/{holdingId}`, idempotency conflict semantics, and zero-market-value behavior for missing latest prices.
- v1 (March 4, 2026): Phase 2 updates: public cards/prices read endpoints implemented, limit capped at 50, signed context-aware cursor contract (`route/index/params/limit` validation).
- v1 (March 4, 2026): Initial locked API contract with envelope + HTTP statuses, opaque cursors, idempotency header, and crossing-only alert semantics.
