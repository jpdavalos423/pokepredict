# Codex MCP Workflow

This document defines how Codex should use the MCP tools available in this repository.

The project environment includes two MCP servers:

- **Next DevTools MCP**
- **Playwright MCP**

Codex should use these tools during development phases to validate real application behavior, not just code changes.

---

# Tool Responsibilities

## Next DevTools MCP

Next DevTools MCP should be used while implementing features to inspect the running Next.js application.

Use it to:

- list available routes
- inspect page state
- detect build errors
- detect runtime errors
- detect type errors
- inspect server/client logs
- verify data fetching behavior
- detect hydration or rendering issues

This tool is best used **during implementation and debugging**.

---

## Playwright MCP

Playwright MCP should be used after implementation to validate user-facing behavior in a real browser.

Use it to:

- load pages
- simulate user actions
- verify forms and flows
- validate empty states
- validate error states
- confirm layout responsiveness
- confirm accessibility basics
- confirm UI flows actually work

This tool is best used **after implementation**.

---

# Required Workflow for Each Phase

Every frontend implementation phase should follow this order.

## Step 1 — Implement the phase

Codex implements the requested phase according to the implementation plan.

---

## Step 2 — Next DevTools MCP validation

Codex must inspect the running app using Next DevTools MCP.

Required checks:

- confirm the routes affected by the phase load correctly
- confirm there are no runtime errors
- confirm there are no build errors
- confirm there are no type errors
- confirm page data fetching behaves correctly

If issues are detected, Codex should fix them before proceeding.

---

## Step 3 — Playwright MCP validation

Codex must validate the implemented flows in the browser using Playwright MCP.

Required checks:

- verify affected pages load
- verify core user flows work
- verify loading states render correctly
- verify empty states render correctly
- verify error states render correctly
- verify navigation works
- verify forms and mutations behave correctly

If issues are detected, Codex should fix them before proceeding.

---

## Step 4 — Phase completion check

Before concluding the phase, Codex must confirm:

- the implementation matches the phase scope
- MCP validation checks passed
- no unrelated refactors were introduced

Codex should summarize:

- what was validated
- any issues found
- any fixes applied

---

# Implementation Guardrails

Codex should follow these rules:

- Do not invent backend endpoints.
- Do not change existing API routes.
- Do not perform large refactors unrelated to the current phase.
- Reuse existing components and theme tokens where possible.
- Keep changes scoped to the requested phase.

---

# Goal

The purpose of this workflow is to ensure that:

- code compiles
- pages render correctly
- user flows work in a real browser
- empty/error states are handled properly
- frontend changes remain aligned with the API contract