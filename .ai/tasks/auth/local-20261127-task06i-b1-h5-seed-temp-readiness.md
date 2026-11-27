# Task 06I-B1-H5 — Run-created seed lifecycle and TEMP readiness

| Field | Value |
|---|---|
| Status | IMPLEMENTED_OFFLINE_TESTED / PR #49 published, formal exact-HEAD review pending |
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

## Truth boundary

H4 MERGED / OFFLINE TESTED. H5 IMPLEMENTED_OFFLINE_TESTED / PR #49 REVIEW_PENDING. Hosted atomic deletion UNVERIFIED. Hosted verification0/18. Hosted LIVE NOT AUTHORIZED/BLOCKED. Production Real Auth STRICT NO-GO. Hosted mutations0. Added infrastructure cost$0. Merge requires separate explicit owner authorization.
