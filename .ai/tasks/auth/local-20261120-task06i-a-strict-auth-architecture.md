# Phase 1.2 Task 06I-A — Strict Auth Architecture & Server-Side Enforcement Decision

| Field | Value |
|---|---|
| **Task ID** | Task 06I-A |
| **Status** | **ARCHITECTURE PROPOSED — OWNER DECISION REQUIRED** |
| **Objective** | Design an enforceable server-side Auth architecture that preserves the owner-approved UX while strictly resolving empirical security failures (AUTH-12, AUTH-17, AUTH-22, purpose crossover) demonstrated in Task 06H-E |
| **Execution Mode** | READ-ONLY SECURITY RESEARCH + SCOPED DOCUMENTATION (No app code, migrations, or hosted changes) |
| **Authorization** | Owner instruction: follow `AGENTS.md`, `.ai/current.md`, Supabase skill; production project `bsfwzvgynwriswapxpsp` strictly READ-ONLY |
| **Implementation Owner** | Security Architecture & Research Agent |
| **Baseline Main Commit** | `317b4d4793368e6a9a2907d504044e876acfaab0` (PR #33 merged) |
| **Worktree Branch** | `docs/task06i-a-strict-auth-architecture` |
| **Security Invariants** | AUTH-12/17/22 **BLOCKED** on native GoTrue; Managed Supabase Auth **NOT VERIFIED**; Production Auth **NO-GO** |
| **Primary Reference** | [AGENTS.md](../../../AGENTS.md), [docs/04-AUTH-AND-SECURITY.md](../../../docs/04-AUTH-AND-SECURITY.md), [docs/27-OTP-FIRST-AUTH-LIFECYCLE.md](../../../docs/27-OTP-FIRST-AUTH-LIFECYCLE.md) |

---

## 1. Executive Summary & Core Decision

Task 06H-E definitively confirmed through controlled runtime integration testing that upstream Supabase Auth (GoTrue v2.197.0) cannot satisfy Tio-Workspace's non-negotiable security requirements out-of-the-box:
1. **AUTH-12 (Atomic Single-Use):** Failed under concurrent load — parallel redemption of a single OTP issued multiple distinct authenticated sessions (`session_id_claim_comparison=different`).
2. **AUTH-17 (Password Mutation Protection):** Failed — direct `PUT /auth/v1/user` by an OTP-authenticated session mutated the account password without supplying the current password, bypassing `security_update_password_require_current_password`.
3. **AUTH-22 (Five-Wrong Cooldown):** Failed — five consecutive invalid OTP submissions failed to trigger a 15-minute lockout; entering the valid code immediately afterwards succeeded.
4. **Purpose Isolation:** Failed — recovery OTP tokens crossed boundaries and successfully authenticated as `type: 'email'` and `type: 'magiclink'`.

### The Core Architectural Dilemma
Because Supabase GoTrue operates as a monolithic, public-facing Go daemon exposing standard endpoints (`/otp`, `/verify`, `/recover`, `/signup`, `/user`), and lacks native hooks for failed verification attempts, password updates, or transactional challenge locking, **client-side hiding, RLS policies, and basic provider flags cannot enforce strict security against direct API attacks**.

### The Proposed Architecture
- **Primary Recommendation: Option B (Managed Supabase Auth + Server-Owned Purpose-Bound OTP Gateway via Edge Functions & PostgreSQL Transactional Challenge Store)**.
  - Native public OTP and Magic Link issuance is disabled at the provider level (`EXTERNAL_EMAIL_MAGIC_LINK_DISABLED = true` / `disable_signup = true`).
  - Native password recovery emails are neutralized via a fail-closed Send Email Hook, and native token issuance for recovery/OTP is blocked via a Custom Access Token Hook.
  - All OTP generation, rate limiting, and verification are moved into trusted, server-owned Supabase Edge Functions backed by a transactional PostgreSQL schema (`auth_challenges`) utilizing `UPDATE ... WHERE consumed_at IS NULL RETURNING ...` row-level locks.
  - Supabase Auth is utilized strictly as a **Password Identity Provider** (`signInWithPassword`) and Admin API target (`admin.createUser`, `admin.updateUserById`).
- **Contingency Fallback: Option D1 (Self-Hosted Supabase GoTrue Behind an Exclusive Reverse Proxy / API Gateway)**.
  - If managed Supabase controls fail to close native GoTrue public routes on a disposable hosted instance, GoTrue must be self-hosted in a private network where native `/otp`, `/verify`, `/recover`, `/signup`, and direct `/user` are physically unreachable from the public internet.

**Final Verdict:** Production Auth remains **NO-GO**. A tightly bounded proof-of-concept on a disposable managed project (**Task 06I-B**) is required before any implementation.

---

## 2. Reconciliation of Canonical Evidence & Empirical Baseline

| Task & Date | Scope & Method | Observed Evidence / Outcome | Status of Requirements | Contradiction / Conflict Resolved |
|---|---|---|---|---|
| **Task 06A** (2026-11-17) | Local GoTrue v2.197.0 via CLI | Sequential replay rejected; direct `PUT /user` overwritten; 5 wrong codes did not lock | AUTH-12 Sequential PASS; AUTH-17 FAIL; AUTH-22 FAIL | Proved GoTrue treats OTP sessions as recovery-capable. |
| **Task 06B** (2026-11-17) | GoTrue source review & isolated testing | Verified `security_update_password_require_current_password = true` exempts `session.IsRecovery()`; AMR classifies OTP/magiclink as recovery | AUTH-17 Confirmed FAIL in GoTrue engine design | Proved RLS and client flags cannot intercept GoTrue user update. |
| **Task 06C** (2026-11-17) | Architecture review (read-only) | Proposed server-owned challenge store; highlighted direct API bypass risks | Production Auth BLOCKED | Rejected client-only UX or RLS as an Auth boundary. |
| **Task 06D** (2026-11-17) | Isolated multi-container GoTrue testing | `MagicLinkEnabled=false` disabled `/otp` (422); Custom Access Token Hook blocked verify/refresh JWTs; preexisting access JWT still mutated password | AUTH-17 BLOCKED; Managed feasibility INCONCLUSIVE | Established that denying new JWT issuance does not revoke preexisting access tokens. |
| **Task 06F** (2026-11-17) | Session revocation hypothesis | Voluntary `POST /logout` or Admin password reset deleted session, causing `GET/PUT /user` to return `403/session_not_found` | LOCAL ONLY PASS for session invalidation; Hosted NOT VERIFIED | Highlighted that voluntary logout is insufficient; server-side session revocation is required. |
| **Task 06H-D** (2026-11-19) | Loopback Compose prototype | Kong + GoTrue + DB + Mailpit bound strictly to `127.0.0.1` | Infrastructure PASS (zero `0.0.0.0` bindings) | Resolved Windows Docker binding vulnerability without daemon modification. |
| **Task 06H-E** (2026-11-19) | Controlled runtime integration testing | Pinned GoTrue v2.197.0; 14 synthetic cases in Mailpit; Mode A (5/hr) & Mode B (30/hr) | **AUTH-12 FAIL (Concurrency)**<br>**AUTH-17 FAIL (Mutation)**<br>**AUTH-22 FAIL (Cooldown)**<br>**Purpose Crossover Observed** | **Empirically demonstrated race condition (2 sessions for 1 OTP) and purpose crossover (`recovery` accepted as `email` and `magiclink`).** |

---

## 3. Preservation of Owner-Approved Auth UX

The architectural recommendations strictly adhere to the owner-approved UI/UX design specifications in [`docs/27-OTP-FIRST-AUTH-LIFECYCLE.md`](../../../docs/27-OTP-FIRST-AUTH-LIFECYCLE.md) and [`DESIGN.md`](../../../DESIGN.md). **Zero changes to Expo screens, visual layout, typography, keyboard focus, error timing, or navigation are introduced.**

```mermaid
flowchart TD
    subgraph UX_SignUp["1. New User / Sign Up"]
        SU1["Enter Email"] --> SU2["Click Continue"]
        SU2 --> SU3["Enter 6-Digit OTP"]
        SU3 --> SU4["Create Password"]
        SU4 --> SU5["Account Setup (Username req, Mobile opt)"]
        SU5 --> SU6["Name → DOB → Sex"]
        SU6 --> SU7["Units → Height → Weight → Activity → Goal"]
        SU7 --> SU8["Final Setup (Progress circle → Checkmark)"]
        SU8 --> SU9["Home"]
    end

    subgraph UX_SignIn["2. Existing User / Sign In"]
        SI1["Enter Email"] --> SI2["Click Continue"]
        SI2 --> SI3["Password Revealed (Email visible)"]
        SI3 --> SI4["signInWithPassword"]
        SI4 --> SI5["Server Eligibility Check"]
        SI5 --> SI6["Local Device Safety / Binding"]
        SI6 --> SI7["Home"]
    end

    subgraph UX_Recovery["3. Forgot Password"]
        FP1["Forgot Password Link (on Login)"] --> FP2["Confirm Email"]
        FP2 --> FP3["Enter 6-Digit Recovery OTP"]
        FP3 --> FP4["Create New Password"]
        FP4 --> FP5["Click Continue (Server-Confirmed Success)"]
        FP5 --> FP6["Return to Sign In (Email prefilled)"]
        FP6 --> SI3
    end
```

### Detailed UX Invariants
1. **Sign Up Flow:**
   - Sequential presentation: Email → OTP → Password.
   - A surviving provisional UUID without an initial password is automatically reused without duplicate identities.
   - Password-complete users entering Sign Up receive a generic response directing them to Sign In or Recovery; no re-enrollment or password overwrite is allowed.
   - OTP verification alone grants no access to protected cloud resources or local encrypted storage.
2. **Sign In Flow:**
   - Normal login never sends an OTP and never modifies the stored password.
   - Email remains visible when Password is revealed.
   - No public account-existence query; no automatic mode switching between Sign Up and Sign In.
3. **Forgot Password Flow:**
   - Initiated explicitly from the Login screen.
   - Recovery verification grants **zero ambient session** and never routes to Home.
   - Upon successful server-side password reset, the user is redirected to Sign In with Email prefilled to perform an explicit `signInWithPassword`.

---

## 4. Core Security Architecture Enforcement

### 4.1. AUTH-12 — Atomic OTP Single-Use & Concurrency Serialization
Task 06H-E proved that GoTrue v2.197.0 suffers from a concurrency race condition: parallel requests with the same valid OTP both succeeded and minted two independent sessions.

#### PostgreSQL Transaction & Atomic Strategy
To guarantee that exactly one redemption succeeds across concurrent threads, the challenge store must enforce row-level locking or atomic conditional updates:

```sql
-- Atomic Single-Use Redemption Pattern
WITH candidate AS (
    SELECT id, code_hash, failed_attempts, expires_at, cooldown_until
    FROM auth_challenges
    WHERE challenge_id = $1
      AND normalized_email = $2
      AND purpose = $3
      AND consumed_at IS NULL
    FOR UPDATE
)
UPDATE auth_challenges c
SET consumed_at = clock_timestamp()
FROM candidate
WHERE c.id = candidate.id
  AND candidate.failed_attempts < 5
  AND candidate.expires_at >= clock_timestamp()
  AND (candidate.cooldown_until IS NULL OR candidate.cooldown_until <= clock_timestamp())
  AND candidate.code_hash = hmac($4, $server_pepper, 'sha256')
RETURNING c.id, c.user_id;
```

#### Concurrency Evaluation
- **Strategy 1: `SELECT ... FOR UPDATE` (Pessimistic Row Lock):**
  - When Request A and Request B arrive concurrently with identical tokens, Request A obtains the row lock.
  - Request B blocks until Request A commits.
  - In PostgreSQL `READ COMMITTED` isolation, when Request B unblocks, its re-evaluation of the row sees `consumed_at IS NOT NULL`.
  - Request B immediately fails with `already_consumed`.
- **Strategy 2: Atomic `UPDATE ... WHERE consumed_at IS NULL RETURNING ...`:**
  - Operates as a single atomic write lock. Request A updates the row and returns `c.id`.
  - Request B's `UPDATE` affects 0 rows. Request B detects 0 rows returned and rejects the attempt.
  - **Selected Approach:** Single atomic conditional `UPDATE` with row lock. Rollback guarantees: if downstream Admin API user creation fails, the transaction rolls back, releasing the challenge for legitimate retry within the 10-minute window.

#### Token Cryptography & Storage
- Six-digit numeric OTP generated via cryptographically secure pseudo-random number generator (`crypto.randomInt(100000, 1000000)`).
- **Zero Plaintext Storage:** Challenge table stores `code_hash = HMAC-SHA256(code, server_pepper)`.
- Server pepper resides exclusively in server-side environment secrets (`CHALLENGE_PEPPER`), never exposed to clients or database users without elevated permissions.

---

### 4.2. AUTH-17 — Password Mutation Protection & Identity Boundary
Task 06B, 06D, and 06H-E proved that any session bearing `amr: ['otp']` can call `PUT /auth/v1/user` and overwrite the password without supplying the current password.

#### Enforcement Architecture
1. **Denial of Native OTP Sessions:** The client never receives a Supabase Auth session from OTP verification. OTP verification occurs in the Edge Function, which returns only a purpose-bound transient verification proof or proceeds immediately to password enrollment.
2. **Separation of First Enrollment vs Mutation:**
   - **First Enrollment:** Allowed only if the account state is `EMAIL_VERIFIED_PASSWORD_PENDING` and `encrypted_password` is absent or the account is marked provisional in the server lifecycle table. Executed server-side via `supabase.auth.admin.createUser` or `supabase.auth.admin.updateUserById(userId, { password })`.
   - **Password Mutation (Recovery):** Allowed only via explicit `recovery_password_reset` challenge verification. Executed server-side via `admin.updateUserById`.
3. **Session Revocation on Password Mutation:**
   - GoTrue's Admin API `updateUserById(userId, { password })` automatically deletes all existing active sessions from `auth.sessions` for that user.
   - Any outstanding access tokens fail subsequent `GET/PUT /auth/v1/user` calls with `403/session_not_found` (verified locally in Task 06F).
4. **Enforcing `Require Current Password` on Normal Sessions:**
   - Normal users sign in via `signInWithPassword`. Their session has `amr: ['password']`.
   - For `amr: ['password']`, GoTrue's `session.IsRecovery()` is `false`.
   - Therefore, `security_update_password_require_current_password = true` is fully enforced: direct `PUT /auth/v1/user` without `current_password` is rejected with `400/invalid_request`.

---

### 4.3. AUTH-22 — Five-Wrong Cooldown & Rate Limits
Native GoTrue does not enforce a challenge-level failure budget. Task 06H-E proved that entering 5 wrong OTPs did not prevent immediate entry of the correct OTP.

#### Server-Enforced Challenge Ledger (`auth_challenges`)
- **Per-Challenge Attempt Counter:**
  - Each wrong OTP submission atomically executes:
    ```sql
    UPDATE auth_challenges
    SET failed_attempts = failed_attempts + 1,
        cooldown_until = CASE WHEN failed_attempts + 1 >= 5
                              THEN clock_timestamp() + INTERVAL '15 minutes'
                              ELSE NULL END
    WHERE challenge_id = $1 AND consumed_at IS NULL;
    ```
  - When `failed_attempts >= 5`, `cooldown_until` is set. Any subsequent verification (even with the correct code) fails closed while `clock_timestamp() < cooldown_until`.
- **Hourly Normalized Email Quota:**
  - A shared rate limit table (`email_send_rate_limits`) records every send across both `signup_initial_password` and `recovery_password_reset`.
  - Atomically enforced in PostgreSQL:
    - Maximum 5 sends per normalized email per rolling 60-minute window.
    - Minimum 60 seconds between successive sends for the same email.
- **Anti-Enumeration Parity:**
  - Public endpoints return identical status `200 OK` and identical JSON schema (`{ success: true, message: "If eligible, an email has been sent" }`) regardless of whether the email is unverified, provisional, password-complete, or non-existent.
  - Constant-time processing / artificial delay equalization applied in the Edge Function to prevent timing side-channels.

---

### 4.4. Purpose Isolation & Crossover Elimination
Task 06H-E revealed that GoTrue native recovery OTPs can be redeemed as `type: 'email'` and `type: 'magiclink'`.

#### Server-Owned Purpose Binding
In the server challenge store, the `purpose` column is an explicit PostgreSQL ENUM:
```sql
CREATE TYPE auth_challenge_purpose AS ENUM (
    'signup_initial_password',
    'recovery_password_reset'
);
```
- A verification endpoint for signup strictly specifies `WHERE purpose = 'signup_initial_password'`.
- A verification endpoint for recovery strictly specifies `WHERE purpose = 'recovery_password_reset'`.
- It is mathematically and relationally impossible for a recovery token to satisfy a signup challenge, or vice-versa.
- Native GoTrue `/verify` endpoints are blocked via the Custom Access Token Hook, eliminating native AMR crossover.

---

## 5. Architecture Candidate Comparison Matrix

| Criteria | Option A: Native GoTrue + Settings | Option B: Managed Supabase + Edge OTP Gateway | Option C: Managed Supabase + Hook Boundary | Option D1: Self-Hosted GoTrue + Exclusive Gateway | Option D2: Third-Party Auth (Auth0/Ory) |
|---|---|---|---|---|---|
| **AUTH-12 (Atomic Single-Use)** | **FAILS REQUIREMENT** (Concurrency race in 06H-E) | **PROVEN LOCALLY** (Postgres conditional update/row lock) | **FAILS REQUIREMENT** (Hook cannot lock GoTrue verify) | **PROVEN LOCALLY** (Gateway serializes / custom store) | **DOCUMENTED BUT UNVERIFIED** (Vendor dependent) |
| **AUTH-17 (Password Mutation)** | **FAILS REQUIREMENT** (Direct `PUT /user` bypass in 06H-E) | **REQUIRES EXPERIMENT** (Admin API + native disablement) | **FAILS REQUIREMENT** (No password update hook exists) | **PROVEN LOCALLY** (Direct `/user` blocked by gateway) | **DOCUMENTED BUT UNVERIFIED** (Requires custom RLS JWT) |
| **AUTH-22 (Five-Wrong Cooldown)**| **FAILS REQUIREMENT** (Cooldown bypass in 06H-E) | **PROVEN LOCALLY** (Postgres attempt ledger + cooldown) | **FAILS REQUIREMENT** (No hook for failed OTP verify) | **PROVEN LOCALLY** (Gateway ledger) | **DOCUMENTED BUT UNVERIFIED** (Vendor rule configs) |
| **Purpose Isolation** | **FAILS REQUIREMENT** (Crossover in 06H-E) | **PROVEN LOCALLY** (Strict ENUM in challenge store) | **FAILS REQUIREMENT** (GoTrue AMR crossover) | **PROVEN LOCALLY** (Strict purpose binding) | **DOCUMENTED BUT UNVERIFIED** |
| **Direct API Bypass Resistance** | **FAILS REQUIREMENT** (All endpoints public) | **REQUIRES EXPERIMENT** (Send Email Hook + Token Hook) | **FAILS REQUIREMENT** (Endpoints remain callable) | **PROVEN LOCALLY** (Private network / Kong blocks routes) | **DOCUMENTED BUT UNVERIFIED** |
| **Session Revocation Safety** | **FAILS REQUIREMENT** (Preexisting JWTs survive) | **REQUIRES EXPERIMENT** (Admin reset deletes sessions) | **FAILS REQUIREMENT** | **PROVEN LOCALLY** (Gateway invalidates tokens) | **DOCUMENTED BUT UNVERIFIED** |
| **Existing UUID Preservation** | **PROVEN LOCALLY** | **PROVEN LOCALLY** (Admin createUser / updateUserById) | **PROVEN LOCALLY** | **PROVEN LOCALLY** | **FAILS REQUIREMENT** (Requires UUID migration) |
| **Mobile UX Compatibility** | **PROVEN LOCALLY** (Matches mock) | **PROVEN LOCALLY** (Zero Expo redesign) | **PROVEN LOCALLY** | **PROVEN LOCALLY** | **REQUIRES EXPERIMENT** (SDK changes needed) |
| **Cost & Operational Burden** | Lowest (Managed Free/Pro) | Low (Supabase Managed + Edge Functions) | Low | High (Private VPS, Docker, monitoring, DB ops) | High (Monthly vendor subscription) |
| **Local-First Privacy** | Preserved | Preserved | Preserved | Preserved | Vendor privacy exposure |
| **Overall Classification** | **FAILS REQUIREMENT** | **RECOMMENDED CANDIDATE** | **NOT FEASIBLE** | **CONTINGENCY FALLBACK** | **REJECTED (High Friction)** |

---

## 6. Comprehensive Direct API Threat Model

The following matrix analyzes all public GoTrue attack paths against Option B enforcement:

| # | Endpoint / Vector | Attack / Unauthorized Action | Required Security Boundary | Current Empirical Evidence | Proposed Option B Enforcement | Failure / Rollback Behavior | Test Needed for Acceptance |
|---|---|---|---|---|---|---|---|
| 1 | `POST /auth/v1/otp` | Direct request for email OTP / magic link bypassing app limits | Public route rejection; no email sent; no session issued | Task 06D Clone 1: `422/email_provider_disabled` when magic link disabled | Set `EXTERNAL_EMAIL_MAGIC_LINK_DISABLED = true` on managed project | If setting missing, fail closed via Custom Access Token Hook | Verify direct `POST /otp` returns HTTP 422 on disposable hosted project |
| 2 | `POST /auth/v1/verify` (type: email/signup) | Redemption of brute-forced or intercepted OTP token | Rejection of token; no JWT minted | Task 06D Clone 2: Hook rejected verify with HTTP 500; 06H-E: concurrency race | Custom Access Token Hook rejects any token where `authentication_method = 'otp'` | Returns HTTP 500 / error; zero session issued | Verify direct `POST /verify` with valid OTP returns error and no JWT |
| 3 | `POST /auth/v1/recover` | Direct password reset request to bypass server challenge limits | Interception of recovery email; no token delivered | Task 06D: `/recover` returned 200 even when magic link disabled | Send Email Hook intercepts `email_action_type = 'recovery'` and drops message | Message dropped; Mailpit delta = 0; no email leaves provider | Verify Send Email Hook logs drop and zero emails dispatched |
| 4 | `POST /auth/v1/verify` (type: recovery) | Direct submission of recovery token to obtain recovery session | Rejection of recovery JWT issuance | Task 06D: Hook blocked recovery verify | Custom Access Token Hook rejects any token where `authentication_method = 'recovery'` | Returns error; zero session issued | Verify direct recovery verification returns no access token |
| 5 | `POST /auth/v1/signup` | Direct account creation with password before email verification | Disable public signup endpoint | Task 06D Clone 2: `disable_signup = true` returned `422/signup_disabled` | Set `disable_signup = true` in Supabase Auth config | Public signup permanently disabled; accounts created only via Admin API | Verify direct `POST /signup` returns HTTP 422 |
| 6 | `POST /auth/v1/resend` | Flood endpoint to exhaust email quota | Public route rejection | Task 06D: `/resend` type `signup` returned 200 without disable | Blocked by `disable_signup = true` and magic link disablement | Returns HTTP 422 or validation failed | Verify direct `/resend` calls fail |
| 7 | `PUT /auth/v1/user` (Direct Password Mutation) | Attacker possessing an OTP/recovery JWT updates password without old password | Strict requirement of current password on all sessions | Task 06H-E: Direct password overwrite succeeded with OTP JWT | 1. No OTP JWT ever issued.<br>2. Password sessions require `current_password`.<br>3. Admin updates revoke prior sessions. | GoTrue returns `400/invalid_request` (`current_password required`) | Verify `PUT /user` with new password fails without `current_password` |
| 8 | `POST /auth/v1/token?grant_type=password` | Legitimate password login | Seamless authentication for verified users | Task 06D & 06H-E: Password login returned 200 and valid session | Kept fully enabled and active | Returns 200 OK and session | Verify standard login works smoothly |
| 9 | `POST /auth/v1/token?grant_type=refresh_token` | Refreshing an existing session | Disallow refresh of revoked or OTP sessions | Task 06F: Revoked session refresh returned `400/refresh_token_not_found` | Hook rejects refresh if session revoked or marked OTP | Returns HTTP 400 | Verify old session refresh fails after password reset |
| 10 | Preexisting Auth Sessions | Using an access token minted prior to security cutover | Invalidation of all pre-cutover sessions | Task 06D FAIL: Unrevoked token still mutated password; Task 06F: logout/admin reset deleted session | Execute database session truncation or Admin password reset during cutover | Auth `/user` returns `403/session_not_found` | Verify pre-cutover tokens return 403 on `/user` |
| 11 | Concurrent OTP Verification | Parallel requests with same OTP to get multiple sessions | Atomic single redemption | Task 06H-E FAIL: Pinned GoTrue allowed 2 parallel sessions | Handled by Edge Function + PostgreSQL `UPDATE ... WHERE consumed_at IS NULL` | Exactly 1 request succeeds; parallel requests return `already_consumed` | Concurrency harness testing 10 parallel verify calls |
| 12 | Forged Purpose | Submitting recovery OTP to signup endpoint | Purpose isolation rejection | Task 06H-E: Purpose crossover observed in GoTrue | Database ENUM check: `purpose = 'signup_initial_password'` fails for recovery code | Request rejected with HTTP 400 | Verify cross-purpose redemption fails |
| 13 | Forged Client Metadata | Client passes `is_admin: true` or `email_verified: true` | Untrusted client metadata ignored by server | Task 06A: Client metadata ignored by RLS | Server lifecycle table ignores `raw_user_meta_data`; checks server facts only | Metadata saved as inert JSON; zero permission granted | Verify forged metadata does not grant server eligibility |
| 14 | Repeated Wrong OTP Attempts | Brute-force 6-digit code | 15-minute cooldown after 5 wrong attempts | Task 06H-E FAIL: 5 wrong attempts did not lock GoTrue | PostgreSQL ledger atomically increments `failed_attempts` and sets `cooldown_until` | Calls 1-4 return invalid code; call 5 sets cooldown; call 6 returns cooldown active | Verify correct code entered during cooldown returns HTTP 423 Locked |
| 15 | Email / Account Enumeration | Probing endpoints to identify registered emails | Parity in status, schema, and response timing | Task 06A: Body parity observed | Edge Functions return identical response for existing/non-existing emails | Identical response returned | Automated timing & response parity assertion |
| 16 | Privileged Admin Exposure | Attempting to access Admin API from client | Admin secret custody | Task 04 & 06C: Service-role key strictly server-side | Service-role key resides strictly in Supabase Vault / Edge Function secrets | Public requests with Anon key cannot invoke Admin methods | Verify Anon key rejected on Admin endpoints |

---

## 7. Managed Supabase Feasibility & Empirical Gaps

### Documented Capabilities vs Observed Local / Hosted Reality
1. **`EXTERNAL_EMAIL_MAGIC_LINK_DISABLED`:**
   - *Documented / Studio Source:* Added to Supabase Studio (commit `acde41a`, Nov 2026) under “Enable magic links and email OTP”. Source states passwords are unaffected.
   - *Observed Local:* Setting `GOTRUE_EXTERNAL_EMAIL_MAGIC_LINK_ENABLED=false` in GoTrue cleanly disables `/otp` and `/magiclink` (returns HTTP 422).
   - *Hosted Gap:* Public Management API OpenAPI specifications omitted this field. Its operational availability and persistence via Management API PATCH or Studio UI on managed hosted projects is **NOT VERIFIED**.
2. **Send Email Hook:**
   - *Documented:* Available on Free and Pro tiers. Intercepts all outgoing Auth emails.
   - *Observed Local:* In Task 06D, hook returned success and suppressed Mailpit dispatch.
   - *Hosted Gap:* Proof that Send Email Hook reliably intercepts native `/recover` without fallback to default Supabase SMTP under transient hook failure is **NOT VERIFIED**.
3. **Custom Access Token Hook:**
   - *Documented:* Intercepts JWT issuance on sign-in, token refresh, and OTP verification.
   - *Observed Local:* Task 06D proved hook can reject `/verify` with HTTP 500 and reject refresh.
   - *Hosted Gap:* Hook execution overhead, fail-closed reliability, and handling of Edge Function cold starts on managed hosted projects are **NOT VERIFIED**.
4. **Session Invalidation on Password Update:**
   - *Documented / GoTrue Source:* Admin password update invalidates all active sessions for that user.
   - *Observed Local:* Task 06F confirmed that after Admin password update, `GET /user` and `PUT /user` return `403/session_not_found`.
   - *Hosted Gap:* Verification that hosted Kong and PostgREST immediately respect session deletion without token caching is **NOT VERIFIED**.

### Status of Production Project `bsfwzvgynwriswapxpsp`
- **READ-ONLY STATUS PRESERVED:** Project metadata confirms project is active (`Tio-Tnyx`, `ap-south-1`).
- **Zero changes made:** No Auth configuration PATCHed, no hooks deployed, no migrations run, no test emails dispatched.
- **Strict Boundary:** Production project cannot be used for boundary experiments. All proof testing must occur on a disposable project.

---

## 8. Detailed Target Architecture Specification (Option B)

### 8.1. System Architecture & Trust Boundaries

```mermaid
flowchart TB
    subgraph Client_Layer["Mobile Client (Expo iOS / Android)"]
        UI["Expo UI (Screens & Navigation)"]
        SDK["@supabase/supabase-js (Client SDK)"]
        SS["Expo SecureStore (Session & Binding Storage)"]
    end

    subgraph Edge_Gateway["Trusted Server Layer (Supabase Edge Functions)"]
        F_ReqOTP["auth-request-otp (Edge Function)"]
        F_VerEnroll["auth-verify-and-enroll (Edge Function)"]
        F_VerRec["auth-verify-and-recover (Edge Function)"]
        AdminSDK["Supabase Admin SDK (service_role key)"]
        EmailClient["Transactional Email Client (Verified SMTP / API)"]
    end

    subgraph Database_Layer["Authoritative Database (PostgreSQL 17)"]
        T_Chal["auth_challenges (Challenge Ledger & Locks)"]
        T_Limits["email_send_rate_limits (Hourly Quotas)"]
        T_Lifecycle["user_lifecycle_state (Server-Owned Status)"]
        Hook_Email["Send Email Hook (Fail-Closed Neutralizer)"]
        Hook_Token["Custom Access Token Hook (Native Block)"]
    end

    subgraph GoTrue_Monolith["Supabase Auth Daemon (GoTrue v2.197.0+)"]
        API_Pass["/auth/v1/token?grant_type=password (Active)"]
        API_Native["/otp, /recover, /signup (Neutralized / Blocked)"]
        T_AuthUsers["auth.users"]
        T_AuthSessions["auth.sessions"]
    end

    %% Client Interactions
    UI -->|1. Request OTP / Enroll / Recover| Edge_Gateway
    UI -->|2. Email + Password Sign In Only| API_Pass
    SDK -->|Persist Session| SS

    %% Edge Gateway Logic
    F_ReqOTP -->|Check Quota & Record Challenge| T_Limits
    F_ReqOTP -->|Insert Hashed OTP| T_Chal
    F_ReqOTP -->|Dispatch Email| EmailClient

    F_VerEnroll -->|Atomic Lock & Consume| T_Chal
    F_VerEnroll -->|Create / Update User| AdminSDK
    F_VerEnroll -->|Record Server Eligibility| T_Lifecycle

    F_VerRec -->|Atomic Lock & Consume| T_Chal
    F_VerRec -->|Update Password & Revoke Sessions| AdminSDK

    AdminSDK -->|Privileged Operations| GoTrue_Monolith

    %% Native Interceptions
    GoTrue_Monolith -->|Intercept Recovery Emails| Hook_Email
    Hook_Email -->|Drop Native Messages| Database_Layer
    GoTrue_Monolith -->|Intercept Native Verifications| Hook_Token
    Hook_Token -->|Deny Non-Password JWTs| Database_Layer
```

---

### 8.2. End-to-End Sequence Workflows

#### A. New User / Sign Up Workflow

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Expo Mobile App)
    participant Edge as Edge Function (auth-request-otp / auth-verify-and-enroll)
    participant DB as PostgreSQL (auth_challenges / lifecycle)
    participant Email as Email Provider
    participant Admin as Supabase Auth (Admin API)

    User->>Edge: POST /auth-request-otp { email, purpose: 'signup_initial_password' }
    Edge->>DB: Check hourly limit (< 5/hr) & 60s resend lock
    DB-->>Edge: Quota Approved
    Edge->>DB: Insert HMAC-SHA256(OTP) into auth_challenges (10m expiry)
    Edge->>Email: Send 6-digit OTP
    Edge-->>User: 200 OK { success: true }

    Note over User: User reviews email & enters 6-digit OTP + New Password

    User->>Edge: POST /auth-verify-and-enroll { email, otp, password, purpose: 'signup_initial_password' }
    Edge->>DB: Atomic UPDATE auth_challenges SET consumed_at = NOW() WHERE ... RETURNING id
    alt OTP Invalid, Expired, or 5th Failure Lockout
        DB-->>Edge: 0 rows returned (or cooldown updated)
        Edge-->>User: 400 Bad Request / 423 Locked
    else OTP Successfully Consumed
        DB-->>Edge: 1 row returned (Atomic Success)
        Edge->>Admin: admin.createUser({ email, password, email_confirm: true })
        Admin-->>Edge: Returns user { id: UUID }
        Edge->>DB: INSERT INTO user_lifecycle_state (user_id, status: 'PASSWORD_COMPLETE_PROFILE_PENDING')
        Edge-->>User: 200 OK { success: true, user_id: UUID }
        Note over User: User proceeds to Cloud Profile Setup (Username req, Mobile opt)
    end
