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

The Task 06H adapter (`experiments/task06h/local-otp-adapter.mjs`) addresses all compatibility gaps identified in Task 06H-B:

1. **Independent Credential Management:** Does not invoke `supabase status`. Derives cryptographically valid local HMAC-SHA256 JWT tokens from the stack's local test secret for `service_role` and `publishable` roles.
2. **Windows Listener Gate:** Executes `validateWindowsListeners()` via PowerShell `Get-NetTCPConnection` at runtime. Asserts that ports 55621 and 55624 listen strictly on `127.0.0.1`, failing closed if any `0.0.0.0` or `[::]` socket exists.
3. **Container Metadata Inspection:** Runs `validateIsolatedLoopbackStack()` to inspect `NetworkSettings.Ports` on all running project containers before any HTTP traffic is permitted.
4. **Preserved Security Classifiers:** Inherits all fail-closed assertion logic from Task 06G (`assertions.mjs`).

---

## 5. Offline Validation Evidence

* **Docker Compose Config Syntax:** `docker compose -f experiments/task06h/docker-compose.yml config` parsed with 0 errors.
* **Static Security Suite:** `experiments/task06h/compose-security.test.mjs` (5/5 PASS).
* **Preflight & Listener Suite:** `experiments/task06h/loopback-preflight.test.mjs` (7/7 PASS).
* **Adapter Unit Suite:** `experiments/task06h/local-otp-adapter.test.mjs` (3/3 PASS).
* **Assertion Classifier Suite:** `experiments/task06h/assertions.test.mjs` (42/42 PASS).
* **Total Offline Test Suite:** **57 passed, 0 failed (100% pass rate)**.

---

## 6. Retained Security Boundaries

* **AUTH-12** (Atomic Single-Use): **BLOCKED**
* **AUTH-17** (Direct Password Mutation): **BLOCKED**
* **AUTH-22** (Five-Wrong Cooldown): **BLOCKED**
* **Corrected Local Auth Integration:** **NOT RUN** (Stack not started)
* **Managed Supabase Auth:** **NOT VERIFIED**
* **Production Auth:** **NO-GO**
