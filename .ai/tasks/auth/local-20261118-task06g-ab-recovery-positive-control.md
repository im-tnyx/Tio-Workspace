# Task 06G-AB — Recovery Positive-Control Identity Fix

| Field | Value |
|---|---|
| Baseline | `31607a776e56730d1893ce7456c387117dc819e3` |
| PR | [#30](https://github.com/im-tnyx/Tio-Workspace/pull/30), existing evidence-only branch |
| Finding | Codex review comment `4611598505` |
| Integration | **NOT RUN**; Docker/Auth integration was outside this correction |
| Product status | AUTH-12 / AUTH-17 / AUTH-22 **BLOCKED**; managed Supabase **NOT VERIFIED**; Production Auth **NO-GO** |

## Failure recovery

The first native run failed only in the new object-returning helper assertion: `assert.equal` compared object references, although actual and expected objects had identical fields. Replaced it with `assert.deepEqual`. No test was skipped or removed.

## Correction

`classifyRecoveryControl()` now returns `ERROR` for a recovery bearer probe transport failure when there is no prior identity violation. Added `classifyRecoveryPurposeCrossing()` to preserve wrong-purpose authentication `FAIL`, classify the recovery positive control independently, distinguish `purpose_crossover` from `recovery_control_wrong_identity`, and allow `PASS` only for a recognized wrong-purpose OTP rejection plus complete same-user recovery session with successful `/user` validation. The harness uses this result for `RECOVERY_AS_EMAIL`, `RECOVERY_AS_SIGNUP` and `RECOVERY_AS_MAGICLINK` and retains one result row per flow.

| Evidence | Result |
|---|---|
| Wrong-purpose authentication independently succeeds | **FAIL**, regardless of later recovery control errors |
| Wrong-purpose rejection + matching verified recovery session | **PASS** |
| Wrong-purpose rejection + complete or bearer-validated wrong-UUID recovery session | **FAIL**, tagged `recovery_control_wrong_identity` |
| Incomplete, malformed or rejected recovery evidence | **INCONCLUSIVE** |
| Recovery probe timeout without decisive violation | **ERROR** |

## Validation

- `node --check` for `assertions.mjs`, `assertions.test.mjs`, `local-otp.mjs`: **PASS**
- `node --test experiments/task06g/assertions.test.mjs`: **42/42 PASS**
- `node --test experiments/task06g/loopback-preflight.test.mjs`: **6/6 PASS**
- `git diff --check`: **PASS**
- Docker/Auth, hosted Auth and production tests: **NOT RUN**

The recovery correction is local evidence-classifier/harness work. It does not change GoTrue or establish a Tio application authorization bypass. Historical Task 06G observations remain unchanged. Docker exposure review `4609372956` remains **OWNER DECISION REQUIRED**.

## Publication status

The report and source changes are included in local commit `d2e4192` on the existing PR branch. The commit has **not been pushed** because the post-commit attribution, guard-integrity and base-freshness scripts could not start in this execution environment. PR #30 is unchanged; no thread reply or merge was performed.

## Publication provenance addendum — 2026-11-18

The preceding publication-status paragraph records the real intermediate pre-publication state when this report was first written. The local commit `d2e4192` was an unpublished intermediate and was amended before push so this report accurately described its then-current state. The resulting commit `4d1ccc2157903230eba9600c0271ec03decf7662` was pushed normally to the existing `docs/task06g-local-auth-evidence` branch and is included in open PR #30. No force-push or merge occurred.

| Evidence source | Verified result |
|---|---|
| Owner-run Windows PowerShell 5.1 fixtures | Attribution **142/142 PASS**, guard integrity **14/14 PASS**, both exit codes 0; these owner-run results are distinct from agent execution. |
| Owner-run post-commit checks | Attribution, guard integrity and base freshness **PASS** for `4d1ccc2`; run in the owner PowerShell session. |
| Agent-run Node validation | Three syntax checks **PASS**; assertions **42/42 PASS**; loopback-preflight **6/6 PASS**. |
| GitHub checks on published `4d1ccc2` | App-owned `Commit attribution guard`, attribution fixture tests, guard runner and Cursor Bugbot **SUCCESS** on read-back. |
| Worktree whitespace / secret inspection | `git diff --check` and bounded secret scan **PASS**; synthetic test fixtures were the only credential-shaped literals. |

At last review-state read, PR #30 remained **OPEN** and had no formal `APPROVED` review on the published head; earlier owner `CHANGES_REQUESTED` reviews and unresolved reviewer threads remain subject to independent re-review. The publication reconciliation finding `4612519515` identified the stale paragraph above; this dated addendum preserves that historical account and supersedes it for current publication status. The requested independent approval and thread disposition remain pending; no reviewer-owned thread was resolved here.

Security gates are unchanged: AUTH-12, AUTH-17 and AUTH-22 **BLOCKED**; corrected Docker/Auth integration **NOT RUN**; managed Supabase Auth **NOT VERIFIED**; Production Auth **NO-GO**. Docker exposure finding `4609372956` remains **OWNER DECISION REQUIRED**. No hosted Auth request, Docker operation, production change or merge is claimed.
