# 🧭 Current AI Context

> Read after [AGENTS.md](../AGENTS.md). This pointer is task metadata, not proof of live GitHub/CI status.

| Field | Value |
|---|---|
| Status | **Manual GitHub PR preview workflow in progress; preview channel only** |
| Active Task | [Manual PR preview build/update workflow](tasks/ci/local-20261115-manual-pr-expo-preview.md) |
| Active Scope / Owner | GitHub Actions + EAS preview publishing; no production publish |
| Branch | `tnyx/ci/manual-pr-expo-preview` |
| Base / verified `main` | `762095ff6c049c2e5c559eedfa56f768de7fcbb9` (PR #14 squash merge) |
| Completed PRs | [#11 Expo mock shell](https://github.com/im-tnyx/Tio-Workspace/pull/11), [#12 prior post-merge docs](https://github.com/im-tnyx/Tio-Workspace/pull/12), [#13 proposed ADR-019 docs](https://github.com/im-tnyx/Tio-Workspace/pull/13), [#14 context reconciliation](https://github.com/im-tnyx/Tio-Workspace/pull/14) — **all merged** |
| Proposal | [ADR-019 minimal cloud profile and local onboarding](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) |
| Implementation authority | Owner authorized this bounded preview-only GitHub/EAS workflow; production publishing and Auth/DB/sync implementation remain unauthorized |
| PR #13 final review | `im-tio` **APPROVED** exact head `944efa7799d6f8d803e1a16506ee0ff5ec7d3f81`; 1/1 P3 thread resolved; owner-approved squash merge verified |

## Exact owner-requested signup and onboarding

**Email → OTP → Password** is the fixed UI order, not subject to redesign. Continue **Account Setup (Username required + Mobile optional, same screen)** → **Name** → DOB (**required**) → Sex (**required**) → Units → Height → Current Weight → Activity Level → Goal → **Final Setup (progress circle → done/checkmark → bottom Continue)** → Home. Only show success after verified saves; no ratings/stars/testimonials. **Only Mobile is optional; it is not a separate screen.** Name remains its own screen immediately after Account Setup. Plan encrypted device-local fitness storage and private minimum cloud identity; existing workout sync/backup rules are unchanged.

## Additional pending policy — abandoned signup cleanup

Owner requested eventual cleanup of abandoned Supabase account creations. [Proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) describes **7-day unverified** and **30-day verified-but-never-activated inactive** candidates with 7-day warning, secure server-side preflight and a **permanent exclusion once an account could own local encrypted data**. A **separate new proposal** covers fully established FREE accounts: **6-month review, 11-month warning, 12-month candidate review**, but destructive removal is **blocked** until the owner approves risks to offline/local bound workout recovery and independent security/privacy tests. Uninstall/fully-offline use is not remotely knowable. Time limits and automatic deletion need separate owner approval; **no job, backend migration, deletion or email was executed**.

## Additional proposed cloud account metadata — not deployed

Owner additionally requested **Platform, OS version, App build, Avatar, Plan** on Supabase. ADR-019 proposes nullable latest-known iOS/Android + OS version + app version/build in an account-private snapshot, **`profiles.avatar_url`** pointing to an account-owned image in a private Storage bucket, uploaded from Profile Settings or imported from **future** separately approved Google signup after user approval; on user photo change, update the URL after upload succeeds, then delete the old bucket object. **Email signup has no required photo:** if `avatar_url=NULL`, render a local initials avatar from the required Name (e.g. **Tnyx Tio → TT**); Profile Settings can upload/change/remove any time and removal restores initials without storing/uploading a default image. It also proposes a server-controlled `FREE` plan status. No new required signup step, no forced network/heartbeat, and no workouts uploaded. Plan entitlement, RLS, avatar privacy, retention and implementation need separate authorization. The PR #13 P3 thread was resolved, `im-tio` formally approved exact HEAD and the owner authorized the squash merge. This **does not** approve cloud schema, Avatar Storage, inactive-account deletion or Google OAuth.

## Next safe action

Complete the manual PR workflow and review the proposed changes. Before running it, add the Expo access token as the GitHub Actions repository secret `EXPO_TOKEN`; never put the value in this file or source. Install a compatible preview build once to receive QR-free OTA updates. The workflow must publish only to the `pr-preview` branch; production publishing is out of scope.

After this task, the next product decision remains review of [proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) and [Phase 1 readiness](../docs/21-PHASE-1-READINESS.md). No Auth/session/SQLite/Supabase implementation is authorized.

[Archived task](archive/2026/local-20261115-minimal-cloud-profile-onboarding.md) · [AGENTS](../AGENTS.md) · [Post-merge playbook](../docs/12-POST-MERGE-PLAYBOOK.md)
