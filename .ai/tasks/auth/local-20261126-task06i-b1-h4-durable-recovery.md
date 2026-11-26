# Task 06I-B1-H4 — Offline durable crash recovery

| Field | Value |
|---|---|
| Status | Ready for review |
| Implementation owner | Codex root |
| Previous agent | None for H4 |
| Last commit agent | Codex root. First verified H4 implementation commit `80f8507ab92bb744a55b753439ec0434004643bf`. The PR records the reviewed correction HEAD. |
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
- Windows H4: **26/26**. Hardened Linux Docker Task 06I: **358/358**. Standalone local PostgreSQL contract parity: **18/18**. Task 06H regression: **115/115**. Repository verify: token checks, typecheck, lint and **22/22** shell tests. Attribution and guard fixtures: **142/142** and **14/14**. All listed commands exited 0. Linux synthetic tests ran with no Docker socket, and PostgreSQL execution was verified separately against the cached local image.

## Local operation

1. Allocate a private local directory on NTFS or a local Linux filesystem with SQLite-compatible locking. Pass its canonical absolute path to `createOfflineRecoveryJournal`. Use its returned `runId` in the existing run-bound inventory, transport, Admin and dispatcher factories. Select explicit `runOfflineProbeSimulation`; when using recorded zero wait, select it in the journal and corresponding fixtures/timing.
2. Keep the journal handle open through provisioning and cleanup. Read `handle.report()` for consumed attempts and outstanding obligations; close the handle when no request or reconciliation is in flight.
3. Restart with `reopenOfflineRecoveryJournal` and the original directory, project and run ID. For a Storage obligation, pass a registered provider rebuilt with the synthetic state exported by `snapshotRecoveryStorageFixture`. The snapshot carries `objects`, `indeterminate` and `creationOrdinal`. Supply these independently from the journal. Run `recoverOfflineProbeRun`. Absence, a matching creation witness, a replacement and indeterminate state take distinct paths. Exhausted allowance retains the original obligation.
4. Keep unresolved records for operator review. Cold Auth reconciliation and unclassified effects have no supported provider proof path in this slice. Journal-backed runs retain them conservatively, including when the process-local H3 inventory alone reports clean. The existing process-local H3 entry points remain supported for legacy runs.

The local filesystem trust boundary assumes an owner-controlled directory and ACL, stable paths and working local file locks and flush semantics. SQLite handles incomplete transactions and journal replay after process crashes. This implementation does not attest ACLs on Windows, support network filesystems or defend against a privileged actor substituting an internally consistent prior copy. Verification covers process termination on Windows and a Linux Docker volume. It does not demonstrate power-loss behavior.
