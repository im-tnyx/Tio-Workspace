# Phase 1.2 Task 03 — OTP-first Auth architecture

| Field | Value |
|---|---|
| Status | **MERGED / DOCUMENTATION COMPLETE**; production Auth remains BLOCKED |
| Objective | Reconcile owner-selected Email → OTP → Password and existing-user OTP login with an honest server-authoritative design |
| Implementation owner | Codex, documentation-only slice |
| Previous agent | None for this documentation slice; Task 02 PoC was a separate experiment |
| Last commit agent | Codex; reviewed final PR HEAD `adc0d5c3e6ba8426f145406adaa3b9e9db8d6321` |
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

- Selected UX: new Email → OTP → Password; existing activated Email → OTP → direct login without password update. Before initial password, provisional signup return requires fresh Email + OTP and owner-selected short cleanup target; password-complete incomplete users resume their trusted cloud/local stage. Username required, Mobile optional in proposed Account Setup.
- **BLOCKED:** Owner must choose whether normal explicit OTP-based password recovery is acceptable while direct Auth API replacement remains possible, or require a proven provider-level direct-mutation restriction. Hosted default SMTP and selected abuse quotas also block public Auth rollout.
- Private profile, avatar, device snapshot, server-owned FREE entitlement, lifecycle schema/privacy, local SQLCipher and cleanup proposals remain unapproved implementation slices.

## Review and handoff

- [PR #24](https://github.com/im-tnyx/Tio-Workspace/pull/24) final reviewed HEAD `adc0d5c3e6ba8426f145406adaa3b9e9db8d6321` received formal independent [im-tio APPROVED review](https://github.com/im-tnyx/Tio-Workspace/pull/24#pullrequestreview-5921363173) for the documentation scope. The P2 server/local eligibility, P2 first-user UX and P3 Markdown-table findings were independently verified fixed and their three threads resolved before merge.
- Owner conditionally authorized the final gate in this conversation. The required App-owned `Commit attribution guard` (App ID `5032971`) passed on the exact HEAD; supplemental guard checks passed. GitHub confirmed squash merge `13b87912af6606f50b4c9e9a4dd5c44cad564e78` on 2026-11-16. Local `main` fast-forwarded to that SHA and was clean.
- Documentation validation at the gate: `git diff --check origin/main...origin/tnyx/phase12-auth-architecture`, `git show --check`, relative links/fences across 17 Markdown files and `Bun.markdown.html` rendering of all 91 test IDs passed. No runtime Auth, device, hosted Supabase, email-delivery or account-deletion test ran in Task 03 or its merge gate; Task 02 local PoC evidence was historical, not rerun.
- Remaining blockers: direct Auth password-mutation policy decision and proof; hosted default-email delivery and abuse limits; private profile/schema/privacy and server lifecycle authorization; secure native session/local storage; separate implementation approval. No production Auth or cleanup deployment resulted from this merge.
- Post-merge handoff: archived by Task 04 in a separate reviewable documentation PR; Phase 0 Issue #2 remains open. The next bounded task is an owner decision and security-design proof for direct Auth password replacement, not app implementation.

[← Archive guide](../README.md) · [Root contract](../../../AGENTS.md)
