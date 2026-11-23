# Phase 1.2 Task 06I-B1-H1-R8 — Unexpected Session Tracking & Idempotent Cleanup Closure

> **Local Preparation, Preflight Audit, Offline Validation & Reviewable PR.** Prepared under `AGENTS.md` operating rules. This document establishes the offline verification baseline, safety boundaries, Brevo sending readiness assessment, complete TEMP-only testbed setup specification, exact run-scoped identity cleanup, and read-only execution plan for Task 06I-B1-H1-R8. All outstanding review findings across PR #37 (R8-01 and R8-02) are resolved. Zero hosted LIVE probes, mutations, Auth Hook deployments, or test users have been executed. Decision remains strictly **`BLOCKED_PENDING_ADDITIONAL_PREPARATION`**. Production Real Auth remains **STRICT NO-GO**.

| Field | Value |
|---|---|
| Status | **LOCAL REMEDIATION COMPLETE (REVISION R8); ALL REVIEW FINDINGS RESOLVED (R8-01 P2 UNEXPECTED SESSION TRACKING VIA `observeAndTrackSessionTokens` ACROSS NEGATIVE PROBES & FAIL-CLOSED UNTRACKED SESSIONS; R8-02 P2 IDEMPOTENT SESSION CLEANUP & CONFIRMED SESSION ABSENCE HANDLING IN `createHostedAdminClient.signOut`); 81/81 RUNNER TESTS PASS; 149/149 TASK06I TESTS PASS; 18/18 POSTGRESQL PARITY PASS (`POSTGRES_VERIFIED`); 115/115 TASK06H TESTS PASS; 22/22 SHELL TESTS PASS; GITHUB CI STATUS: 4/4 CHECKS PASS ON PREVIOUS HEAD; DECISION: `BLOCKED_PENDING_ADDITIONAL_PREPARATION`; READY FOR INDEPENDENT RE-REVIEW** |
| Objective | Remediate all outstanding review findings on PR #37 (R8-01 unexpected session tracking across negative probes, R8-02 idempotent session cleanup & confirmed session absence) without executing any live hosted mutations. |
| Implementation owner | Agent / Local Development & Security Research, Task 06I-B1-H1-R8 slice |
| Previous agent | Agent / Task 06I-B1-H1-R7 author |
| Last audited HEAD | `5207f5dbdcfa9e9833a655cb6d19b9f35d1ea466` (PR #37 previous commit) |
| Tracking / approval | Task 06I-B1-H1-R8 remediation authorized by user prompt; LIVE hosted probe execution requires separate explicit owner authorization; mandates $0 cost ceiling and permanent immunity for `Tio-world` (`oykupyiitspujzpwwvuj`) and REAL `bsfwzvgynwriswapxpsp` |
| Branch | `test/task06i-b1-h1-hosted-security-preflight` |
| Base SHA / inspected HEAD | `716fb32061ffb6012d17eae9453c822a281fe6f1` (`main`) |
| Platform and file scope | Documentation, `.ai/` context, runner CLI hardening & LIVE dispatcher contract in `experiments/task06i/hosted-probe-runner.mjs`, testbed fixture specification in `experiments/task06i/sql/testbed-fixtures.sql`, and offline verification tests in `experiments/task06i/hosted-probe-runner.test.mjs`; zero client Expo UI, production schema, or live Auth mutations |
| Created / updated | 2026-11-23 |

---

## 1. Verified Merge Baseline & Git Alignment

Inspection confirms the full chain of merged PRs and local repository synchronization:
- **PR #34** ([#34](https://github.com/im-tnyx/Tio-Workspace/pull/34)): MERGED at commit `b7d4fda97979e734a85461e83bf119dbc1a9689c`.
- **PR #35** ([#35](https://github.com/im-tnyx/Tio-Workspace/pull/35)): MERGED at commit `7150cec4c2e1e9aaa8e75d2cbcb3a23a6dca532e`.
- **PR #36** ([#36](https://github.com/im-tnyx/Tio-Workspace/pull/36)): MERGED at commit `716fb32061ffb6012d17eae9453c822a281fe6f1`.
  - Reviewer: `im-tio` — **APPROVED** exact PR HEAD `5f2f2e6311d6f8690da3d040868b1cf5ee3b3504`.
  - Review threads: 33 / 33 resolved (0 unresolved).
  - Required CI: PASS.
- Local `main` fast-forwarded to `716fb32061ffb6012d17eae9453c822a281fe6f1` with zero divergence.
- Feature branch `docs/task06i-b1-h0-hosted-readiness-harness` cleanly deleted locally and on `origin`.
- Working tree confirmed clean before creating branch `test/task06i-b1-h1-hosted-security-preflight`.

---

## 2. Supabase Project Boundaries & Inventory Audit

Read-only inventory inspection was executed via Supabase CLI v2.121.0 (`G:\dev\supabase-cli\v2.121.0\supabase.exe projects list --output-format json`):

```json
{
  "projects": [
    {
      "id": "bsfwzvgynwriswapxpsp",
      "ref": "bsfwzvgynwriswapxpsp",
      "organization_id": "llmbrmxhyirtoqndazpg",
      "organization_slug": "llmbrmxhyirtoqndazpg",
      "name": "Tio-Tnyx",
      "region": "ap-south-1",
      "status": "ACTIVE_HEALTHY",
      "database": { "version": "17.11.0.019", "postgres_engine": "17" }
    },
    {
      "id": "wvdabiwbaavfggcmpizd",
      "ref": "wvdabiwbaavfggcmpizd",
      "organization_id": "llmbrmxhyirtoqndazpg",
      "organization_slug": "llmbrmxhyirtoqndazpg",
      "name": "Tio-Tnyx-Auth-Temp",
      "region": "ap-south-1",
      "status": "ACTIVE_HEALTHY",
      "database": { "version": "17.12.0.000", "postgres_engine": "17" }
    }
  ]
}
```

### Boundary Guarantees:
1. **REAL (`bsfwzvgynwriswapxpsp`):** Protected production backend. Status: `ACTIVE_HEALTHY`. Strictly **READ-ONLY**. Hard-blocked in `IMMUTABLE_FORBIDDEN_PROJECTS`. Zero test calls or mutations allowed.
2. **TEMP (`wvdabiwbaavfggcmpizd`):** Dedicated disposable testbed created by owner. Status: `ACTIVE_HEALTHY`. Configured as `HARDCODED_TEMP_REF`. Preserved untouched during preparation.
3. **`Tio-world` (`oykupyiitspujzpwwvuj`):** Permanently immune. Excluded from organization list; hard-blocked in `IMMUTABLE_FORBIDDEN_PROJECTS`.
4. **Cost Policy:** Strict $0 Free tier capacity preserved (2 active projects in organization `llmbrmxhyirtoqndazpg`).

---

## 3. Brevo Sender & Domain Readiness Audit

Audit of Brevo transactional email infrastructure indicates:
- **Plan:** Free tier (300 emails/day allowance).
- **SMTP Relay:** Enabled.
- **Authenticated Sending Domains:** **0 observed** (unverified sender domain baseline).
- **Readiness Verdict:** `UNAUTHENTICATED_SENDER_DOMAIN_BLOCKED`.
- **Delivery Policy for Phase 1.2:**
  - Transactional OTP delivery via external Brevo SMTP cannot be authenticated without a configured, verified custom sender domain.
  - Native Supabase Auth email endpoints (`/auth/v1/otp`, `/auth/v1/signup`, `/auth/v1/recover`, `/auth/v1/magiclink`) are suppressed fail-closed by the Send Email Hook (`send_email_hook` returning `SQLSTATE 42501`).
  - No SMTP settings were modified, no senders were created, and no test emails were dispatched.
  - Future transactional OTP delivery testing requires separate owner domain setup and explicit execution authorization.

---

## 4. The 18-Case Security Matrix & Accurate Taxonomy (R3 Taxonomy Audit)

In accordance with findings R3-01, R3-02, R3-05, and R3-06, each probe case is strictly categorized by its prerequisite feasibility, authoritative evidence source, and readiness status. **Zero cases are claimed as HOSTED_VERIFIED:**

| Probe ID | Category | Target / Endpoint | Prerequisites & Evidence Source | Readiness Status | Hosted Status |
|---|---|---|---|---|---|
| **BYPASS-01** | Native Bypass | `POST /auth/v1/otp` | `external_email_magic_link_disabled=true` -> HTTP 422 `email_provider_disabled` | `IMPLEMENTED_OFFLINE_TESTED` | **HOSTED_NOT_TESTED** |
| **BYPASS-02** | Native Bypass | `POST /auth/v1/signup` | `disable_signup=true` -> HTTP 422 `signup_disabled` | `IMPLEMENTED_OFFLINE_TESTED` | **HOSTED_NOT_TESTED** |
| **BYPASS-03** | Native Bypass | `POST /auth/v1/verify` (email OTP) | Delivered OTP challenge -> Hook failure 42501 (Upstream `otp_expired` rejected as proof) | `PROVIDER_PRECONDITION_MISSING` | **HOSTED_NOT_TESTED** |
| **BYPASS-04** | Native Bypass | Magic Link / Invite / Anonymous | Delivered magiclink token -> Hook failure 42501 (Upstream 404/422 rejected as proof) | `PROVIDER_PRECONDITION_MISSING` | **HOSTED_NOT_TESTED** |
| **BYPASS-05** | Native Bypass | `POST /auth/v1/recover` | Send Email Hook suppression -> 0 emails delivered, hook failure 42501 | `IMPLEMENTED_OFFLINE_TESTED` | **HOSTED_NOT_TESTED** |
| **HOOK-01** | Token Hook | Password Sign-In | Seeded password user -> HTTP 200, decoded JWT `amr_authenticated`, genuine `session_id` | `IMPLEMENTED_OFFLINE_TESTED` | **HOSTED_NOT_TESTED** |
| **HOOK-02** | Token Hook | Password Token Refresh | Active refresh token -> HTTP 200, refreshed JWT with AMR preserved | `IMPLEMENTED_OFFLINE_TESTED` | **HOSTED_NOT_TESTED** |
| **HOOK-03** | Token Hook | OTP-Origin Token Denial | GoTrue `/token` lacks `grant_type=otp`; verified offline at Layer A in PostgreSQL | `PROVIDER_PRECONDITION_MISSING` | **HOSTED_NOT_TESTED** |
| **HOOK-04** | Token Hook | Recovery-Origin Token Denial | GoTrue `/token` lacks `grant_type=recovery`; verified offline at Layer A in PostgreSQL | `PROVIDER_PRECONDITION_MISSING` | **HOSTED_NOT_TESTED** |
| **HOOK-05** | Token Hook | Mixed AMR Rejection | GoTrue server constructs AMR; client injection ignored; Layer A SQL parity | `BLOCKED_UNSUPPORTED` | **HOSTED_NOT_TESTED** |
| **HOOK-06** | Token Hook | Malformed/Missing AMR Rejection | GoTrue server constructs AMR; client injection ignored; Layer A SQL parity | `BLOCKED_UNSUPPORTED` | **HOSTED_NOT_TESTED** |
| **HOOK-07** | Token Hook | Fail-Closed Exception Handling | PL/pgSQL transaction abort 500; cannot inject via HTTP; Layer A SQL parity | `BLOCKED_UNSUPPORTED` | **HOSTED_NOT_TESTED** |
| **SESSION-01** | Session & Consumer | Session Minting | Password sign-in -> genuine `session_id` present in JWT and `auth.sessions` | `IMPLEMENTED_OFFLINE_TESTED` | **HOSTED_NOT_TESTED** |
| **SESSION-02** | Session & Consumer | Server Password Reset & Invalidation | Admin API `updateUserById` via `TIO_TEMP_SERVICE_ROLE_KEY` -> 0 sessions remaining | `IMPLEMENTED_OFFLINE_TESTED` | **HOSTED_NOT_TESTED** |
| **SESSION-03** | Session & Consumer | Direct `/auth/v1/user` Revocation Rejection | GoTrue queries `auth.sessions` -> HTTP 401/403 `session_not_found` with genuine session ID | `IMPLEMENTED_OFFLINE_TESTED` | **HOSTED_NOT_TESTED** |
| **SESSION-04** | Session & Consumer | PostgREST Data API Linger Window | PostgREST signature-only access -> HTTP 200 + unexpired token (`now < exp`) | `IMPLEMENTED_OFFLINE_TESTED` | **HOSTED_NOT_TESTED** |
| **SESSION-05** | Session & Consumer | Storage API Linger Window | Storage API signature-only access -> HTTP 200 + unexpired token (`now < exp`) | `IMPLEMENTED_OFFLINE_TESTED` | **HOSTED_NOT_TESTED** |
| **SESSION-06** | Session & Consumer | Edge Function `auth.getUser()` Rejection | Edge Function `auth-user-probe` deployed -> HTTP 401 `AuthSessionMissingError` | `PROVIDER_PRECONDITION_MISSING` | **HOSTED_NOT_TESTED** |

**Summary Counts:**
- `IMPLEMENTED_OFFLINE_TESTED`: 10
- `PROVIDER_PRECONDITION_MISSING`: 5
- `BLOCKED_UNSUPPORTED`: 3
- `HOSTED_VERIFIED`: 0

---

## 5. R3 Review Finding Remediations (Resolving All 10 Threads)

### R3-01 — OTP Probes Must Not Accept `unsupported_grant_type` as Hook Proof (`PRRT_kwDOVtCmZc66lo-X`)
- **Vulnerability:** Probes sent `grant_type=otp` or `grant_type=recovery` to `POST /auth/v1/token`. GoTrue rejected with HTTP 400 `unsupported_grant_type` before reaching `custom_access_token_hook`. Probes treated generic 400 as hook denial.
- **Remediation:**
  1. In `validateProbeOutcome`, any rejection with `unsupported_grant_type` is strictly rejected as false proof (`FALSE_PROOF_REJECTED`).
  2. In `createHostedDispatcher`, `HOOK-03` and `HOOK-04` return `status: 0, error: 'PROVIDER_PRECONDITION_MISSING...'`, clearly documenting that GoTrue `/token` lacks these grant types and hook behavior is authoritatively verified offline in Layer A SQL parity tests (`POSTGRES_VERIFIED`).

### R3-02 — Client-Controlled AMR Injection Is Ignored by GoTrue (`PRRT_kwDOVtCmZc66lo-a`)
- **Vulnerability:** Probes attempted to send `claims: { amr: [...] }` in the JSON request body to `POST /auth/v1/token?grant_type=password`. GoTrue constructs `claims.amr` server-side and completely ignores client-supplied AMR fields.
- **Remediation:**
  1. In `createHostedDispatcher`, `HOOK-05`, `HOOK-06`, and `HOOK-07` return `status: 0, error: 'BLOCKED_UNSUPPORTED: GoTrue server-owned AMR claims cannot be client-injected...'`.
  2. Declared in `HOSTED_PROBE_SPECIFICATIONS` as `BLOCKED_UNSUPPORTED` with authoritative Layer A PostgreSQL parity evidence.

### R3-03 — JWT Linger Evidence False Positives (`PRRT_kwDOVtCmZc66lo-f`)
- **Vulnerability:** Probes for `SESSION-04` and `SESSION-05` accepted contradictory outcomes (200, 401, 404). HTTP 401 is token rejection (no linger), and HTTP 404 is a missing fixture (no linger).
- **Remediation:**
  1. In `validateProbeOutcome`, strictly require `status === 200` AND `token_unexpired === true` (`now < exp`).
  2. HTTP 401 or 404 fails closed with `HTTP_STATUS_MISMATCH`. Expired tokens fail closed with `MISSING_EVIDENCE`.

### R3-04 — Password Reset Incorrectly Replaced by Logout (`SESSION-02`) (`PRRT_kwDOVtCmZc66lo-i`)
- **Vulnerability:** `SESSION-02` allowed fallback to client logout when Admin API was unavailable, which does not prove server-side session invalidation on password reset.
- **Remediation:**
  1. Logout fallback is strictly prohibited. `rawOutcome.logout_fallback === true` fails closed with `SECURITY_INVARIANT_VIOLATION`.
  2. In `createHostedDispatcher`, `SESSION-02` strictly requires `serviceRoleKey` (`TIO_TEMP_SERVICE_ROLE_KEY`) to call `adminClient.updateUserById(userId, { password })`. Without it, returns `ADMIN_SERVICE_ROLE_REQUIRED`.

### R3-05 — Fabricated Session Correlations (`SESSION-01`, `SESSION-03`, `SESSION-06`) (`PRRT_kwDOVtCmZc66lo-m`)
- **Vulnerability:** Dispatcher fell back to user ID or placeholder string `'sess-default'`. `SESSION-06` assumed Edge Function was deployed.
- **Remediation:**
  1. `HOOK-01` extracts genuine `session_id` from parsed JWT payload or GoTrue response. Placeholder strings like `'sess-default'` fail closed.
  2. `validateSessionRevocationProof` strictly rejects `session_id.startsWith('sess-default')`.
  3. `SESSION-06` queries `POST /functions/v1/auth-user-probe`. If status is 404, returns `PROVIDER_PRECONDITION_MISSING: Edge Function deployment required for SESSION-06`.

### R3-06 — Bypass Probes Rejected Before Hook Execution (`BYPASS-03`, `BYPASS-04`) (`PRRT_kwDOVtCmZc66lo-o`)
- **Vulnerability:** Probes with synthetic OTP or disabled magic-link return 400 `otp_expired` or 404 before `custom_access_token_hook` is invoked. Generic 400 was counted as hook proof.
- **Remediation:**
  1. In `validateProbeOutcome`, rejections with `otp_expired` or 404 fail closed as `FALSE_PROOF_REJECTED` (upstream GoTrue pre-validation).
  2. Requires affirmative hook rejection evidence (`42501` / `hook_error`).

### R3-07 — Cleanup Lifecycle Integrated into Runner (`PRRT_kwDOVtCmZc66lo-q`)
- **Vulnerability:** Runner populated `TestRunInventory` but never called `executeCleanup` in its execution lifecycle.
- **Remediation:**
  1. In `runHostedProbeRunner`, integrated `performCleanup()` into `try/finally` lifecycle.
  2. Returns sanitized `cleanupReport` in the final result object with partial failure detection (`CLEANUP_FAILED_RESIDUAL_RESOURCES`).

### R3-08 — Strict JWT Parsing Without Bypass (`HOOK-01`, `HOOK-02`) (`PRRT_kwDOVtCmZc66lo-t`)
- **Vulnerability:** Non-JSON or malformed tokens bypassed `parseAndValidateJwt` and accepted body metadata.
- **Remediation:**
  1. In `validateProbeOutcome`, every access token candidate must be a valid 3-part base64url JWT strictly validated via `parseAndValidateJwt`.
  2. Non-JSON, malformed, or 2-part tokens fail closed with `JWT_CLAIM_VIOLATION`. Client metadata spoofing (`user_metadata`, `app_metadata`) strictly rejected.

### R3-09 — Pre-Existing Seed User Preservation in Cleanup (`PRRT_kwDOVtCmZc66lq3S`)
- **Vulnerability:** `HOOK-01` login registered the seed user as owned by the current run, risking deletion during cleanup.
- **Remediation:**
  1. In `TestRunInventory`, split user tracking into `this.createdUsers` (deletion-eligible signups) and `this.referencedUsers` (pre-existing seed users, preserved).
  2. `executeCleanup` strictly deletes ONLY `this.createdUsers` by ID and asserts 0 residual synthetic users. Seed users are NEVER deleted.

### R3-10 — Production Credential Leakage Prevention (`PRRT_kwDOVtCmZc66lq3W`)
- **Vulnerability:** CLI runner accepted generic `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, risking production key forwarding to TEMP.
- **Remediation:**
  1. Added `validateProjectCredentialBinding(key, expectedRef)` which decodes the key payload, asserts `ref === expectedRef`, and rejects forbidden projects (`bsfwzvgynwriswapxpsp`, `oykupyiitspujzpwwvuj`).
  2. CLI runner strictly requires `TIO_TEMP_ANON_KEY` and `TIO_TEMP_SERVICE_ROLE_KEY`; generic `SUPABASE_*` keys are prohibited for LIVE TEMP testing.

---


---

## 5b. R4 Review Finding Remediations (Resolving All 8 Threads from Bugbot & Codex)

### R4-01 — Credential Binding Check Fails Open (`PRRT_kwDOVtCmZc66l_lG`, Bugbot High)
- **Vulnerability:** `validateProjectCredentialBinding` accepted credentials it could not bind to TEMP: malformed/undecodable base64url payloads returned `true`, non-JWT or opaque keys returned `true`, and JWTs without `ref`/`iss` returned `true`.
- **Remediation:**
  1. Fail closed on empty/non-string keys (`MISSING_CREDENTIAL`).
  2. Require exactly 3-part JWTs; opaque or non-3-part keys throw `OPAQUE_CREDENTIAL_UNSUPPORTED` because they cannot be cryptographically inspected without contacting Supabase.
  3. Header and payload base64url JSON parsing failure throws `MALFORMED_CREDENTIAL_JWT`.
  4. Missing `ref` and missing `iss` throws `CREDENTIAL_PROJECT_UNBOUND`.
  5. Forbidden projects (`bsfwzvgynwriswapxpsp`, `oykupyiitspujzpwwvuj`) throw `CRITICAL_SECURITY_VIOLATION`.
  6. Mismatched target ref throws `CREDENTIAL_TARGET_MISMATCH`.

### R4-02 — LIVE Cleanup Skipped Without Admin Client (`PRRT_kwDOVtCmZc66l_lK`, Bugbot Med)
- **Vulnerability:** In `runHostedProbeRunner`, if `isLive` and `options.adminClient` was missing, the runner proceeded with probes and skipped cleanup. Also, cleanup failures were ignored in the final status, allowing `COMPLETED` and exit code 0.
- **Remediation:**
  1. In `runHostedProbeRunner`, if `isLive`: `adminClient` is a mandatory preflight prerequisite. Missing `adminClient` or missing methods (`deleteUser`, `getUserById`) throws `CLEANUP_CAPABILITY_REQUIRED` before dispatching any probes.
  2. Cleanup failures (`CLEANUP_FAILED_RESIDUAL_RESOURCES`, `CLEANUP_FAILED`) force `aborted: true` and status `HALTED_ON_FAILURE`.
  3. CLI runner strictly requires `TIO_TEMP_SERVICE_ROLE_KEY` to construct `adminClient` with user deletion and session invalidation, and exits nonzero if cleanup fails.

### R4-03 — Password Reset Does Not Prove Session Revocation (`PRRT_kwDOVtCmZc66l_wm`, Codex P2)
- **Vulnerability:** In `SESSION-02`, password-update HTTP 200 alone was treated as proof of session revocation, reporting `session_revoked: true, remaining_sessions: 0` without verifying revocation.
- **Remediation:**
  1. In `createHostedDispatcher` for `SESSION-02`, separately record `password_reset_completed: true`.
  2. Probe `/auth/v1/user` using the pre-reset access token: if HTTP 401/403 is observed, session revocation is verified (`remaining_sessions: 0`, `session_revocation_verified: true`). If HTTP 200 is observed, a security regression is reported (`remaining_sessions: 1`, `passed: false`).
  3. In `validateProbeOutcome`, require affirmative session revocation verification (`session_revocation_verified: true`, `remaining_sessions: 0`, `session_revoked: true`). Surviving sessions fail closed.

### R4-04 — Require Provider-Observed Revocation Errors in SESSION-06 (`PRRT_kwDOVtCmZc66l_wn`, Codex P2)
- **Vulnerability:** Generic HTTP 401/403 (e.g. `{ message: 'Forbidden' }`) caused `createHostedDispatcher` to synthesize `AuthSessionMissingError` on `SESSION-06` and `session_not_found` on `SESSION-03`.
- **Remediation:**
  1. Prohibit synthesizing error codes. Inspect `body.error_code` and `body.message` directly.
  2. Accept only genuine provider-observed revocation codes (`AuthSessionMissingError` for `SESSION-06`, `session_not_found` for `SESSION-03`).
  3. Generic 401/403 Forbidden without provider-observed revocation error fails closed.

### R4-05 — Fail Cleanup When Tracked Sessions Cannot Be Invalidated (`PRRT_kwDOVtCmZc66l_wo`, Codex P2)
- **Vulnerability:** When `trackedSessions` had active sessions, `executeCleanup` did nothing if `adminClient` lacked session invalidation methods and reported `CLEANUP_VERIFIED_SUCCESS`. The standalone CLI adapter also lacked session invalidation.
- **Remediation:**
  1. In `executeCleanup`, if `trackedSessions.size > 0` and `adminClient` lacks `invalidateSession` and `signOut`, record residual resource failure (`MISSING_SESSION_INVALIDATION_METHOD`) and fail closed (`CLEANUP_FAILED_RESIDUAL_RESOURCES`).
  2. In standalone CLI runner, wire `invalidateSession` and `signOut` via `DELETE /auth/v1/admin/users/sessions/{sessionId}`.

### R4-06 — Require Affirmative User Absence During Cleanup Verification (`PRRT_kwDOVtCmZc66l_wq`, Codex P2)
- **Vulnerability:** `getUserById` responses returning `{ data: { id: userId }, error: null }` were missed by `userStillExists` checks. In addition, `{ data: null, error: { status: 503 } }` was mistakenly treated as confirmed absence.
- **Remediation:**
  1. Normalize Supabase response shapes: inspect `data.user.id`, `data.id`, and top-level `id`. Any matching ID marks the user as `STILL_EXISTS_IN_DATABASE`.
  2. When `check.error` is present, require explicit 404 / `user_not_found`. Any 5xx or network error pushes to `residualUsers` as `VERIFY_FAILED`.

### R4-07 — Match JWT AMR Validation to the SQL Hook's Strict Allowlist (`PRRT_kwDOVtCmZc66l_ws`, Codex P2)
- **Vulnerability:** `parseAndValidateJwt` allowed missing `amr`, string arrays `['password']`, or unknown methods alongside password.
- **Remediation:**
  1. Require mandatory RFC 8176 `amr` claim (missing or null throws `MISSING_AMR`).
  2. Require non-empty array of JSON objects (string elements strictly prohibited).
  3. Require non-empty string `method` property on every item.
  4. Exclusively allow `'password'` method for password-authenticated tokens (matching canonical `private_auth.custom_access_token_hook`). Any unknown or disallowed method throws `PROHIBITED_AMR_METHOD`.

### R4-08 — Distinguish Email-Hook Suppression from Access-Token-Hook Rejection (`PRRT_kwDOVtCmZc66l_wu`, Codex P2)
- **Vulnerability:** In `BYPASS-04`, Send Email Hook `42501` suppression on `/auth/v1/magiclink` was accepted as proof of Custom Access Token Hook rejection.
- **Remediation:**
  1. Send Email Hook suppression only proves email delivery was suppressed; it does not exercise the Custom Access Token Hook which runs during token redemption.
  2. Because email delivery is suppressed fail-closed, no magiclink token can be delivered or redeemed.
  3. `createHostedDispatcher` returns `PROVIDER_PRECONDITION_MISSING: Magic link token cannot be obtained because email delivery is suppressed fail-closed...`.
  4. `validateProbeOutcome` explicitly rejects email suppression claims as proof of Custom Access Token Hook rejection (`FALSE_PROOF_REJECTED`).

---

## 6. Revision R5 Remediation Summary (PR #37 Review Findings)

### R5-01 — Session Revocation Proof Rejects Generic Errors & Requires Error Codes (`PRRT_kwDOVtCmZc66mPVZ`, Bugbot High)
- **Vulnerability:** `SESSION-02` accepted generic 401/403 responses and treated them as revocation proof, even if the rejection was due to false proof conditions (e.g. `bad_jwt`, `jwt_expired`, `invalid_token`) or without correlating the exact probed session identity.
- **Remediation:**
  1. Enforced session identity correlation between pre-reset session (`pre_session_id`) and the probed session outcome (`session_id`).
  2. Explicitly rejected false-proof conditions (`bad_jwt`, `jwt_expired`, `token_expired`, `invalid_token`).
  3. Strictly required affirmative provider error codes (`session_not_found`, `session_revoked`). Ambiguous rejections without code fail closed.

### R5-02 — Session Cleanup Rejects HTTP 404 from Session Invalidation Endpoint (`PRRT_kwDOVtCmZc66mPVg`, Bugbot High)
- **Vulnerability:** Session cleanup in `executeCleanup` and the standalone CLI runner assumed `/auth/v1/admin/users/sessions/{sessionId}` is a valid endpoint, treating HTTP 404 as "session already gone / success". In reality, unknown routes return 404 and leave sessions alive.
- **Remediation:**
  1. In `executeCleanup`, HTTP 404 from session deletion is strictly treated as failure (`SESSION_INVALIDATION_FAILED: Unknown session deletion route (HTTP 404)`).
  2. In the CLI runner, `invalidateSession` fails closed when 404 is received.
  3. Untracked sessions or failed session invalidations fail closed (`CLEANUP_FAILED_RESIDUAL_RESOURCES`).

### R5-03 — User Absence Check Requires Structured 404 (`PRRT_kwDOVtCmZc66mPVn`, Bugbot Med)
- **Vulnerability:** User absence verification trusted error message text containing "not found", allowing 503 Service Unavailable, gateway errors, or DNS timeouts containing such substrings to be falsely interpreted as confirmed user deletion.
- **Remediation:**
  1. User absence strictly requires structured provider HTTP status 404 (`error.status === 404`) or structured error code (`error.code === 'user_not_found'`).
  2. Explicitly rejects 5xx, 503, timeouts, gateway errors, and network failures, pushing to `residualUsers` as `VERIFY_FAILED`.

### R5-04 — Session Minted Before JWT Validation Failure Tracked for Cleanup (`PRRT_kwDOVtCmZc66mP9O`, Codex P2)
- **Vulnerability:** In `HOOK-01`, if password grant succeeded with HTTP 200, a session was minted on the server. However, if subsequent client-side JWT claims check failed, the error was thrown before capturing `session_id` into `inventory.trackedSessions`, leaking the active session across runs.
- **Remediation:**
  1. Extracted `user.id` and `session.id` immediately upon HTTP 200 password grant before parsing/validating JWT claims.
  2. Registered the session into `inventory.trackedSessions` so it is guaranteed to be cleaned up.
  3. Kept unverified JWT untrusted for authorization while preserving session tracking for cleanup. Untracked minted sessions fail closed (`UNTRACKED_MINTED_SESSION`).

### R5-05 — Mandatory Finite Numeric JWT Expiration & Temporal Consistency (`PRRT_kwDOVtCmZc66mP9U`, Codex P2)
- **Vulnerability:** `parseAndValidateJwt` allowed missing, string, null, NaN, or non-finite `exp` claims, and did not check temporal consistency with `iat`.
- **Remediation:**
  1. Strictly required `exp` to be a finite number (`typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)` throws `INVALID_EXP` or `MISSING_EXP`).
  2. Required `iat` to be a finite number if present.
  3. Enforced temporal consistency: `exp >= iat`. Tokens where `exp < iat` throw `INVALID_EXP_TEMPORAL_INCONSISTENCY`.

### R5-06 — Seed Password Restoration for Repeatable Runs (`PRRT_kwDOVtCmZc66mP9a`, Codex P2)
- **Vulnerability:** In `SESSION-02`, updating the seed user's password left the user with the new password. Because seed accounts are preserved across runs (`referencedUsers`), subsequent test runs failed authentication with `Invalid login credentials`.
- **Remediation:**
  1. Added `registerSeedPasswordModification({ userId, originalPassword, newPassword })` in `TestRunInventory`.
  2. In `executeCleanup`, added Step 6: restore modified seed passwords using Admin API (`adminClient.updateUserById(userId, { password: originalPassword })`).
  3. Redacted passwords from reports; tracked `seedCredentialsRestored++`; failed closed on restoration failure.
  4. Wired `updateUserById` in standalone CLI adapter.

### R5-07 — Explicit Storage Object Fixture Provisioning & Cleanup (`PRRT_kwDOVtCmZc66mP9g`, Codex P2)
- **Vulnerability:** `SESSION-05` tested Storage authorization against `probe.txt` in `task06i_probe_bucket`, but no fixture setup script provisioned this object under test-user ownership. A 404 response could mean either auth failure or missing fixture.
- **Remediation:**
  1. Added explicit Storage object fixture provisioning instructions in `experiments/task06i/sql/testbed-fixtures.sql` Section 4 under test-user ownership (`owner_id = (auth.uid())::text`).
  2. Clarified that HTTP 404 indicates a missing fixture (`STORAGE_FIXTURE_MISSING` / `PROVIDER_PRECONDITION_MISSING`) rather than an authentication failure.
  3. Registered Storage fixture for cleanup in inventory.

### R5-08 — Edge Function Error Code Preservation (`PRRT_kwDOVtCmZc66mUba`, im-tio P2)
- **Vulnerability:** The Edge Function contract specification in `testbed-fixtures.sql` unconditionally synthesized `AuthSessionMissingError` on any upstream GoTrue error, masking legitimate upstream errors (e.g. 500, `bad_jwt`, `jwt_expired`).
- **Remediation:**
  1. Updated Edge Function `auth-user-probe` contract specification to preserve actual GoTrue error code and status.
  2. Only emit `AuthSessionMissingError` when GoTrue affirmatively returns a session-not-found error. Generic errors (`bad_jwt`, `jwt_expired`, `invalid_token`) preserve their exact codes.
  3. `validateProbeOutcome` rejects generic or false-proof errors on `SESSION-06`.

---

---

## 7. Revision R6 Remediation Summary (PR #37 Outstanding Codex Findings)

### R6-01 — Supported Session Revocation for Cleanup (`PRRT_kwDOVtCmZc66rvnI`, Codex P2)
- **Vulnerability:** The standalone LIVE CLI adapter attempted to call an unsupported endpoint: `DELETE /auth/v1/admin/users/sessions/{sessionId}`. GoTrue lacks an admin session-by-id deletion endpoint; attempting this route returns HTTP 404 (or 405), leaving sessions active after aborted/completed runs.
- **Remediation:**
  1. Verified currently supported GoTrue session invalidation: GoTrue supports user-scoped sign-out via `POST /auth/v1/logout?scope=local` requiring valid user `access_token` context in `Authorization: Bearer <access_token>`.
  2. In `TestRunInventory`: added `sessionTokens` map to preserve genuine `accessToken` context alongside `sessionId`. In `registerSession`, accepted both string and object token contexts, and exported `getSessionToken(sessionId)`.
  3. In `HOOK-01`: passed `{ accessToken }` when registering the minted session in `inv.registerSession(rawSessionId, { accessToken })`.
  4. In `executeCleanup`: wired supported session invalidation via `adminClient.signOut(token, 'local')`. When token context is missing, fails closed with `MISSING_TOKEN_CONTEXT`.
  5. In standalone CLI adapter: replaced the unsupported endpoint with supported `signOut(token, scope = 'local')` calling `POST /auth/v1/logout?scope=local` and `invalidateSession(sessionId, token)` requiring token context.
  6. Covered by unit test 71 in `experiments/task06i/hosted-probe-runner.test.mjs`.

### R6-02 — Real Storage Object Provisioning Contract (`PRRT_kwDOVtCmZc66rvnN`, Codex P2)
- **Vulnerability:** Section 4 of `sql/testbed-fixtures.sql` previously included an Option B suggesting direct SQL insertion into `storage.objects`. In Supabase Storage, inserting a row in `storage.objects` creates metadata only; actual object bytes are not uploaded to the storage backend, causing subsequent authenticated GET requests in `SESSION-05` to fail or return 404/500.
- **Remediation:**
  1. Removed Option B (metadata-only SQL insert) as an acceptable fixture procedure; documented that direct SQL inserts are strictly prohibited.
  2. Mandated genuine Storage API upload under authenticated seed user JWT context (`POST /storage/v1/object/task06i_probe_bucket/probe.txt`).
  3. Required establishing pre-revocation baseline verification: `GET /storage/v1/object/authenticated/task06i_probe_bucket/probe.txt` must succeed with HTTP 200 before evaluating post-revocation stateless linger.
  4. Specified object tracking in run-scoped inventory (`registerStorageObject`) and verified cleanup via Storage API (`DELETE /storage/v1/object/...`) preserving pre-existing bucket assets.
  5. Covered by unit test 72 in `experiments/task06i/hosted-probe-runner.test.mjs`.

### R6-03 — Accept Genuine SESSION-06 Revocation Evidence (`PRRT_kwDOVtCmZc66rvnS`, Codex P2)
- **Vulnerability:** In `validateProbeOutcome` for `SESSION-06`, the predicate explicitly excluded `errCode !== 'session_not_found'`. When the Edge Function observed GoTrue's genuine provider code `session_not_found` (with message: `Session from session_id claim in JWT does not exist`), the dispatcher correctly verified revocation, but the validator rejected it with `MISSING_EVIDENCE`.
- **Remediation:**
  1. Aligned dispatcher and validator revocation allowlists: explicitly included `session_not_found` alongside `AuthSessionMissingError`.
  2. Accepted genuine provider-observed `session_not_found` only when all other security evidence is present (pre-reset baseline verified, reset completed, session IDs strictly correlated).
  3. Rejected generic 401/403 Forbidden without provider error code (`MISSING_EVIDENCE`), false proof (`bad_jwt`, `jwt_expired`, `invalid_token` fail closed as `FALSE_PROOF_REJECTED`), and session correlation mismatches.
  4. Covered by unit test 73 and updated unit test 28 in `experiments/task06i/hosted-probe-runner.test.mjs`.

### 7.7 Revision R7 Review Finding Remediation

#### R7-01: Remove Duplicate `signOut` Method Shadowing & Export `createHostedAdminClient` (im-tio P1, `PRRT_kwDOVtCmZc66sBa5`)
- **Root Cause:** In `experiments/task06i/hosted-probe-runner.mjs`, the standalone CLI `adminClient` object literal defined `async signOut(token, scope = 'local')` at line 3303, but then had a second property `async signOut(sessionId) { return this.invalidateSession(sessionId); }` at line 3349. In JavaScript object literals, duplicate property definitions silently shadow preceding ones. When `invalidateSession(sessionId, token)` was invoked during cleanup, it called `this.signOut(token, 'local')`, which dispatched to the second override without the second `token` parameter, deterministically triggering `UNSUPPORTED_SESSION_REVOCATION` / `MISSING_TOKEN` and failing cleanup on every session.
- **Remediation:**
  1. Extracted and exported `createHostedAdminClient({ serviceRoleKey, projectRef = HARDCODED_TEMP_REF, fetchFn = fetch })` as a reusable, testable factory.
  2. Enforced strict security boundary: `projectRef` must equal `HARDCODED_TEMP_REF` (`wvdabiwbaavfggcmpizd`), throwing `SECURITY_BOUNDARY_VIOLATION` on real or foreign refs. Requires non-empty `serviceRoleKey`.
  3. Implemented authoritative single `signOut(token, scope = 'local')` that validates non-empty `token` and dispatches `POST /auth/v1/logout?scope=${scope}`.
  4. Implemented `invalidateSession(sessionId, token)` requiring non-empty `token` and delegating to `this.signOut(token, 'local')`.
  5. Implemented `deleteUser`, `getUserById`, `updateUserById`, `deleteTableRow`, and `deleteStorageObject` for full resource lifecycle.
  6. Eliminated the second `signOut(sessionId)` override entirely.
  7. Replaced the inline object literal in the standalone CLI block with `createHostedAdminClient(...)`.
  8. Added unit test 74 verifying no duplicate method exists, testing token requirement, parameter dispatch, error handling, and integration with `TestRunInventory.executeCleanup()`.

#### R7-02: Enforce 300-Second JWT Lifetime Contract in `SESSION-04` and `SESSION-05` (Codex P2, `PRRT_kwDOVtCmZc66r92y`)
- **Root Cause:** In `SESSION-04` (PostgREST Data API linger) and `SESSION-05` (Storage linger), the dispatcher and validator previously verified only `token_unexpired` (`now < exp`), without calculating or validating the issuance window `exp - iat`. An oversized token with `exp - iat = 86400` (24 hours) could pass with HTTP 200 while falsely claiming the documented `bounded by short jwt_exp (300s)` contract.
- **Remediation:**
  1. In `createHostedDispatcher` for both `SESSION-04` and `SESSION-05`:
     - Extracted `iat` and `exp` from `ctx.activeAccessToken`.
     - Validated that both are finite numbers with `exp > iat`.
     - Calculated `jwtLifetimeSeconds = exp - iat`.
     - Calculated `lifetimeBounded = jwtLifetimeSeconds > 0 && jwtLifetimeSeconds <= 300`.
     - Enforced that stateless linger is observed ONLY when `status === 200 && tokenUnexpired && lifetimeBounded`.
     - Returned `jwt_lifetime_seconds`, `jwt_iat`, `jwt_exp`, and `lifetime_bounded` in the outcome without logging raw tokens.
     - Failed closed with `EXCESSIVE_JWT_LIFETIME` if `jwtLifetimeSeconds > 300`.
  2. In `validateProbeOutcome` for `SESSION-04` and `SESSION-05`:
     - Strictly required `typeof rawOutcome.jwt_lifetime_seconds === 'number' && Number.isFinite(...)`.
     - Strictly required `rawOutcome.jwt_lifetime_seconds > 0` and `rawOutcome.jwt_lifetime_seconds <= 300`.
     - Failed closed with `EXCESSIVE_JWT_LIFETIME: ${item.id} token lifetime (${rawOutcome.jwt_lifetime_seconds}s) exceeds approved 300s bound` if lifetime exceeds 300 seconds.
     - Strictly required `rawOutcome.lifetime_bounded === true`.
  3. Added unit test 75 covering approved 300s lifetime (pass), shorter 120s lifetime (pass), 301s and 86400s oversized lifetimes (fail), missing timestamps (fail), temporal inconsistency `exp <= iat` (fail), non-finite claims (fail), and Storage integration.

### 7.8 Task 06I-B1-H1-R8 Remediation Details

#### R8-01: Track Unexpected Sessions across Negative Probes & Fail-Closed Untracked Sessions (Codex P2, `PRRT_kwDOVtCmZc66sSyk`)
- **Root Cause:** Negative probes (`BYPASS-01`, `BYPASS-02`, `BYPASS-03`, `BYPASS-05`, `HOOK-03`..`07`) did not register unexpectedly issued tokens or sessions in `TestRunInventory`. If an endpoint unexpectedly returned HTTP 200 with tokens, the probe correctly failed security validation and halted the runner, but `inventory.trackedSessions` remained empty. The runner's `finally` cleanup block therefore bypassed session invalidation on the provider, leaking active unauthorized sessions.
- **Remediation:**
  1. Defined and exported a shared, fail-closed observation helper `observeAndTrackSessionTokens(body, { inv, ctx, probeId, testUser })`.
  2. Captured session identity from `body.session_id`, `body.session.id`, `body.tokens.session_id`, or safe unverified JWT claims (`session_id`).
  3. If an authentication response mints a token but the session identifier cannot be extracted, invoked `inv.registerUntrackedSession()`. Updated `executeCleanup` to fail closed with `UNTRACKED_MINTED_SESSION: Authentication response minted token but session identifier could not be extracted; residual session cannot be tracked`.
  4. For `BYPASS-02` (signup), registered unexpected user identity via `inv.registerCreatedUser({ id, email, source: 'BYPASS-02_unexpected' })` (eligible for deletion).
  5. For all other probes (seed user / login), registered user identity via `inv.registerReferencedUser({ id, email, source: ... })` so pre-existing testbed seed users are NEVER deleted during cleanup (preserving R3-09 invariant).
  6. Preserved strict negative probe security failure semantics (`passed: false`, `tokens: body`, with error containing `SECURITY_INVARIANT_VIOLATION`). Unverified tokens are never stored as active authorized credentials in `runContext.activeAccessToken`.
  7. Added unit test 76 validating unexpected session capture, seed user preservation, cleanup invalidation dispatch, normal rejection invariance, and untracked minted session fail-closed behavior.

#### R8-02: Make Session Cleanup Idempotent & Handle Confirmed Session Absence (Codex P2, `PRRT_kwDOVtCmZc66sSyn`)
- **Root Cause:** In `SESSION-02`, when session revocation is proven, the tracked pre-reset token was subsequently reused during post-run cleanup in `adminClient.signOut(token, 'local')`. GoTrue's `/logout` endpoint returns HTTP 403 `session_not_found` for an already-revoked session. `createHostedAdminClient.signOut` previously treated all non-2xx statuses as cleanup errors, causing `executeCleanup` to record residual resources and fail closed with `CLEANUP_FAILED_RESIDUAL_RESOURCES`, falsely overriding a passing test run.
- **Remediation:**
  1. In `TestRunInventory`: added `this.revokedSessions = new Set()`, `markSessionRevoked(sessionId)`, and `isSessionRevoked(sessionId)`.
  2. In `createHostedDispatcher` for `SESSION-02` and `SESSION-03`: when session revocation is proven (`isRevoked === true`), marked the session as revoked in inventory via `inv.markSessionRevoked(ctx.activeSessionId)`.
  3. In `TestRunInventory.executeCleanup`: added an idempotency check at the beginning of the session loop: if `this.revokedSessions.has(sessionId)`, increment `report.sessionsRevoked++` and skip redundant `/logout` calls.
  4. In `createHostedAdminClient.signOut(token, scope = 'local')`: parsed GoTrue response bodies. If the provider affirmatively returns `session_not_found` or `authsessionmissingerror` (and NOT false proofs like `bad_jwt`, `jwt_expired`, `invalid_token`), treated it as verified session absence and returned `{ data: { scope, alreadyRevoked: true }, error: null, session_not_found: true }`.
  5. Generic 401/403 Forbidden, 500 errors, network timeouts, and `bad_jwt` continue to fail closed as cleanup errors.
  6. Calling `executeCleanup` multiple times on the same inventory is safely idempotent with zero redundant network requests.
  7. Added unit test 77 validating provider absence responses, `SESSION-02` pre-marking, and multi-call cleanup idempotency.

---

## 8. Verification Evidence Matrix

All verification checks were run locally and passed completely:

```bash
node --test experiments/task06i/hosted-probe-runner.test.mjs
# 81 passed, 0 failed, exit code 0

