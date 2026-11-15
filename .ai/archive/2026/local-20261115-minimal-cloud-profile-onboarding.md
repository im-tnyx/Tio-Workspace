# Minimal private cloud profile + local fitness onboarding proposal

| Field | Value |
|---|---|
| Status | **Complete — docs-only PR #13 squash merged 2026-11-15; ADR-019 remains proposed** |
| Objective | One reviewable proposed ADR capturing the owner's exact signup/onboarding field order and remote/local data boundary |
| Implementation owner | Documentation agent (this bounded docs-only task; not an Auth implementation owner) |
| Previous agent | None assigned for this task |
| Last reviewed head / merge | `944efa7799d6f8d803e1a16506ee0ff5ec7d3f81` / `237a88fe5c6c30ae940a920ec71659cc947aeaf3` |
| Tracking / approval | Owner docs-task instruction on 2026-11-15; [PR #13](https://github.com/im-tnyx/Tio-Workspace/pull/13); **documentation only**, not production database/Auth approval |
| Branch | `docs/phase1-2-minimal-profile-onboarding-20261115` |
| Base / verified merged `main` | `d3b6ceec7f31b5084b86685f90f0adabe5bcadd0` / `237a88fe5c6c30ae940a920ec71659cc947aeaf3` |
| Platform and file scope | Docs, ADR proposal, documentation hub and single task pointer only; both iOS/Android Auth and local fitness acceptance planned |
| Created / updated | 2026-11-15 |

## Required context

- [x] [AGENTS.md](../../../AGENTS.md) read, phase/approval gates observed
- [x] [Current pointer](../../current.md) reconciled against live GitHub: PR #12 already merged; old next-action paragraph stale
- [x] [Core architecture](../../core/architecture.md), [security](../../core/security-rules.md) and [canonical docs](../../../docs/00-INDEX.md) reviewed
- [x] Live `main` HEAD and zero open PRs verified before creating the branch
- [x] GitHub review **requested** from `im-tio` on [PR #13](https://github.com/im-tnyx/Tio-Workspace/pull/13)
- [x] Independent **COMMENTED** review posted by `im-tio` on original HEAD `0d4cf52`; one P3 whitespace finding; author pushed a narrow fix
- [x] Independent re-review and formal `im-tio` `APPROVED` on exact PR HEAD `944efa7`; owner-run `git diff --check` on reviewed remote branch; distinct owner `go merge` authorization; PR #13 squash merged to `main` as `237a88f`

## Approved scope / non-goals

- **In scope:** propose [ADR-019](../../../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) with Email → OTP → Password → **Account Setup [Username + Mobile (optional)]** → **Name (separate next screen)** → DOB (required) → Sex (required) → Units → Height → Current Weight → Activity Level → Goal → **Final Setup progress → Done checkmark → Continue → Home**; record cloud/local boundaries, risk questions, RLS and acceptance criteria.
- **In scope:** link from docs index and decision register as **proposed**, keep this single task pointer updated. Record Email → OTP → Password as fixed owner choice, and document technical feasibility/reconciliation without suggesting a different screen order.
- **Out of scope for the original drafting task:** any app code, mock-screen revision, Auth/provider configuration, SQL migrations, live Supabase table, local SQLite implementation, secrets or deployment. The **separate owner-authorized docs merge** occurred later after review; this record does not approve implementation.
- **Authority:** Owner's "start" authorizes preparing these docs for review; **it does not authorize runtime Phase 1.2+ or acceptance of unresolved security/privacy decisions**.

## Selected skills and tools

- GitHub connected repository tools: inspect actual repo; create a docs branch and PR.
- Supabase installed skill (`skills://plugins/supabase/supabase/skill.md`): review RLS/auth boundary only; no writes.
- Supabase official passwordless email and user-management docs: reference implementation-feasibility decisions.
- The drafting agent had no local Git checkout; the **repository owner** subsequently ran `git diff --check` in Windows PowerShell with empty output on the final reviewed branch diff. The agent did not run it. No runtime/native/Supabase tests ran for this docs-only task.

## Durable decisions and open gates

**Owner-required inputs:** Email/OTP/Password, Username, Name, DOB and Sex; **Mobile is the only optional onboarding input**, with Skip. Units/Height/Current Weight/Activity Level/Goal required locally. Mobile is an optional field **within Account Setup** alongside required Username; **no standalone Mobile screen**. Separate Name screen occurs immediately after Account Setup.

**Finalization UX (owner screenshot references):** Centered circular progress ring with a **percentage in the middle when actual completed checkpoints are measurable**, and “Personalizing your experience…”. At genuinely verified 100% replace the percentage with a centered checkmark + “You're all set!”, then reveal the bottom Continue CTA. **Exclude** cards, ratings, stars and carousel. No fake/timer-based percentages: use indeterminate fallback if numeric progress cannot be verified. Failures retry safely and returning users skip this first-run step. Acceptance tests ONB-11/12 are in proposed ADR-019.

**Abandoned signup cleanup proposal (new owner request):** Add **7-day unverified** and **30-day verified-but-never-activated inactivity** candidates with a 7-day advance warning for verified email. A server-owned protected activation marker must be durable **before local account binding**; **never delete established accounts or users with locally incomplete onboarding**. Require dry-run, fail-closed eligibility, protected admin delete via scheduled server job, concurrent-resume race tests and separately approved deletion periods/implementation. Acceptance tests ONB-13–16 added. **New owner-requested established FREE-account expiry is separate:** propose 6-month review/reminder, 11-month warning and 12-month review-only checkpoint (ONB-17–20), never equate missing remote activity with uninstall while local-first/offline use remains valid. No real established-account deletion until written owner acceptance of local identity/recovery data-loss risk, privacy notice, actual server activity evidence, authenticated keep-account flow and separate implementation gate. No real server deletion or job configured.

**Additional Supabase account metadata (owner request, proposed only):** optional Avatar image in private Supabase Storage with **`profiles.avatar_url TEXT NULL`** pointing to a stable unsigned own-bucket URL; two sources are **Profile Settings upload** and **future approved Google signup picture import** (copy into Tio's private bucket, never hotlink Google). **Email signup shows text initials when no photo** (e.g. `Tnyx Tio` → `TT`), derived from Name without any cloud image/initials column. Profile Settings Upload/Change/Remove is optional anytime; removing sets `avatar_url=NULL` and restores initials. Replacing photo must upload new object → durably update URL → delete old Tio-owned object with retry/concurrency safety; default `FREE` **account tier (not workout plan)** in a non-client-writable entitlement source; Platform/OS version/App version+build in a **latest-known nullable private account snapshot**, refreshed only with permitted online account interactions. No required Avatar signup step, no automatic device heartbeat, no workout upload, no paid implementation. Enforce per-user RLS, strict Storage ownership, no client tier promotion, bounded device strings and data deletion. Acceptance IDs ONB-21–29 (new replacement, Google-import and initials fallback tests); actual schema/bucket/entitlements approvals remain pending.

**Proposed storage (not deployed):** Cloud `auth.users` for email/account/password credentials, a proposed owner-private `public.profiles` for username/full_name/DOB/calculation_sex/nullable mobile/**`avatar_url`**, server-owned future account tier and minimal private device snapshot. Local encrypted DB for units, height, measured weight, activity, goal, workouts and resume metadata.

**Fixed UI:** Email → OTP → Password **must remain exactly in this order**. Owner provided Flutter account-setup adapter reference: `completeAccountSetup({String? mobile})` supports optional mobile without proving actual UI; Flutter implementation is not copied into Expo. **Unresolved technical gates:** cleanup threshold/grace/notification approval, protected activation marker before any local DB access, server-only hard deletion security and JWT/session caveats; **separate established free-account inactivity expiration proposal (12-month candidate only) with owner security/privacy and offline data-recovery decision pending**; provider-supported password setup following verified OTP (do not reorder UI), ADR-017 legacy wording, previously optional username, required sensitive field privacy/age policy, backend RLS/uniqueness, deletion and native encryption validation. No plan counts or existing single-bound-account guarantees changed.

## Progress / changed files

- [x] Verified latest GitHub `main`, PR #11 and merged documentation PR #12
- [x] Produced bounded proposal without changing runtime or Supabase
- [x] Created [PR #13](https://github.com/im-tnyx/Tio-Workspace/pull/13), with a docs-only 5-file diff; requested review from `im-tio`
- [x] Corrected four trailing-whitespace lines in two docs, preserving Markdown structure; GitHub remote patch whitespace scan clean on first fix HEAD `3cc58eb`
- [x] Owner-provided Windows PowerShell `git diff --check origin/main...origin/docs/phase1-2-minimal-profile-onboarding-20261115` yielded no output on prior PR HEAD `df5595a`; P3 review thread marked resolved and evidence posted
- [x] Final owner-run Windows check returned no whitespace errors; `im-tio` approved current HEAD, and the owner explicitly authorized merge; resulting merge verified on `main`

Expected docs-only paths: `docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md`, `docs/00-INDEX.md`, `docs/09-DECISIONS.md` (proposal pointer only), `.ai/current.md`, this task.

## PR review evidence and findings — final verified state

- **[PR #13](https://github.com/im-tnyx/Tio-Workspace/pull/13)** closed/merged on **2026-11-15 12:16:39 UTC** using **squash**. Reviewed PR HEAD: `944efa7799d6f8d803e1a16506ee0ff5ec7d3f81`; merge commit on `main`: `237a88fe5c6c30ae940a920ec71659cc947aeaf3`.
- **Independent reviewer:** `im-tio` submitted an exact-HEAD `COMMENTED` re-review with no new verified P0–P3 defects, then a formal GitHub **`APPROVED`** at **2026-11-15 12:15:24 UTC**. One P3 trailing-whitespace thread was fixed in the branch and **1/1 resolved** before the merge; the owner-run check followed the fixes.
- **Supplemental Codex bot:** current-head summary recorded completed code review with no findings; **not** a substitute for the `im-tio` approval. Copilot review was unavailable due to quota; this is not an application finding or a successful Copilot review.
- **Owner gate:** owner supplied Windows PowerShell `git fetch origin` then `git diff --check origin/main...origin/docs/phase1-2-minimal-profile-onboarding-20261115`, returning **no whitespace output**, and separately issued **"go merge"** for PR #13. The connector executed the explicit SHA-guarded squash merge and verified the result on `main`.
- **Scope:** exactly five Markdown files; no app code, SQL migrations, Supabase changes, Storage bucket, scheduled cleanup, Google Auth or production rollout. ADR-019 is **a proposed specification merged for reviewability**, not an accepted schema/privacy policy or permission to implement.

## Validation evidence — after PR #13 merge

- Verified GitHub `main` at `237a88fe5c6c30ae940a920ec71659cc947aeaf3`, PR #13 `merged=true`, and expected five docs merged, including `docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md` with `profiles.avatar_url`, `Tnyx Tio → TT` and acceptance criteria through **ONB-29**.
- GitHub merge-source and review evidence agree on the exact PR HEAD; no outstanding review thread or merge conflict at gate time. Original P3 was corrected.
- **Validation scope:** owner-run local `git diff --check` on final PR diff passed; independent reviewer checked relative Markdown links/fences and the current patch, and no current-head code or SQL/security runtime tests were required for a docs-only change. GitHub reported **no CI check runs** for documentation-only head; do not call this a successful CI execution.
- **Access limitation:** repository branch-protection/ruleset endpoints were unavailable to the connector (403), although GitHub accepted the merge. No deployment or functional user data was verified by this documentation completion.
- Archive and `.ai/current.md` pointer cleanup are performed in the **separate post-merge reconciliation PR**, pending its own independent review and **distinct owner merge authorization**. Post-merge archive itself is not proof that new product policy has been accepted.

## Handoff

**Next owner:** Repository owner for review/approval of ADR-019's unresolved Auth/OTP, privacy/RLS, optional Avatar/Google OAuth, encrypted local DB and account cleanup decisions.

**Next authorized action:** read [proposed ADR-019](../../../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md) and [Phase 1 readiness](../../../docs/21-PHASE-1-READINESS.md); decide one bounded future implementation slice **only after separate owner approval and security review**. No app/Auth/Supabase deployment permission is implied by PR #13.

**Post-merge synchronization/archive:** merge confirmed; archived record to replace former `.ai/tasks/docs/` active record when the reconciliation PR is separately reviewed and merged.

[← Archive guide](../README.md) · [Root agent contract](../../../AGENTS.md)
