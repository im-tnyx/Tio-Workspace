# Phase 1.2 Task 03 — OTP-first Auth architecture

| Field | Value |
|---|---|
| Status | Ready for review; production Auth remains BLOCKED |
| Objective | Reconcile owner-selected Email → OTP → Password and existing-user OTP login with an honest server-authoritative design |
| Implementation owner | Codex, documentation-only slice |
| Previous agent | None for this documentation slice; Task 02 PoC was a separate experiment |
| Last commit agent | Codex; resolve exact current PR HEAD from GitHub after publication |
| Tracking / approval | Owner's Phase 1.2 Task 03 instruction in this chat; [Phase 0 Issue #2](https://github.com/im-tnyx/Tio-Workspace/issues/2) is planning-only |
| Branch | `tnyx/phase12-auth-architecture` (from verified `main`) |
| Base SHA / inspected HEAD | `2a6877899ef51331739c38e850b6d2a6455e8795` on 2026-11-16 |
| Platform and file scope | Canonical Auth/ADR/readiness/test documentation only; no runtime or hosted change |
| Created / updated | 2026-11-16 |

## Scope and evidence

- Read root `AGENTS.md`, `.ai/current.md`, Issue #2 and relevant canonical Auth/offline/ADR/test documents. Live GitHub showed no open PR and `main` at the base SHA; local worktree was clean before branching.
- Supabase skill and official passwordless, `updateUser`, SMTP, rate-limit and Auth-hook documentation were consulted. Task 02's sanitized local PoC result: 15 PASS / 1 FAIL; the FAIL is existing-account password overwrite via direct `updateUser` after OTP.
- In scope: [lifecycle proposal](../../../docs/27-OTP-FIRST-AUTH-LIFECYCLE.md), minimal canonical reconciliation, documentary acceptance cases and PR review request.
- Out of scope: Auth code, Supabase settings/schema/migrations, production credentials, Brevo, Google OAuth, hosted OTP, app builds, merge/deploy.

## Changed documentation

- `.ai/current.md`; this task record.
- `docs/27-OTP-FIRST-AUTH-LIFECYCLE.md`, `docs/00-INDEX.md`, `docs/04-AUTH-AND-SECURITY.md`, `docs/08-TEST-PLAN.md`, `docs/09-DECISIONS.md`, `docs/18-OFFLINE-SESSION-STATE-MACHINE.md`, `docs/21-PHASE-1-READINESS.md`, `docs/23-INPUT-LIMITS-OTP-AND-FUTURE-MEMBERSHIP.md`, `docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md`.
- Focused legacy wording corrections: `docs/01-PRODUCT-REQUIREMENTS.md`, `docs/03-LOCAL-DATA-MODEL.md`, `docs/17-PHASE-0-DECISION-PACK.md`, `docs/20-MVP-UX-FLOWS.md`, `docs/22-PHASE-0-DESIGN-AND-PHASE-1-APPROVAL.md`.

## Owner decisions and blockers

- Selected UX: new Email → OTP → Password; existing activated Email → OTP → direct login without password update; incomplete users resume their trusted stage. Username required, Mobile optional in proposed Account Setup.
- **BLOCKED:** Owner must choose whether normal explicit OTP-based password recovery is acceptable while direct Auth API replacement remains possible, or require a proven provider-level direct-mutation restriction. Hosted default SMTP and selected abuse quotas also block public Auth rollout.
- Private profile, avatar, device snapshot, server-owned FREE entitlement, lifecycle schema/privacy, local SQLCipher and cleanup proposals remain unapproved implementation slices.

## Review and handoff

- Reviewer request: pending PR creation; inspect exact PR HEAD and record review URL/verdict there. `REVIEW_PENDING` is not approval.
- Validation: local diff/link/Markdown/sensitive-string checks only; no new runtime, device or hosted tests.
- Merge authorization: **not granted**. Next action: owner and independent reviewer inspect the documentation PR; separately resolve the direct password-mutation policy before any implementation slice.

[← Task guide](../README.md) · [Root contract](../../../AGENTS.md)
