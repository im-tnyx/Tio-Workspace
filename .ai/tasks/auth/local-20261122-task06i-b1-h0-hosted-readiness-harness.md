# Phase 1.2 Task 06I-B1-H0-R5 — SESSION-06 Revocation Proof, Strict Identity Correlation & Secret Redaction Closure

> **Target-Safety Decision Record, P1/P2 Security Proof Closure, Affirmative Evidence Contracts & Dispatcher Deadline Enforcement.** Prepared under `AGENTS.md` operating rules. This document establishes deterministic local security verification, remediates all review threads on PR #36 (including Revision R5: SESSION-06 affirmative revocation baseline and reset completion proof, strict session identity correlation rejecting contradictory IDs regardless of boolean flags, and parser-based secret redaction eliminating escaped-quote leakage), preserves the owner-directed TEMP lifecycle & deletion policy, audits Supabase organization inventory, and confirms zero host port exposure and zero hosted mutations. Production Real Auth remains **NO-GO**.

| Field | Value |
|---|---|
| Status | **PR #36 SECURITY REMEDIATION (REVISION R5) COMPLETE; 102/102 TASK06I TESTS PASS; 18/18 POSTGRESQL PARITY PASS (ON_ERROR_STOP=1, NONZERO EXIT ON MISMATCH, ROLE GRANTS VERIFIED); 115/115 TASK06H TESTS PASS; 22/22 SHELL TESTS PASS; LIVE INVENTORY AUDITED (2 ACTIVE PROJECTS: REAL `bsfwzvgynwriswapxpsp` + OWNER-CREATED TEMP `wvdabiwbaavfggcmpizd`); APPROVED TEMP REF `wvdabiwbaavfggcmpizd` ENFORCED (TEMP SPOOFING REJECTED); ALL 18 PROBE CASES REQUIRE AFFIRMATIVE OBSERVATIONS (STATUS 0 / MISSING STATUS / EMPTY PROOFS FAIL CLOSED); DISPATCHER TIMEOUT AND ABORTSIGNAL ENFORCED; COMPLETE RUNNER REPORT RECURSIVELY SANITIZED (PARSER-BASED ESCAPED QUOTE REDACTION); ALL 3 R5 REVIEW THREADS RESOLVED; AWAITING INDEPENDENT RE-REVIEW SIGN-OFF FROM IM-TIO** |
| Objective | Resolve all three review threads on PR #36: require SESSION-06 affirmative revocation baseline and reset completion proof (`PRRT_kwDOVtCmZc66jlyg`), enforce strict session correlation rejecting contradictory IDs regardless of boolean flags (`PRRT_kwDOVtCmZc66joKl`), and eliminate escaped-quote credential leakage via parser-based redactor (`PRRT_kwDOVtCmZc66joKm`). |
| Implementation owner | Agent / Local Development & Security Research, Task 06I-B1-H0-R5 slice |
| Previous agent | Agent / Task 06I-B1-H0-R4 author |
| Last audited HEAD | `53afec4df50710f43768cee5019cb02e3b525eb5` (PR #36 post-H0-R4 commit) |
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

### 12. `PRRT_kwDOVtCmZc66jG6V` — Strict Evidence Validation for Token & Session Cases
- **Root Cause:** In `validateProbeOutcome`, negative checks like `if (rawOutcome.has_token === false)` and `if (rawOutcome.session_created === false)` failed open when those properties were omitted (`undefined`).
- **Remediation:**
  1. Enforced positive explicit assertions: `HOOK-01` and `HOOK-02` require `rawOutcome.has_token === true` or explicit `rawOutcome.tokens` object.
  2. `SESSION-01` requires explicit `rawOutcome.session_created === true`.
  3. `SESSION-02` requires explicit `typeof rawOutcome.remaining_sessions === 'number' && rawOutcome.remaining_sessions === 0`.
  4. `SESSION-04` and `SESSION-05` require explicit `rawOutcome.stateless_linger_documented === true` or documented evidence/note.
- **Tests:** `hosted-probe-runner.test.mjs` (Tests 20, 22).

### 13. `PRRT_kwDOVtCmZc66jG6Y` / `PRRT_kwDOVtCmZc66jLk3` — Redact Leaked Secrets in Runner Halt Reason & Complete Report
- **Root Cause:** In `runHostedProbeRunner`, `abortReason` was constructed directly from `validatedOutcome.reason` and returned in the final result object without passing through `sanitizeData`. An unhandled network exception containing credentials or tokens could leak into `result.abortReason`.
- **Remediation:**
  1. Wrapped `abortReason` construction with `sanitizeData(...)` at the failure site.
  2. Enforced top-level `abortReason: sanitizeData(abortReason)` in the returned runner result object.
  3. Wrapped the entire returned runner report object with `sanitizeData(runnerReport)` guaranteeing zero credential leakage across any top-level or nested field.
- **Tests:** `hosted-probe-runner.test.mjs` (Tests 23, 27).

### 14. `PRRT_kwDOVtCmZc66jOw4` (R3-01) — Approved TEMP Target Enforcement & Anti-Spoofing
- **Root Cause:** `validateTargetProject` accepted caller-supplied `tempRef` as an authoritative allowlist. In LIVE mode, an attacker or test caller could supply `projectRef: 'other-project', tempRef: 'other-project'` and target an unapproved project.
- **Remediation:**
  1. In LIVE mode (`isLive === true`), `validateTargetProject` strictly requires the owner-approved hardcoded TEMP project ref `HARDCODED_TEMP_REF = 'wvdabiwbaavfggcmpizd'`.
  2. Caller-controlled `tempRef` spoofing is unconditionally rejected with `CRITICAL_SECURITY_VIOLATION`.
  3. Environment-variable overrides (`TIO_SUPABASE_TEMP_REF`) cannot target unapproved projects in LIVE mode.
  4. Non-approved project references in LIVE mode fail closed with `unauthorized_target`.
  5. Arbitrary references are strictly confined to non-live, explicitly isolated unit test mode (`options.allowIsolatedTestRef`).
- **Tests:** `hosted-probe-runner.test.mjs` (Tests 4b, 25).

### 15. `PRRT_kwDOVtCmZc66jLk1` & `PRRT_kwDOVtCmZc66jNbH` (R3-02) — Affirmative Evidence for All 18 Preflight Cases
- **Root Cause:** `validateProbeOutcome` did not validate HTTP status positively (e.g. status 0 or missing status was accepted on `SESSION-03` and `SESSION-06`), and truthy evidence checks treated empty objects `{}` or empty arrays `[]` as proof of token issuance or linger documentation.
- **Remediation:**
  1. Enforced that status must be a positive integer (`status > 0 && Number.isInteger(status)`); status 0 or missing status immediately fails closed with `INVALID_HTTP_STATUS`.
  2. Implemented strict requirement-specific affirmative observations for all 18 cases:
     - `BYPASS-01`: Requires 4xx/5xx status, rejects HTTP 200/tokens, requires affirmative `route_disabled: true` or error code.
     - `BYPASS-02`: Requires 4xx/5xx status, rejects HTTP 200/tokens/user_created, requires affirmative `signup_disabled: true` or error code.
     - `BYPASS-03` / `BYPASS-04`: Requires 4xx/5xx status, rejects HTTP 200/tokens, requires affirmative `hook_rejected: true` or 42501 error.
     - `BYPASS-05`: Rejects email delivery/token, requires affirmative `recovery_suppressed: true` without assuming HTTP status proves non-delivery.
     - `HOOK-01` / `HOOK-02`: Requires exact HTTP 200, non-empty tokens object (`tokens.access_token` string), rejects empty objects `{}` or arrays `[]`, requires verified AMR.
     - `HOOK-03`..`HOOK-07`: Requires 4xx/5xx status, rejects HTTP 200/tokens, requires affirmative `hook_rejected: true`.
     - `SESSION-01`: Requires exact HTTP 200, explicit `session_created: true` AND verified session row (`session_id` non-empty string or `sessions_count >= 1`).
     - `SESSION-02`: Requires exact HTTP 200, `remaining_sessions === 0`, and explicit `session_revoked: true`.
     - `SESSION-03`: Requires HTTP 401/403/404, rejects HTTP 200/status 0, requires affirmative `rejection_observed: true` or `error_code`.
     - `SESSION-04` / `SESSION-05`: Requires `stateless_linger_documented: true` AND non-empty note/evidence string or object; rejects empty `{}` or `[]`.
     - `SESSION-06`: Requires HTTP 401/403/500, rejects HTTP 200/status 0, requires affirmative `rejection_observed: true` or `AuthSessionMissingError`.
- **Tests:** `hosted-probe-runner.test.mjs` (Tests 12, 13, 14, 19, 20, 22, 26).

### 16. `PRRT_kwDOVtCmZc66jOw5` (R3-03) — Dispatcher Timeout & AbortSignal Enforcement
- **Root Cause:** `runHostedProbeRunner` directly awaited `mockDispatcher` without a deadline. A dispatcher returning a never-settling Promise caused the probe runner to hang indefinitely.
- **Remediation:**
  1. Enforced a bounded per-probe deadline (`probeTimeoutMs = DEFAULT_PROBE_TIMEOUT_MS = 5000ms`, configurable for tests).
  2. Created an `AbortController` per probe and passed `{ signal: controller.signal }` to the dispatcher.
  3. Raced `mockDispatcher` against a timeout Promise: on timeout, `controller.abort()` is triggered and the probe fails closed with `PROBE_TIMEOUT`.
  4. On timeout, the runner halts immediately (`aborted = true`), prevents any subsequent probe dispatch, and records `HALTED_ON_FAILURE`.
- **Tests:** `hosted-probe-runner.test.mjs` (Test 24).

### 17. `PRRT_kwDOVtCmZc66jLk5` (R3-04) — Standalone PostgreSQL Parity Exit Status & Aggregate Failure
- **Root Cause:** In `sql-contract-parity.mjs`, parity mismatches printed error messages but the script exited with code 0. Furthermore, `verifyParityMatrix` returned `status: 'POSTGRES_VERIFIED'` even when comparisons failed.
- **Remediation:**
  1. Updated `verifyParityMatrix`: returns `status: 'POSTGRES_VERIFIED'` only when 100% of comparisons match (`passedParity === totalCases && totalCases > 0`); returns `status: 'PARITY_FAILED'` on any mismatch; returns `status: 'POSTGRES_NOT_EXECUTED'` when Docker is unavailable.
  2. Standalone CLI execution sets `process.exitCode = 1` and logs an error whenever `status !== 'POSTGRES_VERIFIED'` or `passedParity !== totalCases`.
- **Tests:** `security-harness.test.mjs` (Tests 15, 16).

### 18. `PRRT_kwDOVtCmZc66jdT2` (R4-01) — Actual Session Revocation Proof (SESSION-03 & SESSION-06)
- **Root Cause:** In `validateProbeOutcome`, SESSION-03 accepted `bad_jwt`, `session expired`, and generic `session` error substrings as sufficient evidence of revocation, allowing invalid or expired tokens to masquerade as proof of remote session invalidation.
- **Remediation:**
  1. Rejection of False-Proof Errors: Explicitly reject `bad_jwt`, `jwt_expired`, `token_expired`, `invalid_jwt`, `malformed_jwt`, and generic non-revocation errors (`FALSE_PROOF_REJECTED`).
  2. Pre-Reset Baseline Verification: Require proof that the exact same valid, unexpired session succeeded before password reset (`pre_reset_baseline_verified: true`).
  3. Reset Operation Evidence: Require explicit observation that the password reset or session invalidation operation completed (`reset_completed: true`).
  4. Session Correlation: Verify that pre-reset and post-reset observations belong to the exact same session via stable test identifier (`session_id` match / `same_session_correlated: true`).
  5. Revocation-Specific Rejection: Require affirmative revocation-specific evidence (`error_code: 'session_not_found'` or `revocation_verified: true`).
  6. Applied equivalent false-proof rejection checks to adjacent SESSION-06 (Edge Function session rejection).
- **Tests:** `hosted-probe-runner.test.mjs` (Test 28: 8 sub-assertions covering bad_jwt, expired, missing baseline, failed reset, mismatched session, generic 403, valid correlation, and SESSION-06).

### 19. `PRRT_kwDOVtCmZc66jdT4` (R4-02) — Complete Quoted Credential Redaction in sanitizeData
- **Root Cause:** `sanitizeData()` regex for sensitive key-value pairs stopped at whitespace and ampersands, failing to redact quoted values with leading/trailing spaces (`password=" synthetic-review-password"`), internal spaces and ampersands (`password="alpha beta&gamma"`), single quotes (`access_token='...'`), or escaped quotes (`\"`).
- **Remediation:**
  1. Updated `sanitizeData()` with dedicated quoted regexes matching until the unescaped closing quote (supporting double and single quotes, leading/trailing whitespace, embedded `&`, and escaped `\"` / `\'`).
  2. Added fail-closed unclosed-quote fallback stopping at line breaks, commas, brackets, or braces.
  3. Verified that serialized runner report (including `results`, `abortReason`, and nested `outcome.body`) contains zero unredacted sensitive values.
- **Tests:** `hosted-probe-runner.test.mjs` (Test 29).

### 20. `PRRT_kwDOVtCmZc66jd3O` (R4-03) — Timeout Race Independent Evaluation & Zero Unhandled Rejections
- **Root Cause & Finding:** Cursor Bugbot reported a potential unhandled Promise rejection if a dispatcher rejects after `Promise.race` timeout. Independent evaluation and Node specification confirm `Promise.race` registers rejection handlers on competing promises; nevertheless, an explicit `.catch(() => {})` handler was attached to `dispatchPromise` to provide an unconditional guarantee.
- **Remediation:**
  1. Attached `dispatchPromise.catch(() => {})` before `Promise.race([dispatchPromise, timeoutPromise])`.
  2. Added retry handling in `sql-contract-parity.mjs` during PostgreSQL initialization-shutdown/restart transitions to prevent premature connection drops.
  3. Created 4 focused regression tests evaluating all race combinations with a process-level `unhandledRejection` listener.
- **Tests:** `hosted-probe-runner.test.mjs` (Test 30).

### 21. `PRRT_kwDOVtCmZc66jlyg` (R5-01) — SESSION-06 Affirmative Revocation Proof & Baseline Enforcement
- **Root Cause:** In `validateProbeOutcome`, SESSION-06 accepted `AuthSessionMissingError` alone as sufficient evidence of revocation without proving that the token was valid before reset, allowing never-authenticated requests to pass as revocation proof.
- **Remediation:**
  1. Refactored session validation into a shared helper `validateSessionRevocationProof()` used by both SESSION-03 and SESSION-06.
  2. Mandatory Pre-Reset Baseline: Requires explicit proof that the exact same valid, unexpired token succeeded before invalidation (`pre_reset_baseline_verified: true`). Fails closed with `MISSING_EVIDENCE` if absent.
  3. Reset Operation Proof: Requires explicit evidence that the password reset or session invalidation completed (`reset_completed: true`).
  4. False-Proof Rejection: Strictly rejects `bad_jwt`, `jwt_expired`, `token_expired`, `invalid_jwt`, `malformed_jwt`, etc. (`FALSE_PROOF_REJECTED`).
  5. Positive Revocation Evidence: Requires affirmative provider rejection (`AuthSessionMissingError` or `revocation_verified: true, rejection_observed: true`).
- **Tests:** `hosted-probe-runner.test.mjs` (Test 28: 10 focused sub-tests).

### 22. `PRRT_kwDOVtCmZc66joKl` (R5-02) — Contradictory Session IDs Must Fail Closed
- **Root Cause:** In `validateSessionRevocationProof`, the expression `same_session_correlated === true || (isNonEmptyString(correlatedId) && sessionId === correlatedId)` allowed an adversarial dispatcher to pass contradictory session IDs (`session_id !== correlated_session_id`) and still pass validation simply by asserting `same_session_correlated: true`.
- **Remediation:**
  1. Enforced strict identity equality: If `correlatedId` is present, `sessionId === correlatedId` is required unconditionally.
  2. The boolean flag `same_session_correlated` can NEVER override contradictory session identifiers. Mismatched IDs fail closed with `SESSION_CORRELATION_MISMATCH`.
  3. Validated non-empty string types for both session IDs.
- **Tests:** `hosted-probe-runner.test.mjs` (Test 28: sub-tests 5b and 8f).

### 23. `PRRT_kwDOVtCmZc66joKm` (R5-03) — Eliminate Escaped-Quote Credential Leakage via Dedicated Parser
- **Root Cause:** Regex-based sanitization using `(?:\\)?["']` incorrectly handled escaped quotes (`\"`, `\'`) in unclosed or malformed diagnostic strings, treating escaped quotes as unescaped delimiters and leaking secret substrings.
- **Remediation:**
  1. Implemented parser-based `redactSensitiveFields()` scanning for sensitive key prefixes, recognizing single/double quotes, checking parity of preceding backslashes (`backslashCount % 2 === 0`), and properly closing valid escaped-quote values (`"[REDACTED]"` / `'[REDACTED]'`).
  2. For unclosed/ambiguous quoted values, redacts the entire affected diagnostic string until safe boundaries (line breaks, commas, brackets, braces, or ampersands).
  3. Integrated `redactSensitiveFields()` into `sanitizeData()` across all diagnostic strings, nested objects, arrays, and serialized error messages.
  4. Preserved `Bearer [REDACTED]` scheme formatting when sensitive keys are followed by Bearer authorization tokens.
- **Tests:** `hosted-probe-runner.test.mjs` (Test 29: unit tests on `redactSensitiveFields`, `sanitizeData`, and end-to-end runner exceptions).

---

## 5. Local Security Harness & Parity Verification Results (Phase E)

| Test Suite / Script | Command | Cases / Result | Exit Code | Notes |
|---|---|---|---|---|
| Task 06I Security Suite | `node --test experiments/task06i/*.test.mjs` | **102 passed**, 0 failed | `0` | All 4 test files pass: allowlist (37), evaluator (15), probe runner (34), harness (16) |
| PostgreSQL 17.11 Parity Check | `node experiments/task06i/sql-contract-parity.mjs` | **18 passed**, 0 failed | `0` | Live Docker PostgreSQL 17.11 with zero host ports; `ON_ERROR_STOP=1`; grants verified; `Status: POSTGRES_VERIFIED` |
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

1. **Owner-Created TEMP Project Verified & Enforced:**
   - Owner created `Tio-Tnyx-Auth-Temp` (`wvdabiwbaavfggcmpizd`) in organization `llmbrmxhyirtoqndazpg` at region `ap-south-1` ($0 Free tier slot).
   - Configured in runner as immutable `HARDCODED_TEMP_REF`. Caller-controlled `tempRef` spoofing strictly rejected. LIVE probe execution disabled pending separate H1 authorization.
2. **Review & PR Gate (Revision R5 Complete):**
   - PR #36 updated on branch `docs/task06i-b1-h0-hosted-readiness-harness`.
   - All review threads resolved with affirmative evidence and regression tests (including R5: PRRT_kwDOVtCmZc66jlyg, PRRT_kwDOVtCmZc66joKl, PRRT_kwDOVtCmZc66joKm).
   - Independent re-review requested from `im-tio`.
   - Do not merge automatically without explicit owner authorization.
3. **TEMP Project Lifecycle & Deletion Policy Enforcement:**
   - Follow Section 6: Preserve TEMP during test/review cycles, offer pause for retesting, and require explicit owner deletion authorization with full transparency. Production Auth remains strictly **NO-GO**.
