# Phase 5 Implementation Notes

Date: March 12, 2026

## Goal
Deliver alerts CRUD APIs plus automated evaluation and SES notifications.

## API Endpoints Added
- `GET /alerts`
- `POST /alerts`
- `DELETE /alerts/{alertId}`

## Alerts API Behavior
- Auth required via `x-user-id` on all alert routes.
- `GET /alerts` returns full list (no pagination in Phase 5).
- `POST /alerts` supports optional `Idempotency-Key`:
  - same key + same payload -> same `201` alert
  - same key + different payload -> `409 IDEMPOTENCY_CONFLICT`
  - no key -> normal create; duplicates allowed
- `DELETE /alerts/{alertId}`:
  - `204` on success
  - `404 ALERT_NOT_FOUND` when missing

## Pipeline Changes
- Step Functions chain is now:
  - `StartRun -> FetchRaw -> Normalize -> ComputeSignals -> AlertsEval`
- `AlertsEval` uses `ComputeSignals.updatedCardIds` to limit evaluation scope.
- Triggering rules:
  - `PRICE_ABOVE`: previous `<= threshold` and current `> threshold`
  - `PRICE_BELOW`: previous `>= threshold` and current `< threshold`
- Cooldown suppresses repeated sends until `lastTriggeredAt + cooldownHours`.
- On trigger:
  - SES email sent to `notifyEmail`
  - `lastTriggeredAt` updated transactionally in `AlertsByUser` and `AlertsByCard`

## Persistence Notes
- Alert rows are mirrored in:
  - `AlertsByUser` (`USER#...` / `ALERT#...`)
  - `AlertsByCard` (`CARD#...` / `ALERT#...`)
- Idempotency alias rows are stored in `AlertsByUser` as:
  - `USER#...` / `IDEMP#...`

## Infra Changes
- Added API Gateway routes for alerts CRUD.
- Added `AlertsEvalFunction` Lambda.
- Added IAM access for alert tables and SES send action.
- Added `AlertsEvalErrorsAlarm`.
- Added required runtime env for SES sender identity (`SES_FROM_EMAIL`).

## Verification
Run from repo root:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
