# Task 06G-Y — AUTH-17 baseline identity evidence fix

| Field | Value |
|---|---|
| Status | Ready for Review (published to PR #30; threads left for independent confirmation) |
| Date | 2026-11-18 |
| PR | [#30](https://github.com/im-tnyx/Tio-Workspace/pull/30) branch `docs/task06g-local-auth-evidence` |
| Baseline HEAD | `778680db10cd823e50a3bb1194a1037e36f676bb` |
| Review finding | Comment `4610490579` (im-tio): baseline cross-identity password grant/probe suppressed as INCONCLUSIVE |
| Implementation owner | Cursor agent (Task 06G-Y) |
| Previous agent | Task 06G-X publisher at `778680d` |
| Scope | AUTH-17 classifier/harness baseline identity only |
| Product gate | AUTH-12 / AUTH-17 / AUTH-22 **BLOCKED**; managed-hosted Auth **NOT VERIFIED**; Production Auth **NO-GO** |

## Defect

Harness `beforeControl` false-path returned `AUTH17_PASSWORD_MUTATION=INCONCLUSIVE` without calling `classifyPasswordMutation` when baseline login authenticated a different UUID (grant body and/or `GET /user`). The classifier also did not fail closed on `beforeGrant`/`beforeProbe` identity mismatches.

## Fix

| File | Change |
|---|---|
| `assertions.mjs` | `classifyPasswordMutation` returns `{ result, kind }`; baseline `identity_violation` before control short-circuit; kinds distinguish identity / mutation bypass / current-password enforced / inconclusive / transport |
| `local-otp.mjs` | Classify baseline identity first; stop destructive mutation when `identity_violation` or transport ERROR |
| `assertions.test.mjs` | Defect reproduction + baseline identity matrix; existing PASS/bypass assertions updated to `.result`/`.kind` |

## Preserved gates

- Docker Auth integration: **NOT RUN**
- Review `4609372956` unsafe LAN exposure: still **BLOCKED — OWNER DECISION REQUIRED**
- Historical GoTrue AUTH-17 FAIL evidence unchanged; this task improves classification only

## Thread policy

Reply to `4610490579` with fixing SHA. Do not auto-resolve. Merge requires separate owner authorization.
