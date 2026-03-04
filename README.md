# PokePredict Monorepo (Phase 0 Scaffold)

This repository contains the Phase 0 scaffold for PokePredict.

## Workspaces
- `apps/web` - Next.js frontend skeleton
- `apps/api` - Lambda API skeleton
- `apps/pipeline` - pipeline Lambda skeletons
- `infra/cdk` - AWS CDK app + placeholder stack
- `packages/shared` - shared types, schemas, errors, constants
- `docs` - architecture and contract docs

## Requirements
- Node.js `>=22 <23`
- pnpm `10.x`

## Quickstart
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Dev Commands
```bash
pnpm dev:web
pnpm dev:api
pnpm dev:pipeline
pnpm dev:cdk
```

## Notes
- This phase intentionally includes placeholders only for API, pipeline, and infra behavior.
- Feature implementation starts in Phase 1.
