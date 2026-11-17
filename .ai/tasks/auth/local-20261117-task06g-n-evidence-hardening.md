# Phase 1.2 Task 06G-N — local Auth evidence harness hardening

| Field | Verified state |
|---|---|
| Scope | Owner-authorized zero-cost, isolated **LOCAL ONLY** Task 06G evidence hardening; no production Auth implementation |
| Implementation owner | Codex continuation of the existing local Task 06G-L harness; no conflicting writer observed |
| Baseline | `main` / `e4ac4bb3367734575468f36f725626600099dc38` |
| Initial worktree | `## main...origin/main`; no tracked changes; Task 06G-L report and `experiments/task06g/` were untracked and preserved |
| Local runtime | Node `v24.17.0`; pinned CLI `2.121.0`; project `tio-task06g-local-otp`; API `http://127.0.0.1:55621`; Mailpit `http://127.0.0.1:55624`; GoTrue `v2.197.0` |
| Independent review | **REVIEW_PENDING**; no separate reviewer or GitHub approval is claimed |

## Changed-file inventory and preservation

Task 06G-N changed exactly these repository-relative paths:

- `experiments/task06g/assertions.mjs` — response, bearer-probe, session diagnostic and resend classification.
- `experiments/task06g/assertions.test.mjs` — 15 pure assertion tests.
- `experiments/task06g/local-otp.mjs` — same-user concurrent pairs, independent `/user` probes, purpose matrix and dispatch/receipt timing.
- `.ai/tasks/auth/local-20261117-task06g-n-evidence-hardening.md` — this new report.

The [Task 06G-L report](local-20261117-task06g-local-otp-single-use.md), `experiments/task06g/supabase/config.toml`, two email templates and CLI-generated `.branches/_current_branch` / `.temp/cli-latest` were inspected and not edited for this task. All prior Task 06G-L files remain untracked; nothing was staged. `.ai/current.md` still calls Task 06G proposed because it predates the owner's explicit 06G-L/06G-N local-only authorization; this task did not silently rewrite that broader planning pointer. No Expo, hosted project, migration or other Docker stack was changed.

## Assertion changes and classification

| Earlier risk | Hardened rule |
|---|---|
| A `200` was treated as a session, or two `200`s were assumed distinct | A complete response requires expected user UUID/email plus nonempty access and refresh tokens. `GET /user` independently checks each bearer token where available. Two complete authentication responses are **FAIL** for single-use even when their decoded session IDs match. |
| Missing JWT `session_id` could hide a second authenticated response | Missing/malformed claims never erase complete token-pair evidence: two complete responses remain **FAIL**. A one-winner **PASS** additionally needs a session ID, successful `/user` probe and explicit `403/otp_expired` loser. |
| JWT payload could be mistaken for authorization | Decoding supplies only a sanitized session-ID comparison. `/user` checks bearer usability and expected UUID. Distinct IDs are reported only when both bearers independently work; decoded claims alone do not authorize anything. |
| Generic errors or partial responses could pass a negative check | Only the expected `403/otp_expired` with no session passes that negative assertion. Unknown denial, missing refresh token, incomplete `200`, unavailable probe or ambiguous elapsed timing remain **INCONCLUSIVE**. Transport/JSON failures are **ERROR**. |
| Resend timing included mail inspection or one endpoint timestamp | Each HTTP call records dispatch and receipt separately. The acceptance interval is bounded by first receipt to accepted dispatch (lower bound) and first dispatch to accepted receipt (upper bound); Mailpit is used only to retrieve codes. Exact server boundary remains **INCONCLUSIVE**. |

Result vocabulary is `PASS`, `FAIL`, `INCONCLUSIVE`, `NOT TESTED`, `ERROR`. `PASS` means the narrow stated local predicate held; it is not production acceptance. `FAIL` means a reproduced strict-policy violation. `INCONCLUSIVE` means available evidence cannot prove either outcome. `NOT TESTED` means no run for that predicate. `ERROR` means transport, malformed JSON or execution failure. Unit cases cover one winner, two complete responses, a partial `200`, wrong UUID, missing refresh token, same/different session IDs, network/timeout, malformed JSON, missing claims, missing probe and ambiguous timing.

