# Phase 1.2 Task 06A — local Supabase native OTP foundation

| Field | Value |
|---|---|
| Status | Ready for Review; production Auth BLOCKED |
| Objective | Reproducible local Supabase/Mailpit proof and bounded implementation-readiness report, without hosted or app integration |
| Implementation owner | Local Codex engineering agent |
| Previous agent | None for Task 06A; Task 02 was a separate historical PoC |
| Last commit agent | None; no Task 06A commit created |
| Tracking / approval | Owner's written Task 06A instruction in the current conversation (2026-11-17); no issue or PR created for this slice |
| Branch | `feat/phase12-task06a-local-auth-poc` (local only) |
| Base SHA / inspected HEAD | `f0b5102afae4df6589c9a97de720df154cdfabd4` from merged `origin/main` at start |
| Platform and file scope | Local Supabase CLI/Mailpit experiment and `.ai/` task context; no Expo TS/TSX, hosted project or migration changes |
| Created / updated | 2026-11-17 |

## Approval and boundaries

The owner authorized non-production real Auth exploration with Supabase's built-in email OTP, while keeping Brevo SMTP disabled and production Auth blocked. This authorizes the isolated local proof and a plan, not a hosted provider change, hosted OTP send, production Auth UI, cloud schema deployment, cleanup job, release or merge. The prior [Task 05 PR #26](https://github.com/im-tnyx/Tio-Workspace/pull/26) was verified merged before this branch. [AGENTS.md](../../../AGENTS.md), [current pointer](../../current.md), [Auth lifecycle](../../../docs/27-OTP-FIRST-AUTH-LIFECYCLE.md), [security](../../../docs/04-AUTH-AND-SECURITY.md), [proposed ADR-019](../../../docs/25-MINIMAL-CLOUD-PROFILE-AND-LOCAL-ONBOARDING.md), [test plan](../../../docs/08-TEST-PLAN.md) and [workflow](../../core/workflow-rules.md) govern this slice.

The existing Expo routes and `AuthPreviewFlow` remain mock-only and visually untouched. Root `package.json` has Expo `~58.0.0`, React Native `0.88.1`, AsyncStorage `2.2.0`, and no `@supabase/supabase-js`, `expo-secure-store` or local SQLCipher integration. CLI v2.121.0, local GoTrue v2.196.0 and Mailpit v1.30.2 were observed. The hosted `bsfwzvgynwriswapxpsp` project was `ACTIVE_HEALTHY`; read-only connector calls found no `public` tables, migrations, Edge Functions or advisor notices. Hosted Auth configuration could not be read through the available connector or browser and is **NOT VERIFIED**.

## Selected tools and evidence boundary