```

#### B. Existing User / Normal Sign In Workflow

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Expo Mobile App)
    participant GoTrue as Supabase Auth (/auth/v1/token)
    participant Lifecycle as Database (user_lifecycle_state)
    participant Local as Local SQLite (SQLCipher Encrypted Store)

    User->>User: Enter Email → Continue → Enter Password
    User->>GoTrue: POST /auth/v1/token?grant_type=password { email, password }
    GoTrue-->>User: 200 OK { access_token, user: { id: UUID } } (amr: ['password'])

    User->>Lifecycle: Query server-owned status (via authenticated RLS)
    Lifecycle-->>User: Status = SERVER_ELIGIBLE

    User->>Local: Verify single installation binding matches user.id
    alt UUID Mismatch
        Local-->>User: ACCOUNT_MISMATCH (Lock store; retain ciphertext)
    else UUID Matches Bound Account
        Local->>Local: Decrypt SQLite store with OS-protected key
        Local-->>User: LOCAL_READY
        User->>User: Route to Home Screen
    end
```

#### C. Forgot Password / Recovery Workflow

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Expo Mobile App)
    participant Edge as Edge Function (auth-request-otp / auth-verify-and-recover)
    participant DB as PostgreSQL (auth_challenges / limits)
    participant Email as Email Provider
    participant Admin as Supabase Auth (Admin API)

    User->>Edge: POST /auth-request-otp { email, purpose: 'recovery_password_reset' }
    Edge->>DB: Check rate limits (5/hr, 60s cooldown)
    DB-->>Edge: Approved
    Edge->>DB: Insert HMAC-SHA256(OTP) into auth_challenges (purpose: recovery_password_reset)
    Edge->>Email: Send Recovery OTP
    Edge-->>User: 200 OK (Generic anti-enumeration message)

    Note over User: User enters Recovery OTP + New Password

    User->>Edge: POST /auth-verify-and-recover { email, otp, new_password, purpose: 'recovery_password_reset' }
    Edge->>DB: Atomic UPDATE auth_challenges SET consumed_at = NOW() WHERE purpose = 'recovery_password_reset'
    alt Verification Failed
        DB-->>Edge: 0 rows / Lockout
        Edge-->>User: 400 Bad Request / 423 Locked
    else Atomic Verification Succeeded
        DB-->>Edge: Challenge Consumed
        Edge->>Admin: admin.updateUserById(user_id, { password: new_password })
        Note over Admin: GoTrue automatically deletes all active sessions for user_id
        Admin-->>Edge: 200 OK (Password Updated & Sessions Revoked)
        Edge-->>User: 200 OK { success: true }
        Note over User: Zero ambient session issued; redirect to Sign In with Email prefilled
        User->>User: Explicit signInWithPassword using New Password
    end
