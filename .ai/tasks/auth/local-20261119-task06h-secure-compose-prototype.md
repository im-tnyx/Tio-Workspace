# Phase 1.2 Task 06H-D — Secure Local Auth Compose Prototype Preparation

| Field | Value |
|---|---|
| Status | **PROTOTYPE PREPARED (OFFLINE VALIDATED)**; Draft PR opened; No Docker startup; production Auth **BLOCKED** |
| Objective | Prepare isolated Compose specification, harness adapter, and offline security test suite based on verified Task 06H-C loopback binding evidence |
| Authorization | Owner's Task 06H-D instruction: local-only file preparation, offline validation, branch & draft PR; no Docker startup, no Auth tests, no volume/daemon modifications |
| Implementation owner | Agent / Codex Implementation, Task 06H slice |
| Baseline commit | `9980dde9978871db113d2a926f192048f04ae2a5` (`main`) |
| Worktree branch | `feat/task06h-secure-compose-prototype` |
| Security Invariants | AUTH-12/17/22 **BLOCKED**; Corrected local Auth integration **NOT RUN**; Managed Auth **NOT VERIFIED**; Production Auth **NO-GO** |

---

## 1. Prototype Summary & Verified Baseline

Following the empirical proof in Task 06H-C that Docker Desktop on Windows respects container-level `127.0.0.1:HOST_PORT:CONTAINER_PORT` bindings without wildcard listener creation, Task 06H-D establishes an isolated, reviewable Compose testbed under `experiments/task06h/`.

Zero Docker containers were started, zero networks or volumes were created, and zero Auth traffic was dispatched during this task.

---

## 2. Component & Image Compatibility Matrix

All images are strictly pinned to cached local digests and versions without `:latest` tags:

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
3. **Mandatory Preflight on Every Execution Path:** `executeAuthIntegrationSuite(local)` enforces preflight isolation validation as a mandatory first step before ANY HTTP request can be constructed or dispatched. Callers cannot bypass preflight. Non-loopback URLs are rejected immediately before network dispatch.
4. **Hardened Preflight & Container Identity:** `validateIsolatedLoopbackStack()` asserts exact container count (rejects extra rogue sidecars), validates the required Compose project label (`com.docker.compose.project`), checks both `HostConfig.PortBindings` and `NetworkSettings.Ports`, forbids host port mappings on `auth` and `db`, and forbids mounting historical Task 06G volumes.
5. **Windows Listener Gate:** Executes `validateWindowsListeners()` via PowerShell `Get-NetTCPConnection` at runtime. Asserts that ports 55621 and 55624 listen strictly on `127.0.0.1`, failing closed if any `0.0.0.0` or `[::]` socket exists.
6. **Accurate Preflight Scope:** Preflight documentation clarified: preflight executes post-startup and prevents running tests on an exposed stack; it does not prevent initial startup exposure. Immediate stack termination is required if a non-loopback port is detected.
7. **Complete Integration Runner Implementation:** All 12 test sequences (Mailpit baseline, OTP format/replay, 3 concurrent pairs, invalid code rejection, 5-wrong lock/cooldown, signup-to-recovery crossing, recovery-to-other-purpose crossings, 60s resend interval / old-code invalidation, and AUTH-17 unrevoked OTP password mutation) are fully implemented in `executeAuthIntegrationSuite(local)`. Live execution remains strictly GATED until Stage C/D startup authorization.

---

## 5. Offline Validation Evidence

* **Docker Compose Config Syntax:** `docker compose --env-file experiments/task06h/.env.example -f experiments/task06h/docker-compose.yml config` parsed with 0 errors.
* **Fail-Closed Verification:** `docker compose -f experiments/task06h/docker-compose.yml config` without environment variables fails closed with required variable errors.
* **Static Security Suite:** `experiments/task06h/compose-security.test.mjs` (6/6 PASS).
* **Preflight & Listener Suite:** `experiments/task06h/loopback-preflight.test.mjs` (10/10 PASS).
* **Adapter Unit Suite:** `experiments/task06h/local-otp-adapter.test.mjs` (6/6 PASS).
* **Assertion Classifier Suite:** `experiments/task06h/assertions.test.mjs` (42/42 PASS).
* **Total Offline Test Suite:** **64 passed, 0 failed (100% pass rate)**.

---

## 6. Integration-Readiness Gap List (Uncertainties Requiring Live Verification)

The following aspects cannot be proven offline and are explicitly marked **NOT VERIFIED** until separately authorized Task 06H-E startup:

1. **Gap 1 (Database Bootstrap):** Whether `supabase/postgres:17.11.0.004` startup triggers GoTrue auto-migrations for `auth` schema roles without Supabase CLI initialization hooks.
2. **Gap 2 (Kong Declarative Proxying):** Live Kong routing of `/auth/v1/health` and `/auth/v1/otp` to GoTrue upstream on the internal bridge network.
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
