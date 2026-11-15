# Minimal private cloud profile + local fitness onboarding proposal

| Field | Value |
|---|---|
| Status | Ready for Review |
| Objective | One reviewable proposed ADR capturing the owner's exact signup/onboarding field order and remote/local data boundary |
| Implementation owner | Documentation agent (this bounded docs-only task; not an Auth implementation owner) |
| Previous agent | None assigned for this task |
| Last commit agent | Documentation agent; exact PR-head SHA to be confirmed after push |
| Tracking / approval | Owner docs-task instruction on 2026-11-15; [PR #13](https://github.com/im-tnyx/Tio-Workspace/pull/13); **documentation only**, not production database/Auth approval |
| Branch | `docs/phase1-2-minimal-profile-onboarding-20261115` |
| Base SHA / inspected HEAD | `d3b6ceec7f31b5084b86685f90f0adabe5bcadd0` on `main` |
| Platform and file scope | Docs, ADR proposal, documentation hub and single task pointer only; both iOS/Android Auth and local fitness acceptance planned |
| Created / updated | 2026-11-15 |

## Required context

- [x] [AGENTS.md](../../../AGENTS.md) read, phase/approval gates observed
- [x] [Current pointer](../../current.md) reconciled against live GitHub: PR #12 already merged; old next-action paragraph stale
- [x] [Core architecture](../../core/architecture.md), [security](../../core/security-rules.md) and [canonical docs](../../../docs/00-INDEX.md) reviewed
- [x] Live `main` HEAD and zero open PRs verified before creating the branch
- [x] GitHub review **requested** from `im-tio` on [PR #13](https://github.com/im-tnyx/Tio-Workspace/pull/13)
- [x] Independent **COMMENTED** review posted by `im-tio` on original HEAD `0d4cf52`; one P3 whitespace finding; author pushed a narrow fix
- [ ] Re-review on updated HEAD, clean checkout `git diff --check` and explicit owner **merge approval** pending

## Approved scope / non-goals

- **In scope:** propose [ADR-019](../../../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) with Email → OTP → Password → **Account Setup [Username + Mobile (optional)]** → **Name (separate next screen)** → DOB (required) → Sex (required) → Units → Height → Current Weight → Activity Level → Goal → **Final Setup progress → Done checkmark → Continue → Home**; record cloud/local boundaries, risk questions, RLS and acceptance criteria.
- **In scope:** link from docs index and decision register as **proposed**, keep this single task pointer updated. Record Email → OTP → Password as fixed owner choice, and document technical feasibility/reconciliation without suggesting a different screen order.
- **Out of scope:** any code, mock-screen revision, Auth/provider configuration, SQL migrations, live Supabase table, local SQLite implementation, secret creation, deployment or merge.
- **Authority:** Owner's "start" authorizes preparing these docs for review; **it does not authorize runtime Phase 1.2+ or acceptance of unresolved security/privacy decisions**.

## Selected skills and tools

- GitHub connected repository tools: inspect actual repo; create a docs branch and PR.
- Supabase installed skill (`skills://plugins/supabase/supabase/skill.md`): review RLS/auth boundary only; no writes.
- Supabase official passwordless email and user-management docs: reference implementation-feasibility decisions.
- No actual local worktree was available from connector inspection; do not claim `git diff --check`, npm tests or device builds.

## Durable decisions and open gates

**Owner-required inputs:** Email/OTP/Password, Username, Name, DOB and Sex; **Mobile is the only optional onboarding input**, with Skip. Units/Height/Current Weight/Activity Level/Goal required locally. Mobile is an optional field **within Account Setup** alongside required Username; **no standalone Mobile screen**. Separate Name screen occurs immediately after Account Setup.

**Finalization UX (owner screenshot references):** Centered circular progress ring with a **percentage in the middle when actual completed checkpoints are measurable**, and “Personalizing your experience…”. At genuinely verified 100% replace the percentage with a centered checkmark + “You're all set!”, then reveal the bottom Continue CTA. **Exclude** cards, ratings, stars and carousel. No fake/timer-based percentages: use indeterminate fallback if numeric progress cannot be verified. Failures retry safely and returning users skip this first-run step. Acceptance tests ONB-11/12 are in proposed ADR-019.

**Abandoned signup cleanup proposal (new owner request):** Add **7-day unverified** and **30-day verified-but-never-activated inactivity** candidates with a 7-day advance warning for verified email. A server-owned protected activation marker must be durable **before local account binding**; **never delete established accounts or users with locally incomplete onboarding**. Require dry-run, fail-closed eligibility, protected admin delete via scheduled server job, concurrent-resume race tests and separately approved deletion periods/implementation. Acceptance tests ONB-13–16 added. **New owner-requested established FREE-account expiry is separate:** propose 6-month review/reminder, 11-month warning and 12-month review-only checkpoint (ONB-17–20), never equate missing remote activity with uninstall while local-first/offline use remains valid. No real established-account deletion until written owner acceptance of local identity/recovery data-loss risk, privacy notice, actual server activity evidence, authenticated keep-account flow and separate implementation gate. No real server deletion or job configured.

**Additional Supabase account metadata (owner request, proposed only):** optional Avatar image in private Supabase Storage with `profiles.avatar_path`; default `FREE` **account tier (not workout plan)** in a non-client-writable entitlement source; Platform/OS version/App version+build in a **latest-known nullable private account snapshot**, refreshed only with permitted online account interactions. No required Avatar signup step, no automatic device heartbeat, no workout upload, no paid implementation. Enforce per-user RLS, strict Storage ownership, no client tier promotion, bounded device strings and data deletion. Acceptance IDs ONB-21–24; actual schema/bucket/entitlements approvals remain pending.

**Proposed storage:** Cloud `auth.users` for email/account/password credentials, plus private `public.profiles` for username/full_name/DOB/calculation_sex/nullable mobile. Local encrypted DB for units, height, measured weight, activity, goal, workouts and resume metadata.

**Fixed UI:** Email → OTP → Password **must remain exactly in this order**. Owner provided Flutter account-setup adapter reference: `completeAccountSetup({String? mobile})` supports optional mobile without proving actual UI; Flutter implementation is not copied into Expo. **Unresolved technical gates:** cleanup threshold/grace/notification approval, protected activation marker before any local DB access, server-only hard deletion security and JWT/session caveats; **separate established free-account inactivity expiration proposal (12-month candidate only) with owner security/privacy and offline data-recovery decision pending**; provider-supported password setup following verified OTP (do not reorder UI), ADR-017 legacy wording, previously optional username, required sensitive field privacy/age policy, backend RLS/uniqueness, deletion and native encryption validation. No plan counts or existing single-bound-account guarantees changed.

## Progress / changed files

- [x] Verified latest GitHub `main`, PR #11 and merged documentation PR #12
- [x] Produced bounded proposal without changing runtime or Supabase
- [x] Created [PR #13](https://github.com/im-tnyx/Tio-Workspace/pull/13), with a docs-only 5-file diff; requested review from `im-tio`
- [x] Corrected four trailing-whitespace lines in two docs, preserving Markdown structure; GitHub remote patch whitespace scan clean on first fix HEAD `3cc58eb`
- [x] Owner-provided Windows PowerShell `git diff --check origin/main...origin/docs/phase1-2-minimal-profile-onboarding-20261115` yielded no output on prior PR HEAD `df5595a`; P3 review thread marked resolved and evidence posted
- [ ] Re-run checkout diff check **after these newer metadata docs commits**; get `im-tio` re-review of the updated HEAD and separate owner merge approval

Expected docs-only paths: `docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md`, `docs/00-INDEX.md`, `docs/09-DECISIONS.md` (proposal pointer only), `.ai/current.md`, this task.

## PR review evidence and findings

- Reviewer: **`im-tio`** submitted a GitHub `COMMENTED` review on `0d4cf52` (2026-11-15), identifying one P3 trailing-whitespace issue at [inline discussion](https://github.com/im-tnyx/Tio-Workspace/pull/13#discussion_r4578155572). A fresh re-review of the fix is pending.
- Reviewer identity and URL: `im-tio`, [PR #13](https://github.com/im-tnyx/Tio-Workspace/pull/13).
- Reviewed SHA: `0d4cf52d85f8c4bf022712105b34d174ac87e6cb`. Fixed in commits `dcdfe3071692a8f2bfdaf9c67fd964a7997a31ff` and `3cc58eb9b02e76ac3c1d3f4cc4fc9f2d6df61c71`. The handoff update itself advances the PR HEAD; reviewer must inspect the new SHA.
- Review status: `COMMENTED`, whitespace P3 addressed in branch; **fix confirmation / reviewer gate still pending**.
- Review result: no confirmed security/correctness defect in docs proposal; `im-tio` noted P3 whitespace issue and no real checkout test; **not formal APPROVED**.
- Review type: Independent `im-tio` review of the actual five-file Markdown diff; Codex bot also reported a completed code review with no findings on previous HEAD.
- Findings: four added trailing-space lines at ADR lines 3–4 and task lines 79–80; fixed. The original `im-tio` P3 thread **was marked resolved** after the owner-supplied successful Windows `git diff --check` output was posted. Any newer docs changes require a fresh exact-HEAD validation and independent review.
- Merge approval: **Not granted**.

## Validation evidence

- Pre-change: GitHub repo/branch files and documentation constraints read; connected Supabase previously showed zero `public` tables/migrations.
- Documentation checks: five Markdown-only files; links and source-of-truth policy boundaries checked earlier. **Remote GitHub patch scan on HEAD `3cc58eb` reviewed 314 added lines: zero trailing spaces/conflict-marker lines**. This is not the actual checkout `git diff --check`. Recheck after this handoff commit.
- Owner-run local validation on prior PR HEAD: `git fetch origin` and `git diff --check origin/main...origin/docs/phase1-2-minimal-profile-onboarding-20261115` returned no error output; recorded in [inline review thread](https://github.com/im-tnyx/Tio-Workspace/pull/13#discussion_r4578155572). This agent did **not** execute local Git; a new check is needed after later additions. `npm run verify`, OTP/server/RLS and native tests are not run/not applicable to this docs-only PR.

## Handoff

- **Next owner:** Repository owner / independent docs/security reviewer.
- **Next authorized action:** Review proposed ADR, reconcile specified choices, complete review gate and **separately authorize merge**; implementation requires separate approved slice.
- **Post-merge synchronization/archive needed:** Yes, only after verified merge.

[← Task guide](../README.md) · [Root agent contract](../../../AGENTS.md)
