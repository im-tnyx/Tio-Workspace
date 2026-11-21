# Phase 1.2 Task 06I-B1-R1 — Managed Auth Feasibility & Security Boundary Verification Preflight

> **Preflight Report & Test Plan (Revision R1 — Evidence Review & Scope Reconciliation).** Prepared under `AGENTS.md` operating rules. This document authorizes local investigation, documentation, offline test preparation, and read-only feasibility checks only. It does not authorize creating or modifying a hosted Supabase project. Production Real Auth remains **NO-GO**.

| Field | Value |
|---|---|
| Status | **PREFLIGHT COMPLETE (REVISION R1) — HOSTED PROVISIONING BLOCKED PENDING OWNER APPROVAL & QUOTA RESOLUTION** |
| Objective | Review and finalize Task 06I-B1 preflight findings, correct evidence classifications, document residual JWT validity and quota rules, enforce owner's $0 cost policy, and prepare a reviewable GitHub PR |
| Implementation owner | Agent / Local Development & Security Research, Task 06I-B1-R1 slice |
| Previous agent | Codex / Task 06I-A Revision R17 author |
| Last commit agent | GitHub merge commit `b7d4fda97979e734a85461e83bf119dbc1a9689c` (Merge PR #34) |
| Tracking / approval | Task 06I-B1-R1 authorized by user prompt; PR #34 merged; owner mandates $0 cost and preserves `Tio-world`; hosted mutations strictly prohibited |
| Branch | `docs/task06i-b1-managed-auth-preflight` |
| Base SHA / inspected HEAD | `b7d4fda97979e734a85461e83bf119dbc1a9689c` (`main`, verified up to date with `origin/main`) |
| Platform and file scope | Documentation, `.ai/` context, isolated offline preflight test harnesses under `experiments/task06i/`; zero client Expo UI, production schema, or live Auth changes |
| Created / updated | 2026-11-21 |

---

## 1. Required Context & Git Baseline Verification

### Checklist & Reconciliation
- [x] [`AGENTS.md`](../../AGENTS.md) read and operational constraints enforced (Hinglish response, read-only Git preflight, strictly bounded documentation/offline tests).
- [x] [Current pointer](../current.md) inspected and reconciled.
- [x] Canonical documentation reconciled:
  - [`docs/04-AUTH-AND-SECURITY.md`](../../docs/04-AUTH-AND-SECURITY.md) (strict Email → OTP → Password, provisional UUID lifecycle, server-owned eligibility, no-guest boundary, AUTH-12/17/22 invariants).
  - [`docs/27-OTP-FIRST-AUTH-LIFECYCLE.md`](../../docs/27-OTP-FIRST-AUTH-LIFECYCLE.md) (lifecycle state transitions `UNVERIFIED` → `EMAIL_VERIFIED_PASSWORD_PENDING` → `PASSWORD_COMPLETE_PROFILE_PENDING` → `SERVER_ELIGIBLE`).
  - [`docs/08-TEST-PLAN.md`](../../docs/08-TEST-PLAN.md) (P0 security test definitions for AUTH-12, AUTH-17, and AUTH-22).
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
- **Documented Mechanism:** Supabase Auth Send Email Hook allows routing outgoing authentication emails to a custom HTTPS webhook or Edge Function instead of built-in SMTP.
- **Handling of Recovery:** When `POST /auth/v1/recover` is invoked, Supabase generates the token/hash and sends an event with `email_action_type = "recovery"`.
- **Security Boundary Nuance:** While the hook can drop/suppress the email to prevent dispatch, **the HTTP endpoint `POST /auth/v1/recover` itself remains reachable and returns 200 OK**. Therefore, Send Email Hook alone is not a complete route closure; secondary protection relies on Custom Access Token Hook blocking token redemption.
- **Managed Hosted Status:** `NOT TESTED`.

### 4. Custom Access Token Hook Architecture & Fail-Closed Behavior
- **Documented Event Signature:** Official Supabase contract passes `event JSONB` with three top-level keys:
  - `user_id` (UUID string)
  - `authentication_method` (string: `'password'`, `'token_refresh'`, `'otp'`, `'recovery'`, `'magiclink'`, `'anonymous'`, etc.)
  - `claims` (JSONB object containing standard JWT claims including `amr`)
- **Fail-Closed Execution:** Official documentation and community findings confirm that when the Postgres hook function raises an unhandled exception (e.g. `RAISE EXCEPTION ... USING ERRCODE = '42501'`), Supabase Auth **fails closed**: the authentication transaction is aborted, returning HTTP `500 Internal Server Error (AuthApiError: Error invoking access token hook)` to the client, and **zero JWT access token or session is issued**.
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

## 5. Security Threat & Hosted Test Matrix (17 Requirements)

The following reproducible test matrix defines the 17 security requirements across 3 functional categories. Expected responses are drawn from the Task 06I-A contract:

| Case ID | Category | Target / Vector | Expected Response (Contract) | Hosted Status | Precondition / Prerequisite |
|---|---|---|---|---|---|
| **BYPASS-01** | Native Bypass | `POST /auth/v1/otp` (email OTP) | `422 Unprocessable Entity (email_provider_disabled)` | **NOT TESTED** | `external_email_magic_link_disabled: true` |
| **BYPASS-02** | Native Bypass | `POST /auth/v1/signup` (direct signup) | `422 Unprocessable Entity (signup_disabled)` | **NOT TESTED** | `disable_signup: true` |
| **BYPASS-03** | Native Bypass | `POST /auth/v1/verify` (type email / recovery) | `500 Error invoking access token hook` (0 token issued) | **NOT TESTED** | Custom Access Token Hook deployed |
| **BYPASS-04** | Native Bypass | Magic Link, Invite & Anonymous endpoints | `500 Error invoking access token hook` (0 token issued) | **NOT TESTED** | Custom Access Token Hook deployed |
| **HOOK-01** | Token Hook | Legitimate Password Sign-In | `200 OK` with valid JWT (`amr: [{method: "password"}]`) | **NOT TESTED** | Test user enrolled with password |
| **HOOK-02** | Token Hook | Legitimate Password Token Refresh | `200 OK` with refreshed JWT (`amr: [{method: "password"}]`) | **NOT TESTED** | Active password session |
| **HOOK-03** | Token Hook | OTP-Origin Token Refresh | `500 Error invoking access token hook` (SQLSTATE `42501`) | **NOT TESTED** | Simulated OTP session |
| **HOOK-04** | Token Hook | Recovery-Origin Token Refresh | `500 Error invoking access token hook` (SQLSTATE `42501`) | **NOT TESTED** | Simulated recovery session |
| **HOOK-05** | Token Hook | Mixed AMR (`password` + `otp`) | `500 Error invoking access token hook` (SQLSTATE `42501`) | **NOT TESTED** | Simulated mixed AMR payload |
| **HOOK-06** | Token Hook | Missing / Malformed AMR (string array, empty) | `500 Error invoking access token hook` (SQLSTATE `42501`) | **NOT TESTED** | Malformed AMR payload |
| **HOOK-07** | Token Hook | Fail-Closed on Hook Exception / Error | `500 Error invoking access token hook` (transaction aborted) | **NOT TESTED** | Syntax/runtime error injection in hook |
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
1. `experiments/task06i/hook-allowlist-contract.mjs`: Pure JavaScript implementation of the official `custom_access_token_hook` specification, enforcing RFC 8176 object-array traversal, top-level `authentication_method` validation, and SQLSTATE 42501 fail-closed exceptions.
2. `experiments/task06i/hook-allowlist-contract.test.mjs`: Node native test suite verifying all 10 provider-shaped test fixtures from Task 06I-A Section 4.2.2 plus boundary conditions.
3. `experiments/task06i/preflight-evaluator.mjs`: Preflight matrix evaluator and account quota validation engine.
4. `experiments/task06i/preflight-evaluator.test.mjs`: Unit tests for the 17-point security matrix and gate decision logic.

### Evidence Classification Taxonomy
To eliminate ambiguity, all capabilities and assertions are categorized across three distinct levels of evidence:
- **Documented:** Capabilities described in official Supabase documentation, Management API specifications, or GoTrue source code. (e.g. `external_email_magic_link_disabled`, `disable_signup`, Send Email Hook payload structure).
- **Observed Local:** Capabilities empirically executed, measured, and reproduced in local Docker GoTrue containers (e.g. Task 06D hook denial, Task 06H-E concurrent verification failure, 5-wrong cooldown bypass, direct `PUT /user` password mutation bypass).
- **Hosted Unverified:** Documented capabilities that have **NOT YET BEEN EXECUTED OR PROVEN** on live managed Supabase Cloud infrastructure.

> [!IMPORTANT]
> **Offline Contract Tests Are NOT Hosted Integration Proof:**  
> The 22 unit tests in `experiments/task06i/` verify only that the local JavaScript specification and SQL policy contract logic parse inputs, traverse RFC 8176 AMR arrays, and throw fail-closed SQLSTATE 42501 exceptions correctly. They **do not prove** that managed Supabase Cloud executes hooks without latency timeouts, preserves AMR arrays across repeated token refreshes, or reliably enforces Management API route disablements.

### Test Execution Results
Executed test commands:

```powershell
node --test experiments/task06i/*.test.mjs
```

**Results:**
```
✔ Fixture 1: Valid initial password authentication is allowed (1.57ms)
✔ Fixture 2: Valid token refresh with password-origin AMR is allowed (0.14ms)
✔ Fixture 3: Native email OTP authentication is denied fail-closed (0.23ms)
✔ Fixture 4: Native recovery authentication is denied fail-closed (0.13ms)
✔ Fixture 5: Native magiclink authentication is denied fail-closed (0.16ms)
✔ Fixture 6: Password method combined with prohibited OTP AMR is denied (mixed AMR) (0.14ms)
✔ Fixture 7: Token refresh with missing claims object is denied (0.20ms)
✔ Fixture 8: Token refresh with non-array AMR is denied (0.16ms)
✔ Fixture 9: Token refresh with prohibited recovery AMR is denied (0.15ms)
✔ Fixture 10: Unknown authentication method is denied fail-closed (0.22ms)
✔ Boundary: null or non-object event fails closed (0.38ms)
✔ Boundary: missing or blank authentication_method fails closed (0.14ms)
✔ Boundary: empty AMR array fails closed (0.11ms)
✔ Boundary: string-array AMR (legacy format) fails closed under RFC 8176 parser (0.10ms)
✔ Boundary: amr element missing string method property fails closed (0.10ms)
✔ Boundary: anonymous and invite authentication methods fail closed (0.20ms)
✔ Security matrix contains exactly 17 discrete requirements across 3 categories (1.28ms)
✔ All requirements have valid initial preflight statuses (0.30ms)
✔ Quota exhaustion (2 active projects out of 2) triggers QUOTA_EXHAUSTED blocker (0.89ms)
✔ Unapproved project creation halts before hosted execution (0.13ms)
✔ Invalid requirement status fails validation (0.39ms)
✔ Production Real Auth is unconditionally NO-GO across all gate evaluations (0.12ms)
ℹ tests 22 | pass 22 | fail 0 | cancelled 0 | skipped 0
```

### Full Repository Regression Verification
- Historical Task 06H offline test suite: `node --test experiments/task06h/*.test.mjs` → **115 passed, 0 failed (100% pass)**.
- Expo shell contract test suite: `npm test` → **22 passed, 0 failed (100% pass)**.
- Full verification suite: `npm run verify` (tokens check, typecheck, lint, test) → **Clean exit code 0**.

---

## 7. Proposed Hosted Configuration & Owner $0 Cost Execution Plan

The repository owner has explicitly confirmed the project and cost policy:
1. **Zero Cost Mandate:** Work strictly within Free tier ($0 cost). Pro upgrade ($25/mo) is explicitly rejected.
2. **`Tio-world` (`oykupyiitspujzpwwvuj`) Preservation:** Must NOT be paused, deleted, or modified.
3. **Hosted Testing Target:** If hosted proof is authorized in the future, the existing project (`bsfwzvgynwriswapxpsp`) would be the test target; prior to final production cutover, it can be deleted and regenerated cleanly.
4. **Current Status:** For Task 06I-B1-R1, **zero hosted mutation is authorized**.

### Target Configuration Parameters (When Authorized)
- **Target Organization:** `llmbrmxhyirtoqndazpg` ("Tio-tnyx")
- **Target Region:** `ap-south-1`
- **Cost:** $0.00 (Free tier)

### Exact Management API Configuration PATCH
Endpoint: `PATCH https://api.supabase.com/v1/projects/{ref}/config/auth`
Payload:
```json
{
  "external_email_magic_link_disabled": true,
  "disable_signup": true,
  "jwt_exp": 300
}
```

### Hook Schema Migration SQL
```sql
CREATE SCHEMA IF NOT EXISTS private_auth;

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
    IF v_item->>'method' = 'password' THEN
      v_has_password := TRUE;
    ELSIF v_item->>'method' IN ('otp', 'recovery', 'magiclink', 'signup', 'invite', 'anonymous', 'oauth', 'sso') THEN
      RAISE EXCEPTION 'prohibited amr method % in token session', v_item->>'method'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF NOT v_has_password THEN
    RAISE EXCEPTION 'session lacks verified password origin'
      USING ERRCODE = '42501';
  END IF;

  -- Enrich claims with server confirmation
  v_claims := jsonb_set(v_claims, '{user_metadata,amr_authenticated}', '"true"');
  event := jsonb_set(event, '{claims}', v_claims);
  RETURN event;
END;
$$;

GRANT USAGE ON SCHEMA private_auth TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION private_auth.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE ALL ON FUNCTION private_auth.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
```

### Deterministic Test Identities
- `synthetic-admin-test-1@example.invalid` (RFC 2606 non-routable domain)
- `synthetic-admin-test-2@example.invalid`
- Zero real user emails, phone numbers, or third-party addresses.

---

## 8. Explicit Blockers & Owner Approval Gates

The following items are explicit blockers that halt execution before any hosted actions:

| Blocker ID | Description | Impact | Current Status & Required Action |
|---|---|---|---|
| **BLK-01** (Account Quota & Cost) | Free tier active quota exhausted (2 of 2 active projects). Owner strictly mandates $0 cost and preserves `Tio-world`. | Cannot provision a 3rd project. | Owner resolved policy: zero spending; use existing project lifecycle if hosted testing is approved in future; `Tio-world` off-limits. |
| **BLK-02** (Creation Gate) | Explicit owner approval is required before any hosted project modification or testing. | Prevents accidental configuration mutations. | Bounded owner authorization required before any future hosted execution. |
| **BLK-03** (Hosted Empirical Gap) | Management API parameter behavior and AMR refresh behavior remain unverified on live infrastructure. | Cannot declare Option B feasible without empirical proof. | Authorize Stage 06I-B1 test execution under separate future gate. |
| **BLK-04** (Production Auth Gate) | Pinned GoTrue security vulnerabilities (AUTH-12, AUTH-17, AUTH-22) remain open in native runtime. | Production Auth cannot be safely enabled. | Production Auth remains strictly **NO-GO**. |

---

## 9. STOP / GO Decision & Recommendations

### Final Assessment
- **Task 06I-B1-R1 Preflight Deliverable:** **VERIFIED PASS** (Documentation audited, evidence classifications corrected, 17-point test matrices defined, residual JWT validity documented, and 22 offline unit tests passing).
- **Disposable Hosted Project Execution:** **BLOCKED (STOP)** (Awaiting separate owner authorization for future hosted execution).
- **Managed Supabase Auth Feasibility:** **NOT VERIFIED ON HOSTED** (Documented capabilities indicate feasibility, but empirical hosted proof is mandatory).
- **Production Real Auth:** **STRICT NO-GO**.

### Recommended Next Action
1. Review this finalized Task 06I-B1-R1 preflight package and PR.
2. Maintain `bsfwzvgynwriswapxpsp` and `oykupyiitspujzpwwvuj` as strictly READ-ONLY.
3. When the owner chooses to authorize future hosted feasibility testing, execute the 17-point Stage 06I-B1 test checklist against the authorized target at $0 cost under strict cleanup guarantees.

---

## 10. Handoff

**Next owner:** Repository Owner review & PR review  
**Next authorized action:** PR review and owner review gate  
**Post-merge synchronization/archive needed:** Yes (upon future PR review and merge)  

[← Task guide](README.md) · [Root agent contract](../../AGENTS.md)
