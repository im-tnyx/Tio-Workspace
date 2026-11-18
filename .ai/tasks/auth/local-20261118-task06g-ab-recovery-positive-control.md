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
