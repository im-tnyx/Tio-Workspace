# Phase 1.2 Task 06H-E — Controlled Local Auth Runtime Testing & Development Email Quota

| Field | Value |
|---|---|
| Status | **REVIEW CORRECTIONS COMPLETED — APPROVAL PENDING** |
| Objective | Controlled local startup and integration testing of isolated Task 06H Compose prototype; establish Mode A (5/hour security baseline) and Mode B (development quota) |
| Authorization | Owner's Task 06H-E instruction: local-only controlled startup, synthetic OTP integration testing, Mailpit verification, safe shutdown; hosted Supabase project `bsfwzvgynwriswapxpsp` strictly OUT OF SCOPE |
| Implementation owner | Agent / Codex Implementation, Task 06H-E slice |
| Baseline commit | `17964889363ddb96431d758088826136a300c914` (`main`, merged PR #32) |
| Worktree branch | `feat/task06h-e-runtime-integration` |
| Security Invariants | AUTH-12/17/22 **BLOCKED**; Managed Supabase Auth **NOT VERIFIED**; Production Auth **NO-GO**; No real SMTP / external network dispatch |

---

## 1. Execution Overview & Verified Baseline

Following the successful merge of PR #32 (Task 06H-D) at commit `17964889363ddb96431d758088826136a300c914`, Task 06H-E executes owner-authorized local runtime integration testing against the isolated Compose testbed in `experiments/task06h/`.

Two distinct testing modes are established:
1. **Mode A (Security Baseline):** `GOTRUE_RATE_LIMIT_EMAIL_SENT: 5`. Strictly preserves the accepted production security policy. Validated via `batch-1` synthetic tests against local Mailpit.
2. **Mode B (Development Quota):** Controlled, temporary local higher quota allowing full functional testing of all 12 OTP test cases without waiting for 1-hour rate limit reset windows. Never substitutes for baseline evidence.

---

## 2. Infrastructure & Port Mapping Matrix

| Service | Container Name | Image Reference | Host Port | Internal Port | Isolation Contract |
|---|---|---|---|---|---|
| **Kong Gateway** | `supabase_kong_tio-task06h-local-auth` | `public.ecr.aws/supabase/kong:2.8.1` | `127.0.0.1:55621:8000` | `8000` | Strict loopback-only; reverse-proxy `/auth/v1/*` to Auth |
| **GoTrue Auth** | `supabase_auth_tio-task06h-local-auth` | `public.ecr.aws/supabase/gotrue:v2.197.0` | **NONE** | `9999` | Internal bridge network only; no host socket |
| **PostgreSQL** | `supabase_db_tio-task06h-local-auth` | `public.ecr.aws/supabase/postgres:17.11.0.004` | **NONE** | `5432` | Internal bridge network only; no host socket |
| **Mailpit** | `supabase_inbucket_tio-task06h-local-auth` | `public.ecr.aws/supabase/mailpit:v1.31.3` | `127.0.0.1:55624:8025` | `8025` (HTTP), `1025` (SMTP) | Strict loopback-only REST API & SMTP capture |

- **Dedicated Network:** `supabase_network_tio-task06h-local-auth`
- **Dedicated Volume:** `supabase_db_tio-task06h-local-auth-data`

---

## 3. Operational Log & Checkpoints

### Stage 0: Context Synchronization
- Timestamp: 2026-11-19T22:23:00+05:30
- Verified PR #32 merged into `main` at `17964889363ddb96431d758088826136a300c914`.
- Verified local and remote `main` synchronized and clean.
- Created task branch `feat/task06h-e-runtime-integration`.
- Verified Task 06G isolation: historical Task 06G volumes and networks remain untouched.
- Current status: Proceeding to Stage 1.

### Stage 1: Read-only Runtime Readiness Audit
- Timestamp: 2026-11-19T22:25:00+05:30
- Docker Desktop Engine: `29.9.3 (OSType: linux)` on context `desktop-linux` running.
- Existing Containers: 0 running containers; Task 06H containers absent.
- Networks: Historical `supabase_network_tio-task06g-local-otp` untouched; Task 06H network absent.
- Volumes: Historical `supabase_db_tio-task06g-local-otp` untouched; Task 06H volume absent.
- Image Cache Availability (ALL VERIFIED LOCAL):
  - `public.ecr.aws/supabase/postgres:17.11.0.004` (ID `b15d862126dd`)
  - `public.ecr.aws/supabase/mailpit:v1.31.3` (ID `ed9b00c609e7`)
  - `public.ecr.aws/supabase/gotrue:v2.197.0` (ID `1736a63078f5`)
  - `public.ecr.aws/supabase/kong:2.8.1` (ID `1b53405d8680`)
- Host Listeners: Ports `55621` and `55624` free (zero conflicting host sockets).
- Untracked Secrets: Fresh synthetic 32-byte hex `JWT_SECRET` and `POSTGRES_PASSWORD` generated in untracked `experiments/task06h/.env` (gitignored). Zero credentials logged.
- Compose Validation: `docker compose config --quiet` passed with 0 errors.
- Disk Resources: Drive G has 10.70 GB free.
- Audit Verdict: **READINESS AUDIT PASS**. Proceeding to Stage 2 (Controlled Task 06H Startup).

### Stage 2: Controlled Task 06H Startup & Isolation Verification
- Timestamp: 2026-11-19T22:28:00+05:30
- Command: `docker compose --env-file experiments/task06h/.env -f experiments/task06h/docker-compose.yml up -d --pull never`
- Services Started:
  - `supabase_db_tio-task06h-local-auth` (PostgreSQL 17.11.0.004, internal port 5432, 0 host bindings) - HEALTHY
  - `supabase_inbucket_tio-task06h-local-auth` (Mailpit v1.31.3, internal 1025/8025, host 127.0.0.1:55624) - HEALTHY
  - `supabase_kong_tio-task06h-local-auth` (Kong 2.8.1, internal 8000, host 127.0.0.1:55621) - HEALTHY
  - `supabase_auth_tio-task06h-local-auth` (GoTrue v2.197.0, internal 9999, 0 host bindings) - RUNNING
- Empirical Gap Resolution (Gap 1 - DB Bootstrap):
  - On initial database initialization, `supabase_auth_admin` role password required synchronization with `POSTGRES_PASSWORD`.
  - Executed secure role password alignment via `supabase_admin`.
  - GoTrue auto-applied all 75 schema migrations and started successfully on port 9999.
- Preflight Security Verification:
  - Exact container count: exactly 4 containers in project `tio-task06h-local-auth`.
  - `HostConfig.PortBindings` and `NetworkSettings.Ports` match identically for all containers.
  - Windows Listener Inspection: Ports 55621 and 55624 listen exclusively on `127.0.0.1`. Zero `0.0.0.0` or `[::]` listeners exist.
  - Kong Template Readiness: `/templates/confirmation.html` verified healthy.
  - GoTrue Health via Kong: `http://127.0.0.1:55621/auth/v1/health` returned HTTP 200 with GoTrue v2.197.0.
- Preflight Isolation Verdict: **ISOLATION VERIFIED (PASS)**. Stack is secure for Stage 3 testing.

### Stage 3: Mode A Security Baseline (5 Emails/Hour) Integration Results
- Timestamp: 2026-11-19T22:30:00+05:30
- Active Configuration: `GOTRUE_RATE_LIMIT_EMAIL_SENT: 5`, Mailpit local capture on `127.0.0.1:55624`.
- Network Isolation Evidence:
  - Local host sockets confirmed restricted strictly to `127.0.0.1` (Kong `55621`, Mailpit `55624`); zero `0.0.0.0` or `[::]` sockets.
  - All synthetic recipients addressed to RFC 2606 reserved `.invalid` top-level domain (`@example.invalid`), which is inherently non-routable on public networks.
  - All issued OTP emails captured and verified exclusively in local Mailpit REST API (`http://127.0.0.1:55624/api/v1/messages`).
- Batch Executed: `batch-1` (`MAILPIT_BASELINE`, `OTP_FORMAT_REPLAY`, `OTP_CONCURRENT`).
- Observed Results:
  - `MAILPIT_BASELINE`: **PASS** (Mailpit REST API accessible, 0 initial messages, window accounting initialized).
  - `OTP_FORMAT`: **PASS** (6-digit numeric token format verified via Mailpit template capture; raw value redacted).
  - `OTP_REPLAY`: **PASS** (`first_verify=200/none, second_verify=403/otp_expired; first_user_probe=200/none; second_user_probe=not_probed; second_session=false`). Single sequential reuse strictly rejected.
  - `OTP_CONCURRENT_1`: **FAIL** (`verify=200/none,200/none; user_probes=200/none,200/none; valid_responses=2; probes_validated=2; bearers_authenticated=2; session_id_claim_comparison=different`). Both concurrent verify requests succeeded and issued distinct sessions for a single OTP. Reproducible local observation against pinned GoTrue v2.197.0: parallel redemption race condition confirmed.
  - Subsequent sends in the 1-hour window exhausted the remaining 5-send hourly quota:
    - `OTP_CONCURRENT_2`: **INCONCLUSIVE** (`EMAIL_QUOTA_EXHAUSTED`).
    - `OTP_CONCURRENT_3`: **INCONCLUSIVE** (`EMAIL_QUOTA_EXHAUSTED`).
  - Remaining test cases cleanly marked `SKIPPED` per batch isolation contract.
- Security Invariant Status:
  - **AUTH-12 (Atomic Single-Use):** **CONFIRMED BLOCKED (FAIL on concurrent execution)**. Pinned GoTrue v2.197.0 in this Compose configuration does not provide serialized atomic single-use redemption across parallel requests.
  - **AUTH-17 & AUTH-22:** Retained **BLOCKED**.
- Checkpoint: Mode A baseline completed and preserved. Quota exhausted for the 1-hour window. Proceeding to Stage 4 (Higher-Quota Development Mode).

### Stage 4: Higher-Quota Development Mode Configuration
- Timestamp: 2026-11-19T22:31:00+05:30
- Development Profile: Created explicit override `experiments/task06h/docker-compose.dev.yml` setting `GOTRUE_RATE_LIMIT_EMAIL_SENT: 30`.
- Baseline Preservation: Committed `experiments/task06h/docker-compose.yml` remains strictly untouched at `GOTRUE_RATE_LIMIT_EMAIL_SENT: 5`.
- Harness Support: Added optional `devModeEmailQuota` (strictly validated safe integer bounded between 5 and 100) to `validateLocalStackConfig` and `_runAuthIntegrationSuiteInternal`. When omitted, client accounting defaults strictly to the 5-send hourly limit. Explicit invalid values strictly throw validation errors (never silently fall back). In addition, preflight verifies that the running GoTrue container's `GOTRUE_RATE_LIMIT_EMAIL_SENT` matches the effective client quota.
- Regression Coverage: Added unit tests in `local-otp-adapter.test.mjs` and `loopback-preflight.test.mjs` verifying rejection of non-integer, NaN, Infinity, fractional, negative, and out-of-bound values, as well as GoTrue container quota match/mismatch verification; all 107 offline unit and security tests pass.
- Container Update: Recreated `supabase_auth_tio-task06h-local-auth` under dev profile; verified `GOTRUE_RATE_LIMIT_EMAIL_SENT=30` in container environment.
- Isolation Verification: All 4 containers verified; ports 55621 and 55624 verified on `127.0.0.1`.

### Stage 5: Functional OTP Integration Test Results (Mode B)
- Timestamp: 2026-11-19T22:33:00+05:30
- Batches Executed: `batch-2`, `batch-3`, `batch-4`.
- Total Synthetic Emails Captured in Mailpit: 14 messages (all 14 verified captured in local Mailpit at `http://127.0.0.1:55624`; all recipients used RFC 2606 non-routable `@example.invalid` domain; loopback sockets confirmed. Note: network-wide absence of external egress, DNS queries or background traffic is unverified as packet capture / network egress monitoring was not run).
- Case-by-Case Empirical Findings (reproducible observations against pinned GoTrue v2.197.0):
  1. `INVALID_CODE`: **PASS** (`wrong_then_valid=403/otp_expired,200/none`). Invalid OTP is rejected; subsequent valid OTP succeeds.
  2. `FIVE_WRONG_COOLDOWN`: **FAIL** (`wrong=5x 403/otp_expired; correct=200/none; correct_session=true; kind=cooldown_bypass`). Five consecutive invalid OTP attempts do NOT trigger lockout or cooldown; entering the correct code immediately afterwards succeeds.
  3. `COOLDOWN_15_MIN`: **FAIL** (`correct_immediately_after_five=200/none; session=true; kind=cooldown_bypass`). Confirms pinned GoTrue v2.197.0 does not enforce the 15-minute lockout requirement locally.
  4. `SIGNUP_AS_RECOVERY`: **PASS** (`verify=403/otp_expired; session=false`). A signup OTP token cannot be redeemed as `type: 'recovery'`.
  5. `SIGNUP_EXPECTED_EMAIL`: **PASS** (`verify=200/none; same_email=true; same_uuid=true`). Verified identity matches synthetic user.
  6. `RECOVERY_AS_EMAIL`: **FAIL** (`verify=200/none; session=true; purpose_crossover=true`). A recovery OTP CAN be redeemed as `type: 'email'`.
  7. `RECOVERY_AS_SIGNUP`: **PASS** (`verify=403/otp_expired; session=false; recovery_control=200/none`). A recovery OTP cannot be redeemed as `type: 'signup'`.
  8. `RECOVERY_AS_MAGICLINK`: **FAIL** (`verify=200/none; session=true; purpose_crossover=true`). Purpose crossover observed.
  9. `RECOVERY_AS_RECOVERY`: **PASS** (`verify=200/none; session=true; same_uuid=true`). Standard recovery OTP succeeds.
  10. `RESEND_INTERVAL_OBSERVED`: **PASS** (`immediate=429/over_email_send_rate_limit; accepted=200/none; elapsed_bounds=61..62s`). Resending before 60s returns HTTP 429; resend after 60s succeeds.
  11. `EXACT_60_SECOND_BOUNDARY`: **INCONCLUSIVE** (Server-side exact boundary not inferred from client timestamps).
  12. `OLD_CODE_INVALIDATED`: **PASS** (`old_then_new=403/otp_expired,200/none; distinct_codes=true`). When a new OTP is issued, the prior OTP is immediately invalidated.
  13. `AUTH17_OTP_SESSION`: **PASS** (`verify=200/none; same_uuid=true`).
  14. `AUTH17_PASSWORD_MUTATION`: **FAIL** (`pre_grant=200/none; kind=password_mutation_bypass; update=200/none; old_grant=400/invalid_credentials; new_grant=200/none`). An OTP bearer session can directly mutate the user's password via `PUT /user` without supplying the current password.
- Core Security Boundary Status:
  - **AUTH-12 (Atomic Single-Use):** **BLOCKED (FAIL)** — Concurrent parallel redemption issues multiple sessions in pinned GoTrue v2.197.0.
  - **AUTH-17 (Direct Password Mutation):** **BLOCKED (FAIL)** — Password mutation bypass observed.
  - **AUTH-22 (Five-Wrong Cooldown):** **BLOCKED (FAIL)** — Cooldown bypass observed.

### Stage 6: Controlled Shutdown & Restoration
- Timestamp: 2026-11-19T22:34:00+05:30
- Development Override Cleanup: `experiments/task06h/docker-compose.dev.yml` removed. Baseline Compose configuration (`GOTRUE_RATE_LIMIT_EMAIL_SENT: 5`) is 100% restored.
- Container Shutdown: Executed `docker compose --env-file experiments/task06h/.env -f experiments/task06h/docker-compose.yml stop`. All 4 containers (`auth`, `kong`, `inbucket`, `db`) cleanly stopped.
- Host Listener Verification: Executed PowerShell `Get-NetTCPConnection -LocalPort 55621, 55624`. Zero listeners remaining (clean exit).
- Resource Preservation:
  - Zero `-v` flags used. Dedicated volume `supabase_db_tio-task06h-local-auth-data` intact for diagnostic review.
  - Historical Task 06G volumes (`supabase_db_tio-task06g-local-otp`, `supabase_edge_runtime_tio-task06g-local-otp`, `supabase_storage_tio-task06g-local-otp`) and network (`supabase_network_tio-task06g-local-otp`) verified intact and untouched.
- Offline Test Suite Verification: Executed `node --test experiments/task06h/*.test.mjs` -> **115 passed, 0 failed (100% pass rate)**.

### Stage 7: Continuity & Handoff Contract
- Task ID: Task 06H-E
- Active Branch: `feat/task06h-e-runtime-integration`
- Base Commit: `17964889363ddb96431d758088826136a300c914` (`main`)
- Modified Files:
  - `experiments/task06h/local-otp-adapter.mjs` (Added bounded `devModeEmailQuota` validation, `initializeLocalStack` quota forwarding, and preflight server-quota verification)
  - `experiments/task06h/loopback-preflight.mjs` (Added `extractGoTrueEmailQuota` and `validateGoTrueEmailQuota` with fail-closed server quota verification)
  - `experiments/task06h/local-otp-adapter.test.mjs` (Added devModeEmailQuota boundary, `initializeLocalStack`, and server-quota regression tests)
  - `experiments/task06h/loopback-preflight.test.mjs` (Added comprehensive server-quota matching, mismatching, missing, and malformed unit tests)
  - `.ai/tasks/auth/local-20261119-task06h-e-runtime-integration.md` (Canonical execution log)
  - `.ai/current.md` (Updated continuity pointer)
- Stack Status: **STOPPED**
- Host Listeners: **NONE (Ports 55621 and 55624 free)**
- Security Gate Invariants:
  - **AUTH-12 (Atomic Single-Use):** **BLOCKED**
  - **AUTH-17 (Direct Password Mutation):** **BLOCKED**
  - **AUTH-22 (Five-Wrong Cooldown):** **BLOCKED**
  - **Managed Supabase Auth:** **NOT VERIFIED**
  - **Production Auth:** **NO-GO**
- Explicitly Prohibited Actions for Next Agent:
  - Do not start Docker stack without re-executing preflight.
  - Do not dispatch real SMTP emails or use external email providers.
  - Do not enable production Auth.
  - Do not modify or prune historical Task 06G resources.
