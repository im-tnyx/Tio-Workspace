# H5 — Seed lifecycle and future TEMP readiness

Status: local implementation and offline verification only. This packet is a proposal for a future owner decision, not authorization to call a hosted endpoint. H4 is MERGED / OFFLINE TESTED. Hosted verification remains **0/18**, hosted atomic deletion **UNVERIFIED**, LIVE **BLOCKED**, Production Real Auth **STRICT NO-GO**, hosted mutations **0**, added infrastructure cost **$0**. No Expo Auth or production implementation changed.

Authority: [H5 task](../../.ai/tasks/auth/local-20261127-task06i-b1-h5-seed-temp-readiness.md), [H3 history](../../.ai/archive/2026/local-20261124-task06i-b1-h3-subset-runner-storage.md), [H4 R1–R9 history](../../.ai/archive/2026/local-20261126-task06i-b1-h4-durable-recovery.md), [security](../../docs/04-AUTH-AND-SECURITY.md), [review workflow](../../docs/11-PR-REVIEW-WORKFLOW.md).

## Architecture and identity contract

Option A preserves a pre-existing seed UUID and restores any modified password through the existing verified restoration path. It never acquires disposable ownership through matching email, `user_metadata`, caller labels or a public creation proof.

Option B uses `reserveRunCreatedSeed()` and `provisionRunCreatedSeed()` in [the existing runner](hosted-probe-runner.mjs). One seed per H4 journal is permitted. The module generates a UUID, an independent operation UUID, synthetic `tio-test-h5-<uuid>@proof.invalid` email and a random ephemeral password. The safe plan exposes identity and operation, not credentials. A private WeakMap associates the original plan with the exact inventory. Copies, Proxies, foreign runs and accessor-backed admission fail before dispatch.

The existing Admin adapter performs exact UUID GET404 → POST create with that UUID/email → independent GET200 with the same UUID/email. Its private transport/request observations bind project, run, resource and operation. Conflict, absent or malformed identity, a mismatching post-read, response loss and unknown settlement retain a recovery obligation; no existing account is adopted or deleted. No list/prefix deletion exists. Email is a correlation field, never destructive ownership proof.

`createRunCreatedSeedDispatcher()` reuses the existing probe implementations, deterministic transport and `runOfflineProbeSimulation()`. Its frozen capability is bound to the exact factory inventory, including against a same-run sibling inventory. It does not enable the hosted dispatcher or LIVE. Private seed ownership prevents the automatic Option A protection/reference paths from reclassifying the seed. SESSION-02 on this disposable identity needs no pre-existing-password restoration; its admitted mutation remains scoped to the seed until verified deletion. Option A retains its prior restoration behavior.

### Durable and transient states

| State | Evidence / transition | Cleanup authority |
|---|---|---|
| PRE_EXISTING | Existing protected identity; Option A | Preserve user; restore mutations and revoke correlated sessions |
| CREATION_PENDING | Durable `seed_intent`, exact UUID and operation hash, no create dispatch yet | No Auth DELETE |
| CREATION_INDETERMINATE | Admitted create ordinal; ownership verification absent or unknown | No Auth DELETE; retain intent and attempts |
| CREATION_VERIFIED | Private exact pre/create/post observations persisted as `seed_verified` | Eligible only after Storage and private session gates |
| CLEANUP_PENDING | Transient exact UUID cleanup entered, verified ownership retained | DELETE success alone cannot resolve ownership |
| CLEANUP_VERIFIED | Private exact DELETE plus separate GET404, durable `seed_absence` | Idempotent completion; no second seed DELETE |
| RESIDUAL_BLOCKED | Live operation lacks required evidence or persistence | Preserve evidence and transient recovery material; no false terminal success |

[Journal replay](offline-recovery-journal.mjs) preserves the existing V1 envelope, 512-event / 256-KiB limits, recovery headroom and `h4-<uuid>` namespace. Typed `seed_intent`, `seed_verified` and `seed_absence` events extend it; old H4 events remain readable. All dispatched creation, authentication, read and cleanup attempts remain consumed. A generic resource-resolution event cannot resolve a seed key. Unknown, cancelled, failed mutating or unrelated effects cannot be hidden by seed absence. Seed absence resolves only its exact admitted, successfully settled effects, and requires a successful exact DELETE immediately followed by independent GET404. Private session obligations and unresolved Storage also block the replay transition.

