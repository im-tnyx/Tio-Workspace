# Phase 1.2 Task 06I-B1-H0-R1 — Security Remediation & Separate TEMP/REAL Environment Readiness

> **Target-Safety Decision Record, 8 PR #36 Remediation Proofs, Live Inventory Audit & TEMP Project Provisioning Package.** Prepared under `AGENTS.md` operating rules. This document establishes deterministic local security verification, remediates all 8 PR #36 review findings, audits Supabase organization inventory, and prepares the dry-run probe harness and TEMP project creation approval package. It does not authorize creating, modifying, or deleting any hosted Supabase project. Production Real Auth remains **NO-GO**.

| Field | Value |
|---|---|
| Status | **PR #36 REVIEW REMEDIATION (REVISION R1) COMPLETE; 80/80 TASK06I TESTS PASS; 18/18 POSTGRESQL PARITY PASS (ON_ERROR_STOP=1 + ROLE GRANTS VERIFIED); LIVE INVENTORY AUDITED (1 ACTIVE PROJECT, 1 FREE SLOT AVAILABLE); TEMP LIFECYCLE & DELETION POLICY FORMALIZED (OWNER DIRECTION); AWAITING OWNER APPROVAL FOR TEMP PROJECT CREATION** |
| Objective | Remediate all 8 independent review findings on PR #36, update Supabase target architecture to cleanly separate REAL (`bsfwzvgynwriswapxpsp`) from disposable TEMP (`Tio-Tnyx-Auth-Temp`), formalize the TEMP project lifecycle & deletion policy per owner direction, verify live organization inventory via Supabase CLI, ensure zero host port exposure and zero fake passes, and prepare TEMP creation approval package without executing hosted mutations |
| Implementation owner | Agent / Local Development & Security Research, Task 06I-B1-H0-R1 slice |
| Previous agent | Agent / Task 06I-B1-H0 author |
| Last audited HEAD | `2a8975f47265f0a8328f33f603d2cc9788bedc6c` (PR #36 initial commit) |
| Tracking / approval | Task 06I-B1-H0-R1 authorized by user prompt; owner approves TEMP/REAL separation as target architecture; owner establishes TEMP Project Lifecycle & Deletion Policy; mandates $0 cost and permanent immunity for `Tio-world` and REAL `bsfwzvgynwriswapxpsp`; hosted mutations strictly prohibited |
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
# {"projects":[{"id":"bsfwzvgynwriswapxpsp","ref":"bsfwzvgynwriswapxpsp","organization_id":"llmbrmxhyirtoqndazpg","organization_slug":"llmbrmxhyirtoqndazpg","name":"Tio-Tnyx","region":"ap-south-1","created_at":"2026-11-14T17:05:07.049773Z","status":"ACTIVE_HEALTHY","database":{"host":"db.bsfwzvgynwriswapxpsp.supabase.co","version":"17.11.0.019","postgres_engine":"17","release_channel":"ga"},"linked":false}],"message":""}
```

### Inventory Findings & Quota Reconciliation
1. **Organization:** `llmbrmxhyirtoqndazpg` ("Tio-tnyx")
2. **Plan Tier:** Free plan
3. **Current Active Projects (Count: 1):**
   - Ref: `bsfwzvgynwriswapxpsp` | Name: `Tio-Tnyx` | Region: `ap-south-1` | Status: `ACTIVE_HEALTHY`
   - Role: **REAL production application backend** (Protected, READ-ONLY during this phase).
4. **`Tio-world` Status:** Historical ref `oykupyiitspujzpwwvuj` is **absent** from the latest connected organization project list. Per owner instruction: *"NOT a test target. Never touch, pause, restore, delete, reset or recreate it. It is absent from the latest connected inventory; do not infer why or take corrective actions."* It remains permanently hard-blocked in code.
5. **Free Project Capacity:** Supabase Free tier allows up to **2 active projects** per organization. With 1 currently active project (`bsfwzvgynwriswapxpsp`), **1 additional active project slot is available**.
6. **TEMP Project Status:** `Tio-Tnyx-Auth-Temp` does **NOT** exist yet.
7. **Cost Quotation:** **$0.00** (Free tier active project slot; zero billable add-ons).

---

## 3. Revised Target-Safety Architecture: Clean TEMP vs REAL Separation

### Environmental Architecture Mapping

| Environment | Project Name | Project Ref | Region | Purpose & Security Boundary | Protection Status |
|---|---|---|---|---|---|
| **REAL** | `Tio-Tnyx` | `bsfwzvgynwriswapxpsp` | `ap-south-1` | Future real application backend | **PROTECTED & READ-ONLY.** Permanently forbidden from test targeting in `hosted-probe-runner.mjs`. |
| **TEMP** | `Tio-Tnyx-Auth-Temp` | *(To be generated upon creation)* | `ap-south-1` | Dedicated disposable managed Auth security testbed | **Awaiting Creation Approval.** Isolated database, independent JWT signing keys, distinct API keys, disposable test data only. |
| **IMMUNE** | `Tio-world` | `oykupyiitspujzpwwvuj` | N/A | Historical project | **PERMANENT IMMUNITY.** Hardcoded in `IMMUTABLE_FORBIDDEN_PROJECTS`. Never touched, paused, restored, or created. |

### TEMP Project Creation Approval Package (Phase C)
Before creating the disposable testbed, the following verification gates are documented for owner authorization:
- **Selected Organization:** `llmbrmxhyirtoqndazpg` ("Tio-tnyx")
- **Proposed Project Name:** `Tio-Tnyx-Auth-Temp`
- **Region:** `ap-south-1` (Mumbai)
- **Database Engine:** PostgreSQL 17
- **Cost Ceiling:** **$0.00** (Strict Free tier active project; zero paid compute or custom domains)
- **Blast Radius:** Completely isolated from REAL (`bsfwzvgynwriswapxpsp`). Deletion or reconfiguration of TEMP will have **zero impact** on REAL backend keys, database tables, or auth users.
- **Owner Approval Gate:** Creation is paused. Project creation must be explicitly authorized by the owner before any provisioning command is executed.

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

---

## 5. Local Security Harness & Parity Verification Results (Phase E)

| Test Suite / Script | Command | Cases / Result | Exit Code | Notes |
|---|---|---|---|---|
| Task 06I Security Suite | `node --test experiments/task06i/*.test.mjs` | **80 passed**, 0 failed | `0` | All 4 test files pass: allowlist (37), evaluator (15), probe runner (14), harness (14) |
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
