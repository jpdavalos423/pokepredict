# Pokepredict Data Model

Version: v1  
Last Updated: March 5, 2026

## Key Conventions
- Card partition key prefix: `CARD#<cardId>`
- User partition key prefix: `USER#<userId>`
- Time-series sort key prefix: `TS#<ISO8601Z>`
- Monetary values are integer cents (e.g. `marketCents`)
- Returns and volatility are basis points (bps)
- Common metadata on all mutable records:
  - `createdAt` (ISO8601 UTC)
  - `updatedAt` (ISO8601 UTC)
  - `version` (integer)

## Tables

### Cards
Primary key:
- `pk = CARD#<cardId>`
- `sk = META`

Attributes:
- `cardId`, `name`, `normalizedName`, `setId`, `setName`, `number`, `rarity`, `imageUrl`
- `createdAt`, `updatedAt`, `version`

GSIs:
- `gsi1pk = SET#<setId>`, `gsi1sk = NAME#<normalizedName>#NUM#<number>`
- `gsi2pk = NAME#<firstLetter>`, `gsi2sk = NAME#<normalizedName>#SET#<setId>#NUM#<number>`

Access patterns:
- Get card by id: `GetItem`
- Browse by set: `Query` GSI1
- Prefix search (query-only): `Query` GSI2 (`NAME#<firstLetter>` + `begins_with(gsi2sk, NAME#<normalizedQuery>)`)
- Set + query narrowing: `Query` GSI1 with `begins_with(normalizedName, <normalizedQuery>)` filter

### Prices
Primary key:
- `pk = CARD#<cardId>`
- `sk = TS#<ISO8601Z>`

Attributes:
- `cardId`, `ts`, `marketCents`, `lowCents`, `highCents`, `currency`, `source`, `runId`
- `createdAt`, `updatedAt`, `version`

Access patterns:
- Time-series chart by range: `Query` with SK between bounds

### LatestPrices
Primary key:
- `pk = CARD#<cardId>`
- `sk = LATEST`

Attributes:
- `cardId`, `asOf`, `marketCents`, `lowCents`, `highCents`, `currency`, `source`, `runId`
- `createdAt`, `updatedAt`, `version`

Access patterns:
- Latest for card: `GetItem`
- Portfolio valuation: `BatchGetItem`

Write rule:
- Upsert only when incoming `asOf` is newer than stored value.

### Holdings
Primary key:
- `pk = USER#<userId>`
- `sk = HOLDING#<holdingId>`

Attributes:
- `holdingId`, `userId`, `cardId`, `qty`, `variant`, `grade`, `condition`
- `buyPriceCents`, `buyDate`, `notes`
- optional `requestHash` (present when idempotency key is used)
- `createdAt`, `updatedAt`, `version`

Access patterns:
- List holdings for user: `Query` on `USER#<userId>` + `begins_with(sk, HOLDING#)`
- Get/delete specific holding: `GetItem`/`DeleteItem`

ID policy:
- `holdingId` is opaque and server-generated (ULID or UUID).

Idempotency alias records (same `Holdings` table):
- `pk = USER#<userId>`
- `sk = IDEMP#<idempotencyKey>`
- Attributes: `holdingId`, `requestHash`, `createdAt`, `updatedAt`, `version`, `entityType=IDEMP`

Create semantics with idempotency:
- `POST /portfolio/holdings` with `Idempotency-Key` uses `TransactWriteItems` to write both `HOLDING#` and `IDEMP#` items
- Replayed same-key same-payload resolves via alias lookup and returns original holding
- Replayed same-key different-payload returns `409 IDEMPOTENCY_CONFLICT`

### AlertsByUser
Primary key:
- `pk = USER#<userId>`
- `sk = ALERT#<alertId>`

Attributes:
- `alertId`, `userId`, `cardId`, `type`, `thresholdCents`, `cooldownHours`, `notifyEmail`, `enabled`, `lastTriggeredAt`
- `createdAt`, `updatedAt`, `version`

Access patterns:
- List alerts by user: `Query` on user partition
- Delete user alert: `DeleteItem`

### AlertsByCard
Primary key:
- `pk = CARD#<cardId>`
- `sk = ALERT#<alertId>`

Attributes:
- Mirror evaluation fields from `AlertsByUser`

Access patterns:
- Evaluate alerts for updated card: `Query` by card partition (no scans)

Write policy:
- `TransactWriteItems` keeps `AlertsByUser` and `AlertsByCard` in sync.

### Signals
Primary key:
- `pk = CARD#<cardId>`
- `sk = ASOF#<YYYY-MM-DD>`

Attributes:
- `cardId`, `asOfDate`, `ret7dBps`, `ret30dBps`, `vol30dBps`, `trend`
- Optional future fields: `pred7dLowBps`, `pred7dHighBps`
- `createdAt`, `updatedAt`, `version`

Access patterns:
- Latest signals: reverse `Query` + `Limit 1`
- Historical signals: bounded `Query`

## Access Pattern Matrix
- `GET /cards`: GSI-backed query (`Cards`)
- `GET /cards/{cardId}`: `Cards.GetItem`
- `GET /cards/{cardId}/price/latest`: `LatestPrices.GetItem`
- `GET /cards/{cardId}/prices`: `Prices.Query`
- `GET /cards/{cardId}/signals/latest`: `Signals.Query` reverse + 1
- `GET /portfolio`: `Holdings.Query` + `LatestPrices.BatchGetItem`
- `POST /portfolio/holdings`: `Holdings.PutItem` or transactional `Put(HOLDING#) + Put(IDEMP#)` when `Idempotency-Key` is present
- `DELETE /portfolio/holdings/{holdingId}`: `Holdings.DeleteItem`
- `GET /alerts`: `AlertsByUser.Query`
- `POST /alerts`: transactional dual write (`AlertsByUser` + `AlertsByCard`)
- `DELETE /alerts/{alertId}`: transactional dual delete
- Alerts pipeline evaluation: `AlertsByCard.Query`

## Idempotency and Replay
- Pipeline execution includes `runId` and writes `runId` to derived records.
- Replaying a run with same timestamps is safe (same primary keys overwrite deterministically).
- Portfolio create idempotency is persisted in `Holdings` alias records (`IDEMP#<idempotencyKey>`) with payload hash checks.

## Read Consistency
- Default eventual consistency for list/history operations.
- Latest price read may use strong consistency when user-facing freshness is critical.

## Changelog
- v1 (March 5, 2026): Phase 3 updates: holdings idempotency alias record pattern (`IDEMP#`) and transactional create semantics for portfolio holdings.
- v1 (March 4, 2026): Phase 2 clarifications for no-scan card read paths (`GSI2` prefix search and `GSI1` set+query narrowing filter).
- v1 (March 4, 2026): Initial locked Phase 0 model with multi-table strategy, opaque IDs, and access-pattern mapping.
