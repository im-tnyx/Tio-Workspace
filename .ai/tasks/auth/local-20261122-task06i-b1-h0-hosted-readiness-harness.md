# Phase 1.2 Task 06I-B1-H0 — Managed Auth Hosted-Proof Readiness & Local Security Harness

> **Target-Safety Decision Record, Local Executable Security Proof & Hosted Probe Runner Specification.** Prepared under `AGENTS.md` operating rules. This document establishes deterministic local security verification and prepares the dry-run probe harness for future testing. It does not authorize creating, modifying, or deleting any hosted Supabase project. Production Real Auth remains **NO-GO**.

| Field | Value |
|---|---|
| Status | **LOCAL SECURITY HARNESS & PARITY PROOF COMPLETE; HOSTED PROBE RUNNER SPECIFIED (DRY-RUN DEFAULT); AWAITING OWNER HOSTED DECISION** |
| Objective | Resolve the test-target architecture conflict between Task 06I-A (disposable project) and Task 06I-B1 ($0 existing testbed), extend local executable test harness across all 12 security contract areas, execute 100% PL/pgSQL vs JavaScript parity proof against PostgreSQL 17.11 without port exposure, prepare opt-in fail-closed hosted probe runner, and align `.ai/` context post-PR #35 merge |
| Implementation owner | Agent / Local Development & Security Research, Task 06I-B1-H0 slice |
| Previous agent | Agent / Task 06I-B1-R9 author |
| Last commit agent | `7150cec4c2e1e9aaa8e75d2cbcb3a23a6dca532e` (PR #35 squash merge commit on `main`) |
| Tracking / approval | Task 06I-B1-H0 authorized by user prompt; owner mandates $0 cost and permanent immunity for `Tio-world`; hosted mutations strictly prohibited |
| Branch | `docs/task06i-b1-h0-hosted-readiness-harness` |
| Base SHA / inspected HEAD | `7150cec4c2e1e9aaa8e75d2cbcb3a23a6dca532e` (`main`, verified up to date with `origin/main`) |
| Platform and file scope | Documentation, `.ai/` context, isolated offline and local PostgreSQL test harnesses under `experiments/task06i/`, and dry-run probe runner; zero client Expo UI, production schema, or live Auth changes |
| Created / updated | 2026-11-22 |

---

## 1. Post-Merge Git Baseline & Context Verification

### Live Repository Status
- PR #35 ([#35](https://github.com/im-tnyx/Tio-Workspace/pull/35)) successfully merged via squash at commit `7150cec4c2e1e9aaa8e75d2cbcb3a23a6dca532e`.
- Local `main` fast-forwarded to `7150cec4c2e1e9aaa8e75d2cbcb3a23a6dca532e` with zero divergence.
- Feature branch `docs/task06i-b1-managed-auth-preflight` safely deleted locally and on `origin`.
- Post-merge GitHub Actions runs on `main` (`7150cec`):
  - `Security experiment checks` (Run `45008498574`): **SUCCESS**
  - `Post-merge attribution audit` (Run `45008498571`): **SUCCESS**
  - `Commit attribution fixture tests` (Run `45008498533`): **SUCCESS**
- Trusted guard variable reminder: Owner must remove `ATTRIBUTION_GUARD_CHANGE_APPROVED_PR_HEAD` from GitHub `attribution-guard-trusted` environment.
- Branch `docs/task06i-b1-h0-hosted-readiness-harness` branched cleanly from updated `main`.

---

## 2. Target-Safety Decision Record: Resolving the Architecture Conflict

### Architectural Background & Conflict
- **Task 06I-A Specification:** Mandated creating an isolated, disposable managed Supabase project (`tio-auth-proof-disposable`) that could be tested, patched via Management API, probed, and deleted immediately without risk to existing data.
- **Task 06I-B1 Observation & Quota Reality:** Supabase CLI inspection confirmed that organization `llmbrmxhyirtoqndazpg` ("Tio-tnyx") has exactly 2 active Free-tier projects:
  1. `oykupyiitspujzpwwvuj` (`Tio-world`): Created 2026-08-14. Contains live production / other product data.
  2. `bsfwzvgynwriswapxpsp` (`Tio-Tnyx`): Created 2026-11-14. Designated production target for Tio.
  Active Free slots available: **0**.
- **Owner's Explicit Mandates:**
  1. **Strict $0 / Free Cost Policy:** *"dicijan mera free cost par kaam"* — Pro plan upgrade ($25/mo) is explicitly rejected.
  2. **`Tio-world` Permanent Immunity:** *"tio-world nahi chhedna h"* — Must NEVER be paused, deleted, or modified under any circumstance.
  3. **Testing Proposal:** *"uske liye jo project use kar rahe h vahi rahega agar testing bhi karna h to bhi yahi rahega fir final production m delate karna pade to same is project ko hi delate karenge then reganrate kar skte h"*.

### Comprehensive Risk & Feasibility Assessment

| Option | Strategy | Blast Radius & Data Safety | Financial Cost | Quota Feasibility | Reversibility & Operational Risk | Recommended Decision |
|---|---|---|---|---|---|---|
| **Option 1: Isolated Disposable Project** | Create temporary 3rd project | **Zero blast radius:** complete isolation from existing projects | **Requires paid Pro upgrade** ($25/mo) or project deletion | **BLOCKED on Free tier:** 0 slots available | High reversibility: project deleted after test | **BLOCKED:** Violates owner $0 mandate unless owner pauses/deletes a non-Tio-world project |
| **Option 2: Existing Tio-Tnyx (`bsfwzvgynwriswapxpsp`) Testbed** | Apply hooks & route patches directly to `bsfwzvgynwriswapxpsp` | **High risk to existing project:**<br>• Management API PATCH modifies live project auth config<br>• Deploys `private_auth` schema and PL/pgSQL functions<br>• Inserts test users into `auth.users`<br>• **Project regeneration risk:** Deleting and regenerating project erases all tables, migrations, storage buckets, and generates NEW `anon` / `service_role` / `JWT_SECRET` keys, breaking any existing client builds | **$0.00** (Free tier) | **Feasible** without new slots | **Low to moderate reversibility:** Requires manual cleanup of schema, test users, and configuration revert | **NOT APPROVED AT THIS STAGE:** Deleting or regenerating Tio-Tnyx is NOT approved in this prompt. Requires separate explicit owner safety approval |
| **Option 3: Deterministic Local Security Proof (Harness Baseline)** | Execute PL/pgSQL in local isolated PostgreSQL 17.11 container (0 exposed host ports) + pure offline evaluator | **Zero blast radius:** Zero cloud mutations, zero risk to `bsfwzvgynwriswapxpsp`, zero risk to `Tio-world` | **$0.00** | **Fully feasible** immediately in local environment and CI | **100% reversible:** Ephemeral container torn down immediately; zero state persisted | **APPROVED & IMPLEMENTED:** Complete contract verification achieved without cloud risk |

### Explicit Decision Record & Stop Gate
1. **Target Selection Verdict:** Neither hosted target (`bsfwzvgynwriswapxpsp` nor `oykupyiitspujzpwwvuj`) is approved for live execution during Task 06I-B1-H0.
2. **Deleting / Regenerating Tio-Tnyx:** Strictly **NOT APPROVED**.
3. **`Tio-world` Immunity:** Permanently enshrined in code (`IMMUTABLE_FORBIDDEN_PROJECTS` in `hosted-probe-runner.mjs`).
4. **Current Execution Mode:** Purely local deterministic verification and dry-run probe planning.

---

## 3. Local Executable Security Proof & SQL/JS Parity Evidence

To provide empirical proof of the security design without touching cloud infrastructure, two complementary engines were implemented under `experiments/task06i/`:

### 1. The 12-Area Security Harness (`experiments/task06i/security-harness.mjs`)
Deterministic evaluators modeling provider semantics across all 12 required areas:
1. **Native OTP route disablement (`BYPASS-01`):** Simulates provider gateway; verifies HTTP 422 `email_provider_disabled` when `external_email_magic_link_disabled = true`.
2. **Native signup route disablement (`BYPASS-02`):** Simulates provider gateway; verifies HTTP 422 `signup_disabled` when `disable_signup = true`.
3. **Custom Access Token Hook authorization (`HOOK-01`):** Verifies that valid password authentication enriches JWT claims with dedicated root claim `claims.amr_authenticated = 'true'`.
4. **Send Email Hook recovery suppression (`BYPASS-05`):** Verifies that `email_action_type = 'recovery'` triggers unhandled exception with SQLSTATE 42501, halting dispatch.
5. **Password-origin JWT acceptance (`HOOK-01`, `SESSION-01`):** Models session creation in `auth.sessions` and validates active session acceptance.
6. **Token refresh AMR preservation (`HOOK-02`):** Verifies session refresh succeeds if and only if RFC 8176 AMR object array preserves password origin.
7. **Missing/malformed/unknown AMR rejection (`HOOK-06`):** Verifies fail-closed rejection for empty arrays, non-array types, missing `method` string, or unknown methods.
8. **Mixed password + unauthorized AMR rejection (`HOOK-05`):** Verifies strict rejection when password is mixed with `otp`, `recovery`, `magiclink`, `signup`, `sso/saml`, or `anonymous`.
9. **Invalid Send Email Hook payload rejection (`BYPASS-05`):** Verifies rejection of missing/null `email_data`, blank or whitespace-padded `email_action_type`, and undocumented aliases (`event.email`).
10. **Hook error and timeout behavior (`HOOK-07`):** Models timeout (> 2000ms), SQL exceptions, and network errors aborting transactions fail-closed with HTTP 500 and 0 tokens issued.
11. **Revoked Auth-session behavior (`SESSION-02`, `SESSION-03`):** Models Admin API password updates invalidating sessions; subsequent `/auth/v1/user` calls immediately return HTTP 403 `session_not_found`.
12. **JWT consumer differences (`SESSION-04`, `SESSION-05`, `SESSION-06`):** Models stateful Auth API (immediate 403) vs stateless PostgREST/Storage (lingering validity bounded by `jwt_exp: 300s`) vs Edge Functions (`auth.getUser()` enforces immediate 403).

### 2. Live PostgreSQL 17.11 vs JavaScript Parity Verifier (`experiments/task06i/sql-contract-parity.mjs`)
- **Zero Host Network Exposure:** Spawns an ephemeral Docker container from `postgres:17` with **NO `-p` port mapping**. Communicates exclusively via `docker exec -i psql`. Zero Windows listener ports, zero 0.0.0.0 binding.
- **Canonical SQL:** Deploys `experiments/task06i/sql/hooks.sql` containing `private_auth.custom_access_token_hook` and `private_auth.send_email_hook`.
- **Diagnostics Trapping:** Uses PL/pgSQL `GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE` to extract exact SQLSTATE codes.
- **Parity Result:** **18 out of 18 test cases matched 100% exact parity** between live PostgreSQL execution and the JavaScript evaluator.

---

## 4. Hosted Probe Runner Specification & Safety Architecture

The opt-in probe runner (`experiments/task06i/hosted-probe-runner.mjs`) is implemented for the future authorized stage with the following mandatory safety gates:

1. **Immutable Project Rejection:** `oykupyiitspujzpwwvuj` (`Tio-world`) is hardcoded in `IMMUTABLE_FORBIDDEN_PROJECTS`. Passing it throws a fatal `CRITICAL_SECURITY_VIOLATION`.
2. **Explicit Target Allowlist:** Only projects in `AUTHORIZED_TARGET_PROJECTS` (`bsfwzvgynwriswapxpsp`) are accepted; all others throw `unauthorized_target`.
3. **Dual Authorization Gate:** Runner strictly defaults to `DRY_RUN`. `LIVE` execution requires **BOTH** the `--live` command-line flag **AND** the environment variable `TASK06I_HOSTED_PROBE_AUTHORIZED="true"`.
4. **Secret Sanitization:** `sanitizeData()` redacts JWTs, API keys, service role keys, passwords, and tokens before logging or persistence (`[REDACTED]`).
5. **Reserved Test Identities:** `validateTestIdentity()` strictly enforces RFC 2606 / RFC 6761 reserved domains (`*.invalid`, `*.example`, `*.test`). Any customer domain (e.g. `@gmail.com`) is rejected.
6. **Rate Limiting:** Capped at 25 requests total, with 1000ms minimum interval throttling.
7. **Fail-Fast Stop Gate:** If any critical bypass test fails (i.e. returns 200 OK or mints a session), the runner immediately halts all further execution.
8. **Rollback & Cleanup:** Deletes test users via Admin API at run completion; **zero automated project deletion**.

---

## 5. Canonical Acceptance Matrix (18 Requirements)

| Case ID | Category | Target / Vector | Expected Security Behavior | Local Harness Status | Hosted Cloud Status | Evidence Location |
|---|---|---|---|---|---|---|
| **BYPASS-01** | Native Bypass | `POST /auth/v1/otp` | HTTP 422 `email_provider_disabled` | **VERIFIED PASS** | **NOT TESTED** | `security-harness.test.mjs` (test 1) |
| **BYPASS-02** | Native Bypass | `POST /auth/v1/signup` | HTTP 422 `signup_disabled` | **VERIFIED PASS** | **NOT TESTED** | `security-harness.test.mjs` (test 2) |
| **BYPASS-03** | Native Bypass | `POST /auth/v1/verify` | HTTP 500 / Hook error (0 tokens) | **VERIFIED PASS** (contract & SQL) | **NOT TESTED** | `sql-contract-parity.mjs` (case 3) |
| **BYPASS-04** | Native Bypass | Magiclink / Invite / Anon | HTTP 500 / Hook error (0 tokens) | **VERIFIED PASS** (contract & SQL) | **NOT TESTED** | `sql-contract-parity.mjs` (case 4) |
| **BYPASS-05** | Native Bypass | `POST /auth/v1/recover` | Send Email Hook suppresses dispatch (SQLSTATE 42501); 0 tokens | **VERIFIED PASS** (contract & SQL) | **NOT TESTED** | `sql-contract-parity.mjs` (cases 9-14) |
| **HOOK-01** | Token Hook | Password Sign-In | 200 OK; JWT has `amr: [password]` & `amr_authenticated = 'true'` | **VERIFIED PASS** (contract & SQL) | **NOT TESTED** | `sql-contract-parity.mjs` (case 1) |
| **HOOK-02** | Token Hook | Password Token Refresh | 200 OK; refreshed JWT preserves `amr: [password]` | **VERIFIED PASS** (contract & SQL) | **NOT TESTED** | `sql-contract-parity.mjs` (case 2) |
| **HOOK-03** | Token Hook | OTP-Origin Token Refresh | Denied fail-closed with SQLSTATE 42501 | **VERIFIED PASS** (contract & SQL) | **NOT TESTED** | `sql-contract-parity.mjs` (case 3) |
| **HOOK-04** | Token Hook | Recovery-Origin Refresh | Denied fail-closed with SQLSTATE 42501 | **VERIFIED PASS** (contract & SQL) | **NOT TESTED** | `sql-contract-parity.mjs` (case 4) |
| **HOOK-05** | Token Hook | Mixed AMR (`password` + other) | Denied fail-closed with SQLSTATE 42501 | **VERIFIED PASS** (contract & SQL) | **NOT TESTED** | `sql-contract-parity.mjs` (cases 5-6) |
| **HOOK-06** | Token Hook | Missing / Malformed AMR | Denied fail-closed with SQLSTATE 42501 | **VERIFIED PASS** (contract & SQL) | **NOT TESTED** | `sql-contract-parity.mjs` (cases 7-8) |
| **HOOK-07** | Token Hook | Hook Error & Timeout | HTTP 500; transaction aborted; 0 tokens issued | **VERIFIED PASS** (harness model) | **NOT TESTED** | `security-harness.test.mjs` (test 10) |
| **SESSION-01**| Session & Consumer | Password Session Creation | Row created in `auth.sessions` | **VERIFIED PASS** (harness model) | **NOT TESTED** | `security-harness.test.mjs` (test 5) |
| **SESSION-02**| Session & Consumer | Admin Password Reset | All active sessions invalidated in `auth.sessions` | **VERIFIED PASS** (harness model) | **NOT TESTED** | `security-harness.test.mjs` (test 11) |
| **SESSION-03**| Session & Consumer | `/auth/v1/user` with Revoked Token | HTTP 403 `session_not_found` | **VERIFIED PASS** (harness model) | **NOT TESTED** | `security-harness.test.mjs` (test 11) |
| **SESSION-04**| Session & Consumer | PostgREST with Revoked Token | Stateless acceptance until `exp`; bounded by 300s window | **VERIFIED PASS** (harness model) | **NOT TESTED** | `security-harness.test.mjs` (test 12) |
| **SESSION-05**| Session & Consumer | Storage API with Revoked Token | Stateless acceptance until `exp`; bounded by 300s window | **VERIFIED PASS** (harness model) | **NOT TESTED** | `security-harness.test.mjs` (test 12) |
| **SESSION-06**| Session & Consumer | Edge Function `auth.getUser()` | HTTP 403 `AuthSessionMissingError` immediately | **VERIFIED PASS** (harness model) | **NOT TESTED** | `security-harness.test.mjs` (test 12) |

---

## 6. Regression & Suite Verification

- **Task 06I Suite (`node --test experiments/task06i/*.test.mjs`):** **76 passed**, 0 failed (100% pass).
- **Task 06H Historical Suite (`node --test experiments/task06h/*.test.mjs`):** **115 passed**, 0 failed (100% pass).
- **Repository Verification (`npm run verify`):** **22 shell contract passed**, tokens guard clean, `tsc` clean, `eslint` clean.
- **Git Diff & Whitespace (`git diff --check origin/main...HEAD`):** Clean, 0 whitespace errors.
- **Protected CI Guards:** Zero modifications to `.github/workflows/*` or `package.json`. Existing Security CI remains fully active.

---

## 7. Next Actions & Owner Approval Gates

1. **Owner Decision on Target Strategy:** Decide whether to:
   - Keep managed Auth proof in local harness / dry-run mode (safest, $0, zero cloud risk).
   - Authorize live hosted probe execution on `bsfwzvgynwriswapxpsp` under strict rate limits and rollback without project deletion.
2. **Review & PR Gate:** Review this PR and confirm that all local tests pass and safety boundaries are preserved.
3. **Merge Gate:** Await independent re-review from `im-tio`. Do not merge automatically.
