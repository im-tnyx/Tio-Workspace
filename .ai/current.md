# 🧭 Current AI Context

> Read after [AGENTS.md](../AGENTS.md). This pointer is task metadata, not proof of live GitHub/CI status.

| Field | Value |
|---|---|
| Status | **Expo Go Codespaces auto-wake blocked by current GitHub access controls; no Codespace or token verified** |
| Active Task | [Codespaces preview task](tasks/devex/local-20261115-expo-go-codespaces-preview.md) — [PR #18](https://github.com/im-tnyx/Tio-Workspace/pull/18) open; security gate pending |
| Active Scope / Owner | Dedicated `tnyx/expo-preview` branch, dev container, push-triggered wake/sync, and setup docs only |
| Branch | `tnyx/expo-preview` |
| Base / inspected `main` | `095c3edb4a7b1969598bc01162d66496febbf0c2` at task start; verify live state before review/merge |
| Completed PRs | [#11 Expo mock shell](https://github.com/im-tnyx/Tio-Workspace/pull/11), [#12 prior post-merge docs](https://github.com/im-tnyx/Tio-Workspace/pull/12), [#13 proposed ADR-019 docs](https://github.com/im-tnyx/Tio-Workspace/pull/13), [#14 context reconciliation](https://github.com/im-tnyx/Tio-Workspace/pull/14), [#15 manual Expo preview workflow](https://github.com/im-tnyx/Tio-Workspace/pull/15) — **all merged** |
| Proposal | [ADR-019 minimal cloud profile and local onboarding](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) |
| Implementation authority | Owner selected a dedicated Expo Go Codespaces preview branch and push-triggered auto-wake; token/Codespace setup remains owner-operated, and this does not authorize app features, EAS publishing, production, Auth, DB or sync work |
| PR #13 final review | `im-tio` **APPROVED** exact head `944efa7799d6f8d803e1a16506ee0ff5ec7d3f81`; 1/1 P3 thread resolved; owner-approved squash merge verified |

## Exact owner-requested signup and onboarding

**Email → OTP → Password** is the fixed UI order, not subject to redesign. Continue **Account Setup (Username required + Mobile optional, same screen)** → **Name** → DOB (**required**) → Sex (**required**) → Units → Height → Current Weight → Activity Level → Goal → **Final Setup (progress circle → done/checkmark → bottom Continue)** → Home. Only show success after verified saves; no ratings/stars/testimonials. **Only Mobile is optional; it is not a separate screen.** Name remains its own screen immediately after Account Setup. Plan encrypted device-local fitness storage and private minimum cloud identity; existing workout sync/backup rules are unchanged.

## Additional pending policy — abandoned signup cleanup

Owner requested eventual cleanup of abandoned Supabase account creations. [Proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) describes **7-day unverified** and **30-day verified-but-never-activated inactive** candidates with 7-day warning, secure server-side preflight and a **permanent exclusion once an account could own local encrypted data**. A **separate new proposal** covers fully established FREE accounts: **6-month review, 11-month warning, 12-month candidate review**, but destructive removal is **blocked** until the owner approves risks to offline/local bound workout recovery and independent security/privacy tests. Uninstall/fully-offline use is not remotely knowable. Time limits and automatic deletion need separate owner approval; **no job, backend migration, deletion or email was executed**.

## Additional proposed cloud account metadata — not deployed

Owner additionally requested **Platform, OS version, App build, Avatar, Plan** on Supabase. ADR-019 proposes nullable latest-known iOS/Android + OS version + app version/build in an account-private snapshot, **`profiles.avatar_url`** pointing to an account-owned image in a private Storage bucket, uploaded from Profile Settings or imported from **future** separately approved Google signup after user approval; on user photo change, update the URL after upload succeeds, then delete the old bucket object. **Email signup has no required photo:** if `avatar_url=NULL`, render a local initials avatar from the required Name (e.g. **Tnyx Tio → TT**); Profile Settings can upload/change/remove any time and removal restores initials without storing/uploading a default image. It also proposes a server-controlled `FREE` plan status. No new required signup step, no forced network/heartbeat, and no workouts uploaded. Plan entitlement, RLS, avatar privacy, retention and implementation need separate authorization. The PR #13 P3 thread was resolved, `im-tio` formally approved exact HEAD and the owner authorized the squash merge. This **does not** approve cloud schema, Avatar Storage, inactive-account deletion or Google OAuth.

## Next safe action

PR #18 has the accepted-SHA sync fix, but its secret boundary remains blocked: live GitHub inspection on 2026-11-15 found `im-tio` has push access and `main` protection/rulesets return `403` with an upgrade-to-Pro-or-public message. Existing environments have no branch restriction. Do not add `CODESPACES_TOKEN` until an enforceable `main` restriction and trusted workflow-write policy are verified. No token or Codespace was created here. After an authorized merge and the security gate, the owner can create the Codespace once and run `npx expo login` there using the same account as Expo Go; verify phone connectivity before claiming live preview.

**Concurrent PR note:** PR #17 remains open and also changes this file to point at its commit-attribution task. This Codespaces task supersedes that pointer for the active conversation; the PR #17 owner must reconcile `.ai/current.md` before merging either PR. This task has not modified PR #17's branch.

The manual GitHub Expo PR Preview workflow remains available on `main` as a separate EAS path. `EXPO_TOKEN` in `eas-preview` is unrelated to the new `CODESPACES_TOKEN`; never put either value in this file or source. The EAS workflow can build a compatible Android preview or publish eligible OTA updates; iOS signing credentials remain unconfigured. Production publishing remains out of scope.

After this task, the next product decision remains review of [proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) and [Phase 1 readiness](../docs/21-PHASE-1-READINESS.md). No Auth/session/SQLite/Supabase implementation is authorized.

[Archived tasks](archive/2026/) · [AGENTS](../AGENTS.md) · [Post-merge playbook](../docs/12-POST-MERGE-PLAYBOOK.md)
