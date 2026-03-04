# Phase 0 Implementation Notes

Date: March 4, 2026

## Goal
Establish a runnable monorepo scaffold with shared contracts and quality gates, without implementing Phase 1+ business logic.

## What Was Scaffolded
- Workspace and tooling:
  - pnpm workspace
  - strict TypeScript baseline
  - ESLint, Vitest, Playwright placeholder
- Applications:
  - `apps/web` Next.js TypeScript skeleton
  - `apps/api` Lambda handler skeleton with health route
  - `apps/pipeline` four placeholder handlers
- Infrastructure:
  - `infra/cdk` app and placeholder stack
- Shared package:
  - entity and API envelope types
  - runtime schema stubs
  - error code and envelope helpers
  - constants for limits/ranges
- Documentation:
  - `docs/data-model.md` (v1)
  - `docs/api-contract.md` (v1)

## Conventions Locked
- Node runtime baseline: `>=22 <23`
- Package manager: `pnpm`
- Test stack: Vitest with Playwright placeholder
- Auth contract (MVP): `x-user-id`
- ID contract: opaque IDs (`holdingId`, `alertId`)
- Cursor contract: opaque base64 cursor

## Deferred to Later Phases
- Real DynamoDB integration
- Step Functions/CDK resource implementation
- Source fetch and normalization logic
- Portfolio computation and alert evaluation logic

## Validation Checklist
- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
