# Phase 1.2 Task 06I-B1-H1-R1 — Hosted Auth Security Verification Preparation

> **Local Preparation, Preflight Audit, Offline Validation & Reviewable PR.** Prepared under `AGENTS.md` operating rules. This document establishes the offline verification baseline, safety boundaries, Brevo sending readiness assessment, complete TEMP-only testbed setup specification, exact run-scoped identity cleanup, and read-only execution plan for Task 06I-B1-H1-R1. Zero hosted LIVE probes, mutations, Auth Hook deployments, or test users have been executed. Production Real Auth remains **STRICT NO-GO**.

| Field | Value |
|---|---|
| Status | **LOCAL PREPARATION & PREFLIGHT VERIFICATION COMPLETE (REVISION R1); PR #36 SQUASH MERGE VERIFIED AT `716fb32061ffb6012d17eae9453c822a281fe6f1`; 108/108 TASK06I TESTS PASS; 18/18 POSTGRESQL PARITY PASS (`POSTGRES_VERIFIED`); 115/115 TASK06H TESTS PASS; 22/22 SHELL TESTS PASS; LIVE SUPABASE INVENTORY AUDITED (REAL `bsfwzvgynwriswapxpsp` READ-ONLY; TEMP `wvdabiwbaavfggcmpizd` ACTIVE_HEALTHY); BREVO AUDIT BASELINE RECORDED (0 AUTHENTICATED DOMAINS); STANDALONE DRY_RUN CLI ENTRYPOINT HARDENED; LIVE DISPATCHER CONTRACT DEFINED (`createHostedDispatcher`); DETERMINISTIC ID-BASED RUN INVENTORY IMPLEMENTED (`TestRunInventory`); COMPLETE TESTBED FIXTURE SPECIFICATION CREATED (`sql/testbed-fixtures.sql`); EVIDENCE CLASSIFICATION AUDITED (ALL 18 HOSTED PROBES MARKED `HOSTED_NOT_TESTED`; 0 HOSTED VERIFIED); TESTS 33-36 PASS; READY FOR INDEPENDENT REVIEW AND SEPARATE OWNER H1 LIVE AUTHORIZATION** |
| Objective | Resolve the four independent reviewer findings on PR #37 (R1-01: LIVE CLI dispatcher contract, R1-02: complete TEMP testbed specification, R1-03: deterministic run-scoped identity cleanup, R1-04: accurate evidence classification). Maintain strict fail-closed safety and $0 cost ceiling. |
| Implementation owner | Agent / Local Development & Security Research, Task 06I-B1-H1-R1 slice |
| Previous agent | Agent / Task 06I-B1-H1 author |
| Last audited HEAD | `326ff34c13a5bd30fc85e2244e4de859a097aff2` (PR #37 initial commit) |
| Tracking / approval | Task 06I-B1-H1-R1 remediation authorized by user prompt; LIVE hosted probe execution requires separate explicit owner authorization; mandates $0 cost ceiling and permanent immunity for `Tio-world` (`oykupyiitspujzpwwvuj`) and REAL `bsfwzvgynwriswapxpsp` |
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

## 4. The 18-Case Security Matrix & Accurate Evidence Classification (Resolving R1-04)

`sql-contract-parity.mjs` verifies only PostgreSQL hook functions (`custom_access_token_hook` and `send_email_hook`), NOT GoTrue HTTP endpoints. In accordance with reviewer finding `PRRT_kwDOVtCmZc66lEzl`, hook-level parity is explicitly separated from hosted endpoint verification. **All 18 hosted probes remain `HOSTED_NOT_TESTED` (0 / 18 hosted verified):**

| Probe ID | Category | Target / Endpoint | Documented Capability | Expected Pass Criteria | Local / Hook Parity Status | Hosted Endpoint Status |
|---|---|---|---|---|---|---|
| **BYPASS-01** | Native Bypass | `POST /auth/v1/otp` | `external_email_magic_link_disabled = true` | HTTP 422 (`email_provider_disabled`); 0 tokens issued | OFFLINE_CONTRACT_TESTED | **HOSTED_NOT_TESTED** |
| **BYPASS-02** | Native Bypass | `POST /auth/v1/signup` | `disable_signup = true` | HTTP 422 (`signup_disabled`); 0 tokens issued | OFFLINE_CONTRACT_TESTED | **HOSTED_NOT_TESTED** |
| **BYPASS-03** | Native Bypass | `POST /auth/v1/verify` (email & recovery) | Hook fails closed on method `otp` or `recovery` | HTTP 500 (`Error invoking access token hook`); 0 tokens issued | POSTGRES_HOOK_PARITY_VERIFIED | **HOSTED_NOT_TESTED** |
| **BYPASS-04** | Native Bypass | Magic Link, Invite & Anonymous | Hook rejects non-password `authentication_method` | HTTP 500 (`Error invoking access token hook`); 0 tokens issued | POSTGRES_HOOK_PARITY_VERIFIED | **HOSTED_NOT_TESTED** |
| **BYPASS-05** | Native Bypass | `POST /auth/v1/recover` | Send Email Hook intercepts `email_action_type = recovery` | HTTP 500 or generic anti-enumeration response; 0 recovery email/token delivered (`SQLSTATE 42501`) | POSTGRES_HOOK_PARITY_VERIFIED | **HOSTED_NOT_TESTED** |
| **HOOK-01** | Token Hook | Password Sign-In | Hook allows `authentication_method = password` | HTTP 200 with valid, non-empty `access_token` string and `amr_authenticated: true` | POSTGRES_HOOK_PARITY_VERIFIED | **HOSTED_NOT_TESTED** |
| **HOOK-02** | Token Hook | Password Token Refresh | Hook parses `amr` object-array on `token_refresh` | HTTP 200 with fresh, non-empty `access_token` string and `amr_preserved: true` | POSTGRES_HOOK_PARITY_VERIFIED | **HOSTED_NOT_TESTED** |
| **HOOK-03** | Token Hook | OTP-Origin Token Denial | Hook detects `amr` contains `otp` | HTTP 500 (`SQLSTATE 42501`); 0 tokens issued | POSTGRES_HOOK_PARITY_VERIFIED | **HOSTED_NOT_TESTED** |
| **HOOK-04** | Token Hook | Recovery-Origin Token Denial | Hook detects `amr` contains `recovery` | HTTP 500 (`SQLSTATE 42501`); 0 tokens issued | POSTGRES_HOOK_PARITY_VERIFIED | **HOSTED_NOT_TESTED** |
| **HOOK-05** | Token Hook | Mixed AMR Rejection | Full traversal of `claims.amr` rejects any disallowed method presence | HTTP 500 (`SQLSTATE 42501`); 0 tokens issued | POSTGRES_HOOK_PARITY_VERIFIED | **HOSTED_NOT_TESTED** |
| **HOOK-06** | Token Hook | Malformed/Missing AMR Rejection | Strict JSON schema and RFC 8176 object validation in hook | HTTP 500 (`SQLSTATE 42501`); 0 tokens issued | POSTGRES_HOOK_PARITY_VERIFIED | **HOSTED_NOT_TESTED** |
| **HOOK-07** | Token Hook | Fail-Closed Exception Handling | Hook runtime errors or syntax exceptions abort transaction | HTTP 500 (`Error invoking access token hook`); 0 tokens issued | POSTGRES_HOOK_PARITY_VERIFIED | **HOSTED_NOT_TESTED** |
| **SESSION-01** | Session & Consumer | Session Minting | GoTrue creates session record on password grant | Session row present in `auth.sessions` matching `user_id` | SIMULATED | **HOSTED_NOT_TESTED** |
| **SESSION-02** | Session & Consumer | Server Password Reset & Invalidation | Admin API `updateUserById` invalidates existing sessions | Sessions deleted/revoked in `auth.sessions`; count drops to 0 | SIMULATED | **HOSTED_NOT_TESTED** |
| **SESSION-03** | Session & Consumer | Direct `/auth/v1/user` Revocation Rejection | GoTrue checks `auth.sessions` on every `/user` request | HTTP 403 Forbidden (`session_not_found`); correlated session verified | SIMULATED | **HOSTED_NOT_TESTED** |
| **SESSION-04** | Session & Consumer | PostgREST Data API Linger Window | PostgREST validates signature statelessly without querying `auth.sessions` | Documented behavior: accepted until `exp`; bounded by short `jwt_exp` (300s) | SIMULATED | **HOSTED_NOT_TESTED** |
| **SESSION-05** | Session & Consumer | Storage API Linger Window | Storage API validates signature statelessly without querying `auth.sessions` | Documented behavior: accepted until `exp`; bounded by short `jwt_exp` (300s) | SIMULATED | **HOSTED_NOT_TESTED** |
| **SESSION-06** | Session & Consumer | Edge Function `auth.getUser()` Rejection | Edge Function invokes `supabase.auth.getUser()`, querying GoTrue | HTTP 403 / `AuthSessionMissingError` inside Edge Function; correlated session verified | SIMULATED | **HOSTED_NOT_TESTED** |

---

## 5. R1 Security Review Remediation Details

### R1-01 — Executable LIVE Dispatcher Contract (`PRRT_kwDOVtCmZc66lEzb`)
- **Implemented Factory:** `createHostedDispatcher({ projectRef, anonKey, serviceRoleKey, fetchFn })` in [hosted-probe-runner.mjs](file:///G:/projects/Tio-Workspace/experiments/task06i/hosted-probe-runner.mjs).
- **Target Safety:** Rejects any `projectRef` other than `HARDCODED_TEMP_REF` (`wvdabiwbaavfggcmpizd`).
- **Fail-Closed Gate:** CLI execution (`node experiments/task06i/hosted-probe-runner.mjs --live`) immediately fails with nonzero exit code `1` and actionable error message:
  - If `TASK06I_HOSTED_PROBE_AUTHORIZED !== 'true'`: `AUTHORIZATION_REQUIRED`.
  - If `SUPABASE_ANON_KEY` is missing: `MISSING_HOSTED_CREDENTIALS`.
- **DRY_RUN Invariance:** Running without flags executes in `DRY_RUN` mode with `zeroNetworkRequestsDispatched: true` (exit code `0`).

### R1-02 — Complete TEMP Testbed Setup Specification (`PRRT_kwDOVtCmZc66lEze`)
- **Created Specification File:** [experiments/task06i/sql/testbed-fixtures.sql](file:///G:/projects/Tio-Workspace/experiments/task06i/sql/testbed-fixtures.sql).
- **Management API PATCH:** Documents exact payload required on `wvdabiwbaavfggcmpizd`:
  - `external_email_magic_link_disabled: true`
  - `disable_signup: true`
  - `jwt_exp: 300`
  - `hook_custom_access_token_enabled: true`
  - `hook_send_email_enabled: true`
- **Hook Grants:** `GRANT EXECUTE` on both hooks to `supabase_auth_admin`; revoked from `public`, `anon`, `authenticated`.
- **Database Table Fixture:** `public.task06i_session_probe` with RLS (`auth.uid() = user_id`) for `SESSION-04`.
- **Storage Bucket Fixture:** Private bucket `task06i_probe_bucket` with RLS for `SESSION-05`.
- **Seed User Provisioning:** Uses Admin API (`POST /auth/v1/admin/users`) with `email_confirm: true` to provision seed password user compatible with disabled public signup.

### R1-03 — Exact Run-Scoped Identity & Fixture Cleanup (`PRRT_kwDOVtCmZc66lEzi`)
- **Implemented Class:** `TestRunInventory` in [hosted-probe-runner.mjs](file:///G:/projects/Tio-Workspace/experiments/task06i/hosted-probe-runner.mjs).
- **Exact Tracking:** Tracks exact synthetic user UUIDs, normalized emails, session IDs, database table row IDs, and storage object paths.
- **Deterministic ID-Based Deletion:** Deletes resources strictly by tracked ID via `adminClient.deleteUser(id)`, `deleteTableRow(table, id)`, `deleteStorageObject(bucket, path)`. Never deletes untracked or pre-existing identities.
- **Affirmative Verification:** Queries `adminClient.getUserById(id)` for every tracked user; fails closed with `CLEANUP_FAILED_RESIDUAL_RESOURCES` if any tracked resource still exists.
- **Eliminated Domain Mismatch:** Standardized test identity across runner and plan to `tio-test-user-06i@proof.invalid`.

### R1-04 — Accurate Evidence Classification (`PRRT_kwDOVtCmZc66lEzl`)
- Fixed 18-case matrix in Section 4 to clearly separate PostgreSQL hook function parity (`POSTGRES_HOOK_PARITY_VERIFIED`) from hosted HTTP endpoint outcomes (`HOSTED_NOT_TESTED`).
- Added **Test 36** auditing preflight requirements and ensuring 0 hosted cases are falsely marked verified.

---

## 6. Verification Matrix

```powershell
node --test experiments/task06i/*.test.mjs
# 108 passed, 0 failed, exit code 0

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

## 7. Exact TEMP-Only LIVE Execution Proposal (For Future Authorization)

When the repository owner grants explicit written authorization for Task 06I-B1-H1 execution, the procedure will be:
1. **Pre-Execution Check:** Verify CLI credentials, organization inventory (confirm 2 active projects), and confirm target is `wvdabiwbaavfggcmpizd`.
2. **Deploy Security Hooks & Fixtures:** Apply [sql/testbed-fixtures.sql](file:///G:/projects/Tio-Workspace/experiments/task06i/sql/testbed-fixtures.sql) to project `wvdabiwbaavfggcmpizd` using Supabase CLI.
3. **Register Hooks via Management API:** PATCH project settings on `wvdabiwbaavfggcmpizd` (`external_email_magic_link_disabled=true`, `disable_signup=true`, `jwt_exp=300`, and both hook registrations).
4. **Seed Password Test User:** Call Admin API `POST /auth/v1/admin/users` to create synthetic seed user and register in `TestRunInventory`.
5. **Execute 18-Case Runner:** Run `hosted-probe-runner.mjs` with `--live` flag, `TASK06I_HOSTED_PROBE_AUTHORIZED=true`, and `SUPABASE_ANON_KEY`.
   - Bounded request budget: max 25 requests.
   - Throttling: minimum 1000ms between requests.
   - Per-probe timeout: 5000ms.
   - Immediate halt on any failed case (`HALTED_ON_FAILURE`).
6. **Deterministic Cleanup & Post-Test Verification:** Execute `inventory.executeCleanup({ adminClient })`; verify 0 residual resources remain.
7. **Preserve TEMP Project:** Keep project `wvdabiwbaavfggcmpizd` intact for independent reviewer inspection until formal deletion package is approved.
8. **Zero Cost:** Execute strictly within Free tier limits ($0.00).

---

## 8. Hard STOP Gate & Recommendation

- **Hard STOP Gate Honored:**
  - Zero hosted LIVE probes execute hue hain.
  - Zero TEMP Auth configuration PATCHes execute hue hain.
  - Zero hosted SQL deployments execute hue hain.
  - Zero test users create hue hain.
  - Zero live emails dispatch hui hain.
  - Real Auth implementation start nahi hui hai.
  - Project deletion perform nahi hua hai.

**Recommendation:** **`READY_FOR_H1_LIVE_APPROVAL_REVIEW`**

> **Important:** Production Real Auth remains **STRICT NO-GO**. Local remediation for R1-01, R1-02, R1-03, and R1-04 is complete and fully covered by offline regression tests (108/108 pass). Awaiting independent re-review from `im-tio`.
