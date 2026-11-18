# Task 06G-T — Wrong-purpose OTP authentication evidence classification

| Field | Value |
|---|---|
| Date | 2026-11-18 |
| PR | [#30](https://github.com/im-tnyx/Tio-Workspace/pull/30) branch `docs/task06g-local-auth-evidence` |
| Baseline HEAD (before local fix) | `ebe40999e94d070a5418f0cbce08a0dab44accbd` |
| Review finding | Comment `4608876817` (im-tio, CHANGES_REQUESTED): `classifyNegative(crossing)` ignored bearer probe evidence |
| Scope | Offline classifier + harness wiring + unit regressions only |
| Commit / push / thread resolve / merge | **Not performed** (awaiting separate owner authorization) |
| Product gate | Production Auth **BLOCKED**; AUTH-12 / AUTH-17 / AUTH-22 **BLOCKED**; managed-hosted Auth **NOT VERIFIED** |

## Root cause

`SIGNUP_AS_RECOVERY` and wrong-purpose `RECOVERY_AS_*` paths collected `GET /user` probes but classified with `classifyNegative(verify)`, which only fails on a complete access+refresh pair. An HTTP 200 wrong-purpose verify with an access token, no refresh token, and a successful bearer `/user` for the expected UUID was recorded as `INCONCLUSIVE`. Offline reproduction: `classifyNegative(accessOnly) === 'INCONCLUSIVE'`.

## Code changes (local, uncommitted)

| File | Change |
|---|---|
| `experiments/task06g/assertions.mjs` | Added `classifyPurposeCrossing`: decisive `FAIL` on complete auth or authenticated bearer probe (refresh optional); `PASS` only for recognized OTP rejection with `positiveControlValidated`; otherwise `INCONCLUSIVE`/`ERROR` |
| `experiments/task06g/local-otp.mjs` | Wired `SIGNUP_AS_RECOVERY` and wrong-purpose `RECOVERY_AS_*` through `classifyPurposeCrossing` with probe + expected UUID |
| `experiments/task06g/assertions.test.mjs` | Regression suite for review matrix (both crossing directions, PASS/INCONCLUSIVE/ERROR edges) |

`classifyNegative` remains unchanged for cooldown recognized-rejection checks.

## Validation

| Check | Result |
|---|---|
| `node --check` (3 changed files) | PASS |
| Full `assertions.test.mjs` + `loopback-preflight.test.mjs` | **34/34 PASS** |
| `git diff --check` | clean |
| Docker / hosted Auth integration | **NOT RUN** (loopback-only gate unchanged; project `bsfwzvgynwriswapxpsp` not contacted) |

## Review-thread disposition (code only; threads not resolved)

| Comment | Topic | Disposition |
|---|---|---|
| 4604875982 | Five recognized OTP rejections for cooldown FAIL | **FIXED** in `599127c` / `22f95c3` |
| 4604875989 | Old-code auth fails independently of new-code | **FIXED** in `599127c` / `22f95c3` |
| 4607470710 | All project-network containers loopback-checked | **FIXED** in `1f46fdd` |
| 4607565209 | Wrong-code auth not masked by later transport | **FIXED** in `22f95c3` |
| 4608876817 | Wrong-purpose bearer proof must FAIL | **FIXED locally** (uncommitted); needs review after commit/push |

## Preserved evidence boundary

Historical LOCAL ONLY GoTrue `v2.197.0` findings unchanged (7/9 dual redemption, five-wrong-then-correct acceptance, purpose crossover observations, AUTH-17 mutation). Corrected integration still **NOT RUN**. Production Auth remains **NO-GO**.

## Next owner decision

Authorize commit + push of these three experiment files (and optionally this report) to PR #30 for independent re-review. Do not merge until formal approval, required checks, and thread policy are satisfied.
