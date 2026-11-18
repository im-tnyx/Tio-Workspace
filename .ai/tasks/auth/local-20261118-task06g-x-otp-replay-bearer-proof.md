# Task 06G-X — OTP replay bearer proof remediation

| Field | Value |
|---|---|
| Status | Ready for Review (published to PR #30; threads left for independent confirmation) |
| Date | 2026-11-18 |
| PR | [#30](https://github.com/im-tnyx/Tio-Workspace/pull/30) branch `docs/task06g-local-auth-evidence` |
| Baseline HEAD | `c59c06a60af46581dca7e1cc60f559fc9decc702` |
| Review finding | Comment `4609996529` (im-tio): `classifyReplay` lacked second `/user` probe |
| Implementation owner | Cursor agent (Task 06G-X) |
| Previous agent | Task 06G-W publisher at `c59c06a` |
| Scope | Replay classifier + harness second probe + offline regressions only |
| Product gate | AUTH-12 / AUTH-17 / AUTH-22 **BLOCKED**; managed-hosted Auth **NOT VERIFIED**; Production Auth **NO-GO** |

## Defect

`classifyReplay(first, second, id, email, firstProbe)` inspected the second `/verify` without a bearer probe. The `OTP_REPLAY` harness only called `probeUser(first)`. An access-only second `200` with a successful matching `GET /user` was reported `INCONCLUSIVE` instead of single-use `FAIL`.

## Fix

| File | Change |
|---|---|
| `assertions.mjs` | Optional `secondProbe`; matching authenticated second bearer → `FAIL` (refresh optional); wrong UUID via `inspectSession`; PASS still requires first `probeValidated` + `sessionId` + recognized rejection |
| `local-otp.mjs` | Probe second verify independently; pass both probes into `classifyReplay` |
| `assertions.test.mjs` | Focused replay bearer matrix for review `4609996529` |

## Preserved gates

- Docker / corrected GoTrue integration: **NOT RUN**
- Review `4609372956` unsafe LAN exposure: still **BLOCKED — OWNER DECISION REQUIRED** (not claimed fixed)
- Historical local GoTrue findings unchanged

## Thread policy

Evidence reply may be posted. Do not auto-resolve. Formal approval and merge remain separate owner actions.
