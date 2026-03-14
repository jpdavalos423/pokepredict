# PokePredict Frontend Implementation Phases

## Purpose
This document breaks the PokePredict frontend build into sequential implementation phases for Codex. Each phase is intentionally scoped to reduce diff size, improve reviewability, and keep styling/API integration aligned with the implementation plan and theme spec.

Codex should complete phases in order unless explicitly told otherwise.

## Global Instructions for Every Phase
Before making changes, Codex must follow these rules:

1. Follow `docs/theme-spec.md` exactly.
2. Follow the frontend implementation plan exactly.
3. Keep the UI dark-mode only for v1.
4. Use a premium, minimal, chart-first dashboard style.
5. Prefer clean, maintainable abstractions over clever ones.
6. Reuse shared components wherever possible.
7. Do not invent new backend endpoints.
8. Use the existing backend contract and same-origin proxy strategy described in the implementation plan.
9. Keep Pokémon flavor subtle and never game-like.
10. Ensure loading, empty, error, and responsive states are handled.
11. Keep diffs scoped only to the current phase.
12. Do not perform unrelated refactors.

---

# Phase 1 — Foundation and App Shell

## Goal
Establish the frontend foundation so all later pages share a consistent theme, layout system, component base, and API integration structure.

## Scope
Implement only the shared foundation. Do not build full feature pages yet.

## Tasks
- Set up or finalize Tailwind configuration.
- Set up or finalize shadcn/ui usage.
- Add Inter as the primary font.
- Define the app theme tokens based on `docs/theme-spec.md`.
- Configure dark-mode-only styling.
- Create the global app shell.
- Create sticky desktop top nav and compact mobile header.
- Create a centered max-width container layout.
- Create shared primitives/components such as:
  - page container
  - section header
  - dashboard/stat card
  - standard card
  - empty state
  - error banner
  - loading skeleton
  - badge component
  - button/input styling wrappers if needed
- Create frontend API client structure and shared request helpers.
- Create shared TypeScript types for the backend response envelope and major domain objects if not already present.
- Implement same-origin API base usage according to the implementation plan.
- Add utility helpers for formatting currency, percentages, and dates where needed.

## Deliverables
- Theme tokens implemented
- Shared layout shell implemented
- Navigation implemented
- Shared reusable UI primitives implemented
- API client scaffolding implemented
- No full feature pages beyond placeholders

## Acceptance Criteria
- The app has a consistent dark premium shell.
- The nav/header works on desktop and mobile.
- Shared cards, badges, empty states, loading states, and error banners exist.
- Theme colors, spacing, radii, and typography reflect the theme spec.
- API client code is organized for later phases.
- The codebase is ready for page implementation without redoing the design system.

## Out of Scope
- Full dashboard data
- Market data rendering
- Card detail data rendering
- Portfolio CRUD
- Alerts CRUD

---

# Phase 2 — Read-Only Pages and Data Display

## Goal
Implement the core read-only product experience: dashboard, market, and card detail.

## Scope
Focus on reading and displaying backend data cleanly. Do not build mutation-heavy workflows yet.

## Tasks
- Implement dashboard page.
- Implement market page.
- Implement card detail page.
- Wire each page to the existing backend endpoints defined in the implementation plan.
- Use the shared API client and shared UI primitives from Phase 1.
- Implement loading states for all read-only pages.
- Implement empty states where applicable.
- Implement page-level error banners and retry behavior for GET requests.
- Implement not-found state for missing card detail pages.
- Ensure the chart is the hero element on the card detail page.
- Keep the market page clean and scan-friendly.
- Keep dashboard cards compact, elevated, and trustworthy.

## Required Backend Mapping
- `/` dashboard:
  - `GET /portfolio` for summary data
  - `GET /alerts` for alert count
- `/market`:
  - `GET /cards`
- `/cards/[cardId]`:
  - `GET /cards/{id}`
  - `GET /price/latest?cardId=...`
  - `GET /prices?cardId=...`
  - `GET /signals/latest?cardId=...`

## Deliverables
- Functional dashboard page
- Functional market page
- Functional card detail page
- Read-only backend integration working
- Responsive layouts for these pages

## Acceptance Criteria
- Dashboard renders summary information cleanly.
- Market page renders card results in a clean grid.
- Card detail page renders chart-first layout with supporting metadata.
- Each page handles loading, error, and empty states appropriately.
- Card not found routes show a dedicated not-found state.
- Styling remains consistent with the theme spec.

