# Phase 1.2 Task 06D — isolated local Auth boundary proof

| Field | Value |
|---|---|
| Status | **INCONCLUSIVE** for managed Supabase feasibility; native OTP/current-password and tested hook cutover **FAIL** strict policy; production Auth **BLOCKED** |
| Approval | Owner's Task 06D instruction, isolated local tests only; no hosted setting, migration, Expo change, commit or PR authorized |
| Implementation owner | Local Codex engineering agent |
| Previous agent | Task 06C architecture agent; Task 06A/06B proof files preserved |
| Last commit agent | None; no Task 06D commit |
| Branch / inspected local HEAD | `feat/phase12-task06a-local-auth-poc` / `f0b5102afae4df6589c9a97de720df154cdfabd4` |
| Tested versions | Supabase CLI `2.121.0`; GoTrue image `public.ecr.aws/supabase/gotrue:v2.197.0`; Postgres image `17.11.0.004`; Mailpit image `1.31.3`; Node `v24.17.0`; Docker client/server `29.9.2` |
| Test location | Independent local project ID `tio-task06d-boundary`; harness used `127.0.0.1:55421` API, `127.0.0.1:55424` Mailpit and loopback GoTrue clones `127.0.0.1:55425–55426`; disposable `example.invalid` identities only. Docker published the base API, DB and Mailpit ports on all host interfaces until shutdown. |

## Scope, configuration and evidence method

This task follows [AGENTS.md](../../../AGENTS.md), the [active pointer](../../current.md), [Task 06A](local-20261117-native-otp-foundation.md), [Task 06B](local-20261117-password-enforcement-review.md), [Task 06C](local-20261117-strict-auth-architecture.md), the [Auth lifecycle](../../../docs/27-OTP-FIRST-AUTH-LIFECYCLE.md), the [security baseline](../../../docs/04-AUTH-AND-SECURITY.md) and the [acceptance plan](../../../docs/08-TEST-PLAN.md). The original 06A/06B/06C files and databases were not reused or changed. The Task 06D stack had a separate project ID, ports, Postgres volume and Mailpit. No hosted project was contacted.

The base local config in [`experiments/task06d/supabase/config.toml`](../../../experiments/task06d/supabase/config.toml) has Email enabled, confirmations enabled, six-digit OTP, `otp_expiry=600`, `max_frequency="1s"` for disposable testing, no custom SMTP, and `token_verifications=30` per IP/five minutes. The harness cloned only its GoTrue container twice while sharing **this new Task 06D database**. Clone 1 set `GOTRUE_EXTERNAL_EMAIL_MAGIC_LINK_ENABLED=false` and `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true`. Clone 2 additionally set `GOTRUE_DISABLE_SIGNUP=true` and local HTTP Custom Access Token and Send Email hooks. The token hook rejected `otp`/`recovery` issuance and refresh of OTP-origin sessions; the Send Email hook returned success and the 500 ms Mailpit sample showed no new message. Hook decisions came from the server event, not editable client metadata. This is an experimental local configuration, **not** proof that all switches can be set on managed Supabase.

The [harness](../../../experiments/task06d/provider-boundary.mjs) reads local CLI status in memory, refuses unexpected project endpoints/image/network, prints only HTTP status/error codes and same-UUID/password-state booleans, and attempts to remove each temporary Auth clone in `finally`. Cleanup errors are suppressed in code, so removal requires a separate Docker check; that check was recorded for the original run. It never prints test passwords, OTPs, keys, addresses or tokens. A security requirement with a reproduced bypass is recorded as **FAIL** and causes process exit 1. Initial test runs were discarded after an email-send `429/over_email_send_rate_limit` interrupted hook setup; the final run used separate disposable identities for OTP, recovery and delivery tests. That setup rate limit is not the required five-send/hour plus challenge-specific lock proof.

## Direct Auth API matrix — final local run

`PASS` below means the *named predicate* was observed in this local configuration. It does not certify the whole architecture. All HTTP calls bypassed the Expo UI.

