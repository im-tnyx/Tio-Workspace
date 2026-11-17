# Phase 1.2 Task 06B — independent Auth review and strict-password proof

| Field | Value |
|---|---|
| Status | Security finding confirmed; production Auth BLOCKED |
| Base / local HEAD | `f0b5102afae4df6589c9a97de720df154cdfabd4`; Task 06A and 06B changes uncommitted |
| Branch | `feat/phase12-task06a-local-auth-poc` (existing local branch preserved) |
| Review | Separate read-only agent reviewed Task 06A source; verdict REVIEW / further proof required. Local runtime strict test was executed by the Task 06B operator, not the reviewer. |
| Scope | Dedicated local Supabase/Mailpit and in-memory GoTrue clone only; no hosted, Expo or migration change |

## Evidence and severity

**P0 — current-password flag does not enforce policy B for existing-email OTP sessions.** Local CLI v2.121.0 started GoTrue v2.197.0. An isolated clone on `127.0.0.1:55325` had `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true`, verified in the container configuration. A password-authenticated session received HTTP 400 `current_password_required` without the old password, HTTP 400 `current_password_invalid` with a wrong one, and succeeded with the correct one. The same password-complete account then received a normal `/otp` Email code; its OTP-authenticated session called `PUT /user` without `current_password`, received HTTP 200, and the old password failed while the new password signed in under the same UUID. This is a direct provider API bypass of the intended strict policy, even though normal Tio Sign In is password-only. [GoTrue user update](https://github.com/supabase/auth/blob/v2.197.0/internal/api/user.go) exempts `session.IsRecovery()`; [session source](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/models/sessions.go) derives that from AMR; [authentication-method source](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/models/factor.go) deliberately classifies `OTP`, `MagicLink` and `Recovery` as recovery-capable. Local DB AMR method counts included `otp` and `password`. Hiding OTP in Tio's Sign In UI or adding RLS does not close this Auth endpoint.

**P0 — selected OTP attempt lock remains unenforced.** Five invalid `/verify` calls were rejected, then the correct six-digit code succeeded (HTTP 200). No challenge-specific five-failure lock or 15-minute cooldown was observed. The CLI config has `token_verifications=30` per IP per five minutes and `max_frequency="1s"`, not Tio's 60-second resend, five-send/email/hour, five-failure/challenge and 15-minute cooldown requirements. The local `email_sent=2` setting says it requires custom SMTP, which is disabled. Provider-level IP limits are not per-email/challenge policy enforcement. [Supabase rate limits](https://supabase.com/docs/guides/auth/rate-limits).

## Isolated local test results

| Check | Result | Observed evidence |
|---|---|---|
| New Email → OTP → first Password | PASS, local subflow | First password accepted on the verified same UUID with strict flag present |
| Existing Email + Password | PASS, local subflow | Password grant returned same UUID |
| Strict flag active for password session | PASS | Direct same-password attempt without current password returned `current_password_required` |
| Existing-email OTP cannot replace password directly | **FAIL** | Direct update HTTP 200; old password failed and replacement password worked |
| Wrong current password rejected for password session | PASS | `current_password_invalid`; old password still worked |
| Correct current password accepted for password session | PASS | Explicit change and sign-in worked |
| Explicit Forgot Password recovery | PASS, local subflow | Recovery OTP session changed password without old password; same UUID signed in |
| Interrupted provisional signup | PASS, local subflow | Fresh OTP reverified the surviving UUID; cleanup race not tested |
| Five failed attempts per challenge | **FAIL** | Correct OTP succeeded after five rejected wrong codes |
| 10-minute expiry, 60-second resend, five sends/hour, 15-minute cooldown boundary/concurrency | NOT TESTED / unmet configuration | No full timed or concurrent test; absence of five-failure lock established |
| Hosted Auth setting, hosted email, native persistence and full AUTH-01–31 | NOT TESTED | No hosted setting/test gate, app wiring or device test |

The harness [`experiments/task06b/strict-local.mjs`](../../../experiments/task06b/strict-local.mjs) clones only the local Auth container through the Docker Engine API. Isolation means a separate GoTrue process/config and disposable test UUIDs; the clone shares Task 06A's local database, Mailpit and Docker network. It retains local config, including disposable local secrets, in process memory and passes it to Docker without writing a repository file. Keep Docker inspect and CLI output private. It refuses unexpected local endpoints/image/network and attempts clone removal in `finally`; a separate `docker ps` check confirmed removal. It prints statuses/error codes but no addresses, OTPs, passwords, access tokens or keys. The failed requirements intentionally give exit code 1. The original Task 06A files were not modified.

Final local run: **8 PASS / 2 FAIL** harness subchecks, exit code 1 by design. One PASS is the diagnostic `OTP_BYPASS_REPRODUCED`, which confirms a **security failure**; the separate `DIRECT_NO_CURRENT` requirement is FAIL. These counts must not be read as 8 security requirements passing. `node --check`, `git diff --check`, Markdown rendering and 20 relative links for this record and `.ai/current.md`, balanced fences, trailing-whitespace and literal-secret-pattern scans passed. An initial link-check command had a PowerShell parser error and was corrected before the passing rerun. The dedicated local stack was stopped with backup preserved, and no Task 06A/06B container remained running. No native device, hosted Auth, CI or full acceptance-suite test ran.

## Independent Task 06A review

The separate reviewer found [Task 06A harness](../../../experiments/task06a/local-auth.mjs) source-consistent with 13 PASS / 2 FAIL subchecks; the reviewer did **not** rerun Docker, so the count is not an independent runtime reproduction. The direct overwrite check at lines 160–176 tests the old and replacement passwords. The five-attempt check at lines 178–195 genuinely sends five invalid codes then a valid one. Reviewer findings: a future PASS predicate must assert the specific current-password error and a correct-current-password positive control, because a generic 429 could give a false PASS; an OTP lock PASS must assert challenge-level cause, 15-minute duration, resend/concurrent behavior and expiry independence. Generic-response comparisons do not cover timing/rate-limit enumeration. Task 06B added these password controls and reproduced the OTP bypass; abuse timing/races remain untested. The same reviewer then read Task 06B's new harness and report, confirmed that the source and GoTrue control flow support the bypass conclusion, and flagged the shared local DB/network and diagnostic PASS count clarifications above. This second review also did not rerun Docker or constitute a GitHub review.

## Recommendation and next gate

Keep `Require current password when changing password` **ON as defense in depth if available**, after separately verifying hosted support; it protects password sessions but **does not satisfy owner policy B** while ordinary Email OTP for an existing password-complete account yields a recovery-capable Auth session. Do not rely on `secure_password_change` reauthentication, UI hiding, app-only counters or RLS to close this path. Production Auth stays BLOCKED. The owner must choose policy A (verified mailbox/OTP has recovery authority, with explicit normal Sign In separation and accepted risk) or require a provider-supported design that prevents direct OTP-based replacement while preserving first enrollment and explicit recovery. For policy B, investigate provider-side restriction of existing-account OTP issuance/verification or an alternative server-controlled enrollment/recovery mechanism; prove direct `/otp`, `/verify` and `/user` negative tests before implementation. Do not silently change the product policy.

Separately design atomic server-side per-email send/resend and per-challenge attempt/cooldown enforcement, with generic responses and concurrent negative tests; the current native provider settings alone did not meet Tio's chosen numbers. Only after those decisions and independent security review should a bounded server-owned lifecycle/RLS slice be proposed. No hosted change, SMTP enablement, migration, PR, commit, merge or production release was authorized or performed.
