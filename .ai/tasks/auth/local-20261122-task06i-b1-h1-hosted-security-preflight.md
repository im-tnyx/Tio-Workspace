# Phase 1.2 Task 06I-B1-H1-R3 — Hosted Evidence Integrity & Security Boundary Closure

> **Local Preparation, Preflight Audit, Offline Validation & Reviewable PR.** Prepared under `AGENTS.md` operating rules. This document establishes the offline verification baseline, safety boundaries, Brevo sending readiness assessment, complete TEMP-only testbed setup specification, exact run-scoped identity cleanup, and read-only execution plan for Task 06I-B1-H1-R3. All 10 security review findings across PR #37 (from reviewer `im-tio` and `Cursor Bugbot`) are resolved. Zero hosted LIVE probes, mutations, Auth Hook deployments, or test users have been executed. Decision remains strictly **`BLOCKED_PENDING_ADDITIONAL_PREPARATION`**. Production Real Auth remains **STRICT NO-GO**.

| Field | Value |
|---|---|
| Status | **LOCAL REMEDIATION COMPLETE (REVISION R3); ALL 10 REVIEW FINDINGS RESOLVED (R3-01 TO R3-10); 58/58 RUNNER TESTS PASS; 18/18 POSTGRESQL PARITY PASS (`POSTGRES_VERIFIED`); 115/115 TASK06H TESTS PASS; 22/22 SHELL TESTS PASS; LAYER B 18-CASE MATRIX AUDITED (10 IMPLEMENTED_OFFLINE_TESTED, 5 PROVIDER_PRECONDITION_MISSING, 3 BLOCKED_UNSUPPORTED, 0 HOSTED_VERIFIED); STRICT JWT PARSING WITHOUT BYPASS; NO PLACEHOLDER SESSIONS; NO LOGOUT FALLBACK; STRICT CREDENTIAL BOUNDARY VALIDATION; SEED USERS PRESERVED; CLEANUP IN FINALLY LIFECYCLE; DECISION: `BLOCKED_PENDING_ADDITIONAL_PREPARATION`; READY FOR INDEPENDENT RE-REVIEW** |
| Objective | Remediate all 10 security review findings on PR #37 (R3-01 to R3-10) without executing any live hosted mutations, resolving OTP grant-type preconditions, client AMR injection limitations, stateless linger proof integrity, password reset admin requirements, genuine session ID extraction, bypass pre-validation distinction, deterministic cleanup integration, strict JWT parsing, seed user preservation, and production credential boundary protection. |
| Implementation owner | Agent / Local Development & Security Research, Task 06I-B1-H1-R3 slice |
| Previous agent | Agent / Task 06I-B1-H1-R2 author |
| Last audited HEAD | `c456ed9aec1fe304cb5ec00ac70fdaae75c9b64e` (PR #37 previous commit) |
| Tracking / approval | Task 06I-B1-H1-R3 remediation authorized by user prompt; LIVE hosted probe execution requires separate explicit owner authorization; mandates $0 cost ceiling and permanent immunity for `Tio-world` (`oykupyiitspujzpwwvuj`) and REAL `bsfwzvgynwriswapxpsp` |
| Branch | `test/task06i-b1-h1-hosted-security-preflight` |
| Base SHA / inspected HEAD | `716fb32061ffb6012d17eae9453c822a281fe6f1` (`main`) |
| Platform and file scope | Documentation, `.ai/` context, runner CLI hardening & LIVE dispatcher contract in `experiments/task06i/hosted-probe-runner.mjs`, testbed fixture specification in `experiments/task06i/sql/testbed-fixtures.sql`, and offline verification tests in `experiments/task06i/hosted-probe-runner.test.mjs`; zero client Expo UI, production schema, or live Auth mutations |
| Created / updated | 2026-11-22 |

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

## 6. Verification Evidence Matrix

All verification checks were run locally and passed completely:

```bash
node --test experiments/task06i/hosted-probe-runner.test.mjs
# 58 passed, 0 failed, exit code 0

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

## 7. Hard STOP Gate & Decision

- **Hard STOP Gate Honored:**
  - Zero hosted LIVE probes execute hue hain.
  - Zero TEMP Auth configuration PATCHes execute hue hain.
  - Zero hosted SQL deployments execute hue hain.
  - Zero test users create hue hain.
  - Zero live emails dispatch hui hain.
  - Real Auth implementation start nahi hui hai.
  - Project deletion perform nahi hua hai.

**Decision:** **`BLOCKED_PENDING_ADDITIONAL_PREPARATION`**

> **Important:** Production Real Auth remains **STRICT NO-GO**. Local remediation for all 10 review findings (R3-01 through R3-10) is complete and fully covered by offline regression tests (58/58 pass). Decision remains strictly `BLOCKED_PENDING_ADDITIONAL_PREPARATION` because hosted preconditions (Management API PATCH, SQL hook installation, Edge Function deployment) require explicit owner authorization before any live execution. Awaiting independent re-review from `im-tio`.
