# Phase 1.2 Task 06G-P — Auth evidence integrity corrections

| Field | Verified state |
|---|---|
| Scope | Owner-authorized local-only evidence correction and preparation for a future evidence-only review PR; no production Auth implementation |
| Implementation owner | Codex local evidence correction; Task 06G-N-R was a separate read-only AI-assisted review, not a GitHub approval |
| Baseline | `G:/projects/Tio-Workspace`, `main`, local HEAD = `origin/main` = GitHub `main` = `e4ac4bb3367734575468f36f725626600099dc38`; zero open PRs at bootstrap |
| Initial worktree | No tracked changes; 10 untracked files: Task 06G-L/N reports, three `.mjs` files, `config.toml`, two templates, and two CLI metadata files |
| Product gate | Production Auth **BLOCKED**; AUTH-12, AUTH-17, AUTH-22 **BLOCKED**; managed-hosted Auth enforcement **NOT VERIFIED** |

## Reviewed provenance and preservation

Read `AGENTS.md`, `.ai/current.md`, Task 06A–06F security conclusions, the existing [Task 06G-L](local-20261117-task06g-local-otp-single-use.md) and [Task 06G-N](local-20261117-task06g-n-evidence-hardening.md) reports, the three harness `.mjs` files, local Supabase config and both templates. Task 06G-M was an owner-described **read-only conversational review**; neither a local file nor a GitHub `main` artifact exists. The separate Task 06G-N-R read-only AI-assisted review identified the corrections below; it ran pure assertion tests but did not rerun Docker. Neither conversational review is a formal GitHub `APPROVED` review. No report was fabricated for 06G-M.

All seven intended 06G-L files and the 06G-N report were inspected before edits. The original 06G-L report, config and two templates remain unchanged; CLI `.branches/_current_branch` and `.temp/cli-latest` remain on disk. Tracked Task 06A–06F files had no local diff. The old 06G-L/N runtime observations remain **historical**, with the narrower interpretation below.

## Exact Task 06G-P file scope

| Path | Change |
|---|---|
| `experiments/task06g/assertions.mjs` | Fail wrong-UUID replay; require pre-mutation password control; name session-ID claim comparison precisely. |
| `experiments/task06g/assertions.test.mjs` | Add wrong-UUID replay and failed pre-control regression cases; preserve prior assertion cases. |
| `experiments/task06g/local-otp.mjs` | Collect pre-mutation old-password grant and `/user` proof; emit sanitized per-pair booleans and aggregate counts on future safe runs; reject non-loopback published ports. |
| `.gitignore` | Ignore only Task 06G Supabase CLI `.branches/` and `.temp/` runtime metadata. |
| `.ai/tasks/auth/local-20261117-task06g-n-evidence-hardening.md` | Append a historical-evidence interpretation note without replacing its 7/9 observations. |
| `.ai/current.md` | Reconcile local-only Task 06G authorization, evidence, review, correction status and live baseline. |
| `.ai/tasks/auth/local-20261117-task06g-p-evidence-integrity-corrections.md` | This new report. |

The Task 06G-L report, `config.toml`, both templates and Tasks 06A–06F are not modified. Nothing was staged, committed, pushed or published.