| Path / predicate | Result | Actual local HTTP and state evidence |
|---|---|---|
| Clone 1: disable native `/otp` and `/magiclink` while retaining password grant | **PASS** | Both direct endpoints `422/email_provider_disabled`; `/token?grant_type=password` `200`, same UUID |
| Clone 1: block public `/signup`, `/resend` and password-before-OTP | **FAIL** | `/signup` `200`; `/resend` type `signup` `200`; direct signup confirmation `/verify` `200`; password login `200` |
| Clone 1: block previously issued OTP verification and refresh | **FAIL** | Preissued `/verify` `200`; old OTP refresh `200` |
| Clone 1: protect established password from preexisting OTP access token | **FAIL** | Direct `PUT /user` `200` without current password; old password stopped working; replacement password worked |
| Clone 1: fifth wrong OTP locks challenge for 15 minutes | **FAIL** | Five incorrect `/verify` calls each `403`; correct code immediately afterward `200` |
| Clone 1: block native recovery and direct recovery password update | **FAIL** | `/recover` `200`, recovery `/verify` `200`, direct `PUT /user` `200`, replacement login worked |
| Clone 1: `/resend` type `recovery` | **PASS** for unsupported type only | `400/validation_failed`; **not** a recovery security boundary |
| Clone 1: trusted Admin provisional create and initial enrollment | **PASS**, local subflow | `/admin/users` create `200`; password login before enrollment `400`; Admin password update `200`; login `200` with same UUID |
| Clone 2: password grant and direct signup/OTP restrictions | **PASS** | Password grant `200`; `/signup` `422/signup_disabled`; `/otp` `422/email_provider_disabled` |
| Clone 2: block preissued OTP and recovery token issuance | **PASS**, local hook subflow | Both `/verify` calls `500/unexpected_failure` after token hook rejection; token hook observed `authentication_method=otp` |
| Clone 2: Mailpit sample and old OTP refresh | **PASS**, sampled local subflow | `/recover` `200`; Mailpit message delta `0` in the 500 ms, 100-message sample, which does not prove delivery suppression; old OTP refresh `500/unexpected_failure`; hook observed `token_refresh` |
| Clone 2: protect established password from preexisting OTP **access token** | **FAIL — decisive** | Direct `PUT /user` `200`; replacement password login `200` despite both hooks and current-password flag |
| Hook execution visibility | **PASS** | Local hook observed `token:password`, `token:otp`, `token:token_refresh` and Send Email invocation; no credentials or codes logged |
| Controlled signup/recovery challenge rate, expiry, lock, replay and purpose crossing | **NOT TESTED** | Conditional server-owned challenge PoC was not built because the provider boundary failed |
| Concurrent verify/resend, generic response timing and old-session revocation | **NOT TESTED** | No corresponding Task 06D HTTP run or trusted-server state assertion |
| Managed-project disable controls and hosted direct API paths | **NOT TESTED** | Task 06D was restricted to isolated local tests; no hosted project was contacted |

The hook's `500` response is an experimental deny signal and is not proposed as a production user response. `MagicLinkEnabled=false` prevents **new** native Email OTP requests in this tested GoTrue process, but does not invalidate existing codes or JWTs. Custom Access Token Hook can deny **new JWT issuance** on verify/refresh in this test, but it does not intercept a previously issued access token's direct `/user` update. The provider's `Require current password` flag still permits that OTP-origin session to replace the password. A Send Email Hook returning success without observed delivery in this short sample still leaves `/recover` callable and is not by itself an authorization boundary. No RLS rule can protect GoTrue's password endpoint.

## Provider-supported versus unproven mechanisms

