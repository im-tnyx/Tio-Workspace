# Task 06G-W — PR #30 security evidence remediation and publication

| Field | Value |
|---|---|
| Status | Ready for Review (published to PR #30; threads left for independent confirmation) |
| Date | 2026-11-18 |
| PR | [#30](https://github.com/im-tnyx/Tio-Workspace/pull/30) branch `docs/task06g-local-auth-evidence` |
| Baseline HEAD | `5d2387a909bad4b5198ab075879004ccdd225c97` |
| Implementation owner | Cursor agent (Task 06G-W) |
| Previous agent | Task 06G-V publisher at `5d2387a` |
| Scope | Classifier/harness/preflight diagnostics + offline regressions only |
| Product gate | AUTH-12 / AUTH-17 / AUTH-22 **BLOCKED**; managed-hosted Auth **NOT VERIFIED**; Production Auth **NO-GO** |

## Findings

| Comment ID | Finding | Disposition |
|---|---|---|
| 4609380598 | Concurrent dual bearer (access-only) reported INCONCLUSIVE | **FIXED** in classifier: `bearersAuthenticated === 2` → FAIL |
| 4609372937 | Wrong-code access-only tokens not probed | **FIXED**: harness probes each wrong attempt; classifier maps `wrongProbes` 1:1 |
| 4609372951 | Wrong-UUID password grant → INCONCLUSIVE | **FIXED**: `completeAuthForOtherUuid` → FAIL before mutation short-circuits |
| 4609372956 | Stop unsafe Docker stack on preflight reject | **NOT FIXED as container remediation** — see Docker disposition |

## Docker exposure disposition (4609372956)

1. **Harness ownership:** `local-otp.mjs` does **not** start Docker/Supabase containers. It only runs pinned `supabase status` + `docker network/inspect` against an already-running project and refuses Auth requests when preflight fails.
2. **Startup/shutdown owner:** Outside this harness (operator / Supabase CLI). The harness must not stop, reset, delete, or recreate containers it did not start.
3. **Before Auth requests:** Required containers + published ports are validated via `validateIsolatedLoopbackStack`; unsafe stacks never enter integration cases (`local` unset → cases skipped).
4. **Diagnostic:** Unsafe published ports now record `LOCAL_INTEGRATION=NOT TESTED` with `UNSAFE_PUBLISHED_PORT` + **OWNER DECISION REQUIRED** wording (never a security PASS).
5. **Loopback-before-startup guarantee:** `supabase/config.toml` does not by itself force Docker host binds to `127.0.0.1`. Enforcing loopback-only binding at daemon/compose startup, or stopping an already-exposed owner-managed stack, is **BLOCKED — OWNER DECISION REQUIRED**.
6. **Distinction:** Experiment isolation (refuse to run) ≠ remediation of an existing LAN exposure.

Docker Auth integration remains **NOT RUN** under this task.

## Changed files

- `experiments/task06g/assertions.mjs`
- `experiments/task06g/assertions.test.mjs`
- `experiments/task06g/local-otp.mjs`
- `experiments/task06g/loopback-preflight.mjs`
- `experiments/task06g/loopback-preflight.test.mjs`
- `.ai/tasks/auth/local-20261118-task06g-w-security-evidence-remediation.md`

## Validation

Recorded at publish time in the final Task 06G-W report. Historical Task 06G-L/N/P/T/U/V reports were not rewritten.

## Thread policy

Evidence replies may be posted. Threads are **not** auto-resolved. Formal GitHub approval and merge remain separate owner actions.