Cold reopening retains the safe UUID, operation hash and ownership state, but never reconstructs a password or tokens. Unknown creation and verified-but-surviving Auth resources therefore return `RECOVERY_REQUIRED / TRANSIENT_AUTH_CREDENTIALS_OR_PROOF_UNAVAILABLE`. There is deliberately no cold Auth reauthentication/deletion authority. After durable seed absence, recovery may finish the terminal event without repeating deletion. Historical attempts and pacing survive restart; no refund occurs.

### Cleanup and credential boundary

Existing Storage proof remains exact project/run/bucket/path/object UUID/owner UUID, private conditional compare-and-delete, followed by an independent authoritative absence read. Replacements and unknown owners survive. Auth deletion waits for Storage quiescence and for private session revocation evidence; clearing public session tracking or adding a revoked flag cannot remove a durable session obligation. Foreign observed Auth identities make seed cleanup ineligible.

Session logout success or precise structured provider rejection must meet the existing H4 evidence contract. Generic authorization errors, prose and token expiration do not establish revocation. Exact Auth absence does not prove immediate invalidation of otherwise unexpired stateless JWTs. Durable resolution precedes terminal completion and credential clearing. Seed passwords are private transient state; diagnostic transport records for seed runs redact password/token/privileged headers. The journal stores no password, OTP, JWT, refresh token, provider key, raw body or sensitive header. Public clients receive no Admin capability.

Application admission and internal module ownership are distinct boundaries. Registered inert fixture data and private receipts are not a complete JavaScript sandbox. A hostile process/host can inspect memory or replace code; the journal digest is integrity checking, not authentication against a malicious host. Offline verification uses Docker `--network none`, no-new-privileges, dropped capabilities, read-only source/root, dedicated `/tmp`, no credentials, published ports or Docker socket. A small isolated offline worker remains a sensible future reduction of process authority, but no worker migration is part of H5.

## Lifecycle coverage

Evidence lives in [H5 regressions](offline-seed-lifecycle.test.mjs), [H4 crash/restart regressions](offline-probe-recovery.test.mjs), [legacy runner](hosted-probe-runner.test.mjs) and the existing conditional Storage and request-budget suites.

| Boundary | Actual offline coverage | Remaining limit |
|---|---|---|
| Admission / intent | Descriptor-first zero-execution sentinels; duplicate/copied/foreign plans; project exclusion; capacity and write failure | No hosted admission authorized |
| Dispatch / settlement | Actual imported Admin/transport paths; lost committed response; pending durable outcome; authentic budget leases | Provider response remains synthetic |
| Identity / ownership | Exact UUID/email before-create-after observations; conflict and malformed identity; caller proof rejection | Hosted explicit-ID create semantics unverified |
| Probe execution | Existing runner HOOK-01/SESSION-01 and SESSION-02/03; private inventory binding | Other scenarios keep their existing readiness classifications |
| Storage | Actual upload/byte/owner verification, conditional delete/absence; replacement and owner mismatch; Auth cascade blocked | Hosted atomic conditional deletion unavailable/unverified |
| Session / Auth cleanup | Durable session gate despite public-state tampering; structured revocation; exact DELETE plus independent absence | Missing credentials, unknown effects or uncertain absence stay residual |
| Crash / terminal | Real process termination before admission, after intent, dispatch, simulated commit, before/after ownership, during authentication, Storage cleanup, logout, Auth DELETE, before resolution and before/after terminal | No automatic cold Auth recovery |
| Persistence / repeat | Intent/outcome/ownership/absence/terminal write faults; leases released; restart and idempotence; forged/duplicate replay rejected | Failed journals require safe close/reopen; never reset accounting |

## Exact shared request costs

Policy remains **25 total attempts**, **1,000 ms standard pacing**, **cleanup reserve0**. Tests use explicitly disclosed `recorded_zero_wait`; this records simulated 1,000-ms pacing, not real hosted wait measurements. Seed admission checks that the five-request minimal lifecycle can fit, but makes no reservation and creates no extra allowance. Later calls can exhaust the same budget; cleanup then fails closed.

