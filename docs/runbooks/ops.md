# Operations Runbook (Phase 0)

## Purpose
Provide baseline operational guidance for local scaffold validation and future incident docs.

## Local Validation
Run from repo root:
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Current Known Warnings
- Engine warning appears if local Node is not `>=22 <23`.
- Next.js may warn about ESLint plugin migration; this does not block Phase 0 acceptance.

## Future Runbook Additions (Phase 1+)
- Pipeline failure triage
- Replay and idempotency playbook
- Alert delivery troubleshooting
- DynamoDB throughput and error handling guidance
