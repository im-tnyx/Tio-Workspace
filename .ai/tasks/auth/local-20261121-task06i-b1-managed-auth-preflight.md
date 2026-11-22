# Phase 1.2 Task 06I-B1-R8 — Authorized Security CI Workflow Integration

> **Preflight Report & Test Plan (Revision R8 — Authorized Security CI Workflow Integration).** Prepared under `AGENTS.md` operating rules. This document authorizes local investigation, documentation, offline test preparation, and authorized workflow integration only. It does not authorize creating or modifying a hosted Supabase project. Production Real Auth remains **NO-GO**.

| Field | Value |
|---|---|
| Status | **PREFLIGHT COMPLETE (REVISION R8) — SECURITY CI WORKFLOW ADDED; AWAITING OWNER EXACT-SHA GUARD APPROVAL** |
| Objective | Add owner-authorized dedicated Security CI workflow (`.github/workflows/security-experiments.yml`) for `experiments/task06i/**`, verify all local test suites, push to PR #35, and prepare exact new HEAD SHA package for owner trusted guard approval |
| Implementation owner | Agent / Local Development & Security Research, Task 06I-B1-R8 slice |
| Previous agent | Agent / Task 06I-B1-R7 author |
| Last commit agent | `fe1056b3213d1576fc3eb61725b2393d00168a97` (Task 06I-B1-R7 commit on PR #35) |
| Tracking / approval | Task 06I-B1-R8 authorized by user prompt for workflow file addition; PR #35 active; owner mandates $0 cost and permanent immunity for `Tio-world`; hosted mutations strictly prohibited |
| Branch | `docs/task06i-b1-managed-auth-preflight` |
| Base SHA / inspected HEAD | `b7d4fda97979e734a85461e83bf119dbc1a9689c` (`main`, verified up to date with `origin/main`) |
| Platform and file scope | Documentation, `.ai/` context, isolated offline preflight test harnesses under `experiments/task06i/`, and dedicated CI workflow `.github/workflows/security-experiments.yml`; zero client Expo UI, production schema, or live Auth changes |
| Created / updated | 2026-11-22 |

---

## 1. Required Context & Git Baseline Verification

### Checklist & Reconciliation
- [x] [`AGENTS.md`](../../../AGENTS.md) read and operational constraints enforced (Hinglish response, read-only Git preflight, strictly bounded documentation/offline tests).
- [x] [Current pointer](../../current.md) inspected and reconciled.
- [x] Canonical documentation reconciled:
  - [`docs/04-AUTH-AND-SECURITY.md`](../../../docs/04-AUTH-AND-SECURITY.md) (strict Email → OTP → Password, provisional UUID lifecycle, server-owned eligibility, no-guest boundary, AUTH-12/17/22 invariants).
  - [`docs/27-OTP-FIRST-AUTH-LIFECYCLE.md`](../../../docs/27-OTP-FIRST-AUTH-LIFECYCLE.md) (lifecycle state transitions `UNVERIFIED` → `EMAIL_VERIFIED_PASSWORD_PENDING` → `PASSWORD_COMPLETE_PROFILE_PENDING` → `SERVER_ELIGIBLE`).
  - [`docs/08-TEST-PLAN.md`](../../../docs/08-TEST-PLAN.md) (P0 security test definitions for AUTH-12, AUTH-17, and AUTH-22).
  - Relevant Task 06H-E runtime evidence (`local-20261119-task06h-e-runtime-integration.md` — parallel verify race condition, 5-wrong cooldown bypass, and password mutation bypass empirically reproduced on GoTrue v2.197.0).
  - Task 06I-A architecture decision document (`local-20261120-task06i-a-strict-auth-architecture.md` — Section 4.2 Token Hook allowlist contract, Section 7 empirical gaps, Section 9 Stage 06I-B1 proof plan).
  - Relevant Task 06H-E runtime evidence (`local-20261119-task06h-e-runtime-integration.md` — parallel verify race condition, 5-wrong cooldown bypass, and password mutation bypass empirically reproduced on GoTrue v2.197.0).
  - Task 06I-A architecture decision document (`local-20261120-task06i-a-strict-auth-architecture.md` — Section 4.2 Token Hook allowlist contract, Section 7 empirical gaps, Section 9 Stage 06I-B1 proof plan).

### Live Git Baseline Evidence
Executed read-only Git commands on workspace `G:\projects\Tio-Workspace`:

```powershell
git status --short --branch
# Output: ## main...origin/main

git rev-parse HEAD
# Output: b7d4fda97979e734a85461e83bf119dbc1a9689c

git branch -vv
# Output: * main b7d4fda [origin/main] Merge pull request #34 from im-tnyx/docs/task06i-a-strict-auth-architecture

git log -5 --oneline
# Output:
# b7d4fda Merge pull request #34 from im-tnyx/docs/task06i-a-strict-auth-architecture
# 0255970 docs(auth): quarantine retention & LEASE-G acceptance contract closure (Task 06I-A-R17)
# 5c5c0f9 docs(auth): immutable operation completion & acceptance-test reconciliation (Task 06I-A-R16)
# ac41390 docs(auth): post-create identity quarantine & completion replay contract (Task 06I-A-R15)
# b258d1e docs(auth): deterministic lifecycle locking & durable collision reconciliation (Task 06I-A-R14)

git fetch origin
git rev-parse origin/main
# Output: b7d4fda97979e734a85461e83bf119dbc1a9689c
```

### Outdated References in `.ai/current.md`
Inspection of `.ai/current.md` identified the following stale references following the merge of PR #34:
1. **Line 7:** Lists PR #34 status as `OPEN / Ready for Review, draft=false`. **Correction:** PR #34 is now merged into `main` at `b7d4fda97979e734a85461e83bf119dbc1a9689c`.
2. **Line 8:** Lists Active Task as `Task 06I-A` on branch `docs/task06i-a-strict-auth-architecture`. **Correction:** Task 06I-A is merged; active task is now `Task 06I-B1` on branch `docs/task06i-b1-managed-auth-preflight`.
3. **Line 11:** Lists Verified merged `main` as `317b4d4793368e6a9a2907d504044e876acfaab0` (PR #33). **Correction:** Current verified merged `main` HEAD is `b7d4fda97979e734a85461e83bf119dbc1a9689c` (PR #34).
4. **Line 12:** Lists PR #34 as not included in completed PRs. **Correction:** PR #34 must be added to completed PRs list.

---

## 2. Security Boundaries & Invariant Baseline

The proposed architecture requires strict adherence to mandatory security invariants. Prior empirical findings from Task 06H-E confirm that native GoTrue v2.197.0 fails these boundaries:

| Security Invariant | Requirement Specification | Observed GoTrue v2.197.0 (06H-E Evidence) | Proposed Option B Resolution |
|---|---|---|---|
| **AUTH-12** (Atomic Single-Use OTP) | OTP redemption must be serialized and strictly single-use; parallel requests must issue exactly 1 session | **FAIL (BLOCKED)**: Concurrent verify requests (`batch-1`) both succeeded (200 OK) and issued 2 distinct sessions for a single OTP | Database-enforced Global Strict Lock Hierarchy in `private_auth.verify_otp_challenge`; challenge state atomically flipped to `consumed` under row lock |
| **AUTH-17** (Password Mutation Protection) | OTP/recovery sessions must never permit arbitrary direct password mutation via `PUT /auth/v1/user` without existing password | **FAIL (BLOCKED)**: OTP bearer session called `PUT /user` directly and overwrote user password with 200 OK without providing old password | Custom Access Token Hook fails closed on non-password `authentication_method`; password update handled exclusively server-side via Edge Function Admin API |
| **AUTH-22** (Five-Wrong Cooldown) | 5 consecutive incorrect OTP attempts on an active challenge must lock identity for 15 minutes | **FAIL (BLOCKED)**: 5 wrong attempts returned 403, but entering valid OTP immediately afterwards succeeded (cooldown bypass) | Authoritative `challenge_cooldown_ledger` tracking failures across challenges; returns `cooldown_active` for 15 minutes |
| **Purpose Isolation** | Signup OTP, Login, and Recovery OTP must remain cryptographically and operationally isolated | **FAIL (FINDING)**: Recovery OTP could be redeemed as `type: 'email'` or `type: 'magiclink'` | Server-owned purpose binding (`signup_initial_password` vs `recovery_password_reset`) in PostgreSQL schema; native verify endpoints blocked |
| **Re-enrollment Prevention** | Existing password-complete accounts must never be re-enrolled through Sign Up | Potential account overwrite if native signup endpoints remain open | Server-side lifecycle state machine rejects existing accounts with generic anti-enumeration response |
| **Authorization Authority** | Zero client-controlled eligibility or authorization flags | Client claims must never be trusted | Server-owned `identity_lifecycle` table in PostgreSQL; client metadata ignored |

> [!WARNING]
> No claim is made that these native GoTrue security failures are resolved out of the box in managed Supabase Auth. The purpose of Stage 06I-B is to determine whether provider-level controls (Management API settings + Auth Hooks) can close these bypass attack routes.

---

## 3. Read-Only Provider Capability Findings

Analysis was conducted using Supabase CLI v2.121.0, current official documentation, and Management API specifications:

### 1. Disabling Native Email OTP & Magic Link Endpoints
- **Documented Mechanism:** Supabase Management API `PATCH /v1/projects/{ref}/config/auth` supports:
  ```json
  { "external_email_magic_link_disabled": true }
  ```
- **Observed Local (06H):** Setting `GOTRUE_EXTERNAL_EMAIL_MAGIC_LINK_ENABLED=false` causes `/auth/v1/otp` and `/auth/v1/magiclink` to return HTTP `422 Unprocessable Entity (email_provider_disabled)`.
- **Managed Hosted Status:** Documented in Studio UI and Management API. **Empirical hosted verification status:** `NOT TESTED` (requires probe against a disposable project).

### 2. Disabling Direct Native Signup
- **Documented Mechanism:** Supabase Management API `PATCH /v1/projects/{ref}/config/auth` supports:
  ```json
  { "disable_signup": true }
  ```
- **Documented Behavior:** Setting `disable_signup = true` causes direct public `POST /auth/v1/signup` requests to be rejected with HTTP `422 Unprocessable Entity (signup_disabled)`.
- **Managed Hosted Status:** Documented standard feature. **Empirical hosted verification status:** `NOT TESTED`.

### 3. Intercepting Native Password Recovery via Send Email Hook
- **Documented Mechanism:** Supabase Auth Send Email Hook allows routing outgoing authentication emails to a custom PostgreSQL function or HTTPS webhook instead of built-in SMTP.
- **Handling of Recovery:** When `POST /auth/v1/recover` is invoked, Supabase generates the token/hash and emits an event with `email_action_type = "recovery"`.
- **SQL Hook Exception Contract:** In `private_auth.send_email_hook`, any event with `email_action_type = 'recovery'` raises an unhandled exception with SQLSTATE `42501` (`send_email_hook: native recovery email dispatch suppressed by security policy`).
- **Endpoint Reachability vs HTTP Response Status Separation:**
  1. *Public Endpoint Reachability:* The public HTTP route `POST /auth/v1/recover` remains accessible at the gateway and cannot be globally disabled via Supabase Auth configuration flags alone (unlike `disable_signup = true`).
  2. *SQL Hook Exception Behavior:* The proposed `send_email_hook` intercepts `email_action_type = 'recovery'` and raises an unhandled SQL exception (`RAISE EXCEPTION ... USING ERRCODE = '42501'`) to suppress native recovery email dispatch.
  3. *Expected HTTP Response Behaviors:* Depending on GoTrue version, error-handling mode, and anti-enumeration configuration, GoTrue may surface an explicit fail-closed HTTP error (e.g. HTTP `500 Internal Server Error / Error invoking email hook`) or absorb the hook exception into a generic response (such as HTTP `200 OK` for anti-enumeration). An HTTP 200 response is therefore documented only as a potential anti-enumeration provider behavior, not an assertion that recovery succeeded or that a token was delivered.
  4. *Hosted-Unverified Behavior:* The exact HTTP status code returned by managed Supabase Cloud when `send_email_hook` raises SQLSTATE `42501` remains **DOCUMENTED PROVIDER BEHAVIOR / HOSTED UNVERIFIED / NOT TESTED**.
  5. *Required Security Outcome:* Regardless of whether GoTrue returns HTTP 500 or absorbs the exception into HTTP 200, the mandatory security invariant is that **zero usable unauthorized recovery tokens or emails reach external networks or users**. Furthermore, if a recovery token were ever somehow minted or intercepted, secondary defense relies on the Custom Access Token Hook strictly rejecting recovery AMR methods on redemption.
- **Managed Hosted Status:** Schema contract verified offline; hosted execution status: `NOT TESTED`.

### 4. Custom Access Token Hook Architecture & Fail-Closed Behavior
- **Documented Event Signature:** Official Supabase contract passes `event JSONB` with three top-level keys:
  - `user_id` (UUID string)
  - `authentication_method` (string: `'password'`, `'token_refresh'`, `'otp'`, `'recovery'`, `'magiclink'`, `'anonymous'`, etc.)
  - `claims` (JSONB object containing standard JWT claims including `amr`)
- **Fail-Closed Execution (Design Target vs Evidence Classification):**
  - **Documented Provider Behavior / Design Target:** Official Supabase documentation and community reports specify that when the Postgres hook function raises an unhandled exception (e.g. `RAISE EXCEPTION ... USING ERRCODE = '42501'`), GoTrue aborts the authentication transaction, returns HTTP `500 Internal Server Error (AuthApiError: Error invoking access token hook)` to the client, and issues **zero JWT access token or session**.
  - **Local GoTrue Runtime Evidence:** Hook rejection aborting token issuance was empirically verified against local Docker GoTrue in Task 06D/06H.
  - **Offline JavaScript Contract Tests:** Evaluator contract (`experiments/task06i/hook-allowlist-contract.test.mjs`) verifies schema input parsing, RFC 8176 AMR traversal, and fail-closed error throwing offline (52/52 unit tests pass).
  - **Hosted Unverified Status:** Whether managed Supabase Cloud reliably aborts token issuance on hook exception under all conditions (including function timeouts, network latency, or malformed JSON payloads) without failing open or falling back is **DOCUMENTED PROVIDER BEHAVIOR / HOSTED UNVERIFIED / NOT TESTED**. An unhandled Custom Access Token Hook exception is **NOT** independently proven to prevent hosted JWT issuance until empirical verification is completed on managed Supabase Cloud.
  - **Mandatory Future Acceptance Target:** Zero access tokens or sessions issued when the hook function raises an unhandled exception or times out on managed Supabase Cloud.
- **Managed Hosted Status:** Schema contract verified offline (16/16 tests pass); hosted execution status: `NOT TESTED`.

### 5. Strict RFC 8176 `amr[*].method` Traversal
- **RFC 8176 Standard:** Authentication Methods References (AMR) in Supabase Auth are structured as an array of JSON objects: `[{"method": "password", "timestamp": 1700000000}]`.
- **Hook Traversal Requirement:**
  - Initial sign-in: Requires `authentication_method = 'password'` AND `claims->'amr'` contains `method = 'password'` with zero disallowed methods.
  - Session refresh: Requires `authentication_method = 'token_refresh'` AND `claims->'amr'` contains `method = 'password'` with zero disallowed methods (`'otp'`, `'recovery'`, `'magiclink'`, `'anonymous'`, etc.).
  - Rejection of Mixed AMR: If an attacker combines password with an OTP claim, the hook inspects all array elements and rejects mixed claims.
- **Hosted Gap / Blocker:** It must be empirically proven whether managed Supabase Cloud reliably preserves and transmits the RFC 8176 object-array AMR during token refresh events without omitting or mutating the array.

### 6. Hook Execution Privileges (`supabase_auth_admin`)
- **Required Grants:**
  ```sql
  GRANT USAGE ON SCHEMA private_auth TO supabase_auth_admin;
  GRANT EXECUTE ON FUNCTION private_auth.custom_access_token_hook(jsonb) TO supabase_auth_admin;
  REVOKE ALL ON FUNCTION private_auth.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
  ```
- **Security Hardening:** The hook must enforce `SECURITY DEFINER` and `SET search_path = ''` to prevent search path hijacking.

### 7. Server-Controlled Session Revocation & Password Mutation Protection
- **Session Revocation:** When an administrator updates a user's password via Admin API (`supabase.auth.admin.updateUserById(userId, { password: newPassword })`), GoTrue invalidates existing sessions in `auth.sessions`.
- **Direct `/auth/v1/user` Impact:** Subsequent requests to `GET /auth/v1/user` or `PUT /auth/v1/user` using the previous access token immediately return `403 Forbidden (session_not_found)`.

### 8. Multi-Consumer JWT Cutover Behavior (Linger Window & Revocation Scope)
- **GoTrue / Auth API:** Validates session state against the database (`auth.sessions`) on every `/user` request. When an admin updates a user's password or revokes a session, revocation is instantaneous (`403/session_not_found`).
- **PostgREST (Data API):** PostgREST statelessly verifies JWT signatures using `JWT_SECRET` without querying `auth.sessions` per request. Therefore, PostgREST continues to accept a revoked JWT for the duration of its residual validity window until expiration (`exp`).
- **Storage API:** Similar to PostgREST, Storage validates claims and signatures statelessly without database round-trips.
- **Edge Functions:** When an Edge Function calls `supabase.auth.getUser()`, GoTrue is queried, resulting in immediate 403 rejection. However, if an Edge Function merely inspects the JWT payload without invoking `auth.getUser()`, it behaves statelessly.
- **Residual JWT Validity & Server-Side Authorization:** To prevent lingering tokens from accessing protected resources:
  1. **Short JWT Lifetime:** Configure `"jwt_exp": 300` (5 minutes) so the stateless residual validity window is strictly bounded.
  2. **Server-Side Authorization:** Privileged data operations must enforce server-side validation (e.g. Edge Functions querying `auth.getUser()` or RLS policies checking server-side session tables) rather than relying solely on stateless JWT signature validity.
  3. **Signing-Key Rotation Clarification:** Rotating `JWT_SECRET` is an **exceptional / emergency cutover action** (e.g. following a credential leak or global cutover) because it globally invalidates sessions for 100% of users across the project. It is **NOT** a routine requirement for normal user logout or individual session revocation.
  4. **Device-Local Data Invariant & Verification Scope:** Tio's architectural design (ADR-011 / ADR-017) specifies that personal workout data and history are stored exclusively in on-device SQLite, isolated from remote PostgREST. While this design targets complete data immunity from remote JWT lingering windows, **this local SQLite/SQLCipher implementation is not yet written or verified in code** (the repository currently contains only an Expo mock shell). Therefore, full local data immunity cannot be asserted as verified runtime evidence until native SQLite storage is implemented and validated.

---

## 4. Disposable Hosted Experiment Gate & Account Quota Audit

### Live Account Quota Inspection
Executed read-only query using Supabase CLI v2.121.0:

```powershell
& G:\dev\supabase-cli\v2.121.0\supabase.exe projects list --output-format json
```

**Observed Account Projects (Organization `llmbrmxhyirtoqndazpg` / "Tio-tnyx"):**
1. Project ID: `oykupyiitspujzpwwvuj` | Name: `Tio-world` | Region: `ap-south-1` | Status: `ACTIVE_HEALTHY` | Created: 2026-08-14
2. Project ID: `bsfwzvgynwriswapxpsp` | Name: `Tio-Tnyx` (Production) | Region: `ap-south-1` | Status: `ACTIVE_HEALTHY` | Created: 2026-11-14

### Quota Rules, Owner Policy & Financial Impact
- **Active Projects Count:** 2 active projects reported by Supabase CLI.
- **Supabase Free Tier Quota Rule:** Supabase allows a maximum of **2 active Free-tier projects** per account/organization. **Paused Free projects do not consume active-project quota slots**.
- **Available Active Slots:** Exactly **0 active Free project slots** are currently available.
- **Owner's Explicit Decision & Invariants:**
  1. **Strict $0 / Free Cost Policy:** The owner explicitly mandated: *"dicijan mera free cost par kaam"* (work strictly on free tier, zero spending). No paid plan, Pro upgrade ($25/mo), or spending is approved.
  2. **`Tio-world` Strict Off-Limits Policy:** The owner explicitly ruled: *"tio-world nahi chhedna h"* (`Tio-world` must not be paused, deleted, or modified). `Tio-world` remains strictly READ-ONLY and untouched.
  3. **Testing Project Lifecycle Strategy:** For future testing (if authorized by owner), the existing project (`bsfwzvgynwriswapxpsp`) would serve as the testing project at $0 cost; prior to final production, it could be deleted and regenerated cleanly.
  4. **Current Preflight Mandate:** For Task 06I-B1-R1, **zero hosted testing is authorized**. Both `bsfwzvgynwriswapxpsp` and `oykupyiitspujzpwwvuj` remain strictly **READ-ONLY**.

### Hard Stop Condition
```
[STOP GATE]
Zero hosted actions are authorized by this preflight prompt.
- Do NOT provision project 'tio-auth-proof-disposable'.
- Do NOT execute Management API PATCH requests.
- Do NOT deploy SQL migrations or hooks to hosted projects.
- Do NOT dispatch test emails.
- Production project 'bsfwzvgynwriswapxpsp' and 'Tio-world' remain STRICTLY READ-ONLY and untouched.
```

---

## 5. Security Threat & Hosted Test Matrix (18 Requirements)

The following reproducible test matrix defines the 18 security requirements across 3 functional categories. Expected responses are drawn from the Task 06I-A contract:

| Case ID | Category | Target / Vector | Expected Response (Contract) | Hosted Status | Precondition / Prerequisite |
|---|---|---|---|---|---|
| **BYPASS-01** | Native Bypass | `POST /auth/v1/otp` (email OTP) | `422 Unprocessable Entity (email_provider_disabled)` | **NOT TESTED** | `external_email_magic_link_disabled: true` |
| **BYPASS-02** | Native Bypass | `POST /auth/v1/signup` (direct signup) | `422 Unprocessable Entity (signup_disabled)` | **NOT TESTED** | `disable_signup: true` |
| **BYPASS-03** | Native Bypass | `POST /auth/v1/verify` (type email / recovery) | `500 Error invoking access token hook` (0 token issued) | **NOT TESTED** | Custom Access Token Hook deployed to `private_auth` schema and registered/enabled via `hook_custom_access_token_enabled` |
| **BYPASS-04** | Native Bypass | Magic Link, Invite & Anonymous endpoints | `500 Error invoking access token hook` (0 token issued) | **NOT TESTED** | Custom Access Token Hook deployed and registered/enabled via `hook_custom_access_token_enabled` |
| **BYPASS-05** | Native Bypass | `POST /auth/v1/recover` (password recovery) | HTTP `500 Error invoking email hook` (or generic anti-enumeration response; zero recovery token delivered; Hosted Unverified) | **NOT TESTED** | Send Email Hook deployed to `private_auth` schema and registered/enabled via `hook_send_email_enabled` |
| **HOOK-01** | Token Hook | Legitimate Password Sign-In | `200 OK` with valid JWT (`amr: [{method: "password"}]`, root `claims.amr_authenticated = 'true'`) | **NOT TESTED** | Test user enrolled with password; Hook deployed and registered |
| **HOOK-02** | Token Hook | Legitimate Password Token Refresh | `200 OK` with refreshed JWT (`amr: [{method: "password"}]`) | **NOT TESTED** | Active password session; Hook deployed and registered |
| **HOOK-03** | Token Hook | OTP-Origin Token Refresh | `500 Error invoking access token hook` (SQLSTATE `42501`) | **NOT TESTED** | Simulated OTP session; Hook deployed and registered |
| **HOOK-04** | Token Hook | Recovery-Origin Token Refresh | `500 Error invoking access token hook` (SQLSTATE `42501`) | **NOT TESTED** | Simulated recovery session; Hook deployed and registered |
| **HOOK-05** | Token Hook | Mixed AMR (`password` + unauthorized) | `500 Error invoking access token hook` (SQLSTATE `42501`) | **NOT TESTED** | Simulated mixed AMR payload; Hook deployed and registered |
| **HOOK-06** | Token Hook | Missing / Malformed AMR (string array, empty) | `500 Error invoking access token hook` (SQLSTATE `42501`) | **NOT TESTED** | Malformed AMR payload; Hook deployed and registered |
| **HOOK-07** | Token Hook | Fail-Closed on Hook Exception / Error | `500 Error invoking access token hook` (transaction aborted) | **NOT TESTED** | Hook deployed and registered; syntax/runtime error injection |
| **SESSION-01**| Session & Consumer | Password Session Creation | Row created in `auth.sessions` with user ID | **NOT TESTED** | Successful password login |
| **SESSION-02**| Session & Consumer | Server-Side Password Reset | All active sessions removed/revoked from `auth.sessions` | **NOT TESTED** | Admin API `admin.updateUserById` call |
| **SESSION-03**| Session & Consumer | `GET/PUT /auth/v1/user` with Revoked Token | `403 Forbidden (session_not_found)` | **NOT TESTED** | Session revoked via Admin API |
| **SESSION-04**| Session & Consumer | PostgREST Data API with Revoked Token | Documented behavior: accepted until `exp`; bounded by short `jwt_exp` (300s); key rotation is non-routine emergency measure | **NOT TESTED** | PostgREST probe with revoked JWT |
| **SESSION-05**| Session & Consumer | Storage API with Revoked Token | Documented behavior: accepted until `exp`; bounded by short `jwt_exp` (300s); server-side authorization required for immediate revocation | **NOT TESTED** | Storage object probe with revoked JWT |
| **SESSION-06**| Session & Consumer | Edge Function `auth.getUser()` with Revoked Token | `403 Forbidden / AuthSessionMissingError` | **NOT TESTED** | Edge Function probe with revoked JWT |

---

## 6. Offline Test Harness Evidence & Evidence Classification

To ensure deterministic verification of the provider hook contract before any hosted experiment, isolated offline evaluators were implemented in `experiments/task06i/`:

### Offline Artifacts Implemented
1. `experiments/task06i/hook-allowlist-contract.mjs`: Pure JavaScript implementation of the official `custom_access_token_hook` specification, enforcing RFC 8176 object-array traversal, top-level `authentication_method` validation, strict allowlist (only `'password'` allowed), and SQLSTATE 42501 fail-closed exceptions.
2. `experiments/task06i/hook-allowlist-contract.test.mjs`: Node native test suite verifying all 10 provider-shaped test fixtures from Task 06I-A Section 4.2.2 plus negative regression tests for mixed AMR, malformed AMR, missing `user_metadata` handling, canonical unpadded normalization policy, and Send Email Hook native suppression (37 tests).
3. `experiments/task06i/preflight-evaluator.mjs`: Preflight matrix evaluator, 18-point requirement set validator, and quota/target strategy evaluator.
4. `experiments/task06i/preflight-evaluator.test.mjs`: Unit tests verifying the 18-point security matrix, fail-closed gate decisions on failures/blockers, and target strategy separation (15 tests).

### Evidence Classification Taxonomy
To eliminate ambiguity, all capabilities and assertions are categorized across three distinct levels of evidence:
- **Documented:** Capabilities described in official Supabase documentation, Management API specifications, or GoTrue source code (e.g. `external_email_magic_link_disabled`, `disable_signup`, Send Email Hook payload structure).
- **Observed Local:** Capabilities empirically executed, measured, and reproduced in local Docker GoTrue containers (e.g. Task 06D hook denial, Task 06H-E concurrent verification failure, 5-wrong cooldown bypass, direct `PUT /user` password mutation bypass).
- **Hosted Unverified:** Documented capabilities that have **NOT YET BEEN EXECUTED OR PROVEN** on live managed Supabase Cloud infrastructure.

> [!IMPORTANT]
> **Offline Contract Tests Are NOT Hosted Integration Proof:**
> The 52 unit tests in `experiments/task06i/` verify only that the local JavaScript specification and SQL policy contract logic parse inputs, traverse RFC 8176 AMR arrays, and throw fail-closed SQLSTATE 42501 exceptions correctly. They **do not prove** that managed Supabase Cloud executes hooks without latency timeouts, preserves AMR arrays across repeated token refreshes, or reliably enforces Management API route disablements.

### Test Execution Results
Executed test commands:

```powershell
node --test experiments/task06i/*.test.mjs
```

**Results (52 passed, 0 failed):**
- 37 Hook Contract tests (Fixtures 1–10; mixed AMR with `email/signup`, `sso/saml`, `email/change`, and unknown methods rejected; non-object elements rejected; missing/blank method rejected; server-owned `amr_authenticated` claim added regardless of `user_metadata` presence; Send Email Hook native recovery, signup, magiclink, invite, email_change, and reauthentication email suppression verified fail-closed with SQLSTATE 42501; malformed/missing/non-object `email_data` rejected; missing/blank `email_action_type` rejected; canonical unpadded normalization policy enforced with negative tests for leading, trailing, and surrounded whitespace; undocumented aliases `event.email` and `event.action_type` strictly rejected; unknown action types fail closed with SQLSTATE 42501; permitted synthetic test seam `custom_notification` returns `{}`).
- 15 Preflight Evaluator tests (18 requirements validated; empty, duplicate, missing, or unknown IDs rejected; `VERIFIED FAIL` and `BLOCKED` surface as blocking verdicts; `NOT TESTED` prevents completion; quota and existing project target strategies evaluated; production Auth unconditionally `NO-GO`).

### CI Status & Commit Attribution Guard Boundary
- **Automated CI Integration Status:** **OPEN BLOCKER (BLK-05)**.
- While offline tests run deterministically via `node --test experiments/task06i/*.test.mjs` (52/52 PASS) and shell contract tests pass (`npm test`, 22/22 PASS), automated execution inside GitHub Actions PR checks requires modifying or creating workflow files under `.github/workflows/` (e.g. `.github/workflows/security-experiments.yml`).
- In this repository, `.github/workflows/*` is an explicitly guarded path under `scripts/check_guard_integrity.sh`. Any pull request modifying `.github/workflows/*` is automatically blocked by the App-owned `Commit attribution guard` (Run exit code 1) unless the repository owner sets the trusted environment variable `ATTRIBUTION_GUARD_CHANGE_APPROVED_PR_HEAD="35:<HEAD_SHA>"`.
- Furthermore, modifying `package.json` to trigger existing workflows is inappropriate because `phase1-shell.yml` executes `npm run expo:check` (`expo install --check`), which fails due to upstream npm releases for Expo SDK 58 (`expo@~58.0.26`, `expo-router@~58.0.32`). Updating mobile dependencies is outside the authorized scope of Task 06I-B1 preflight.
- Therefore, to preserve branch protections and prevent false-pass reporting, `.github/workflows/*` and `package.json` remain untouched on this branch, and automated CI integration is formally tracked as an open blocker awaiting owner-authorized workflow update.
- Historical Task 06H offline test suite: `node --test experiments/task06h/*.test.mjs` → **115 passed, 0 failed (100% pass)**.

---

## 7. Proposed Hosted Configuration & Owner $0 Cost Execution Plan

The repository owner has explicitly confirmed the project, cost, and safety policy:
1. **Zero Cost Mandate:** Work strictly within Free tier ($0 cost). Pro upgrade ($25/mo) is explicitly rejected.
2. **Permanent Immunity for `Tio-world` (`oykupyiitspujzpwwvuj`):** Must **NEVER** be paused, deleted, or modified under any circumstance, regardless of future prompt instructions.
3. **Designated Hosted Testing Target:** When hosted feasibility testing is authorized by the owner in the future, the existing project (`bsfwzvgynwriswapxpsp` [Tio-tnyx]) is the designated testbed. Prior to final production cutover, it can be deleted and regenerated cleanly at $0 cost.
4. **Current Preflight Mandate:** For Task 06I-B1, **zero hosted mutation is authorized**. Both `bsfwzvgynwriswapxpsp` and `oykupyiitspujzpwwvuj` remain strictly **READ-ONLY**.

### Target Configuration Parameters (When Authorized)
- **Target Organization:** `llmbrmxhyirtoqndazpg` ("Tio-tnyx")
- **Target Project:** `bsfwzvgynwriswapxpsp`
- **Target Region:** `ap-south-1`
- **Cost:** $0.00 (Free tier)

### Exact Management API Configuration PATCH
To properly activate both route disablements and managed Auth Hooks, the following Management API PATCH must be executed against `https://api.supabase.com/v1/projects/{ref}/config/auth`:

```json
{
  "external_email_magic_link_disabled": true,
  "disable_signup": true,
  "jwt_exp": 300,
  "hook_custom_access_token_enabled": true,
  "hook_custom_access_token_uri": "pg-functions://postgres/private_auth/custom_access_token_hook",
  "hook_send_email_enabled": true,
  "hook_send_email_uri": "pg-functions://postgres/private_auth/send_email_hook"
}
```

*Dashboard Alternative:*
- **Custom Access Token Hook:** Authentication → Hooks → "Customize Access Token (JWT) Hook" → Enabled → Type: Postgres function → Schema: `private_auth`, Function: `custom_access_token_hook`.
- **Send Email Hook:** Authentication → Hooks → "Send Email Hook" → Enabled → Type: Postgres function → Schema: `private_auth`, Function: `send_email_hook`.

### Complete Hook Schema Migration SQL
```sql
CREATE SCHEMA IF NOT EXISTS private_auth;

-- 1. Custom Access Token Hook
CREATE OR REPLACE FUNCTION private_auth.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_method text;
  v_claims jsonb;
  v_amr jsonb;
  v_item jsonb;
  v_has_password boolean := FALSE;
BEGIN
  v_method := event->>'authentication_method';
  IF v_method IS NULL OR v_method NOT IN ('password', 'token_refresh') THEN
    RAISE EXCEPTION 'authentication_method % not permitted by policy', v_method
      USING ERRCODE = '42501';
  END IF;

  v_claims := event->'claims';
  IF v_claims IS NULL OR jsonb_typeof(v_claims) <> 'object' THEN
    RAISE EXCEPTION 'claims object missing or malformed'
      USING ERRCODE = '42501';
  END IF;

  v_amr := v_claims->'amr';
  IF v_amr IS NULL OR jsonb_typeof(v_amr) <> 'array' OR jsonb_array_length(v_amr) = 0 THEN
    RAISE EXCEPTION 'amr missing or not an array'
      USING ERRCODE = '42501';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_amr) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'malformed amr element: must be a JSON object'
        USING ERRCODE = '42501';
    END IF;

    IF v_item->>'method' IS NULL OR trim(v_item->>'method') = '' THEN
      RAISE EXCEPTION 'malformed amr method: string method property required'
        USING ERRCODE = '42501';
    END IF;

    IF v_item->>'method' = 'password' THEN
      v_has_password := TRUE;
    ELSE
      -- Strict allowlist: Any non-password method (known disallowed or unknown) immediately fails closed
      RAISE EXCEPTION 'prohibited amr method % in token session', v_item->>'method'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF NOT v_has_password THEN
    RAISE EXCEPTION 'session lacks verified password origin'
      USING ERRCODE = '42501';
  END IF;

  -- Enrich claims with dedicated server-owned authorization claim directly under claims
  -- (does not rely on client-editable or optionally missing user_metadata)
  v_claims := jsonb_set(v_claims, '{amr_authenticated}', '"true"'::jsonb, true);
  event := jsonb_set(event, '{claims}', v_claims);
  RETURN event;
END;
$$;

-- 2. Send Email Hook (Strict Native Email Suppression & Canonical Normalization Policy)
CREATE OR REPLACE FUNCTION private_auth.send_email_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email_data jsonb;
  v_action_type text;
BEGIN
  IF event IS NULL OR jsonb_typeof(event) <> 'object' THEN
    RAISE EXCEPTION 'send_email_hook: invalid event payload'
      USING ERRCODE = '42501';
  END IF;

  v_email_data := event->'email_data';
  IF v_email_data IS NULL OR jsonb_typeof(v_email_data) <> 'object' THEN
    RAISE EXCEPTION 'send_email_hook: missing or malformed email_data object'
      USING ERRCODE = '42501';
  END IF;

  v_action_type := v_email_data->>'email_action_type';
  -- Enforce canonical normalization policy: strictly reject missing, blank, or whitespace-padded action types
  IF v_action_type IS NULL OR trim(v_action_type) = '' OR v_action_type <> trim(v_action_type) THEN
    RAISE EXCEPTION 'send_email_hook: invalid, blank, or padded email_action_type'
      USING ERRCODE = '42501';
  END IF;

  -- Prohibit native recovery, signup, magiclink, invite, email_change, and reauthentication email dispatch
  IF v_action_type IN ('recovery', 'signup', 'magiclink', 'invite', 'email_change', 'reauthentication') THEN
    RAISE EXCEPTION 'send_email_hook: native % email dispatch suppressed by security policy', v_action_type
      USING ERRCODE = '42501';
  END IF;

  -- Allowlist for permitted actions (synthetic test seam only; official Supabase GoTrue does not emit custom_notification natively)
  IF v_action_type IN ('custom_notification') THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Fail-closed on all unknown or unsupported action types
  RAISE EXCEPTION 'send_email_hook: unrecognized email_action_type %', v_action_type
    USING ERRCODE = '42501';
END;
$$;

-- 3. Least-Privilege Role Grants & Revocations
GRANT USAGE ON SCHEMA private_auth TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION private_auth.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION private_auth.send_email_hook(jsonb) TO supabase_auth_admin;
REVOKE ALL ON SCHEMA private_auth FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private_auth.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private_auth.send_email_hook(jsonb) FROM public, anon, authenticated;
-- Note: SQL runtime behavior on live database is classified as NOT TESTED on live database; offline JS contracts verify specification.
```

### Pre-Execution Active Verification Protocol
Before executing any native bypass tests (`BYPASS-01` through `BYPASS-05`), the tester must execute the following active verification:
1. **Config Read-Back:** Query Management API `GET /v1/projects/{ref}/config/auth` and assert:
   - `hook_custom_access_token_enabled === true`
   - `hook_custom_access_token_uri === "pg-functions://postgres/private_auth/custom_access_token_hook"`
   - `hook_send_email_enabled === true`
   - `hook_send_email_uri === "pg-functions://postgres/private_auth/send_email_hook"`
2. **Permission Check:** Verify that role `supabase_auth_admin` can execute both functions and that `public` / `anon` execution is revoked.
3. **Fail-Closed Gate:** If either hook is missing, disabled (`false`), unreachable, or unhealthy, the environment is immediately marked **UNSAFE / BLOCKED**, halting all further test execution.

### Hook Failure and Fallback Behavior (Design Target / Documented Provider Behavior / Hosted Unverified)
- **Custom Access Token Hook Failure (Documented Provider Behavior / Hosted Unverified):**
  - **Design Target / Mandatory Future Acceptance Target:** If the hook function throws an exception (`RAISE EXCEPTION ... USING ERRCODE = '42501'`) or times out (Supabase default timeout is 2 seconds for Postgres functions), Supabase GoTrue is documented to abort JWT issuance immediately and return HTTP 500 (`Error invoking access token hook`), issuing zero tokens.
  - **Explicit Evidence Classification:**
    1. *Local GoTrue Runtime Evidence:* Hook denial was empirically observed to abort session minting in local Docker GoTrue (Task 06D/06H).
    2. *Offline JavaScript Contract Tests:* Input validation, AMR allowlist inspection, and error throwing are verified offline (`experiments/task06i/hook-allowlist-contract.test.mjs`).
    3. *Documented Supabase Provider Behavior:* Official Supabase documentation specifies that unhandled hook exceptions abort authentication and return HTTP 500.
    4. *Hosted Unverified Status:* Whether managed Supabase Cloud reliably aborts token issuance on hook exception under all failure modes without latency timeouts or failing open remains **DOCUMENTED PROVIDER BEHAVIOR / HOSTED UNVERIFIED / NOT TESTED** until empirically proven in Stage 06I-B1. An unhandled Custom Access Token Hook exception is **NOT** independently proven to prevent hosted JWT issuance until hosted empirical verification is completed.
    5. *Mandatory Future Acceptance Criteria:* Zero access tokens or sessions issued when the hook function raises an unhandled exception or times out on managed Supabase Cloud.
- **Send Email Hook Failure & Fallback (Documented Provider Behavior / Hosted Unverified):**
  - **Exception Abort (Design Target):** When `send_email_hook` raises an exception with SQLSTATE `42501`, GoTrue is documented to abort the authentication/recovery transaction and return an HTTP error (e.g. HTTP 500 / hook execution failure). Under this path, zero recovery tokens or emails should reach SMTP or the user.
  - **Hosted SMTP Fallback Unverified:** The assertion that GoTrue aborts without falling back to default SMTP delivery when the Send Email Hook fails or raises SQLSTATE 42501 is documented provider behavior, but remains **DOCUMENTED PROVIDER BEHAVIOR / HOSTED UNVERIFIED / NOT TESTED** until empirically validated on live managed Supabase infrastructure in Stage 06I-B1.
  - **Absorption vs Error Response:** If GoTrue absorbs hook exceptions into an HTTP 200 generic response (for anti-enumeration purposes) or surfaces HTTP 500, both outcomes are required to ensure that zero usable tokens or emails reach external networks. This behavior remains **HOSTED UNVERIFIED / NOT TESTED**.
  - **Mandatory Fail-Closed Acceptance Target (Design Target / Hosted Unverified):** Under Tio's mandatory security boundary, an unhandled hook exception, timeout, or malformed payload MUST fail closed with zero native recovery token dispatch, zero unverified session issuance, and zero fallback to default SMTP. However, whether managed Supabase Cloud GoTrue reliably satisfies this fail-closed guarantee under all hosted failure modes without failing open or falling back to default SMTP remains **DOCUMENTED PROVIDER BEHAVIOR / HOSTED UNVERIFIED / NOT TESTED** until empirically proven in Stage 06I-B1.

### Deterministic Test Identities
- `synthetic-admin-test-1@example.invalid` (RFC 2606 non-routable domain)
- `synthetic-admin-test-2@example.invalid`
- Zero real user emails, phone numbers, or third-party addresses.

---

## 8. Explicit Blockers & Owner Approval Gates

The following items are explicit blockers that halt execution before any hosted actions:

| Blocker ID | Description | Impact | Current Status & Required Action |
|---|---|---|---|
| **BLK-01** (Account Quota & Cost) | Free tier active quota exhausted (2 of 2 active projects). Owner strictly mandates $0 cost and permanent immunity for `Tio-world`. | Cannot provision a 3rd project. | Owner resolved policy: zero spending; use existing project lifecycle (`bsfwzvgynwriswapxpsp`) if hosted testing is approved in future; `Tio-world` has permanent immunity. |
| **BLK-02** (Target Safety & Production Boundary) | Explicit owner approval is required before any hosted project modification or testing. Production project `bsfwzvgynwriswapxpsp` and `Tio-world` remain strictly READ-ONLY. | Prevents accidental configuration mutations or production destruction. | Bounded owner authorization required before any future hosted execution. Deleting or regenerating production project is NOT approved at this stage. If no safe isolated hosted target exists, hosted testing is BLOCKED (`NO_SAFE_HOSTED_TARGET`). |
| **BLK-03** (Hosted Empirical Gap) | Management API parameter behavior, recovery email suppression, and AMR refresh behavior remain unverified on live infrastructure. | Cannot declare Option B feasible without empirical proof. | Authorize Stage 06I-B1 test execution under separate future gate. |
| **BLK-04** (Production Auth Gate) | Pinned GoTrue security vulnerabilities (AUTH-12, AUTH-17, AUTH-22) remain open in native runtime. | Production Auth cannot be safely enabled. | Production Auth remains strictly **NO-GO**. |
| **BLK-05** (Guard-Protected CI Workflow Approval) | Adding automated CI for `experiments/task06i` modifies `.github/workflows/*`, which is strictly protected by `scripts/check_guard_integrity.sh`. | Prevents unreviewed workflow modifications from running without owner authorization. | **OWNER AUTHORIZED IN TASK 06I-B1-R8.** Workflow added at `.github/workflows/security-experiments.yml`. Awaiting owner exact-SHA approval in trusted environment (`ATTRIBUTION_GUARD_CHANGE_APPROVED_PR_HEAD="35:<NEW_HEAD_SHA>"`). |

### CI Workflow Integration for BLK-05 (Owner Authorized in Task 06I-B1-R8)

To provide automated CI regression protection for `experiments/task06i/**` without triggering unrelated Expo SDK version checks in `phase1-shell.yml`, the dedicated standalone workflow has been added at `.github/workflows/security-experiments.yml`:

```yaml
name: Security experiment checks

on:
  pull_request:
    paths:
      - 'experiments/task06i/**'
      - '.github/workflows/security-experiments.yml'
  push:
    branches:
      - main
    paths:
      - 'experiments/task06i/**'
      - '.github/workflows/security-experiments.yml'

permissions:
  contents: read

concurrency:
  group: security-experiments-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    name: Task 06I Security Contract Tests
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: Set up Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Run Task 06I security tests
        run: node --test experiments/task06i/*.test.mjs
```

#### Required Owner Approval & Activation Procedure
Per [`docs/26-COMMIT-ATTRIBUTION-GUARD.md`](../../../docs/26-COMMIT-ATTRIBUTION-GUARD.md) and `scripts/check_guard_integrity.sh`:
1. **Prepare Proposed Workflow Patch:** Prepare the proposed workflow patch (`.github/workflows/security-experiments.yml`) for independent owner review (as documented above).
2. **Obtain Explicit Owner Authorization:** Obtain explicit owner authorization for the exact intended protected change before touching any workflow file.
3. **Commit & Push Workflow Change:** Only after receiving explicit owner authorization, commit and push the workflow change to the PR branch `docs/task06i-b1-managed-auth-preflight`.
4. **Retrieve New PR HEAD SHA:** Retrieve the NEW exact 40-character PR HEAD SHA from GitHub (`git rev-parse HEAD` or via GitHub API/UI).
5. **Independent Final Review:** The repository owner independently reviews the final PR diff and the new HEAD commit.
6. **Set Trusted Approval Variable:** In **GitHub Repository Settings → Environments → `attribution-guard-trusted` → Environment variables**, the owner sets the exact variable:
   `ATTRIBUTION_GUARD_CHANGE_APPROVED_PR_HEAD="35:<NEW_40_CHAR_HEAD_SHA>"`
7. **Rerun Attribution Guard:** Rerun or re-request the App-owned attribution guard check (`Commit attribution guard`) on that exact new HEAD.
8. **Verify All Checks Pass:** Confirm the guard, workflow tests, and all required checks actually pass in GitHub Actions.
9. **Follow Review & Merge Policy:** Follow standard review and owner merge approval policy (owner merge gate).
10. **Clear Temporary Approval:** Immediately upon merge or if any further commit updates the branch, remove or clear `ATTRIBUTION_GUARD_CHANGE_APPROVED_PR_HEAD` in the trusted environment.

> [!WARNING]
> **Approval Sequence & Safeguard Rules:**
> - **Never use an old/prior SHA for approval after workflow commit:** Committing the workflow generates a new commit with a new SHA; setting the approval variable to a prior SHA (e.g. the pre-commit HEAD) guarantees failure because `scripts/check_guard_integrity.sh` verifies `$approved_pr_head = "$pr_number:$head_sha"`.
> - **Subsequent commits invalidate approval:** Any new commit changes the HEAD SHA and requires re-approval of the new SHA.
> - **Strict Guard Integrity:** Do not attempt to bypass, weaken, or add wildcard exceptions to `scripts/check_guard_integrity.sh`.

---

## 9. STOP / GO Decision & Recommendations

### Final Assessment
- **Task 06I-B1-R8 Preflight Deliverable:** **VERIFIED PASS** (Dedicated Security CI workflow added to `.github/workflows/security-experiments.yml` under explicit owner authorization; least-privilege permissions `contents: read`, Node 22 native test runner, zero Expo dependencies; 52 offline unit tests passing; 115 Task 06H tests passing; full repository verification passing; awaiting owner exact-SHA trusted approval for `Commit attribution guard`).
- **Disposable Hosted Project Execution:** **BLOCKED (STOP)** (Awaiting separate owner authorization and safe isolated target resolution).
- **Managed Supabase Auth Feasibility:** **NOT VERIFIED ON HOSTED** (Documented capabilities indicate feasibility, but empirical hosted proof is mandatory).
- **Production Real Auth:** **STRICT NO-GO**.

### Recommended Next Action
1. Review this finalized Task 06I-B1-R8 preflight package and PR #35.
2. Maintain `bsfwzvgynwriswapxpsp` and `oykupyiitspujzpwwvuj` as strictly READ-ONLY.
3. Owner executes exact-SHA approval in trusted GitHub environment (`ATTRIBUTION_GUARD_CHANGE_APPROVED_PR_HEAD="35:<NEW_HEAD_SHA>"`).
4. When the owner chooses to authorize future hosted feasibility testing, execute the 18-point Stage 06I-B1 test checklist against an authorized safe target under strict cleanup guarantees.

---

## 10. Handoff

**Next owner:** Repository Owner review & PR review
**Next authorized action:** PR review and owner review gate
**Post-merge synchronization/archive needed:** Yes (upon future PR review and merge)

[← Task guide](../README.md) · [Root agent contract](../../../AGENTS.md)
