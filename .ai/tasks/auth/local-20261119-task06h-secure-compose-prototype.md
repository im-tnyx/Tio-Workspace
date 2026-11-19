# Phase 1.2 Task 06H-D — Secure Local Auth Compose Prototype Preparation

| Field | Value |
|---|---|
| Status | **PROTOTYPE PREPARED (OFFLINE VALIDATED)**; Draft PR opened; No Docker startup; production Auth **BLOCKED** |
| Objective | Prepare isolated Compose specification, harness adapter, and offline security test suite based on verified Task 06H-C loopback binding evidence |
| Authorization | Owner's Task 06H-D instruction: local-only file preparation, offline validation, branch & draft PR; no Docker startup, no Auth tests, no volume/daemon modifications |
| Implementation owner | Agent / Codex Implementation, Task 06H slice |
| Baseline commit | `9980dde9978871db113d2a926f192048f04ae2a5` (`main`) |
| Worktree branch | `feat/task06h-secure-compose-prototype` |
| Verified GitHub HEAD | Reconciled across PR #32 commits up to Task 06H-D-U |
| Security Invariants | AUTH-12/17/22 **BLOCKED**; Corrected local Auth integration **NOT RUN**; Managed Auth **NOT VERIFIED**; Production Auth **NO-GO** |

---

## 1. Prototype Summary & Verified Baseline

Following the empirical proof in Task 06H-C that Docker Desktop on Windows respects container-level `127.0.0.1:HOST_PORT:CONTAINER_PORT` bindings without wildcard listener creation, Task 06H-D establishes an isolated, reviewable Compose testbed under `experiments/task06h/`.

Evidence reconciliation: Git commit SHA reported in previous audit notes was reconciled against the exact GitHub remote HEAD `bcf5bb6b7124d25b432d4b26479429d3b8d21518`.

Zero Docker containers were started, zero networks or volumes were created, and zero Auth traffic was dispatched during this task.

---

## 2. Component & Image Compatibility Matrix

All images are strictly pinned to stable version tags without `:latest` tags (immutable SHA256 digest pinning remains a future hardening gap):

| Service | Container Name | Pinned Image | Host Port Binding | Internal Ports | Role & Configuration |
|---|---|---|---|---|---|
| **Kong Gateway** | `supabase_kong_tio-task06h-local-auth` | `public.ecr.aws/supabase/kong:2.8.1` | `127.0.0.1:55621:8000` | `8000` | Declarative reverse proxy routing `/auth/v1/*` to `http://auth:9999/` via `kong.yml` |
| **GoTrue Auth** | `supabase_auth_tio-task06h-local-auth` | `public.ecr.aws/supabase/gotrue:v2.197.0` | **NONE** (Internal only) | `9999` | Supabase Auth server matching Task 06G version, configured for 6-digit OTP, 600s expiry, 60s frequency |
| **PostgreSQL** | `supabase_db_tio-task06h-local-auth` | `public.ecr.aws/supabase/postgres:17.11.0.004` | **NONE** (Internal only) | `5432` | Postgres 17 with pre-initialized Supabase Auth schemas and roles (`supabase_auth_admin`, etc.) |
| **Mailpit** | `supabase_inbucket_tio-task06h-local-auth` | `public.ecr.aws/supabase/mailpit:v1.31.3` | `127.0.0.1:55624:8025` | `8025` (HTTP), `1025` (SMTP) | Local email capture providing `/api/v1/messages` REST inspection |

---

## 3. Network & Volume Isolation

* **Dedicated Network:** `supabase_network_tio-task06h-local-auth` (driver `bridge`). No attachment to historical Task 06G networks.
* **Dedicated Synthetic Volume:** `supabase_db_tio-task06h-local-auth-data`. Historical Task 06G volumes (`supabase_db_tio-task06g-local-otp`, etc.) remain completely disconnected and intact.
* **Host Binding Model:** Every host port mapping specifies `127.0.0.1:PORT:PORT`. Direct database and Auth ports are not exposed to the host network.

---

## 4. Harness Adaptation & Security Controls

The Task 06H adapter (`experiments/task06h/local-otp-adapter.mjs`) and preflight guards address all compatibility gaps identified in Task 06H-B and Task 06H-D-R:

