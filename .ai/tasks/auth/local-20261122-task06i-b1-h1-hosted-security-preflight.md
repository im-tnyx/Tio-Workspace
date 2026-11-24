# Phase 1.2 Task 06I-B1-H1-R16 — Signup Session Tracking & Proven User Ownership Closure

> **Local Preparation, Preflight Audit, Offline Validation & Reviewable PR.** Prepared under `AGENTS.md` operating rules. This document establishes the offline verification baseline, safety boundaries, Brevo sending readiness assessment, complete TEMP-only testbed setup specification, exact run-scoped identity cleanup, and read-only execution plan for Task 06I-B1-H1-R16. All outstanding review findings across PR #37 (including `im-tio` P2 finding `PRRT_kwDOVtCmZc66-adI` on OTP user-creation tracking and endpoint capability drift elimination) are resolved. Zero hosted LIVE probes, mutations, Auth Hook deployments, or test users have been executed. Decision remains strictly **`BLOCKED_PENDING_ADDITIONAL_PREPARATION`**. Production Real Auth remains **STRICT NO-GO**.

| Field | Value |
|---|---|
| Status | **LOCAL REMEDIATION COMPLETE (REVISION R16); ALL REVIEW FINDINGS RESOLVED (R15-01 `im-tio` P2 `PRRT_kwDOVtCmZc66-adI`: TRACK OTP-ORIGIN USER CREATION ON LOST/UNREADABLE RESPONSES BEFORE REPORTING CLEANUP SUCCESS, PRE-DISPATCH IN-FLIGHT REGISTRATION, FAIL-CLOSED UNTRACKED USER RISK ON TRANSPORT ERRORS / TIMEOUTS / UNREADABLE BODIES / EMPTY HTTP 200, UNEXPECTED CONCRETE USER DELETION WITH EXACT ID, PRE-EXISTING SEED USER ANTI-DELETION PRESERVATION; R15-02: ENDPOINT CAPABILITY DRIFT ELIMINATION, CANONICAL `AUTH_ENDPOINT_CAPABILITIES` CONSISTENCY ACROSS ALL 9 ENDPOINTS, `getEndpointCapabilities` RESOLVER HELPER, DISPATCHER SYNCHRONIZATION); 91/91 RUNNER TESTS PASS; 159/159 TASK06I TESTS PASS; 18/18 POSTGRESQL PARITY PASS (`POSTGRES_VERIFIED`); 115/115 TASK06H TESTS PASS; 22/22 SHELL TESTS PASS; DECISION: `BLOCKED_PENDING_ADDITIONAL_PREPARATION`; READY FOR INDEPENDENT RE-REVIEW** |
| Objective | Remediate `im-tio` P2 review finding `PRRT_kwDOVtCmZc66-adI` (R15-01: track OTP-origin user creation on lost/unreadable responses before reporting cleanup success) and eliminate capability drift (R15-02) across all Auth endpoints on PR #37 without executing any live hosted mutations. |
| Implementation owner | Agent / Local Development & Security Research, Task 06I-B1-H1-R16 slice |
| Previous agent | Agent / Task 06I-B1-H1-R14 author |
| Last audited HEAD | `9a2cb1096910306172222de8602caf1ffc363ea0` (PR #37 R14 commit) |
| Tracking / approval | Task 06I-B1-H1-R16 remediation authorized by user prompt; LIVE hosted probe execution requires separate explicit owner authorization; mandates $0 cost ceiling and permanent immunity for `Tio-world` (`oykupyiitspujzpwwvuj`) and REAL `bsfwzvgynwriswapxpsp` |
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

#### R9-01: Pre-Dispatch Password Restoration & Cleanup Integrity Closure (Codex P2, `PRRT_kwDOVtCmZc66s2Pf`)
- **Root Cause:** In `SESSION-02`, the Admin API password-update request (`PUT /auth/v1/admin/users/:id`) was previously dispatched before `inv.registerSeedPasswordModification()` was called. If GoTrue committed the password mutation but the client response was lost (due to network timeout, socket drop / `ECONNRESET`, or malformed unreadable JSON), `resetSucceeded` was false and the restoration obligation was never registered in inventory. Post-run cleanup would return zero restorations and `CLEANUP_VERIFIED_SUCCESS`, leaving the preserved test account with an altered password in the database and permanently breaking all subsequent test runs.
- **Remediation:**
  1. In `createHostedDispatcher` for `SESSION-02`: registered the restoration obligation in `TestRunInventory` **before** dispatching the `PUT /auth/v1/admin/users/:id` request.
  2. Tracked explicit operational states: `pending` (initial registration) -> `dispatched` (immediately prior to network transport) -> `confirmed` (HTTP 200 with matching user ID in response) / `indeterminate` (transport exception, unreadable JSON, or HTTP non-200 status where server may have committed mutation).
  3. Preserved restoration obligation as `indeterminate` if `fetchFn` throws `ECONNRESET` or times out, or if `parseResponseBody` fails. Never inferred that a network error means transaction rollback.
  4. In `TestRunInventory`: preserved initial/earliest `originalPassword` across repeated registrations (never overwritten with subsequently mutated passwords), added `getSeedPasswordModification(userId)` lookup helper, and implemented `clearCredentials()` to overwrite passwords with `'[CLEARED]'` after verified cleanup.
  5. Implemented `createHostedAdminClient.verifyUserCredentials(email, password)`: dispatches controlled authentication via `POST /auth/v1/token?grant_type=password`, catches credentials errors, and immediately invokes `this.signOut(data.access_token, 'local')` on success to prevent session leakage.
  6. In `TestRunInventory.executeCleanup` step 6:
     - Enforced security boundary: untracked users cannot be modified by restoration (`!this.isUserTracked(item.userId)` fails closed with `SECURITY_BOUNDARY_VIOLATION`).
     - Skipped redundant update if `item.state === 'restored'`.
     - Executed `updateFn(item.userId, { password: item.originalPassword })`; failures fail closed with `RESTORE_FAILED`.
     - Invoked `adminClient.verifyUserCredentials(testEmail, item.originalPassword)`; failures fail closed with `RESTORE_VERIFICATION_FAILED`.
     - On successful verification, marked `item.state = 'restored'` with `restoredAt` and `verifiedAt`.
     - Once cleanup verifies complete resource removal (`CLEANUP_VERIFIED_SUCCESS`), called `this.clearCredentials()` to sanitize sensitive secrets.
  7. Added unit tests 78 and 79 validating pre-dispatch registration, transport drop handling, unreadable JSON, HTTP 500 indeterminate state, controlled post-restoration verification, untracked user boundaries, and credential sanitization.

### 7.10 Revision R10 Remediation (Verification Session Cleanup & Identity Binding Closure)

- **R10-01 — Verification Session Cleanup & Invalidation Failure Detection (Codex P2, `PRRT_kwDOVtCmZc66tPnu`):**
  1. In `createHostedAdminClient.verifyUserCredentials(email, password, options = {})`:
     - Extracted session ID from response body or unverified JWT claims (`session_id`).
     - If `options.inventory` is provided: registered minted session in `inventory.trackedSessions` immediately upon token issuance (`inv.registerSession(sessionId, { accessToken: token, source: 'verify_credentials' })`). If session ID cannot be extracted from payload or JWT claims, recorded `inv.registerUntrackedSession()` and failed closed (`code: 'UNTRACKED_SESSION'`).
     - Handled both returned `{ error }` and thrown exceptions from `this.signOut(token, 'local')`. If sign-out fails, returns `{ data: null, error: { message: 'VERIFICATION_SESSION_REVOCATION_FAILED...', sessionId, token }, sessionRevocationFailed: true }`.
     - On successful sign-out, marks session revoked in inventory (`inv.markSessionRevoked(sessionId)`).
  2. In `TestRunInventory.executeCleanup`:
     - Step 6 inspects `verifyRes.sessionRevocationFailed`.
     - If verification session logout fails, attempts fallback retry cleanup `adminClient.signOut(leakToken, 'local')`.
     - If retry fails, records residual session resource (`type: 'session', id: leakSessId, error: 'VERIFICATION_SESSION_LEAK...'`), marks `item.state = 'restoration_failed'`, pushes residual restoration resource, and fails cleanup closed with `CLEANUP_FAILED_RESIDUAL_RESOURCES`.
     - In `runHostedProbeRunner`, cleanup failure overrides password restoration verification success (`cleanupSuccess = !isLive || (cleanupReport && cleanupReport.status === 'CLEANUP_VERIFIED_SUCCESS')`).
  3. Added Test 80 validating immediate inventory registration, 503 error handling, thrown exception handling, untracked session detection, false-proof rejection, fallback retry recovery, and runner halt on cleanup failure.

- **R10-02 — Seed Identity Correlation & Mismatch Rejection (Codex P2, `PRRT_kwDOVtCmZc66tPnx`):**
  1. In `createHostedDispatcher` for `SESSION-02`:
     - Resolved email identity explicitly by prioritizing `inv.getUserEmail(userId)` and `item.testUser || options.testEmail || options.testUser || ctx?.testEmail`.
     - Enforced exact identity correlation: if candidate email and tracked user email disagree, fails closed with `status: 0, error: 'IDENTITY_MISMATCH...'` before dispatching any password mutation request.
     - Checked cross-user binding conflicts across `referencedUsers` and `createdUsers`. If email is bound to another user ID, fails closed with `IDENTITY_MISMATCH`.
     - Validated test identity with `validateTestIdentity(seedEmail)` and propagated to `ctx.testEmail`.
  2. In `TestRunInventory.registerSeedPasswordModification`:
     - Enforced identity correlation between `normEmail` and `trackedEmail`.
     - Rejected cross-user restoration record conflicts where the same email is bound to another unrestored user ID.
  3. In `TestRunInventory.executeCleanup`:
     - Step 6 validates `trackedEmail.trim().toLowerCase() === item.email.trim().toLowerCase()`. Mismatched identities fail closed as `IDENTITY_MISMATCH` and skip password mutation.
     - Controlled credential verification invokes `adminClient.verifyUserCredentials` with the exact bound email.
  4. In `runHostedProbeRunner`:
     - Propagated `testEmail` into `createRunContext({ ...options, testEmail })`.
     - Forwarded `testEmail` and `testUser` from probe item or context into `mockDispatcher`.
     - Only cleared credentials in `finally` when cleanup verified complete success (`cleanupReport.status === 'CLEANUP_VERIFIED_SUCCESS'`).
  5. Added Test 81 validating custom seed identity propagation, mismatch rejection before mutation, cross-user conflict rejection, case-insensitive comparison, indeterminate state preservation, and exact bound email verification in cleanup.

### 7.11 Revision R11 Remediation (Indeterminate Verification Response & Residual Session Closure)

- **R11-01 — Fix Unreadable Verification Response False Success (Codex P2, `PRRT_kwDOVtCmZc66tz_m`):**
  1. In `createHostedAdminClient.verifyUserCredentials(email, password, options = {})`:
     - Eliminated the unsafe no-token success fallback (`if (!token) return { data: { verified: true }, error: null }`).
     - Wrapped `res.json()` in strict try/catch on HTTP 200. If JSON parsing fails (unreadable, malformed, or truncated JSON), returns `{ data: null, error: { message: 'INDETERMINATE_VERIFICATION_RESPONSE...', code: 'UNREADABLE_RESPONSE', status: 200 }, sessionRevocationFailed: true, indeterminateSession: true }`.
     - Calls `inv?.registerUntrackedSession()` to register an untracked session risk immediately.
     - Enforces that parsed JSON body is a non-null object (`code: 'INVALID_RESPONSE_STRUCTURE'`).
     - Rejects missing, empty, or whitespace-only `access_token` (`code: 'MISSING_ACCESS_TOKEN'`, `indeterminateSession: true`, `inv?.registerUntrackedSession()`).
     - Extracts session ID from payload (`data.session_id`, `data.session?.id`) or JWT claims (`payload.session_id`). If token exists but session ID cannot be extracted, fails closed with `code: 'UNTRACKED_SESSION'`, `indeterminateSession: true`, and registers untracked session in inventory.
     - When session ID and token are valid, registers session immediately in inventory (`inv.registerSession(sessionId, { accessToken: token, source: 'verify_credentials' })`).
     - Calls `this.signOut(token, 'local')` immediately to revoke the verification session.
  2. In `TestRunInventory.executeCleanup`:
     - Differentiates `isRevocationFail` from `isIndeterminate`.
     - If `verifyRes.indeterminateSession` is true, marks `item.state = 'restoration_failed'` and pushes residual resources:
       - `{ type: 'seed_credential_restoration', userId: item.userId, error: 'RESTORE_VERIFICATION_INDETERMINATE...' }`
       - `{ type: 'untracked_session', id: 'indeterminate_verification_session', error: 'INDETERMINATE_SESSION_LEAK...' }`
     - Residual indeterminate session obligations block cleanup: `report.status = 'CLEANUP_FAILED_RESIDUAL_RESOURCES'`. Never reports `CLEANUP_VERIFIED_SUCCESS` when indeterminate session remains.
     - With `failClosed: true` (default), throws `CLEANUP_INCOMPLETE`.
     - Pre-existing seed user is never deleted (`this.referencedUsers` preserved).
  3. Added Test 82 covering the full matrix of verification response shapes (valid token, truncated JSON, non-JSON body, empty `{}`, missing token, malformed token, missing session ID, network drop, HTTP 500, logout HTTP 503, logout throw, residual-session uncertainty blocking cleanup, seed user preservation, and secret redaction in reports).

- **R11-02 — Secure Cleanup Error & Credential Boundaries:**
  1. Stripped `token` property from all returned error objects in `verifyUserCredentials` and `signOut`.
  2. Isolated sensitive tokens in private run-scoped inventory context (`this.sessionTokens.set(sessionId, accessToken)`).
  3. In `executeCleanup`, retrieved `leakToken` privately via `this.getSessionToken(leakSessId)` for the fallback cleanup retry, preventing raw token values from appearing in externally visible `{ error }` shapes or logs.
  4. Preserved original passwords in `item.originalPassword` on cleanup failure (skipping `clearCredentials()`) so that emergency admin remediation remains possible.
  5. Only sanitized credentials (`this.clearCredentials()` sets `'[CLEARED]'`) on confirmed `CLEANUP_VERIFIED_SUCCESS`.
  6. Added Test 83 validating secret boundary enforcement across error objects, `signOut` failures, private inventory token map usage, failed cleanup password preservation, and successful cleanup password clearing.

### 7.12 Holistic Lifecycle Gap Register

End-to-end audit across the Auth lifecycle (`Auth response → minted-session observation → JWT validation → inventory → password mutation → credential restoration → verification login → session revocation → cleanup → final status`):

| Category | Item / Lifecycle Step | Description & Resolution / Bound |
|---|---|---|
| **Confirmed Defects Fixed in R11** | Unreadable verification response false success | `verifyUserCredentials` previously caught parse failures and returned false `verified: true`. Fixed: strictly requires readable JSON, non-blank access token, and extractable session ID; parse failures return `INDETERMINATE_VERIFICATION_RESPONSE` and register untracked session risk. |
| **Confirmed Defects Fixed in R11** | Indeterminate verification session cleanup bypass | Verification login could mint a session that the client cannot read/revoke. Fixed: `executeCleanup` records `INDETERMINATE_SESSION_LEAK` residual resource, marks restoration failed, and fails closed (`CLEANUP_FAILED_RESIDUAL_RESOURCES`). |
| **Confirmed Defects Fixed in R11** | Secret boundary & raw token in error object | R10 attached `token: ...` to error objects. Fixed: raw tokens stripped from all error shapes; tokens stored privately in `inv.sessionTokens` and retrieved via `inv.getSessionToken()`. Passwords preserved on failure for admin recovery, cleared only on verified success. |
| **Unsupported Provider Operations** | Admin session-by-ID deletion | GoTrue lacks an admin session-by-ID deletion endpoint (`DELETE /auth/v1/admin/sessions/:id`). Session invalidation strictly requires access token context via `POST /auth/v1/logout?scope=local`. Probes without token context fail closed. |
| **Unsupported Provider Operations** | Synchronous password revocation broadcast | Admin password update (`PUT /auth/v1/admin/users/:id`) does not emit a structured revocation guarantee across all consumers without affirmative `/auth/v1/user` probe. `SESSION-02` requires explicit post-reset probe proving `session_not_found`. |
| **Testbed Provisioning Prerequisites** | Management API PATCH | Hosted TEMP project `wvdabiwbaavfggcmpizd` requires Management API PATCH to disable native signup (`DISABLE_SIGNUP: true`) and external providers before running `BYPASS-01` and `BYPASS-02`. |
| **Testbed Provisioning Prerequisites** | SQL Hook Deployment | `experiments/task06i/sql/hooks.sql` must be deployed on TEMP to enable Custom Access Token Hook (`private_auth.custom_access_token_hook`) and Send Email Hook (`private_auth.send_email_hook`). |
| **Testbed Provisioning Prerequisites** | Storage Probe Fixture | Storage bucket `task06i_probe_bucket` and probe object `probe.txt` must be provisioned before `SESSION-05` can verify bounded stateless JWT linger. |
| **Testbed Provisioning Prerequisites** | Seed User Provisioning | Seed user with known initial password must be provisioned in TEMP before `SESSION-02` can test password mutation and credential restoration. |
| **Hosted-Only Verification Requirements** | Provider-observed `session_not_found` | Proof of remote session invalidation in `SESSION-03` and `SESSION-06` requires live HTTP dispatch to observe GoTrue's exact error code `session_not_found`. |
| **Hosted-Only Verification Requirements** | Custom Access Token Hook execution | Proof of hook claims injection (`amr_authenticated: true`, `app_metadata.amr`) requires live GoTrue token minting against deployed PostgreSQL hook. |
| **Hosted-Only Verification Requirements** | Storage JWT stateless linger observation | Proof that Storage accepts valid unexpired JWTs (lifetime <= 300s) requires live HTTP GET against Storage endpoint. |
| **Residual Risks (Not Provable Offline)** | Server-side minting with transport loss | If HTTP connection drops after GoTrue mints a session but before response arrives, client cannot know session ID; fails closed with untracked session risk. |
| **Residual Risks (Not Provable Offline)** | Edge clock skew & stateless linger TTL | Minor clock skew across distributed edge nodes could theoretically affect stateless JWT expiry boundaries (mitigated by 300s hard cap). |
| **Residual Risks (Not Provable Offline)** | Brevo external SMTP delivery | Brevo sending readiness requires authenticated domain; blocked until custom domain DNS records are configured. |

### 7.13 Revision R12 Remediation Details

- **R12-01 — Treat HOOK-01 Unreadable Success as Residual Session (Codex P2, `PRRT_kwDOVtCmZc66u-GX`):**
  1. Identified that when GoTrue returned HTTP 200 with truncated, unreadable, or missing token evidence, `createHostedDispatcher` previously saw `body === null` and registered zero session obligations.
  2. When cleanup ran, it reported false `CLEANUP_VERIFIED_SUCCESS` with zero logout calls and empty inventory while an unobserved server-side session remained active.
  3. Remediated by ensuring any HTTP 200 response with unreadable body, missing access token, or unextractable session ID is classified as `AUTH_RESPONSE_INDETERMINATE` and immediately registers an untracked session risk in inventory (`inv.registerUntrackedSession()`).
  4. In `executeCleanup`, indeterminate sessions trigger residual resource reporting (`INDETERMINATE_SESSION_LEAK`) and fail closed (`CLEANUP_FAILED_RESIDUAL_RESOURCES`), blocking `CLEANUP_VERIFIED_SUCCESS` and throwing `CLEANUP_INCOMPLETE` under `failClosed: true`.

- **R12-02 — Shared Fail-Closed Auth Response Boundary (`observeAuthResponse` and `parseResponseEnvelope`):**
  1. Implemented `parseResponseEnvelope(res)`:
     - Handles stream reads defensively (`text()` fallback on `json()` failure).
     - Standardized status classification: `'parsed'`, `'unreadable'`, `'non_object'`, `'missing_response'`, or `'transport_error'`.
  2. Implemented `observeAuthResponse(...)`:
     - Applied across all Auth probes (`BYPASS-01..05`, `HOOK-01..02`) and `createHostedAdminClient.verifyUserCredentials()`.
     - Standardized classifications:
       - `AUTH_RESPONSE_VERIFIED_REJECTION`: HTTP 4xx rejection with confirmed error message.
       - `AUTH_RESPONSE_TOKEN_OBSERVED`: HTTP 200 with valid access token and extractable session ID.
       - `AUTH_RESPONSE_INDETERMINATE`: HTTP 200 with unreadable body, missing tokens, unextractable session ID, or post-dispatch transport failure.
       - `AUTH_RESPONSE_PROVIDER_FAILURE`: HTTP 5xx or transport failure without session minting risk.
       - `AUTH_RESPONSE_UNEXPECTED_TOKEN`: Negative probe unexpectedly issuing tokens.
     - Unverified tokens are stored in `ctx.mintedAccessToken` and registered in `inv.trackedSessions` for cleanup, but strictly omitted from `ctx.activeAccessToken` until JWT claim verification passes.
     - Added comprehensive regression Test 84 covering all 18 requirements.

### 7.14 One-Time Full Lifecycle Audit Matrix

Compact invariant matrix verifying the 10 lifecycle invariant classes across code locations, supporting tests, and remaining limitations:

| Invariant Class | Scope / Description | Code Implementation Location | Supporting Test(s) | Operational Limitation / Proof Status |
|---|---|---|---|---|
| **1. Seed Credential Restore & Verification** | Pre-reset password captured, modified during test, restored during cleanup, and verified via real login | `hosted-probe-runner.mjs:2260-2345` (`TestRunInventory.executeCleanup`), `4180-4280` (`verifyUserCredentials`) | Test 68 (R5-06), Test 78 (R9-01), Test 80 (R10-01), Test 82 (R11-01) | Requires seed user pre-provisioned on testbed; offline verified via mock admin client |
| **2. Pre-Existing User Preservation** | Referenced seed user never deleted by testbed cleanup; only `createdThisRun` users deleted | `hosted-probe-runner.mjs:2200-2250` (`TestRunInventory.executeCleanup`) | Test 52 (R3-09), Test 82 (R11-01), Test 84 (R12-02) | Verified offline; hard guarantee in inventory contract |
| **3. Negative Probe Unexpected Tokens** | Negative probes (`BYPASS-01..05`) capture unexpected tokens and sessions into inventory for cleanup | `hosted-probe-runner.mjs:738-741`, `2930-3115` (`createHostedDispatcher`) | Test 76 (R8-01), Test 84 (R12-02) | Requires fail-closed token tracking in all negative probe handlers |
| **4. Supported Session Revocation** | Supported session invalidation uses GoTrue sign-out (`POST /auth/v1/logout?scope=local`) with token context | `hosted-probe-runner.mjs:4280-4350` (`createHostedAdminClient.signOut`) | Test 71 (R6-01), Test 74 (R7-01), Test 84 (R12-02) | Admin session-by-ID deletion not supported by GoTrue; token context mandatory |
| **5. Token-Only & Session-Only Cleanup Paths** | Both session ID and access token context tracked in private inventory; fallback retry supported | `hosted-probe-runner.mjs:1830-1860`, `2150-2200` (`executeCleanup`) | Test 71 (R6-01), Test 77 (R8-02), Test 83 (R11-02) | If token lost and provider lacks session-by-ID deletion, fails closed with untracked session risk |
| **6. Affirmative Provider Revocation Proof** | Password reset & session invalidation require provider-observed `session_not_found` error | `hosted-probe-runner.mjs:3720-3770` (`SESSION-02`), `3900-3940` (`SESSION-06`) | Test 57 (R4-03), Test 58 (R4-04), Test 63 (R5-01), Test 70 (R5-08), Test 73 (R6-03) | Rejects false-proof errors (`bad_jwt`, `jwt_expired`, generic 401/403) |
| **7. User Absence Verification** | User deletion verified by structured HTTP 404 from `getUserById`; 503 or generic error fails closed | `hosted-probe-runner.mjs:2210-2245` (`executeCleanup`) | Test 60 (R4-06), Test 65 (R5-03), Test 84 (R12-02) | Network errors during verification block cleanup completion |
| **8. Storage & Table Fixture Lifecycle** | Storage bucket objects and table rows registered into inventory and deleted during cleanup | `hosted-probe-runner.mjs:1880-1920`, `2350-2395` (`executeCleanup`) | Test 69 (R5-07), Test 72 (R6-02) | Requires probe bucket and table pre-created on testbed before probe dispatch |
| **9. Credential Binding & Key Validation** | Service role & anon keys validated against project ref in JWT claims (`ref`, `iss`); forged claims fail closed | `hosted-probe-runner.mjs:2567-2620` (`validateProjectCredentialBinding`) | Test 53 (R3-10), Test 55 (R4-01) | Prevents accidental targeting of REAL project with TEMP keys or vice versa |
| **10. Secret Boundary Enforcement & Redaction** | JWTs, passwords, and service role keys redacted from error objects, logs, and serialized reports | `hosted-probe-runner.mjs:144-260` (`redactSensitiveFields`), `262-310` (`sanitizeData`), `4260-4285` | Test 9 (R1-02), Test 21 (R1-04), Test 29 (R2-03), Test 83 (R11-02), Test 84 (R12-02), Test 85 (R13-02) | Offline validated; secrets cleared on verified cleanup, preserved in memory on failure for recovery |

### 7.15 Revision R13 Remediation Details

- **R13-01 — Verify Endpoint Session Minting & Canonical Capabilities (Codex P2, `PRRT_kwDOVtCmZc66vvkp`):**
  1. Identified that `BYPASS-03` calls `POST /auth/v1/verify`, which is capable of issuing tokens and minting server-side sessions on challenge success, but previously passed `canMintSession: false`.
  2. Fixed `BYPASS-03` to pass `canMintSession: true` to `observeAuthResponse` and registered pre-dispatch in-flight operation.
  3. Established fail-closed semantics across all outcome variants for `POST /auth/v1/verify`:
     - Unexpected success with tokens (HTTP 200) registers session for revocation in inventory and fails the probe (`passed: false`).
     - HTTP 200 with truncated, unreadable, or empty body `{}` classifies as `AUTH_RESPONSE_INDETERMINATE`, registers untracked session risk, and fails cleanup closed.
     - Post-dispatch connection reset (`ECONNRESET`) or network error classifies as `AUTH_RESPONSE_INDETERMINATE`, registers untracked session risk, and fails cleanup closed.
     - Expected rejection (HTTP 400 `otp_expired` or hook rejection 42501) cleanly passes or flags precondition missing without session leakage.
  4. Built and exported `AUTH_ENDPOINT_CAPABILITIES` matrix across all Auth endpoints:
     - `POST /auth/v1/otp`: `canMintSession: false`, `canCreateUsers: true`, `canTriggerEmail: true`
     - `POST /auth/v1/signup`: `canMintSession: false`, `canCreateUsers: true`, `canTriggerEmail: true`
     - `POST /auth/v1/verify`: `canMintSession: true`, `canModifyProviderState: true`
     - `POST /auth/v1/recover`: `canMintSession: false`, `canTriggerEmail: true`
     - `POST /auth/v1/token?grant_type=password`: `canMintSession: true`
     - `POST /auth/v1/token?grant_type=refresh_token`: `canMintSession: true`
     - `POST /auth/v1/token?grant_type=password (verifyUserCredentials)`: `canMintSession: true`
     - `PUT /auth/v1/admin/users/:id`: `canMintSession: false`, `canModifyProviderState: true`
     - `POST /auth/v1/logout?scope=local`: `canMintSession: false`, `canModifyProviderState: true`

- **R13-02 — In-Flight Operation Lifecycle & Timeout-Safe Cleanup (Codex P2, `PRRT_kwDOVtCmZc66vvky`):**
  1. Root cause: When `runHostedProbeRunner` timed out (e.g. 5ms), `controller.abort()` was called, but if the dispatcher was still awaiting a delayed response body (e.g. 20ms), cleanup ran while the inventory was empty and reported false `CLEANUP_VERIFIED_SUCCESS`. 15ms later the dispatcher rejected/observed an indeterminate session, but cleanup had already finalized and exited.
  2. Implemented an explicit in-flight operation lifecycle:
     - States: `REGISTERED` -> `IN_FLIGHT` -> `SETTLED` | `TIMED_OUT_UNRESOLVED` -> `CLEANUP_REQUIRED` -> `CLEANUP_VERIFIED` | `RESIDUAL_RISK`.
     - In `TestRunInventory`: added `inFlightOperations` (Map), `_opSequence`, `finalized`, `postFinalizationMutations`, `_settlementListeners`.
     - Methods: `registerInFlightOperation`, `settleInFlightOperation`, `markProbeOperationsTimedOut`, `hasUnresolvedOperations`, `getUnresolvedOperations`, `awaitInFlightSettlement(timeoutMs)`, `finalize()`, `isClean()`.
  3. Pre-dispatch registration: every session-minting Auth dispatch is registered as `IN_FLIGHT` before network requests begin.
  4. Immediate timeout risk capture: `markProbeOperationsTimedOut` transitions in-flight ops to `TIMED_OUT_UNRESOLVED` and immediately calls `registerUntrackedSession()` for any operation with `canMintSession: true`.
  5. Bounded grace wait: `awaitInFlightSettlement(Math.min(probeTimeoutMs, 100))` in `performCleanup()` and `executeCleanup()` provides a bounded window for in-flight requests to settle before auditing cleanup items.
  6. Finalization immutability: calling `finalize()` permanently locks the inventory. Any subsequent attempt to mutate the inventory (`registerSession`, `registerUntrackedSession`, `registerCreatedUser`, `registerSeedPasswordModification`, `settleInFlightOperation`) is captured in `postFinalizationMutations`. Late provider responses cannot silently flip or corrupt a finalized cleanup report.
  7. Mandatory reproduction test passing: 5ms probe timeout with 20ms delayed response body cannot return `CLEANUP_VERIFIED_SUCCESS`, fails closed with `CLEANUP_FAILED_RESIDUAL_RESOURCES`.
  8. Added comprehensive regression Test 85 with 17 offline regression scenarios.

### 7.16 Revision R14 Remediation Details

- **R14-01 — Block Cleanup Success for Unresolved Password Mutations (Codex P2, `PRRT_kwDOVtCmZc663HvN`):**
  1. Identified that when `SESSION-02` issued an Admin password update (`PUT /auth/v1/admin/users/:id`), previously an unresolved operation was ignored during cleanup because `canMintSession === false`. Cleanup then called `updateUserById` to restore the original password and reported `CLEANUP_VERIFIED_SUCCESS`, while a delayed `PUT` request could commit afterwards and overwrite the restored password.
  2. Classified `PUT /auth/v1/admin/users/:id` in `AUTH_ENDPOINT_CAPABILITIES` as state-mutating: `canModifyProviderState: true`, `requiresCleanupReconciliation: true`, `canMintSession: false`, `canCreateUser: false`.
  3. Pre-dispatch in-flight operation registration: `createHostedDispatcher` registers operation with `canModifyProviderState: true`, `requiresCleanupReconciliation: true`, and `targetUserId: String(userId)` before network dispatch. Password values are never exposed in logs or operation metadata.
  4. Abort and timeout safety: on timeout or AbortController abort, the operation is transitioned to `TIMED_OUT_UNRESOLVED` and never assumed to have rolled back server-side.
  5. Audit in `executeCleanup`: Step 0C flags unresolved provider mutations (`unresolved_provider_mutation`) in `residualResources`. Step 6 specifically checks if any unresolved operation targets `item.userId`: if an unresolved mutation is pending, password restoration cannot be verified, `item.state` transitions to `'restoration_failed'`, `CONCURRENT_UNRESOLVED_PASSWORD_MUTATION` is recorded, and cleanup fails closed with `CLEANUP_FAILED_RESIDUAL_RESOURCES`.
  6. Late settlement immutability: any mutation settling post-finalization is recorded in `postFinalizationMutations` and cannot override a finalized cleanup failure report.

- **R14-02 — Retain Indeterminate User-Creation Obligations After Signup (Codex P2, `PRRT_kwDOVtCmZc663HvU`):**
  1. Identified that `BYPASS-02` calls `POST /auth/v1/signup`, which creates user records even when no session token is issued. Previously, `canMintSession: false` caused transport errors (`ECONNRESET`), timeouts, or unreadable bodies to be treated as generic provider failures, leaving the inventory empty and reporting false `CLEANUP_VERIFIED_SUCCESS` while an orphaned user was created on the provider.
  2. Classified `POST /auth/v1/signup` in `AUTH_ENDPOINT_CAPABILITIES` with `canCreateUser: true`, `canModifyProviderState: true`, `requiresCleanupReconciliation: true`, and `canMintSession: false`.
  3. Added `untrackedUsersCount` tracking and `registerUntrackedUser()` in `TestRunInventory`.
  4. In `createHostedDispatcher` for `BYPASS-02`: registered in-flight operation with `canCreateUser: true` before dispatch.
  5. In `observeAuthResponse`: on transport reset (`ECONNRESET`), unreadable JSON, or HTTP 200 without user ID, if `canCreateUser: true`, `inv.registerUntrackedUser()` is called and the response is classified as `AUTH_RESPONSE_INDETERMINATE`.
  6. Audit in `executeCleanup`: Step 0B records `unresolved_user_creation_risk` when `untrackedUsersCount > 0`, and Step 0C records `unresolved_user_creation` for unresolved in-flight ops with `canCreateUser: true`. Cleanup fails closed with `CLEANUP_FAILED_RESIDUAL_RESOURCES` and throws `CLEANUP_INCOMPLETE` under `failClosed: true`.
  7. Deletion safety boundary: only concrete user IDs observed as created this run are deletion-eligible. Pre-existing referenced and seed accounts are strictly preserved and never deleted based on email equality.
  8. Added comprehensive regression Test 86 with 11 offline regression scenarios.

### 7.17 Revision R15 Remediation Details

- **R15-01 — Track OTP User Creation on Lost/Unreadable Responses (Reviewer `im-tio` P2, `PRRT_kwDOVtCmZc66-adI`):**
  1. Identified that `BYPASS-01` (`POST /auth/v1/otp`) was passing only `canMintSession: false` to `observeAuthResponse` without an in-flight operation, despite `AUTH_ENDPOINT_CAPABILITIES['POST /auth/v1/otp']` declaring `canCreateUsers: true`. Per Supabase Auth documentation, OTP email sign-in can automatically sign up a user by default. If a transport error (`ECONNRESET`), timeout, empty HTTP 200 (`{}`), or unreadable body occurred, `observeAuthResponse` recorded zero untracked users, and cleanup returned false `CLEANUP_VERIFIED_SUCCESS` while leaving an untracked user on the server.
  2. In `createHostedDispatcher` for `case 'BYPASS-01':`:
     - Pre-registers an in-flight operation with `canCreateUser: true`, `canModifyProviderState: true`, `requiresCleanupReconciliation: true`, `canMintSession: false` before network dispatch.
     - Passes canonical capabilities into `observeAuthResponse`.
     - Settles in-flight operation upon response parsing.
     - Tracks concrete created user ID in `inv.registerCreatedUser(...)` for cleanup deletion by exact ID.
     - Returns explicit `user_created` and `indeterminate_user_creation` indicators in outcome.
  3. Fail-closed cleanup enforcement: transport error, request timeout, empty HTTP 200, or unreadable response on `BYPASS-01` increments `inv.untrackedUsersCount` and blocks cleanup success with `unresolved_user_creation_risk` / `unresolved_user_creation`.
  4. Anti-deletion security boundary: pre-existing seed or referenced users are never registered into `createdUsers` and are strictly protected against deletion. Cleanup deletes only by exact ID of users created in the active run; deletion by email address is prohibited.

- **R15-02 — Eliminate Capability Matrix / Dispatcher Drift (`im-tio` R15 Guidance):**
  1. Standardized all 9 entries in `AUTH_ENDPOINT_CAPABILITIES` with consistent boolean properties: `canMintSession`, `canCreateUser`, `canCreateUsers` (backward-compatible alias), `canModifyProviderState`, `requiresCleanupReconciliation`, `canTriggerEmail`.
  2. Exported `getEndpointCapabilities(endpointOrProbeId)` helper that resolves canonical capabilities by endpoint key or probe ID.
  3. Synchronized all dispatchers in `createHostedDispatcher` (`BYPASS-01`, `BYPASS-02`, `BYPASS-03`, `BYPASS-05`, `HOOK-01`, `HOOK-02`, `SESSION-02`), `verifyUserCredentials`, and runner-level operations in `runHostedProbeRunner` to resolve capabilities via `getEndpointCapabilities`.
  4. Added comprehensive regression Test 87 covering 13 adversarial scenarios, capability consistency, and anti-deletion protections.

- **R15-03 — PostgreSQL Parity Container Startup Socket Timing Race Hardening:**
  1. Root cause: In official `postgres:17` containers, `pg_isready` initially succeeds on the temporary bootstrap server before `docker-entrypoint.sh` executes fast shutdown and starts the permanent daemon. In container CI runners, this caused transient `connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: No such file or directory` in `verifyRoleGrantsAndRevocations`.
  2. In `verifyParityMatrix`: readiness check now verifies both `pg_isready` and the permanent server daemon startup confirmation (`PostgreSQL init process complete; ready for start up`) from `docker logs`.
  3. In `verifyRoleGrantsAndRevocations`: added a 10-attempt retry loop with 500ms delay to absorb any transient socket recreation delay.
  4. In `executePostgresCase`: added a 5-attempt retry loop with 300ms delay for query execution resilience.

---

## 7.18 Revision R16 Remediation Details (Signup Session Tracking & Proven User Ownership Closure)

- **R16-01 — Correct Signup Session-Minting Classification (Reviewer `im-tio` P2, `PRRT_kwDOVtCmZc66_0zA`):**
  1. Root cause: `AUTH_ENDPOINT_CAPABILITIES['POST /auth/v1/signup']` declared `canMintSession: false`. In Supabase GoTrue, when email confirmation is disabled, `POST /auth/v1/signup` returns `{ user, session }` containing active access and refresh tokens. A response containing tokens could escape untracked-session accounting if the session ID was unextractable or missing. Furthermore, deleting an Auth user does not invalidate already-issued stateless JWTs before expiration.
  2. Canonical Capability Update:
     - Set `AUTH_ENDPOINT_CAPABILITIES['POST /auth/v1/signup'].canMintSession = true`.
     - Preserved independent `canCreateUser: true`, `canModifyProviderState: true`, `requiresCleanupReconciliation: true`.
     - Updated cleanup obligations and indeterminate behavior documentation.
  3. Pre-dispatch & In-Flight Tracking:
     - Propagated `canMintSession: true` into `BYPASS-02` in-flight operations.
     - On successful token issuance with valid `session_id`: observed session is registered into `inv.trackedSessions` for cleanup revocation before validating probe outcome.
     - Token present but `session_id` missing / malformed JWT: registers untracked session obligation via `inv.registerUntrackedSession()` and classifies response as `AUTH_RESPONSE_INDETERMINATE`.
     - HTTP 200 returning `{}` or unreadable body: registers both untracked user AND untracked session obligations.
     - HTTP 200 returning user ID without tokens (e.g. email confirmation enabled): registers observed user with unproven ownership (`unverifiedUsers`), does NOT register untracked session.
     - Transport loss (`ECONNRESET`, timeout): retains both untracked user and untracked session residual risks.
     - User deletion does not satisfy token revocation: only provider-observed session invalidation or verified expiration satisfies session cleanup. Cleanup cannot report `CLEANUP_VERIFIED_SUCCESS` while untracked session remains.

- **R16-02 — Proven Run-Created User Ownership before Deletion (Reviewer `im-tio` P2, `PRRT_kwDOVtCmZc66_0zI`):**
  1. Root cause: Unexpected user IDs observed in negative probes (`BYPASS-01`, `BYPASS-02`) were previously registered into `createdUsers` and passed to `adminClient.deleteUser()`. Merely observing a user ID from an unexpected response does NOT prove that the current run created that user. Deleting it could destroy a pre-existing fixture or seed user on the testbed.
  2. Ownership Classification Hierarchy:
     - Introduced `USER_OWNERSHIP` enum: `PRE_EXISTING_REFERENCED`, `RUN_CREATED_VERIFIED`, `CREATION_INDETERMINATE`, `OWNERSHIP_UNKNOWN`.
     - Only `RUN_CREATED_VERIFIED` with affirmative `creationProof` is eligible for destructive `adminClient.deleteUser()`.
  3. Creation Proof Verification:
     - Added `isValidCreationProof(proof)` enforcing trusted proof types (`before_after_check`, `provider_admin_create`, `baseline_set_difference`).
     - Strictly rejects caller metadata flags alone (e.g. `{ isCreated: true }`).
     - Added `createCreationProof(type, details)`.
  4. Seed Identity Protection & Anti-Deletion Guard:
     - Seed identities are protected upfront via `inv.protectSeedIdentity({ id, email })` before negative probes dispatch.
     - In `createHostedDispatcher`: protected seed identity is preserved across all dispatcher calls; per-probe testUser is not mistakenly classified as seed unless explicitly matching the configured seed.
     - In `observeAuthResponse`: response user IDs matching protected seed ID or seed email are registered as `PRE_EXISTING_REFERENCED` and never deleted.
     - Unexpected user IDs without affirmative creation proof are registered via `inv.registerObservedUser` with `OWNERSHIP_UNKNOWN` in `inv.unverifiedUsers`.
     - Preserved without deletion: cleanup audits `unverifiedUsers`, pushes `UNRESOLVED_USER_OWNERSHIP` residual resources, and fails closed (`CLEANUP_FAILED_RESIDUAL_RESOURCES`).
     - Re-enforced in `executeCleanup`: Step 4 verifies `getUserOwnership === RUN_CREATED_VERIFIED`, `!isSeedIdentity`, and `isValidCreationProof` immediately before calling `adminClient.deleteUser()`. Refuses deletion with `SECURITY_BOUNDARY_VIOLATION` if unverified.
  5. Added comprehensive Test 88 covering all 17 adversarial scenarios from Section 3, Section 4, and Section 6.

### Shared Auth Endpoint Capability & User Ownership Matrix

| Operation | Can create user | Can mint session | Required ownership evidence | Cleanup obligation |
|---|---|---|---|---|
| OTP (`POST /auth/v1/otp`) | Yes (`BYPASS-01`) | No (challenge dispatch only) | Verified run creation (`RUN_CREATED_VERIFIED` with affirmative proof) | User risk tracking on timeout/transport failure; unproven user preserved |
| Signup (`POST /auth/v1/signup`) | Yes (`BYPASS-02`) | Yes (if email confirm disabled) | Verified run creation (`RUN_CREATED_VERIFIED` with affirmative proof) | User and session risk tracking; unproven user preserved; session revoked |
| Verify (`POST /auth/v1/verify`) | No (`BYPASS-03`) | Yes (challenge completion) | N/A (user pre-exists) | Session cleanup; indeterminate 200/transport loss creates untracked session risk |
| Password grant (`POST /auth/v1/token?grant_type=password`) | No (`HOOK-01`) | Yes (token issuance) | N/A (existing user reference) | Immediate session tracking and GoTrue sign-out revocation |
| Token refresh (`POST /auth/v1/token?grant_type=refresh_token`) | No (`HOOK-02`) | Yes (token refresh) | N/A (existing user reference) | Immediate session tracking and GoTrue sign-out revocation |
| Password recovery (`POST /auth/v1/recover`) | No (`BYPASS-05`) | No (email dispatch only) | N/A (recovery challenge) | Send Email Hook suppression verification |
| Admin update (`PUT /auth/v1/admin/users/:id`) | No (`SESSION-02`) | No (state mutation) | N/A (existing seed user) | Pre-dispatch password restoration tracking |

---

## 7.19 Revision R17 Remediation Details (Seed Identity Proof, Unexpected Token Tracking & Verified Revocation Evidence Closure)

- **R17-01 — Universal Token Tracking Regardless of Endpoint Capabilities (Reviewer `chatgpt-codex-connector` P2, `PRRT_kwDOVtCmZc67OhSH`):**
  1. Root cause: In `observeAuthResponse`, Section 3C was gated by `if (canMintSession && accessToken && !rawSessionId)`. When nominally non-minting endpoints (e.g. `BYPASS-01` `/auth/v1/otp`, `BYPASS-05` `/auth/v1/recover`) unexpectedly returned tokens on HTTP 200 without extractable session ID, `canMintSession: false` caused Section 3C to be skipped. In Section 3D, missing session ID resulted in neither a tracked session nor an untracked session obligation being registered. Consequently, the probe failed on the unexpected token, but `executeCleanup` recorded zero sessions and reported false `CLEANUP_VERIFIED_SUCCESS`.
  2. In `observeAuthResponse`:
     - Updated Section 3C: `if (hasTokens && !rawSessionId)`. Endpoint capability assumptions must NEVER suppress actual observed token evidence. If ANY token (access or refresh) is present but session ID cannot be determined, an untracked session obligation is immediately registered (`inv.registerUntrackedSession()`) and classified as `AUTH_RESPONSE_INDETERMINATE` with `indeterminateSession: true` and `errorCode: 'UNTRACKED_SESSION'`, regardless of `canMintSession`.
     - In Section 3D: since unextractable tokens are caught by Section 3C, any token reaching Section 3D is guaranteed to have extractable `rawSessionId`, which is registered into `inv.registerSession`.
  3. In `observeAndTrackSessionTokens`:
     - Ensures that any token present without extractable session ID records untracked session obligation (`else { inv.registerUntrackedSession(); }`), ensuring cleanup fails closed.

- **R17-02 — Require Verified Revocation Before Reporting Stateless Linger (Reviewer `chatgpt-codex-connector` P2, `PRRT_kwDOVtCmZc67OhSN`):**
  1. Root cause: In `createHostedDispatcher`, `SESSION-04` (PostgREST) and `SESSION-05` (Storage) only checked token expiration, 300s lifetime bound, and HTTP 200. When dispatched standalone on a fresh context (`preInvalidationSessionValid: false`, `passwordResetCompleted: false`), fresh unrevoked tokens produced `passed: true` and claimed stateless linger evidence, violating the prerequisite defined in `preflight-evaluator.mjs` ("Revoked bearer token against public table / storage object").
  2. In `createTestExecutionContext`:
     - Added `sessionRevocationConfirmed`, `revokedSessionId`, `revokedAccessToken` properties (and reset in `clear()`).
  3. In `case 'SESSION-02':`:
     - When session revocation is verified (`isRevoked`), sets `ctx.sessionRevocationConfirmed = true`, `ctx.revokedSessionId = ctx.activeSessionId`, `ctx.revokedAccessToken = ctx.activeAccessToken`.
  4. In `case 'SESSION-04':` and `case 'SESSION-05':`:
     - Enforces prerequisite: `ctx?.preInvalidationSessionValid === true` (else returns `PREREQUISITE_MISSING: SESSION-04 requires authenticated pre-invalidation session baseline (HOOK-01)`).
     - Enforces prerequisite: `ctx?.passwordResetCompleted === true && ctx?.sessionRevocationConfirmed === true` (else returns `PREREQUISITE_MISSING: SESSION-04 requires verified session revocation evidence (SESSION-02)`).
     - Extracts `tokenSessionId` from JWT claims and correlates: `tokenSessionId && ctx?.revokedSessionId && tokenSessionId === ctx.revokedSessionId` (else fails closed with `SESSION_CORRELATION_FAILURE`).
     - Carries affirmative outcome fields: `revocation_verified: true`, `revoked_session_id`, `correlated_session_id`, `session_correlated: true`, `pre_invalidation_verified: true`.
  5. In `validateProbeOutcome()`:
     - For `SESSION-04` and `SESSION-05`, requires `rawOutcome.revocation_verified === true` (else fails with `MISSING_EVIDENCE`).
     - Requires `rawOutcome.session_correlated === true` and matching `correlated_session_id === revoked_session_id` (else fails with `SESSION_CORRELATION_FAILURE`).

- **R17-03 — Affirmative Seed Identity Proof & Orphaned-User / False-Cleanup Closure (Reviewer `im-tio` P2, `PRRT_kwDOVtCmZc67O5WW`):**
  1. Root cause: On every runner invocation, `testEmail` was automatically registered into `protectedSeedIdentities` by bare string email. If negative probes `BYPASS-01` (`/auth/v1/otp`) or `BYPASS-02` (`/signup`) unexpectedly created a user with that email and returned `{ user: { id: 'new-id', email: testEmail } }`, `observeAuthResponse` matched `isSeedIdentity(null, returnedEmail)` and misclassified the new ID as `PRE_EXISTING_REFERENCED` in `referencedUsers` rather than `unverifiedUsers`. The probe failed, but `executeCleanup` saw only referenced users, skipped residual user accounting, and returned false `CLEANUP_VERIFIED_SUCCESS` while the orphaned user survived on the provider.
  2. Pre-existence Proof Verification:
     - Added `isValidPreExistenceProof(proof)` enforcing trusted pre-existence proof types (`preflight_discovery`, `provider_lookup`, `seed_credential_verification`).
     - Strictly rejects bare caller flags (e.g. `{ isSeed: true }`).
     - Added `createPreExistenceProof(type, details)`.
  3. Strict Seed Identity Protection Contract:
     - In `TestRunInventory`: `protectSeedIdentity({ id, email, proof })` requires non-empty string `id`. A bare string `email` without verified user ID CANNOT confer protected seed status.
     - `isSeedIdentity(id, email)`: Requires non-empty string `id` that exists in `protectedSeedIdentities`. A bare email alone without matching ID never returns true.
     - In `createHostedDispatcher` and `runHostedProbeRunner`: removed automatic protection of unverified `testEmail` into seed protection; seed protection is registered ONLY when an affirmative `seedUserId` is provided.
  4. Response Classification & Fail-Closed Cleanup:
     - In `observeAuthResponse` and dispatchers: unexpected response user IDs are checked against `inv.isSeedIdentity(uidStr, returnedEmail)`. If `uidStr` does not match the verified seed user ID, it is classified as `USER_OWNERSHIP.OWNERSHIP_UNKNOWN` in `inv.unverifiedUsers`.
     - In `executeCleanup`: unproven users are PRESERVED without deletion (protecting potential testbed identity), and cleanup FAILS CLOSED with `CLEANUP_FAILED_RESIDUAL_RESOURCES` (`unverifiedUsers.size > 0`). Never returns false `CLEANUP_VERIFIED_SUCCESS`.
  5. Added comprehensive regression Test 89 covering all scenarios across R17-01, R17-02, and R17-03.

---

## 8. Verification Evidence Matrix

All verification checks were run locally and passed completely:

```bash
node --test experiments/task06i/hosted-probe-runner.test.mjs
# 93 passed, 0 failed, exit code 0 (including Tests 82, 83, 84, 85, 86, 87, 88, and 89)

node --test experiments/task06i/*.test.mjs
# 161 passed, 0 failed, exit code 0

node experiments/task06i/sql-contract-parity.mjs
# 18 cases evaluated (POSTGRES_VERIFIED in Linux CI with Docker; POSTGRES_NOT_EXECUTED offline without Docker)

node --test experiments/task06h/*.test.mjs
# 115 passed, 0 failed, exit code 0

npm run verify
# 22 shell contract tests passed, tokens/tsc/lint clean, exit code 0

git diff --check origin/main...HEAD
# Clean (exit code 0)
```

---

## 9. GitHub CI Status

- **Status:** **5/5 CHECKS PASS** on remote commit `237964d7c1fdf9d3c2dbf3391c7d59cae498744c`:
  1. `Attribution guard runner`: **PASS**
  2. `Commit attribution fixture tests`: **PASS**
  3. `Commit attribution guard` (App-owned required check ID `5032971`): **PASS**
  4. `PostgreSQL parity`: **PASS**
  5. `Task 06I Security Contract Tests`: **PASS**
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
- **Code readiness:** READY (Revision R17)
- **GitHub CI:** PASS (5/5 on remote HEAD `237964d`)
- **Independent review:** PENDING (`chatgpt-codex-connector`, `im-tio`)
- **Hosted testing:** NOT_AUTHORIZED
- **Production Auth:** STRICT NO-GO

**Decision:** **`BLOCKED_PENDING_ADDITIONAL_PREPARATION`**

> **Important:** Production Real Auth remains **STRICT NO-GO**. Local remediation for all outstanding review findings (`PRRT_kwDOVtCmZc67OhSH`, `PRRT_kwDOVtCmZc67OhSN`, `PRRT_kwDOVtCmZc67O5WW`) is complete and fully covered by offline regression tests (93/93 runner tests, 161/161 task06i tests pass). Decision remains strictly `BLOCKED_PENDING_ADDITIONAL_PREPARATION` because hosted preconditions (Management API PATCH, SQL hook installation, Edge Function deployment) require explicit owner authorization before any live execution. Awaiting independent re-review.
