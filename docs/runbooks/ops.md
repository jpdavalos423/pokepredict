# Operations Runbook

## Local Validation
Run from repo root:
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Seed Cards
```bash
pnpm generate:data
```
Required env vars:
- `AWS_REGION`
- `TABLE_CARDS`

## Pipeline Manual Trigger
Start the Step Functions state machine with input:
```json
{
  "source": "fixture",
  "mode": "manual",
  "runId": "run_manual_001",
  "asOf": "2026-03-04T18:00:00.000Z"
}
```

## Failure Triage
1. Check Step Functions execution error in CloudWatch logs.
2. If failure is in `FetchRaw`, verify source config and S3 write permissions.
3. If failure is in `Normalize`, verify:
- `Cards` seed data exists
- `rawS3Key` object exists
- DynamoDB write permissions and conditional update behavior
4. Re-run with manual execution and explicit `runId` for traceability.

## Replay Guidance
- Replays with identical `runId`/timestamp inputs should overwrite deterministic keys.
- `LatestPrices` only updates when incoming `asOf` is newer.
