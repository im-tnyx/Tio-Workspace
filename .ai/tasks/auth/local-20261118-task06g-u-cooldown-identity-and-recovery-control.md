# Task 06G-U — Cooldown wrong-identity and recovery positive-control classification

| Field | Value |
|---|---|
| Date | 2026-11-18 |
| PR | [#30](https://github.com/im-tnyx/Tio-Workspace/pull/30) @ baseline `9e5eee1236b827e78c59241ecc962facab1efc80` |
| Findings | Codex `4608992254` (wrong-identity cooldown), `4608992261` (recovery positive control) |
| Commit / push / thread resolve / merge | **Not performed** (task authorization: local corrections only) |
| Product gate | AUTH-12 / AUTH-17 / AUTH-22 **BLOCKED**; managed Supabase **NOT VERIFIED**; Production Auth **NO-GO** |

## Root causes

1. **`classifyFiveWrong`:** `completeAuthResponse(correct, id)` returned false for a different valid UUID, so a complete cross-identity session fell through to `INCONCLUSIVE`.
2. **`RECOVERY_AS_EMAIL|SIGNUP|MAGICLINK`:** hard-coded `positiveControlValidated: false` made recognized wrong-purpose rejection permanently `INCONCLUSIVE`.

## Local corrections

| File | Change |
|---|---|
| `assertions.mjs` | `classifyFiveWrong` returns `{ result, kind }` with `cooldown_bypass` vs `wrong_identity` (and other kinds) |
| `local-otp.mjs` | `COOLDOWN_15_MIN` only when `kind === 'cooldown_bypass'`; wrong-purpose recovery attempts `type=recovery` positive control after recognized rejection; FAIL/ERROR short-circuit before control |
| `assertions.test.mjs` | Regression matrix for both findings |

## Offline validation

- `node --check` ×3 PASS
- `assertions.test.mjs` **30/30 PASS**
- `loopback-preflight.test.mjs` **5/5 PASS**
- Docker / hosted Auth: **NOT RUN**

## Thread disposition (code only; GitHub unresolved)

| ID | Status in code |
|---|---|
| 4608992254 | **FIXED locally** (uncommitted) |
| 4608992261 | **FIXED locally** (uncommitted) |
| 4604875982 / 4604875989 / 4607470710 / 4607565209 / 4608876817 | Previously fixed in published commits; threads may still show unresolved |

## Next owner step

Authorize commit + push of these three experiment files (± this report) to PR #30 for independent re-review.
