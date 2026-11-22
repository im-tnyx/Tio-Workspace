# Phase 1.2 Task 06I-B1-H0-R2 — Final P1 Security Gate Closure & TEMP Lifecycle Preservation

> **Target-Safety Decision Record, P1 Security Remediation Proofs, Live Inventory Audit & TEMP Project Provisioning Package.** Prepared under `AGENTS.md` operating rules. This document establishes deterministic local security verification, remediates all independent P1 review findings on PR #36 (immutable boundary, strict outcome validation, serialized JSON redaction), preserves the owner-directed TEMP lifecycle & deletion policy, audits Supabase organization inventory, and prepares the dry-run probe harness and TEMP project creation approval package. It does not authorize creating, modifying, or deleting any hosted Supabase project. Production Real Auth remains **NO-GO**.

| Field | Value |
|---|---|
| Status | **PR #36 P1 SECURITY REMEDIATION (REVISION R2) COMPLETE; 91/91 TASK06I TESTS PASS; 18/18 POSTGRESQL PARITY PASS (ON_ERROR_STOP=1 + ROLE GRANTS VERIFIED); LIVE INVENTORY AUDITED (2 ACTIVE PROJECTS: REAL `bsfwzvgynwriswapxpsp` + OWNER-CREATED TEMP `wvdabiwbaavfggcmpizd`); TEMP LIFECYCLE & DELETION POLICY PRESERVED; 3 P1 THREADS RESOLVED; AWAITING INDEPENDENT RE-REVIEW SIGN-OFF FROM IM-TIO** |
| Objective | Resolve the three independent P1 security findings on PR #36 (immutable project boundary, strict probe outcome validation, and serialized JSON secret redaction), configure verified owner TEMP project `wvdabiwbaavfggcmpizd`, preserve the codified TEMP lifecycle policy, maintain zero host port exposure, and verify all test suites without executing hosted mutations |
| Implementation owner | Agent / Local Development & Security Research, Task 06I-B1-H0-R2 slice |
| Previous agent | Agent / Task 06I-B1-H0-R1 author |
| Last audited HEAD | `a1305e6ee7678de84a44a2b66de224e5c68b5ee1` (PR #36 post-H0-R1 commit) |
| Tracking / approval | Task 06I-B1-H0-R2 authorized by user prompt; owner mandates resolving all 3 P1 findings without modifying production resources; owner preserves TEMP Project Lifecycle & Deletion Policy; mandates $0 cost and permanent immunity for `Tio-world` and REAL `bsfwzvgynwriswapxpsp`; hosted mutations strictly prohibited |
| Branch | `docs/task06i-b1-h0-hosted-readiness-harness` |
| Base SHA / inspected HEAD | `7150cec4c2e1e9aaa8e75d2cbcb3a23a6dca532e` (`main`, verified up to date with `origin/main`) |
| Platform and file scope | Documentation, `.ai/` context, isolated offline and local PostgreSQL test harnesses under `experiments/task06i/`, and dry-run probe runner; zero client Expo UI, production schema, or live Auth changes |
| Created / updated | 2026-11-22 |

---

## 1. Post-Merge Git Baseline & Context Verification

### Live Repository Status
- PR #35 ([#35](https://github.com/im-tnyx/Tio-Workspace/pull/35)) successfully merged via squash at commit `7150cec4c2e1e9aaa8e75d2cbcb3a23a6dca532e`.
- Local `main` fast-forwarded to `7150cec4c2e1e9aaa8e75d2cbcb3a23a6dca532e` with zero divergence.
- Feature branch `docs/task06i-b1-managed-auth-preflight` safely deleted locally and on `origin`.
- Post-merge GitHub Actions runs on `main` (`7150cec`):
  - `Security experiment checks` (Run `45008498574`): **SUCCESS**
  - `Post-merge attribution audit` (Run `45008498571`): **SUCCESS**
  - `Commit attribution fixture tests` (Run `45008498533`): **SUCCESS**
- Trusted guard variable reminder: Owner must remove `ATTRIBUTION_GUARD_CHANGE_APPROVED_PR_HEAD` from GitHub `attribution-guard-trusted` environment.

---

## 2. Live Supabase Organization & Project Inventory Audit (Phase B)

Inspection was executed using Supabase CLI v2.121.0 in read-only mode (`projects list --output-format json` and `orgs list --output-format json`):

```powershell
& "G:\dev\supabase-cli\v2.121.0\supabase.exe" orgs list --output-format json
# {"organizations":[{"id":"llmbrmxhyirtoqndazpg","slug":"llmbrmxhyirtoqndazpg","name":"Tio-tnyx"}],"message":""}

& "G:\dev\supabase-cli\v2.121.0\supabase.exe" projects list --output-format json
# {"projects":[{"id":"bsfwzvgynwriswapxpsp","ref":"bsfwzvgynwriswapxpsp","organization_id":"llmbrmxhyirtoqndazpg","organization_slug":"llmbrmxhyirtoqndazpg","name":"Tio-Tnyx","region":"ap-south-1","created_at":"2026-11-14T17:05:07.049773Z","status":"ACTIVE_HEALTHY","database":{"host":"db.bsfwzvgynwriswapxpsp.supabase.co","version":"17.11.0.019","postgres_engine":"17","release_channel":"ga"},"linked":false},{"id":"wvdabiwbaavfggcmpizd","ref":"wvdabiwbaavfggcmpizd","organization_id":"llmbrmxhyirtoqndazpg","organization_slug":"llmbrmxhyirtoqndazpg","name":"Tio-Tnyx-Auth-Temp","region":"ap-south-1","created_at":"2026-11-22T09:36:00.38724Z","status":"ACTIVE_HEALTHY","database":{"host":"db.wvdabiwbaavfggcmpizd.supabase.co","version":"17.12.0.000","postgres_engine":"17","release_channel":"ga"},"linked":false}],"message":""}
```

### Inventory Findings & Quota Reconciliation
1. **Organization:** `llmbrmxhyirtoqndazpg` ("Tio-tnyx")
2. **Plan Tier:** Free plan
3. **Current Active Projects (Count: 2 / 2):**
   - Ref: `bsfwzvgynwriswapxpsp` | Name: `Tio-Tnyx` | Region: `ap-south-1` | Status: `ACTIVE_HEALTHY` | Role: **REAL production application backend** (Protected, READ-ONLY, permanently forbidden from test targeting).
   - Ref: `wvdabiwbaavfggcmpizd` | Name: `Tio-Tnyx-Auth-Temp` | Region: `ap-south-1` | Status: `ACTIVE_HEALTHY` | Role: **Owner-created disposable TEMP testbed** (Configured as `HARDCODED_TEMP_REF`).
4. **`Tio-world` Status:** Historical ref `oykupyiitspujzpwwvuj` is **absent** from the latest connected organization project list. It remains permanently hard-blocked in code.
5. **Free Project Capacity:** Both allowed Free tier project slots are now active. Zero provisioning needed.
6. **TEMP Project Status:** Verified created by owner (`wvdabiwbaavfggcmpizd`). Zero hosted mutations, PATCHes, migrations, or user creations have been executed.
7. **Cost Ceiling:** **$0.00** (Free tier active projects; zero billable add-ons).

---

## 3. Revised Target-Safety Architecture: Clean TEMP vs REAL Separation

### Environmental Architecture Mapping

| Environment | Project Name | Project Ref | Region | Purpose & Security Boundary | Protection Status |
|---|---|---|---|---|---|
| **REAL** | `Tio-Tnyx` | `bsfwzvgynwriswapxpsp` | `ap-south-1` | Future real application backend | **PROTECTED & READ-ONLY.** Permanently forbidden from test targeting in `hosted-probe-runner.mjs`. |
| **TEMP** | `Tio-Tnyx-Auth-Temp` | `wvdabiwbaavfggcmpizd` | `ap-south-1` | Dedicated disposable managed Auth security testbed | **Owner-Created Active Healthy.** Configured as `HARDCODED_TEMP_REF`. LIVE execution disabled pending separate H1 authorization. |
| **IMMUNE** | `Tio-world` | `oykupyiitspujzpwwvuj` | N/A | Historical project | **PERMANENT IMMUNITY.** Hardcoded in `IMMUTABLE_FORBIDDEN_PROJECTS`. Never touched, paused, restored, or created. |

### Verified TEMP Project Integration Status
- **Owner Action:** Project `Tio-Tnyx-Auth-Temp` (`wvdabiwbaavfggcmpizd`) was created by the owner in organization `llmbrmxhyirtoqndazpg` at region `ap-south-1` ($0 Free tier slot).
- **Test Configuration:** Hardcoded as `HARDCODED_TEMP_REF = 'wvdabiwbaavfggcmpizd'` in `hosted-probe-runner.mjs`.
- **Live Status:** Probe execution remains **STRICTLY DISABLED**. No network dispatcher is active; no Management API PATCHes, hook registrations, migrations, or test users have been created.
- **Separation Guarantee:** Real project `bsfwzvgynwriswapxpsp` and `oykupyiitspujzpwwvuj` remain unconditionally blocked by hardcoded checks.
- **Preservation & Deletion Gate:** Project `wvdabiwbaavfggcmpizd` must be preserved throughout testing and review cycles. Deletion requires a separate, explicit owner command.

---

## 4. Remediation of PR #36 Independent Review Findings (Phase A)

All 8 review threads on PR #36 have been resolved with regression tests:

### 1. `PRRT_kwDOVtCmZc66ij5y` — Remove Fake LIVE Success Placeholder
- **Root Cause:** In `hosted-probe-runner.mjs`, when `--live` mode was invoked without a `mockDispatcher`, the runner assigned `{ status: 500, passed: true }` and marked the run `COMPLETED`.
- **Remediation:** Removed the synthetic placeholder. In `LIVE` mode, the runner now validates that `typeof mockDispatcher === 'function'`. If missing, it immediately throws `NO_HOSTED_DISPATCHER: live hosted execution requires a configured network dispatcher; synthetic placeholder execution prohibited`.
- **Test:** `hosted-probe-runner.test.mjs` (Test 11).

### 2. `PRRT_kwDOVtCmZc66ij5z` — Portable Node.js Docker Readiness Logic
- **Root Cause:** `sql-contract-parity.mjs` used `powershell Start-Sleep -Milliseconds 400` in the readiness poll loop, failing on Linux/Ubuntu CI runners, and had an 8s timeout that could fail during image pulls.
- **Remediation:** Replaced with portable synchronous Node.js sleep (`sleepSync` using `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)`), increased container startup timeout to 30s, and expanded readiness retries to 20 cycles (up to 8s poll window).
- **Test:** `sql-contract-parity.mjs` and `security-harness.test.mjs` (Test 13).

### 3. `PRRT_kwDOVtCmZc66ij51` — Honest Classification When Docker Unavailable
- **Root Cause:** When Docker was unavailable, `verifyParityMatrix` ran offline JS checks and counted them in `passedParity: 18`, falsely representing JS evaluation as PostgreSQL parity proof.
- **Remediation:** When Docker is unavailable, the runner sets `passedParity: 0`, `status: 'POSTGRES_NOT_EXECUTED'`, `verifiedInPostgres: false`, and logs `Docker runtime unavailable in execution environment`. JS-only tests are never counted as PostgreSQL parity passes.
- **Test:** `security-harness.test.mjs` (Test 13 conditional branch).

### 4. `PRRT_kwDOVtCmZc66ij55` — Comprehensive Secret Sanitization
- **Root Cause:** `sanitizeData` regex did not redact query parameters (`?token=...&password=...`), Bearer authorization headers with arbitrary tokens, or deeply nested credential arrays.
- **Remediation:** Rewrote `sanitizeData` string regexes:
  - Bearer headers: `/Bearer\s+[^\s"';,]+/gi` → `Bearer [REDACTED]`
  - Full JWTs: `/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g` → `[REDACTED_JWT]`
  - Query parameters: `/([?&](?:token|token_hash|secret|password|api_key|apikey|service_role)=)([^&\s]+)/gi` → `$1[REDACTED]`
  - Text key/values: `/((?:api_key|apikey|secret|password|token_hash|token|service_role)\s*[:=]\s*['"]?)[^'"\s&,]+/gi` → `$1[REDACTED]`
  - Recursive object and array sanitization for any key containing `secret`, `password`, `token`, `key`, `auth`, `bearer`, or `credential`.
- **Test:** `hosted-probe-runner.test.mjs` (Test 9).

### 5. `PRRT_kwDOVtCmZc66ij56` — Request Interval Throttling Enforcement
- **Root Cause:** `RATE_LIMIT_CONFIG.minIntervalMs` (1000ms) was defined but never invoked in the probe execution loop.
- **Remediation:** Injected `sleepFn = (ms) => new Promise(r => setTimeout(r, ms))` and invoked `await sleepFn(RATE_LIMIT_CONFIG.minIntervalMs)` before each consecutive probe request ($i > 0$).
- **Test:** `hosted-probe-runner.test.mjs` (Test 12: verified 17 throttling pauses of exactly 1000ms across 18 requests).

### 6. `PRRT_kwDOVtCmZc66iotG` — Fail-Fast Stop Gate on Every Requirement Category
- **Root Cause:** Stop gate checked `criticalBypass && probeResult.passed === false`, so failures in `Token Hook` (`HOOK-*`) or `Session & Consumer` (`SESSION-*`) did not halt execution and returned `status: 'COMPLETED'`.
- **Remediation:** Removed category filtering from the stop gate. If **ANY** probe returns `passed === false`, the runner sets `aborted = true`, records `CRITICAL_SECURITY_FAILURE`, halts immediately, and returns `status: 'HALTED_ON_FAILURE'`.
- **Tests:** `hosted-probe-runner.test.mjs` (Test 13 for `HOOK-01` failure; Test 14 for `SESSION-03` failure).

### 7. `PRRT_kwDOVtCmZc66iotJ` — `ON_ERROR_STOP=1` and Least-Privilege Grants Verification
- **Root Cause:** `psql` was invoked without `ON_ERROR_STOP=1`, and stock `postgres:17` lacks Supabase roles `anon` and `authenticated`, so `REVOKE` statements failed silently without failing deployment.
- **Remediation:**
  1. Updated `experiments/task06i/sql/hooks.sql` to idempotently provision `supabase_auth_admin`, `anon`, and `authenticated` fixture roles before grant execution.
  2. Invoked `psql` with `-v ON_ERROR_STOP=1` for both deployment and test execution.
  3. Implemented `verifyRoleGrantsAndRevocations(containerName)` checking `has_function_privilege`: confirms `supabase_auth_admin` has `EXECUTE`, while `anon`, `authenticated`, and `public` are explicitly revoked (`f`).
- **Test:** `sql-contract-parity.mjs` and `security-harness.test.mjs` (Test 13).

### 8. `PRRT_kwDOVtCmZc66iotM` — Deep-Compare Normalized SQL/JS Outputs & Discrepancy Detection
- **Root Cause:** Output comparison only checked allow/deny boolean and `amr_authenticated`, so claim drops (e.g. missing `sub`) or non-empty Send Email responses would falsely pass parity.
- **Remediation:**
  1. Implemented deep equality comparison (`isDeepEqual` via `assert.deepStrictEqual`) comparing the full normalized JSON result on all successful cases.
  2. Verified that denied cases assert exact SQLSTATE `42501` in both PostgreSQL and JS.
  3. Added deliberate mismatch regression test verifying that dropped claims, tampered claims, or non-empty Send Email Hook outputs fail parity.
- **Test:** `security-harness.test.mjs` (Test 14).

### 9. `PRRT_kwDOVtCmZc66i_Kb` (R2-01) — Immutable Forbidden Project Boundary
- **Root Cause:** In JavaScript, `Object.freeze(new Set(...))` does not freeze Set entries; calling `.delete()` on the exported Set succeeded, allowing caller mutation to disable the protection boundary.
- **Remediation:**
  1. Removed exported mutable Set as an authoritative security boundary.
  2. Implemented direct hardcoded identity comparisons (`HARDCODED_REAL_REF = 'bsfwzvgynwriswapxpsp'`, `HARDCODED_TIO_WORLD_REF = 'oykupyiitspujzpwwvuj'`) and an unexported private frozen array `INTERNAL_FORBIDDEN_REFS`.
  3. Authoritative checks in `validateTargetProject` evaluate constants directly, making protection unconditionally immune to Set mutation, export tampering, env overrides, or `tempRef` spoofing.
  4. Exported `IMMUTABLE_FORBIDDEN_PROJECTS` as an immutable lookup interface whose mutation methods (`delete`, `add`, `clear`) throw `TypeError`.
- **Tests:** `hosted-probe-runner.test.mjs` (Tests 1, 2, 2b, 2c).

### 10. `PRRT_kwDOVtCmZc66i_Kd` (R2-02) — Strict Probe Outcome Validation
- **Root Cause:** The runner only checked `probeResult.passed === false`, so dispatcher results missing `passed` (e.g. `{ status: 500 }`) or returning false passes (e.g. `{ status: 200, passed: true }` on `BYPASS-01`) proceeded and reported `COMPLETED`.
- **Remediation:**
  1. Implemented `validateProbeOutcome(item, rawOutcome)` requiring explicit boolean `passed`. Missing, null, or non-boolean values fail closed immediately.
  2. Independent requirement-specific expectation audit:
     - `BYPASS-01` to `BYPASS-04`: Receiving HTTP 200 or tokens overrides `passed` to `false` (`HTTP_STATUS_MISMATCH` / `SECURITY_INVARIANT_VIOLATION`).
     - `BYPASS-05`: Receiving recovery token or recovery email overrides to `false`.
     - `HOOK-01` & `HOOK-02`: Must return HTTP 200 and issue token (`amr_authenticated`).
     - `HOOK-03` to `HOOK-07`: Disallowed AMR must reject token issuance.
     - `SESSION-01` to `SESSION-06`: Explicit session creation, revocation, and rejection validation.
  3. Wrapped dispatcher in `try...catch` to catch exceptions/timeouts and fail closed (`DISPATCHER_EXCEPTION`).
  4. Guaranteed that `COMPLETED` is returned only when 100% of the 18 planned cases execute and pass; partial execution returns `HALTED_ON_FAILURE`.
- **Tests:** `hosted-probe-runner.test.mjs` (Tests 12, 13, 14, 15, 16, 17, 18, 19, 20).

### 11. `PRRT_kwDOVtCmZc66i_Kf` (R2-03) — Serialized JSON Secret Redaction
- **Root Cause:** String regexes did not recognize quoted JSON fields (e.g. `{"password":"PRIVATE_VALUE","refresh_token":"REFRESH_PRIVATE"}`), leaving secrets unredacted in JSON strings and serialized dispatcher response bodies (`outcome.body`).
- **Remediation:**
  1. Updated `sanitizeData` to detect structured JSON strings (starting with `{` or `[`), safely parse them with `JSON.parse`, recursively sanitize the structured object/array, and re-serialize to JSON.
  2. Redacted sensitive keys across `password`, `refresh_token`, `access_token`, `service_role`, `api_key`, `authorization`, `bearer`, and `credential`.
  3. Fail-closed regex redaction for unparseable/malformed JSON strings ensuring secret values are redacted even if JSON syntax is invalid.
  4. Verified that sensitive values are completely absent from both sanitized string output and final runner `results`.
- **Tests:** `hosted-probe-runner.test.mjs` (Tests 9, 9b, 21).

---

## 5. Local Security Harness & Parity Verification Results (Phase E)

| Test Suite / Script | Command | Cases / Result | Exit Code | Notes |
|---|---|---|---|---|
| Task 06I Security Suite | `node --test experiments/task06i/*.test.mjs` | **91 passed**, 0 failed | `0` | All 4 test files pass: allowlist (37), evaluator (15), probe runner (25), harness (14) |
| PostgreSQL 17.11 Parity Check | `node experiments/task06i/sql-contract-parity.mjs` | **18 passed**, 0 failed | `0` | Live Docker PostgreSQL 17.11 with zero host ports; `ON_ERROR_STOP=1`; grants verified |
| Task 06H Historical Suite | `node --test experiments/task06h/*.test.mjs` | **115 passed**, 0 failed | `0` | Phase 1 Auth Shell contract baseline clean |
| Workspace Repository Verification | `npm run verify` | **22 shell contract passed** | `0` | Tokens clean, `tsc` clean, `eslint` clean |
| Base-to-HEAD Diff Check | `git diff --check origin/main...HEAD` | Clean, 0 whitespace errors | `0` | Zero trailing whitespace |

---

## 6. TEMP Project Lifecycle & Deletion Policy (Owner Direction)

Under authoritative owner direction issued 2026-11-22, the lifecycle, preservation window, and deletion protocol for the disposable TEMP test environment are defined as follows:

### 1. Scope & Disposable Identity
- The TEMP project (`Tio-Tnyx-Auth-Temp`) is strictly a **disposable security testbed** created exclusively for executing Task 06I-B1 hosted managed Auth verification.
- It possesses zero production status, holds no customer or production data, and exists in strict isolation from REAL project `bsfwzvgynwriswapxpsp`.

### 2. Pre-Testing Approval Gate
- Creation of the TEMP project does **not** authorize probe execution.
- Only after all PR #36 security findings are fully resolved and independent review sign-off is achieved will a separate, bounded authorization for hosted testing (Task 06I-B1-H1) be requested from the owner.

### 3. Preservation Window
- The TEMP project must be **preserved intact** through all stages of verification:
  - 18-case hosted probe matrix execution (BYPASS, HOOK, SESSION).
  - Negative control cases (unregistered hooks, invalid tokens, cross-purpose probes).
  - Post-test user cleanup verification (Admin API user deletion).
  - Independent reviewer inspection and recorded sign-off.
- The project must not be torn down prematurely while reviewer questions, test inspections, or evidence validation remain open.

### 4. Evidence Archival & Zero-Secret Policy
- All test evidence, sanitized logs, execution matrices, and reproducible configuration must be safely recorded and committed to GitHub under `experiments/task06i/` or task documentation.
- **Strict Zero-Secret Invariant**: Database passwords, JWT signing secrets, service-role keys, and personal access tokens must **never** be committed to GitHub or logged in unredacted form. Only sanitized traces passing `sanitizeData` may be recorded.

### 5. Retesting & Project Pausing Option
- If further testing or follow-up iterations are anticipated after an initial test run, the TEMP project should be **paused** rather than deleted immediately:
  - Preserves database schemas, hook registrations, and project configuration without consuming compute resources.
  - Avoids the friction and token churn of repeatedly recreating projects.
  - Can be unpaused when follow-up tests are authorized.

### 6. Deletion Approval Package (Pre-Deletion Transparency)
- Once all testing, cleanup verification, evidence archival, and independent reviews are 100% complete, a formal **TEMP Project Deletion Approval Package** must be prepared and presented to the owner.
- The package must transparently display:
  - **Exact Project Name**: `Tio-Tnyx-Auth-Temp`
  - **Exact Project Reference ID**: e.g., `<TIO_SUPABASE_TEMP_REF>`
  - **Target Organization**: `llmbrmxhyirtoqndazpg` ("Tio-tnyx")
  - **Permanent Consequences**: Irrevocable loss of all data, schema, hooks, and configuration within this TEMP project.
  - **Safety Confirmation**: Explicit affirmation that REAL (`bsfwzvgynwriswapxpsp`) and `Tio-world` (`oykupyiitspujzpwwvuj`) will remain completely untouched.

### 7. Explicit Owner Authorization Required (Zero Automatic Deletion)
- **Automatic deletion is strictly prohibited.**
- Deletion of the TEMP project requires a separate, explicit, written owner command approving the deletion package.
- No script, CI job, timeout, or agent workflow may delete the project autonomously.

### 8. Permanent Protection of REAL and Tio-world
- Under no circumstances shall REAL project `bsfwzvgynwriswapxpsp` or `Tio-world` (`oykupyiitspujzpwwvuj`) undergo deletion, project pause, reset, schema drop, or mutation.
- Both projects remain hardcoded in `IMMUTABLE_FORBIDDEN_PROJECTS` and are completely immune from any lifecycle or deletion tooling.

### 9. Post-Deletion Verification & Capacity Audit
- Immediately following owner-authorized deletion, the Supabase CLI inventory must be re-audited (`supabase projects list`).
- The agent must confirm:
  1. The TEMP project has been removed from the active project list.
  2. REAL project `bsfwzvgynwriswapxpsp` remains present, healthy (`ACTIVE_HEALTHY`), and unaffected.
  3. The Free tier quota has successfully returned to **1 available active project slot** (1 of 2 used).

---

## 7. Future Task 06I-B1-H1 Gate (Phase F)

Live probe execution remains strictly **BLOCKED**. Future Task 06I-B1-H1 plan will be prepared for the verified TEMP project only, requiring:
1. Distinct TEMP project ref and region (`ap-south-1`).
2. Explicit owner authorization of the exact Management API PATCH configuration.
3. Hook deployment (`hooks.sql`) to TEMP database.
4. Pre-execution active verification (asserting both hooks are registered before probes).
5. Strict rate limits (max 25 requests, 1000ms spacing) and immediate stop on any failure.
6. Test identities restricted to `*.invalid` / `*.test` domains.
7. Post-test cleanup (Admin API user deletion).
8. Strict isolation: Zero configuration or database replication from TEMP to REAL.

---

## 8. Next Permissible Actions & Approval Gates

1. **Owner Decision on TEMP Project Creation:**
   - Authorize creating `Tio-Tnyx-Auth-Temp` in organization `llmbrmxhyirtoqndazpg` at region `ap-south-1` ($0 Free tier slot).
   - If not approved, testing remains purely local.
2. **Review & PR Gate:**
   - PR #36 updated on branch `docs/task06i-b1-h0-hosted-readiness-harness`.
   - Independent re-review requested from `im-tio` (all 8 threads resolved).
   - Do not merge automatically.
3. **TEMP Project Lifecycle & Deletion Policy Enforcement:**
   - Follow Section 6: Preserve TEMP during test/review cycles, offer pause for retesting, and require explicit owner deletion authorization with full transparency. Production Auth remains strictly **NO-GO**.