The following complete successful paths have no retries or separate credential preflight. Every transport request, including expected404, is counted. Optional Admin credential verification adds password sign-in and correlated logout (2), and must fit in the same25. Storage setup costs5 (Auth user read, pre-upload absence, upload, byte read, owner RPC); Storage cleanup costs2 (conditional DELETE, independent absence). A failure consumes every already admitted request, up to25; it never grants a fixed retry allowance.

| Proposed scenario | Option A requests | Option B requests | Evidence / calculation |
|---|---:|---:|---|
| No probes, no Storage | 0 | 5 | B: preGET/create/postGET3 + exact DELETE/absence2; actual H5 regression |
| HOOK-01 + SESSION-01 | 3 | 8 | sign-in/baseline/logout3; B adds5; actual B regression |
| Same subset + verified Storage fixture | 10 | 15 | previous row + Storage5+2; actual B regression |
| HOOK-01 + SESSION-01 + SESSION-02 + SESSION-03 | 8 | 10 | A: sign-in/baseline2 + update/revocation-read2 + post-reset-read1 + restoration update/sign-in/logout3; B: creation3 + first five probe requests + Auth cleanup2, session already durably revoked; actual B regression |
| Previous row + Storage | 15 | 17 | Source-derived composition, not a separately observed hosted run |
| Prior row + HOOK-02 + SESSION-04 + SESSION-05 | 18 | 20 nominal | Three additional reads/refresh; provider contracts and per-scenario caveats below still apply; not a validated combined B terminal path |
| Existing UUID pre-check collision | N/A | 1 | GET200 stops before create; no deletion/adoption; residual intent remains conservatively visible |
| Create conflict / malformed result / lost response | N/A | 2 | PreGET + attempted create; unknown ownership remains; no DELETE |
| Independent post-create verification mismatch | N/A | 3 | Creation not owned; no DELETE |
| Valid creation, DELETE result unknown | N/A | 4 | Three setup + dispatched DELETE; retain failed/unknown effect; no terminal success |
| Valid creation, absence not established | N/A | 5 | Cleanup remains blocked despite successful DELETE |
| Budget exhausted after setup | Up to25 | 25 | No26th request, no hidden cleanup reserve/refund; explicit residual |

Automatic retries are not proposed. Failed mutating probe/cleanup attempts remain unresolved even if a later call succeeds. A non-creation provider error is not silently treated as no effect. Operator recovery must respect exact evidence and remaining budget.

## Existing18-scenario readiness matrix

Source of IDs and readiness is `HOSTED_PROBE_SPECIFICATIONS`, canonical dependencies and actual `createHostedDispatcher()` cases in [runner](hosted-probe-runner.mjs), not a new matrix of invented probes. Costs below are **incremental probe requests** after prerequisites, excluding the lifecycle totals above. All hosted outcomes remain NOT TESTED. `I` = existing implemented/offline-tested10; `P` = provider prerequisites missing5; `L` = LayerA only / unsupported hosted direct probe3.