node --test experiments/task06i/*.test.mjs
# 149 passed, 0 failed, exit code 0

node experiments/task06i/sql-contract-parity.mjs
# Status: POSTGRES_VERIFIED, 18/18 matched parity, exit code 0

node --test experiments/task06h/*.test.mjs
# 115 passed, 0 failed, exit code 0

npm run verify
# 22 shell contract tests passed, tokens/tsc/lint clean, exit code 0

git diff --check origin/main...HEAD
# Clean (exit code 0)
```

---

## 9. GitHub CI Status

- **Status:** **4/4 CHECKS PASS** on remote commit `5207f5dbdcfa9e9833a655cb6d19b9f35d1ea466`:
  1. `Attribution guard runner`: **PASS**
  2. `Commit attribution fixture tests`: **PASS**
  3. `Commit attribution guard` (App-owned required check ID `5032971`): **PASS**
  4. `Task 06I Security Contract Tests`: **PASS**
- All required checks execute and succeed on GitHub Actions infrastructure.

---

## 10. Hard STOP Gate & Decision

- **Hard STOP Gate Honored:**
  - Zero hosted LIVE probes execute hue hain.
  - Zero TEMP Auth configuration PATCHes execute hue hain.
  - Zero hosted SQL deployments execute hue hain.
  - Zero test users create hue hain.
  - Zero live emails dispatch hui hain.
  - Real Auth implementation start nahi hui hai.
  - Project deletion perform nahi hua hai.

**Readiness State:**
- **Code readiness:** READY (Revision R8)
- **GitHub CI:** PASS (4/4 on remote HEAD)
- **Independent review:** PENDING (`im-tio`)
- **Hosted testing:** NOT_AUTHORIZED
- **Production Auth:** STRICT NO-GO

**Decision:** **`BLOCKED_PENDING_ADDITIONAL_PREPARATION`**

> **Important:** Production Real Auth remains **STRICT NO-GO**. Local remediation for all outstanding review findings (R8-01 and R8-02) is complete and fully covered by offline regression tests (81/81 runner tests, 149/149 task06i tests pass). Decision remains strictly `BLOCKED_PENDING_ADDITIONAL_PREPARATION` because hosted preconditions (Management API PATCH, SQL hook installation, Edge Function deployment) require explicit owner authorization before any live execution. Awaiting independent re-review from `im-tio`.
