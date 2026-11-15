# Minimal private cloud profile + local fitness onboarding proposal

| Field | Value |
|---|---|
| Status | Ready for Review |
| Objective | One reviewable proposed ADR capturing the owner's exact signup/onboarding field order and remote/local data boundary |
| Implementation owner | Documentation agent (this bounded docs-only task; not an Auth implementation owner) |
| Previous agent | None assigned for this task |
| Last commit agent | Documentation agent; exact PR-head SHA to be confirmed after push |
| Tracking / approval | Owner instruction on 2026-11-15: "start" after read-only audit; **documentation only**, not production database/Auth approval |
| Branch | `docs/phase1-2-minimal-profile-onboarding-20261115` |
| Base SHA / inspected HEAD | `d3b6ceec7f31b5084b86685f90f0adabe5bcadd0` on `main` |
| Platform and file scope | Docs, ADR proposal, documentation hub and single task pointer only; both iOS/Android Auth and local fitness acceptance planned |
| Created / updated | 2026-11-15 |

## Required context

- [x] [AGENTS.md](../../../AGENTS.md) read, phase/approval gates observed
- [x] [Current pointer](../../current.md) reconciled against live GitHub: PR #12 already merged; old next-action paragraph stale
- [x] [Core architecture](../../core/architecture.md), [security](../../core/security-rules.md) and [canonical docs](../../../docs/00-INDEX.md) reviewed
- [x] Live `main` HEAD and zero open PRs verified before creating the branch
- [ ] Independent PR review and explicit owner **merge approval** pending

## Approved scope / non-goals

- **In scope:** propose [ADR-019](../../../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) with Email → OTP → Password → Username → Mobile (optional) → **Name** → DOB (required) → Sex (required) → Units → Height → Current Weight → Activity Level → Goal; record cloud/local boundaries, risk questions, RLS and acceptance criteria.
- **In scope:** link from docs index and decision register as **proposed**, keep this single task pointer updated. Record Email → OTP → Password as fixed owner choice, and document technical feasibility/reconciliation without suggesting a different screen order.
- **Out of scope:** any code, mock-screen revision, Auth/provider configuration, SQL migrations, live Supabase table, local SQLite implementation, secret creation, deployment or merge.
- **Authority:** Owner's "start" authorizes preparing these docs for review; **it does not authorize runtime Phase 1.2+ or acceptance of unresolved security/privacy decisions**.

## Selected skills and tools

- GitHub connected repository tools: inspect actual repo; create a docs branch and PR.
- Supabase installed skill (`skills://plugins/supabase/supabase/skill.md`): review RLS/auth boundary only; no writes.
- Supabase official passwordless email and user-management docs: reference implementation-feasibility decisions.
- No actual local worktree was available from connector inspection; do not claim `git diff --check`, npm tests or device builds.

## Durable decisions and open gates

**Owner-required inputs:** Email/OTP/Password, Username, Name, DOB and Sex; **Mobile is the only optional onboarding input**, with Skip. Units/Height/Current Weight/Activity Level/Goal required locally. Separate Name screen occurs directly after Mobile.

**Proposed storage:** Cloud `auth.users` for email/account/password credentials, plus private `public.profiles` for username/full_name/DOB/calculation_sex/nullable mobile. Local encrypted DB for units, height, measured weight, activity, goal, workouts and resume metadata.

**Fixed UI:** Email → OTP → Password **must remain exactly in this order**. **Unresolved technical gates:** provider-supported password setup following verified OTP (do not reorder UI), ADR-017 legacy wording, previously optional username, required sensitive field privacy/age policy, backend RLS/uniqueness, deletion and native encryption validation. No plan counts or existing single-bound-account guarantees changed.

## Progress / changed files

- [x] Verified latest GitHub `main`, PR #11 and merged documentation PR #12
- [x] Produced bounded proposal without changing runtime or Supabase
- [ ] Independent review and owner decision needed

Expected docs-only paths: `docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md`, `docs/00-INDEX.md`, `docs/09-DECISIONS.md` (proposal pointer only), `.ai/current.md`, this task.

## PR review evidence and findings

- Review requested from: **Pending** owner/independent reviewer request after PR creation.
- Reviewer identity and URL: Pending.
- Inspected SHA: PR head to verify after creation.
- Review status: `REVIEW_PENDING`.
- Review result: `INCONCLUSIVE` pending separate review.
- Review type: Not yet performed.
- Blocking findings: approval gates above.
- Merge approval: **Not granted**.

## Validation evidence

- Pre-change: GitHub repo/branch files and documentation constraints read; connected Supabase previously showed zero `public` tables/migrations.
- Planned review checks: changed-files scope, relative Markdown links, proposed-vs-accepted labeling, no secret/sensitive user values, Mermaid/Markdown readability.
- Not run: local `git diff --check`, `npm run verify`, OTP/server/RLS tests and native tests; no worktree or runtime implementation.

## Handoff

**Next owner:** Repository owner / independent docs/security reviewer.  
**Next authorized action:** Review proposed ADR, reconcile specified choices, complete review gate and **separately authorize merge**; implementation requires separate approved slice.  
**Post-merge synchronization/archive needed:** Yes, only after verified merge.

[← Task guide](../README.md) · [Root agent contract](../../../AGENTS.md)
