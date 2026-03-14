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

## Seed Cards
```bash
pnpm generate:data
```
Requires `TABLE_CARDS` and `AWS_REGION` env vars (see `.env.example`).

To seed cards from TCGdex (recommended for Phase 2.5+):
```bash
pnpm generate:data:tcgdex
```
Requires `TABLE_CARDS` and `AWS_REGION`; optional TCGdex knobs are in `.env.example`.

## Phase 1 Fast Deploy
```bash
pnpm deploy:phase1
```
This builds pipeline artifacts, vendors runtime deps, deploys CDK, seeds cards, and triggers one manual ingestion run.
`deploy:phase1` is a legacy command name. For Phase 2.5+, it defaults to `SOURCE_NAME=tcgdex` and seeds cards with `generate:data:tcgdex`.

Use overrides only when intentionally validating fixture mode:
```bash
SOURCE_NAME=fixture SEED_SOURCE=fixture pnpm deploy:phase1
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

## Phase 2
- Public read endpoints are available via API Gateway:
  - `/cards`
  - `/cards/{cardId}`
  - `/cards/{cardId}/price/latest`
  - `/cards/{cardId}/prices?range=30d|90d|1y`
- API requires `CURSOR_SIGNING_SECRET` in environment for cursor signing/validation.