## Executed commands and local outcomes

| Check | Result |
|---|---|
| `git rev-parse --show-toplevel`, `git status --short --branch`, `git rev-parse HEAD`, `git ls-files --others --exclude-standard` | Correct root, expected baseline and exact untracked inventory verified. |
| `node --check experiments/task06g/{assertions,assertions.test,local-otp}.mjs` (three individual commands) | All three **PASS**. |
| `node --test experiments/task06g/assertions.test.mjs` | **15 PASS / 0 FAIL**, rerun after edits. |
| Pinned CLI `--version`, `start --help`, GoTrue image and task ports; elevated read-only `docker ps` | CLI `2.121.0`, cached GoTrue image, task ports free; existing unrelated containers observed without modification. |
| Pinned CLI `start --workdir experiments/task06g --exclude realtime,storage-api,imgproxy,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor --yes` | Exit 0 for only project `tio-task06g-local-otp`. Each harness run independently checked CLI version, local URLs/keys, Auth image, network, container names and ports before requests. |
| `node experiments/task06g/local-otp.mjs` with `SUPABASE_CLI` set to the pinned executable | Three independent **LOCAL ONLY** runs, including one on the final `.mjs` revision. Each exited `1` because reproduced security predicates failed; harness output contained sanitized statuses, booleans and timing only. |
| `git diff --check` | No tracked whitespace error; this does **not** cover untracked files. Separate untracked-file whitespace and secret-pattern inspections are recorded below. |
| Explicit scan of all 10 untracked files, including this report and CLI-generated metadata | `0` trailing-whitespace files, `0` files matching high-confidence literal secret/token/private-key patterns, `0` missing files. Source was inspected separately; a pattern scan cannot prove all secret classes absent. |
| Task 06G-L preservation | Report/config/two templates SHA-256 hashes retained their pre-edit prefixes (`6B4C4703`, `AA26019B`, `745F1948`, `A7A4BE2E`). The untracked files stayed unstaged. |
| Pinned CLI `stop --project-id tio-task06g-local-otp --workdir experiments/task06g` | Exit 0 after each testing period; post-stop read-only `docker ps` found `0` running Task 06G containers and `16` other containers still running. No `--all` or `--no-backup`. |
| Markdown report inspection | Task 06G-L relative link target exists; no code-fence imbalance. |

Only generated `@example.invalid` identities were used. OTPs came from isolated local Mailpit into process memory; passwords and tokens remained in memory. The local service key was used for synthetic Admin user creation only; the password-mutation request itself had no Admin authorization and no current password field. No values of identities, codes, passwords, tokens or keys are published here.

### Concurrent verification and sessions

Every pair created exactly one synthetic user and one OTP challenge, then sent two same-email/same-code `/verify` requests with `Promise.all`. Both requests' HTTP statuses, expected UUID, complete token pair, decoded session-ID diagnostic and independent bearer `GET /user` result were checked.

| Run | Three pair outcomes | Confirmed strict-policy failures |
|---|---|---|
| 1 | `200/403` **PASS**; `200/200` **FAIL**; `200/200` **FAIL** | 2 pairs: both complete responses, both `/user` probes `200` with expected UUID, different decoded session IDs. |
| 2 | `200/200` **FAIL** three times | 3 pairs: same dual-bearer and distinct-session evidence. |
| 3, final code | `200/403` **PASS**; `200/200` **FAIL** twice | 2 pairs: same dual-bearer and distinct-session evidence. |

Thus **7 of 9 pairs failed atomic single-use**. For each dual-response pair `DISTINCT_SESSIONS_CONFIRMED=true` on this local stack. Even if two response IDs had matched, the two complete authentication responses would still have been **FAIL**. Sequential replay was separately `200` then `403/otp_expired` in all three runs; that narrower replay result does not override the concurrent failure.

### Purpose isolation, resend and password mutation