For a future evidence-only PR, the full intended inventory is these seven changed files **plus** the preserved Task 06G-L report, `config.toml`, `magic_link.html` and `recovery.html`: **11 files total**. The two CLI metadata files remain on disk but are excluded. File selection must be checked again before any future staging. *(Superseded after publication: PR #30 now changes **13** files; see the PR #30 post-review addendum below.)*

## Review findings and corrected classifications

| Finding | Previous evidence/classification | Corrected rule and current proof |
|---|---|---|
| Replay with unexpected authenticated UUID | `classifyReplay` could return `INCONCLUSIVE`. | Task 06G-P originally made any wrong UUID `FAIL`, including a partial `200` without tokens. Task 06G-P-R identified this overclassification; Task 06G-Q requires a complete authentication response or independent bearer `/user` proof before wrong identity is `FAIL`. A partial `200` without that evidence is `INCONCLUSIVE`; transport failure without decisive identity evidence is `ERROR`. |
| AUTH-17 password replacement control | Historical local runs: OTP bearer `PUT /user 200`, old grant `400/invalid_credentials`, new grant `200` same UUID. The old password was not positively authenticated before mutation in this particular harness. | New harness first requires old-password grant `200` with access + refresh tokens, expected UUID and independent `/user 200` on that bearer. If this control fails, mutation is not attempted and the result is `INCONCLUSIVE` (transport/JSON failure is `ERROR`). **No new runtime result** is claimed for the corrected path. Historical local AUTH-17 violation remains a finding from 06G-L/N and prior 06A–06F; stronger Task 06G-P replacement proof awaits a safe run. |
| Distinct sessions wording | Old output named `DISTINCT_SESSIONS_CONFIRMED=true` for two accepted bearers with different decoded JWT `session_id` claims. | New output says `sessionIdClaimComparison=same/different/unavailable` and `serverSessionRecords=NOT TESTED`. Two `/user`-accepted bearer tokens are separate authentication observations; no Auth database session rows were inspected. Strict single-use is still `FAIL` for two complete responses even when claim values match. |
| Historical concurrent total | 06G-N recorded 7 `FAIL` pairs among 9 same-challenge pairs across three local runs. | **Unchanged historical finding.** No new Docker run or invented per-pair telemetry. The old result is source-consistent, not independently rerun by the 06G-N-R reviewer or this correction task. |

### Historical sanitized concurrency record

The table transcribes only statuses and probe outcomes already present in the previous local command outputs. It is **not** a newly captured immutable runtime artifact. New code emits per-response expected-UUID, access/refresh presence and `/user` acceptance booleans, the claim-comparison category, run label, local project/image and aggregate counts for any future safe run; it never emits IDs, codes, passwords, JWTs, refresh tokens or keys.

| Run/pair | Verification HTTP | Bearer `/user` HTTP | Historical result |
|---|---|---|---|
| 1/1 | `200,403` | `200,not_probed` | `PASS` |
| 1/2 | `200,200` | `200,200` | `FAIL` |
| 1/3 | `200,200` | `200,200` | `FAIL` |
| 2/1 | `200,200` | `200,200` | `FAIL` |
| 2/2 | `200,200` | `200,200` | `FAIL` |
| 2/3 | `200,200` | `200,200` | `FAIL` |
| 3/1 | `200,403` | `200,not_probed` | `PASS` |
| 3/2 | `200,200` | `200,200` | `FAIL` |
| 3/3 | `200,200` | `200,200` | `FAIL` |

The prior output reported expected UUID matching for accepted responses, complete token-pair counts and differing decoded session-ID claims on the seven dual-authenticated pairs. Exact raw tokens, OTPs and UUIDs were never retained here. The table must not be presented as independent server-session-row proof.

## Validation and safe local integration decision

| Check | Result |
|---|---|
| `node --check` on all three changed `.mjs` files | **PASS**. |
| `node --test experiments/task06g/assertions.test.mjs` | **16 PASS / 0 FAIL** after assertion corrections. |
| `git diff --check` and separate whitespace inspection of all untracked intended files | **PASS**; `git diff --check` alone does not cover untracked files. |
| High-confidence literal secret-pattern scan of all 11 intended files | No key, JWT or private-key match. No real identity was found; `config.toml` retains only its existing commented CLI `admin@email.com` example. This bounded scan cannot prove every possible secret format absent. |
| `git check-ignore -v` on Task 06G `.branches/` and `.temp/` | Both runtime metadata paths are ignored by exact Task 06G patterns; files retained locally. |
| Read-only `docker ps --filter name=tio-task06g-local-otp` | `0` Task 06G containers running; no container was started or stopped in this task. |
| Corrected Task 06G-P integration run | **NOT RUN**. Task 06G-L recorded Docker publishing task ports on `0.0.0.0`/`[::]`. A loopback-only host binding is not established, so starting that stack would violate the owner's LAN-exposure condition. The harness now rejects any non-loopback published port if a stack is presented. |

The static preflight still requires the pinned CLI `2.121.0`, project `tio-task06g-local-otp`, exact loopback API/Mailpit URLs, GoTrue image `public.ecr.aws/supabase/gotrue:v2.197.0`, expected containers/network and ports. **These requirements were source-reviewed, not runtime-verified anew in 06G-P.** No hosted Auth, Brevo, SMTP, paid service, production data, Expo UI or other Docker project was touched.

## Remaining gates and decisions

- **AUTH-12 / AUTH-22: BLOCKED.** Historical local dual redemption and five-wrong-then-correct acceptance remain security failures. Exact ten-minute expiry, five-send shared quota and 15-minute unlock boundary remain unverified.
- **AUTH-17: BLOCKED.** Historical OTP-bearer mutation finding remains. The new pre-mutation positive control is unit-tested but has **no safe integration result** yet. Previously issued sessions and managed-hosted cutover remain separate questions.
- Managed-hosted Auth boundary, other JWT consumers, Tio app authorization/Home gate, account binding and production readiness remain **NOT VERIFIED** or **NOT TESTED**. Evidence-only PR review would not authorize Auth implementation.

**Task 06G-P historical self-assessment:** evidence-only PR readiness was marked READY for review with the `NOT RUN` limitation. The independent Task 06G-P-R review subsequently found the partial wrong-UUID classification defect and marked the PR gate **BLOCKED**. Task 06G-Q corrects that defect locally; current PR readiness awaits independent read-only re-review. The App-owned attribution check, one GitHub approval, required threads and owner merge authorization remain separate gates. No branch or PR was created.

**Production Auth readiness: NO-GO.** Corrected assertions do not correct GoTrue behavior. No commit, push, PR, merge, deployment or paid operation was performed.

### Task 06G-Q classification addendum

The Task 06G-P-R read-only reviewer reproduced a `FAIL` from a wrong-UUID `HTTP 200` body with no tokens and a recognized OTP rejection. Task 06G-Q moved identity failure behind complete access/refresh response evidence or an independently successful bearer `/user` probe. Missing one or both tokens without that probe now yields `INCONCLUSIVE` in both replay and concurrent classifiers; a wrong UUID with confirmed authentication remains `FAIL`. The new targeted regressions and complete assertion suite passed **18/18** on the local files. This is an offline classifier correction; Auth HTTP integration remains **NOT RUN**, the historical 7/9 finding is unchanged, and no current PR-readiness decision is made here.

### Task 06G-R classification correction (2026-11-18)

The independent Task 06G-Q-R review found that `/user HTTP 200` without a usable UUID could be marked `WRONG_IDENTITY` because an absent `id` compared unequal to the expected UUID. Task 06G-R now requires structurally valid expected, verification-response and `/user` UUIDs before comparing identity. A `/user 200` with missing, null, empty, wrong-type or malformed `id`, a nested malformed user object, or invalid JSON does not establish a wrong authenticated identity; with one otherwise complete response and a recognized OTP rejection it is **INCONCLUSIVE**. A valid different `/user` UUID with a bearer remains **FAIL**; a valid matching probe supports **PASS** only when the other response is a recognized rejection and all existing session evidence is complete. Verification transport/JSON failures remain **ERROR**. New offline regressions cover these cases in replay and concurrent orderings; the complete assertion suite passed **22/22**. This correction did not rerun Auth HTTP integration, alter historical 7/9 concurrency or AUTH-17 observations, verify server-side session records, or change the LAN-binding blocker. AUTH-12, AUTH-17 and AUTH-22 remain **BLOCKED**; managed Supabase remains **NOT VERIFIED**; Production Auth remains **NO-GO**. PR readiness awaits independent review.

### PR #30 post-review correction addendum (2026-11-18)

**Publication.** The 11-file scope above was committed as `0b87e16023c82a58947d1c445bf0d8a525ce63cd` in [PR #30](https://github.com/im-tnyx/Tio-Workspace/pull/30) (branch `docs/task06g-local-auth-evidence`). The statements above that nothing was committed, pushed or published, and that no branch or PR was created, are **historical** for Tasks 06G-P/Q/R. Three later code-only commits addressed automated review findings:

| Commit | Change | Files |
|---|---|---|
| `599127c2a057be00a7b4cc45e4daa2a862c594e4` | Five-wrong cooldown requires five recognized OTP rejections; old-code authentication fails independently of new-code result (plus two Cursor Bugbot findings) | `assertions.mjs`, `assertions.test.mjs`, `local-otp.mjs` |
| `1f46fdd3c9fb98761340f5451cb0799ea2ba3665` | Loopback preflight validates **every** container on the project network (incl. Studio/analytics); probe-error ordering (Cursor Bugbot) | adds `loopback-preflight.mjs`, `loopback-preflight.test.mjs`; edits `assertions*.mjs`, `local-otp.mjs` |
| `22f95c3ee1161b444ee9723ed337b70e6e73e60d` | Decisive wrong-/old-code authentication evaluated before later transport/probe failures | `assertions.mjs`, `assertions.test.mjs`, `local-otp.mjs` |

PR #30 therefore changes **13 files**: the 11 above plus `experiments/task06g/loopback-preflight.mjs` and `experiments/task06g/loopback-preflight.test.mjs`.

**Review-finding disposition (offline classifier level only):**

| Finding (reviewer) | Disposition at `22f95c3` | Regression coverage |
|---|---|---|
| Cooldown FAIL without five recognized rejections (Codex P2) | Fixed: `classifyFiveWrong` requires five explicit `403/otp_expired` rejections; 429/5xx/generic 4xx → `INCONCLUSIVE` | `assertions.test.mjs` "five-wrong cooldown requires five recognized OTP rejections" |
| Old-code acceptance masked by new-code result (Codex P2) | Fixed: authenticated old code → `FAIL` before any new-code or transport check | "old-code invalidation fails independently of new-code verification"; "decisive old-code evidence precedes later transport failures" |
| Loopback preflight checked only four containers (Codex P2) | Fixed: all project-network containers must publish only on `127.0.0.1`/`::1` | `loopback-preflight.test.mjs` (Studio and analytics LAN-publish cases) |
| Wrong-code authentication hidden by later transport failure (Codex P2) | Fixed: authenticated wrong code → `FAIL` before transport/probe errors | "decisive wrong-code evidence precedes later transport failures" |
| Generic 4xx could pass AUTH-17; wrong OTP success marked inconclusive; probe errors hid OTP failures (Cursor Bugbot) | Addressed in code; GitHub threads resolved | AUTH-17 and wrong/old-code ordering tests |

**Validation.** `node --check` on all five `.mjs` files: PASS. `node --test experiments/task06g/assertions.test.mjs`: **28/28 PASS**; `node --test experiments/task06g/loopback-preflight.test.mjs`: **5/5 PASS** (offline only). Corrected Auth HTTP integration remains **NOT RUN**; whether the local Supabase CLI stack can be started loopback-only remains unestablished.

**Evidence boundary.**

| Evidence class | Status |
|---|---|
| Historical LOCAL ONLY GoTrue `v2.197.0` observations (7/9 dual redemption, five-wrong-then-correct acceptance, purpose crossover, AUTH-17 mutation) | Preserved unchanged; not re-run |
| Corrected classifiers (offline unit tests) | PASS; classifier correctness only, not Auth behavior |
| Corrected local integration run | **NOT RUN** |
| Managed-hosted Supabase Auth | **NOT VERIFIED** |
| `bsfwzvgynwriswapxpsp` | Not contacted |

AUTH-12, AUTH-17 and AUTH-22 remain **BLOCKED**; Production Auth remains **NO-GO**. Merge requires one formal approving GitHub review, resolved review threads, the required App-owned check on the final head, and separate owner merge authorization. Merge would not authorize Auth implementation, hosted experiments or spending.
