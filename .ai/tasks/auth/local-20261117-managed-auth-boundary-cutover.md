# Phase 1.2 Task 06F — Managed Auth Boundary Proof & Safe Cutover Validation

| Field | Value |
|---|---|
| Status | **INCONCLUSIVE** for managed-hosted feasibility; local Auth `/user` revocation hypothesis previously executed as **LOCAL ONLY**; production Auth **BLOCKED** |
| Objective | Decide whether Managed Supabase Auth can enforce the owner's strict Auth policy with a provider-level boundary, and design a safe cutover |
| Approval | Owner's Task 06F instruction: preserve 06A–06E artifacts; docs/source/read-only managed inspect; isolated local proof only for a new hypothesis; no hosted Auth change, Expo UI, commit, push, PR or merge |
| Implementation owner | Local Cursor engineering agent (continuation of prior Task 06F scaffold) |
| Previous agent | Task 06E decision-gate report; preexisting `experiments/task06f/` scaffold (config + harness) preserved and completed |
| Last commit agent | None; no Task 06F commit |
| Branch / inspected HEAD | `feat/phase12-task06a-local-auth-poc` / `f0b5102afae4df6589c9a97de720df154cdfabd4` |
| Live `main` | GitHub `main` SHA identical: `f0b5102afae4df6589c9a97de720df154cdfabd4` (verified 2026-11-17) |
| Hosted project named in brief | `bsfwzvgynwriswapxpsp` (`Tio-Tnyx`) — **read-only project metadata only; Auth config not read; no settings changed; no Auth HTTP against it** |
| Local proof versions | Supabase CLI `2.121.0` (local pinned executable via `SUPABASE_CLI`); GoTrue `public.ecr.aws/supabase/gotrue:v2.197.0`; Node `v24.17.0`; project ID `tio-task06f-cutover`; API `127.0.0.1:55521`; Mailpit `127.0.0.1:55524` |

## Explicit final classification

| Topic | Classification |
|---|---|
| Local experimental evidence | Report **only** predicates actually executed on disposable GoTrue `v2.197.0`. Label every such row **LOCAL ONLY**. |
| Managed provider boundary | **NOT VERIFIED** |
| AUTH-17 (direct OTP/recovery password mutation policy) | **BLOCKED** — unrevoked native OTP path still fails (06D); local revocation after logout/Admin reset is not managed acceptance |
| AUTH-12 / AUTH-22 (OTP send/verify lockout ledger) | **BLOCKED** (06A/06D FAIL; 06F did not re-test) |
| Safe hosted cutover | **NOT VERIFIED** |
| JWT consumers outside Auth `/user` (e.g. Data API / PostgREST) | **NOT TESTED** |
| Production Auth | **BLOCKED** |

Do not promote a local experimental PASS to managed, hosted, or production security acceptance.

## Decision (exactly one)

**INCONCLUSIVE**