- Supabase skill, current [changelog](https://supabase.com/changelog.md), [passwordless OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [local email testing](https://supabase.com/docs/guides/auth/testing-auth-flows), [password security](https://supabase.com/docs/guides/auth/password-security), [rate limits](https://supabase.com/docs/guides/auth/rate-limits), [default SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp), and [Auth hooks](https://supabase.com/docs/guides/auth/auth-hooks) were consulted.
- `local-dev-tooling` skill was used only to select the owner-specified shared CLI. No sibling repository or protected tool state was inspected.
- Local-only `experiments/task06a/` contains CLI config, OTP templates and a Node built-in `fetch` harness. It uses disposable `example.invalid` addresses and never prints codes, passwords or tokens. Startup CLI stdout contained disposable local keys; no hosted credentials were used or written to the repository. Keep future CLI output masked.
- No hosted email, Auth user, SQL, function, Storage or settings write was made. No native device test was run.

## Current local test evidence

The corrected local run exercised the Auth REST endpoints behind Supabase's native provider. Thirteen subchecks passed: six-digit Mailpit OTP, provisional session, password unusable before enrollment, same-UUID initial enrollment, password sign-in with no email, generic invalid-credentials response, refresh-token exchange in Node, fresh OTP on provisional return, same-UUID resumed enrollment, matching existing/new OTP-send response, replay rejection, generic recovery-send response and recovery password change. Two **security requirements failed**: an OTP-authenticated password-complete user replaced the existing password through direct `PUT /auth/v1/user`, and the correct OTP remained valid after five wrong attempts. The first run failed to capture a code because new-user confirmation used the `confirmation` template; the local config was corrected and rerun. These are local observations, not hosted or native evidence.

| Canonical test | Current Task 06A status | Evidence or next proof |
|---|---|---|
| AUTH-01 | NOT TESTED | Native registration, profile and local partition absent |
| AUTH-02 | NOT TESTED | Native cold restart absent; Node refresh only |
| AUTH-03 | NOT TESTED | Encrypted offline workout store absent |
| AUTH-04 | NOT TESTED | Native fresh offline install absent |
| AUTH-05 | NOT TESTED | Native logout and local lock absent |
| AUTH-06 | NOT TESTED | Wrong-UUID native binding absent |
| AUTH-07 | NOT TESTED | Same-bound-user local history absent |
| AUTH-08 | NOT TESTED | Offline remote-revocation lifecycle absent |
| AUTH-09 | NOT TESTED | Confirmed local erase/reset absent |
| AUTH-10 | NOT TESTED | Complete session/local safety behavior absent |
| AUTH-11 | NOT TESTED | Local OTP/password substeps pass; full setup and eligibility absent |
| AUTH-12 | FAIL / incomplete | Five-failure cooldown failed; expiry, resend and send quota not tested |
| AUTH-13 | NOT TESTED | No protected workout database or guest negative tests |
| AUTH-14 | NOT TESTED | Native offline account/revocation absent |
| AUTH-15 | NOT TESTED | Six-digit OTP, session and same UUID pass locally; cloud/local gates absent |
| AUTH-16 | NOT TESTED | Password sign-in passes locally without email; server/local gates absent |
| AUTH-17 | FAIL | Direct authenticated Auth password replacement reproduced locally |
| AUTH-18 | NOT TESTED | Fresh OTP and surviving same UUID pass locally; cleanup/profile/local resume absent |
| AUTH-19 | NOT TESTED | No lifecycle/RLS/Data API/Storage/Function gate deployed |
| AUTH-20 | NOT TESTED | No native binding/key/ciphertext gate |
| AUTH-21 | NOT TESTED | Replay passes locally; 600-second expiry not rerun in Task 06A |
| AUTH-22 | FAIL | Correct code succeeded after five bad attempts; send/resend/flood quotas untested |
| AUTH-23 | NOT TESTED | Recovery OTP/password change passes locally; native flow and authorization absent |
| AUTH-24 | NOT TESTED | Node refresh-token exchange passes; native persisted session/offline/revocation absent |
| AUTH-25 | NOT TESTED | No server lifecycle or protected local safety flag |
| AUTH-26 | NOT TESTED | Fresh-install same-UUID encrypted-store initialization absent |
| AUTH-27 | NOT TESTED | No cleanup job or server-owned deadline/preflight implementation |
| AUTH-28 | NOT TESTED | Current preview inspected, but no real UI or native behavior test in this slice |
| AUTH-29 | NOT TESTED | OTP-send, invalid credential and recovery responses match locally; safe existing-email signup/recovery orchestration absent |
| AUTH-30 | NOT TESTED | No local fitness store, Home gate or Profile pill implementation |
| AUTH-31 | NOT TESTED | No 30-day cleanup or reinstall/isolation implementation |

`AUTH-12` and `AUTH-22` share the failed five-attempt requirement. These rows are full acceptance status, not a count of harness subchecks. No full `AUTH-01–31` case is declared PASS.

## Proposed design for later approval; no schema deployed

1. Keep `auth.users.id` as the immutable identity. Proposed `private.account_lifecycle` has `user_id UUID PRIMARY KEY REFERENCES auth.users(id)`, a monotonic server-owned state (`EMAIL_VERIFIED_PASSWORD_PENDING`, `PASSWORD_COMPLETE_PROFILE_PENDING`, `SERVER_ELIGIBLE`), trusted transition timestamps, `last_server_activity_at` and a version/preflight guard for retries and cleanup races. Do not expose it through the Data API or grant client writes. Exact first-password proof and transaction boundary remain unresolved; an Auth hash or editable `user_metadata` cannot stand in for it. An unverified row need not have a lifecycle row until a trusted server event is proven.
2. Proposed `public.profiles` has `id UUID PRIMARY KEY REFERENCES auth.users(id)`, nullable `username`, `full_name`, `date_of_birth DATE`, `calculation_sex` and `mobile_number`, plus server timestamps. Verified email stays in Auth, not duplicated as an authorization claim. Pending mandatory fields stay nullable so a user can resume the first missing stage; server validation requires Username, Name, DOB and Sex before it atomically marks cloud completion. Username needs approved case-insensitive uniqueness and 3–16 grapheme validation; a SQL character count alone does not prove grapheme length. Decide DOB/Sex vocabulary, privacy and retention before DDL. Mobile alone is optional. Local Units, Height, Current Weight, Activity Level and Goal remain required for full fitness completion and encrypted on device by default.
3. Enable RLS on exposed `public.profiles` and give `authenticated` only a narrowly scoped own-row `SELECT` policy requiring `auth.uid() = id` and a current server-owned lifecycle state that permits that read. Do not give the client direct `INSERT`, `UPDATE` or `DELETE` policies that could advance lifecycle; a validated server endpoint handles pending-stage saves/resume and eligible profile edits. Keep `private.account_lifecycle` unexposed and server-write-only. Provisional OTP sessions must have no protected cloud row, Storage or Edge Function access; each resource also checks current lifecycle and UUID ownership. `TO authenticated` alone is insufficient, and RLS cannot intercept Supabase Auth's direct password endpoint. Run negative tests for forged metadata, pending sessions, wrong UUID and concurrent activation before any hosted migration.
4. Native integration later requires a protected same-UUID installation binding, OS-protected session/key custody and verified SQLCipher-compatible encrypted SQLite initialization. [Expo SQLite SDK 58](https://docs.expo.dev/versions/latest/sdk/sqlite/) requires a native build for `useSQLCipher`; `PRAGMA key` silently does nothing without SQLCipher, so check `PRAGMA cipher_version` before any protected store is accepted. [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) differs across Android uninstall and possible iOS Keychain persistence, so reinstall must revalidate UUID and key/store safety. Logout locks but retains ciphertext; different-UUID sign-in is rejected and its token discarded. A previously eligible bound user may work offline without implying remote revocation was checked. No workout upload. A fresh install cannot claim restored history without a separately verified matching restore.

## Security decisions and next slices

- **P0 direct password mutation:** Current [password-security guide](https://supabase.com/docs/guides/auth/password-security) and [Management API schema](https://supabase.com/docs/reference/api/v1-update-auth-service-config) document `security_update_password_require_current_password`. [GoTrue v2.196.0 source](https://github.com/supabase/auth/blob/v2.196.0/internal/api/user.go) applies it only when a password already exists and exempts a recovery session. This is a **candidate** Auth-level control for normal OTP sessions, not a verified setting on the hosted project or a resolution of recovery-session authority. The pinned local CLI v2.121.0 does not expose that toggle in its generated `config.toml`; the [CLI issue and later fix](https://github.com/supabase/cli/issues/5846) distinguish it from `secure_password_change`, which only requests reauthentication. Do not treat that weaker setting as current-password enforcement or upgrade the shared CLI without separate approval. Owner still chooses whether OTP/recovery is accepted as password-replacement authority, and a separate provider-setting proof must establish enforcement without breaking initial enrollment and explicit recovery.
- **P0 abuse:** Supabase documents project-wide built-in email cap and IP/user rate limits, but the selected 5/email/hour, 5 failed/challenge and 15-minute cooldown are not proven. A server-owned atomic challenge counter/lock with generic responses, resend race handling, replay/expiry checks and abuse monitoring needs a separately reviewed design. A UI counter does not enforce it.
- **P0 initial password/lifecycle:** The local `PUT /user` works but does not itself provide trusted atomic evidence that it was the first enrollment. Secure server transition, duplicate-identity handling, protected profile/RLS and cleanup preflight require a separately approved schema/endpoint slice.
- **P0 hosted delivery:** The built-in email provider is documented as team-address-only and two messages/project/hour. The current hosted template/configuration remains unverified. Team-email testing requires the owner's separate hosted configuration/test gate; Brevo SMTP stays disabled.
- **P1 native safety/privacy:** Expo SecureStore/SQLCipher device behavior, same-UUID binding, session restore, DOB/Sex privacy, recovery and deletion guarantees remain untested and require separate approval/review.

Suggested sequence: (1) independently review this local proof and the `current_password` candidate against the pinned Auth version; (2) obtain owner policy decision and separately authorized local Auth-level enforcement experiment; (3) design and review private lifecycle/profile/RLS with negative tests before any migration; (4) wire the existing Expo presentation to an Auth service and native protected persistence in a later bounded slice; (5) request a separate hosted team-email gate. None authorizes production rollout.

## Changed files and validation

Task 06A changed only `.ai/current.md`, this task record and `experiments/task06a/` local proof files. No commit, push or PR was requested. `node --check` passed. The final local harness run returned 13 subcheck PASS / 2 requirement FAIL and exit code 1 as designed. The three changed Markdown files rendered; their 27 relative links resolved, three tables rendered, and code fences were balanced. `git diff --check` and trailing-whitespace and stale-status wording scans passed. A sensitive-string scan found only code/config key names and environment references, with no literal credential in these files. The dedicated local stack was stopped with its volume preserved; no matching container remained running. Runtime Expo/native persistence, hosted Auth settings, hosted OTP delivery, RLS enforcement and CI remain unverified. Independent review status: `REVIEW_PENDING`; no merge approval.

**Next owner:** Repository owner and independent Auth security reviewer.

**Next authorized action:** Review this bounded report and decide the direct password-replacement policy and whether to authorize a separate local current-password setting proof.

**Post-merge synchronization/archive needed:** Not applicable; no PR exists.

[← Task guide](../README.md) · [Root agent contract](../../../AGENTS.md)
