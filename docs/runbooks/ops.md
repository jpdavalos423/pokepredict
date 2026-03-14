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

## Phase 2 API Smoke
After deploy, verify:
1. `GET /health`
2. `GET /cards?set=<setId>&limit=25`
3. `GET /cards?query=ch&limit=25`
4. `GET /cards/<cardId>`
5. `GET /cards/<cardId>/price/latest`
6. `GET /cards/<cardId>/prices?range=30d`
7. Cursor tamper check (`cursor` modified) returns `400 INVALID_CURSOR`.

## Endpoint Usability Verifier
Run the deterministic live verifier (includes a manual `tcgdex` ingestion trigger by default):
```bash
API_PROXY_TARGET=<api_base_url> pnpm verify:price:endpoints
```

Optional knobs:
- `INGESTION_ARN` (or `.phase1.env`) to locate the state machine
- `SKIP_INGESTION=1` to run checks without triggering a new ingestion
