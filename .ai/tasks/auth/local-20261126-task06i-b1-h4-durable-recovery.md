# Task 06I-B1-H4 — Offline durable crash recovery

| Field | Value |
|---|---|
| Status | H4-R1 offline validated, exact-head review on PR #47 |
| Implementation owner | Codex root |
| Previous agent | None for H4 |
| Last commit agent | Codex root. Verified R1 baseline `79e53cdb3c1f3c7db867c9c4c3766cb60ab83511`. PR #47 records the published R1 HEAD and review disposition. |
| Tracking / approval | Owner task brief dated 2026-11-26, offline Task 06I-B1-H4. |
| Branch | `feat/task06i-b1-h4-durable-recovery` |
| Base / previous and aligned local HEAD / fetched remote main | `5809dddf456cea3b8dfec1164034cf63fc392eb1` |
| Platform scope | Windows and Linux, offline Node.js experiment only |
| Created | 2026-11-26 |

## Context and post-merge alignment

- [Root policy](../../../AGENTS.md), [current pointer](../../current.md), [task guide](../README.md), [Auth security](../../../docs/04-AUTH-AND-SECURITY.md), [test plan](../../../docs/08-TEST-PLAN.md), [threat model](../../../docs/14-THREAT-MODEL.md), [attribution guard](../../../docs/26-COMMIT-ATTRIBUTION-GUARD.md) and [H3 receipt](../../archive/2026/local-20261124-task06i-b1-h3-subset-runner-storage.md#217-pr-45-post-merge-receipt).
- GitHub confirms squash merges [#44](https://github.com/im-tnyx/Tio-Workspace/pull/44) at `dd90265d9cdd8d8bd228ae5e7cbf13f8d1fa2c7a`, [#45](https://github.com/im-tnyx/Tio-Workspace/pull/45) at `d966f535efba4811c6381377980400e9965e0379` and [#46](https://github.com/im-tnyx/Tio-Workspace/pull/46) at the base above. The PR #46 tree matched its reviewed head `a6b08b703f94d7fc6850030add07a2db58e77061`, formally approved by `im-tio`.
- GitHub showed seven PR #46 checks successful, including the strictly required App-owned [Commit attribution guard](https://github.com/im-tnyx/Tio-Workspace/actions/runs/45832738307) (App 5032971), and three successful post-merge checks. Rules require one approval and resolved threads.
- One clean worktree, zero staged or untracked files, `git merge --ff-only origin/main` already up to date and 0/0 divergence. No open GitHub PRs or overlapping H4 refs at bootstrap. PR #44–#46 branches were already absent from local and actual remote heads. No deletion performed.

## Scope and source audit

- `hosted-probe-runner.mjs` admits registered offline adapters and holds cleanup inventory, transient credentials and private receipts in process memory. Its final cleanup gate audits live inventory and retains credentials on residuals. It verifies Storage absence independently after identity-bound conditional deletion before allowing dependent Auth user deletion.
- `run-request-budget.mjs` serializes pacing and bounds attempts, but its counters and tickets disappear on restart. `conditional-storage-fixture.mjs` models a run-bound conditional provider in memory. Rehydration must never recreate the runner's private receipts or use decoded JWT claims as authentication.
- H4 covers durable offline accounting, candidate recovery, synthetic provider evidence and validation. H5 run-created seed support, hosted/TEMP operations, Brevo, deployment, production Auth and merge require separate scope. Hosted verification remains 0/18 and hosted atomic deletion remains unverified.

## Crash and trust model

- Runner-generated H4 IDs are bound to the exact TEMP ref. Open recovery by the original run ID and existing journal. Normal request admission is fenced after reopening. The journal commits reservation and dispatch separately before entering a simulated provider operation. Reservation consumes one of 25 shared attempts, with no refund or cleanup reserve. Standard pacing remains 1,000 ms across restart. Recorded zero wait is explicit simulation.
- Use Node's built-in SQLite with a strict single-state row, verified version, digest and bounded transition validation. SQLite rollback transactions and exclusive locking coordinate one owner across writes and processes. A dedicated private local directory outside the checkout is required. File-system trust includes stable local paths and owner-controlled ACLs. Reject path aliases, symlinks, hard links and unexpected SQLite sidecars. A digest detects accidental corruption. It does not authenticate data or prove fresh provider ownership. Journal rollback by a privileged local actor and power-loss behavior are outside the demonstrated guarantees.
- Recovery keeps reserved-only, dispatched/unknown, known Storage candidate, cleanup attempt and separately verified absence distinct. Recovery uses a fresh, independently supplied synthetic provider snapshot, never an inventory or proof reconstructed from the journal. Conditional deletion requires the same run, creation attempt, object and owner. Preserve a replacement or an indeterminate object. A separate provider observation must confirm absence before a terminal transition. Unresolved Storage fences dependent Auth deletion.
- The persistence schema admits only bounded enums, sequence/ordinal, timestamps, exact project/run binding and canonical synthetic UUIDs. It stores no credentials or raw requests/responses. Auth operations for which credentials or authoritative proofs cannot survive a restart remain explicitly blocked. Keep journals for unresolved runs. Rollback the source through a reviewed revert without deleting outstanding journals.
- Platform references: [SQLite exclusive locking](https://www.sqlite.org/pragma.html#pragma_locking_mode), [SQLite rollback and synchronization assumptions](https://www.sqlite.org/atomiccommit.html), [Node SQLite API](https://nodejs.org/api/sqlite.html).

## Acceptance and review

- Run the 22 H4 fault and regression scenarios from the owner brief, including actual process termination and reentry. Run retained 06I/06H, PostgreSQL parity, repository verification and hardened network-disabled Docker synthetic tests where supported.
- Record exact implementation HEAD and independent security review, dispositions, GitHub required checks and review request in the H4 PR. Merge requires separate owner authorization.
- Independent verifier `h4_security_review` reviewed `80f8507ab92bb744a55b753439ec0434004643bf`. Initial verdict was `CHANGES_REQUESTED`. Two P1 findings reproduced false cleanup success after a direct inventory registration and an indeterminate Storage snapshot round-trip. A P3 finding identified inflated dispatch counts after a reservation-only crash. The correction writes typed inventory obligations in the admitting methods, requires complete synthetic snapshots with the indeterminate bit, and reports consumed slots separately from dispatch markers. Regression coverage includes a second independent process crash and both Storage snapshot cases.
- The re-review at `640c7b18e89ef743be5f125ef0e7497840a14b43` confirmed those corrections and reproduced one adjacent P1 on direct `registerInFlightOperation()`. Direct operation imports now persist a typed unresolved marker. Module-owned preflight registrations carry private provenance and still rely on the subordinate write-ahead transport gate. A process-termination test demonstrates that an imported operation stays unresolved even with zero transport attempts.
- Independent exact-head assessment at `7c72ecfd47b668bd29076c8c4359b26dc31277ac` passed with **289/289** tests. The subsequent focused change binds empty exported snapshots to their originating run and adds its rejection case to H4-10. The PR records the final review disposition.
- Windows H4: **27/27**. Hardened Linux Docker Task 06I: **359/359**. Standalone local PostgreSQL contract parity: **18/18**. Task 06H regression: **115/115**. Repository verify: token checks, typecheck, lint and **22/22** shell tests. Attribution and guard fixtures: **142/142** and **14/14**. All listed commands exited 0. Linux synthetic tests ran with no Docker socket, and PostgreSQL execution was verified separately against the cached local image.

## Local operation

1. Allocate a private local directory on NTFS or a local Linux filesystem with SQLite-compatible locking. Pass its canonical absolute path to `createOfflineRecoveryJournal`. Use its returned `runId` in the existing run-bound inventory, transport, Admin and dispatcher factories. Select explicit `runOfflineProbeSimulation`; when using recorded zero wait, select it in the journal and corresponding fixtures/timing.
2. Keep the journal handle open through provisioning and cleanup. Read `handle.report()` for consumed attempts and outstanding obligations; close the handle when no request or reconciliation is in flight.
3. Restart with `reopenOfflineRecoveryJournal` and the original directory, project and run ID. For a Storage obligation, pass a registered provider rebuilt with the synthetic state exported by `snapshotRecoveryStorageFixture`. The snapshot carries the exact project/run binding plus `objects`, `indeterminate` and `creationOrdinal`. The binding is checked even for an empty snapshot. Supply this state independently from the journal. Run `recoverOfflineProbeRun`. Absence, a matching creation witness, a replacement and indeterminate state take distinct paths. Exhausted allowance retains the original obligation.
4. Keep unresolved records for operator review. Cold Auth reconciliation and unclassified effects have no supported provider proof path in this slice. Journal-backed runs retain them conservatively, including when the process-local H3 inventory alone reports clean. The existing process-local H3 entry points remain supported for legacy runs.

The local filesystem trust boundary assumes an owner-controlled directory and ACL, stable paths and working local file locks and flush semantics. SQLite handles incomplete transactions and journal replay after process crashes. This implementation does not attest ACLs on Windows, support network filesystems or defend against a privileged actor substituting an internally consistent prior copy. Verification covers process termination on Windows and a Linux Docker volume. It does not demonstrate power-loss behavior.

## R1 non-mutating admission rejection

The owner authorized correction of the [P1 admission thread](https://github.com/im-tnyx/Tio-Workspace/pull/47#discussion_r4710049809) on the existing H4 branch and PR. Bootstrap verified a clean and aligned local checkout at PR HEAD `79e53cdb3c1f3c7db867c9c4c3766cb60ab83511` against main `5809dddf456cea3b8dfec1164034cf63fc392eb1`.

- Five journal-backed regressions failed against the unchanged runner (exit 1). Rejected admission set `cleanupStarted` and `finalized` and changed `ACTIVE` or `FINALIZED` to `RESIDUAL_BLOCKED`, despite zero new provider calls or budget consumption.
- `hosted-probe-runner.mjs` now builds sanitized diagnostics from trusted inventory without entering cleanup. The report marks `failureStage: admission` and `cleanupExecuted: false`. Actual cleanup retains its existing lifecycle and resource diagnostics. The runner configures the shared pacing mode after the other admission checks, so a rejected legacy call cannot pin that mode for a later valid call.
- Tests compare inventory, transient context and credential obligations, journal report and SQLite files, budget, dispatcher and provider state. They cover repeated invalid entry, explicit LIVE, Storage and Auth obligations, recovery and terminal fences, legacy pacing retry and a valid retry using the same inventory. The Storage retry exercises admitted conditional deletion and independent absence verification.
- Verification (exit 0): focused R1 **6/6**, Windows H4 and process-crash **33/33**, legacy runner **182/182**, full Windows Task 06I with local PostgreSQL **365/365**, hardened network-disabled Linux Docker Task 06I **365/365**, standalone local PostgreSQL parity **18/18**, Task 06H **115/115**, and `npm run verify` with **22/22** shell tests. Linux synthetic tests had no Docker socket. Parity ran separately in a pinned local Docker context using a cached PostgreSQL image with networking disabled.
- Independent exact-head re-review, inline disposition and GitHub CI evidence are tracked in [PR #47](https://github.com/im-tnyx/Tio-Workspace/pull/47). H5 remains NOT IMPLEMENTED, hosted atomic deletion remains UNVERIFIED, hosted verification remains 0/18, Hosted LIVE remains NOT AUTHORIZED, and Production Real Auth remains STRICT NO-GO. Hosted mutations 0, additional infrastructure cost $0. Merge requires separate owner authorization.


## R2 evidence-bound durable obligation resolution

Implementation owner: Codex root; previous owner: existing local R2 implementation transferred by explicit owner instruction in this session. Bootstrap local/remote HEAD `ab071af4d34c912bb184e2e4d7c0f00040def7f1`, main `5809dddf456cea3b8dfec1164034cf63fc392eb1`. Four in-progress runtime/test files were preserved and completed. [P1 finding](https://github.com/im-tnyx/Tio-Workspace/pull/47#discussion_r4710445981) explains permanent non-Storage effects and volatile markers. An unchanged tracked-baseline runtime in a temporary directory with the new imported table-cleanup regression failed (1/1 FAIL, process exit 1), confirming false RECOVERY_REQUIRED after verified cleanup. Initial taken-over H4 tests were 46/48; the two normal Storage integration failures were corrected before final verification.

### Resolution contract

- Exact resource identifiers are hashed into typed journal obligations and matching admitted request records. Private process-local receipts bind the journal handle and exact successful attempts; serialized caller data cannot mint them. Resolution is emitted only following admitted cleanup and final inventory reconciliation. Table cleanup now independently queries absence after deletion. User deletion requires verified absence; misleading 503 user_not_found bodies cannot supply it. Session revocation retains existing reconciliation guarantees.
- Replay accepts a closed resolution event, checks corresponding keys, successful dispatched attempts, ordering, duplicates and terminal/recovery fences. Historical attempts and outcomes remain; request slots are never refunded. Version 1 legacy category-only markers remain conservatively unresolved. New optional resource-key fields/events are accepted by this reader; older readers reject unknown resolution transitions rather than claiming clean. Event ceiling is bounded at 256; request ceiling remains 25, pacing 1000 ms, reserve 0.
- Only pending exact keyed obligations receive a resolution receipt. Normal Storage uses upload/absence proof and needs no keyed event. A supported keyed Storage obligation can resolve only after private conditional deletion plus independent absence; it persists before dependent Auth deletion. Unsupported path-only/unknown Storage markers remain blocked. Unrelated effects of the same category and indeterminate dispatches remain unresolved.
- SQLite commits resolution before terminal completion and credential disposal. Injected persistence failure retains recovery-required status; subprocess termination immediately before versus after committed resolution replays conservatively versus clean. Cold Auth recovery still blocks missing transient credentials and unknown effects; journal contents grant no destructive capability.

### Current verification (all final commands exit 0)

| Command / environment | Actual result |
|---|---|
| node --test --test-name-pattern H4-R2 experiments/task06i/offline-probe-recovery.test.mjs | 15/15 PASS |
| node --test experiments/task06i/offline-probe-recovery.test.mjs; Windows Node24.17.0 | 48/48 PASS, actual subprocess crash/restart cases |
| node --test experiments/task06i/hosted-probe-runner.test.mjs | 182/182 PASS, retained PR45/JWT cases |
| node --test experiments/task06i/*.test.mjs | 380/380 PASS |
| Full Task06I in cached node:24-bookworm; network none, pull never, cap-drop ALL, no-new-privileges, read-only experiments mount, no credentials/socket | 380/380 PASS, Linux subprocess crash/restart |
| node experiments/task06i/sql-contract-parity.mjs | POSTGRES_VERIFIED 18/18, local PostgreSQL17.11 |
| node --test experiments/task06h/*.test.mjs | 115/115 PASS |
| npm run verify | PASS, shell22/22 |
| Attribution / guard integrity fixtures; syntax, diff, sensitive-literal scan | 142/142 and 14/14 PASS; all remaining checks PASS |

Independent agent h4r2_review read the complete runtime/test diff, independently ran focused R2 15/15 and diff checks, final re-review PASS. No confirmed false terminal or unrelated-obligation clearing defect remains in its scoped assessment. This is not GitHub formal approval; exact published HEAD, thread disposition, formal review and CI are tracked on existing PR47. Last commit agent: Codex root; resolve immutable published implementation SHA from PR47 rather than caching a mutable current head.

H4: IMPLEMENTED_OFFLINE_TESTED / REVIEW_PENDING. H5 NOT IMPLEMENTED. Hosted atomic deletion UNVERIFIED; hosted verification0/18; Hosted LIVE NOT AUTHORIZED / BLOCKED; Production Real Auth STRICT NO-GO; hosted mutations0; additional infrastructure cost$0. Merge needs separate owner authorization. No power-loss or privileged filesystem tampering attestation is added.


## R3 Storage resolution consistency disposition

Implementation owner: Codex root (continued R2 owner). Bootstrap fetched clean, aligned local/remote `48228951fed1bccc2122c9577e3a912162534b72`, main `5809dddf456cea3b8dfec1164034cf63fc392eb1`. [Bugbot medium finding](https://github.com/im-tnyx/Tio-Workspace/pull/47#discussion_r4710934807) investigated on unchanged runtime. Disposition: **non-applicable to authentic admitted cleanup**, supported by new regression evidence and independent read-only review; runtime remains unchanged.

### Source and admitted-path evidence

- Runner Storage cleanup calls `liveAbsence` only after identity-bound private conditional deletion and separate normalized authoritative absence verification, before `persistVerifiedResourceResolutions`. Journal `liveAbsence` checks a single pending upload's exact object/owner and commits an `absence` event at the latest cleanup observation. Replay advances `absentThrough` over the preceding deletion. Consequently `pendingStorage` already excludes that deletion before keyed resolution; ignoring `resolvedAttempts` does not produce the reported false residual in this authentic path. Filtering resolved ordinals alone would be an unnecessary relaxation.
- New regression uses actual `journalTransport` provisioning and public owner-bound `updateStorageFixture` during pre-upload reservation to create a real keyed marker. Real upload/private creation receipt, conditional delete (ordinal6), authoritative absence (ordinal7) and keyed resolution complete cleanly on unchanged baseline runtime. SQLite event inspection proves absence precedes resolution and the latter includes ordinal6. Close/reopen and repeated recovery preserve terminal report and consumed7. Forged absence removal, duplicate keyed resolution and unrelated ordinal substitution fail replay.
- Mixed keyed Storage plus created Auth user completes with consumed9; dependent Auth DELETE occurs only after verified Storage absence and keyed resolution. Successful DELETE with a 503 absence observation keeps Storage/Auth blocked with consumed7. An additional indeterminate upload is not cleared by the exact keyed resolution: no absence marker is advanced and residual attempts remain. Existing replacement/unknown ownership, R1 admission, R2 non-Storage and credential tests are retained.
- Real subprocess termination immediately before versus after committed keyed Storage resolution retains an unresolved marker versus replayable completion, with consumed7 unchanged. Failed SQLite resolution persistence poisons the live handle; reopening preserves recovery-required marker despite prior absence. No budget refunds, credential persistence or new capability.

### Actual R3 verification (exit 0)

Focused R3: **7/7**; full Windows H4 including crash/restart: **55/55**; full Task06I Windows and cached hardened network-none Linux Docker: **387/387 each**; legacy runner/PR45: **182/182**; local PostgreSQL17.11 parity **18/18 POSTGRES_VERIFIED**; Task06H **115/115**; npm verify PASS including shell **22/22**. Linux retained pull never, cap-drop ALL, no-new-privileges and read-only experiments mount, no supplied credentials/socket. Syntax/diff/attribution and publication evidence are checked before push and on PR47. Runtime files match the R2 baseline; only tests and these continuity records change.

Independent read-only agent h4r3_review independently ran R3 **7/7**, reviewed adjacent absence/resolution boundaries and supported non-applicability; PASS is an agent assessment, not GitHub approval. Last commit agent Codex root; exact published head/review/CI tracked on PR47.

### Remaining independent blockers (outside R3 scope)

Latest exact-head im-tio review is CHANGES_REQUESTED. Separate P2 [writer/reader journal-size inconsistency](https://github.com/im-tnyx/Tio-Workspace/pull/47#discussion_r4710985979) and P2 [non-preflight reservation durable obligation](https://github.com/im-tnyx/Tio-Workspace/pull/47#discussion_r4710985990) remain open and require a separately bounded correction. R3 does not resolve those threads. H4 IMPLEMENTED_OFFLINE_TESTED / BLOCKED_PENDING_REVIEW_CORRECTIONS. H5 NOT IMPLEMENTED; hosted atomic deletion UNVERIFIED; verification0/18; LIVE BLOCKED; Production Real Auth STRICT NO-GO; hosted mutations0; additional infrastructure cost$0. Merge remains separately unauthorized.