| Predicate | All three runs, sanitized result | Scope limit |
|---|---|---|
| Signup code with `type=recovery` | `403/otp_expired`, no bearer session: **PASS** for this crossing | Proper signup `type=email` then issued a bearer session and `/user` returned the same UUID. |
| Recovery code with `type=email` | `200`, access + refresh tokens, `/user 200`, same UUID: **FAIL** purpose isolation | Direct GoTrue crossover; Tio app authorization **NOT TESTED**. |
| Recovery code with `type=magiclink` | Same authenticated result: **FAIL** purpose isolation | Another supported direct verify type in this local version. |
| Recovery code with `type=signup` | `403/otp_expired`: **PASS** for this crossing | Does not repair the `email`/`magiclink` paths. |
| Recovery code with `type=recovery` | `200`, bearer session and same UUID: **PASS** for expected local API behavior | Recovery session must not be assumed to grant Tio enrollment/Home. |
| Immediate resend | `429/over_email_send_rate_limit`: **PASS** locally | Server acceptance bounded at **60..61 seconds** from HTTP dispatch/receipt in each run. Exact 60-second boundary **INCONCLUSIVE**; network and Mailpit activity are not asserted as server execution time. |
| Old code after accepted resend | `403/otp_expired`; distinct new code `200`: **PASS** locally | Separate from resend interval assertion. |
| Five wrong codes then correct | Five `403` responses followed immediately by correct `200` session: **FAIL** for lock/cooldown | 15-minute unlock boundary was not timed. |
| AUTH-17 existing-password mutation | OTP bearer `PUT /user` `200` with no Admin authorization/current password; old-password grant `400/invalid_credentials`; replacement grant `200`, same UUID: **FAIL** | Local GoTrue only; does not establish managed behavior. |

## Security status and remaining blockers

- **AUTH-12: BLOCKED.** Concurrent single-use and five-failure protection fail. Exact ten-minute expiry and five sends per email/hour remain **NOT TESTED**; one observed resend interval does not prove the complete policy.
- **AUTH-22: BLOCKED.** Correct OTP succeeded after five wrong attempts. Cross-purpose send quotas, flood behavior and 15-minute cooldown boundary are not proven.
- **AUTH-17: BLOCKED.** A live OTP-issued session replaced an existing password without current password. Task 06F's local post-revocation `/user` observation does not protect an unrevoked session.

The current application has no real Auth enrollment or protected Home gate, so Tio application authorization bypass, no-auto-Home, one-account-per-installation, hosted configuration, managed trust boundary, other JWT consumers and safe cutover remain **NOT TESTED**. This report does not turn GoTrue API overlap into a claim of a working app-level bypass. No hosted Auth HTTP request, hosted project/branch, SMTP, Brevo, paid resource, production database change, deployment or Git publication occurred.

**Recommended next security task:** independent read-only review of this exact untracked harness and evidence. After that, seek a separately bounded owner decision on managed-provider boundary proof or another Auth provider. Any controlled OTP design would require atomic purpose-bound server challenges and direct-route negative tests; none was implemented here.

## Decisions

- **Local evidence reliability: PASS** for the bounded three-run, preflight-checked, fail-closed local harness; strict native OTP security itself **FAILS**.
- **Production Auth readiness: NO-GO.** Mandatory controls and managed-hosted trust boundaries remain unproven or failed.

**Final task status: REVIEW** pending independent security review; no commit, push, PR or merge.

## Task 06G-P evidence clarification (2026-11-18)

The historical 7/9 result above is preserved. In those seven pairs, both accepted bearer tokens independently returned `GET /user 200` for the expected UUID, and the decoded JWT `session_id` claims differed. The earlier label `DISTINCT_SESSIONS_CONFIRMED=true` described that **claim comparison**, not independently inspected server-side session records. Task 06G-P renamed the diagnostic to `sessionIdClaimComparison`; server-side session records remain **NOT TESTED**. The two authenticated responses still establish a strict single-use **FAIL**, irrespective of whether their session-ID claims match.

The historical AUTH-17 run did not include a successful original-password login immediately before OTP-bearer mutation. Task 06G-P added that positive control to the harness and unit tests, but did not rerun integration because the observed local CLI stack port binding was not loopback-only. The original mutation observation remains historical evidence; replacement of a *confirmed working* original password in a fresh Task 06G-P run is **NOT RUN**. See [Task 06G-P corrections](local-20261117-task06g-p-evidence-integrity-corrections.md).