Critical managed-hosted enforcement remains **NOT VERIFIED**. A disposable **LOCAL ONLY** hypothesis previously showed that **session revocation** on GoTrue `v2.197.0` (voluntary `POST /logout?scope=global` for that session, or trusted Admin password update that logs out that user's sessions) made a previously issued OTP access token fail Auth `GET /user` and `PUT /user` with `403/session_not_found`, while Email + Password login and same-UUID Admin recovery remained usable. That evidence is **Auth `/user` local behavior only**. It does **not** prove:

- managed Studio / Management API controls,
- hosted hook behavior,
- bulk revocation of all preexisting access tokens without per-session logout,
- independent validation of non-Auth JWT consumers,
- or production cutover safety.

Local logout therefore **must not** be described as hosted safe cutover. Per Task 06F criteria, **PROVEN FEASIBLE** cannot be claimed from documentation, source, or local tests alone.

**Recommendation:** Keep **Managed Supabase Auth** as the primary candidate architecture (Option A/E from Task 06E), contingent on a separately approved **disposable managed-project** experiment. Do **not** implement a custom OTP gateway merely to demonstrate rate limits. Do **not** unblock production Auth. Do **not** change `bsfwzvgynwriswapxpsp`.

## What was preserved / not done

- Uncommitted Task 06A–06E reports and `experiments/task06a|06b|06d` artifacts were not rewritten for convenience.
- No Expo UI changes, Brevo SMTP activation, production migrations, hosted Auth PATCH, live-user testing, commits, pushes, PRs or merges under Task 06F execution.
- No Auth HTTP calls were sent to hosted `bsfwzvgynwriswapxpsp`.
- Task 06A–06D failing predicates (unrevoked OTP `PUT /user`, five-wrong unlock, native `/recover` without hooks) were **not** re-run without a new hypothesis.
- Pre-commit finding-resolution edits tightened wording and harness assertion helpers; **this resolution pass did not re-start Docker or re-execute** `revoked-session.mjs`. Previously recorded LOCAL ONLY PASS rows apply to the earlier executed assertion set; after helper/id renames without a fresh run, treat further runtime claims as requiring re-execution or mark **NOT TESTED**.

## Investigation answers (1–7)

| # | Question | Result | Evidence class |
|---|---|---|---|
| 1 | Can Native Email OTP be disabled independently of Email + Password? | **LOCAL ONLY PASS** (Task 06D `MagicLinkEnabled=false` → `/otp`/`/magiclink` `422`, password grant `200`). **Managed: NOT VERIFIED.** Studio commit `acde41a` (2026-11-13) adds `EXTERNAL_EMAIL_MAGIC_LINK_DISABLED` titled “Enable magic links and email OTP” with description that passwords are unaffected. Published Management API OpenAPI samples fetched 2026-11-17 still **omit** this field name. | Local tested + Studio source; hosted untested |
| 2 | Can direct `/otp`, `/verify`, `/recover`, `/signup`, `/resend`, `/user` bypass a custom OTP gateway? | **Yes — public GoTrue routes remain callable** unless provider disablement and/or fail-closed hooks close them. Client hiding, RLS and UI routing are insufficient. | Prior 06D + docs; unchanged **security blocker** |
| 3 | Can Custom Access Token Hooks reliably reject unauthorized OTP/recovery sessions? | **LOCAL ONLY PASS** for *new* OTP/recovery JWT issuance and OTP refresh denial (Task 06D). **Does not** stop an already-issued access token without session revocation. Hosted hooks **NOT VERIFIED**. | Local tested; managed untested |
| 4 | Do already-issued access tokens remain capable of password mutation after a policy change? | **Yes, if the session row still exists** (Task 06D decisive FAIL → AUTH-17 **BLOCKED**). **LOCAL ONLY:** after session deletion on tested GoTrue, Auth `/user` returned `403/session_not_found`. Managed equivalent **NOT VERIFIED**. | Local both ways |
| 5 | Are refresh-token revocation and existing-session invalidation sufficient for safe cutover? | **Necessary, not sufficient.** Distinctions: (a) refresh revocation → `refresh_token_not_found`; (b) Auth `/user` session check → `session_not_found` on tested GoTrue; (c) other JWT consumers **NOT TESTED**. Voluntary client logout does **not** enforce against tokens whose holders never call logout. Native OTP/recovery can still mint *new* sessions. Safe hosted cutover **NOT VERIFIED**. | Local Auth `/user` only; managed + bulk + JWT consumers missing |
| 6 | Can existing Email + Password Sign In remain functional? | **LOCAL ONLY PASS** under magic-link disable (06D) and after local revocation hypothesis (06F). Managed combination **NOT VERIFIED**. | Local |
| 7 | Can trusted Admin APIs support first-password creation and explicit recovery? | **LOCAL ONLY PASS** for Admin create → Admin password set → **separate** password grant, same UUID; Admin reset revokes prior sessions. This is **trusted server-only** behavior using `service_role`. It is **not** public Forgot Password enforcement and must never place service-role credentials in Expo or any public client. Managed Admin behavior **NOT VERIFIED**. | Local |

## Provider configuration capability matrix

| Control | Classification | Notes |
|---|---|---|
| `external_email_enabled` | Officially supported (Management API) | Disabling Email kills passwordless **and** email identity flows; not a surgical OTP-only switch |
| `disable_signup` | Officially supported | Blocks public `/signup`; does not alone disable existing-user `/otp` |
| `security_update_password_require_current_password` | Officially supported | OTP/recovery sessions exempt in GoTrue `UserUpdate` (06B/06D FAIL for unrevoked OTP JWT) |
| `security_update_password_require_reauthentication` | Officially supported | 24h grace on current session; not AUTH-17 for fresh OTP sessions |
| `jwt_exp`, session timebox / inactivity / single-session | Officially supported (Pro+ for some session limits) | Docs: changing timeouts is enforced on **next refresh**, not instant access-JWT kill; cleanup may lag ~24h |
| Custom Access Token Hook / Send Email Hook | Officially supported | Issuance/email path controls; no documented password-mutation hook |
| `GOTRUE_EXTERNAL_EMAIL_MAGIC_LINK_ENABLED=false` | **Local-only** proven control (06D) | Accepted by local GoTrue `v2.197.0` |
| `EXTERNAL_EMAIL_MAGIC_LINK_DISABLED` / Studio “Enable magic links and email OTP” | Emerging control; **hosted effectiveness NOT VERIFIED**; public OpenAPI sample **did not list** the field on 2026-11-17 | Studio validation source states passwords unaffected; CLI e2e fixtures reference the field. Must be GET/PATCHed only on an owner-approved disposable project |
| Client route hiding / RLS / reverse-proxy assumptions | **Unsupported** as Auth boundary | Public `/auth/v1/*` remains the trust boundary |
| Hosted Auth config of `bsfwzvgynwriswapxpsp` | **NOT VERIFIED** | MCP `get_project` showed `ACTIVE_HEALTHY`, DB `17.11.0.019`, region `ap-south-1`. No Auth-config read tool in available MCP; CLI project not linked; no PAT-backed Management GET performed |

**Hosted experiment blocker (exact):** Proving managed OTP disablement and hosted revocation requires either (a) Management API `GET/PATCH /v1/projects/{ref}/config/auth` on a **disposable** project, or (b) Studio-equivalent settings on that disposable project, plus direct HTTP. That needs separate owner approval for project creation/cost and Auth writes. **Production project changes are out of scope and were not requested as authorization.**

## Direct API PASS/FAIL/NOT TESTED matrix

### A. Inherited Task 06D (not re-run)

| Predicate | Result |
|---|---|
| Disable `/otp`+`/magiclink`, keep password grant (local env flag) | LOCAL ONLY PASS |
| Unrevoked OTP access token `PUT /user` replaces password | **FAIL** (decisive) — AUTH-17 **BLOCKED** |
| Five wrong OTP then correct accepts | **FAIL** — AUTH-12/22 **BLOCKED** |
| Native `/recover` → verify → `PUT /user` | **FAIL** without hooks — residual bypass |
| Hook denies new OTP/recovery verify + OTP refresh | LOCAL ONLY PASS (subflow) |
| Hook stops preexisting OTP access `PUT /user` | **FAIL** |

### B. Task 06F LOCAL ONLY session-revocation hypothesis

Harness: [`experiments/task06f/revoked-session.mjs`](../../../experiments/task06f/revoked-session.mjs). Synthetic `@example.invalid` only. Prints status/`error_code` and booleans only. PASS requires explicit HTTP status + documented `error_code` for Auth `/user` denial (`403/session_not_found` on **both** GET and PUT) plus password-state checks — an unrelated failed PUT alone must not PASS.

| Predicate | Result | Observed (redacted) / notes |
|---|---|---|
| Password grant before cutover, same UUID | LOCAL ONLY prior-run PASS; **not re-executed** after pre-commit harness edits | Historical: `200`; `same_uuid=true` |
| Native `/otp` + `/verify` still mint a session | LOCAL ONLY residual observation (harness row may print `PASS` meaning “OTP still opens”, **not** boundary closure) | Historical: verify `200`; native endpoints **remain enabled** |
| `POST /logout?scope=global` then refresh | LOCAL ONLY prior-run PASS; **not re-executed** after edits | Historical: logout `204`; refresh `400/refresh_token_not_found` — **this session only** |
| After that logout: old access Auth `GET/PUT /user` | LOCAL ONLY prior-run PASS; **not re-executed** after edits | Historical: both `403/session_not_found`; old password grant still works; replacement grant false |
| Trusted Admin password reset → separate password login, same UUID | LOCAL ONLY prior-run PASS; **not re-executed** after edits | Historical: admin `200`; server-only; **not** public Forgot Password |
| After Admin reset: old refresh + old access Auth `GET/PUT /user` | LOCAL ONLY prior-run PASS; **not re-executed** after edits | Historical: refresh `400/refresh_token_not_found`; get/update `403/session_not_found` |

Fresh HTTP re-execution of the current staged `revoked-session.mjs` was **NOT RUN** in the pre-commit resolution pass. Do not treat these rows as re-verified evidence for enforcement.

**Interpretation (LOCAL ONLY):** Session deletion can make Auth `/user` reject that JWT on tested GoTrue. It is **not** a substitute for disabling native signup/OTP/recovery issuance. Voluntary client logout is **not** an ops cutover plan against all previously issued access tokens. Trusted Admin password update (server-only) is a closer server-side control for that user and was tested locally; it still does not close native issuance or prove managed/hosted cutover.

### C. Unresolved direct API bypass paths (security blockers)

Still open for any production claim:

1. Unrevoked OTP/recovery access token `PUT /user` (06D FAIL) while native issuance remains on.
2. Native `/signup`, `/otp`, `/magiclink`, `/recover`, `/resend`, `/verify` variants while enabled.
3. Fresh OTP/recovery sessions minted **after** a flag/hook flip if issuance is not closed.
4. Bulk revoke of all project sessions — **NOT TESTED**.
5. Non-Auth JWT consumers accepting a still-signed access JWT — **NOT TESTED**.
6. Managed/hosted equivalents of every row above — **NOT VERIFIED**.

Unauthorized password replacement is therefore **not** claimed prevented for production or managed Auth.

### D. Managed hosted routes

| Predicate | Result |
|---|---|
| All public Auth routes on disposable managed project | **NOT TESTED** — no disposable managed project authorized |
| Auth routes on `bsfwzvgynwriswapxpsp` | **NOT TESTED** by design (production Auth BLOCKED) |

## Missing safe-cutover evidence

Safe hosted cutover remains **NOT VERIFIED** until separately approved disposable managed evidence covers at least:

1. Management API Auth config GET proving OTP/magic-link disable (or fail-closed hooks) while password grant still works.
2. Server-side revocation of preexisting sessions **without** relying on voluntary client logout for every token holder.
3. Negative matrix on managed for `/otp`, `/magiclink`, `/signup`, `/recover`, `/resend`, `/verify`, unrevoked vs revoked Auth `/user`, refresh, password grant.
4. Explicit JWT-consumer checks if Data API or other services accept access JWTs independently of Auth session rows.
5. Rollback drill and independent security review of that hosted evidence.

## Existing-session and cutover threat assessment

| Threat | Assessment |
|---|---|
| Pre-cutover OTP/recovery access JWT still held by attacker | **High** until sessions deleted or JWT expires. Locally, Auth `/user` checks `session_id` against `auth.sessions`; missing session → `session_not_found`. **Do not claim immediate invalidation without performing session deletion or proving equivalent hosted behavior.** |
| Refresh token reuse after logout/Admin reset | LOCAL ONLY blocked (`refresh_token_not_found`). |
| Cutover that only flips hooks/flags without revoking sessions | **Leaves AUTH-17 open** for residual JWTs (06D). |
| Cutover via asking clients to `signOut` / global logout | Incomplete; offline/stolen tokens may never logout. Prefer server-side session invalidation. |
| Bulk revoke of all project sessions | **NOT TESTED** as an Admin/API operation; per-user Admin password update logs out that user. Ops plan required before production cutover. |
| Post-cutover native `/otp` or `/recover` still enabled | **High residual bypass** — fresh recovery-capable sessions can be minted. Must combine revoke with managed OTP/magic-link disable and/or fail-closed hooks. |
| Existing password hashes / user UUIDs | Local Admin reset preserves UUID; password grant works. Migration must not re-mint UUIDs that orphan encrypted local data. |
| Access-token lifetime alone as cutover | Insufficient for immediate AUTH-17; `jwt_exp` only bounds residual window if sessions are **not** checked. Auth `/user` on tested GoTrue **does** check sessions; other consumers **NOT TESTED**. |
| Rollback | Re-enabling native OTP without gateway reopens bypass. Hooks/outages can block login. Keep disposable-project rehearsal and documented rollback flags before any production flip. |
| Unauthorized access during transition | Freeze public signup (`disable_signup`), revoke sessions, disable magic-link/OTP (if managed control confirmed), verify password grant, then enable controlled enrollment/recovery only through trusted server Admin APIs. |

### Safe cutover plan (design only — not executed)

1. **Rehearse on disposable managed project** with the same GoTrue/config generation as intended production.
2. **Inventory** Auth settings via Management API GET; confirm `external_email_magic_link_disabled` (or equivalent) presence and password login independence.
3. **Seed disposable users**; capture OTP access+refresh **before** controls (for negative tests only).
4. **Apply documented controls** (OTP/magic-link disable and/or hooks; `disable_signup` as needed). **Do not** rely on undocumented env vars on managed.
5. **Server-side revoke** preexisting sessions (prove Admin/global mechanism; measure Auth `/user` and refresh).
6. **Negative matrix:** direct `/otp`, `/magiclink`, `/signup`, `/recover`, `/resend`, `/verify` variants, unrevoked vs revoked `/user`, refresh, password grant.
7. **Positive matrix:** Admin first-password enrollment; Admin recovery → clear state → password Sign In; no auto Home session.
8. **Rollback drill:** restore prior flags; confirm password login; confirm no partial UUID split.
9. Only after independent security review and owner approval: consider production Authed cutover. **Until then production Auth stays BLOCKED.**

## Mandatory OTP security requirements

Native provider limits still **do not** meet AUTH-12/AUTH-22 (06A/06D FAIL → **BLOCKED**). Task 06F did **not** build an OTP gateway to demonstrate six-digit / 10-minute / 60-second / five-send / five-fail / 15-minute / atomic / replay / concurrency / generic responses. Those remain requirements for a **later** controlled-challenge slice **after** the provider boundary is managed-proven. AUTH-17 remains **BLOCKED** for production; local session-deletion observations are **conditionally interesting only** and **unproven on managed**.

## Final UX contract (unchanged)

- **Sign Up:** Email → OTP → Create Password → Cloud Profile → Local Onboarding → Home.
- **Sign In:** Email → Continue → Password → Sign In.
- **Forgot Password:** Login → Forgot Password → Email → Recovery OTP → New Password → Continue → Email-prefilled Login.
- **No** automatic login after password reset.
- Public Forgot Password must not be implemented as a client-held Admin/service-role password reset.

## Local exposure and redaction (LOW)

- Harness clients require `API_URL` / `MAILPIT_URL` hosts `127.0.0.1:55521` / `127.0.0.1:55524` and refuse unexpected stacks.
- Supabase CLI local Docker commonly **publishes** container ports on `0.0.0.0` even when clients use loopback; this CLI `config.toml` does not expose a verified loopback-only publish switch for Kong/Mailpit. Treat LAN exposure of disposable Mailpit (OTP plaintext) and Auth API as an accepted **local research residual**; keep stacks disposable, stop after tests, never point at hosted projects.
- Harness JSON output is status/`error_code`/booleans only — no OTPs, tokens, passwords, or privileged env dumps.
- Hosted services were not changed.

## Independent security review findings

### First review (pre-commit scaffold)

Independent Security Review subagent on uncommitted Task 06F artifacts (runtime not re-executed by that reviewer).

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| HIGH-01 | High | Local PASS ≠ managed/hosted AUTH-17 proof | **Resolved in docs** — LOCAL ONLY labels; managed AUTH-17 **NOT VERIFIED**; production **BLOCKED** |
| HIGH-02 | High | Client global logout is not complete cutover | **Resolved in docs** — voluntary logout = this-session mechanism evidence only; missing safe-cutover evidence listed |
| HIGH-03 | High | Native OTP/signup/recovery still enabled | **Resolved in docs as open blocker** — residual issuance paths recorded; no claim that unauthorized password replacement is prevented |
| MEDIUM-01 | Medium | PASS must require status + `session_not_found` + GET denial | **Addressed in harness** — `authUserSessionDenied()`; prior executed run used explicit `403/session_not_found` on GET and PUT; renames without re-run do not invent new PASS |
| MEDIUM-02 | Medium | Admin reset trust boundary | **Resolved in docs/harness comments** — server-only; not public Forgot Password; no service-role in Expo |
| LOW | Low | Docker/Mailpit exposure + redaction | **Accepted residual** — loopback client preference verified in harness; host publish limitation documented; no secret logging |

### Independent re-review (pre-commit, staged snapshot)

Independent Security Review subagent on the corrected staged snapshot (read-only; no Docker/`node` HTTP re-run by reviewer).

| Axis | Verdict |
|---|---|
| Documentation-only PR acceptability | **ACCEPTABLE** (no Blocking findings for research consolidation; non-blocking questions only) |
| Actual security enforcement readiness | **NOT READY** — production Auth **BLOCKED**; AUTH-17/12/22 **BLOCKED**; managed boundary **NOT VERIFIED** |

Non-blocking notes accepted: (1) prior-run LOCAL ONLY PASS rows are historical and were not re-executed after harness helper/id edits; (2) `LOCAL_NATIVE_OTP_STILL_OPENS_SESSION` harness `PASS` means residual OTP still works, not closed boundary; (3) “Resolved in docs” for HIGH items means overclaim fixed, not AUTH acceptance.

## Exact recommendation

1. **Keep Managed Auth** as the intended platform (password grant + server-only Admin enrollment/recovery + provider OTP disable and/or hooks + mandatory session revoke at cutover).
2. **Do not** select self-hosted Auth or a third-party IdP yet — those remain higher-ops fallbacks without new evidence they are required.
3. **Next authorized proof (requires separate owner approval):** create/use a **disposable** managed Supabase project (not `bsfwzvgynwriswapxpsp`); Management API Auth config GET; if `external_email_magic_link_disabled` (or documented equivalent) exists, PATCH only there; run the full direct HTTP matrix including revocation; independent security review of that hosted evidence.
4. **Production Auth remains BLOCKED** until that managed proof is **PROVEN FEASIBLE** under Task 06F criteria. AUTH-17 / AUTH-12 / AUTH-22 stay **BLOCKED**; safe hosted cutover stays **NOT VERIFIED**.

## Validation and cleanup

- `node --check experiments/task06f/revoked-session.mjs` — run in pre-commit resolution
- Full harness HTTP re-execution during pre-commit finding resolution — **NOT RUN** (no Docker restart); prior LOCAL ONLY PASS retained only for the earlier executed assertion set
- Live GitHub `main` SHA match — OK at Task 06F execution time
- Hosted Auth settings — **not changed**
- Local Task 06F stack — no `tio-task06f-cutover` containers required to remain running; stop after any future local re-run

**Next owner action:** Approve or reject the disposable managed-project experiment (cost + Auth write scope), or choose an alternate hosting/provider investigation; separately approve documentation PR consolidation if desired. **Next agent action without new approval:** documentation/review only; no hosted Auth writes.
