# Task 06I-B1-H3 — Controlled Subset Dispatch & Run-Scoped Storage Implementation

**Task ID:** `06I-B1-H3` (Revision `R15`)<br>
**Creation Date:** 2026-11-24<br>
**Revision Date:** 2026-11-25<br>
**Author:** Santosh Jangid (`im-tnyx`)<br>
**Reviewer:** `im-tio` (Independent Reviewer), Codex, Cursor Bugbot, Cursor Security Reviewer<br>
**Branch:** `feat/task06i-b1-h3-subset-runner-storage`<br>
**Base:** `main` at `4569479e8fe2caa6659fe1cc6c7a484596a01bbc` (PR #43 merge commit)<br>
**PR Reference:** https://github.com/im-tnyx/Tio-Workspace/pull/44<br>
**Prior Audited HEAD:** `c8a504c5142d1eca789b91f2950833b5e536aed3` (R14)<br>
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

---

## 11. Revision R7 — Declarative Timing & Descriptor-First Admission Security Closure

**Bootstrap baseline:** Local/remote HEAD `7c4efa70c442236cfb7d635afefa4dddacf2f0a7`, `main` `4569479e8fe2caa6659fe1cc6c7a484596a01bbc`, clean worktree, 34 review threads (32 resolved, 2 unresolved P1s `PRRT_kwDOVtCmZc671ZZU` and `PRRT_kwDOVtCmZc671ZZe`), 7/7 CI checks PASS (Cursor Bugbot PASS, Cursor Security Reviewer PASS), and independent `im-tio` review `CHANGES_REQUESTED` (`2026-11-25T10:04:34Z`).

### R7-01: Declarative Timing & Removal of Executable `sleepFn` (`PRRT_kwDOVtCmZc671ZZU`)

1. Removed `sleepFn` parameter from `_runHostedProbeRunnerInternal()` / `runHostedProbeRunner()` / `runOfflineProbeSimulation()`.
2. Replaced with internal module-owned `internalThrottleWait(ms)` and validated declarative `timing` configuration (`validateDeclarativeTimingConfig`: `{ mode: 'standard' | 'recorded_zero_wait', intervalMs }`).
3. Any own or inherited (`Object.prototype` / custom prototype) `sleepFn` override, timing getter, or invalid `timing` config is rejected fail-closed at admission (`UNTRUSTED_TIMING_OVERRIDE` / `INVALID_TIMING_CONFIG` / `Accessor property rejected`) before any probe, provisioning, or cleanup dispatch, preserving existing residual obligations in `error.cleanupReport`.
4. `throttleIntervalsMs` records canonical `RATE_LIMIT_CONFIG.minIntervalMs` (1000ms) across multi-probe runs. Declarative timing overrides are prohibited for real hosted execution.
5. Migrated all 20 `sleepFn` usages in `hosted-probe-runner.test.mjs` to `timing: { mode: 'recorded_zero_wait' }`.

### R7-02 & R7-03: Descriptor-First Input Admission Across All Public Entry Points (`PRRT_kwDOVtCmZc671ZZe`)

1. Added `extractValidatedPlainOptions(rawInput, label)` using `node:util` `types.isProxy()` before reflection, prototype validation (`null` or `Object.prototype` only), symbol rejection (`Object.getOwnPropertySymbols`), and own property descriptor scanning (`Object.getOwnPropertyNames` + `Object.getOwnPropertyDescriptor` rejecting getters/setters) into a clean `Object.create(null)` snapshot before reading any property.
2. Updated `createTrustedOfflineDispatcher(rawSpec)` to extract descriptors (including `fetchFn`), run `validateDeclarativeFixtureValue()` (with nested `utilTypes.isProxy` check) BEFORE reading `projectRef`, `runId`, `fetchFn`, or `transportSpec`, and validate `fetchFn` only via `assertOfflineMockTransport`.
3. Audited and updated all public entry points to enforce descriptor-first admission before destructuring/spreading:
   - `runHostedProbeRunner(rawOptions)` & `runOfflineProbeSimulation(rawOptions)` (eliminated pre-validation `{ ...options }` spread)
   - `createDeterministicFixtureTransport(rawSpec)`
   - `createHostedDispatcher(rawOptions)`
   - `createHostedAdminClient(rawOptions)`
   - `provisionStorageProbeFixture(rawOptions)`
   - `TestRunInventory.executeCleanup(rawOptions)`
   - `verifyStorageObjectAbsenceDetailed(adminClient, bucket, path, rawOptions)` (returns structured `INDETERMINATE` without invoking getters/traps)

### R7 Verification Matrix

| Check Executed | Result / Exit Code |
|---|---|
| `node --test experiments/task06i/hosted-probe-runner.test.mjs` | **131/131 PASS**, exit 0 (includes Tests 125–127) |
| `node --test experiments/task06i/*.test.mjs` | **199/199 PASS**, exit 0 |
| Docker `node:24-bookworm --network none --pull never` runner suite | **131/131 PASS**, exit 0 |
| `node experiments/task06i/sql-contract-parity.mjs` | **POSTGRES_VERIFIED 18/18** on PostgreSQL 17.11, exit 0 |
| `node --test experiments/task06h/*.test.mjs` | **115/115 PASS**, exit 0 |
| `npm run verify` | Tokens guard, `tsc --noEmit`, `eslint --max-warnings=0`, **22/22 shell tests PASS**, exit 0 |
| `git diff --check` & `git diff --check origin/main...HEAD` | **CLEAN**, exit 0 |

### Final R7 Decisions

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

---

## 12. Revision R8 — Recursive Input Admission & Trusted Runtime State Closure

**Bootstrap baseline:** Local/remote HEAD `9a6cb6cc258a675434fabd1a465364eff6149a5b`, `main` `4569479e8fe2caa6659fe1cc6c7a484596a01bbc`, clean worktree, 36 review threads (34 resolved, 2 unresolved P1s `PRRT_kwDOVtCmZc671plF` and `PRRT_kwDOVtCmZc671plN`), 6 successful checks (Cursor Bugbot pending at audit time), and independent `im-tio` review `CHANGES_REQUESTED` (`2026-11-25T10:13:56Z`).

### R8-01: Typed `argv`/`env` Snapshots, Trusted Runtime Inventory/Context & Safe Admission Failure (`PRRT_kwDOVtCmZc671plF`)

1. **Typed `argv` / `env` (`snapshotRunnerArgv`, `snapshotRunnerEnv`, `determineRunnerMode`):** Rejects Proxy objects, non-Array `argv`, custom prototypes, extra/overridden properties (`includes`, etc.), symbol properties, index getters, and non-string elements; copies validated strings by index descriptor into a module-owned array without calling any method on the caller array. `env` rejects Proxies, non-plain objects, symbols, accessors, and non-string values, extracting only `TASK06I_HOSTED_PROBE_AUTHORIZED` (with safe descriptor-read support for real `process.env`).
2. **Trusted Runtime `TestRunInventory` (`TRUSTED_RUN_INVENTORIES`, `assertTrustedRunInventory`):** Every `TestRunInventory` registers itself and its immutable baseline methods in module-private `WeakMap` `TRUSTED_RUN_INVENTORIES`. `assertTrustedRunInventory()` rejects Proxies, forged objects, custom prototypes, symbols, own accessors, tampered `runId`, and replaced instance methods BEFORE reading `runId` or calling `executeCleanup()`, enforced in `_runHostedProbeRunnerInternal()`, `provisionStorageProbeFixture()`, and `createHostedDispatcher()`.
3. **Trusted Runtime `RunContext` (`TRUSTED_RUN_CONTEXTS`, `assertTrustedRunContext`):** `createRunContext()` validates options via `extractValidatedPlainOptions()` and registers `{ instance, runId, methods: { clear } }` in `TRUSTED_RUN_CONTEXTS`; `assertTrustedRunContext()` is enforced at runner admission.
4. **Safe Admission Failure Reporting:** When `inventory` fails `assertTrustedRunInventory()`, `_runHostedProbeRunnerInternal()` never accesses its properties or calls `executeCleanup()`, throwing `cleanupFailure` with `inventoryTrusted: false`, `inventoryEvidenceUnavailable: true`, and `CLEANUP_FAILED_RESIDUAL_RESOURCES`. Authentic inventories with admission failures preserve existing obligations via `executeCleanup({ adminClient: null, failClosed: false, settlementTimeoutMs: 0 })` without destructive dispatch.

### R8-02 & R8-03: Intrinsic `RegExp` Snapshot & Unified Recursive Validation Contract (`PRRT_kwDOVtCmZc671plN`)

1. `validateDeclarativeFixtureValue()` validates `RegExp` via `util.types.isRegExp()`, exact `RegExp.prototype` check (rejecting subclasses/modified prototypes), zero symbol properties, and own descriptor scan permitting only numeric data `lastIndex` (rejecting `source`/`flags` getters, `exec`/`test` overrides, and non-enumerable accessors).
2. `clonePlainData()` and `createDeterministicFixtureTransport()` (`matchesRoute`) use module-load captured intrinsic `RegExp.prototype` `source`/`flags` getters and `RegExp.prototype.test` (`INTRINSIC_REGEXP_SOURCE_GET`, `INTRINSIC_REGEXP_FLAGS_GET`, `INTRINSIC_REGEXP_TEST`), plus descriptor-only array/plain-object cloning.

| Input Category | R8 Admission Contract |
|---|---|
| Primitive values | Explicit type and range validation |
| `argv` / `env` | `snapshotRunnerArgv()` / `snapshotRunnerEnv()` inert primitive snapshots |
| Arrays and plain records | Recursive descriptor-first validation and independent snapshot |
| Binary fixture data | Intrinsic `ArrayBuffer` / `ArrayBuffer.isView` + independent byte slice copy |
| Regex patterns | `util.types.isRegExp()` + `RegExp.prototype` + data-only `lastIndex` + intrinsic `source`/`flags`/`test` |
| Admin and dispatcher | Private `WeakMap` (`TRUSTED_ADMIN_CLIENTS`, `TRUSTED_OFFLINE_DISPATCHERS`), frozen capabilities |
| Inventory and run context | Private `WeakMap` (`TRUSTED_RUN_INVENTORIES`, `TRUSTED_RUN_CONTEXTS`), baseline method integrity |
| Barrier handles | Private `WeakSet` (`TRUSTED_OFFLINE_BARRIERS`) |
| Functions and unknown objects | Rejected fail-closed unless registered by internal factory |

### R8 Verification Matrix

| Check Executed | Result / Exit Code |
|---|---|
| `node --test experiments/task06i/hosted-probe-runner.test.mjs` | **134/134 PASS**, exit 0 (includes Tests 128–130) |
| `node --test experiments/task06i/*.test.mjs` | **202/202 PASS**, exit 0 |
| Docker `node:24-bookworm --network none --pull never` runner suite | **134/134 PASS**, exit 0 |
| `node experiments/task06i/sql-contract-parity.mjs` | **POSTGRES_VERIFIED 18/18** on PostgreSQL 17.11, exit 0 |
| `node --test experiments/task06h/*.test.mjs` | **115/115 PASS**, exit 0 |
| `npm run verify` | Tokens guard, `tsc --noEmit`, `eslint --max-warnings=0`, **22/22 shell tests PASS**, exit 0 |
| `git diff --check` & `git diff --check origin/main...HEAD` | **CLEAN**, exit 0 |

### Final R8 Decisions

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

---

## 13. Revision R9 — Unified Typed Admission, Immutable Run Binding & Dispatcher Factory Closure

**Bootstrap baseline:** Local/remote HEAD `d82ef6bb44b16ab9774d5536464e738b2849a947`, `main` `4569479e8fe2caa6659fe1cc6c7a484596a01bbc`, clean worktree, 40 review threads (36 resolved, 4 unresolved: `PRRT_kwDOVtCmZc672Fba`, `PRRT_kwDOVtCmZc672Fbi`, `PRRT_kwDOVtCmZc672Im5`, `PRRT_kwDOVtCmZc672Im8`), 6 successful checks, Cursor Bugbot NEUTRAL, and independent `im-tio` review `CHANGES_REQUESTED` (`2026-11-25T10:31:37Z`).

### R9-01..R9-04 Remediation Summary

1. **R9-01 (`PRRT_kwDOVtCmZc672Fba` P1) — Immutable `RunContext` Binding:** `createRunContext()` defines `runId` and `projectRef` via `Object.defineProperty(..., { writable: false, configurable: false })` and tracks `cleared` state in `TRUSTED_RUN_CONTEXTS`. `assertTrustedRunContext()` compares `expectedRunId` against immutable `meta.runId`, verifies `runId`/`projectRef` own data descriptors match `meta`, enforces `HARDCODED_TEMP_REF`, and rejects cleared contexts (`UNTRUSTED_RUN_CONTEXT: Cleared run context is terminal`).
2. **R9-02 (`PRRT_kwDOVtCmZc672Fbi` P2) — Standalone `DRY_RUN` Default:** `determineRunnerMode(argv = [], env = {})`, `snapshotRunnerArgv(rawArgv = [])`, and `snapshotRunnerEnv(rawEnv = {})` default to empty `[]`/`{}` instead of ambient `process.argv`/`process.env`; only the standalone CLI block passes `process.argv`/`process.env` explicitly.
3. **R9-03 (`PRRT_kwDOVtCmZc672Im5` P1) — Typed Probe Selection Snapshot:** `validateSelectedProbeIds()` and `planProbeExecution()` reuse `snapshotStringArray()` (rejecting Proxies, non-Arrays, custom prototypes, symbols including `Symbol.iterator`, indexed accessors, overridden methods, sparse holes, and non-strings) before any iteration.
4. **R9-04 (`PRRT_kwDOVtCmZc672Im8` P1) — Dispatcher Factory & Per-Call Capability Enforcement:** `createHostedDispatcher()` enforces `admitValidatedInput(rawOptions, 'createHostedDispatcherOptions')`, credential binding, `assertOfflineMockTransport(fetchFn)` BEFORE touching `inventory`/`runContext`, then `assertTrustedRunInventory()` and `assertTrustedRunContext()` with immutable project/run correlation before `protectSeedIdentity()`. Returned `hostedDispatcher(rawItem, rawCallOptions)` enforces `admitValidatedInput(rawCallOptions, 'dispatcherCallOptions')` and validates per-call `inventory`/`runContext` overrides.

### Source-Backed Executable Boundary Audit Matrix (R9)

| Public entry point | Typed data schema | Trusted capability checks | Immutable binding | Before first execution | Regression test |
|---|---|---|---|---|---|
| `runHostedProbeRunner` / `runOfflineProbeSimulation` (`hosted-probe-runner.mjs`) | `UNIFIED_ADMISSION_SCHEMAS.runnerOptions` via `admitValidatedInput()`, `snapshotRunnerArgv()`, `snapshotRunnerEnv()`, `snapshotStringArray()` | `assertTrustedRunInventory()`, `assertTrustedRunContext()`, `assertTrustedOfflineDispatcher()`, `assertTrustedAdminClient()` | `HARDCODED_TEMP_REF` + exact `activeInventory.runId` | Yes (prior to probe loop, provisioning, or cleanup) | Tests 11, 25, 56, 115, 123, 125, 127–129, 131–133 |
| `determineRunnerMode` / `planProbeExecution` / `validateSelectedProbeIds` | `planProbeExecutionOptions` + `snapshotStringArray()` | Inert data only (zero callbacks/capabilities) | `HARDCODED_TEMP_REF` + `runId` | Yes (prior to `for` / `Array.from`) | Tests 7, 8, 90, 91, 128, 132, 133 |
| `createTrustedOfflineDispatcher` | `extractValidatedPlainOptions()` + `validateDeclarativeFixtureValue()` (incl. `isProxy`, `isRegExp`) | `assertOfflineMockTransport(fetchFn)` + `TRUSTED_OFFLINE_BARRIERS` + per-call `assertTrustedRunInventory` / `assertTrustedRunContext` | `HARDCODED_TEMP_REF` + required `runId` | Yes (prior to `TRUSTED_OFFLINE_DISPATCHERS` registration) | Tests 122–124, 126, 130 |
| `createHostedDispatcher` & `hostedDispatcher` | `createHostedDispatcherOptions` & `dispatcherCallOptions` via `admitValidatedInput()` | `assertOfflineMockTransport()`, `assertTrustedRunInventory()`, `assertTrustedRunContext()` (factory & per-call) | `HARDCODED_TEMP_REF` + correlated `runId` | Yes (prior to `protectSeedIdentity()` or `fetchFn` call) | Tests 34, 96, 100, 102, 127, 134 |
| `createRunContext` & `assertTrustedRunContext` | `createRunContextOptions` via `admitValidatedInput()` | `TRUSTED_RUN_CONTEXTS` `WeakMap` + `clear` method identity + `cleared` terminal flag | Non-writable, non-configurable `runId` & `projectRef` | Yes (prior to returning context or reading fields) | Tests 129, 131, 134 |
| `TestRunInventory` & `assertTrustedRunInventory` | `extractValidatedPlainOptions()` | `TRUSTED_RUN_INVENTORIES` `WeakMap` + baseline method equality | `HARDCODED_TEMP_REF` + `meta.runId` | Yes (prior to `runId` read or `executeCleanup()`) | Tests 113–121, 127, 129, 134 |
| `createHostedAdminClient` & `assertTrustedAdminClient` | `extractValidatedPlainOptions()` | `TRUSTED_ADMIN_CLIENTS` `WeakMap` + frozen capabilities + `assertOfflineMockTransport()` | `HARDCODED_TEMP_REF` + `runId` | Yes (prior to capability execution) | Tests 108, 113–115, 119, 127 |
| `provisionStorageProbeFixture`, `executeCleanup`, `verifyStorageObjectAbsenceDetailed` | `extractValidatedPlainOptions()` | `assertTrustedAdminClient()`, `assertTrustedRunInventory()`, `assertOfflineMockTransport()` | `HARDCODED_TEMP_REF` + `runId` | Yes (prior to reservation or provider call) | Tests 93–100, 103–108, 112–121, 127 |

### R9 Verification Matrix

| Check Executed | Result / Exit Code |
|---|---|
| `node --test experiments/task06i/hosted-probe-runner.test.mjs` | **138/138 PASS**, exit 0 (includes Tests 131–134) |
| `node --test experiments/task06i/*.test.mjs` | **206/206 PASS**, exit 0 |
| Docker `node:24-bookworm --network none --pull never` runner suite | **138/138 PASS**, exit 0 |
| `node experiments/task06i/sql-contract-parity.mjs` | **POSTGRES_VERIFIED 18/18** on PostgreSQL 17.11, exit 0 |
| `node --test experiments/task06h/*.test.mjs` | **115/115 PASS**, exit 0 |
| `npm run verify` | Tokens guard, `tsc --noEmit`, `eslint --max-warnings=0`, **22/22 shell tests PASS**, exit 0 |
| `git diff --check` & `git diff --check origin/main...HEAD` | **CLEAN**, exit 0 |

### Final R9 Decisions

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

---

## 14. Revision R10 — Enforced Typed Admission & Effective Run Capability Correlation

**Bootstrap baseline:** Local/remote HEAD `a192fbcd0958738a0126fe05d885a1493f625317`, `main` `4569479e8fe2caa6659fe1cc6c7a484596a01bbc`, clean worktree, 44 review threads (40 resolved, 4 unresolved: `PRRT_kwDOVtCmZc672m_v`, `PRRT_kwDOVtCmZc672m_0`, `PRRT_kwDOVtCmZc672pRQ`, `PRRT_kwDOVtCmZc672pRX`), 6 successful checks, Cursor Bugbot NEUTRAL, and independent `im-tio` review `CHANGES_REQUESTED` (`2026-11-25T10:49:55Z`).

### R10-01 & R10-02 Remediation Summary

1. **R10-01 (`PRRT_kwDOVtCmZc672m_v` P1) — Enforced Typed Admission & Deeply Immutable Schemas:** `deepFreeze()` locks `INTERNAL_ADMISSION_SCHEMAS` and exported `UNIFIED_ADMISSION_SCHEMAS` recursively across all 13 public entry-point/item schemas (`runnerOptions`, `planProbeExecutionOptions`, `validateSelectedProbeIdsOptions`, `createHostedDispatcherOptions`, `dispatcherCallOptions`, `offlineDispatcherCallOptions`, `probeItem`, `createRunContextOptions`, `TestRunInventoryOptions`, `createHostedAdminClientOptions`, `provisionStorageProbeFixtureOptions`, `executeCleanupOptions`, `verifyStorageObjectAbsenceOptions`). `admitValidatedInput()` reads exclusively from module-private `INTERNAL_ADMISSION_SCHEMAS` and enforces unknown-schema rejection, unknown-key rejection (`UNTRUSTED_ADMISSION_KEY`), required fields (`MISSING_REQUIRED_ADMISSION_FIELD`), nullability, `string` (blocking `.trim()` coercive objects), finite `number` + `min`/`max` bounds (`probeTimeoutMs` 1..60000, `ownershipTimeoutMs` 1..60000, `settlementTimeoutMs` 0..60000), `boolean`, `string_array` (`snapshotStringArray`), `env_record` (`snapshotRunnerEnv`), `declarative_record` (`validateDeclarativeFixtureValue` + `clonePlainData`), `string_or_binary`, `abort_signal` (non-Proxy `AbortSignal`), `any_rejected_callback`, and registered capability handles (`trusted_transport`, `trusted_offline_dispatcher`, `trusted_admin_client`, `trusted_inventory`, `trusted_run_context`).
2. **R10-02 (`PRRT_kwDOVtCmZc672m_0` P1, `PRRT_kwDOVtCmZc672pRQ` High, `PRRT_kwDOVtCmZc672pRX` Med) — Effective Dispatcher Capability Correlation:** `createHostedDispatcher()` binds `factoryBoundRunId` from factory `inventory`/`runContext`. On every `hostedDispatcher(rawItem, rawCallOptions)` call, `effInv = options.inventory ?? inventory` and `effCtx = options.runContext ?? runContext` are BOTH revalidated via `assertTrustedRunInventory()` and `assertTrustedRunContext()` (even when overrides are omitted, rejecting cleared `RunContext` and `FINALIZED` inventory BEFORE any transport or `protectSeedIdentity()` call), `options.projectRef` is pinned to `normRef`, `options.runId` is pinned to `factoryBoundRunId` when bound, and `effInv.runId` / `effCtx.runId` must correlate identically. `trustedOfflineDispatcher()` similarly enforces `probeItem`, `offlineDispatcherCallOptions`, `options.projectRef`, and `options.runId`.

### Source-Backed Typed Admission & Correlation Matrix (R10)

| Entry point | Field | Declared type | Actual validator | Binding check | Negative test |
|---|---|---|---|---|---|
| `runHostedProbeRunner` / `runOfflineProbeSimulation` | `probeTimeoutMs` | `number` (`1..60000`) | `admitValidatedInput(..., 'runnerOptions')` | `Number.isFinite` + range | Test 135 (`valueOf`, `NaN`, `Infinity`, `0`, `-5`, `60001`) |
| `runHostedProbeRunner` / `createHostedDispatcher` | `projectRef` | `string` | `admitValidatedInput()` | `typeof === 'string'` + `HARDCODED_TEMP_REF` | Test 135 (`{ trim() }`), Test 136 |
| `hostedDispatcher` | `rawItem` / `id` | `probeItem` (`id` required `string`) | `admitValidatedInput(..., 'probeItem')` | Required `id`, rejects unknown keys | Test 135 (`{}`), Test 137 |
| `hostedDispatcher` | `inventory`, `runContext`, `runId`, `projectRef`, `signal` | `dispatcherCallOptions` | `admitValidatedInput()` + `effInv`/`effCtx` revalidation | Single `factoryBoundRunId` + non-cleared/non-finalized + `normRef` | Tests 135, 136 |
| `trustedOfflineDispatcher` | `rawItem`, `rawOptions` | `probeItem`, `offlineDispatcherCallOptions` | `admitValidatedInput()` + `assertTrustedOfflineDispatcher` | `normRef` + `boundRunId` | Test 135 |
| `createRunContext` / `TestRunInventory` / `createHostedAdminClient` | Options records | Schema-specific | `admitValidatedInput()` | Rejects unknown keys + bad types | Test 135 |
| `executeCleanup` / `provisionStorageProbeFixture` / `verifyStorageObjectAbsenceDetailed` | `settlementTimeoutMs`, `ownershipTimeoutMs`, `failClosed`, `projectRef`, `runId` | Schema-specific | `admitValidatedInput()` | Range `0..60000` / `1..60000`, `boolean`, `string` | Tests 135, 137 |
| `validateSelectedProbeIds` / `planProbeExecution` | Options + `selectedProbeIds` | `validateSelectedProbeIdsOptions`, `planProbeExecutionOptions` | `admitValidatedInput()` + `snapshotStringArray()` | Rejects unknown keys, iterators/Proxies | Tests 133, 135 |

### R10 Verification Matrix

| Check Executed | Result / Exit Code |
|---|---|
| `node --test experiments/task06i/hosted-probe-runner.test.mjs` | **141/141 PASS**, exit 0 (includes Tests 135–137) |
| Docker `node:24-bookworm --network none --pull never` runner suite | **141/141 PASS**, exit 0 |
| `node --test experiments/task06i/*.test.mjs` | **209/209 PASS**, exit 0 |
| `node experiments/task06i/sql-contract-parity.mjs` | **POSTGRES_VERIFIED** on PostgreSQL 17.11, exit 0 |
| `node --test experiments/task06h/*.test.mjs` | **115/115 PASS**, exit 0 |
| `npm run verify` | Tokens guard, `tsc --noEmit`, `eslint --max-warnings=0`, **22/22 shell tests PASS**, exit 0 |
| `git diff --check` & `git diff --check origin/main...HEAD` | **CLEAN**, exit 0 |

### Final R10 Decisions

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

---

## 15. Revision R11 — Prototype-Safe Admission & Intrinsic Special-Object Security Closure

**Bootstrap baseline:** Local/remote HEAD `ca6dfe07d4295c160441c7256168aa600ac134ea`, `main` `4569479e8fe2caa6659fe1cc6c7a484596a01bbc`, clean worktree, 46 review threads (44 resolved, 2 unresolved P1: `PRRT_kwDOVtCmZc673fHh`, `PRRT_kwDOVtCmZc673jKU`), 6 successful checks (Cursor Security Reviewer PASS, Cursor Bugbot NEUTRAL), and independent `im-tio` review `CHANGES_REQUESTED` (`2026-11-25T11:26:23Z`).

### R11 Security Contracts

1. **Prototype-Safe Admission & Schema Metadata Integrity (`PRRT_kwDOVtCmZc673fHh` P1):**
   - `admitValidatedInput()` constructs `admitted = Object.create(null)` and defines fields via `setNullProtoField()` (`Object.defineProperty`), preventing omitted optional fields (`probeTimeoutMs`, `settlementTimeoutMs`, `inventory`, `runContext`, `adminClient`, `timing`, etc.) from resolving through `Object.prototype`.
   - `deepFreezeNullProto()` builds `INTERNAL_ADMISSION_SCHEMAS` and `UNIFIED_ADMISSION_SCHEMAS` with `null` prototypes at registry, schema, and field-spec levels; `ownSchemaMeta()` reads optional flags (`required`, `nullable`, `integer`, `min`, `max`, `allowEmpty`, `trimNonEmpty`, `deferRunnerRejection`, `errorCode`) strictly via `Object.hasOwn`.
   - Prototype-sensitive `'__proto__'` own keys are rejected in `extractValidatedPlainOptions()` and `clonePlainData()`.
2. **Trusted Cancellation (`AbortSignal`) Contract (`PRRT_kwDOVtCmZc673jKU` P1):**
   - `validateTrustedAbortSignal()` rejects Proxies, forged prototypes, subclasses, own `aborted`/`reason`/`addEventListener`/`removeEventListener` accessors or overrides, and `Symbol.toStringTag` overrides, and verifies the internal `[[AbortSignal]]` slot using captured `INTRINSIC_ABORT_SIGNAL_ABORTED_GET`.
   - All consumers (`createOfflineBarrier`, `createDeterministicFixtureTransport`, `createTrustedOfflineDispatcher`, `createHostedAdminClient` ownership lookup) use captured intrinsics (`INTRINSIC_ABORT_SIGNAL_ABORTED_GET`, `INTRINSIC_ABORT_SIGNAL_ADD_EVENT_LISTENER`, `INTRINSIC_ABORT_SIGNAL_REMOVE_EVENT_LISTENER`), ignoring caller overrides even if mutated after registration.
3. **Binary Payload Integrity Contract (`PRRT_kwDOVtCmZc673jKU` P1):**
   - `snapshotTrustedBinaryInput()` accepts only genuine non-Proxy, non-subclassed `Uint8Array`, `Buffer`, or `DataView` instances with `ArrayBuffer.prototype` backing, rejects own accessors/method overrides/`Symbol` properties, extracts `buffer`/`byteOffset`/`byteLength` via captured intrinsics, and copies exact bytes via `INTRINSIC_UINT8_ARRAY_SLICE` into an independent module-owned `Buffer`.
   - `cloneBinaryViewToIndependentBuffer()` and `toIndependentBytesBuffer()` use `snapshotTrustedBinaryInput()` (no `String(binaryInput)` coercion). `provisionStorageProbeFixture()` uses the single admitted/snapshotted `expectedBuf` for upload body, expected length, SHA-256 digest, and download verification.

### Source-Backed Special-Object & Executable Dependency Audit (R11)

| Input / Consumer | Validation & Snapshot | Intrinsic / Isolated Execution | Regression Test |
|---|---|---|---|
| Admitted option records (`admitValidatedInput`) | `Object.create(null)` + `extractValidatedPlainOptions` + `__proto__` rejection | Own-property destructuring only | Test 138 |
| Schema metadata (`INTERNAL_ADMISSION_SCHEMAS`) | `deepFreezeNullProto` + `ownSchemaMeta()` (`Object.hasOwn`) | Immutable null-prototype descriptors | Tests 135, 138 |
| `AbortSignal` (`barrier`, `transport`, `offlineDispatcher`, `hostedDispatcher`, `adminClient`) | `validateTrustedAbortSignal()` | `INTRINSIC_ABORT_SIGNAL_*` `.call()` | Test 139 |
| Binary payloads (`string_or_binary`, `provisionStorageProbeFixture`, `clonePlainData`) | `snapshotTrustedBinaryInput()` | `INTRINSIC_TYPED_ARRAY_*` / `INTRINSIC_DATA_VIEW_*` + `INTRINSIC_UINT8_ARRAY_SLICE` | Tests 111, 140 |

*Threat model note:* Application-level admission validation defends against untrusted caller inputs, prototype pollution on `Object.prototype`, coercive objects, and special-object instance overrides across documented APIs; it is not a general-purpose JavaScript VM sandbox, and offline tests remain additionally isolated via Docker `--network none`.

### R11 Verification Matrix

| Check Executed | Result / Exit Code |
|---|---|
| `node --test experiments/task06i/hosted-probe-runner.test.mjs` | **144/144 PASS**, exit 0 (includes Tests 138–140) |
| Docker `node:24-bookworm --network none --pull never` runner suite | **144/144 PASS**, exit 0 |
| `node --test experiments/task06i/*.test.mjs` | **212/212 PASS**, exit 0 |
| `node experiments/task06i/sql-contract-parity.mjs` | **POSTGRES_VERIFIED** on PostgreSQL 17.11, exit 0 |
| `node --test experiments/task06h/*.test.mjs` | **115/115 PASS**, exit 0 |
| `npm run verify` | Tokens guard, `tsc --noEmit`, `eslint --max-warnings=0`, **22/22 shell tests PASS**, exit 0 |
| `git diff --check` & `git diff --check origin/main...HEAD` | **CLEAN**, exit 0 |

### Final R11 Decisions

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

---

## 16. Revision R12 — Direct Transport Admission & Exception-Safe Cancellation Lifecycle

**Bootstrap baseline:** Local/remote HEAD `c5c701defa454a1ef6dbbc9ea8c01502a3c1b245`, `main` `4569479e8fe2caa6659fe1cc6c7a484596a01bbc`, clean worktree, 48 review threads (46 resolved, 2 unresolved: `PRRT_kwDOVtCmZc674CAf` P1, `PRRT_kwDOVtCmZc674CAt` P2), 6 successful checks (Cursor Security Reviewer PASS, Cursor Bugbot NEUTRAL), and independent `im-tio` review `CHANGES_REQUESTED` (`2026-11-25T11:47:45Z`).

### R12 Security Contracts

1. **Direct Transport Request Admission Contract (`PRRT_kwDOVtCmZc674CAf` P1):**
   - `deterministicFixtureTransport(rawUrl, rawOpts)` validates `rawUrl` (primitive string or non-Proxy genuine `URL` via `INTRINSIC_URL_HREF_GET`) and admits `rawOpts` via `admitValidatedInput(rawOpts, 'transportRequestOptions')` (`method`, `headers` via `headers_record`, `body` via `string_or_binary`, `signal` via `abort_signal`) BEFORE reading signal state, recording `calls`, consuming routes, mutating `state`, releasing/arriving at barriers, or arming timers.
2. **Exception-Safe Cancellation Lifecycle Contract (`PRRT_kwDOVtCmZc674CAt` P2):**
   - Unified `waitWithTrustedSignal(delayMs, signal, { onAbort, ignoreAbort })` validates `delayMs` (finite `>= 0`) and `signal` (`validateTrustedAbortSignal`), resolves already-aborted state before arming timers, and wraps listener registration + `setTimeout` inside `try/catch` with idempotent `settled` / `abortHandled` guards and guaranteed `cleanup()` on abort, completion, and setup error.
   - `getStorageObjectOwnership(bucket, path, rawOptions)` validates `bucket`/`path` primitives + `admitValidatedInput(rawOptions, 'getStorageObjectOwnershipOptions')` (`projectRef`, `expectedObjectId`, integer `timeoutMs` `1..60000`, `signal`) and resolves `isTrustedSignalAborted(signal)` BEFORE creating `AbortController` or arming `setTimeout`, releasing both inside `finally`.

### Corrected Source-Backed Signal & Timer Consumer Matrix (R12)

| Entry point | Validation before setup | Timer ownership | Listener ownership | Guaranteed cleanup | Regression test |
|---|---|---|---|---|---|
| `deterministicFixtureTransport` (`hosted-probe-runner.mjs`) | `rawUrl` + `admitValidatedInput(..., 'transportRequestOptions')` + `isTrustedSignalAborted` | `waitWithTrustedSignal()` | `addTrustedSignalAbortListener` / `removeTrustedSignalAbortListener` | `cleanup()` on abort/complete/setup-error | Tests 141, 142 |
| `trustedOfflineDispatcher` (`hosted-probe-runner.mjs`) | `admitValidatedInput(..., 'offlineDispatcherCallOptions')` + `validateTrustedAbortSignal` | `waitWithTrustedSignal()` | `addTrustedSignalAbortListener` / `removeTrustedSignalAbortListener` | `cleanup()` + single-shot `abortHandled` (`onAbortInventoryEffects`) | Tests 139, 142 |
| `createHostedAdminClient.getStorageObjectOwnership` (`hosted-probe-runner.mjs`) | `bucket`/`path` + `admitValidatedInput(..., 'getStorageObjectOwnershipOptions')` + `isTrustedSignalAborted` | `try { timer = setTimeout(...) } finally { clearTimeout }` | `listenerAttached` flag in `try/finally` | `finally` clears timer & detaches listener | Test 142 |
| `createOfflineBarrier` (`wait` / `waitForArrivals`) | `isTrustedSignalAborted` + `addTrustedSignalAbortListener` | None (barrier-only) | `detachAbort()` via `removeTrustedSignalAbortListener` | Detached on resolve/reject/abort/release | Tests 110, 139 |
| `provisionStorageProbeFixture` ownership deadline (`hosted-probe-runner.mjs`) | `admitValidatedInput` + `ownershipTimeoutMs` (`1..60000`) | `try/finally { clearTimeout(timer) }` | Internal `AbortController` passed to `effectiveOwnershipLookup` | `finally` clears deadline timer | Tests 97, 108 |
| `_runHostedProbeRunnerInternal` probe loop (`hosted-probe-runner.mjs`) | `admitValidatedInput(..., 'runnerOptions')` + `probeTimeoutMs` (`1..60000`) | `try/finally { clearTimeout(timeoutTimer) }` | Internal `AbortController` passed to dispatcher | `finally` clears probe timer | Tests 24, 30, 135 |

### R12 Verification Matrix

| Check Executed | Result / Exit Code |
|---|---|
| `node --test experiments/task06i/hosted-probe-runner.test.mjs` | **146/146 PASS**, exit 0 (includes Tests 141–142) |
| Docker `node:24-bookworm --network none --pull never` runner suite | **146/146 PASS**, exit 0 |
| `node --test experiments/task06i/*.test.mjs` | **214/214 PASS**, exit 0 |
| `node experiments/task06i/sql-contract-parity.mjs` | **POSTGRES_VERIFIED** on PostgreSQL 17.11, exit 0 |
| `node --test experiments/task06h/*.test.mjs` | **115/115 PASS**, exit 0 |
| `npm run verify` | Tokens guard, `tsc --noEmit`, `eslint --max-warnings=0`, **22/22 shell tests PASS**, exit 0 |
| `git diff --check` & `git diff --check origin/main...HEAD` | **CLEAN**, exit 0 |

### Final R12 Decisions

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


## 17. Revision R13 — Architecture Boundary Review & Bounded Remediation

**Pre-edit checkpoint (2026-11-25):** Local/remote HEAD `49b187e90ca8f8ab49b5ca08f30051573c67aad2`, clean worktree, main `4569479e8fe2caa6659fe1cc6c7a484596a01bbc`; PR #44 OPEN, 50 threads / 48 resolved / 2 unresolved. Six SUCCESS checks; Bugbot NEUTRAL. Independent `im-tio` review at `2026-11-25T12:20:39Z` is CHANGES_REQUESTED (R13-01 P1, R13-02 P3).

Implementation owner: Codex root, bounded R13. Previous owner: Antigravity R12 at the verified baseline above. Separate `r13_review` agent performs read-only architecture/diff assessment; no competing file writes. Owner authorized local remediation, offline checks, commit/push and review workflow on existing PR #44 only. No worker migration, H4, hosted operation or merge.

### Architecture decision before editing

- **Layer A — application admission:** typed inert data, descriptor-first snapshots, null-prototype option/schema records and private immutable project/run-bound capabilities are input guarantees. Snapshotting public inputs does not protect a downstream helper that reads inherited defaults.
- **Layer B — internal execution:** module-owned operations need explicit arguments, own-only configuration, synchronous module-owned abort effects, and settlement/resource ownership protected on every exception path. No caller callback API will be added.
- **Layer C — process isolation:** full offline suite runs in an existing image with network none, no hosted credential environment, no Docker socket, read-only experiments mount and no unnecessary capabilities. JavaScript validation is not a full sandbox.
- **Recommendation:** a later separately approved small offline worker should accept a versioned declarative request, project/run IDs, fixture bytes/descriptors and cancellation messages; return inert outcomes/inventory evidence. Keep provider authority and hosted credentials out of that worker. Prefer a separate OS process/container with denied network; worker_threads alone is not an OS security boundary. This would reduce in-process global/prototype surface, but requires contract/compatibility and resource-lifecycle work. R13 retains the existing architecture and fixes the reachable bounded gaps.

### Pre-edit source-backed audit matrix

Locations below refer to the inspected R12 HEAD; final function names remain navigable in source.

| Consumer / location | Reachable path and protection/gap | Minimal R13 action / regression |
|---|---|---|
| `waitWithTrustedSignal` L207, L215/L242 | Direct transport L1415 omits options; normal default reads inherited onAbort/ignoreAbort; effect can throw before cleanup | Explicit positional module-owned effect/boolean; exception-safe settlement; direct delayed transport prototypes/races plus failing internal effects |
| `transportRequestOptions` L963 → transport L1354 → `matchesRoute` L1300 | Nullable header admission retains null; matcher indexes null | Normalize missing/null to empty null-prototype map; own-only header matching/fallback tests |
| `admitValidatedInput` L990; `extractValidatedPlainOptions` L718 | Normal default destructures allowNullUndefined; omitted internal options execute inherited getter | Positional validated boolean; prototype sentinel tests |
| `snapshotStringArray` L756 | All three call sites L1083/L2062/L2745 supply own allowEmpty/trimNonEmpty/errorCode | Preserve existing string-array validation; replace destructured internal config with explicit args to keep future omission safe |
| Compiled route controls L1260 / matcher L1298 | Plain clone/spread reintroduces inherited headersMatch/fixture controls | Own-only null-prototype execution configs, preserving response payload prototypes; control getter sentinels |
| Offline descriptor / abort effects L1687–1720 | Descriptor controls require own-only consumption; delay abort-effect exception must preserve inventory and reject | Own-only execution descriptors/effect records and module-owned effects; failure/race/ignore-abort tests |
| `createOfflineBarrier` wait/waitForArrivals L317/L349 | Positional signal; trusted intrinsic listeners; terminal release accounting already covered | Preserve Tests110/139 and inspect teardown; no broad barrier rewrite |
| Ownership RPC timeout L10532–10602; provisioning / runner deadlines | Typed bounds before setup, try/finally timer/listener ownership | Preserve R1–R12 regression coverage; no hosted calls |
| Error/report construction | Existing sanitization/residual contracts; delay error formats String(delayMs), invoking invalid input coercion | Static validation/abort-effect error codes, no unsafe formatting of invalid values |

Verification and final source locations/results will be recorded after implementation. Synthetic metadata evidence remains distinct from full Storage integration; hosted verification stays0/18.


### R13 final contracts and audit disposition

1. **Prototype-safe cancellation:** private `waitWithTrustedSignal(delayMs, signal, onAbort = null, ignoreAbort = false)` uses positional defaults. Finite timer-range delay and primitive boolean validation have static errors, with no coercion of invalid inputs. All three actual callers are module-owned: transport delay (no effect/ignore flag), delayed offline outcome (synchronous module-owned inventory effect + explicit primitive flag), and never-settling outcome's post-abort rejection delay (no effect). No caller callback entry point was added. Signal validation/intrinsic reads remain mandatory.
2. **Exception-safe effects:** one-shot abort handling detaches its listener, executes the module-owned effect, and rejects `INTERNAL_ABORT_EFFECT_FAILED` with `inventoryEffectsMayBePartial: true` if the effect fails. Timer/listener cleanup precedes settlement. Cleanup failures have a separate structured error. Successful explicit ignore-abort detaches the listener, applies the effect once, and keeps only the owned completion timer. Already-aborted signals do not arm an unnecessary timer for rejecting paths. Partial inventory changes and unresolved operations are preserved, never replaced by success. The adjacent intentionally never-settling fixture branch uses the same error contract; its deliberately pending simulation semantics remain intact.
3. **Header normalization:** admitted missing or explicit-null headers become an empty null-prototype map. Existing record/intrinsic Headers lowercase normalization remains. Missing required header is a normal non-match; without fallback the existing `DETERMINISTIC_TRANSPORT_UNMATCHED_ROUTE` error remains, and a declarative fallback is returned when configured. No fabricated provider status is added.
4. **Adjacent confirmed internal gaps:** admission helper `allowNullUndefined` and string-array flags now use explicit primitive arguments. Compiled routes, selected responses, offline descriptors, nested requests/error/effect configs use own-only snapshots. Module-owned event-listener option records are null-prototype. Request body subsets and whenState use `Object.hasOwn`, so inherited properties cannot execute getters or satisfy routes. Declarative state updates define own data properties rather than invoking inherited setters. Provider response/body payload prototypes are preserved; no global plain-data representation refactor occurred.

| Final source (hosted-probe-runner.mjs) | Disposition / targeted evidence |
|---|---|
| `internalAbortEffectFailure` L207, `waitWithTrustedSignal` L215 | Positional/default/boolean/range + structured effect rejection; Tests143–145 |
| Delay call sites L1433, L1730, L1752 | Transport / post-abort timer / module-owned offline effect only; Tests143–145 |
| `extractValidatedPlainOptions` L736, `snapshotStringArray` L775, `admitValidatedInput` L1009 | No destructured inherited internal configuration; Test143 plus prior typed-admission tests |
| `compiledRoutes` L1276, transport headers L1371, offline descriptor L1672 | Own-only controls, null headers normalized; Tests143/146 |
| `deepSubsetMatches` L644 / `matchesRoute` state controls | Own request body/state properties only; define own state data on updates; Test147 |
| Offline `neverSettle` branch L1708 | Effect exception rejects after listener cleanup, no post-failure timer; Test145 |
| `createOfflineBarrier` L295 / trusted signal helpers L148–205 | Existing terminal release/listener guarantees retained; Tests110/139/142 |
| Ownership helper L10553, provisioning/runner deadlines | Prior typed bounds and resource finalizers unchanged; existing regression suite |

### R13 verification evidence

All listed successful commands exited0 on the final relevant source/environment; no tests skipped or cancelled.

| Command/check actually executed | Result |
|---|---|
| `node --test experiments/task06i/hosted-probe-runner.test.mjs` | 151/151 PASS, including all146 previous regressions |
| `node --test experiments/task06i/*.test.mjs` | 219/219 PASS |
| `node --test --test-name-pattern='H3-R13' experiments/task06i/hosted-probe-runner.test.mjs` | 5/5 PASS (Tests143–147) |
| Complete runner using existing node:24-bookworm, network none, pull never | 151/151 PASS; cap-drop ALL, no-new-privileges, read-only experiments-only mount; no credential environment, Docker socket or additional host capabilities supplied |
| `node experiments/task06i/sql-contract-parity.mjs` | POSTGRES_VERIFIED,18/18, PostgreSQL17.11, local Docker context desktop-linux |
| `node --test experiments/task06h/*.test.mjs` | 115/115 PASS |
| `npm run verify` | token checks, TypeScript, ESLint, shell22/22 PASS |
| `node --check experiments/task06i/hosted-probe-runner.mjs` | PASS |
| `git diff --check`; `git diff --check origin/main...HEAD` | PASS |
| Changed Markdown links/fences and added-line credential/machine-tooling-path scan | PASS |

Prototype mutation tests run in an explicitly non-concurrent test scope. Saved Object.prototype descriptors and instrumented timers/global sentinels are restored in guaranteed finally blocks. Direct deterministic transport covers inherited callback/getter/ignore options, both inherited fields, pre-aborted and in-delay cancellation. Additional coverage includes overlapping operations, completion races, normal completion, explicit legitimate ignore-abort, failing module-owned effects in both delay and neverSettle paths, invalid timing/flags, header records/intrinsic Headers/fallbacks, and inherited route body/state matching plus state setter avoidance. Assertions show zero sentinel callback/getter/native network executions, zero remaining timers/listeners, no duplicate effects and no unhandled rejections. Failing effects preserve one earlier inventory effect and unresolved operation evidence.

**Environment disclosures:** pinned Docker binary/context and existing Node image were used; no Supabase CLI hosted command was necessary. PostgreSQL parity is a local hook-contract check. Prior synthetic ownership metadata evidence is historical and is not full Storage integration; that integration was not run in R13. The previously available Supabase skill path and GitHub connector were unavailable; authenticated GitHub CLI handled authorized review operations. No secret stores/configuration were inspected. The nonfatal Node MODULE_TYPELESS_PACKAGE_JSON warning during shell tests is unchanged.

**Last implementation commit agent / verified SHA:** Codex root / `bf2853c1ec1105d5af55e0f9aedc239a393caacd`.

**Review / publication:** separate `r13_review` local read-only assessment of R12 baseline49b187e against the R13 source/tests/architecture diff returned PASS. Reviewer ran targeted5/5, syntax and diff checks; did not rerun full host/Docker/PostgreSQL suites. All confirmed local findings were corrected. This is not GitHub APPROVED. The documentation follow-up references the exact implementation SHA above; source/tests remain unchanged. Final remote HEAD, individual R13 replies/resolution and CI/re-review evidence are published on PR#44, whose live status remains authoritative. Re-review on GitHub must use the final published HEAD; the baseline im-tio CHANGES_REQUESTED review is retained. No owner merge authorization exists.

**Final gates:** H3 Subset Runner and H3 Storage Lifecycle IMPLEMENTED_OFFLINE_TESTED / BLOCKED; Durable Recovery NOT IMPLEMENTED; Run-Created Seed Support NOT IMPLEMENTED; Hosted Verification0/18; Hosted LIVE NOT AUTHORIZED; Production Real Auth STRICT NO-GO; Hosted Mutations0; Cost$0; Merge NOT AUTHORIZED. Remaining prerequisites include durable recovery, separately approved seed support and provider/testbed preparation/authorization.


## 18. Revision R14 — Typed Effects, Atomic Offline Cleanup & Request Accounting

Bootstrap verified local/remote HEAD250aac82480d99494c6647a800ef7580e439f8a3 and main4569479e8fe2caa6659fe1cc6c7a484596a01bbc, clean worktree. PR44 has53 inline threads,50 resolved and3 unresolved; review-body request-budget finding is a fourth independent obligation. Independent im-tio review at2026-11-25T12:56:36Z is CHANGES_REQUESTED. Latest named check summary reports7 SUCCESS contexts (the review reported8 runs); no check count is inferred to close findings.

Implementation owner: Codex root R14. Explicit bounded handoffs: r14_effects owns new typed-effect module/tests and direct inventory/effect admission sections; r14_conditional owns atomic fixture module/tests, cleanup/Admin capability and inner provider transition integration plus existing test migration; r14_budget owns new budget module/tests and outer request-boundary/runner accounting integration. Root owns fixture timing admission, documentation and final review/validation. No competing ownership or external writes delegated.

Architecture retains R13 LayersA/B/C: recursively admitted inert batches, trusted internal operations with atomic provider-state transition, and OS network isolation remain distinct. A private registry/historical receipt is not current object ownership proof. No worker migration or H4 recovery is included.

### Provider capability boundary

Actual hosted atomic conditional deletion remains UNVERIFIED. The [Supabase delete guide](https://supabase.com/docs/guides/storage/management/delete-objects) documents API deletion and warns metadata SQL deletion does not remove object bytes. The [S3 compatibility matrix](https://supabase.com/docs/guides/storage/s3/compatibility) lists DeleteObject but does not establish this task's atomic comparison of immutable provider object ID plus owner/run receipt; the [remove reference](https://supabase.com/docs/reference/javascript/file-buckets-remove) describes paths/version IDs, which alone are not evidence of the required multi-field atomic authorization. No provider experiment/deployment was performed. Therefore actual capability cannot be asserted; unavailable capability must preserve residuals and block related user deletion. No SQL metadata-delete substitute is authorized.

### Cleanup request allowance decision

Retain the existing hard limit of25 total request attempts across probe, provisioning, auxiliary and cleanup work. Cleanup receives no silent exemption or extra quota. A reserved split could reduce probe capacity and needs an explicit policy decision; a separate recovery allowance could exceed25 and requires new owner authorization. R14 chooses no extra quota (reserved cleanup allowance0), with fail-closed recovery-required residuals if mandatory cleanup has no capacity. Simulated recorded-zero-wait pacing must be reported explicitly; it is not proof of elapsed1000ms/provider compliance. Registry reuse must not reset a run's allowance.

### Timing admission

All consumed delayMs/rejectAfterAbortMs controls on routes, defaults/fallbacks, dispatcher outcomes/sequences/defaults are validated at factory admission, before registration, route consumption, request evidence, state/barrier effects or timers. Primitive finite0..2147483647 milliseconds only; ignoreAbort is primitive boolean. No invalid-value string coercion. Fixture-timing-admission tests independently passed2/2; final integrated verification is recorded below.

Current R14 status: offline implementation/verification PASS, GitHub exact-HEAD re-review pending; no merge approval. All protected projects untouched; hosted0/18, mutations0, cost$0; LIVE and merge NOT AUTHORIZED; Production Real Auth STRICT NO-GO.


### R14 implemented contracts and source-backed audit

| Boundary | Owning source / enforced contract | Evidence currently executed |
|---|---|---|
| Recursive effects | inventory-effect-admission.mjs: complete typed batch, recursive descriptor-only null-prototype snapshots, supported-effect field/evidence schemas, no executable/Proxy/accessor input. Direct inventory methods snapshot before destructuring. |9/9 module/integration tests PASS; invalid later effect causes zero earlier mutation; genuine runtime identity failure preserves earlier effect/unresolved operation. |
| Atomic offline deletion | conditional-storage-fixture.mjs + runner private one-use authorization: project/run/bucket/path/object ID/owner + authentic creation receipt, then synchronous compare/delete in the same controlled provider Map. | 12/12 conditional integration tests PASS. No lookup+unconditional-delete authorization. |
| Independent absence | Bound provider state is re-read after response awaits; a static absent response cannot hide a current replacement or unknown committed identity. | Independent reviewer deterministic check: replacement present200, unknown identity503; no network. |
| Residual evidence | Fixture/report retains expected/current identity, conditional result class and recoverable obligation. Capability unavailable/indeterminate, mismatch and budget exhaustion block related Auth deletion. | Existing cleanup obligation mechanisms preserved; final runner151/151 and Task06I249/249 PASS. |
| Fixture timing | Factory validates routes/default/fallback/outcome/sequence delayMs and rejectAfterAbortMs, booleanignoreAbort before registration/route/state/barrier/timer effects. |2/2 targeted tests PASS. |
| Request boundary | run-request-budget.mjs private shared registry by exact TEMP project/run; synchronous reservation before any await; fixed25 across all adapters/transports and all request categories. |7/7 tests PASS, including30 concurrent contenders, exactcap, failed/cancelled requests and shared transports. |
| Pacing | Serial actual dispatch starts at minimum1000ms; explicit recorded_zero_wait records simulated intervals. No executable scheduler injection. | Real pacing test>=1000ms PASS; simulated mode explicitly reported. |
| Provisioning/cleanup accounting | Actual request attempts separately reported from planned/attempted/completed probe counts; auxiliary and cleanup requests consume same allowance. Existing effective trusted per-call dispatcher bindings are retained. | Actual provisioning + capacity exhaustion test PASS:25 attempts total, cleanup0DELETE, residual remains. |

Report definitions: requestCount is simulated transport attempts; attemptedProbeCount is probe invocations. requestBudget reports probe/auxiliary/cleanup counts, blocked admissions, failed HTTP/transport attempts, pre-dispatch versus post-dispatch cancellation, pending reservations, remaining capacity, pacing mode/intervals and actualHostedRequests0. Standalone fixture routing without run/resource authority is a local declarative fixture operation, not a provider run. No new adapter can reset an existing run budget or change its pacing mode.

Existing test migrations explicitly declare recorded-zero-wait, use distinct run IDs for independent experiments, and provision synthetic atomic providers for positive cleanup. Negative binding/ownership/admission assertions remain direct and are not silently rebound. Tests concerning genuine abort-effect exceptions now use a valid batch that fails during an authorized inventory operation; syntactically invalid batches reject before any effect.

Independent read-only source assessment r14_review: PASS on current runner/newmodules. Reviewer executed effects/budget/timing18/18, whitespace check, and separate provider GET consistency check; final acceptance is recorded below. This is not GitHub approval or hosted provider evidence.


**Last R14 implementation commit agent / verified SHA:** Codex root / `b9b70bcad18776b33afcba3df9ef77fa510663cc`. Source/tests were verified before this commit; the documentation follow-up changes no runtime behavior.

### Final R14 offline acceptance

| Actual check | Result / exit code |
|---|---|
| node --test experiments/task06i/hosted-probe-runner.test.mjs |151/151 PASS /0 |
| node --test experiments/task06i/*.test.mjs |249/249 PASS /0 |
| Independent effect / atomic / timing / budget test-file executions |9/9,12/12,2/2,7/7 PASS /0 each |
| Existing node:24-bookworm --network none --pull never runner |151/151 PASS /0; read-only experiments mount, cap-drop ALL, no-new-privileges, no supplied hosted credentials/socket |
| node experiments/task06i/sql-contract-parity.mjs |POSTGRES_VERIFIED18/18 PostgreSQL17.11 /0 |
| node --test experiments/task06h/*.test.mjs |115/115 PASS /0 |
| npm run verify |tokens/typecheck/lint +22/22 shell tests PASS /0 |
| git diff --check; git diff --check origin/main...HEAD |PASS /0 |

The final independent r14_review assessment returned PASS after reviewing the current source/modules/tests against baseline250aac8. Reviewer ran atomic12/12, effects/timing/budget18/18, syntax/diff checks and delayed-provider-state sentinels; full249/Docker were not independently repeated. No formal GitHub approval is claimed.

All13 mandatory atomic scenarios are covered in12 actual provision/cleanup tests using the same bound provider through upload and replacement. Unknown/missing/malformed/lost conditional evidence never authorizes an unconditional fallback. Original known-absent DELETE text/JSON response forms remain supported only when the authoritative provider state is known empty, followed by independent GET. Repeated blocked cleanup retains exact expected/current identity evidence. Replacement during DELETE delay cannot be hidden by stale GET404. Auth deletion is blocked when obligations remain.

All151 prior runner regressions pass after explicit fixture migration. Independent experiments use unique run IDs rather than resetting shared capacity. Legacy per-probe counter assertions now use attemptedProbeCount; actual transport attempts use requestCount. Valid runtime partial-effect failure remains tested; invalid later batches reject before their first mutation.

Environment limits: synthetic offline provider/metadata evidence is not full hosted Storage integration. Actual hosted atomic conditional deletion remains UNVERIFIED. No CLI hosted commands, hosted requests, SQL/RPC deployment, email, project lifecycle action, paid service, worker migration or H4 implementation occurred. Existing nonfatal Node module-type warning is unchanged. Supabase skill and official changelog/delete documentation were read during final review; no relevant provider atomic identity contract was established. Earlier partial test counts are historical progress checkpoints.

Final publication/review evidence belongs on PR44 after normal push. Next authorized action: inspect final-HEAD CI and requested independent reviews, addressing only bounded R14 findings. Three inline resolutions and the separate budget review-body response must each have demonstrated evidence; zero unresolved inline threads alone does not close the review-body finding. Do not dismiss existing blocking reviews or merge.

Final decisions: H3 Subset Runner IMPLEMENTED_OFFLINE_TESTED / BLOCKED; H3 Storage Lifecycle IMPLEMENTED_OFFLINE_TESTED / BLOCKED; Atomic Hosted Conditional Deletion UNVERIFIED; Durable Recovery NOT IMPLEMENTED; Run-Created Seed Support NOT IMPLEMENTED; Hosted Verification0/18; Hosted LIVE NOT AUTHORIZED; Production Real Auth STRICT NO-GO; Hosted Mutations0; Cost$0; Merge NOT AUTHORIZED. Additional cleanup allowance/reserved split remains a future explicit owner policy decision, not authorization to exceed25 or disable cleanup accounting.


## 19. Revision R15 — Fail-Closed Storage Upload Identity Admission

Implementation owner: Codex root R15; previous owner Codex root R14. Baseline local/remote c8a504c5142d1eca789b91f2950833b5e536aed3, main4569479e8fe2caa6659fe1cc6c7a484596a01bbc, clean worktree verified. PR44:54 threads/53 resolved/one Medium Bugbot finding PRRT_kwDOVtCmZc68CVVY. Named check summary6 SUCCESS + Bugbot NEUTRAL (eight raw runs include repeated attribution runner). Independent im-tio CHANGES_REQUESTED at250aac8 remains; R14 four-finding disposition, including review-body budget finding, requires independent acceptance.

Root cause: upload observer used ordinary decoded claims.sub, and allowed malformed IDs into provider.putObject after simulated HTTP success. Own subject absence could consult Object.prototype; invalid committed identity could be misreported as transport failure.

Contract: decodeOfflineJwtClaims accepts a three-segment nonempty base64url structure, canonical UTF-8 JSON record header/payload, own nonempty alg (none/unsupported critical or detached-payload structures rejected); claims copied to a null-prototype record. Signature bytes are not authenticated; decoding is not cryptographic verification. Subject is read through an own data descriptor and must be a primitive UUID. Object Id/id fields must be own primitive UUIDs; missing/invalid/conflicting aliases are indeterminate. Project URL, private provider project/run binding, bucket and exact run/probe.txt path must match before putObject. Unknown state is registered first and cleared only by complete identity admission. Expected invalid evidence returns a structured indeterminate observation; only expected JSON/UTF-8/URL decoding errors are classified, while unrelated implementation/provider errors propagate.

HTTP2xx remains2xx with its original body. Provisioning writes the committed residual obligation before rejecting invalid identity evidence and never issues its private verified-creation receipt for that upload. Existing no-provider missing-upload-ID compatibility may still correlate independent authoritative metadata; this does not grant conditional provider capability. R14 unknown-upload regression is strengthened: provisioning now rejects before receipt issuance, both deletes remain0, and repeated cleanup retains quarantine/residual evidence.

### Related-path audit

| Source / call path | Validation / evidence / failure behavior |
|---|---|
| conditional-storage-fixture.mjs decodeOfflineJwtClaims -> uploadIdentity -> observer | Own subject descriptor, primitive UUIDs, alias agreement, exact private binding; invalid evidence retains unknown and original HTTP response. No signature-verification claim. |
| Provider identity/boundIdentity -> putObject/conditionalDelete | Exact TEMP/run/bucket/path + UUID validation remains; synchronous identity compare/delete and current replacement preservation unchanged. |
| Runner JWT observations, provisioning claims, parseAndValidateJwt, credential binding | Parsed claim records snapshot to null prototype; null/arrays cannot supply inherited subject/session fields. Provisioning requires own matching subject before dispatch. |
| Runner upload response -> committed fixture -> private creation receipt | Own Id/id parser rejects invalid/conflicting explicit identity; offline indeterminate observation blocks before receipt; committed residual retained. |
| Admin authoritative metadata -> provisioning correlation | Own first array row, non-array record, recursive own-data metadata snapshot; own Auth identity response ID; exact bucket/name/project/object/owner correlation before private receipt. |
| Cleanup authorization/evidence | Private one-use receipt-bound current identity; unknown or mismatch remains residual; no unconditional fallback; Storage-before-user ordering and terminal idempotence unchanged. |

R14 shared25 cap, concurrent reservation, standard1000ms pacing, explicit simulated mode, cleanup included/reserve0 and recoveryRequired exhaustion remain unchanged. LayersA/B/C distinction and isolated-worker recommendation remain; no migration/H4 implementation.

Initial targeted verification: conditional36/36 and runner151/151 PASS/exit0. Complete final verification and exact implementation SHA recorded below after execution. Hosted projects untouched; actual hosted atomic conditional deletion UNVERIFIED; verification0/18, mutations0, cost$0; LIVE/merge NOT AUTHORIZED; Production Real Auth STRICT NO-GO.


**Last R15 implementation commit agent / verified SHA:** Codex root / `0319c5265bed27f31f972b2e5be1104d6709ef2b`. Documentation follow-up changes no runtime behavior.

### R15 final offline verification

| Check actually executed | Final result / exit |
|---|---|
| node --test experiments/task06i/conditional-storage-fixture.test.mjs |38/38 PASS /0 (12 retained R14 scenarios +26 R15 tests) |
| node --test experiments/task06i/hosted-probe-runner.test.mjs |151/151 PASS /0 |
| node --test experiments/task06i/*.test.mjs |275/275 PASS /0 |
| Existing node:24-bookworm hardened network-none runner + conditional/effects/timing/budget modules |207/207 PASS /0 =151+38+9+2+7; read-only experiments mount, pull never, cap-drop ALL, no-new-privileges; no supplied hosted credentials/socket |
| node experiments/task06i/sql-contract-parity.mjs |POSTGRES_VERIFIED18/18 PostgreSQL17.11 /0 |
| node --test experiments/task06h/*.test.mjs |115/115 PASS /0 |
| npm run verify |tokens/typecheck/lint +shell22/22 PASS /0 |
| Both requested git diff checks; source syntax |PASS /0 |

Source audit anchors: conditional-storage-fixture.mjs L174 decodeOfflineJwtClaims, L199 object alias admission, L209 uploadIdentity, L230 observer; runner L28 snapshotJwtRecord, L7141 provisioning subject gate, L7537 committed upload identity, L7673 own metadata snapshot, L10820 own first-row admission. Existing private receipt correlation/conditional-delete contract remains the final destructive authorization boundary.

Sentinels: inherited sub value/function/getter and valid own subject under pollution execute0 inherited code; malicious object-ID getter/function/Proxy traps0. Missing/null/numeric/object/array/empty/non-UUID subjects; malformed/null/non-record JWT; unsupported JOSE structure; invalid/missing/nonstring/conflicting object IDs; exact project/run/bucket/path mismatches preserve2xx and unknown provider state. Actual provisioning invalid-identity cases retain hasCommittedUpload=true, verifiedOwnerId=null, deletionEligible=false, repeated storage residual; Storage DELETE0/Auth DELETE0. Missing authoritative owner cannot resolve inherited owner_id or issue a verified creation receipt. Valid identities retain successful atomic cleanup and Storage-before-user ordering. Saved prototype descriptors are restored in finally; tests run in controlled non-concurrent scope. Genuine internal contract failure still throws, never becomes an affirmative observation.

All151 runner and retained R14 atomic replacement/capability/absence/idempotence assertions pass. R14 unknown-upload test now rejects earlier before any private receipt and verifies zero DELETE rather than allowing a later conditional attempt; this strengthens the required fail-closed contract. Request-budget policy source/tests were not changed. No skipped/cancelled tests. An initial Python console encoding error was corrected with UTF-8 output; no test failure was hidden. Existing nonfatal Node module-type warning is unchanged.

Self-review of full security-sensitive diff complete. External exact-HEAD review is requested after publication; self-review is not an independent approval. Prior im-tio CHANGES_REQUESTED and R14 budget review-body acceptance gate remain outstanding until independently recorded. Live PR44 holds final remote SHA, individual R15 reply/resolution, CI and re-review evidence. No review dismissal or merge.

Final gates: H3 Subset Runner IMPLEMENTED_OFFLINE_TESTED / BLOCKED; H3 Storage Lifecycle IMPLEMENTED_OFFLINE_TESTED / BLOCKED; Atomic Hosted Conditional Deletion UNVERIFIED; Durable Recovery NOT IMPLEMENTED; Run-Created Seed Support NOT IMPLEMENTED; Hosted Verification0/18; Hosted LIVE NOT AUTHORIZED; Production Real Auth STRICT NO-GO; Hosted Mutations0; Cost$0; Merge NOT AUTHORIZED. Synthetic provider tests/local SQL parity do not establish full hosted Storage integration.