| Existing ID | Offline status / seed | Provider prerequisites | Incremental cost | Hosted PASS evidence / cleanup / blocker |
|---|---|---|---:|---|
| BYPASS-01 | I; synthetic A or B | Native OTP disabled; isolated public key | 1 | Actual422 structured disabled error, no tokens; reconcile any unexpected session/user. Failed scoped mutation stays residual in B; exclude from first proposed B run |
| BYPASS-02 | I; synthetic A or B | Signup disabled | 1 | Actual signup-disabled rejection, no created UUID/token; unknown/unexpected user protected. Same B failed-effect limitation |
| BYPASS-03 | P; authorized disposable challenge identity | Genuine delivered OTP + custom access-token hook | 0 admitted now; future path1 | Hook-specific42501 after genuine challenge verification; no email/challenge generation authorized; fake OTP rejection is not PASS |
| BYPASS-04 | P; separately authorized disposable challenge identity | Genuine magic-link/invite token + hook | 0 | Current direct dispatcher returns prerequisite missing without HTTP; cost cannot be validated until provider flow separately defined |
| BYPASS-05 | I; synthetic A or B | Send Email Hook suppresses native recovery; no delivery | 1 | Hook-specific42501, anti-enumeration200 insufficient; same B failed-effect limitation |
| HOOK-01 | I; password A or verified B | Custom token hook; password-confirmed fixture | 1 | Issued JWT identity/session, password AMR and `amr_authenticated`, lifetime≤300; register correlated session, revoke before cleanup |
| HOOK-02 | I; same identity/session from HOOK-01 | Genuine refresh token; hook preserves AMR | 1 | Same exact user/session and valid refreshed claims; retain old/unknown session obligations |
| HOOK-03 | P; authorized OTP identity | Native OTP challenge reaching hook | 0 | Dispatcher prerequisite block; no valid hosted contract path established |
| HOOK-04 | P; authorized magic-link identity | Genuine challenge reaching hook | 0 | Dispatcher prerequisite block; no magic-link/email operation allowed in H5 |
| HOOK-05 | L; no hosted seed | Direct mixed-AMR hook invocation unsupported | 0 | Existing local PostgreSQL negative contract; not a hosted endpoint PASS |
| HOOK-06 | L; no hosted seed | Direct malformed-AMR hook invocation unsupported | 0 | Existing local PostgreSQL malformed/missing-AMR coverage; no hosted direct probe |
| HOOK-07 | L; no hosted seed | Direct hook error/timeout injection unsupported | 0 | Offline contract coverage only; no invented hosted injection endpoint |
| SESSION-01 | I; HOOK-01 same seed/session | Auth GET user accepts exact session | 1 | Durable exact user/session baseline200; retain session credential until verified cleanup |
| SESSION-02 | I; SESSION-01 same seed/session | Admin update + precise revocation behavior | 2 | Password update200 + independent structured session rejection; A restores original password, B deletes only after private session/Storage gates |
| SESSION-03 | I; post-reset same seed/session | SESSION-02 + exact baseline | 1 | Structured session-not-found/revoked rejection with exact correlated baseline; generic unauthorized/expired token insufficient |
| SESSION-04 | I; revoked same seed/session | Private test table/RLS grants and unexpired JWT | 1 | Actual stateless Data API access with exact revoked session and bounded lifetime; fixture deployment still gated |
| SESSION-05 | I; revoked same owner + verified Storage | Private bucket/object ownership, exact run path, unexpired JWT | 1 | Actual Storage consumer response after revocation; preserve conditional cleanup. Combined B terminal path not validated; read classification must not resolve unrelated Storage |
| SESSION-06 | P; revoked same seed/session | Deployed auth-user Edge Function + provider rejection semantics | 0 admitted now; direct fixture path1 | Edge Function precise session rejection, not generic401/403; deployment and evidence absent |

Supported classification describes existing offline probe behavior, not automatic B terminal completeness or hosted readiness. Do not combine all18 into one run to force a PASS. The first future B proposal below deliberately selects only the demonstrated15-request Storage/authentication subset.

## TEMP prerequisite checklist

| Prerequisite | Offline implementation / evidence | Hosted/configuration/authorization status |
|---|---|---|
| Exact target and isolation | Hardcoded TEMP `wvdabiwbaavfggcmpizd`; REAL `bsfwzvgynwriswapxpsp` and Tio-world `oykupyiitspujzpwwvuj` excluded | Hosted identity/ownership verification requires separate owner authorization; all three untouched in H5 |
| Auth settings | Existing route-disablement, password AMR and lifetime contracts tested | Current hosted settings unverified; any Management PATCH is separately gated |
| Token / Send Email hooks | Existing SQL/JS parity and strict structured evidence | Functions, grants, Auth hook configuration and actual invocation need authorized deployment/verification; no email sends |
| Admin/public boundaries | Registered offline Admin capability, project-bound mock credentials, public probe key paths | Real privileged secrets supplied only to future trusted operator; no public client/Admin exposure; no secret persistence |
| Explicit UUID create | Private exact-ID correlation, collision/lost-response fixtures | Pinned GoTrue source supports Admin `id`; installed hosted contract unverified; no fallback to email adoption |
| Test migrations / RPC | Existing fixture SQL/owner lookup contract | Review and separately authorize exact migrations/RPC; H5 applies no hosted SQL |
| RLS / grants / bucket | Exact private run path, verified owner UUID, bytes/digest and negative tests | Actual TEMP grants/RLS, bucket policy and Data API access unverified |
| Conditional deletion | Atomic synthetic identity compare-delete + independent absence tested | **UNVERIFIED / BLOCKED hosted**; no path-only fallback. First Storage-enabled hosted run cannot proceed without a separately verified provider capability |
| Email / rate limits | Synthetic `.invalid` identities, no delivery, every attempt counted | Provider quotas/settings and suppression require separately authorized verification; no SMTP/Brevo/DNS changes or paid credits |
| Budget / capacity |25 total,1000ms pacing,reserve0;512events/256KiB/headroom; restart accounting tested | Future rate limits may require reducing subset; no policy increase authorized |
| Recovery / cleanup | One run-bound journal, private sessions, Storage-before-Auth, exact absence | Cold Auth remains blocked without transient credentials/proof; named operator must retain safe evidence and stop with residuals |
| Process isolation | Hardened network-disabled cached Linux tests | Not a complete in-process sandbox; no hosted credentials mounted in offline tests |
| Retention / rollout | Safe UUID/hash/status/ordinal evidence only; historical H4 record unchanged | Future retention location/operator responsibilities must be approved; no raw JWTs/passwords/bodies in PRs or journals |

