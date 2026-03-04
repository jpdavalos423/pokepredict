# Pokepredict Architecture (Phase 0 Baseline)

## Components
- Web UI: Next.js app in `apps/web`
- API: API Gateway -> Lambda (`apps/api`)
- Pipeline: EventBridge -> Step Functions -> pipeline Lambdas (`apps/pipeline`)
- Data: DynamoDB tables defined in `docs/data-model.md`
- Raw archive: S3 bucket for source payloads
- Alerts delivery: SES
- IaC: AWS CDK in `infra/cdk`

## Data Flow (Target)
1. EventBridge triggers Step Functions with `runId`, `source`, `mode`.
2. `FetchRawLambda` fetches source payload and stores raw JSON in S3.
3. `NormalizeLambda` canonicalizes card IDs and writes to `Prices` and `LatestPrices`.
4. `ComputeSignalsLambda` computes derived metrics and writes to `Signals`.
5. `AlertsEvalLambda` checks `AlertsByCard`, applies cooldown/crossing logic, and sends SES notifications.

## API Flow (Target)
- Web app calls API endpoints via API Gateway.
- Lambda handlers validate inputs and return standardized envelope responses.
- DynamoDB access patterns avoid full table scans in primary flows.

## Operational Baseline
- Structured JSON logs for handlers and pipeline steps.
- CloudWatch alarms for Step Functions failures and Lambda error rates.
- MVP auth: `x-user-id` header; future path to Cognito JWT.
