# Task 06I-B1-H5 — Run-created seed lifecycle and TEMP readiness

| Field | Value |
|---|---|
| Status | H5-R1 IMPLEMENTED_OFFLINE_TESTED / fresh formal exact-HEAD re-review pending |
| Objective | Offline-tested Option B run-created seed lifecycle integrated with the existing runner, H4 journal and shared budget, plus future TEMP readiness packet |
| Implementation owner | Codex root |
| Previous agent | Codex root, H4 closeout |
| Last commit agent | Codex root; runtime checkpoint `08d6cd2111a66e965fcb0a296012b13f5e71c8c8`; resolve latest continuity/publication HEAD from PR #49 |
| Tracking / approval | Owner H5 task brief supplied 2026-11-27, local implementation/tests/docs/publication only |
| Branch | `feat/task06i-b1-h5-seed-temp-readiness` |
| PR | [#49](https://github.com/im-tnyx/Tio-Workspace/pull/49), open for review against main; merge not authorized |
| Base | `efa5929f5718e38d40f0035624c1b6b3da8000db` |
| Scope | `experiments/task06i/` runtime/fixtures/tests and H5 continuity/readiness documentation |

## Context and authority

Applicable [AGENTS](../../../AGENTS.md), [review workflow](../../../docs/11-PR-REVIEW-WORKFLOW.md), [H3 history](../../archive/2026/local-20261124-task06i-b1-h3-subset-runner-storage.md) and [H4 complete history](../../archive/2026/local-20261126-task06i-b1-h4-durable-recovery.md) were inspected. PR #47 and #48 are merged; initial local/remote main matched the base with a clean checkout and one worktree. Main Protection `27218050` is active/strict with App `5032971` attribution check, independent approval, resolved threads and zero bypass actors. Historical archives remain unchanged.

## Design and bounded implementation

- Preserve Option A pre-existing identities. Module-owned Option B admission generates an exact synthetic run identity and operation. Private fixture creation observations establish ownership; email/user_metadata/caller labels do not.
- Extend the existing H4 journal with bounded seed intent/ownership transitions and retain exact consumed request ordinals. Unknown creation survives restart. Credentials remain ephemeral.
- Reuse existing runner, request budget, private session evidence, conditional Storage deletion and independent absence. Require session and Storage reconciliation before deleting the exact verified created seed.
- New fixture state models provider collisions and creation response loss. It provides offline evidence only.
- Preserve 25 requests, 1,000-ms standard pacing, cleanup reserve0, journal512 events/256KiB and recovery headroom. Hosted LIVE stays hard-blocked. No actual hosted reads/mutations, emails, UI/runtime product Auth, provider configuration or merge.

## Selected skills and sources

Supabase skill loaded for Auth/Storage security and official source checks. Official changelog and Admin create/delete references consulted. Pinned local GoTrue v2.197.0 source exposes optional Admin `id`; its hosted availability remains unverified. No CLI/image upgrade. GitHub tools/CLI verify actual repository evidence. Independent architecture/security read-only reviewer requested.

## Progress and verification

The [source-backed H5 readiness packet](../../../experiments/task06i/h5-temp-readiness.md) contains the state machine, complete lifecycle coverage, Option A/B costs, all existing18 scenarios, provider prerequisites, remaining limitations and future exact-scope TEMP proposal. Simple B cleanup costs5; HOOK-01/SESSION-01 costs8; the Storage-enabled subset costs15; disposable SESSION-02/03 coverage costs10. All costs include actual setup and cleanup attempts and preserve the shared ceiling25. First hosted proposal selects only the demonstrated subset; it is not activated.

| File | Responsibility |
|---|---|
| `experiments/task06i/hosted-probe-runner.mjs` | Private seed plan/create/verification; exact bound offline dispatcher reusing existing probes; session/Storage gates; separate Auth absence; credential clearing |
| `experiments/task06i/offline-recovery-journal.mjs` | Typed seed intent/ownership/absence replay, bounded durable obligations and recovery report |
| `experiments/task06i/run-request-budget.mjs` | Accept exact operation hash for the seed-create kind within the existing allowance |
| `experiments/task06i/offline-seed-lifecycle.test.mjs` |52 imported runtime regressions, including real subprocess termination and write failures |
| `experiments/task06i/h5-temp-readiness.md` | Architecture, costs,18-scenario readiness and separately gated future TEMP proposal |
| `.ai/current.md`, this record | Active continuity and bounded evidence |

### Actual verification on the H5 working tree, 2026-11-27

| Check | Actual outcome | Exit |
|---|---|---:|
| `node --test experiments/task06i/offline-seed-lifecycle.test.mjs` |52/52 PASS, zero fail/cancel/skip;13 process termination windows +5 persistence fault cases |0|
| `node --test experiments/task06i/*.test.mjs` Windows |514/514 PASS, zero fail/cancel/skip; includes all462 previous regressions |0|
| `node --test experiments/task06i/offline-probe-recovery.test.mjs` |130/130 PASS, separate complete H4 crash/restart run |0|
| `node --test experiments/task06i/hosted-probe-runner.test.mjs` |182/182 PASS, separate legacy runner and PR45 regressions |0|
| Complete Task06I cached `node:24-bookworm` hardened Linux |514/514 PASS, zero fail/cancel/skip; network none, pull never, cap-drop ALL, no-new-privileges, read-only source/root, tmpfs recovery directory |0|
| `node experiments/task06i/sql-contract-parity.mjs` |POSTGRES_VERIFIED, PostgreSQL17.11,18/18 matched; isolated local process, no hosted SQL |0|
| `node --test experiments/task06h/*.test.mjs` |115/115 PASS |0|
| `npm run verify` |Token guard self-test/check, typecheck, lint and shell22/22 PASS |0|
| Attribution fixtures, hardened cached Linux |142/142 PASS; temporary script copies normalize Windows CRLF for Linux execution only |0|
| Protected guard-integrity fixtures, same isolation |14/14 PASS; no protected file changed |0|
| Four changed/new JavaScript syntax checks |PASS |0|
| Markdown paths/fences + sensitive-literal/machine-path scan |3 docs/38 relative links and7 scoped files PASS; no new Mermaid diagram |0|
| `git diff --check`, historical H3/H4 archive equality |PASS |0|

Network-disabled Linux has no Docker CLI/socket for nested PostgreSQL; its parity availability test correctly takes the non-executed-provider branch. The separate Windows-host local Docker PostgreSQL command above supplies the actual database evidence. Node SQLite/module-mocking warnings are environment disclosures, not hosted validation. `recorded_zero_wait` pacing is synthetic; standard pacing/restart and ticket/lease integrity remain covered by unchanged H4/budget regressions. No pinned CLI, SDK or image was upgraded.

### Independent review and dispositions

Independent read-only architecture/security reviewer `/root/h5_architecture_review` inspected the complete runtime lifecycle. Three concrete findings were corrected before publication:

1. Public session tracking removal could skip logout before seed deletion. The private durable Auth-obligation gate now blocks deletion even after public Set/flag tampering; zero DELETE regression passes.
2. `CLEANUP_PENDING` temporarily lost verified ownership classification. It now retains private verified ownership; uncertain request effects still remain unresolved.
3. A same-run sibling inventory could bypass seed-specific dispatcher checks. The frozen H5 capability now requires the exact factory inventory, active admission and exact seed context; zero dispatch regression passes.

Reviewer returned **PASS** on the final runtime, test and readiness diff and independently ran52/52 focused tests (exit0). Final review includes disposable password reset, non-mutating runner identity rejection and matching replay checks for outstanding Auth obligations. Reviewed runner blob `e6ee8a3909573f20f4272d7194c97652658feeda`, journal `f34882c0c57c55fe2552cf370e33102a9147a454`, budget `d73f5cf212b6500232634657abaa13da84e5b656`, tests `4eeecfef9f481b50813a6402c2a39b794319edd1`, readiness `999f57dc64ca1ec5ee1320056dd21d12667da4f8`. This is an independent offline assessment, not formal GitHub approval. Formal `im-tio`, Codex and applicable integration requests are publication gates; unavailable/quota-limited scans will not be called successful.

### Remaining implementation and provider limits

- Cold Auth recovery deliberately cannot recreate credentials or destructive ownership from journal metadata. Unknown creation and failed mutating effects remain residual; no automatic retry/refund or adoption fallback.
- A durable terminal failure can be finalized after safe reopen when all resource resolutions already persisted. Earlier resolution/outcome failure cannot falsely finish.
- Hosted explicit-ID Admin creation, fixture deployment/grants, token/Send Email hooks, rate limits, Storage policies and atomic conditional deletion require separate authorization and empirical verification.
- Existing offline probe readiness (10 implemented,5 prerequisite blocked,3 LayerA only) does not mean all18 or every combined Option B subset has valid hosted/terminal evidence. Failed mutating probe effects remain conservatively unresolved.
- No isolated-worker migration, H6, production Auth, hosted credential/configuration access or merge is included. Rollback preserves active journals and residual obligations; old runtime does not interpret new typed seed events and must not be used to erase them.

### Publication receipt

Runtime checkpoint `08d6cd2111a66e965fcb0a296012b13f5e71c8c8` was committed and pushed after final independent PASS. Remote main remained `efa5929f5718e38d40f0035624c1b6b3da8000db`. PR #49 opened with seven scoped files. This follow-up records the actual PR link; runtime/tests/readiness blobs remain identical to the independently reviewed versions. Exact final HEAD, CI, review requests and reviewer availability are recorded in the PR conversation after this continuity push. Formal approval remains pending; this record does not cache a mutable PR-head SHA or claim CI/reviewer success before observation.

## H5-R1 — Run-wide seed authorization and ordered durable Auth cleanup

Owner separately authorized this revision on existing PR #49 against baseline feature `8f0fed4a5ae604f5f6bc07cff38fccf0048a277c` and unchanged main/base `efa5929f5718e38d40f0035624c1b6b3da8000db`. Initial checkout was clean, feature local/remote aligned, one worktree. Live reviews recorded two unresolved findings and formal `im-tio` CHANGES_REQUESTED; passing CI did not override those blockers. H3/H4 archives and protected governance files remain unchanged.

### Reproductions before runtime edits

- [R1-01 P1](https://github.com/im-tnyx/Tio-Workspace/pull/49#discussion_r4716319038), thread `PRRT_kwDOVtCmZc68qw6i`: inventory A reserved a seed; on pre-existing collision and indeterminate creation, genuine same-run inventory B registered an ordinary creation proof and reached one synthetic DELETE in each case. Both zero-DELETE assertions failed on unchanged runtime.
- [R1-02 P2](https://github.com/im-tnyx/Tio-Workspace/pull/49#discussion_r4716305329), thread `PRRT_kwDOVtCmZc68qu0M`: admitted sibling deletion/absence left its Auth obligation unresolved, preventing seed deletion and preventing finalization from persisting the sibling resolution. The terminal assertion failed. Initial focused run:3/3 FAIL, exit1; independent reviewer separately executed the same reproduction.
- Adjacent correction testing found an alternative same-run provider transport could persist a sibling absence and later let original-provider cleanup skip its surviving sibling. Reviewer independently reproduced false terminal success. A separate two-inventory sibling ordering test also reproduced a conservative user/session-classification deadlock. Both failing regressions were added before their corrections; both now pass. These are bounded lifecycle corrections, not a new research phase.

### Correction and audit

`hosted-probe-runner.mjs` binds protection to the current journal handle/run, exact reserved UUID, private original owner and verification transport. Module-owned per-request authority is required for all Auth DELETE in a seed journal; the exact registered inventory/record, provider transport, key, seed operation and request ordinal are rechecked after pacing, at durable dispatch and immediately before provider entry. Standalone/raw/case/encoded targets, alternate/cross-run adapters, public ownership/lifecycle labels and serialized hashes cannot substitute for the private capability. Stale close/reopen ownership is not reconstructed from metadata. Cleanup helper methods used by admission are identity-checked before executing caller replacements.

All Auth deletions in the seed run use its original verified fixture transport. A journal-handle-bound private index records admitted user registrations across genuine inventories, distinguishing their sibling-user keys from unresolved session/unknown Auth keys. It preserves the existing ordinary non-seed proof contract; the reserved seed still requires authentic private verification.

Sibling users are processed independently of seed registration/Map order. Exact sibling DELETE plus independently captured exact GET404 issues a private receipt and persists typed `auth_absence_resolution` before the seed gate. Failed/indeterminate and unrelated effects remain unresolved. Private handle/record/proof/transport/resolved-ordinal receipts skip already verified work on retry. Storage and applicable sessions precede Auth; credential restoration may add blockers before the final seed phase. The verified seed is deleted last, followed by independent absence, durable seed resolution, terminal persistence and credential disposal. An individual resolution does not require the whole inventory to be clean. Persistence failure prevents dependent seed dispatch.

The [bounded deletion-path audit, lifecycle matrix and updated request costs](../../../experiments/task06i/h5-temp-readiness.md#h5-r1--run-wide-authority-and-ordered-auth-cleanup) cover registration, run identity, Admin/direct transport/budget/journal admission, private authority, session/Storage gates, absence, resolution and restart. No journal schema-version migration or parallel runner was introduced; capacity and recovery headroom remain fixed.

Base Option A/B costs remain unchanged. A sibling adds exactly2 shared requests. Actual B costs: minimal5; one sibling7; two siblings9; authentication+Storage15; authentication+Storage+two siblings19. All stay within25. No additional hidden allowance/reserve/refund or hosted endpoint is authorized.

### Final R1 verification

All below actually executed with exit0 and zero failed/cancelled/skipped tests:

| Check | Outcome |
|---|---|
| Focused `--test-name-pattern H5-R1` |30/30 PASS |
| Complete H5 `offline-seed-lifecycle.test.mjs` |82/82 PASS, original52 retained |
| Complete Task06I Windows |544/544 PASS, original514 retained |
| Complete hardened network-none Linux `node:24-bookworm` |544/544 PASS; cached/pull-never, cap-drop ALL, no-new-privileges, read-only root/source, tmpfs, no credentials/ports/socket |
| Separate H4 crash/restart |130/130 PASS |
| Separate legacy runner / PR45 |182/182 PASS |
| Local PostgreSQL17.11 parity |POSTGRES_VERIFIED,18/18 matched |
| Task06H |115/115 PASS |
| `npm run verify` |Token self-test/check, typecheck, lint, shell22/22 PASS |
| Attribution / protected guard-integrity fixtures |142/142 and14/14 PASS |
| Syntax / documentation / sensitive literals / diff |4 JavaScript syntax checks;3 Markdown files,50 relative links,13 focused anchors;7 scoped-file scan; diff checks and historical/protected-file equality PASS |

Negative coverage includes missing/wrong authority, alternate provider, cross-run/journal, stale reopen, public-map tampering, exact absence failures, unknown effects and missing credentials. Temporal tests insert session/Storage/sibling/record blockers after durable dispatch but before provider entry, and during an actual standard pacing wait; no unauthorized DELETE occurs and consumed markers are not refunded. Real subprocesses terminate before/after sibling resolution. Resolution write failure leaves seed undispatched and residual evidence visible. Forged/malformed/duplicate private/replay receipts reject.

Independent read-only reviewer `/root/h5_r1_review` returned final **PASS**, independently executing R1 30/30 and complete H5 82/82, both exit0. Reviewer distinguished original/adjacent executed reproductions from static tracing and did not independently rerun full Task06I/CI. Reviewed final runtime blobs: runner `bbe5c7973c56560d59b50392b7fa7e20027fe8f5`, journal `d6cecc4aade79e4dfed1d4d2d4fc6b4e2ee8f830`, budget `ff721722f6b3c28bcada8a46e6bdbd58db6d46e8`, tests `5f68acfeb85179bed7eae29a927141276fc2938a`.

Publication must reply separately to both original findings with exact committed SHA and this evidence, resolve only demonstrated corrections, and request fresh exact-HEAD `im-tio`/Codex review. The existing CHANGES_REQUESTED review is not dismissed. Bugbot remains disabled and Cursor Security Reviewer quota-limited; neither is a successful scan. No settings/credits/paid service changes. Formal approval, CI and merge authorization are separate gates; resolve their current state from GitHub.

## H5-R2 — Closed-journal seed protection and provider-bound session revocation

Follow-up resolution on [PR #49](https://github.com/im-tnyx/Tio-Workspace/pull/49) (continuing from `c038b5ced0a1ffdd29be79a84061eccfd376c9ec`) for the two remaining open review threads:

1. **`PRRT_kwDOVtCmZc68s8xo` / [`#4717252490`](https://github.com/im-tnyx/Tio-Workspace/pull/49#discussion_r4717252490) (P2 — Preserve seed protection while journal is closed):**
   - `offline-recovery-journal.mjs`: Added process-lifetime `protectedSeeds` tombstone populated on `openJournal` replay and `reserveSeed` and preserved across `handle.close()`. `journalProtectingSeed(userId)` returns `{ closed: true, handle }` when not open in `active`.
   - `hosted-probe-runner.mjs`: `deterministicFixtureTransport` blocks `protectingJournal.closed`, `authDeletionUserId` strips leading/trailing slashes, and `normalizedAuthDeletionCandidate` resolves relative URLs, percent-encoded slashes (`%2f`), and collapsed repeated slashes before `journalProtectingSeed(...)` lookup (`SEED_DELETE_PROJECT_RUN_OR_PATH_MISMATCH`).
2. **`PRRT_kwDOVtCmZc68s9DT` / [`#4717254383`](https://github.com/im-tnyx/Tio-Workspace/pull/49#discussion_r4717254383) (P1 — Bind session revocation & cleanup to verified seed provider):**
   - `_executeCleanupInternal` rejects any `adminClient` with `rawTransportFetch !== seed.transport` (`SEED_CLEANUP_PROVIDER_MISMATCH`) prior to Storage, session, sibling Auth, restoration, or seed phases, leaving durable obligations intact and retryable with the verified provider.
   - `RESOURCE_ENTRY_TRANSPORTS`, `SESSION_ISSUANCE_TRANSPORTS`, `TRANSPORT_OBSERVATION_CONTEXT`, `recordSessionIssuanceProvider`, `recordVerifiedSessionBaseline`, `getVerifiedSessionBaseline`, `recordVerifiedSessionRevocation`, and `hasVerifiedSessionRevocation` bind issuance/baseline/revocation evidence to exact originating transport, `journal.handle`, and `seed.transport`. Seed-run cleanup skips require `hasVerifiedSessionRevocation(this, sessionId)` (ignoring `revokedSessions` tampering while preserving H4-R6 replay semantics).
   - `createRunCreatedSeedDispatcher`, `createHostedDispatcher`, `verifyUserCredentials`, and `invalidateSession` enforce `seed.transport`.
3. **Final validation & independent read-only audit (`9dc4edd2`):**
   - Initial independent audit flagged relative-URL / extra-slash raw-transport bypass (`#4717252490`); after adding `normalizedAuthDeletionCandidate` + slash normalization + extended tests (`verified=false/true`, canonical/uppercase/trailing-slash/`//`/`%2f`/`%`-encoded/relative URLs, and post-reopen+close rejection), independent re-audit returned **PASS**.
   - Offline checks after final edit: `H5-R1` `33/33` PASS; complete `offline-seed-lifecycle.test.mjs` `85/85` PASS; `experiments/task06i/*.test.mjs` Windows `547/547` PASS; hardened Docker Linux (`node:24-bookworm`, `--network none --pull never --cap-drop ALL --security-opt no-new-privileges`) `479/479` PASS; `experiments/task06h/*.test.mjs` `115/115` PASS; PostgreSQL `17.11` parity `18/18` (`POSTGRES_VERIFIED`); `npm run verify` PASS (`22/22` shell tests).

## Truth boundary

H4 MERGED / OFFLINE TESTED. H5-R2 IMPLEMENTED_OFFLINE_TESTED / PR #49 exact-HEAD re-review pending. Hosted atomic deletion UNVERIFIED. Hosted verification 0/18. Hosted LIVE NOT AUTHORIZED/BLOCKED. Production Real Auth STRICT NO-GO. Hosted mutations 0. Added infrastructure cost $0. Merge requires separate explicit owner authorization. Stop after PR #49 blocker publication; no H6.
