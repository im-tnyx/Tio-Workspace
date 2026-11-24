# Task 06I-B1-H3 — Controlled Subset Dispatch & Run-Scoped Storage Implementation

**Task ID:** `06I-B1-H3` (Revision `R1`)<br>
**Creation Date:** 2026-11-24<br>
**Revision Date:** 2026-11-25<br>
**Author:** Santosh Jangid (`im-tnyx`)<br>
**Reviewer:** `im-tio` (Independent Reviewer)<br>
**Branch:** `feat/task06i-b1-h3-subset-runner-storage`<br>
**Base:** `main` at `4569479e8fe2caa6659fe1cc6c7a484596a01bbc` (PR #43 merge commit)<br>
**PR Reference:** https://github.com/im-tnyx/Tio-Workspace/pull/44<br>
**Reviewed HEAD:** `bc1f1dd3402faf6559517412fe3215cc3c7da4ad`<br>
**Cost Ceiling:** $0.00 (Free-Tier Only)<br>
**Mode:** Local Implementation, Mocked Transport Tests & Offline Verification ONLY<br>
**Hosted LIVE Dispatch:** **NOT AUTHORIZED**<br>
**Production Real Auth:** **STRICT NO-GO**<br>
**Readiness Status:** `SUBSET_RUNNER_IMPLEMENTED`, `RUN_SCOPED_STORAGE_IMPLEMENTED`, `CLEANUP_ORDERING_ENFORCED`, `R1_FAIL_CLOSED_DISPATCH_ENFORCED`, `R1_STORAGE_OWNERSHIP_VERIFIED`, `LIVE_DISPATCH_BLOCKED_PENDING_DURABLE_RECOVERY`

---

## 1. Executive Summary & Context

Task **06I-B1-H3** implements the controlled subset execution engine and the run-scoped Storage fixture lifecycle in the hosted security test runner (`experiments/task06i/hosted-probe-runner.mjs`), directly resolving two key blockers identified in Task 06I-B1-H2 (`BLOCKED_PENDING_SUBSET_RUNNER` and `BLOCKED_PENDING_RUN_SCOPED_STORAGE`).

Following the completion and squash merge of Task 06I-B1-H2 via PR #43 (commit `4569479e8fe2caa6659fe1cc6c7a484596a01bbc`), the testbed readiness specification, SQL deployment plan, and 12-scenario future implementation acceptance matrix were established. Task 06I-B1-H3 provides the concrete code implementation and adversarial unit tests satisfying these criteria while preserving strict fail-closed safety.

### Invariant & Boundary Commitments
1. **REAL Production Project (`bsfwzvgynwriswapxpsp`):** Permanently protected, read-only, and strictly forbidden from test targeting.
2. **TEMP Testbed (`wvdabiwbaavfggcmpizd`):** Dedicated disposable testbed. Zero live network calls during H3.
3. **Tio-world (`oykupyiitspujzpwwvuj`):** Permanently immune via immutable code guards.
4. **Hosted LIVE Dispatch:** **STRICTLY NOT AUTHORIZED**. All tests use mocked dispatchers, simulated network responses, and offline dry-run evaluation.
5. **Production Real Auth:** **STRICT NO-GO**.
6. **Cost Ceiling:** Strictly $0.00.

---

## 2. Baseline & Pre-Execution Verification

| Milestone / Metric | Value | Verification Evidence |
|---|---|---|
| **PR #43 Status** | **MERGED** | Squash merge at `4569479e8fe2caa6659fe1cc6c7a484596a01bbc` |
| **Current Branch** | `feat/task06i-b1-h3-subset-runner-storage` | Branched directly from `main` HEAD |
| **Task 06I Unit Tests** | **168/168 PASS** | `node --test experiments/task06i/*.test.mjs` (including Tests 90–96) |
| **PostgreSQL Contract Parity** | **POSTGRES_VERIFIED** (18/18) | `node experiments/task06i/sql-contract-parity.mjs` on PostgreSQL 17.11 |
| **Task 06H Local Suite** | **115/115 PASS** | `node --test experiments/task06h/*.test.mjs` |
| **Repository Verification** | **PASS** | `npm run verify` (tokens guard, tsc, eslint max-warnings=0, 22 shell tests) |
| **Git Diff Check** | **CLEAN** | `git diff --check` returns 0 whitespace/conflict errors |
| **Hosted Verification Executed** | **0/18** | Zero live probes executed during H3 |

---

## 3. Detailed Implementation Architecture

### H3-01: Controlled Subset Dispatch Engine
- **Target Seam:** `planProbeExecution(projectRef, options)` and `runHostedProbeRunner(options)` in `experiments/task06i/hosted-probe-runner.mjs`.
- **Supported Subset Probes (10):**
  `BYPASS-01`, `BYPASS-02`, `BYPASS-05`, `HOOK-01`, `HOOK-02`, `SESSION-01`, `SESSION-02`, `SESSION-03`, `SESSION-04`, `SESSION-05`.
- **Prerequisite-Blocked Probes (5):**
  `BYPASS-03`, `BYPASS-04`, `HOOK-03`, `HOOK-04`, `SESSION-06`.
- **Unsupported Layer B Probes (3):**
  `HOOK-05`, `HOOK-06`, `HOOK-07`.
- **Validation Rules (`validateSelectedProbeIds`):**
  1. Rejects non-array, empty, or duplicate entries (`SUBSET_SELECTION_INVALID`).
  2. Rejects unknown probe IDs (`UNKNOWN_PROBE_ID`).
  3. Rejects unsupported Layer B probe IDs (`PROBE_UNSUPPORTED_AT_LAYER_B`).
  4. Rejects prerequisite-blocked probe IDs (`PROBE_PREREQUISITE_BLOCKED`).
  5. Enforces dependency completeness (`SUBSET_DEPENDENCY_INCOMPLETE`):
     - `HOOK-02` requires `HOOK-01`
     - `SESSION-01` and `SESSION-02` require `HOOK-01`
     - `SESSION-03`, `SESSION-04`, `SESSION-05` require `HOOK-01` and `SESSION-02`
- **Canonical Ordering Preservation:**
  Irrespective of caller array order, planned probes execute in exact canonical matrix dependency order.
- **Evidence Breakdown:**
  `report.executionEvidence` provides unambiguous counts and arrays for:
  `selected`, `attempted`, `completed`, `failed`, `not_selected`, `prerequisite_blocked`, and `unsupported`.
- **Status:** **RESOLVED** (`BLOCKED_PENDING_SUBSET_RUNNER` eliminated).

### H3-02: Run-Scoped Storage Fixture Contract
- **Contract Key:** `task06i_probe_bucket/<runId>/probe.txt` (replacing legacy fixed path `task06i_probe_bucket/probe.txt`).
- **`runId` Generation & Validation:**
  - `validateRunId(runId)`: Requires non-empty string. Prohibits path traversal (`..`), forward/backward slashes (`/`, `\`), and any whitespace characters (`\s`). Enforces strict regex `/^[a-zA-Z0-9_-]+$/`.
  - Entropy generation: `crypto.randomUUID()` generates unique run identifiers if none supplied.
- **10-Point Provisioning Contract (`provisionStorageProbeFixture`):**
  1. *Project binding:* Verified against authorized project ref (`wvdabiwbaavfggcmpizd`).
  2. *Unique runId:* Strictly validated.
  3. *Pre-upload collision check:* Issues authenticated `GET /storage/v1/object/authenticated/...`. Must return HTTP 404. Any other status throws `STORAGE_FIXTURE_COLLISION_DETECTED`.
  4. *No-upsert upload:* Upload dispatches with `x-upsert: false`.
  5. *Write-ahead obligation:* Tracked in `TestRunInventory.storageFixtures` prior to probe dispatch.
  6. *Upload verification:* Confirms HTTP 200/201 and payload integrity.
  7. *Owner verification:* Confirms object ownership matches authorized user identity.
  8. *Inventory registration:* Registered in active inventory with `run_created_verified` provenance.
  9. *Exact-path cleanup:* Deletes target using segmented path URL encoding.
  10. *Absence verification:* Confirms HTTP 404 absence check post-cleanup.
- **Status:** **RESOLVED** (`BLOCKED_PENDING_RUN_SCOPED_STORAGE` eliminated).

### H3-03: Storage-First Cleanup Ordering & Cascade Prevention
- **Seam:** `TestRunInventory.executeCleanup()` in `experiments/task06i/hosted-probe-runner.mjs`.
- **Ordering Contract:**
  1. *Step 1:* Invalidate test run verification sessions.
  2. *Step 2:* Delete run-owned Storage fixture objects (`task06i_probe_bucket/<runId>/probe.txt`).
  3. *Step 3:* Verify Storage object absence (HTTP 404).
  4. *Step 4:* Delete tracked Auth users **ONLY IF** Storage cleanup succeeded completely (`!hasResidualStorage`).
  5. *Step 5:* Verify Auth user absence (HTTP 404).
- **Cascade Failure Prevention:**
  If Storage object deletion fails, errors, or returns non-404, `hasResidualStorage` is flagged `true`. Auth user deletion is strictly **SKIPPED**. Tracked users are placed in `report.residualUsers` with reason `STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED`. This prevents Supabase foreign-key / orphaned object cascade failures.
- **`SESSION-05` Integration:**
  Updated probe specification, mock dispatcher, and runner execution to target `task06i_probe_bucket/<runId>/probe.txt`.

### H3-04: Seed Identity Policy Preservation
- **Contract:** `options.seedUserId` marks identity as `PRE_EXISTING_REFERENCED` via `protectSeedIdentity()`.
- **Preservation:** Reusable pre-existing seed (Option A) is preserved across cleanup; never deleted.
- **Pending Prerequisite:** If disposable seed support (Option B) is ever requested, `BLOCKED_PENDING_RUN_CREATED_SEED_SUPPORT` remains an active gate.

### H3-05: Durable Crash Recovery Gate Enforcement
- **Contract:** In LIVE mode, `runHostedProbeRunner` explicitly checks for durable recovery capability.
- **Enforcement:** If `options.durableRecovery` is not present, LIVE dispatch halts immediately with `BLOCKED_PENDING_DURABLE_RECOVERY`.
- **Result:** Real hosted cloud execution remains safely gated.

---

## 3.6 Revision R1: PR #44 Review Remediation & Closures

Following comprehensive independent reviews on PR #44 by `@im-tio` (Codex) and GitHub Bugbot, 11 review comments across 8 critical areas were identified, addressed, and closed with rigorous offline unit tests (Test 96 with 26 sub-assertions):

### R1-01: Mandatory Durable Recovery Gate & Fail-Closed Dispatcher
- **Review Threads:** `PRRT_kwDOVtCmZc67gqOo` (Codex P1), `PRRT_kwDOVtCmZc67grT_` (Bugbot High)
- **Remediation:**
  1. Enforced durable recovery gate unconditionally at standalone CLI entry point (`main()`): if `--live` flag is supplied without recovery, the process terminates immediately with code 1 (`BLOCKED_PENDING_DURABLE_RECOVERY`).
  2. In `createHostedDispatcher` and `provisionStorageProbeFixture`, default network dispatch without explicit mock transport (`!fetchFn || fetchFn === globalThis.fetch`) throws `BLOCKED_PENDING_DURABLE_RECOVERY`.
  3. Wrapped `fetchFn` in `createHostedDispatcher` to intercept any invocation of `globalThis.fetch`.
  4. Tagged returned dispatcher with `_isHostedNetworkDispatcher = true`.
  5. In `runHostedProbeRunner`, if `options.liveHostedDispatch === true || options.enforceDurableRecoveryGate === true || !mockDispatcher || mockDispatcher._isHostedNetworkDispatcher === true`, throws `BLOCKED_PENDING_DURABLE_RECOVERY` fail-closed.

### R1-02: Storage Provisioner Project Isolation & Credential Binding
- **Review Threads:** `PRRT_kwDOVtCmZc67gqOu` (Codex P1), `PRRT_kwDOVtCmZc67grUL` (Bugbot High)
- **Remediation:**
  1. Validated target project ref strictly against authorized TEMP project (`wvdabiwbaavfggcmpizd`) inside `provisionStorageProbeFixture` before constructing any network requests; rejects REAL (`bsfwzvgynwriswapxpsp`) and Tio-world (`oykupyiitspujzpwwvuj`) with `CRITICAL_SECURITY_VIOLATION`.
  2. Enforced credential project binding via `validateProjectCredentialBinding(userAccessToken, normRef)`.
  3. Validated seed user UUID via `validateUuid(seedUserId)` and decoded user JWT to assert `claims.sub === validSeedUserId`.

### R1-03: Separate Storage Creation Obligation from Deletion Eligibility
- **Review Threads:** `PRRT_kwDOVtCmZc67gqOz` (Codex P1), `PRRT_kwDOVtCmZc67grUX` (Bugbot Med)
- **Remediation:**
  1. Introduced granular `STORAGE_LIFECYCLE_STATE` enum (10 states): `ABSENCE_VERIFIED`, `CREATION_PENDING`, `CREATION_IN_FLIGHT`, `CREATION_INDETERMINATE`, `CONFLICT_EXISTING_PRESERVED`, `CREATION_FAILED`, `RUN_CREATED_VERIFIED`, `CLEANUP_PENDING`, `DELETION_VERIFIED`, `RESIDUAL_BLOCKED`.
  2. Pre-upload collision check proceeds ONLY on affirmative HTTP 404; HTTP 200 throws `STORAGE_COLLISION_DETECTED`; non-404 throws `STORAGE_COLLISION_CHECK_FAILED`.
  3. Pre-upload registration writes fixture with `CREATION_PENDING` and `deletionEligible: false`.
  4. Only successful upload verification confirming exact downloaded bytes and owner identity transitions fixture to `RUN_CREATED_VERIFIED` with `deletionEligible: true`.
  5. HTTP 409 conflict marks `CONFLICT_EXISTING_PRESERVED` without deletion eligibility; pre-existing object is never deleted.

### R1-04: Verify Actual Stored Bytes & Owner Identity
- **Review Thread:** `PRRT_kwDOVtCmZc67gqO4` (Codex P2)
- **Remediation:**
  1. Post-upload verification GET reads actual downloaded bytes (`await verifyRes.text()`) and asserts exact equality with `probeContent` (`STORAGE_PAYLOAD_INTEGRITY_MISMATCH`).
  2. Inspects provider owner metadata headers (`x-owner-id` / `owner_id`) and correlates with authenticated seed user UUID (`STORAGE_OWNER_VERIFICATION_FAILED`).

### R1-05: Canonical Probe Dependencies
- **Review Thread:** `PRRT_kwDOVtCmZc67gqO8` (Codex P2)
- **Remediation:**
  1. Updated `CANONICAL_PROBE_DEPENDENCIES`: `SESSION-01` establishes `preInvalidationSessionValid: true`.
  2. `SESSION-02` (password mutation) strictly requires `HOOK-01` and `SESSION-01`.
  3. `SESSION-03..06` strictly require `HOOK-01`, `SESSION-01`, and `SESSION-02`.
  4. Incomplete selections are rejected fail-closed before any network call or password mutation.

### R1-06: Storage Absence Verification Before Auth User Deletion
- **Review Thread:** `PRRT_kwDOVtCmZc67grUj` (Bugbot Med)
- **Remediation:**
  1. Added `getStorageObject(bucket, path)` to `createHostedAdminClient`.
  2. Implemented `verifyStorageObjectAbsence(adminClient, bucket, path)` checking for authoritative HTTP 404.
  3. In `TestRunInventory.executeCleanup()`, after issuing object deletion, verifies absence via independent GET. Non-404 marks `storageCleanupFailed = true` and halts Auth user deletion with `STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED`.

### R1-07: Remove SESSION-05 Shared-Path Fallback
- **Review Thread:** `PRRT_kwDOVtCmZc67grUw` (Bugbot Med)
- **Remediation:**
  1. Removed fallback `'probe.txt'`; strictly requires valid run-scoped path `task06i_probe_bucket/<runId>/probe.txt`.
  2. Validates runId, canonical bucket and path, verified fixture in inventory, and expected owner ID before dispatching `SESSION-05`.

### R1-08: Mandatory Inventory in Storage Provisioner
- **Review Thread:** `PRRT_kwDOVtCmZc67grU_` (Bugbot Med)
- **Remediation:**
  1. `provisionStorageProbeFixture` enforces non-null active `TestRunInventory` instance matching `runId` and target project.
  2. Throws `STORAGE_INVENTORY_REQUIRED` if inventory is missing, mismatched, or already finalized.

---

## 4. Traceability Against H2-R3 Acceptance Matrix

| Criterion | Description | Task 06I-B1-H3 Status | Verification Test |
|---|---|---|---|
| **AC-01** | Run-created seed owns Storage object | **IMPLEMENTED** | Test 93 (`provisionStorageProbeFixture`) |
| **AC-02** | Storage object deletion strictly precedes Auth user deletion | **IMPLEMENTED** | Test 94 (`executeCleanup` ordering check) |
| **AC-03** | Storage deletion failure prevents Auth user deletion | **IMPLEMENTED** | Test 94 (`STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED`) |
| **AC-04** | Collision detection rejects pre-existing object key | **IMPLEMENTED** | Test 93 (`STORAGE_FIXTURE_COLLISION_DETECTED`) |
| **AC-05** | Interrupted run before upload leaves 0 residual storage | **IMPLEMENTED** | Test 93 & Test 94 |
| **AC-06** | Interrupted run after upload before persistence quarantined | **IMPLEMENTED** | Test 93 (write-ahead tracking) |
| **AC-07** | Storage object with unknown ownership quarantined | **IMPLEMENTED** | Test 93 & Test 94 |
| **AC-08** | Reusable pre-existing seed user never deleted | **IMPLEMENTED** | Test 88, 89, 94 (`protectSeedIdentity`) |
| **AC-09** | Run-created seed user never reclassified as pre-existing | **IMPLEMENTED** | Test 88, 94 |
| **AC-10** | Seed user with unknown ownership blocks destructive action | **IMPLEMENTED** | Test 88, 89 |
| **AC-11** | Seed password restore blocks on pending uncompleted mutation | **IMPLEMENTED** | Test 78, 79, 86 |
| **AC-12** | Operator recovery verifies object absence before user delete | **IMPLEMENTED** | Test 94 (Step 3 404 absence check) |

---

## 5. Verification Test Suite Results

```powershell
# 1. Task 06I Security Test Suite (100 runner tests + 68 parity/evaluator tests = 168 total)
node --test experiments/task06i/*.test.mjs
# Result: 168 passed, 0 failed, 0 skipped (duration: ~19.2s)
# Includes Test 96 with 26 sub-assertions verifying all 8 R1 remediation areas

# 2. PostgreSQL Contract Parity Check
node experiments/task06i/sql-contract-parity.mjs
# Result: Status POSTGRES_VERIFIED (18/18 cases matched on PostgreSQL 17.11)

# 3. Task 06H Isolated Auth Integration Suite
node --test experiments/task06h/*.test.mjs
# Result: 115 passed, 0 failed, 0 skipped (duration: ~116ms)

# 4. Repository Verification Suite
npm run verify
# Result: tokens guard pass, tsc --noEmit pass, eslint max-warnings=0 pass, tests 22 pass

# 5. Git Diff Check
git diff --check
# Result: Completely clean (0 errors)
```

---

## 6. Security Gates & Invariants Status

| Gate / Invariant | Status | Enforcement Mechanism |
|---|---|---|
| **Controlled Subset Execution** | **IMPLEMENTED** | Validated probe array, dependency ordering, fail-closed validation |
| **Run-Scoped Storage Fixture** | **IMPLEMENTED** | Entropy-backed runId, collision check, no-upsert, inventory tracking |
| **Storage-First Cleanup Ordering** | **IMPLEMENTED** | Storage deletion strictly precedes user deletion; failure halts user delete |
| **Durable Crash Recovery Gate** | **PRESERVED** | Live dispatch halts with `BLOCKED_PENDING_DURABLE_RECOVERY` |
| **Seed Identity Lifecycle** | **PRESERVED** | Option A (reusable seed) supported; Option B disposable seed gated |
| **Hosted LIVE Execution** | **NOT AUTHORIZED** | Runner defaults unconditionally to `DRY_RUN`; 0 network calls dispatched |
| **Production Real Auth** | **STRICT NO-GO** | Pinned GoTrue vulnerabilities remain; production gates strictly locked |
| **Cost Ceiling ($0.00)** | **HONORED** | Zero paid services, zero cost incurred |
| **Protected Boundaries** | **HONORED** | `bsfwzvgynwriswapxpsp` (REAL) and `oykupyiitspujzpwwvuj` (Tio-world) immune |

---

## 7. Next Actions

1. Commit all H3-R1 implementation, test, and documentation files to `feat/task06i-b1-h3-subset-runner-storage`.
2. Push branch to `origin feat/task06i-b1-h3-subset-runner-storage`.
3. Post comprehensive resolution replies to all 11 review threads on PR #44 referencing the exact commit SHA, and resolve the threads via GraphQL.
4. Request re-review from independent reviewer `@im-tio` on PR #44.
5. Maintain strictly local execution mode; wait for owner instructions and review resolution before any subsequent steps.