- [Password security](https://supabase.com/docs/guides/auth/password-security) documents `current_password`; the [Management API](https://supabase.com/docs/reference/api/v1-update-auth-service-config) exposes `security_update_password_require_current_password`. Task 06B and this run show the OTP/recovery-session exception in the tested GoTrue version. The setting is defense in depth, **not AUTH-17 completion**.
- [GoTrue v2.197.0 `UserUpdate` source](https://github.com/supabase/auth/blob/v2.197.0/internal/api/user.go#L136-L170) confirms the relevant server path: an existing password requires `current_password` only when `session.IsRecovery()` is false. The separate reauthentication check applies only after the session is older than 24 hours; it cannot protect the freshly issued OTP session in this test. The observed HTTP bypass, rather than source inspection alone, is the security FAIL.
- [Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) provides `authentication_method` and can reject issuance; this run proves rejection of fresh OTP/recovery verification and OTP refresh, **not** retroactive access-token revocation or a `/user` password-change hook.
- [Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook) handles Auth email when enabled. An empty successful response produced no new Mailpit message in the short sample; this does not establish a delivery guarantee or make native `/recover` unreachable.
- `GOTRUE_EXTERNAL_EMAIL_MAGIC_LINK_ENABLED=false` was accepted by local GoTrue v2.197.0 and left password grants functional. Availability as a **managed Supabase** project control was **NOT VERIFIED**; the public Management API reference did not show a `magic_link` setting. Public signup needed a separate `DisableSignup` control in this test.
- Admin create without a password followed by Admin password update retained the UUID locally. Atomic lifecycle eligibility, cleanup races, session revocation, generic public responses and managed support remain **NOT TESTED**. Admin credentials must never enter Expo.

## UX and strict-policy impact

The owner contract remains: new Sign Up **Email → six-digit OTP → first Password → Cloud Profile**; normal Sign In **Email → Continue → Password → `signInWithPassword`**, with Email retained, no OTP and no password change; Forgot Password **Login → Confirm Email → six-digit recovery OTP → New Password → server-confirmed Continue → Email-prefilled Login**, never automatic Home. A provisional same UUID may be enrolled only after trusted verification. Protected cloud eligibility and same-UUID encrypted local readiness remain separate. This task made no Expo UI change.

The strict policy cannot be claimed with native Email OTP plus current-password protection. A fresh hook configuration closes some new issuance paths, but a migration/cutover with any previously issued OTP access token still has a direct password-update bypass until that token is invalidated or expires and the invalidation is independently proven. Neither UI mode separation nor client-side logout solves it. The current managed project's session state and ability to apply the local GoTrue switch are unverified. Native `/recover` is a separate alternate path; suppressing its email via a hook still needs complete direct API, availability and failure-mode proof. Therefore **managed Supabase strict-policy feasibility is INCONCLUSIVE**, and this tested native/hook cutover is **NOT FEASIBLE as-is**. Production Auth stays **BLOCKED**.

## Controlled alternative and next gate

The conditional design remains a trusted server with independent purpose-bound `signup_initial_password` and `recovery_password_reset` six-digit challenges. The server would reserve sends atomically across both purposes (maximum five per normalized email/rolling hour, minimum 60 seconds apart), expire each code after 10 minutes, serialize attempts, lock after five failures for 15 minutes, consume once, and prevent replay or resend-generation races. It would verify exact server-owned lifecycle/UUID before Admin initial enrollment or explicit recovery reset; recovery would return to fresh password Sign In. It would retain generic public responses and protect provisional resources with server eligibility/RLS. No client service-role key, automatic workout upload or bypass of local binding is permitted.

**No custom challenge PoC was built:** the owner's prerequisite was a proven provider boundary, and the preexisting access-token bypass means that condition was not met. The 60-second/five-send, 10-minute expiry boundary, exact five-failure cooldown, concurrency/replay/purpose-crossing, enumeration timing, old-session revocation, managed settings, hosted email and native persisted/encrypted local storage are **NOT TESTED** for this controlled design. The local `600`-second OTP setting and Admin same-UUID subflow are narrower observations, not acceptance of `AUTH-12`, `AUTH-17` or `AUTH-22`.

Next, ask the owner to decide whether to fund a separate **managed Auth boundary and session-cutover feasibility gate** (including a supported disable/deny route for `/otp`, `/signup`, `/recover`, `/verify`, `/user`, old access/refresh tokens and an independently reviewed revocation plan) or evaluate an alternative Auth hosting/provider with an exclusive gateway. A verified safe cutover is prerequisite to the server-owned challenge and lifecycle implementation slice. Self-hosting adds patching, availability, email and incident-response cost; a trusted challenge server adds state, email delivery and privacy obligations. Neither is authorized by Task 06D. If managed Supabase cannot enforce the complete boundary, return to the owner for a provider/hosting decision before implementation.

## Reproduce locally and validate

From the repository root, with Docker running and only Task 06D's ports free:

```powershell
$env:SUPABASE_TELEMETRY_DISABLED = '1'
$env:SUPABASE_CLI = (Get-Command supabase -ErrorAction Stop).Source
& $env:SUPABASE_CLI --version # require 2.121.0 for this reproduction
& $env:SUPABASE_CLI start --workdir experiments/task06d --exclude realtime,storage-api,imgproxy,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor --yes *> $null
node --check experiments/task06d/provider-boundary.mjs
node experiments/task06d/provider-boundary.mjs
& $env:SUPABASE_CLI stop --project-id tio-task06d-boundary --workdir experiments/task06d --yes *> $null
docker ps --filter 'name=tio-task06d-boundary' --format '{{.Names}}'
docker ps -a --filter 'name=tio_task06d_' --format '{{.Names}}'
```

The harness intentionally exits `1` when a security predicate fails; inspect its redacted JSON rows rather than treating that exit as an infrastructure failure. Use an isolated disposable stack only; never point it at a hosted project or existing PoC. Runtime tests were executed only against the versions and config above. The earlier report said the base stack was stopped, but a follow-up `docker ps` check found its four Task 06D containers still running. They were then stopped with `supabase stop --project-id tio-task06d-boundary --workdir experiments/task06d --yes` (volume backup retained). Subsequent Docker checks returned no running base containers and no remaining temporary clone containers. No migrations, hosted changes, production email, Brevo integration, Expo files, commits, pushes or PRs were made.

## Continuation verification — 2026-11-17

The continuation re-read the exact Task 06D harness, local configuration and report. Current official [Auth Hooks documentation](https://supabase.com/docs/guides/auth/auth-hooks) lists Custom Access Token at JWT creation and does not list a password-update hook. The [passwordless Email guide](https://supabase.com/docs/guides/auth/auth-email-passwordless) describes OTP verification as issuing a session. The [Management API config reference](https://supabase.com/docs/reference/api/v1-update-auth-service-config) documents the current-password control but did not establish a managed equivalent of the local `GOTRUE_EXTERNAL_EMAIL_MAGIC_LINK_ENABLED=false` flag. This documentation check does not change the observed local verdict or establish hosted configuration. The [Supabase changelog index](https://supabase.com/changelog.md) was also fetched; no changelog claim substitutes for version-pinned local evidence. GitHub's live `main` compared identical to local HEAD `f0b5102afae4df6589c9a97de720df154cdfabd4`.

An elevated **read-only** `docker ps` check returned no running `tio-task06d-boundary` containers and no remaining `tio_task06d_` clones. The local stack was not restarted, so no new HTTP tests were claimed. The reproduction command now resolves the CLI from `PATH` and checks its pinned version instead of embedding a machine-specific path. Task 06A/06B/06C artifacts were not edited. Independent runtime/security review, managed controls and cutover remain pending; the decision stays **INCONCLUSIVE** for managed Supabase and **FAIL** for the tested native/hook path. Production Auth remains **BLOCKED**.

**Final status: BLOCKED.** `AUTH-17` and `AUTH-12`/`AUTH-22` remain security failures in the tested native path; complete managed strict-policy feasibility is **INCONCLUSIVE** pending a separately approved boundary/cutover proof and independent security review.
