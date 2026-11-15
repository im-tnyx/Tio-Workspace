# 🧭 Current AI Context

> Read after [AGENTS.md](../AGENTS.md). This pointer is task metadata, not proof of live GitHub/CI status.

| Field | Value |
|---|---|
| Status | **Commit attribution governance PR in progress; no main enforcement activated** |
| Active Task | [Commit attribution guard](tasks/security/local-20261115-commit-attribution-guard.md) |
| Active Scope / Owner | GitHub governance and `.ai/` attribution records only; owner controls activation, secrets, rulesets and merge |
| Branch | `tnyx/security/commit-attribution-guard-20261115` (proposed PR; live HEAD must be checked) |
| Base / verified `main` | `5b8f03579f3c68b6f773ebde0323b1f6ee95263d` (PR #15 verified merged 2026-11-15; snapshot, not permanent HEAD) |
| Completed PRs | [#11](https://github.com/im-tnyx/Tio-Workspace/pull/11), [#12](https://github.com/im-tnyx/Tio-Workspace/pull/12), [#13](https://github.com/im-tnyx/Tio-Workspace/pull/13), [#14](https://github.com/im-tnyx/Tio-Workspace/pull/14), [#15 manual PR preview](https://github.com/im-tnyx/Tio-Workspace/pull/15) — merged; no EAS publish/build implied |
| Proposal | [ADR-019 minimal cloud profile and local onboarding](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) |
| Implementation authority | Owner approved bounded multi-agent attribution guard setup; **no** GitHub App provisioning, secrets, ruleset changes, final merge, Auth/DB/sync or production publish approved |
| PR #13 final review | `im-tio` **APPROVED** exact head `944efa7799d6f8d803e1a16506ee0ff5ec7d3f81`; 1/1 P3 thread resolved; owner-approved squash merge verified |

## Exact owner-requested signup and onboarding

**Email → OTP → Password** is the fixed UI order, not subject to redesign. Continue **Account Setup (Username required + Mobile optional, same screen)** → **Name** → DOB (**required**) → Sex (**required**) → Units → Height → Current Weight → Activity Level → Goal → **Final Setup (progress circle → done/checkmark → bottom Continue)** → Home. Only show success after verified saves; no ratings/stars/testimonials. **Only Mobile is optional; it is not a separate screen.** Name remains its own screen immediately after Account Setup. Plan encrypted device-local fitness storage and private minimum cloud identity; existing workout sync/backup rules are unchanged.

## Additional pending policy — abandoned signup cleanup

Owner requested eventual cleanup of abandoned Supabase account creations. [Proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) describes **7-day unverified** and **30-day verified-but-never-activated inactive** candidates with 7-day warning, secure server-side preflight and a **permanent exclusion once an account could own local encrypted data**. A **separate new proposal** covers fully established FREE accounts: **6-month review, 11-month warning, 12-month candidate review**, but destructive removal is **blocked** until the owner approves risks to offline/local bound workout recovery and independent security/privacy tests. Uninstall/fully-offline use is not remotely knowable. Time limits and automatic deletion need separate owner approval; **no job, backend migration, deletion or email was executed**.

## Additional proposed cloud account metadata — not deployed

Owner additionally requested **Platform, OS version, App build, Avatar, Plan** on Supabase. ADR-019 proposes nullable latest-known iOS/Android + OS version + app version/build in an account-private snapshot, **`profiles.avatar_url`** pointing to an account-owned image in a private Storage bucket, uploaded from Profile Settings or imported from **future** separately approved Google signup after user approval; on user photo change, update the URL after upload succeeds, then delete the old bucket object. **Email signup has no required photo:** if `avatar_url=NULL`, render a local initials avatar from the required Name (e.g. **Tnyx Tio → TT**); Profile Settings can upload/change/remove any time and removal restores initials without storing/uploading a default image. It also proposes a server-controlled `FREE` plan status. No new required signup step, no forced network/heartbeat, and no workouts uploaded. Plan entitlement, RLS, avatar privacy, retention and implementation need separate authorization. The PR #13 P3 thread was resolved, `im-tio` formally approved exact HEAD and the owner authorized the squash merge. This **does not** approve cloud schema, Avatar Storage, inactive-account deletion or Google OAuth.

## Next safe action

Review the [commit attribution guard task](tasks/security/local-20261115-commit-attribution-guard.md) and governance PR. Require tested, base-controlled scanner and at least one recorded independent review; obtain separate owner approval for merge. **Do not claim merge prevention is active** until the private-repo GitHub plan permits branch rules, an owner-controlled Checks App is provisioned, an App-source-pinned strict required check is active, and clean/bad/stale PR cases are live-tested. No application or Supabase implementation follows from this approval.

The prior [manual PR preview task](archive/2026/local-20261115-manual-pr-expo-preview.md) is archived after verified merge of PR #15. No EAS build, OTA publication or device installation is claimed by this reconciliation. The next product decision remains proposed ADR-019 / Phase 1 readiness.
