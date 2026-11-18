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

## Publication addendum — 2026-11-18 (post-commit provenance)

Historical notes above remain the pre-publication record and are not rewritten.

| Fact | Value |
|---|---|
| Actual published commit for Task 06G-U | `9d57b7712b9e3d68f101e3e2e555ca1f4091f403` on branch `docs/task06g-local-auth-evidence` |
| Existing PR | [#30](https://github.com/im-tnyx/Tio-Workspace/pull/30) — open; `CHANGES_REQUESTED` at publication time of later Task 06G-V; not merged |
| Historical vs current publication | Report originally said commit/push **Not performed** / “FIXED locally (uncommitted)”; that was true when written. The same corrections were later published as `9d57b77` on PR #30 |
| Prior Task 06G-T commit | `9e5eee1236b827e78c59241ecc962facab1efc80` |
| Remaining security / review gates | Independent re-review of post-`9d57b77` findings (wrong-identity ordering, access-only cooldown bearer, recovery wrong-UUID control, provenance); formal approval + required attribution check; AUTH-12 / AUTH-17 / AUTH-22 **BLOCKED**; Production Auth **NO-GO**; merge needs separate owner authorization |
