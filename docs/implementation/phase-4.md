# Phase 4 Implementation Notes

Date: March 6, 2026

## Goal
Deliver computed market signals and a public latest-signals read endpoint.

## Pipeline Changes
- Added `ComputeSignals` after `Normalize` in Step Functions:
  - `StartRun -> FetchRaw -> Normalize -> ComputeSignals`
- `ComputeSignals` processes only `Normalize.updatedCardIds`.
- Writes/upserts daily signal rows in `Signals` table with key:
  - `pk = CARD#<cardId>`
  - `sk = ASOF#<YYYY-MM-DD>`

## Signal Metrics
- `ret7dBps` and `ret30dBps`:
  - baseline is latest point at or before `asOf - N days`
  - if baseline missing/invalid, metric is `0`
- `vol30dBps`:
  - population standard deviation of sequential trailing returns in bps
  - fewer than 2 return points -> `0`
- `trend` from `ret30dBps`:
  - `UPTREND` if `>= 300`
  - `DOWNTREND` if `<= -300`
  - `SIDEWAYS` otherwise

## API Changes
- Implemented `GET /cards/{cardId}/signals/latest`
- Behavior:
  - `200` with latest signal envelope when found
  - `404 SIGNALS_NOT_FOUND` when missing

## Infra Changes
- Added `ComputeSignalsFunction` Lambda.
- Added IAM grants:
  - compute signals: read `Prices`, write `Signals`
  - API Lambda: read `Signals`
- Added `ComputeSignalsErrorsAlarm`.
- Added API route:
  - `GET /cards/{cardId}/signals/latest`

## Verification
Run from repo root:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
