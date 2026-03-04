# Phase 1 Implementation Notes

Date: March 4, 2026

## Goal
Deliver the data platform foundation:
- ingest fixture source payloads on schedule/manual run
- archive raw payloads in S3
- normalize and persist price data into `Prices` and `LatestPrices`

## Pipeline Chain
1. `StartRun`
2. `FetchRaw`
3. `Normalize`

`StartRun` is the canonical run-context initializer.
EventBridge does not generate run IDs. Scheduled events send only:
```json
{ "source": "fixture", "mode": "scheduled" }
```

## What Was Added
- Shared Phase 1 pipeline contracts/types/schemas in `packages/shared`
- Fixture source adapter in `apps/pipeline/src/providers`
- Production handlers:
  - `startRun.ts`
  - `fetchRaw.ts`
  - `normalize.ts`
- Phase 1 infra in CDK:
  - all v1 DynamoDB tables
  - raw archive S3 bucket (CDK-generated unique name)
  - 3 Lambda functions
  - Step Functions orchestration
  - daily EventBridge schedule (`06:00 UTC`)
  - CloudWatch alarms for failures/errors
- Card seed bootstrap tooling:
  - `data/cards.seed.json`
  - `scripts/bootstrap-cards.ts`

## Operational Commands
```bash
pnpm build
pnpm test
pnpm generate:data
pnpm --filter @pokepredict/cdk dev
pnpm deploy:phase1
```

## Manual State Machine Trigger (example)
Use AWS CLI `stepfunctions start-execution` with input:
```json
{
  "source": "fixture",
  "mode": "manual",
  "runId": "run_manual_001",
  "asOf": "2026-03-04T18:00:00.000Z"
}
```
