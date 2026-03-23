# Frontend Next Steps — Phase A

Date: March 22, 2026
Status: Ready for implementation

## Goal
Ship the Phase A foundation for stability and core usability:
- #2 Mobile navigation that is actually usable on small screens.
- #3 Missing-data handling that treats expected gaps as normal states, not failures.
- #7 Deterministic Playwright smoke coverage for core journeys.

## Summary
Phase A delivers three production changes in one cohesive batch:
1. Add a mobile bottom tab bar while preserving desktop top navigation.
2. Normalize card-detail not-found data handling into soft empty-state UX.
3. Replace skipped E2E scaffold with deterministic smoke tests that exercise nav, browse, detail, and CRUD critical paths.

This phase does not introduce backend contract changes and does not include data-completeness work (#1).

## Implementation Plan

### 1) Mobile Navigation (#2)
- Keep existing desktop nav behavior intact.
- Add a persistent bottom tab bar for mobile breakpoints only (Dashboard, Market, Portfolio, Alerts).
- Reuse current active-path logic so active state stays consistent across desktop and mobile nav.
- Ensure tabs are accessible:
  - `aria-label="Primary"` on nav container.
  - `aria-current="page"` on active tab.
  - touch targets at least 44px.
- Keep compact mobile header title, but it becomes informational only; section switching is via tab bar.
- Include bottom safe-area padding and page-content spacing so content does not hide behind the tab bar.

### 2) Missing-Data UX Hardening (#3)
- In card detail data loading, classify API outcomes into two groups:
  - Expected no-data responses:
    - `PRICE_NOT_FOUND` for latest price.
    - `SIGNALS_NOT_FOUND` for latest signal.
    - `404`/empty points for price history already supported by current chart-empty behavior.
  - True failure responses:
    - network failure, malformed envelope, non-expected error codes, and 5xx responses.
- For expected no-data responses:
  - Do not surface page-level error banner.
  - Render existing soft states (`Latest price unavailable`, `Signal coverage pending`, empty chart messaging).
- For true failures:
  - Preserve current error banner and retry affordance.
- Keep card-not-found route behavior unchanged (`CARD_NOT_FOUND`/`NOT_FOUND` -> dedicated not-found empty state).

### 3) Deterministic E2E Smoke Coverage (#7)
- Replace `placeholder.spec.ts` skip scaffold with real smoke specs.
- Use deterministic local test data (seeded/local fixture API) rather than live remote API.
- Establish a stable E2E environment:
  - Web app runs on Playwright-managed port.
  - API requests resolve to deterministic local fixture source (no live dependency).
  - Test data includes:
    - one card with full price/signal history,
    - one card with `PRICE_NOT_FOUND` and `SIGNALS_NOT_FOUND`,
    - minimum holdings/alerts data for create/delete assertions.
- Implement smoke scenarios:
  - Desktop nav route switching works.
  - Mobile tab bar appears and route switching works.
  - Market search -> card detail loads.
  - Missing-data card shows soft states and no blocking error UI.
  - Portfolio create/delete succeeds and UI summary updates.
  - Alerts create/delete succeeds and UI summary updates.
- Keep chart-interaction spec deterministic; remove any dependency on non-deterministic remote data.

## Interface / Contract Notes
- No backend endpoint additions or schema changes in Phase A.
- No new public URL contracts introduced in this phase.
- Frontend behavior contract update:
  - Expected no-data codes on card detail are treated as normal render states, not error states.

## Test Plan
- E2E:
  - `pnpm test:e2e` passes with deterministic local API data.
  - No test relies on live remote API availability.
- Unit/component:
  - active-route computation reused for mobile tabs.
  - missing-data classifier behavior for expected vs unexpected API errors.
- Manual QA:
  - iPhone-size viewport confirms persistent bottom tabs and non-obscured content.
  - Card detail with sparse/missing data remains informative and actionable.

## Acceptance Criteria
- Mobile users can navigate between all primary sections without hidden/desktop-only controls.
- Card detail does not show hard-error UX for expected price/signal gaps.
- Playwright suite includes core journeys and runs deterministically in local dev/CI.
- Existing desktop nav and current non-Phase-A behavior do not regress.

## Out of Scope
- Data completeness/provider ingestion improvements (#1).
- Discoverability and quick-action work (#4/#5).
- Broad visual consistency pass (#8).
- Persisted edit functionality (#6).

## Dependencies / Risks
- Deterministic E2E requires a stable local fixture data source; setup is mandatory before finalizing smoke tests.
- Existing in-progress frontend changes in the working tree must be respected; Phase A implementation should avoid reverting unrelated work.

## Inputs
- Overview: `docs/implementation/frontend-next-steps-overview.md`
