# 🧭 Current AI Context

> Read after [AGENTS.md](../AGENTS.md). This pointer is task metadata, not proof of live GitHub/CI status.

| Field | Value |
|---|---|
| Status | **Post-PR #13 documentation handoff; no active implementation task** |
| Active Task | **None** — completed docs task [archived](archive/2026/local-20261115-minimal-cloud-profile-onboarding.md) |
| Active Scope / Owner | **None assigned**; no Auth/DB implementation authority |
| Branch | `main` (merged PR #13); post-merge reconciliation changes are review-only |
| Verified merged `main` | `237a88fe5c6c30ae940a920ec71659cc947aeaf3` (2026-11-15; PR #13 squash merge) |
| Completed PRs | [#11 Expo mock shell](https://github.com/im-tnyx/Tio-Workspace/pull/11), [#12 prior post-merge docs](https://github.com/im-tnyx/Tio-Workspace/pull/12), [#13 proposed ADR-019 docs](https://github.com/im-tnyx/Tio-Workspace/pull/13) — **all merged** |
| Proposal | [ADR-019 minimal cloud profile and local onboarding](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) |
| Implementation authority | **None granted** for Phase 1.2+, Supabase tables, real OTP/Auth, encrypted SQLite, Sync or deployment |
| PR #13 final review | `im-tio` **APPROVED** exact head `944efa7799d6f8d803e1a16506ee0ff5ec7d3f81`; 1/1 P3 thread resolved; owner-approved squash merge verified |

## Exact owner-requested signup and onboarding

**Email → OTP → Password** is the fixed UI order, not subject to redesign. Continue **Account Setup (Username required + Mobile optional, same screen)** → **Name** → DOB (**required**) → Sex (**required**) → Units → Height → Current Weight → Activity Level → Goal → **Final Setup (progress circle → done/checkmark → bottom Continue)** → Home. Only show success after verified saves; no ratings/stars/testimonials. **Only Mobile is optional; it is not a separate screen.** Name remains its own screen immediately after Account Setup. Plan encrypted device-local fitness storage and private minimum cloud identity; existing workout sync/backup rules are unchanged.

## Additional pending policy — abandoned signup cleanup

Owner requested eventual cleanup of abandoned Supabase account creations. [Proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) describes **7-day unverified** and **30-day verified-but-never-activated inactive** candidates with 7-day warning, secure server-side preflight and a **permanent exclusion once an account could own local encrypted data**. A **separate new proposal** covers fully established FREE accounts: **6-month review, 11-month warning, 12-month candidate review**, but destructive removal is **blocked** until the owner approves risks to offline/local bound workout recovery and independent security/privacy tests. Uninstall/fully-offline use is not remotely knowable. Time limits and automatic deletion need separate owner approval; **no job, backend migration, deletion or email was executed**.

## Additional proposed cloud account metadata — not deployed

Owner additionally requested **Platform, OS version, App build, Avatar, Plan** on Supabase. ADR-019 proposes nullable latest-known iOS/Android + OS version + app version/build in an account-private snapshot, **`profiles.avatar_url`** pointing to an account-owned image in a private Storage bucket, uploaded from Profile Settings or imported from **future** separately approved Google signup after user approval; on user photo change, update the URL after upload succeeds, then delete the old bucket object. **Email signup has no required photo:** if `avatar_url=NULL`, render a local initials avatar from the required Name (e.g. **Tnyx Tio → TT**); Profile Settings can upload/change/remove any time and removal restores initials without storing/uploading a default image. It also proposes a server-controlled `FREE` plan status. No new required signup step, no forced network/heartbeat, and no workouts uploaded. Plan entitlement, RLS, avatar privacy, retention and implementation need separate authorization. The PR #13 P3 thread was resolved, `im-tio` formally approved exact HEAD and the owner authorized the squash merge. This **does not** approve cloud schema, Avatar Storage, inactive-account deletion or Google OAuth.

## Next safe action

**PR #13 is merged**, and its documentation-only task is [archived](archive/2026/local-20261115-minimal-cloud-profile-onboarding.md). The next **owner decision**, not an authorized coding assignment, is to review [proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) and [Phase 1 readiness](../docs/21-PHASE-1-READINESS.md): select one bounded implementation slice only after resolving OTP-before-password Supabase feasibility, DOB/sex privacy/age, private profile and avatar RLS/storage, server-owned plan/device metadata, local encryption/recovery and account-retention safety. **Keep the fixed Email → OTP → Password UI order**; do not simulate unsupported verification or approve schema/cleanup by inference.

This post-merge context reconciliation is **a separate docs-only review PR** and needs its own reviewer gate and owner merge authorization. No live Auth/session/SQLite/Supabase implementation or deployment is authorized.

[Archived task](archive/2026/local-20261115-minimal-cloud-profile-onboarding.md) · [AGENTS](../AGENTS.md) · [Post-merge playbook](../docs/12-POST-MERGE-PLAYBOOK.md)
