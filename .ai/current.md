# 🧭 Current AI Context

> Read after [AGENTS.md](../AGENTS.md). This pointer is task metadata, not proof of live GitHub/CI status.

| Field | Value |
|---|---|
| Status | **Phase 1.2 Task 03 documentation review in progress; production Auth BLOCKED** |
| Active Task | [OTP-first Auth architecture and ADR reconciliation](tasks/auth/local-20261116-otp-first-architecture.md); no product implementation assigned. Prior preview task remains [archived](archive/2026/local-20261115-expo-go-codespaces-preview.md). |
| Active Scope / Owner | Codex documentation-only branch; owner retains Auth implementation, hosted settings, privacy and merge decisions |
| Branch | `tnyx/phase12-auth-architecture` from verified `main` `2a6877899ef51331739c38e850b6d2a6455e8795`; resolve PR HEAD live |
| Verified merged `main` | `2a6877899ef51331739c38e850b6d2a6455e8795` (PR #23 merge, 2026-11-16); GitHub had no open PR at Task 03 bootstrap |
| Completed PRs | [#11](https://github.com/im-tnyx/Tio-Workspace/pull/11), [#12](https://github.com/im-tnyx/Tio-Workspace/pull/12), [#13](https://github.com/im-tnyx/Tio-Workspace/pull/13), [#14](https://github.com/im-tnyx/Tio-Workspace/pull/14), [#15](https://github.com/im-tnyx/Tio-Workspace/pull/15), [#17](https://github.com/im-tnyx/Tio-Workspace/pull/17), [#18](https://github.com/im-tnyx/Tio-Workspace/pull/18), [#21](https://github.com/im-tnyx/Tio-Workspace/pull/21), [#22](https://github.com/im-tnyx/Tio-Workspace/pull/22) and [#23](https://github.com/im-tnyx/Tio-Workspace/pull/23) all merged |
| Proposal | [ADR-019 minimal cloud profile and local onboarding](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) — **proposed, not implemented** |
| Implementation authority | Only previously approved mock-shell/preview infrastructure changes are merged. No real Auth, Supabase profile, avatar bucket, local SQLCipher workout DB, paid sync, auto-deletion, EAS publishing or production work has been authorized. |
| Commit attribution gate | [Main Protection ruleset `27218050`](https://github.com/im-tnyx/Tio-Workspace/rules/27218050) is active and strict, with **App-owned `Commit attribution guard`** (App ID `5032971`) required. Clean/bad disposable PR #19/#20 checks were demonstrated; stale-head/spoofed-check/integrity adversarial PR tests remain outstanding. |
| PR #21 final gate | `im-tio` formally **APPROVED** exact PR HEAD `fe91eb77ec32a5b2e98b3d441e23161318a7631e`; earlier P2 threads resolved; required App-owned check PASS; merge `6b0ec5b` verified. |
| Temporary guard exception | Owner states `ATTRIBUTION_GUARD_CHANGE_APPROVED_PR_HEAD` was **removed** after PR #21; current environment-variable absence was not independently inspected. Normal App-required check and Main Protection remain in place. |

## Merge history, operational status and outstanding evidence

- [PR #17](https://github.com/im-tnyx/Tio-Workspace/pull/17) merged at `fdc33d719975940058018dd283c7e9b4915c0286`; [PR #18](https://github.com/im-tnyx/Tio-Workspace/pull/18) merged at `941484bbd6109fd263681ca49200bf689e24d9e2`; [PR #21](https://github.com/im-tnyx/Tio-Workspace/pull/21) merged on 2026-11-16 at `6b0ec5b0413cf3a22c3c631368ac883f7f29d630`. None of these merges authorize new product functionality.
- Owner earlier verified an Expo Go mock UI on a phone. [Preview push signal `43815555568`](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43815555568) succeeded for `tnyx/expo-preview` push `b366ff856f0faad761ed7315530198cf72078861`. [Trusted worker `43815573691`](https://github.com/im-tnyx/Tio-Workspace/actions/runs/43815573691) succeeded with Codespace discovery and fast-forward/Expo refresh steps. This does **not** establish that the Codespace was stopped before the push or that a physical phone automatically refreshed after that push.
- The completed Codespaces infrastructure task is [archived](archive/2026/local-20261115-expo-go-codespaces-preview.md). The guard task remains at its [historical linked path](tasks/security/local-20261115-commit-attribution-guard.md), because the protected [guard guide](../docs/26-COMMIT-ATTRIBUTION-GUARD.md) refers to it; avoid protected guard-guide changes solely for archival tidiness. The guard's adversarial stale-head/spoof/integrity PR tests are still a future verification slice.
- Owner-confirmed removal of the temporary exact-head guard approval is a user-reported action, not a direct environment read. **Do not remove or weaken the permanent App-owned required check, trusted guard workflow, App credentials or Main Protection ruleset.**

## Exact owner-requested signup and onboarding

**Email → OTP → Password** is the fixed UI order, not subject to redesign. Continue **Account Setup (Username required + Mobile optional, same screen)** → **Name** → DOB (**required**) → Sex (**required**) → Units → Height → Current Weight → Activity Level → Goal → **Final Setup (progress circle → done/checkmark → bottom Continue)** → Home. Only show success after verified saves; no ratings/stars/testimonials. **Only Mobile is optional; it is not a separate screen.** Name remains its own screen immediately after Account Setup. Plan encrypted device-local fitness storage and private minimum cloud identity; existing workout sync/backup rules are unchanged.

## Additional pending policy — abandoned signup cleanup

Owner requested eventual cleanup of abandoned Supabase account creations. [Proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) describes **7-day unverified** and **30-day verified-but-never-activated inactive** candidates with 7-day warning, secure server-side preflight and a **permanent exclusion once an account could own local encrypted data**. A **separate new proposal** covers fully established FREE accounts: **6-month review, 11-month warning, 12-month candidate review**, but destructive removal is **blocked** until the owner approves risks to offline/local bound workout recovery and independent security/privacy tests. Uninstall/fully-offline use is not remotely knowable. Time limits and automatic deletion need separate owner approval; **no job, backend migration, deletion or email was executed**.

## Additional proposed cloud account metadata — not deployed

Owner additionally requested **Platform, OS version, App build, Avatar, Plan** on Supabase. ADR-019 proposes nullable latest-known iOS/Android + OS version + app version/build in an account-private snapshot, **`profiles.avatar_url`** pointing to an account-owned image in a private Storage bucket, uploaded from Profile Settings or imported from **future** separately approved Google signup after user approval; on user photo change, update the URL after upload succeeds, then delete the old bucket object. **Email signup has no required photo:** if `avatar_url=NULL`, render a local initials avatar from the required Name (e.g. **Tnyx Tio → TT**); Profile Settings can upload/change/remove any time and removal restores initials without storing/uploading a default image. It also proposes a server-controlled `FREE` plan status. No new required signup step, no forced network/heartbeat, and no workouts uploaded. Plan entitlement, RLS, avatar privacy, retention and implementation need separate authorization. The PR #13 P3 thread was resolved, `im-tio` formally approved exact HEAD and the owner authorized the squash merge. This **does not** approve cloud schema, Avatar Storage, inactive-account deletion or Google OAuth.

## Next safe action

Task 03 OTP-first Auth architecture PR requires independent review and separate owner merge approval. Its design records a production Auth blocker; merging docs will not authorize Auth code, hosted Supabase settings or private-profile schema.

**Next product decision (not yet authorized to implement):** review [proposed ADR-019](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md), [Phase 1 readiness](../docs/21-PHASE-1-READINESS.md), and [open Phase 0 issue #2](https://github.com/im-tnyx/Tio-Workspace/issues/2). In particular, prove the fixed **Email → OTP → Password** Supabase Auth mechanism before schema/UI implementation, and separately approve sensitive profile/RLS/privacy, age policy, installation-bound offline safety and cleanup/recovery tradeoffs.

**Ops QA still pending:** prove a genuinely stopped Codespace can auto-start after an eligible new push, then verify the changed view on Expo Go hardware. The separate manual EAS preview uses `EXPO_TOKEN` in `eas-preview`; it is not the `CODESPACES_TOKEN` in `expo-codespaces-trusted`. No iOS signing or production release is implied.

[Archived tasks](archive/2026/) · [AGENTS](../AGENTS.md) · [Post-merge playbook](../docs/12-POST-MERGE-PLAYBOOK.md)
