# Phase 1.2 Task 06I-B1-H1 — Hosted Auth Security Verification Preparation

> **Local Preparation, Preflight Audit, Offline Validation & Reviewable PR.** Prepared under `AGENTS.md` operating rules. This document establishes the offline verification baseline, safety boundaries, Brevo sending readiness assessment, and read-only execution plan for Task 06I-B1-H1. Zero hosted LIVE probes, mutations, Auth Hook deployments, or test users have been executed. Production Real Auth remains **STRICT NO-GO**.

| Field | Value |
|---|---|
| Status | **LOCAL PREPARATION & PREFLIGHT VERIFICATION COMPLETE; PR #36 SQUASH MERGE VERIFIED AT `716fb32061ffb6012d17eae9453c822a281fe6f1`; 105/105 TASK06I TESTS PASS; 18/18 POSTGRESQL PARITY PASS (`POSTGRES_VERIFIED`); 115/115 TASK06H TESTS PASS; 22/22 SHELL TESTS PASS; LIVE SUPABASE INVENTORY AUDITED (REAL `bsfwzvgynwriswapxpsp` READ-ONLY; TEMP `wvdabiwbaavfggcmpizd` ACTIVE_HEALTHY); BREVO AUDIT BASELINE RECORDED (0 AUTHENTICATED DOMAINS); STANDALONE DRY_RUN CLI ENTRYPOINT HARDENED; TEST 33 ADDED; READY FOR INDEPENDENT REVIEW AND SEPARATE OWNER H1 LIVE AUTHORIZATION** |
| Objective | Prepare a reliable, reviewable hosted security verification package for the strict Tio Auth architecture. Audit Supabase projects and Brevo sender readiness, document the 18-case probe matrix across Native Bypass, Token Hook, and Session/Consumer categories, harden runner defaults, and maintain strict fail-closed safety. |
| Implementation owner | Agent / Local Development & Security Research, Task 06I-B1-H1 slice |
| Previous agent | Agent / Task 06I-B1-H0-R7 author |
| Last audited HEAD | `716fb32061ffb6012d17eae9453c822a281fe6f1` (`main`, verified squash merge of PR #36) |
| Tracking / approval | Task 06I-B1-H1 preparation authorized by user prompt; LIVE hosted probe execution requires separate explicit owner authorization; mandates $0 cost ceiling and permanent immunity for `Tio-world` (`oykupyiitspujzpwwvuj`) and REAL `bsfwzvgynwriswapxpsp` |
| Branch | `test/task06i-b1-h1-hosted-security-preflight` |
| Base SHA / inspected HEAD | `716fb32061ffb6012d17eae9453c822a281fe6f1` (`main`) |
| Platform and file scope | Documentation, `.ai/` context, runner CLI hardening in `experiments/task06i/hosted-probe-runner.mjs`, and offline verification tests in `experiments/task06i/hosted-probe-runner.test.mjs`; zero client Expo UI, production schema, or live Auth mutations |
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

## 4. The 18-Case Hosted Security Verification Matrix

The H1 security matrix covers four core security areas with measurable PASS/FAIL criteria:

| Probe ID | Category | Target / Endpoint | Documented Capability | Expected Pass Criteria | Offline Parity Status |
|---|---|---|---|---|---|
| **BYPASS-01** | Native Bypass | `POST /auth/v1/otp` | `external_email_magic_link_disabled = true` | HTTP 422 (`email_provider_disabled`); 0 tokens issued | POSTGRES_VERIFIED |
| **BYPASS-02** | Native Bypass | `POST /auth/v1/signup` | `disable_signup = true` | HTTP 422 (`signup_disabled`); 0 tokens issued | POSTGRES_VERIFIED |
| **BYPASS-03** | Native Bypass | `POST /auth/v1/verify` (email & recovery) | Custom Access Token Hook fails closed on method `otp` or `recovery` | HTTP 500 (`Error invoking access token hook`); 0 tokens issued | POSTGRES_VERIFIED |
| **BYPASS-04** | Native Bypass | Magic Link, Invite & Anonymous | Custom Access Token Hook rejects non-password `authentication_method` | HTTP 500 (`Error invoking access token hook`); 0 tokens issued | POSTGRES_VERIFIED |
| **BYPASS-05** | Native Bypass | `POST /auth/v1/recover` | Send Email Hook intercepts `email_action_type = recovery` | HTTP 500 or generic anti-enumeration response; 0 recovery email/token delivered (`SQLSTATE 42501`) | POSTGRES_VERIFIED |
| **HOOK-01** | Token Hook | Password Sign-In | Custom Access Token Hook allows `authentication_method = password` | HTTP 200 with valid, non-empty `access_token` string and `amr_authenticated: true` | POSTGRES_VERIFIED |
| **HOOK-02** | Token Hook | Password Token Refresh | Hook parses `amr` object-array on `token_refresh` | HTTP 200 with fresh, non-empty `access_token` string and `amr_preserved: true` | POSTGRES_VERIFIED |
| **HOOK-03** | Token Hook | OTP-Origin Token Denial | Hook detects `amr` contains `otp` | HTTP 500 (`SQLSTATE 42501`); 0 tokens issued | POSTGRES_VERIFIED |
| **HOOK-04** | Token Hook | Recovery-Origin Token Denial | Hook detects `amr` contains `recovery` | HTTP 500 (`SQLSTATE 42501`); 0 tokens issued | POSTGRES_VERIFIED |
| **HOOK-05** | Token Hook | Mixed AMR Rejection | Full traversal of `claims.amr` rejects any disallowed method presence | HTTP 500 (`SQLSTATE 42501`); 0 tokens issued | POSTGRES_VERIFIED |
| **HOOK-06** | Token Hook | Malformed/Missing AMR Rejection | Strict JSON schema and RFC 8176 object validation in hook | HTTP 500 (`SQLSTATE 42501`); 0 tokens issued | POSTGRES_VERIFIED |
| **HOOK-07** | Token Hook | Fail-Closed Exception Handling | Hook runtime errors or syntax exceptions abort transaction | HTTP 500 (`Error invoking access token hook`); 0 tokens issued | POSTGRES_VERIFIED |
| **SESSION-01** | Session & Consumer | Session Minting | GoTrue creates session record on password grant | Session row present in `auth.sessions` matching `user_id` | SIMULATED / NOT TESTED |
| **SESSION-02** | Session & Consumer | Server Password Reset & Invalidation | Admin API `updateUserById` invalidates existing sessions | Sessions deleted/revoked in `auth.sessions`; count drops to 0 | SIMULATED / NOT TESTED |
| **SESSION-03** | Session & Consumer | Direct `/auth/v1/user` Revocation Rejection | GoTrue checks `auth.sessions` on every `/user` request | HTTP 403 Forbidden (`session_not_found`); correlated session verified | SIMULATED / NOT TESTED |
| **SESSION-04** | Session & Consumer | PostgREST Data API Linger Window | PostgREST validates signature statelessly without querying `auth.sessions` | Documented behavior: accepted until `exp`; bounded by short `jwt_exp` (300s) | SIMULATED / NOT TESTED |
| **SESSION-05** | Session & Consumer | Storage API Linger Window | Storage API validates signature statelessly without querying `auth.sessions` | Documented behavior: accepted until `exp`; bounded by short `jwt_exp` (300s) | SIMULATED / NOT TESTED |
| **SESSION-06** | Session & Consumer | Edge Function `auth.getUser()` Rejection | Edge Function invokes `supabase.auth.getUser()`, querying GoTrue | HTTP 403 / `AuthSessionMissingError` inside Edge Function; correlated session verified | SIMULATED / NOT TESTED |

---

## 5. Local Hardening & Preflight Verification Suite

### Changes Made:
1. **[hosted-probe-runner.mjs](file:///G:/projects/Tio-Workspace/experiments/task06i/hosted-probe-runner.mjs):**
   - Exported `BREVO_AUDIT_BASELINE` documenting observed free-tier relay status (0 authenticated domains, unauthenticated delivery blocked).
   - Added standalone CLI execution block defaulting strictly to `DRY_RUN` mode (`node experiments/task06i/hosted-probe-runner.mjs`).
2. **[hosted-probe-runner.test.mjs](file:///G:/projects/Tio-Workspace/experiments/task06i/hosted-probe-runner.test.mjs):**
   - Added **Test 33** asserting:
     - `HARDCODED_TEMP_REF` matches `wvdabiwbaavfggcmpizd` and does not equal REAL or Tio-world.
     - `BREVO_AUDIT_BASELINE` contracts are enforced.
     - 18 planned probe cases match the 5 / 7 / 6 category distribution.
     - `DRY_RUN` execution returns `zeroNetworkRequestsDispatched: true` and 18 planned probes.

### Test Results:

```powershell
node --test experiments/task06i/*.test.mjs
# 105 passed, 0 failed, exit code 0

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

## 6. Exact TEMP-Only LIVE Execution Proposal (For Future Authorization)

When the repository owner grants explicit written authorization for Task 06I-B1-H1 execution, the procedure will be:
1. **Pre-Execution Check:** Verify CLI credentials, organization inventory (confirm 2 active projects), and confirm target is `wvdabiwbaavfggcmpizd`.
2. **Deploy Security Hooks:** Apply [sql/hooks.sql](file:///G:/projects/Tio-Workspace/experiments/task06i/sql/hooks.sql) to project `wvdabiwbaavfggcmpizd` using Supabase CLI.
3. **Register Hooks via Management API:** PATCH project settings on `wvdabiwbaavfggcmpizd` to enable `hook_custom_access_token` and `hook_send_email`.
4. **Execute 18-Case Runner:** Run `hosted-probe-runner.mjs` with `--live` flag and `TASK06I_HOSTED_PROBE_AUTHORIZED=true`.
   - Bounded request budget: max 25 requests.
   - Throttling: minimum 1000ms between requests.
   - Per-probe timeout: 5000ms.
   - Immediate halt on any failed case (`HALTED_ON_FAILURE`).
5. **Post-Test User Cleanup:** Query and delete all synthetic test users created during testing (`@auth-proof.invalid`).
6. **Preserve TEMP Project:** Keep project `wvdabiwbaavfggcmpizd` intact for independent reviewer inspection until formal deletion package is approved.
7. **Zero Cost:** Execute strictly within Free tier limits ($0.00).

---

## 7. Recommendation & Approval Gates

- **Recommendation:** `READY_FOR_H1_LIVE_APPROVAL`
  - Offline preparation, preflight checks, runner hardening, and regression suites are complete and green.
  - Supabase target boundaries are immutable and verified.
- **Outstanding Owner Approvals:**
  - Gate 1: Review and merge this H1 preparation PR.
  - Gate 2: Explicit written authorization to proceed with Task 06I-B1-H1 LIVE execution against disposable TEMP `wvdabiwbaavfggcmpizd`.
- **Production Real Auth:** **STRICT NO-GO**.