1. **Mandatory Secrets & Insecure Fallback Elimination:** `docker-compose.yml` strictly enforces required variables (`${POSTGRES_PASSWORD:?}` and `${JWT_SECRET:?}`). Compose fails closed immediately if untracked credentials are not provided via environment or untracked `.env`. Fixed fallbacks have been removed from both Compose and the adapter runtime.
2. **Runtime Secret Validation:** `getRequiredJwtSecret()` strictly mandates an untracked environment secret with a minimum length of 32 characters, failing closed on missing, short, or whitespace-only keys.
3. **Elimination of Runtime Preflight Bypass & Exported Runners:** `executeAuthIntegrationSuite(local)` is the sole exported network-capable runner and unconditionally invokes `assertRuntimeStackIsolation()` without accepting caller-provided bypass arguments or callbacks. The previously exported `_executeAuthIntegrationSuiteInternal` has been removed completely to eliminate any possibility of external callers substituting a passing mock validator. Offline configuration validation is handled by pure `validateLocalStackConfig(local)`. Non-loopback URLs and missing credentials are fail-closed before network dispatch.
4. **Exact Published-Port Inventory & HostConfig Equivalence:** `validateIsolatedLoopbackStack()` and `assertExactPortBinding()` assert exact container count (rejects extra rogue sidecars), validate the required Compose project label (`com.docker.compose.project`), strictly enforce that BOTH `HostConfig.PortBindings` and `NetworkSettings.Ports` exist and contain the exact same mappings:
   - Kong: exactly `8000/tcp -> 127.0.0.1:55621` in both.
   - Mailpit: exactly `8025/tcp -> 127.0.0.1:55624` in both.
   - Rejects missing HostConfig bindings, inconsistent HostConfig vs NetworkSettings mappings, duplicate mappings, unauthorized extra localhost ports, wildcard/IPv6 bindings, and any published host ports on Auth/DB. Forbids mounting historical Task 06G volumes.
5. **Windows Listener Gate:** Executes `validateWindowsListeners()` via PowerShell `Get-NetTCPConnection` at runtime. Asserts that ports 55621 and 55624 listen strictly on `127.0.0.1`, failing closed if any `0.0.0.0` or `[::]` socket exists.
6. **Accurate Preflight Scope:** Preflight documentation clarified: preflight executes post-startup and prevents running tests on an exposed stack; it does not prevent initial startup exposure. Immediate stack termination is required if a non-loopback port is detected.
7. **Complete Integration Runner Implementation, Batch Execution & Quota Management:** All 12 test sequences (Mailpit baseline, OTP format/replay, 3 concurrent pairs, invalid code rejection, 5-wrong lock/cooldown, signup-to-recovery crossing, recovery-to-other-purpose crossings, 60s resend interval / old-code invalidation, and AUTH-17 unrevoked OTP password mutation) are fully implemented in `executeAuthIntegrationSuite(local)`. To address GoTrue's server-wide rate limit of 5 emails per hour, a deterministic batch execution model (`batch-1` through `batch-4`) is implemented with per-batch budgeting (`calculateBatchBudget`). Each executable batch requires <= 4 sends, enabling full multi-window execution of every case without destructive volume resets. In `validateLocalStackConfig`, both `selectedBatch` and custom `selectedCases` are strictly validated (rejecting unknown case IDs and failing closed if a custom selection exceeds 5 sends per hour). In `MAILPIT_BASELINE`, recent message timestamps from Mailpit REST API are synced within the 1-hour sliding window (`windowDurationMs = 3,600,000 ms`), and any rate-limit exhaustion is classified strictly as `INCONCLUSIVE` (via `QuotaExhaustedError`), never `PASS`. Excluded cases in a batch are cleanly marked `SKIPPED` (never `PASS`). Live execution remains strictly GATED until Stage C/D startup authorization.
8. **HTTP Template Serving via Kong & Verified Image Readiness Probe:** Custom templates are served internally over HTTP via Kong using the built-in `request-termination` plugin at `http://kong:8000/templates/*.html`, satisfying GoTrue v2.197.0 HTTP template loader requirements without filesystem volume mounting or extra containers. Route isolation strictly enforces `hosts: ["kong", "kong:8000"]` (validated against Kong 2.8.1 `06-routes_spec.lua`) to prevent host-port exposure via 55621. Forensic image layer analysis of `public.ecr.aws/supabase/kong:2.8.1` confirmed that `curl` was removed during build (`apk del .build-deps`), but `/usr/bin/wget` and `/bin/grep` (from base BusyBox) are permanently available in PATH. The readiness probe uses `wget -q -O - --header='Host: kong:8000' http://127.0.0.1:8000/templates/confirmation.html | grep -q 'verification code' || exit 1` to verify both route reachability and expected body content without missing binaries. `auth` depends on `kong` with `condition: service_healthy`, eliminating the template cache warmup race.
9. **GoTrue Startup Configuration & Subjects Alignment:** `API_EXTERNAL_URL` and `GOTRUE_API_EXTERNAL_URL` are explicitly set to the loopback gateway (`http://127.0.0.1:55621`) in `services.auth.environment`. `GOTRUE_MAILER_SUBJECTS_*` match Task 06G/Task 06H adapter expectations, and adapter subject matchers support both configured and default subjects.
10. **Deterministic Public Entrypoint Testing & Zero Runner Mutation:** Production process execution boundary in `local-otp-adapter.mjs` directly invokes `childProcess.execFileSync` without mutable hooks, setters, or exported internal runners (`executeAuthIntegrationSuite(local)` is the sole entrypoint taking exactly 1 parameter). The test suite deterministically exercises the actual public entrypoint `executeAuthIntegrationSuite(local)` against simulated Docker daemon down, missing CLI (ENOENT), malformed network JSON, wildcard host port binding, and missing Windows listeners, verifying that in every preflight rejection zero HTTP traffic is dispatched (`fetch` called is false).

