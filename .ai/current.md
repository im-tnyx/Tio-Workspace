# 🧭 Current AI Context

> Read after [AGENTS.md](../AGENTS.md). This pointer is task metadata, not proof of live GitHub/CI status.

| Field | Value |
|---|---|
| Status | **PR #17 merged; PR #18 Codespaces preview in review; token/Codespace/device pending** |
| Active Task | [Codespaces preview task](tasks/devex/local-20261115-expo-go-codespaces-preview.md) — [PR #18](https://github.com/im-tnyx/Tio-Workspace/pull/18) open; [PR #17 guard task](tasks/security/local-20261115-commit-attribution-guard.md) remains recorded |
| Active Scope / Owner | Dedicated `tnyx/expo-preview` branch, dev container, push-triggered wake/sync, and setup docs only |
| Branch | `tnyx/expo-preview` |
| Base / inspected `main` | `fdc33d719975940058018dd283c7e9b4915c0286` after PR #17 merge; verify live state before review/merge |
| Completed PRs | [#11 Expo mock shell](https://github.com/im-tnyx/Tio-Workspace/pull/11), [#12 prior post-merge docs](https://github.com/im-tnyx/Tio-Workspace/pull/12), [#13 proposed ADR-019 docs](https://github.com/im-tnyx/Tio-Workspace/pull/13), [#14 context reconciliation](https://github.com/im-tnyx/Tio-Workspace/pull/14), [#15 manual Expo preview workflow](https://github.com/im-tnyx/Tio-Workspace/pull/15), [#17 commit attribution guard](https://github.com/im-tnyx/Tio-Workspace/pull/17) — **all merged** |
| Proposal | [ADR-019 minimal cloud profile and local onboarding](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) |
| Implementation authority | Owner selected a dedicated Expo Go Codespaces preview branch and push-triggered auto-wake; token/Codespace setup remains owner-operated. PR #17 governance is merged; it does not authorize app features, EAS publishing, production, Auth, DB or sync work |
| PR #13 final review | `im-tio` **APPROVED** exact head `944efa7799d6f8d803e1a16506ee0ff5ec7d3f81`; 1/1 P3 thread resolved; owner-approved squash merge verified |

## Concurrent PR merge-order / pointer ownership

- PR #17 is merged at `fdc33d719975940058018dd283c7e9b4915c0286`; its guard policy, workflows, task evidence and [activation guide](../docs/26-COMMIT-ATTRIBUTION-GUARD.md) remain in `main`.
- PR #18 is the current bounded task. Require fresh App checks, independent review, resolved threads and PR #18's own owner `go merge`. Merged guard source alone does not prove App Check Run operation or permit a ruleset bypass.

## Exact owner-requested signup and onboarding

**Email → OTP → Password** is the fixed UI order, not subject to redesign. Continue **Account Setup (Username required + Mobile optional, same screen)** → **Name** → DOB (**required**) → Sex (**required**) → Units → Height → Current Weight → Activity Level → Goal → **Final Setup (progress circle → done/checkmark → bottom Continue)** → Home. Only show success after verified saves; no ratings/stars/testimonials. **Only Mobile is optional; it is not a separate screen.** Name remains its own screen immediately after Account Setup. Plan encrypted device-local fitness storage and private minimum cloud identity; existing workout sync/backup rules are unchanged.

## Additional pending policy — abandoned signup cleanup

Owner requested eventual cleanup of abandoned Supabase account creations. [Proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) describes **7-day unverified** and **30-day verified-but-never-activated inactive** candidates with 7-day warning, secure server-side preflight and a **permanent exclusion once an account could own local encrypted data**. A **separate new proposal** covers fully established FREE accounts: **6-month review, 11-month warning, 12-month candidate review**, but destructive removal is **blocked** until the owner approves risks to offline/local bound workout recovery and independent security/privacy tests. Uninstall/fully-offline use is not remotely knowable. Time limits and automatic deletion need separate owner approval; **no job, backend migration, deletion or email was executed**.

## Additional proposed cloud account metadata — not deployed

Owner additionally requested **Platform, OS version, App build, Avatar, Plan** on Supabase. ADR-019 proposes nullable latest-known iOS/Android + OS version + app version/build in an account-private snapshot, **`profiles.avatar_url`** pointing to an account-owned image in a private Storage bucket, uploaded from Profile Settings or imported from **future** separately approved Google signup after user approval; on user photo change, update the URL after upload succeeds, then delete the old bucket object. **Email signup has no required photo:** if `avatar_url=NULL`, render a local initials avatar from the required Name (e.g. **Tnyx Tio → TT**); Profile Settings can upload/change/remove any time and removal restores initials without storing/uploading a default image. It also proposes a server-controlled `FREE` plan status. No new required signup step, no forced network/heartbeat, and no workouts uploaded. Plan entitlement, RLS, avatar privacy, retention and implementation need separate authorization. The PR #13 P3 thread was resolved, `im-tio` formally approved exact HEAD and the owner authorized the squash merge. This **does not** approve cloud schema, Avatar Storage, inactive-account deletion or Google OAuth.

## Next safe action

PR #18 now includes the accepted-SHA sync fix and is reconciling against the merged guard. The repository is public; `main` approval/last-push/admin protection and exact-`main` policy on `expo-codespaces-trusted` were previously verified. No `CODESPACES_TOKEN` or Codespace was present at that check; recheck live state before final handoff. Resolve the latest review findings, verify required guard checks at the new PR head, and obtain PR #18's own merge authorization. After merge, the owner adds the environment secret, creates one Codespace, runs `npx expo login` and restarts the Expo starter once to verify phone connection.

The manual GitHub Expo PR Preview workflow remains available on `main` as a separate EAS path. `EXPO_TOKEN` in `eas-preview` is unrelated to `CODESPACES_TOKEN`; never put either value in this file or source. It supports a compatible Android preview build or eligible OTA update; iOS signing credentials remain unconfigured. Production publishing remains out of scope.

After this task, the next product decision remains review of [proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) and [Phase 1 readiness](../docs/21-PHASE-1-READINESS.md). No Auth/session/SQLite/Supabase implementation is authorized.

[Archived tasks](archive/2026/) · [AGENTS](../AGENTS.md) · [Post-merge playbook](../docs/12-POST-MERGE-PLAYBOOK.md)
