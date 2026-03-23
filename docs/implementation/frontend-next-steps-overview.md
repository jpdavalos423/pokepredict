# Frontend Next Steps Overview (#2-#8)

Date: March 22, 2026

## Purpose
Capture the agreed implementation direction for priorities #2-#8 while keeping #1 (data completeness) out of scope for now.

## Scope
- In scope: #2 mobile navigation, #3 missing-data UX hardening, #4 discoverability improvements, #5 quick-action deep links, #7 E2E coverage, #8 targeted consistency pass.
- Deferred: #6 true persisted edit flows (until backend update semantics exist).
- Out of scope: #1 data completeness/provider work.

## Locked Product/Implementation Decisions
- Delivery strategy: phased PRs.
- #2 mobile nav pattern: bottom tab bar.
- #3 missing-data behavior: soft empty states for expected not-found responses.
- #4 discoverability scope: lightweight.
- #5 quick-action pattern: deep-link prefill into existing forms.
- #6 edit flow policy: defer true edit.
- #7 E2E data strategy: seeded local API.
- #8 polish scope: targeted consistency (not visual revamp).
- Copy policy: remove stale phase references from user-facing UI copy.

## Phase Sequence

### Phase A (Stability + Core Usability)
- #2 Mobile bottom tab navigation on small screens.
- #3 Expected missing-data states handled as non-error UX.
- #7 Replace skipped Playwright placeholder with real deterministic smoke coverage.

See: `docs/implementation/frontend-next-steps-phase-a.md`

### Phase B (Discovery + Workflow + Consistency)
- #4 Lightweight market discoverability enhancements.
- #5 Deep-link quick actions from Market/Card pages into prefilled Portfolio/Alerts forms.
- #8 Targeted consistency/copy cleanup across major pages.

See: `docs/implementation/frontend-next-steps-phase-b.md`

### Phase C (Edit Foundations, No Persisted Edit)
- #6 Deferred true edit flow.
- Prepare shared form/util groundwork and document backend requirements for future real edit support.

See: `docs/implementation/frontend-next-steps-phase-c.md`

## Public Interface Changes (Planned)
- Query-parameter prefill contract:
  - `/portfolio?cardId=<id>`
  - `/alerts?cardId=<id>&type=PRICE_ABOVE`
- No backend route/schema changes in this wave.

## Baseline Validation Plan
- E2E flows:
  - Desktop + mobile navigation behavior.
  - Market search to card detail path.
  - Missing price/signal card detail empty-state behavior.
  - Portfolio create/delete.
  - Alerts create/delete.
- Unit/component checks for:
  - active-route nav state,
  - query-param prefill parsing,
  - missing-data classification.

## Assumptions
- Existing backend APIs remain unchanged.
- Seeded local data is available for deterministic Playwright runs.
- #6 true edit implementation waits on backend support for update semantics.