---

## 5. Offline Validation Evidence

* **Docker Compose Config Syntax:** `docker compose --env-file experiments/task06h/.env.example -f experiments/task06h/docker-compose.yml config` parsed with 0 errors.
* **Fail-Closed Verification:** `docker compose -f experiments/task06h/docker-compose.yml config` without environment variables fails closed with required variable errors.
* **Static Security Suite:** `experiments/task06h/compose-security.test.mjs` (13/13 PASS).
* **Preflight & Listener Suite:** `experiments/task06h/loopback-preflight.test.mjs` (18/18 PASS).
* **Adapter Unit Suite:** `experiments/task06h/local-otp-adapter.test.mjs` (20/20 PASS).
* **Assertion Classifier Suite:** `experiments/task06h/assertions.test.mjs` (42/42 PASS).
* **Total Offline Test Suite:** **93 passed, 0 failed (100% pass rate)**.

---

## 6. Integration-Readiness Gap List (Uncertainties Requiring Live Verification)

The following aspects cannot be proven offline and are explicitly marked **NOT VERIFIED** until separately authorized Task 06H-E startup:

1. **Gap 1 (Database Bootstrap):** Whether `supabase/postgres:17.11.0.004` startup triggers GoTrue auto-migrations for `auth` schema roles without Supabase CLI initialization hooks.
2. **Gap 2 (Kong Declarative Proxying & Template Serving):** Live Kong routing of `/auth/v1/health` and `/auth/v1/otp` to GoTrue upstream, and live HTTP serving of email templates via `request-termination`.
3. **Gap 3 (Mailpit SMTP Relay):** Live SMTP packet delivery from GoTrue to Mailpit on internal port 1025.
4. **Gap 4 (API Key Semantic Evaluation):** Whether Kong/GoTrue strictly evaluates legacy HS256 anon JWT vs modern `sb_publishable_` key format in local standalone mode.
5. **Gap 5 (Live Integration Suite Execution):** Live execution of the 12 implemented security assertions against the running stack.
6. **Gap 6 (Tag Pinning vs Digest Pinning):** Images are version-tag pinned (`v2.197.0`, `17.11.0.004`, `2.8.1`, `v1.31.3`), not immutable SHA256 digest pinned. Local Docker cache matches exact image IDs, but content-addressable digests are not yet enforced.

---

## 7. Retained Security Boundaries

* **AUTH-12** (Atomic Single-Use): **BLOCKED**
* **AUTH-17** (Direct Password Mutation): **BLOCKED**
* **AUTH-22** (Five-Wrong Cooldown): **BLOCKED**
* **Corrected Local Auth Integration:** **NOT RUN** (Stack not started)
* **Managed Supabase Auth:** **NOT VERIFIED**
* **Production Auth:** **NO-GO**
