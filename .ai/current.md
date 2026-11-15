# 🧭 Current AI Context

> Read after [AGENTS.md](../AGENTS.md). This pointer is task metadata, not proof of live GitHub/CI status.

| Field | Value |
|---|---|
| Status | **Commit attribution governance PR #17 in review; enforcement NOT active** |
| Active Task | [Commit attribution guard task](tasks/security/local-20261115-commit-attribution-guard.md) — PR #17 in progress |
| Active Scope / Owner | Multi-agent commit attribution governance only; owner retains merge and GitHub App/settings authority |
| Branch | `tnyx/security/commit-attribution-guard-20261115` (open Draft PR #17; no main changes authorized by this task) |
| Base / verified `main` | `095c3edb4a7b1969598bc01162d66496febbf0c2` (merged PR #15 post-merge archive reconciliation; verify live HEAD before future work) |
| Completed PRs | [#11 Expo mock shell](https://github.com/im-tnyx/Tio-Workspace/pull/11), [#12 prior post-merge docs](https://github.com/im-tnyx/Tio-Workspace/pull/12), [#13 proposed ADR-019 docs](https://github.com/im-tnyx/Tio-Workspace/pull/13), [#14 context reconciliation](https://github.com/im-tnyx/Tio-Workspace/pull/14), [#15 manual Expo preview workflow](https://github.com/im-tnyx/Tio-Workspace/pull/15) — **all merged** |
| Proposal | [ADR-019 minimal cloud profile and local onboarding](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) |
| Implementation authority | Owner approved PR #17 governance setup and existing `Tio Attribution Guard` App reuse; owner reports installation/environment setup done, **not independently verified by workflow**. No merge, required ruleset, Auth/DB/sync or production changes authorized |
| PR #13 final review | `im-tio` **APPROVED** exact head `944efa7799d6f8d803e1a16506ee0ff5ec7d3f81`; 1/1 P3 thread resolved; owner-approved squash merge verified |

## Exact owner-requested signup and onboarding

**Email → OTP → Password** is the fixed UI order, not subject to redesign. Continue **Account Setup (Username required + Mobile optional, same screen)** → **Name** → DOB (**required**) → Sex (**required**) → Units → Height → Current Weight → Activity Level → Goal → **Final Setup (progress circle → done/checkmark → bottom Continue)** → Home. Only show success after verified saves; no ratings/stars/testimonials. **Only Mobile is optional; it is not a separate screen.** Name remains its own screen immediately after Account Setup. Plan encrypted device-local fitness storage and private minimum cloud identity; existing workout sync/backup rules are unchanged.

## Additional pending policy — abandoned signup cleanup

Owner requested eventual cleanup of abandoned Supabase account creations. [Proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) describes **7-day unverified** and **30-day verified-but-never-activated inactive** candidates with 7-day warning, secure server-side preflight and a **permanent exclusion once an account could own local encrypted data**. A **separate new proposal** covers fully established FREE accounts: **6-month review, 11-month warning, 12-month candidate review**, but destructive removal is **blocked** until the owner approves risks to offline/local bound workout recovery and independent security/privacy tests. Uninstall/fully-offline use is not remotely knowable. Time limits and automatic deletion need separate owner approval; **no job, backend migration, deletion or email was executed**.

## Additional proposed cloud account metadata — not deployed

Owner additionally requested **Platform, OS version, App build, Avatar, Plan** on Supabase. ADR-019 proposes nullable latest-known iOS/Android + OS version + app version/build in an account-private snapshot, **`profiles.avatar_url`** pointing to an account-owned image in a private Storage bucket, uploaded from Profile Settings or imported from **future** separately approved Google signup after user approval; on user photo change, update the URL after upload succeeds, then delete the old bucket object. **Email signup has no required photo:** if `avatar_url=NULL`, render a local initials avatar from the required Name (e.g. **Tnyx Tio → TT**); Profile Settings can upload/change/remove any time and removal restores initials without storing/uploading a default image. It also proposes a server-controlled `FREE` plan status. No new required signup step, no forced network/heartbeat, and no workouts uploaded. Plan entitlement, RLS, avatar privacy, retention and implementation need separate authorization. The PR #13 P3 thread was resolved, `im-tio` formally approved exact HEAD and the owner authorized the squash merge. This **does not** approve cloud schema, Avatar Storage, inactive-account deletion or Google OAuth.

## Next safe action

**Current governance scope:** Review [PR #17](https://github.com/im-tnyx/Tio-Workspace/pull/17) at its current SHA. Its 72 attribution fixtures and Expo shell validation passed on the earlier code head; after branch reconciliation verify checks again. `im-tio` independent review and separate owner merge authorization are pending. The owner reports existing `Tio Attribution Guard` installation, Workspace trusted environment variable and secret configured, but **the App-owned runner cannot be proved operational until the trusted workflow is on `main` and a disposable PR creates a correctly sourced Check Run**. `main` currently has no branch protection; no non-bypassable enforcement claim. Do not touch production or app data.

**Separate preview follow-up:** The manual GitHub Expo PR Preview workflow is available on `main`. `EXPO_TOKEN` is configured in GitHub's `eas-preview` environment; never put its value in this file or source. No build or update has been dispatched. For the first compatible install, use `build_preview` with `android` on an eligible owner-authored open PR targeting `main`, then install that binary once. The merged PR #15 itself is closed and cannot be selected. Later JS-only PRs may use `publish_update`; PRs touching native-affecting files are blocked from OTA and need a new preview build first. iOS signing credentials are not configured. Production publishing remains out of scope.

After this task, the next product decision remains review of [proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) and [Phase 1 readiness](../docs/21-PHASE-1-READINESS.md). No Auth/session/SQLite/Supabase implementation is authorized.

[Archived tasks](archive/2026/) · [AGENTS](../AGENTS.md) · [Post-merge playbook](../docs/12-POST-MERGE-PLAYBOOK.md)
