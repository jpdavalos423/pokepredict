# Pokepredict PRD (Phase-Oriented)

## Overview
Pokepredict is a serverless AWS platform for Pokemon TCG market intelligence:
- scheduled price ingestion
- normalized time-series and latest snapshots
- portfolio valuation and unrealized P/L
- rule-based threshold alerts

## Goals
- Demonstrate clean serverless architecture + IaC
- Ship usable cards/prices APIs first, then portfolio/signals/alerts
- Keep MVP scope intentionally small and delivery phase-based

## Non-Goals (MVP)
- Trading marketplace
- Real-time streaming prices
- Complex ML models
- Mobile application

## Phases
- Phase 0: Monorepo scaffold + contracts lock (this repo state)
- Phase 1: Data platform (ingestion, normalization, latest/time-series writes)
- Phase 2: Public API (cards and prices)
- Phase 3: Portfolio (holdings CRUD + valuation)
- Phase 4: Signals (ret7d/ret30d/vol30d/trend)
- Phase 5: Alerts (CRUD + eval + SES)
- Phase 6: Optional predict extension

## MVP Scope Guardrails
- Limited card seed set for ingestion
- TypeScript across web/API/pipeline/CDK
- Simple search and set browse, not advanced search indexing