Official sources consulted for abstractions, not hosted empirical evidence: [Supabase changelog](https://supabase.com/changelog), [Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [Admin deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes), and [pinned GoTrue v2.197.0 Admin source](https://github.com/supabase/auth/blob/v2.197.0/internal/api/admin.go). No SDK/CLI/image upgrade was performed.

## Future exact-scope TEMP proposal — NOT AUTHORIZED

Decision requested later: approve a named operator, exact TEMP project and one reviewed runtime HEAD for the demonstrated **HOOK-01 + SESSION-01** OptionB subset. A Storage-enabled version is additionally blocked until atomic conditional deletion is verified under a separately approved contract. This proposal grants no credential read, configuration write, deployment or LIVE admission. The current runtime still rejects hosted execution.

| Endpoint / operation | Maximum attempts in successful proposed Storage path |
|---|---:|
| GET `/auth/v1/admin/users/<module-generated-uuid>` before create, after create and after delete | 3 |
| POST `/auth/v1/admin/users`, exact module-generated UUID/email | 1 |
| GET `/auth/v1/user` during Storage owner binding and SESSION-01 | 2 |
| GET `/storage/v1/object/authenticated/task06i_probe_bucket/<runId>/probe.txt` before upload, bytes verification and post-delete absence | 3 |
| POST `/storage/v1/object/task06i_probe_bucket/<runId>/probe.txt`, exact bytes, no overwrite | 1 |
| POST `/rest/v1/rpc/task06i_lookup_storage_object_owner`, exact run path | 1 |
| POST `/auth/v1/token?grant_type=password`, exact seed | 1 |
| POST `/auth/v1/logout?scope=local`, exact correlated session | 1 |
| Conditional DELETE exact Storage path, private object/owner compare | 1 |
| DELETE `/auth/v1/admin/users/<verified-seed-uuid>` | 1 |
| Total | **15** |

The no-Storage subset costs8. No lists, wildcard deletion, unrelated UUIDs, signup/OTP/recovery mail, project lifecycle, Management API, configuration PATCH, SQL/deployment, Brevo/DNS, paid service or production operation is included. Up to10 of the shared25 remain as headroom, not a cleanup reserve or authorization for unspecified calls. With no retries authorized, the successful bound is15 and any failure stops the proposed probes; only already-authorized exact cleanup may consume the remaining total up to25. An unverified resource/effect remains residual rather than expanding the endpoint list.

Operator responsibilities: open durable journal before any effect; independently verify exact target and capabilities; hold transient credentials in memory only; stop on identity conflict, unknown settlement, budget/capacity/persistence error, unexpected email, replacement Storage, generic revocation error or unauthorized endpoint. Reconcile Storage, then sessions, then exact seed, then independently verify absence and persist terminal resolution. If unable, retain sanitized journal and stop; do not reset, adopt an existing account, refund requests or claim success. Rollback means withdrawing the proposed execution and preserving unresolved obligations, not deleting by prefix or bypassing ownership. Separate owner approval is required for any provider deployment/configuration, actual hosted attempt, merge or subsequent implementation slice.
