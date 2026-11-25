# Task 06I-B1-H3 — Controlled Subset Dispatch & Run-Scoped Storage Implementation

**Task ID:** `06I-B1-H3` (Revision `R6`)<br>
**Creation Date:** 2026-11-24<br>
**Revision Date:** 2026-11-25<br>
**Author:** Santosh Jangid (`im-tnyx`)<br>
**Reviewer:** `im-tio` (Independent Reviewer), Codex, Cursor Bugbot, Cursor Security Reviewer<br>
**Branch:** `feat/task06i-b1-h3-subset-runner-storage`<br>
**Base:** `main` at `4569479e8fe2caa6659fe1cc6c7a484596a01bbc` (PR #43 merge commit)<br>
**PR Reference:** https://github.com/im-tnyx/Tio-Workspace/pull/44<br>
**Prior Audited HEAD:** `6c54ab2f2a0c72e479bbc686c067e0c0d9c8c43f`<br>
**Cost Ceiling:** $0.00 (Free-Tier Only)<br>
**Mode:** Local Implementation, Mocked Transport Tests & Offline Verification ONLY<br>
**Hosted LIVE Dispatch:** **NOT AUTHORIZED**<br>
**Production Real Auth:** **STRICT NO-GO**<br>
**Readiness Status:** `IMPLEMENTED_OFFLINE_TESTED / BLOCKED` (`BLOCKED_PENDING_DURABLE_RECOVERY`, `RUN_CREATED_SEED_SUPPORT_NOT_IMPLEMENTED`, `PROVIDER_PRECONDITION_MISSING` for RPC/Testbed deployment)

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
| **Task 06I Unit Tests** | **172/172 PASS** | `node --test experiments/task06i/*.test.mjs` (104 runner tests including Tests 90–100 + 68 parity/evaluator tests) |
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
  2. Throws `STORAGE_INVENTORY_REQUIRED` / `STORAGE_PROVISIONING_FAILED` if inventory is missing, mismatched, or already finalized.

---

## 3.7 Revision R2: Provider-Compatible Storage Evidence, Residual Cleanup & Real-Network Isolation

Inspected upstream Supabase Storage (`supabase/storage` tag `v1.98.9`: `getObject.ts`, `renderer.ts`, `getObjectInfo.ts`, `info.ts`, `createObject.ts`, `error-handler.ts`, `storage-error.ts`, `codes.ts`, `uploader.ts`, `database/pg.ts`) and Supabase Storage Ownership documentation to resolve all 5 open review findings on commit `62e32e9f9751c0fb8212d240484843b593403cdd`:

### R2-01: Provider-Compatible Authoritative Ownership Metadata Lookup
- **Review Threads:** `PRRT_kwDOVtCmZc67iBrf` (Codex P2), `PRRT_kwDOVtCmZc67iC_Q` (Bugbot High)
- **Upstream Contract Finding:** Authenticated `GET /storage/v1/object/authenticated/:bucket/*` (`getObject.ts` + `renderer.ts`) returns standard HTTP headers (`ETag`, `Content-Type`, `Last-Modified`, `Content-Length`, `X-Robots-Tag`) and raw bytes; it NEVER returns `x-owner-id`, `owner_id`, or `x-supabase-owner`. Neither `GET /object/info/authenticated` (`info.ts`) nor `POST /object/list` returns `owner_id`. Authoritative `owner_id` resides in `storage.objects.owner_id`.
- **Remediation:**
  1. Removed unsupported download-header ownership checks and stripped all fabricated `x-owner-id` download headers from positive test fixtures.
  2. Defined narrowly-scoped server-side lookup function `public.task06i_lookup_storage_object_owner(p_bucket_id text, p_object_name text)` in `experiments/task06i/sql/testbed-fixtures.sql` (`SECURITY DEFINER`, `SET search_path = ''`, restricted strictly to `'task06i_probe_bucket'`, `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role;`). Storage schema remains unexposed and RLS remains strict.
  3. Added `adminClient.getStorageObjectOwnership(bucket, path, { timeoutMs })` calling `POST /rest/v1/rpc/task06i_lookup_storage_object_owner` with `service_role`. Missing RPC/metadata interface retains blocking prerequisite `BLOCKED_PENDING_OWNERSHIP_METADATA_INTERFACE` / `PROVIDER_PRECONDITION_MISSING`.
  4. Verified authenticated seed user affirmatively against provider `GET /auth/v1/user` before any Storage mutation (never trusting unverified decoded JWT `sub` alone).
  5. Verified downloaded payload bytes via `Buffer.compare` and SHA-256 digest, and correlated `projectRef`, `bucket_id`, exact object `name`, provider object `id`, and `owner_id` before granting `RUN_CREATED_VERIFIED`.

### R2-02: Residual Obligation Preservation & State Transition Matrix
- **Review Threads:** `PRRT_kwDOVtCmZc67iBrk` (Codex P2), `PRRT_kwDOVtCmZc67iC_D` (Cursor Bugbot High)
- **Remediation:** Eliminated silent `CREATION_FAILED` skip in `executeCleanup()`, made successful POST immediately transition to committed residual state (`RESIDUAL_OWNERSHIP_BLOCKED`, `hasCommittedUpload: true`), quarantined non-409 ambiguous POST failures (e.g., HTTP 500, timeout, reset) as `CREATION_INDETERMINATE`, enforced monotonic state transitions, tracked late settlements during/after cleanup, and checked `storageFixtures` in both `hasCleanupEligibleItems` and `isClean()`.

| Provider Outcome | Required Lifecycle State (`STORAGE_LIFECYCLE_STATE`) | Deletion Eligible | Cleanup Behavior |
|---|---|---|---|
| Request never dispatched (`neverDispatched: true`) | `DEFINITIVE_NON_CREATION` | No | Skipped safely; 0 deletions |
| Documented existing-object conflict (HTTP 409 or structured 400/409 `KeyAlreadyExists`) | `CONFLICT_EXISTING_PRESERVED` | No | Preserved untouched; 0 deletions |
| Dispatched POST returned 5xx / timeout / reset / ambiguous error | `CREATION_INDETERMINATE` | No | Quarantined; no blind delete; blocks user delete & completion |
| POST 200/201 succeeded, verification GET/bytes/owner check failed | `RESIDUAL_OWNERSHIP_BLOCKED` | No | Obligation preserved (`hasCommittedUpload: true`); no blind delete; blocks user delete & completion |
| Affirmative `/auth/v1/user` + bytes/digest + `storage.objects.owner_id` correlation | `RUN_CREATED_VERIFIED` | Yes | Authorized for Storage-first deletion |
| Delete requested, absence timeout / 5xx / 403 / ambiguous 400 | `CLEANUP_INDETERMINATE` | No completion | Halts user delete (`STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED`); recoverable |
| Delete requested, object still present (HTTP 200) | `RESIDUAL_BLOCKED` | No completion | Halts user delete (`STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED`) |
| Authoritative absence verified & cleanup operations settled | `DELETION_VERIFIED` | Completed | Verified clean (`deletedStorage` counted; user deletion permitted) |

### R2-03: Normalized Provider-Aware Storage Absence & Conflict Evidence
- **Review Thread:** `PRRT_kwDOVtCmZc67iBrt` (Codex P2)
- **Upstream Contract Finding:** `supabase/storage` (`v1.98.9` `error-handler.ts`, `renderer.ts`, `storage-error.ts`) renders non-500 errors with transport HTTP `400` and JSON `{ statusCode: '404', code: 'NoSuchKey', error: 'Not found', message: 'The resource was not found' }`. `createHostedAdminClient.getStorageObject()` previously discarded response bodies.
- **Remediation:**
  1. Implemented shared `parseStorageErrorEnvelope(res)` and `normalizeStorageObjectResponse()` classifying `OBJECT_PRESENT`, `OBJECT_ABSENT`, `BUCKET_MISSING`, `CONFLICT_EXISTS`, `UNAUTHORIZED_OR_FORBIDDEN`, `RATE_LIMITED_OR_SERVER_ERROR`, `MALFORMED_RESPONSE`, `TRANSPORT_FAILURE`, and `INDETERMINATE`.
  2. Accepts HTTP 404 (not `NoSuchBucket`/auth-masked) AND documented structured HTTP 400 (`statusCode === '404'` AND `code === 'NoSuchKey'`) under valid project, bucket, path, and authorized context. Rejects generic HTTP 400, logical 404 with wrong/missing code, 401/403, permission-masked responses, 429/500, malformed envelopes, and timeouts.
  3. Wired consistently across pre-upload collision check, `createHostedAdminClient.getStorageObject()`, `verifyStorageObjectAbsenceDetailed()`, and `SESSION-05`.

### R2-04: Structural Real-Network Fetch Isolation & R1 Bypass Hardening
- Replaced mutable property-only and `=== globalThis.fetch` checks with `assertOfflineMockTransport()` (rejecting `globalThis.fetch`, native `[native code]`, and `fetch.bind(...)`), `runWithBlockedRealFetch()` (dynamically trapping indirect/wrapped `globalThis.fetch` calls inside `createHostedDispatcher`, `createHostedAdminClient`, `provisionStorageProbeFixture`, and `runHostedProbeRunner`), `HOSTED_NETWORK_DISPATCHERS` private `WeakSet`, non-writable `_isHostedNetworkDispatcher`, and `AsyncLocalStorage` dispatch-context enforcement (catching wrapped `(item, opts) => hostedDispatcher(...)` and rethrowing `BLOCKED_PENDING_DURABLE_RECOVERY` across all runner/dispatcher catch blocks).
- *Residual containment boundary documented honestly:* In-process JavaScript closures capturing `globalThis.fetch` prior to module load or direct `node:http`/`node:https`/`undici` calls require OS/container network isolation (`--allow-net=none`) if untrusted code runs in-process.

### Revision R3 — Structural Network Isolation, Atomic Storage Ownership & Concurrent Cleanup Closure

1. **R3-01 (`PRRT_kwDOVtCmZc67vNQ4` `im-tio` P1 & `PRRT_kwDOVtCmZc67vOmp` Codex P2) — Concurrency-Safe Reference-Counted Fetch Isolation Coordinator:**
   - Replaced racy per-call save/restore of `globalThis.fetch` with a reference-counted `createFetchIsolationCoordinator(target = globalThis)` / `GlobalFetchIsolationCoordinator` (`activeDepth`, original baseline restore only when `activeDepth` drops cleanly to `0`, `try/finally` balanced exit, `AsyncLocalStorage`-propagated blocking semantics, `getFetchIsolationDebugState()` observability).
   - Verified isolated coordinator exact `0 -> 1 -> 2 -> 1 -> 0` lifecycle and global overlapping/nested/error/timeout runs via relative `baseGlobalDepth` deltas (`Test 101`).
2. **R3-02 (`PRRT_kwDOVtCmZc67vOmm` Codex P1) — Elimination of Arbitrary Executable Transport Trust & Docker `--network none` Containment:**
   - Removed the `[native code]` heuristic in `assertOfflineMockTransport`; offline unit tests now MUST construct pure declarative `createDeterministicFixtureTransport(spec)` instances (supporting `routes`, `times`, `whenState`/`setsState`, `delayMs`, `createOfflineBarrier()`, `rawBytes`/`text`/`json`/`jsonError`/`textError`/`arrayBufferError`, `.calls`) registered in private `WeakSet`s (`TRUSTED_DETERMINISTIC_TRANSPORTS`, `TRUSTED_OFFLINE_BARRIERS`).
   - Recursive transport spec validation rejects arbitrary functions/callbacks/getters/non-plain objects immediately at factory boundaries (`createHostedDispatcher`, `createHostedAdminClient`, `provisionStorageProbeFixture`, defaulting `fetchFn = null` -> `BLOCKED_PENDING_DURABLE_RECOVERY`).
   - Verified full test suite (`111/111` PASS) and OS-level `fetch` failure (`EAI_AGAIN`) + callback rejection inside ephemeral Docker `node:24-bookworm --network none`.
3. **R3-03 (`PRRT_kwDOVtCmZc67vNQ8` `im-tio` P1) — Atomic Pre-`await` Storage Ownership & Single-Owner Mutation Enforcement:**
   - Added atomic `TestRunInventory.reserveStorageFixture()` synchronous reservation *before* the first `await` in `provisionStorageProbeFixture()`, binding a unique `ownerOpId` (`reservationOpId`).
   - Enforced `ownerOpId` single-owner authorization and immutable `providerObjectId` in `updateStorageFixture()`, duplicate path conflict rejection (`STORAGE_FIXTURE_RESERVATION_CONFLICT`), `_syncTrackedObjectForVerifiedFixture()` ownership sync, and `STORAGE_LIFECYCLE_BYPASS_VIOLATION` rejection on direct legacy `registerStorageObject()` bypasses.
4. **R3-04 (`PRRT_kwDOVtCmZc67vOmq` Codex P1) — Run Quiescing, Admission Closure, Concurrent Cleanup Re-Entry Guard & Live Pre-Deletion Audit:**
   - Exported `INVENTORY_RUN_STATE` (`ACTIVE`, `QUIESCING`, `CLEANUP_ACTIVE`, `RESIDUAL_BLOCKED`, `FINALIZED`), transitioning `ACTIVE -> QUIESCING -> CLEANUP_ACTIVE -> FINALIZED | RESIDUAL_BLOCKED`.
   - Enforced `assertActiveForAdmission()` pre-`await` + mid-cleanup abort checks in `provisionStorageProbeFixture()`, rejected re-entrant concurrent `executeCleanup()` (`CLEANUP_CONCURRENT_REENTRY_BLOCKED`), cleared legacy `trackedStorageObjects` paths upon verified deletion, and added live `_evaluatePreUserDeletionBlocker()` re-evaluation immediately before each `deleteUser()`.
5. **R3-05 (`PRRT_kwDOVtCmZc67vPVB` Bugbot Med) — HTTP 200/201/206 Text & Binary Storage Payload Classification:**
   - Reordered `normalizeStorageObjectResponse()` so transport/unreadable/missing responses (`unreadable_body`/`unreadable`/`missing_response`) fail closed as `MALFORMED_RESPONSE`, then HTTP `200 / 201 / 206` classify directly as `OBJECT_PRESENT` *before* JSON-parse/object-shape failure checks — preventing `text/plain` or binary collision GETs from misclassifying as `MALFORMED_RESPONSE`.
6. **R3-06 (`PRRT_kwDOVtCmZc67vPVG` Bugbot Med) — Provider-Compatible Idempotent Storage `DELETE` & Independent Post-Delete Absence Verification:**
   - Normalized `createHostedAdminClient.deleteStorageObject()` errors via `parseStorageErrorEnvelope` + `normalizeStorageObjectResponse`.
   - When `DELETE` returns structured `NoSuchKey` (`OBJECT_ABSENT`), `TestRunInventory._executeCleanupInternal()` independently runs `verifyStorageObjectAbsenceDetailed()` + unsettled-operation checks before granting `DELETION_VERIFIED`, blocking user deletion if GET detects an existing object (`RESIDUAL_BLOCKED`) or indeterminate error (`CLEANUP_INDETERMINATE`).

---

### Revision R4 — Trusted Offline Execution Boundary & Deterministic Fixture Integrity Closure

#### Contracts Closed in R4

1. **R4-01 (`PRRT_kwDOVtCmZc67v-7-` Codex P1) — Offline Execution Trust Boundary & Immutable Run-Bound Admin Adapters:**
   - **Arbitrary Ownership Lookup Closure:** `provisionStorageProbeFixture()` strictly rejects any caller-supplied `ownershipLookupFn` (`BLOCKED_PENDING_DURABLE_RECOVERY`) before inventory operation registration, fixture reservation, `/auth/v1/user`, or any Storage GET/POST mutation.
   - **Registered Admin Adapter Capability Model:** `createHostedAdminClient()` accepts optional `runId` (`validateRunId`), freezes the returned adapter (`Object.freeze(client)`), and registers immutable capability bindings `{ projectRef, runId, rawTransportFetch, capabilities }` in module-private `WeakMap` `TRUSTED_ADMIN_CLIENTS`.
   - **Strict Pre-Mutation Validation (`assertTrustedAdminClient`):** `provisionStorageProbeFixture()` requires either a `TRUSTED_ADMIN_CLIENTS`-registered, TEMP-bound, `runId`-matching, transport-verified `adminClient` OR `serviceRoleKey` (used to construct a run-bound `createHostedAdminClient`), plus a registered `fetchFn` (`TRUSTED_DETERMINISTIC_TRANSPORTS`). Unregistered objects, forged markers, shallow clones, `Object.create` overrides, `Proxy` wrappers, cross-project adapters, and cross-run/unbound adapters are rejected before any mutation or sentinel call (`Tests 108, 112`). `TestRunInventory.executeCleanup()` and `verifyStorageObjectAbsenceDetailed()` similarly verify `TRUSTED_ADMIN_CLIENTS` project/run/method integrity and reject forged trusted markers.
   - **Executable Dependency Audit:** Audited dispatchers (`createHostedDispatcher`: `fetchFn` gated via `assertOfflineMockTransport`, registered in `HOSTED_NETWORK_DISPATCHERS`, blocked by `runHostedProbeRunner`), Admin clients (`createHostedAdminClient`: `fetchFn` gated via `assertOfflineMockTransport`, `Object.freeze` + `TRUSTED_ADMIN_CLIENTS` `WeakMap`), ownership lookup (`ownershipLookupFn` rejected, routed exclusively through `trustedAdminMeta.capabilities.getStorageObjectOwnership` inside `runWithBlockedRealFetch`), cleanup/absence helpers (`executeCleanup`, `verifyStorageObjectAbsenceDetailed`), provisioning (`provisionStorageProbeFixture`), transport specs (`validateDeclarativeFixtureValue` rejects callbacks/accessors/symbols/cycles/non-plain instances), and CLI `--live` path (`process.exit(1)` fail-closed `BLOCKED_PENDING_DURABLE_RECOVERY`). Application-level adapter guards complement (and do not replace) OS/container network isolation (`docker --network none`).
2. **R4-02 (`PRRT_kwDOVtCmZc67v-xG` Bugbot Med) — Coordinator Lifecycle Contract (One State Per Target):**
   - `createFetchIsolationCoordinator(target = globalThis)` stores one shared `{ activeLeases, baselineFetch }` record per target inside module-private `WeakMap` `TARGET_ISOLATION_STATES`. Multiple handles targeting the same object (`globalThis` or isolated targets) share the exact lease count and single baseline `fetch`, restoring `target.fetch` only on the final `1 -> 0` lease release, with idempotent release handles and full independence across distinct targets (`Test 109`).
3. **R4-03 (`PRRT_kwDOVtCmZc67v-xA` Bugbot Med) — Barrier Termination Contract:**
   - `createOfflineBarrier()` enforces positive-integer target validation in `waitForArrivals()` (`RangeError` `INVALID_BARRIER_ARRIVAL_TARGET`), resolves already-satisfied targets normally, settles all pending unsatisfied `waitForArrivals()` waiters and post-release `waitForArrivals()` calls immediately with `BARRIER_RELEASED_BEFORE_ARRIVALS`, gives pre-aborted `AbortSignal`s deterministic `AbortError` priority, detaches all `abort` listeners on settle/release/abort races, and preserves idempotent `release()` (`Test 110`).
4. **R4-04 (`PRRT_kwDOVtCmZc67v-xN` Bugbot Low) — Binary Fixture Integrity & Declarative Transport Contract:**
   - Replaced aliased `Buffer.from(val.buffer, val.byteOffset, val.byteLength)` in `clonePlainData()` with `cloneBinaryViewToIndependentBuffer()` (exact-slice copy into a dedicated standalone `Uint8Array`/`Buffer`), backed up by `toIndependentBytesBuffer()` and fresh `ArrayBuffer` copies per `res.arrayBuffer()` call in `buildDeterministicResponse()`. Source mutations (`Buffer`, `Uint8Array`, `ArrayBuffer`, nonzero-offset `DataView`, pooled sliced `Buffer`) and caller mutations to returned `ArrayBuffer`s leave compiled fixture bytes and SHA-256 checksums unaltered (`Test 111`). Tightened `validateDeclarativeFixtureValue()` to audit non-enumerable/array getters (`Object.getOwnPropertyNames` + `desc.value`), symbols (`Object.getOwnPropertySymbols`), and circular references (`WeakSet`).

## 4. Traceability Against H2-R3 Acceptance Matrix

| Criterion | Description | Task 06I-B1-H3-R4 Status | Verification Test |
|---|---|---|---|
| **AC-01** | Run-created seed owns Storage object | **IMPLEMENTED (OFFLINE TESTED)** | Tests 93, 97, 100, 103, 108 (`reserveStorageFixture` + run-bound `createHostedAdminClient` + `storage.objects.owner_id`) |
| **AC-02** | Storage object deletion strictly precedes Auth user deletion | **IMPLEMENTED (OFFLINE TESTED)** | Tests 94, 98, 100, 104, 112 (`executeCleanup` ordering + live pre-user audit) |
| **AC-03** | Storage deletion failure prevents Auth user deletion | **IMPLEMENTED (OFFLINE TESTED)** | Tests 94, 96, 98, 99, 106, 112 (`STORAGE_CLEANUP_FAILURE_CASCADE_PREVENTED`) |
| **AC-04** | Collision detection rejects pre-existing object key | **IMPLEMENTED (OFFLINE TESTED)** | Tests 93, 96, 99, 105 (`STORAGE_COLLISION_DETECTED` + text/binary 200/201/206 `OBJECT_PRESENT` & `NoSuchKey`) |
| **AC-05** | Interrupted run before upload leaves 0 residual storage | **IMPLEMENTED (OFFLINE TESTED)** | Tests 93, 98, 103, 108 (`DEFINITIVE_NON_CREATION` / pre-mutation boundary rejection) |
| **AC-06** | Interrupted run after upload before verification quarantined | **IMPLEMENTED (OFFLINE TESTED)** | Tests 97, 98, 103, 104, 112 (`CREATION_INDETERMINATE` / `RESIDUAL_OWNERSHIP_BLOCKED`) |
| **AC-07** | Storage object with unknown ownership quarantined | **IMPLEMENTED (OFFLINE TESTED)** | Tests 97, 98, 103, 112 (quarantined without blind delete; blocks completion) |
| **AC-08** | Reusable pre-existing seed user never deleted | **IMPLEMENTED (OFFLINE TESTED)** | Tests 88, 89, 94, 100 (`protectSeedIdentity`) |
| **AC-09** | Run-created seed user never reclassified as pre-existing | **IMPLEMENTED (OFFLINE TESTED)** | Tests 88, 94 |
| **AC-10** | Seed user with unknown ownership blocks destructive action | **IMPLEMENTED (OFFLINE TESTED)** | Tests 88, 89 |
| **AC-11** | Seed password restore blocks on pending uncompleted mutation | **IMPLEMENTED (OFFLINE TESTED)** | Tests 78, 79, 86, 98, 104, 112 (`lateSettlementsDuringCleanup` & concurrent quiesce) |
| **AC-12** | Operator recovery verifies object absence before user delete | **IMPLEMENTED (OFFLINE TESTED)** | Tests 94, 98, 99, 100, 106 (`verifyStorageObjectAbsenceDetailed` HTTP 404 & 400 `NoSuchKey`) |

---

## 5. Historical R4 Verification Test Suite Results

```powershell
# 1. Hosted Probe Runner Suite (Host + Docker node:24-bookworm --network none)
node --test experiments/task06i/hosted-probe-runner.test.mjs
# Result: 116 passed, 0 failed, 0 skipped (both Windows host Node.js & Docker node:24-bookworm --network none)
# Includes Tests 108-112 verifying R4-01..R4-04 and Unified Offline Trust Boundary Acceptance
# Inside --network none: raw fetch('https://example.com') failed at OS level (EAI_AGAIN)

# 2. Task 06I Security Test Suite (116 runner tests + 68 parity/evaluator tests = 184 total)
node --test experiments/task06i/*.test.mjs
# Result: 184 passed, 0 failed, 0 skipped

# 3. PostgreSQL Contract Parity Check + SQL RPC Verification (public.ecr.aws/supabase/postgres:17.11.0.018 --network none)
node experiments/task06i/sql-contract-parity.mjs
# Result: Status POSTGRES_VERIFIED (18/18 cases matched on PostgreSQL 17.11)
# Verified experiments/task06i/sql/testbed-fixtures.sql:
#   - task06i_lookup_storage_object_owner: SECURITY DEFINER, search_path=""
#   - Privileges: PUBLIC=f, anon=f, authenticated=f, service_role=t
#   - service_role query on 'task06i_probe_bucket' returned expected row; 'other_bucket' rejected (SQLSTATE 42501); anon/authenticated denied (insufficient_privilege / 42501)

# 4. Task 06H Isolated Auth Integration Suite
node --test experiments/task06h/*.test.mjs
# Result: 115 passed, 0 failed, 0 skipped

# 5. Repository Verification Suite
npm run verify
# Result: tokens guard pass, tsc --noEmit pass, eslint max-warnings=0 pass, 22 shell tests pass (22 passed, 0 failed)

# 6. Git Diff Checks
git diff --check
git diff --check origin/main...HEAD
# Result: Clean (0 errors)
```

---

## 6. Security Gates, Remaining Prerequisites & Final Verdict

| Gate / Invariant | Status | Notes / Prerequisite |
|---|---|---|
| **H3 Subset Runner** | **IMPLEMENTED_OFFLINE_TESTED / BLOCKED** | Blocked from live dispatch pending Durable Recovery |
| **H3 Storage Lifecycle** | **IMPLEMENTED_OFFLINE_TESTED / BLOCKED** | Blocked pending Durable Recovery & `testbed-fixtures.sql` deployment (`task06i_lookup_storage_object_owner`) |
| **Durable Recovery** | **NOT IMPLEMENTED** | Blocks live hosted execution (`BLOCKED_PENDING_DURABLE_RECOVERY`) |
| **Run-Created Seed Support** | **NOT IMPLEMENTED** | Option B disposable seed gated; Option A pre-existing seed preserved |
| **Hosted Verification** | **0/18** | Zero live probes executed |
| **Hosted LIVE Execution** | **NOT AUTHORIZED** | Runner defaults unconditionally to `DRY_RUN`; real/bound/wrapped fetch & arbitrary ownership callbacks blocked |
| **Production Real Auth** | **STRICT NO-GO** | Pinned GoTrue vulnerabilities remain; production gates strictly locked |
| **Cost Ceiling ($0.00)** | **HONORED** | Zero paid services, 0 hosted mutations |
| **Protected Boundaries** | **HONORED** | `bsfwzvgynwriswapxpsp` (REAL) and `oykupyiitspujzpwwvuj` (Tio-world) immune |

---

## 7. R5 Authorization, Ownership & Current Contracts

**Owner authorization:** 2026-11-25 bounded H3-R5 local remediation, offline verification, commit/push to existing PR #44, individual review replies/resolution where demonstrated, and re-review requests. No merge, hosted endpoint, hosted SQL, Management API, email, paid service or H4 implementation is authorized.

| Ownership field | Record |
|---|---|
| Implementation owner | Codex root agent, current H3-R5 chat |
| Previous agent | H3-R4 author at verified HEAD `b06ab2993658aefb8d48de2d9a337392f2599bbb` |
| Bounded test handoff | `migrate_admin_tests`, only `experiments/task06i/hosted-probe-runner.test.mjs`; no source, Git or external writes |
| Independent reviewer | `security_review`, read-only local diff assessment; GitHub review separately requested from `im-tio` |
| Last implementation commit agent / verified SHA | Codex root / `3542e23777bceb3461959fa708a588ef9adf7d11` (R5 source and tests); documentation follow-up records this verified implementation HEAD |

### R5-01: Mandatory Admin execution boundary

All executing Admin dependencies must originate from `createHostedAdminClient`, be registered in the private `TRUSTED_ADMIN_CLIENTS` WeakMap, use a registered deterministic transport, and match the exact TEMP project and applicable inventory/run-owned path. Adapter objects and every public capability function are frozen. Private identity is checked before reading an unregistered object's properties; marker getters, callback methods, clones and Proxies cannot establish trust. Capability calls use `Reflect.apply` and reject borrowed receivers.

| Boundary | Enforced behavior |
|---|---|
| Runner admission | Validate project/inventory/run and registered Admin before probe callback dispatch. Rejected admission produces report-only residual evidence; even an adapter matching a different inventory cannot mutate it. DRY_RUN returns before executing dependencies. |
| Storage provisioning | Validate registered transport and run-bound Admin before reservation/provider calls; privileged ownership and absence use registered capabilities only. |
| Public and direct internal cleanup | Require registered Admin with `runId === inventory.runId` before any table/Storage/session/user/restoration capability. Missing Admin is allowed only for empty, non-executing inventory reporting. |
| Detailed / boolean absence | Validate project and explicit run or run-owned path, return structured non-absence on integrity failure, never execute a custom boolean verifier. |
| Session reconciliation | Use only registered `invalidateSession` / `signOut`; original token-context, provider-result and minted-session obligations remain active. |
| Credential restoration | Use registered `updateUserById`, `verifyUserCredentials`, and `signOut`; remove nested arbitrary SDK fallback; preserve ownership, unresolved mutation and verification-session gates. |
| Direct factory capabilities | Verify registered receiver/capability identity and transport; enforce inventory or Storage path run binding before method body. |
| CLI / hosted dispatcher | Existing registered deterministic transport checks and durable recovery gate remain active. No real hosted dispatch is enabled. |

`mockDispatcher` remains the existing in-process orchestration test seam; it is executable test code, not a sandbox. The capability guarantees concern Admin/transport dependencies. Container `--network none` supplies OS network isolation during full-suite verification; no claim is made that a global fetch trap constrains arbitrary JavaScript APIs.

### Storage creation provenance during the unified audit

Path-only `registerStorageObject` records are unresolved obligations, not permission to delete. Cleanup preserves them as `UNVERIFIED_STORAGE_OWNERSHIP` and blocks user deletion. Public `registerStorageFixture` lifecycle labels also cannot grant deletion authority: private `VERIFIED_STORAGE_CREATIONS` receipts are issued only by successful `provisionStorageProbeFixture` after upload, exact payload/digest and authoritative ownership verification. Receipts bind inventory, record identity, run/key and immutable ownership facts. Both deletion and SESSION-05 require this provenance. Positive tests use the actual provisioning path; fabricated verified creation records are negative cases. These receipts are process-local and provide no H4 crash recovery.

### R5-02: Cleanup idempotency and authentic terminal evidence

Only a private receipt created after successful registered deletion plus authoritative absence can settle a `DELETION_VERIFIED` record. The receipt binds inventory identity, run, key, record identity, original ownership fields, and the complete terminal evidence snapshot. Descriptor-value comparison rejects modified fields, accessors, callbacks and caller `toJSON` without treating a caller-written terminal label as evidence. The same receipt check governs repeated cleanup, `isClean()`, and the pre-user-deletion audit.

For an intact receipt, repeated cleanup preserves ownership/absence evidence, sends no further DELETE, and cannot manufacture a Storage residual. New unresolved operations, late settlements and post-finalization mutations remain blockers even when the Storage receipt is authentic. Prior failures retain their unresolved obligations.

### R5-03 / R5-04: Structured failure evidence

- Invalid or missing Admin with outstanding obligations always prevents execution and finalizes the run as `RESIDUAL_BLOCKED`.
- `failClosed: false` returns `CLEANUP_FAILED_RESIDUAL_RESOURCES` with the sanitized integrity reason and outstanding user, Storage, table, session, credential, unresolved-operation and late-mutation obligations.
- `failClosed: true` throws an Error with `code: CLEANUP_FAILED_RESIDUAL_RESOURCES` and sanitized `error.cleanupReport`. Ordinary residual cleanup errors use the same supported report contract.
- Runner cleanup preserves `error.cleanupReport` instead of collapsing it into a generic failure. Admission rejection also carries this report without provider operations.
- Detailed absence integrity rejection returns `isAbsent: false`, `INDETERMINATE`, `status: 0`, `providerResponseObtained: false`, and a sanitized reason. The boolean wrapper returns false. Status 0 represents no provider response, never a fabricated HTTP 404.

### H2 acceptance traceability correction

The table in section 4 records historical offline sub-behavior coverage, not durable recovery or Option B completion. **AC-01 and AC-09 remain partial**: simulated creation/ownership is tested, but actual run-created seed support is NOT IMPLEMENTED. **AC-05, AC-06 and AC-12 remain partial**: in-memory failure/quarantine/absence behavior is tested, but process-crash journal rehydration and operator recovery are NOT IMPLEMENTED. R5 strengthens AC-02/03/07/08/10/11/12 via mandatory Admin admission, terminal evidence and retained structured residuals. No H2 scenario is evidence of hosted acceptance; hosted verification remains 0/18.

## 8. R5 Verification & Review Evidence

Historical section 5 counts belong to R4. Current R5 results on the source/test diff based on `b06ab2993658aefb8d48de2d9a337392f2599bbb`:

| Check actually executed | Result / exit code |
|---|---|
| `node --test experiments/task06i/hosted-probe-runner.test.mjs` | 125/125 PASS, exit 0 |
| `node --test experiments/task06i/*.test.mjs` | 193/193 PASS, exit 0 |
| `node --test --test-name-pattern='H3-R5' experiments/task06i/hosted-probe-runner.test.mjs` | 9/9 PASS, exit 0; Tests 113-121 |
| `node experiments/task06i/sql-contract-parity.mjs` | POSTGRES_VERIFIED, 18/18, PostgreSQL 17.11, exit 0; local Docker context desktop-linux |
| `node --test experiments/task06h/*.test.mjs` | 115/115 PASS, exit 0 |
| `npm run verify` | Token self-test/check, TypeScript, ESLint and 22/22 shell tests PASS, exit 0 |
| Full runner in `node:24-bookworm`, `--network none`, read-only experiments mount | 125/125 PASS, exit 0; `--pull never`, no published ports |
| Separate OS network sentinel in `--network none` | Non-Supabase `https://example.com` rejected with EAI_AGAIN, exit 0 |
| Ownership RPC privilege assertions in `public.ecr.aws/supabase/postgres:17.11.0.018` | PASS, exit 0; network none, zero published ports; PUBLIC/anon/authenticated denied, service_role allowed; exact owner row and wrong-bucket denial; SECURITY DEFINER + empty search_path verified |
| `git diff --check` / `git diff --check origin/main...HEAD` | PASS, exit 0 |
| Changed Markdown relative links and code fences | PASS, exit 0 |
| `node --check experiments/task06i/hosted-probe-runner.mjs` | PASS, exit 0 |
| Guard-integrity fixture tests | 14/14 PASS, exit 0 |
| Commit-attribution fixture tests | 142/142 PASS, exit 0 |
| Added-line credential literal scan | PASS, exit 0; private-key/GitHub/Supabase-secret/Brevo-key patterns; synthetic fixtures only |

RPC setup limitation: the bare PostgreSQL image does not include the Storage service schema. Full `testbed-fixtures.sql` load stopped at missing `storage.buckets`; a fixture table initially failed under the restricted local `postgres` role. The final successful RPC verification used a synthetic local `storage.objects` table and the exact unchanged RPC/grants from the repository under the container administrator. This is RPC/privilege evidence, not deployment or full Supabase Storage integration. The disposable container was stopped and removed. No tracked SQL changed.

The pinned Supabase CLI version check could not finish because its telemetry write was denied by the sandbox; no CLI hosted command was used. Docker access and Git Bash MSYS fixture execution required approved sandbox escalation; subsequent Docker/fixture checks ran successfully.

Legacy migration: approximately 66 callback Admin declarations became declarative provider fixtures; callback observation assertions now inspect real registered transport calls, including exact URL/body and logout retry counts. Twelve manually verified Storage positive cases and three raw-path positive cases now provision actual offline fixtures. Missing-method cases reject unregistered clients, while provider-error and missing-token negative assertions remain. No legacy compatibility flag or executable trust bypass exists.

R5 regressions prove zero invalid callback/getter invocations and zero unauthorized transport calls, direct public/internal cleanup and both absence interfaces, invalid runner admission with all obligations retained, both reporting modes, three consecutive Storage cleanups with optional sessions, residual retry, late operations, forged creation/terminal evidence, and frozen/borrowed capability methods. Additional cleanup calls issue zero extra DELETEs and preserve the exact original terminal evidence.

Independent local review: `security_review`, read-only assessment of base `b06ab299...` against the final uncommitted R5 source/tests/docs, verdict **PASS**. Reviewer ran syntax check, 9/9 R5 tests and diff whitespace check; did not rerun full suites/Docker. Initial findings (terminal serialization, admission mutation, mutable capability functions, raw-path and forged-creation deletion) were corrected and rechecked. This assessment is not GitHub APPROVED. GitHub `im-tio` decision at the baseline remains CHANGES_REQUESTED until exact-new-HEAD re-review. No review was dismissed.

Remote bootstrap checks: six SUCCESS, Cursor Bugbot NEUTRAL; baseline review threads 31 total / 27 resolved / 4 unresolved. Publication checkpoint: remote HEAD `d79dece4a3752207ad5533cc5b89494b94b2e53b` verified on the existing branch, main unchanged. All 31 threads resolved after individual R5 fix/evidence replies: [R5-01](https://github.com/im-tnyx/Tio-Workspace/pull/44#discussion_r4691532819), [R5-02](https://github.com/im-tnyx/Tio-Workspace/pull/44#discussion_r4691533499), [R5-03](https://github.com/im-tnyx/Tio-Workspace/pull/44#discussion_r4691534092), [R5-04](https://github.com/im-tnyx/Tio-Workspace/pull/44#discussion_r4691534740). [Exact-HEAD re-review request](https://github.com/im-tnyx/Tio-Workspace/pull/44#issuecomment-7155571434) posted; `im-tio` requested reviewer. Prior CHANGES_REQUESTED remains intact; no formal new approval. Required attribution check plus attribution runner/fixtures, PostgreSQL parity and Task06I CI succeeded; Bugbot and Security Reviewer were IN_PROGRESS. This follow-up changes continuity documentation only; use the live PR for final head/check/review state.

## 9. Remaining Gates & Next Authorized Action

H3 Subset Runner and H3 Storage Lifecycle: `IMPLEMENTED_OFFLINE_TESTED / BLOCKED` after the verified R5 offline results above. Durable Recovery: NOT IMPLEMENTED. Run-Created Seed Support: NOT IMPLEMENTED. Hosted Verification: 0/18. Hosted LIVE: NOT AUTHORIZED. Production Real Auth: STRICT NO-GO. Hosted Mutations: 0. Cost: $0. Merge: NOT AUTHORIZED.

Offline verification and independent diff review are complete for implementation `3542e23777bceb3461959fa708a588ef9adf7d11`. Publication, individual finding replies/resolution and re-review requests are recorded above.

---

## 10. Revision R6 — Mandatory Trusted Offline Dispatcher Admission & Final P1 Closure

**Bootstrap baseline:** Local/remote HEAD `6c54ab2f2a0c72e479bbc686c067e0c0d9c8c43f`, `main` `4569479e8fe2caa6659fe1cc6c7a484596a01bbc`, clean worktree, 32 review threads (31 resolved, 1 unresolved P1 `PRRT_kwDOVtCmZc67xeWI`), 8/8 CI checks PASS (including Cursor Bugbot PASS & Cursor Security Reviewer PASS), and independent `im-tio` review `CHANGES_REQUESTED` (`2026-11-25T07:21:46Z`).

### R6-01: Mandatory Trusted Offline Dispatcher & Mode Separation (`PRRT_kwDOVtCmZc67xeWI`)

1. **Private Registration (`TRUSTED_OFFLINE_DISPATCHERS`):** `createTrustedOfflineDispatcher(spec)` constructs frozen, declarative-only offline dispatchers backed by `createDeterministicFixtureTransport()`, bound strictly to `HARDCODED_TEMP_REF` and an explicit `validateRunId(runId)`, with zero arbitrary callbacks, accessors, symbols, cycles, or public trust markers.
2. **Mandatory Runner Admission (`assertTrustedOfflineDispatcher`):** `runHostedProbeRunner()` and `runOfflineProbeSimulation()` unconditionally validate BOTH `assertTrustedOfflineDispatcher()` and `assertTrustedAdminClient()` before any probe, provisioning, or destructive cleanup call. Unregistered functions, captured-fetch closures, bound/wrapped functions, forged markers (`_isTrustedOfflineDispatcher`, etc.), `Proxy` wrappers, cross-project/cross-run/unbound dispatchers, and `HOSTED_NETWORK_DISPATCHERS` are rejected fail-closed while preserving existing residual obligations in `error.cleanupReport` (`RESIDUAL_BLOCKED`).
3. **Explicit Mode Separation:**
   - `DRY_RUN`: planning only; zero network calls; no dispatcher/Admin required.
   - `OFFLINE_SIMULATION` (`runOfflineProbeSimulation()` or compatibility `LIVE` simulation): requires registered declarative dispatcher + registered Admin adapter; reports `simulatedExecution: true`, `hostedProviderVerified: false`.
   - Real `LIVE` hosted dispatch: unconditionally blocked (`BLOCKED_PENDING_DURABLE_RECOVERY`) at CLI `--live` and for `HOSTED_NETWORK_DISPATCHERS`, independent of optional flags (`liveHostedDispatch`, `enforceDurableRecoveryGate`, `requireSelection`, `_isHostedNetworkDispatcher`, function names, or caller booleans).
4. **Legacy Test Migration:** All callback-based `mockDispatcher` runner tests in `experiments/task06i/hosted-probe-runner.test.mjs` migrated to declarative `offlineDispatcherSpec` / `createTrustedOfflineDispatcher` fixtures preserving all H1–H3 behavioral assertions.

### Executable Dependency Audit Matrix (R6)

| Boundary / Entry Point | Trust Validation | Registration Source | Project / Run Binding | Invocation Boundary | Negative Regression Coverage | Reachable Native Network? |
|---|---|---|---|---|---|---|
| **Runner Admission** (`runHostedProbeRunner` / `runOfflineProbeSimulation`) | `assertTrustedOfflineDispatcher` + `assertTrustedAdminClient` + `HOSTED_NETWORK_DISPATCHERS` block | `TRUSTED_OFFLINE_DISPATCHERS` & `TRUSTED_ADMIN_CLIENTS` `WeakMap`s | `HARDCODED_TEMP_REF` + exact `activeInventory.runId` | Before probe loop, provisioning, or cleanup | Tests 11, 25, 56, 96, 100, 115, 123 | **No** (no caller callbacks admitted) |
| **Offline Dispatcher** (`createTrustedOfflineDispatcher`) | `validateDeclarativeFixtureValue` + `assertOfflineMockTransport` + `Object.freeze` | `TRUSTED_OFFLINE_DISPATCHERS` `WeakMap` | `HARDCODED_TEMP_REF` + required `runId` | `runWithBlockedRealFetch()` | Tests 122, 123, 124 | **No** (declarative fixtures + `TRUSTED_DETERMINISTIC_TRANSPORTS` only) |
| **Hosted Network Dispatcher** (`createHostedDispatcher`) | `assertOfflineMockTransport` + `HOSTED_NETWORK_DISPATCHERS` `WeakSet` | `HOSTED_NETWORK_DISPATCHERS` | `HARDCODED_TEMP_REF` + `validateProjectCredentialBinding` | Unconditionally blocked in `runHostedProbeRunner` | Tests 34, 96, 100, 102, 112 | **No** (blocked in runner; `fetchFn` gated to deterministic transport) |
| **Probe Helpers & `TestRunInventory`** | Pure data / `validateProbeOutcome` + private `VERIFIED_STORAGE_CREATIONS` / `VERIFIED_STORAGE_DELETIONS` | Module-private `WeakMap`s | `inventory.runId` | In-process state & `executeCleanup` | Tests 15–32, 113–121 | **No** (zero network APIs) |
| **Admin Adapter** (`createHostedAdminClient`) | `assertTrustedAdminClient` + frozen capabilities + `Reflect.apply` | `TRUSTED_ADMIN_CLIENTS` `WeakMap` | `HARDCODED_TEMP_REF` + `runId` / Storage path `runId` | `runWithBlockedRealFetch()` | Tests 108, 113, 114, 115, 119 | **No** (`TRUSTED_DETERMINISTIC_TRANSPORTS` only) |
| **Storage Provisioning** (`provisionStorageProbeFixture`) | `assertTrustedAdminClient` + `assertOfflineMockTransport` + `ownershipLookupFn` rejected | `TRUSTED_ADMIN_CLIENTS` + `TRUSTED_DETERMINISTIC_TRANSPORTS` | `HARDCODED_TEMP_REF` + `runId` + `/auth/v1/user` `sub` | `runWithBlockedRealFetch()` | Tests 93, 96–100, 103, 108, 112 | **No** (arbitrary callbacks rejected pre-mutation) |
| **Cleanup & Absence** (`executeCleanup`, `verifyStorageObjectAbsenceDetailed`) | `assertTrustedAdminClient` + private deletion/creation receipts | `TRUSTED_ADMIN_CLIENTS` + `VERIFIED_STORAGE_*` | `HARDCODED_TEMP_REF` + `inventory.runId` | `runWithBlockedRealFetch()` + structured `failClosed` / `INDETERMINATE` | Tests 113–121 | **No** (`TRUSTED_DETERMINISTIC_TRANSPORTS` only) |
| **Reporting** (`sanitizeData`, `cleanupFailure`) | Recursive secret redaction + `simulatedExecution: true`, `hostedProviderVerified: false` | Module-internal | `runId` + sanitized `cleanupReport` | Post-run / admission-error | Tests 9, 9b, 21, 23, 27, 29, 115, 123, 124 | **No** (pure serialization) |

*Containment Note:* Application-level `WeakMap` capability restrictions and `runWithBlockedRealFetch()` do not claim to sandbox arbitrary JavaScript executed outside the exported runner in the host Node process; OS/container network isolation (`docker --network none`) is a separate security layer verified alongside the full runner suite.

### R6 Verification Matrix

| Check Executed | Result / Exit Code |
|---|---|
| `node --test experiments/task06i/hosted-probe-runner.test.mjs` | **128/128 PASS**, exit 0 (includes Tests 122–124) |
| `node --test experiments/task06i/*.test.mjs` | **196/196 PASS**, exit 0 |
| Docker `node:24-bookworm --network none --pull never` runner suite | **128/128 PASS**, exit 0 |
| `node experiments/task06i/sql-contract-parity.mjs` | **POSTGRES_VERIFIED 18/18** on PostgreSQL 17.11, exit 0 |
| `node --test experiments/task06h/*.test.mjs` | **115/115 PASS**, exit 0 |
| `npm run verify` | Tokens guard, `tsc --noEmit`, `eslint --max-warnings=0`, **22/22 shell tests PASS**, exit 0 |
| `git diff --check` & `git diff --check origin/main...HEAD` | **CLEAN**, exit 0 |

*Preserved R5/Environment Limitations:* Synthetic local metadata verification is not full Supabase Storage integration; pinned Supabase CLI telemetry-write denial remains an environment limitation; actual hosted verification remains `0/18`; H4 durable recovery and Option B run-created seed support remain `NOT IMPLEMENTED`.

### Final R6 Decisions

- **H3 Subset Runner:** `IMPLEMENTED_OFFLINE_TESTED / BLOCKED`
- **H3 Storage Lifecycle:** `IMPLEMENTED_OFFLINE_TESTED / BLOCKED`
- **Durable Recovery:** `NOT IMPLEMENTED`
- **Run-Created Seed Support:** `NOT IMPLEMENTED`
- **Hosted Verification:** `0/18`
- **Hosted LIVE:** `NOT AUTHORIZED`
- **Production Real Auth:** `STRICT NO-GO`
- **Hosted Mutations:** `0`
- **Cost:** `$0`
- **Merge:** `NOT AUTHORIZED`
