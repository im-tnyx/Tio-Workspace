# Phase 1.2 Task 06G — Local Auth Security Evidence & Review Hardening

| Field | Value |
|---|---|
| Status | **MERGED / EVIDENCE PRESERVED**; production Auth remains **NO-GO / BLOCKED** |
| Objective | Preserve local-only GoTrue Auth security evidence, fail-closed classification logic, loopback preflight, and review-driven evidence hardening through Task 06G-AB |
| Scope | `experiments/task06g/` harness, offline assertion tests, `.ai/tasks/auth/` reports; no app code or production Auth |
| Merged PR | [PR #30](https://github.com/im-tnyx/Tio-Workspace/pull/30) |
| Merge commit SHA | `35468b7dd4ae1618af3a45091e20bd0e7dda05d5` |
| Merge date | 2026-11-18 |
| Review & checks | Formal independent **APPROVED** review by `im-tio` (`PRR_kwDOVtCmZc8AAAABY0ydFw`); all 26 review threads resolved; 6/6 GitHub checks PASS including required App-owned `Commit attribution guard` (App ID `5032971`) |
| Offline test evidence | `node --test experiments/task06g/*.test.mjs` — **48/48 PASS** (0 failed) |

## Merged Scope & Artifacts

- **Harness & classifiers:** `experiments/task06g/assertions.mjs` and `experiments/task06g/local-otp.mjs` — fail-closed evaluation for replay, concurrency, wrong-purpose crossing, 5-wrong cooldown, and AUTH-17 password mutation bypass.
- **Loopback preflight:** `experiments/task06g/loopback-preflight.mjs` — whole-project container inspection refusing execution when any project container binds to non-loopback interfaces (`UNSAFE_PUBLISHED_PORT`).
- **Offline unit tests:** `experiments/task06g/assertions.test.mjs` (42 tests) and `experiments/task06g/loopback-preflight.test.mjs` (6 tests). Total: **48/48 PASS**.
- **Local Supabase configuration:** `experiments/task06g/supabase/config.toml` (pinned ports, templates).
- **Task reports preserved:** 12 task reports documenting progression from local single-use tests through review hardening and recovery controls:
  - `local-20261117-task06g-local-otp-single-use.md`
  - `local-20261117-task06g-n-evidence-hardening.md`
  - `local-20261117-task06g-p-evidence-integrity-corrections.md`
  - `local-20261118-task06g-t-purpose-crossing-classification.md`
  - `local-20261118-task06g-u-cooldown-identity-and-recovery-control.md`
  - `local-20261118-task06g-v-security-review-remediation.md`
  - `local-20261118-task06g-w-security-evidence-remediation.md`
  - `local-20261118-task06g-x-otp-replay-bearer-proof.md`
  - `local-20261118-task06g-y-auth17-baseline-identity.md`
  - `local-20261118-task06g-z-auth17-post-grant-otp-identity.md`
  - `local-20261118-task06g-aa-auth17-decisive-mutation-rows.md`
  - `local-20261118-task06g-ab-recovery-positive-control.md`

## Docker Operational History & Startup Limitation

1. **Operational containment (prior exposure):** Tio-World and five orphan PostgreSQL containers were stopped under owner-approved actions A1/A2. The owner verified that previous exposed host listeners disappeared while volumes were preserved.
2. **Controlled startup failure:** An attempt to enforce loopback-only binding via a dedicated Docker network configured with `com.docker.network.bridge.host_binding_ipv4=127.0.0.1` and IPv6 disabled did **not** prevent the pinned Supabase CLI / Docker Desktop environment from publishing Task 06G ports on `0.0.0.0` and `::`. The network workaround **failed**.
3. **Post-failure containment:** The unsafe Task 06G stack was stopped, and the owner verified no remaining host listeners on those ports.
4. **Harness enforcement:** Preflight rejects non-loopback bindings with `UNSAFE_PUBLISHED_PORT`. Local integration was **NOT RUN**.
5. **Disposition:** Per owner policy decision (comment `4617447744`), source-level permanent loopback startup remediation is **deferred** to a separate proposed research task. Closing the PR review thread reflects scope containment for this documentation PR, **not** proof of loopback-safe startup.

## Retained Security Gates

Merging PR #30 does **not** authorize production Auth, hosted Supabase modifications, Brevo configuration, or Edge Function deployment.

| Security Gate | Status | Detail |
|---|---|---|
| **AUTH-12** (Concurrency / Replay Single-Use) | **BLOCKED** | Historical 7/9 dual-redemption failures remain unmitigated on native GoTrue |
| **AUTH-17** (Direct Password Mutation) | **BLOCKED** | Direct password change without current password check remains unmitigated on native GoTrue |
| **AUTH-22** (Five-Wrong Cooldown) | **BLOCKED** | Cooldown enforcement bypass remains unmitigated on native GoTrue |
| **Corrected Docker/Auth integration** | **NOT RUN** | Safe loopback-only container startup not yet established on Windows/Docker Desktop |
| **Managed Supabase Auth** | **NOT VERIFIED** | Managed-boundary proof on a disposable project awaiting separate owner authorization |
| **Production Auth** | **NO-GO** | No production Auth implementation owner assigned; gates remain closed |

## Recommended Next Tasks

1. **Proposed Docker Loopback Research:** Investigate an effective loopback-only startup method for Supabase CLI v2.121.0 on Docker Desktop for Windows without altering global daemon settings.
2. **Proposed Managed-Hosted Auth Proof:** If authorized by the owner, perform a bounded disposable-project investigation to determine whether Supabase managed Auth (with server-side Edge Functions / Admin API) securely enforces AUTH-12, AUTH-17, and AUTH-22.

---

[← Archive guide](../README.md) · [Current context](../../current.md) · [Root contract](../../../AGENTS.md)