## Out of Scope
- Creating holdings
- Deleting holdings
- Creating alerts
- Deleting alerts
- Edit flows
- Advanced polish pass

---

# Phase 3 — Portfolio and Alerts CRUD

## Goal
Implement the core user action flows for portfolio and alerts using the existing backend contract.

## Scope
Focus only on portfolio and alerts pages plus related create/delete interactions.

## Tasks
- Implement portfolio page.
- Implement alerts page.
- Wire portfolio page to:
  - `GET /portfolio`
  - `POST /portfolio`
  - `DELETE /portfolio/{itemId}`
- Wire alerts page to:
  - `GET /alerts`
  - `POST /alerts`
  - `DELETE /alerts/{alertId}`
- Support temporary `x-user-id` handling exactly as defined in the implementation plan.
- Implement idempotency handling for create forms.
- Add success and error handling for mutations.
- Add empty states with clear call-to-action messaging.
- Keep forms compact, polished, and premium.
- Ensure destructive actions feel restrained and intentional.

## Deliverables
- Functional portfolio page
- Functional alerts page
- Create/delete flows for holdings
- Create/delete flows for alerts

## Acceptance Criteria
- Users can view portfolio holdings and summary data.
- Users can add and delete holdings.
- Users can view alerts.
- Users can create and delete alerts.
- Duplicate create attempts are safely handled through idempotency support.
- Mutation loading, success, and error states are clearly represented.
- Empty states are polished and helpful.
- Styling remains aligned with the theme spec.

## Out of Scope
- Editing holdings
- Editing alerts
- Backend contract changes
- Advanced animation/polish work

---

# Phase 4 — Polish, Responsiveness, and Consistency Pass

## Goal
Refine the app into a consistent, production-quality v1 experience.

## Scope
Focus on polish, responsiveness, accessibility, and consistency. Avoid major architecture changes.

## Tasks
- Review and tighten spacing consistency across all pages.
- Review typography hierarchy and consistency.
- Review chart styling consistency.
- Review badge/status styling consistency.
- Review button/input/card consistency.
- Improve mobile layouts where needed.
- Improve tablet and desktop layout behavior where needed.
- Ensure page-level and component-level loading states feel cohesive.
- Ensure empty states and errors are visually consistent.
- Improve keyboard/focus accessibility.
- Confirm semantic status is not only conveyed by color.
- Reduce visual noise where necessary.
- Verify that the app feels trustworthy, calm, and data-first.

## Deliverables
- Visual consistency pass complete
- Responsive cleanup complete
- Accessibility cleanup complete
- Final styling pass complete

## Acceptance Criteria
- The app looks like one cohesive product.
- Spacing, radii, typography, and surfaces are consistent.
- Mobile and desktop experiences both feel intentional.
- Accessibility and focus states are acceptable for v1.
- The final product matches the theme spec and implementation plan closely.

## Out of Scope
- Light mode
- New backend endpoints
- Major feature additions
- Re-architecting the app

---

# Optional Phase 5 — Post-v1 Enhancements

## Goal
Handle anything intentionally deferred from v1.

## Possible Tasks
- Add edit flows for holdings and alerts if backend support is added
- Add discoverable set filters if backend support is added
- Add aggregate card detail endpoint support if backend evolves
- Add light mode if desired later
- Add richer analytics panels
- Add saved filters or more advanced market browsing

This phase is optional and should not block v1.

---

# Recommended File Outputs by Phase

## Phase 1 likely touches
- app layout files
- global styles
- theme/token config
- shared components
- nav/header components
- API client/util files
- type definition files

## Phase 2 likely touches
- dashboard route/page
- market route/page
- card detail route/page
- chart components
- read-only data hooks/helpers

## Phase 3 likely touches
- portfolio route/page
- alerts route/page
- form components
- mutation hooks/helpers
- idempotency helpers if separate

## Phase 4 likely touches
- all page/component styling files
- accessibility and responsive refinements
- shared component cleanup

---

# Review Rules for Codex
For every phase, Codex should:
- keep changes scoped to the phase
- avoid unnecessary refactors
- preserve existing working behavior
- prefer reusable components over duplication
- ensure the implementation still matches `docs/theme-spec.md`

If a design decision is ambiguous, choose the option that is:
1. cleaner
2. calmer
3. more trustworthy
4. more data-focused