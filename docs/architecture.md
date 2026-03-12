# Pokepredict Architecture

## Components
- Web UI: Next.js app in `apps/web`
- API: API Gateway -> Lambda (`apps/api`)
- Pipeline: EventBridge -> Step Functions -> pipeline Lambdas
- Data: DynamoDB tables defined in `docs/data-model.md`
- Raw archive: S3 bucket for source payloads
- Alerts delivery: SES (Phase 5)
- IaC: AWS CDK in `infra/cdk`

## Implemented Pipeline Data Flow (Phase 1 + Phase 4)
1. EventBridge schedule triggers Step Functions with fixed input:
   - `source=fixture`
   - `mode=scheduled`
2. `StartRun` stamps:
   - `runId` (provided or generated)
   - `asOf` (provided or current UTC)
3. `FetchRaw` obtains fixture data and writes raw JSON to S3 at:
   - `raw/<source>/YYYY/MM/DD/HH/<runId>.json`
4. `Normalize` reads raw payload, maps to canonical card IDs from `Cards`, and writes:
   - `Prices` time-series points
   - `LatestPrices` snapshots guarded by newer `asOf`
5. `ComputeSignals` reads recent `Prices` for updated cards and upserts daily `Signals`:
   - `ret7dBps`, `ret30dBps`, `vol30dBps`, `trend`

## Planned Later Steps
- `AlertsEval` + SES notifications (Phase 5)

## Operational Baseline
- Structured JSON logs include run context (`runId`, `source`, `mode`).
- CloudWatch alarms on:
  - Step Functions failures
  - Lambda errors (`StartRun`, `FetchRaw`, `Normalize`)
