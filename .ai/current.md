# 🧭 Current AI Context

> Read after [AGENTS.md](../AGENTS.md). This pointer is task metadata, not proof of live GitHub/CI status.

| Field | Value |
|---|---|
| Status | **PR #17 merged; trusted attribution App gate activated; PR #18 pending independent review and updated-main reconciliation** |
| Active Task | **PR #18 Codespaces preview**, tracked in [its task brief](https://github.com/im-tnyx/Tio-Workspace/blob/tnyx/expo-preview/.ai/tasks/devex/local-20261115-expo-go-codespaces-preview.md). Security guard activation verified separately; do not infer PR #18 merge approval |
| Active Scope / Owner | Codespaces preview PR review/reconciliation only; owner retains merge and repository settings authority |
| Branch | PR #18 feature branch (verify current live head before any change) |
| Base / verified `main` | `fdc33d719975940058018dd283c7e9b4915c0286` (PR #17 squash merge; verify live HEAD before work) |
| Completed PRs | #11, #12, #13, #14, #15 and **#17 commit attribution guard** — merged |
| Proposal | [ADR-019 minimal cloud profile and local onboarding](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) |
| Implementation authority | Owner approved PR #17 governance and App reuse; **PR #17 merged**. Required App check on main ruleset confirmed live, but this does not authorize PR #18 merge or Auth/DB implementation |
| Attribution gate evidence | Ruleset `27218050` active, strict, requires only `Commit attribution guard` pinned to App ID `5032971`. Disposable [PR #19](https://github.com/im-tnyx/Tio-Workspace/pull/19) clean PASS and [PR #20](https://github.com/im-tnyx/Tio-Workspace/pull/20) prohibited AI attribution FAIL; both closed unmerged. Additional stale-head, spoofing and integrity edge-case live tests remain unverified |

## Concurrent PR merge-order / pointer ownership

- **PR #17 merged before PR #18**, satisfying the original workflow-on-main dependency. The trusted App check is now operational on test PR heads.
- **PR #18 remains separate:** reconcile its branch with the actual post-#17 `main`, preserve the attribution policy, verify the App-owned required check at the latest head, obtain independent approval and resolve review threads. Owner must explicitly authorize any PR #18 merge.
- Do not treat the closed test PRs or successful guard smoke tests as authorization to bypass security or merge PR #18.

## Exact owner-requested signup and onboarding

**Email → OTP → Password** is the fixed UI order, not subject to redesign. Continue **Account Setup (Username required + Mobile optional, same screen)** → **Name** → DOB (**required**) → Sex (**required**) → Units → Height → Current Weight → Activity Level → Goal → **Final Setup (progress circle → done/checkmark → bottom Continue)** → Home. Only show success after verified saves; no ratings/stars/testimonials. **Only Mobile is optional; it is not a separate screen.** Name remains its own screen immediately after Account Setup. Plan encrypted device-local fitness storage and private minimum cloud identity; existing workout sync/backup rules are unchanged.

## Additional pending policy — abandoned signup cleanup

Owner requested eventual cleanup of abandoned Supabase account creations. [Proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) describes **7-day unverified** and **30-day verified-but-never-activated inactive** candidates with 7-day warning, secure server-side preflight and a **permanent exclusion once an account could own local encrypted data**. A **separate new proposal** covers fully established FREE accounts: **6-month review, 11-month warning, 12-month candidate review**, but destructive removal is **blocked** until the owner approves risks to offline/local bound workout recovery and independent security/privacy tests. Uninstall/fully-offline use is not remotely knowable. Time limits and automatic deletion need separate owner approval; **no job, backend migration, deletion or email was executed**.

## Additional proposed cloud account metadata — not deployed

Owner additionally requested **Platform, OS version, App build, Avatar, Plan** on Supabase. ADR-019 proposes nullable latest-known iOS/Android + OS version + app version/build in an account-private snapshot, **`profiles.avatar_url`** pointing to an account-owned image in a private Storage bucket, uploaded from Profile Settings or imported from **future** separately approved Google signup after user approval; on user photo change, update the URL after upload succeeds, then delete the old bucket object. **Email signup has no required photo:** if `avatar_url=NULL`, render a local initials avatar from the required Name (e.g. **Tnyx Tio → TT**); Profile Settings can upload/change/remove any time and removal restores initials without storing/uploading a default image. It also proposes a server-controlled `FREE` plan status. No new required signup step, no forced network/heartbeat, and no workouts uploaded. Plan entitlement, RLS, avatar privacy, retention and implementation need separate authorization. The PR #13 P3 thread was resolved, `im-tio` formally approved exact HEAD and the owner authorized the squash merge. This **does not** approve cloud schema, Avatar Storage, inactive-account deletion or Google OAuth.

## Next safe action

**Current scope:** Review and reconcile [PR #18](https://github.com/im-tnyx/Tio-Workspace/pull/18) against live `main` following PR #17 merge. Verify changed files, independent review, required App check and exact-head merge gate. Do not merge without explicit owner approval. Security activation has passed clean/negative disposable smoke tests; stale-head, spoofing and guard-integrity edge-case tests are not yet claimed complete.

**Separate preview follow-up:** The manual GitHub Expo PR Preview workflow is available on `main`. `EXPO_TOKEN` is configured in GitHub's `eas-preview` environment; never put its value in this file or source. No build or update has been dispatched. For the first compatible install, use `build_preview` with `android` on an eligible owner-authored open PR targeting `main`, then install that binary once. The merged PR #15 itself is closed and cannot be selected. Later JS-only PRs may use `publish_update`; PRs touching native-affecting files are blocked from OTA and need a new preview build first. iOS signing credentials are not configured. Production publishing remains out of scope.

After this task, the next product decision remains review of [proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) and [Phase 1 readiness](../docs/21-PHASE-1-READINESS.md). No Auth/session/SQLite/Supabase implementation is authorized.

[Archived tasks](archive/2026/) · [AGENTS](../AGENTS.md) · [Post-merge playbook](../docs/12-POST-MERGE-PLAYBOOK.md)
