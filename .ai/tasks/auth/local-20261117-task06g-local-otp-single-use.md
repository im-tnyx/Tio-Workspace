# Phase 1.2 Task 06G-L — local native OTP security proof

| Field | Value |
|---|---|
| Status | **FAIL** for native concurrent single-use and strict Auth policy; **LOCAL ONLY**; production Auth **BLOCKED** |
| Objective | Reproducible direct-HTTP proof of native GoTrue OTP behavior on an isolated, zero-cost local stack |
| Approval | Owner's Task 06G-L instruction in this session: local harness and synthetic local tests only; no hosted, production, paid, UI, migration or Git publication actions |
| Implementation owner | Codex implementation agent, this local slice |
| Previous agent | Task 06F local harness owner; prior artifacts preserved |
| Last commit agent | None; no commit in this task |
| Branch / baseline SHA | `main` / `e4ac4bb3367734575468f36f725626600099dc38` |
| Baseline worktree | `git status --short --branch`: `## main...origin/main`, no preexisting changes |
| Local stack | Project `tio-task06g-local-otp`; CLI `2.121.0`; GoTrue `v2.197.0`; Node `v24.17.0`; API `127.0.0.1:55621`; Mailpit `127.0.0.1:55624` |

## Scope and evidence reused

Read `AGENTS.md`, `.ai/current.md`, Task 06A–06F Auth reports, Task 06A/06D/06F harnesses, `docs/27-OTP-FIRST-AUTH-LIFECYCLE.md`, `docs/08-TEST-PLAN.md`, and accepted Auth decisions in `docs/09-DECISIONS.md`. Task 06A already observed rejected replay/expired OTP but a successful correct code after five wrong attempts. Task 06D found direct unrevoked OTP-session password mutation. Task 06F tested session revocation on local Auth `/user`; it did not establish managed security. These are inherited context, **not fresh Task 06G-L passes**. The [Supabase changelog](https://supabase.com/changelog.md) was checked for version-sensitive changes; its CLI v3 notice is not applicable to the pinned v2 CLI. Current local CLI `--help` was inspected before `start`, `status` and `stop`.

This task used the Supabase and `local-dev-tooling` skills. No dependency was installed. The experiment creates a new project ID and port range, retains prior experiment artifacts, and uses only synthetic `@example.invalid` addresses. OTPs were read only from local Mailpit into process memory. The harness prints only statuses, allowlisted error codes, booleans and elapsed seconds; no OTP, password, identity, token or API key is printed or written to a log/artifact. The service key is used solely in this isolated Node test harness for synthetic Admin user creation; it is not in mobile code.

## Changed paths

- `experiments/task06g/supabase/config.toml` — separate local project, 6-digit/600-second OTP, 60-second email frequency and five-send configuration target.
- `experiments/task06g/supabase/templates/magic_link.html`
- `experiments/task06g/supabase/templates/recovery.html`
- `experiments/task06g/assertions.mjs` — fail-closed result classifications.
- `experiments/task06g/assertions.test.mjs` — six pure assertion tests.
- `experiments/task06g/local-otp.mjs` — direct-HTTP Mailpit/GoTrue harness with CLI, image, network, port and loopback preflight.
- `.ai/tasks/auth/local-20261117-task06g-local-otp-single-use.md` — this report.

No `.ai/current.md`, runtime app, prior research artifact, hosted configuration or other Docker project was changed. No commit, push, PR or merge was made. Independent review is **REVIEW_PENDING**; no formal approval is claimed.

## Commands and sanitized observations

| Command / check | Result |
|---|---|
| `git rev-parse --show-toplevel`, `git status --short --branch`, `git rev-parse HEAD`, `git remote -v`, `git branch --list` | Verified active root, baseline and clean `main`; only `main` and `tnyx/expo-preview` local branches. |
| `node --version`; pinned `supabase.exe --version`; `docker version` | Node `v24.17.0`; CLI `2.121.0`; Docker client `29.9.2`, daemon available with local permission escalation. |
| Pinned CLI `status/start/stop --help`; `docker image inspect`; `docker ps` | Confirmed commands, cached GoTrue image, unique project ID and unused `5562x` ports before starting. |
| Pinned CLI `start --workdir experiments/task06g --exclude ... --yes` | Exit 0. New Auth/Kong/DB/Mailpit containers healthy; expected GoTrue `v2.197.0` and Docker network verified. Required image tags were cached before start; no pull command, paid resource or hosted HTTP call was used. |
| `node --check` on all three changed `.mjs` files | PASS, before and after harness reporting fix. |
| `node --test experiments/task06g/assertions.test.mjs` | 6 PASS, 0 FAIL, twice. |
| `node experiments/task06g/local-otp.mjs` | Two local runs; both exited 1 because security predicates failed as intended. See matrix below. |
| Pinned CLI `stop --project-id tio-task06g-local-otp --workdir experiments/task06g` | Exit 0; no task06g containers running afterwards; 16 other Supabase containers remained running. No `--all` or `--no-backup`. |
| `git diff --check`; explicit whitespace and secret-pattern scan of all seven new files | PASS; no trailing whitespace or matching key/token/private-key literals. `git diff --check` does not inspect untracked files, so the explicit scan covered them. |

Docker published the temporary local ports on `0.0.0.0`/`[::]` even though the harness used only the verified `127.0.0.1` URLs. The stack is now stopped. That binding is a local exposure limitation of this CLI setup, not hosted verification.

## Predicate matrix — fresh Task 06G-L observations

| Predicate | Result | Local evidence / limit |
|---|---|---|
| Six numeric digits | **PASS** | Mailpit code matched exactly six digits in both runs; config set `otp_length=6`. Values redacted. |
| Successful verification consumes code for later replay | **PASS** | Both runs: first `200` with session, subsequent same-code `403/otp_expired` without session. Observational local replay only. |
| Two concurrent verifies never both issue sessions | **FAIL** | Run 1: 2 of 3 pairs returned `200,200`, two sessions. Run 2: 3 of 3 pairs returned `200,200`, two sessions. Thus native GoTrue did not satisfy atomic single-use in this stack. |
| Invalid code rejected | **PASS** | Both runs: wrong `403/otp_expired`, then correct `200` with session. |
| OTP expires after 10 minutes | **NOT TESTED** | Config says `otp_expiry=600`; no fresh 600-second elapsed-time run. Prior 06A expiry evidence is inherited only. |
| Immediate resend denied for 60 seconds | **PASS** | Second run: immediate `429/over_email_send_rate_limit`, later `200` after bounded polling at 60 seconds. First run's timing assertion was too weak and is not counted. |
| New OTP invalidates previous code | **PASS** | Both runs: old code `403/otp_expired`, distinct new code `200` with session. |
| Maximum five sends per email/hour across purposes | **NOT TESTED** | Config target `email_sent=5` does not prove a shared rolling-hour ledger; no five-send elapsed test. CLI config comment says this rate limit requires SMTP enabled, which this Mailpit-only stack does not have. |
| Five wrong attempts lock challenge | **FAIL** | Both runs: five wrong `403`, then correct code immediately `200` with session. |
| 15-minute cooldown after five wrong attempts | **FAIL** | Immediate valid acceptance disproves cooldown onset; 15-minute unlock boundary was not measured. |
| Signup code used as recovery | **PASS** | `type=recovery` rejected `403/otp_expired` in both runs. |
| Recovery code used as signup/email | **FAIL** | `type=email` returned `200` and a session in both runs; recovery purpose is not isolated. |
| Recovery retains same UUID | **PASS** | Second run cross-purpose session still had original UUID; this does not excuse the purpose failure. |
| Issuance cannot enroll/authenticate unintended identity | **NOT TESTED** | Synthetic addresses and UUID equality check do not prove unknown-identity enrollment policy or generic-response behavior. |
| OTP-issued session cannot directly mutate an existing password (AUTH-17) | **FAIL** | Both runs: `PUT /user` `200`; old password grant `400/invalid_credentials`; replacement grant `200` with same UUID. Code consumption and session revocation are different controls. |
| Password reset does not automatically enter Home | **NOT TESTED** | App navigation/UI was out of scope; no production reset flow. |
| One account per installation | **NOT TESTED** | No device binding or local encrypted database in this direct-HTTP experiment. |

The `PASS` rows above are **LOCAL ONLY observations of GoTrue v2.197.0 in this configuration**, not managed/hosted guarantees. In particular, sequential replay rejection does **not** prove concurrent safety. No hosted Auth HTTP test was performed against `bsfwzvgynwriswapxpsp` or another project. No production Auth status is unblocked.

## Native limitations and remaining gates

- **AUTH-12 and AUTH-22 remain BLOCKED:** native concurrent redemption, five-wrong lock/cooldown and recovery-purpose isolation fail in this local proof. Five-send/hour and exact 10-minute expiry still need separate verification. A server-owned atomic challenge ledger and a proven provider boundary would be required to enforce the strict policy; no production OTP gateway was built here.
- **AUTH-17 remains BLOCKED:** the unrevoked OTP-issued session directly replaced an existing password. Task 06F local revocation evidence applies only after actual session deletion and does not neutralize a live session or prove managed behavior.
- The direct-HTTP proof cannot establish no-auto-Home UX, one-account-per-installation device binding, safe provisional signup identity lifecycle, hosted email deliverability, managed Auth boundary, or production cutover. Hosted verification and independent security review remain separate gates.
- No mutation was sent to hosted Supabase. No paid provisioning, upgrade, SMTP, Brevo, EAS, deployment, migration, frontend change or Git publication occurred. Production Auth remains **BLOCKED**.

**Next recommended narrowly scoped action:** independent read-only security review of this exact local harness and its concurrency/purpose findings, then an owner decision on whether to investigate a server-enforced atomic OTP boundary in a separately approved slice. Do not treat this local result as production implementation approval.
