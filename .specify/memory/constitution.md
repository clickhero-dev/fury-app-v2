<!--
  Sync Impact Report:
  - Version change: (none) → 1.0.0 (initial adoption)
  - Modified principles: N/A (first version)
  - Added sections: 5 Core Principles, Security Standards, Development Workflow, Governance
  - Removed sections: N/A
  - Templates requiring updates:
    - .specify/templates/plan-template.md — Constitution Check section is generic; no change needed.
    - .specify/templates/spec-template.md — Mandatory sections (testing, success criteria) align with principles; no change needed.
    - .specify/templates/tasks-template.md — Task phases align with development workflow; no change needed.
    - .specify/templates/commands/ — Directory not yet created; no command files to audit.
    - CLAUDE.md — Already references QA, security, RTK workflows consistent with these principles.
  - Follow-up TODOs: None.
-->

# FURY Platform Constitution

## Core Principles

### I. Security & Multi-Tenant Isolation

PostgreSQL Row-Level Security (RLS) MUST be enabled on every table
that stores tenant data. All queries MUST scope by `tenant_id` —
no endpoint, service, or worker may access data across tenants.
Security audits via `npm run security:audit` are mandatory before
every deployment. JWT authentication MUST protect all authenticated
routes.

**Rationale**: FURY is a multi-tenant SaaS handling ad spend and
client campaign data. A single data leak erodes trust irreparably.

### II. API Contracts & Validation

Every feature MUST expose a REST API contract first. Input validation
via Zod schemas is mandatory on every endpoint. Responses MUST follow
the `ApiResponse<T>` envelope for consistency. Error responses MUST
include a machine-readable code and a human-readable message.

**Rationale**: Multiple consumers (frontend, background workers,
external integrations) rely on predictable contracts. Zod ensures
type safety at the boundary.

### III. Test-First Quality Gates (NON-NEGOTIABLE)

Tests MUST be written and confirmed failing before implementation code
(Red-Green-Refactor). Unit tests cover service logic; integration tests
cover API flows end-to-end. Coverage audits (`npm run qa:audit`) run
before every release. No PR merges without passing tests.

**Rationale**: Ad campaign automation involves real money. Regressions
in targeting, budgeting, or creative delivery have direct financial
impact on clients.

### IV. AI Integration Discipline

All AI provider calls (Claude, DeepSeek, DALL-E) MUST have structured
prompts with explicit expected output formats. AI outputs MUST be
validated before use in campaigns or persistence. Every integration
MUST implement error handling with graceful fallback (mock data or
cached results).

**Rationale**: AI is non-deterministic. A hallucinated campaign budget
or malformed creative can cause unrecoverable Meta API errors or
client financial loss.

### V. Simplicity & YAGNI

Start with the minimum implementation that solves the current need.
Reuse existing patterns (shared types, service layer, middleware)
before creating new abstractions. No interfaces with one implementation,
no factories for one product, no config for values that never change.
Complexity MUST be explicitly justified in PR descriptions.

**Rationale**: Every line of unused code is a liability. In a startup
context, speed and clarity beat speculative generality.

## Security Standards

- **RLS**: Enabled on all PostgreSQL tables with `tenant_id` policy.
- **Authentication**: JWT access + refresh tokens on all protected
  routes. Token encryption via `TOKEN_ENCRYPTION_KEY`.
- **Rate Limiting**: All API endpoints MUST have rate limiting applied.
- **Input Sanitization**: All user-provided data sanitized before
  logging, storage, or rendering. Structured logging never includes
  raw secrets or tokens.
- **Secrets**: Zero hardcoded credentials. Every secret in environment
  variables or a `.env` file excluded from version control.
- **Dependency Scanning**: `npm run security:audit` runs regularly
  to detect vulnerable dependencies.

## Development Workflow

- **Branch Strategy**: All work on feature branches off `dev`. PRs
  target `dev`. Merges to `dev` trigger auto-deploy via EasyPanel.
- **spec-kit Flow**: Features follow the full pipeline:
  `specify → plan → implement → test → converge`.
- **Commits**: Conventional Commits format
  (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **RTK**: All terminal commands prefixed with `rtk` for token-optimized
  output during development.
- **QA Gate**: `npm run qa:audit` before every release to verify
  coverage thresholds are met.

## Governance

This Constitution supersedes all informal practices. Amendments
require a PR that documents the change rationale and updates this
document. Version bumps follow semantic versioning:

- **MAJOR**: Backward-incompatible principle removal or redefinition.
- **MINOR**: New principle or materially expanded guidance.
- **PATCH**: Clarifications, wording refinements, typo fixes.

Every PR review MUST include a compliance check against this
Constitution. New team members MUST read and acknowledge these
principles before contributing.

Use `CLAUDE.md` for runtime development guidance (RTK, security
agent, QA agent commands).

**Version**: 1.0.0 | **Ratified**: 2026-07-02 | **Last Amended**: 2026-07-02
