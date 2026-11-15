# 🧭 Current AI Context

> Read after [AGENTS.md](../AGENTS.md). This pointer is task metadata, not proof of live GitHub/CI status.

| Field | Value |
|---|---|
| Status | **Docs-only onboarding ADR proposal — review pending; Phase 1.1 merged** |
| Active Task | [Minimal cloud profile + local onboarding proposal](tasks/docs/local-20261115-minimal-cloud-profile-onboarding.md) |
| Active Scope / Owner | Documentation agent — no real Auth/DB implementation authority |
| Branch | `docs/phase1-2-minimal-profile-onboarding-20261115` |
| Inspected `main` | `d3b6ceec7f31b5084b86685f90f0adabe5bcadd0` (2026-11-15) |
| Completed PRs | [#11 Phase 1.1 Expo mock shell](https://github.com/im-tnyx/Tio-Workspace/pull/11) and [#12 post-merge docs](https://github.com/im-tnyx/Tio-Workspace/pull/12) **both merged** |
| Proposal | [ADR-019 minimal cloud profile and local onboarding](../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) |
| Implementation authority | **None granted** for Phase 1.2+, Supabase tables, real OTP/Auth, encrypted SQLite, Sync or deployment |
| Review status | `REVIEW_PENDING`; merge approval **not granted** |

## Exact owner-requested signup and onboarding

**Email → OTP → Password** is the fixed UI order, not subject to redesign. Continue **Account Setup (Username required + Mobile optional, same screen)** → **Name** → DOB (**required**) → Sex (**required**) → Units → Height → Current Weight → Activity Level → Goal → **Final Setup (progress circle → done/checkmark → bottom Continue)** → Home. Only show success after verified saves; no ratings/stars/testimonials. **Only Mobile is optional; it is not a separate screen.** Name remains its own screen immediately after Account Setup. Plan encrypted device-local fitness storage and private minimum cloud identity; existing workout sync/backup rules are unchanged.

## Next safe action

Continue review of the open documentation-only [PR #13](https://github.com/im-tnyx/Tio-Workspace/pull/13) with reviewer `im-tio` requested. Validate source-of-truth consistency and explicit privacy/security decisions; **separate owner merge approval** remains necessary. If the actual Supabase OTP-before-password mechanism cannot be implemented securely, flag the technical blocker without reordering the UI.

After any separately approved docs merge, reconcile and archive this task. **No live Auth/session/SQLite/Supabase implementation or deployment is authorized by this handoff.**

[Task](tasks/docs/local-20261115-minimal-cloud-profile-onboarding.md) · [AGENTS](../AGENTS.md) · [Post-merge playbook](../docs/12-POST-MERGE-PLAYBOOK.md)