```

---

### 8.3. Database Schema Proposal (`auth_challenges`)

```sql
-- PostgreSQL Migration (Draft Specification)
CREATE SCHEMA IF NOT EXISTS private_auth;

CREATE TYPE private_auth.challenge_purpose AS ENUM (
    'signup_initial_password',
    'recovery_password_reset'
);

CREATE TABLE private_auth.auth_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    normalized_email TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    purpose private_auth.challenge_purpose NOT NULL,
    code_hash TEXT NOT NULL, -- HMAC-SHA256(code, server_pepper)
    failed_attempts INT NOT NULL DEFAULT 0,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + INTERVAL '10 minutes'),
    cooldown_until TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_auth_challenges_lookup
ON private_auth.auth_challenges (challenge_id, normalized_email, purpose)
WHERE consumed_at IS NULL;

CREATE TABLE private_auth.email_send_rate_limits (
    normalized_email TEXT PRIMARY KEY,
    send_count INT NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 9. Proposed Task 06I-B Proof Plan

To definitively resolve managed hosted feasibility gaps without risking production infrastructure, the owner is requested to authorize **Task 06I-B** on a **disposable managed Supabase project**.

### 9.1. Scope & Acceptance Criteria
1. **Disposable Project Creation:** Spin up a temporary, isolated Supabase Cloud project (`tio-auth-proof-disposable`) on the Free tier.
2. **Provider Boundary Verification:**
   - Test Management API PATCH and Studio UI for `EXTERNAL_EMAIL_MAGIC_LINK_DISABLED = true` and `disable_signup = true`.
   - Execute direct HTTP requests from an external machine to:
     - `POST /auth/v1/otp` -> Expect `422/email_provider_disabled`.
     - `POST /auth/v1/signup` -> Expect `422/signup_disabled`.
     - `POST /auth/v1/recover` -> Verify Send Email Hook intercepts and drops recovery email.
3. **Hook Boundary Verification:**
   - Deploy Send Email Hook and Custom Access Token Hook.
   - Verify Custom Access Token Hook rejects any direct `/verify` call attempting to mint an OTP session.
4. **Session Invalidation Verification:**
   - Mint a test password session.
   - Execute Admin API password reset.
   - Verify immediate rejection (`403/session_not_found`) on `GET /auth/v1/user` and `PUT /auth/v1/user`.
5. **Atomic Challenge Store Proof:**
   - Deploy `private_auth.auth_challenges` and Edge Functions.
   - Run concurrency harness executing 10 parallel verify requests -> Expect exactly 1 success and 9 rejections.
   - Run 5 wrong OTP submissions -> Expect challenge locked for 15 minutes.

### 9.2. Strict STOP Conditions
- If `EXTERNAL_EMAIL_MAGIC_LINK_DISABLED` cannot be applied or does not disable `/otp` on managed Supabase -> **STOP & FALL BACK TO OPTION D1 (Self-Hosted Gateway)**.
- If Send Email Hook cannot reliably intercept `/recover` on managed Supabase -> **STOP & FALL BACK TO OPTION D1**.
- If Admin password reset fails to revoke access tokens on managed Supabase -> **STOP & FALL BACK TO OPTION D1**.

---

## 10. Summary & Sign-off

| Deliverable | Location | Status |
|---|---|---|
| Canonical Research Document | `.ai/tasks/auth/local-20261120-task06i-a-strict-auth-architecture.md` | **COMPLETE** |
| Active Continuity Pointer | `.ai/current.md` | **UPDATED** |
| Research Worktree Branch | `docs/task06i-a-strict-auth-architecture` | **READY FOR REVIEW** |
| Final Architecture Verdict | **ARCHITECTURE PROPOSED — OWNER DECISION REQUIRED** | **PRODUCTION AUTH NO-GO** |
