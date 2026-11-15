# 🧾 Proposed ADR-019 — Minimal cloud profile and local fitness onboarding

**Status:** Proposal for owner review — requested field/screen order recorded on 2026-11-15; **not an accepted migration or implementation authorization**

**Scope:** Phase 1.2+ Auth/profile specification and later local onboarding contract

**Project:** Tio Workspace / Supabase Tio-Tnyx (`bsfwzvgynwriswapxpsp`)

[← Docs hub](00-INDEX.md) · [Decision register](09-DECISIONS.md) · [Auth & security](04-AUTH-AND-SECURITY.md) · [Local data model](03-LOCAL-DATA-MODEL.md) · [Readiness gate](21-PHASE-1-READINESS.md)

> [!IMPORTANT]
> The owner requested a minimal **private Supabase account profile** plus a **device-local fitness profile**. This changes the previously documented Auth-only server boundary. It does **not** enable workout sync, backup, real Auth, new tables, data transfers or code changes. Before build, obtain a separate implementation-slice approval and approve the privacy/schema/security gates below.

## Context and owner-requested UX

Phase 1.1 is a nonfunctional Expo mock shell. The current preview shows `Email → OTP → Password` for signup, while [ADR-017](23-INPUT-LIMITS-OTP-AND-FUTURE-MEMBERSHIP.md) specifies `Email + Password → OTP` as the authoritative Auth contract. The owner has fixed the signup sequence and now wants **Mobile as an optional field inside Account Setup alongside required Username**, not a standalone Mobile screen. **Name remains a dedicated screen immediately after Account Setup. DOB and Sex are required; Mobile alone is optional** among signup/profile fields. All local fitness fields listed here are required for this proposed onboarding.

### Proposed first-time screen order

| Order | Screen | Inputs / behavior | Required | Destination |
|---:|---|---|---|---|
| 1 | Splash | Existing bound identity and session gate | — | Device |
| 2 | Welcome | Get Started / Log In | — | UI |
| 3 | Email | Valid email address | Yes | Supabase Auth |
| 4 | Email OTP | Verify emailed code server-side | Yes | Supabase Auth |
| 5 | Password | Set password (8–64 selected limit) | Yes | Supabase Auth |
| 6 | Account Setup | **Username required** (3–16 graphemes) + **Mobile optional** on the same screen; mobile can be left blank | Username: Yes; Mobile: **No (only optional field)** | Private cloud profile |
| 7 | Name | **Separate full-name screen directly after Account Setup** | Yes | Private cloud profile |
| 8 | DOB | Date of birth, not a permanently stored age integer | Yes | Private cloud profile |
| 9 | Sex | Required sex/reference input; precise wording and permitted options still need privacy review | Yes | Private cloud profile |
| 10 | Units | Metric / Imperial display preference | Yes | Local |
| 11 | Height | Height, stored canonically in centimeters | Yes | Local encrypted SQLite |
| 12 | Current Weight | Starting weight, canonical kilograms and dated measurement | Yes | Local encrypted SQLite |
| 13 | Activity Level | Selected activity category | Yes | Local encrypted SQLite |
| 14 | Goal | Lose / Maintain / Gain | Yes | Local encrypted SQLite |
| 15 | Final Setup | Centered progress circle **with a centered % value when measurable** while finishing real setup; replace percentage with a centered checkmark and **“You're all set!”** only after verified save; then reveal bottom **Continue** | — | Device-local completion gate |
| 16 | App Entry | **Continue** opens Home for the same verified and locally bound account | — | Local |

Welcome includes Get Started; do not add a redundant separate Get Started page. Sign-in is a separate returning-user path. Final user-facing strings remain English-only for the current MVP per ADR-018.

### Final setup completion screen — owner-selected reference behavior

The owner supplied two screenshots as **interaction/composition references only**. **Do not reproduce their ratings, testimonials, stars, laurels, carousel, pagination dots, promotional statistics, logos, colors or font.** Follow Tio's own approved neutral/system-font theme rather than cloning that app.

| State | Center content | Bottom action | Entry condition |
|---|---|---|---|
| **Finalizing** | Centered circular progress ring **with the real numeric percentage (e.g. 25%, 50%, 75%) inside the ring when measurable**, and **“Personalizing your experience…”** beneath it | **Continue hidden** | After the user submits Goal; finish the already authorized, required profile/local saves and onboarding completion verification |
| **Done** | The ring reaches **100% only after actual completion** and replaces the center percentage with a prominent **checkmark / done** symbol; **“You're all set!”** appears beneath it | Reveal bottom safe-area **Continue** button | Only when all required verified cloud-profile, correct account binding, local fitness data and onboarding-complete marker are durably saved |
| **Failure / interruption** | Honest error and recovery state; retain existing inputs | **Retry**, not Continue | Save, local DB unlock, identity, or completion check fails; never display success for a timer or fake progress |

- Present **both states on the same final onboarding screen**, not as separate navigation routes. The progress circle and text remain near the visual center; Continue appears only after success in the safe-area bottom action region. Keep screen uncluttered.
- **Percentage belongs inside the circular ring, centered and readable**. Derive it from a defined set of actual completed setup/save/verification steps (completed checkpoints ÷ total checkpoints × 100, consistently rounded), not elapsed time. Keep it monotonic across the same finalization attempt and reserve **100% for verified durable completion**. If no trustworthy numeric progress is available, show an **indeterminate ring without a fake percentage**. No arbitrary percentages, timer-driven progress, or fixed waiting animation. When saves finish immediately, show Done directly or transition immediately; do not delay Home for marketing.
- The indicator **may animate** from a center percentage to the checkmark with accessible reduced-motion fallback. Expose a meaningful progress value to assistive technology when known (for example, “Setup 50 percent complete”), and “Setup complete” when done; the success state and button must remain reachable with large fonts and screen readers on Android/iOS.
- **Continue remains hidden/disabled until genuine completion.** Do not mark onboarding done until after confirmed durable local writes; preserve a safe idempotent resume if the app closes during finalization. Failure should allow retry without duplicated body-weight measurements or wiped profile data.
- Returning verified users with completed onboarding **bypass** this first-run completion screen, including approved offline reopening. It must not require an artificial cloud call, any ratings/testimonials, cloud workout upload or a generated AI plan.



**Fixed owner decision — do not change the screen order:** **Email → OTP → Password** must remain the first-time signup UI sequence. Technical feasibility is still a required implementation gate: validate Supabase email OTP account verification, production template/configuration, protected session establishment and authenticated password setup/update **in that exact order**. If a secure supported mechanism is unavailable, block implementation and escalate the provider/architecture issue; **do not reorder to Email → Password → OTP** or fake OTP verification. New workouts never unlock before real server-side email verification and password/session setup.


### Uploaded Flutter reference — architecture hint only

The provided `account_setup_providers.dart` contains `completeAccountSetup({String? mobile})` delegated to a Supabase-backed account-setup repository, showing that an **optional mobile parameter can be persisted during Account Setup**. It also exposes separate `hasTrustedEmailIdentity` and `hasTrustedPhoneIdentity` states; merely collecting mobile **does not make it verified**, and this Tio proposal does not require phone OTP. This adapter contains **no actual Account Setup UI**, so it does not establish how mobile or username were drawn on screen. The provided `account_setup.dart` only re-exports modules, while `pre_auth_app_mode_route.dart` handles a separate pre-auth App Mode preference; do not import its Flutter/Riverpod structure, add an App Mode step, or assume its navigation for Tio's **Expo/React Native** app. No uploaded source is copied into this repository.

## Cloud boundary: minimum account identity

- `auth.users` is the source of the immutable `user_id`, canonical email and managed password credentials. **Never store plaintext passwords, password hashes, OTPs or session tokens in `public.profiles`.**
- Proposed **one private** `public.profiles` row per verified account: `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`; `username TEXT NOT NULL UNIQUE` (normalization/collision details to approve); `full_name TEXT NOT NULL`; `date_of_birth DATE NOT NULL`; `calculation_sex TEXT NOT NULL` (allowed values to decide); `mobile_number TEXT NULL`; `created_at/updated_at TIMESTAMPTZ`.
- Avoid copying email from `auth.users` into `profiles`; never use email/username as the local database ownership key. Phone is **not** used for phone login/verification in this proposal, and its format/normalization must be specified if entered.
- Because DOB and sex are personal/sensitive fitness-related data, specify purpose, privacy notice, retention, profile edit/delete, account deletion and potential age restrictions **before production**. Do not equate mandatory sex with inferred gender identity. No public username lookup/search and no public profile access by default.
- Supabase `public.profiles` is a **proposed change to existing cloud boundary**, not yet deployed. Require appropriate `GRANT` and owner-bound Row Level Security (SELECT/INSERT/UPDATE/DELETE as authorized), explicitly deny cross-account reads/writes, protect immutable `id`, and test unique/invalid field behavior. Never authorize via editable `user_metadata`.
- Creation after verification must be safe to retry/idempotent. A partial profile cannot unlock a different bound account or expose a workout database. Do not claim that a signup trigger exists or is safe without implementing/testing it.

## Local boundary: fitness and offline behavior

- `user_preferences`: `preferred_unit_system` (metric/imperial) with canonical conversion rules. Unit selection changes display, not stored numeric meaning.
- Proposed account-bound local `fitness_profile`: `user_id`, `height_cm`, `activity_level`, `body_goal`, `updated_at`. Validate reasonable ranges without silently modifying entered measurements. No height on Supabase.
- `body_measurements`: an initial `weight_kg` reading plus time, with future changes appended as history; preserve user edits/trends. Existing proposed table already includes body measurements, but new fields/migrations need a separately approved contract.
- Proposed local `onboarding_progress`: account-bound stage and `completed_at`; persist safely after each successful stage. Store on the correct, already-verified bound installation only; design how to resume partial cloud-profile and partial local setup without leaking cross-user values.
- Use the selected Expo SQLite + Drizzle + **native-verified SQLCipher** approach after the single verified `auth.users.id` is bound. A mock form, in-memory state or AsyncStorage is **not** a verified encrypted fitness database. Do not promise SQLCipher until native tests pass.
- No default workout plans, sets, reps, sessions, history, goals, measurements or derived analytics are uploaded to Supabase. A private identity profile is distinct from future paid/opt-in workout Sync and user-owned Personal Backup.
- Existing verified same-bound user reopens **directly to Home** if onboarding is complete, including eligible offline reopening. Incomplete onboarding resumes its actual unfinished stage. Only first-time verification and unsaved cloud profile writes need network; do not block previously initialized local workout logging just because a cloud profile refresh fails.
- Sign-out locks the existing bound local data and keeps it for same-account relogin. A different Supabase UUID cannot gain access; separate confirmed erase/reset remains necessary. Reinstall or lost device without backup may lose workouts even if the cloud identity/profile can be retrieved.

## Proposed abandoned-signup account retention and cleanup policy

**Policy status: proposed owner-review baseline, not running.** The objective is to remove genuinely abandoned **Supabase Auth accounts**, not merely delete blank profile rows, while preserving any account that may own device-local workouts. Cloud Auth storage usage alone does not justify deletion of an active/activated account. All durations and hard-delete behavior require explicit approval before deployment.

| Lifecycle state | Proposed deadline | May server auto-delete? |
|---|---|---|
| **Pending email verification**: an Auth user row exists, but server-confirmed email ownership has never been established | **7 days** from Auth-account creation, with no new verified activity | **Yes, eligible** only with hard server-side preflight proving no verification, protected activation, profile or local binding eligibility; if provider never created an Auth user, there is no row to remove |
| **Verified but abandoned setup**: email verified, but password stage or required cloud Username/Name/DOB/Sex profile remains incomplete; never activated/eligible for local account binding | **30 days** of inactivity (and at least 30 days from creation); send a **7-day advance warning** to the already verified email when possible | **Conditional**: only if server-authoritative lifecycle evidence proves this UUID has **never** been activated, bound, or permitted to write a local encrypted database; otherwise **do not delete** |
| **Cloud profile complete / activation granted**: valid required profile and server-acknowledged protection marker written **before** first account-bound local database access | **No automatic expiry**, even if the device-local Units/Height/Weight/Activity/Goal onboarding remains unfinished | **Never** via abandoned-signup cleanup |
| **Fully onboarded / established / returning user** | **Not eligible for abandoned-signup cleanup** | **Never under the 7/30-day signup cleanup rules.** A separately reviewed **12-month inactive free-account proposal** appears below; it is not approved or running |

### Authoritative lifecycle and safety conditions

- Proposal for minimal **server-owned, non-public registration lifecycle state** keyed by immutable `auth.users.id`: creation time, verified-email timestamp, password-created marker if needed by the exact OTP-first provider flow, required cloud-profile completion, **activation-protected-at**, last trusted server-side resume/action time, warning sent time and any pending-cleanup status. This could be a tightly protected private lifecycle table or trusted server-owned account metadata; **choose the smallest reliable schema during approval**, not editable `user_metadata`. Timestamps must use server time. Do not use a mobile-only `onboarding_progress` row as proof for irreversible server deletion.
- **Critical invariant:** Before the app may bind a Supabase UUID to an installation, open an encrypted local workout database, or permit offline access, the backend must durably mark that UUID as **protected/activated**. If this cannot be guaranteed due to offline/network ordering or a partial failure, **fail closed on automatic deletion**, not on the user's already-authorized local workouts. Once protected, never auto-delete for unfinished local onboarding.
- An Auth row missing `public.profiles` is **not enough evidence** of abandonment; local startup, offline login and reinstall may not contact Supabase. Never infer abandon from `last_sign_in_at`, lack of profile fields, app uninstall, lack of a heartbeat, expired JWT, lack of recent server calls, or 30 days offline by themselves.
- If the verified incomplete user's 7-day warning is delivered at roughly **day 23 of unchanged inactivity**, resuming onboarding or completing the required cloud profile cancels cleanup; reset the inactivity deadline based on **trusted server-observed activity**. Warnings must avoid revealing sensitive DOB/Sex or other personal data and should not go to unverified addresses merely because a user typed them.
- The daily server job must **first run in audit-only/dry-run mode** and then, if separately enabled, select a small batch, prove all eligibility predicates, block pending candidates from concurrent activation, re-check the exact UUID and completion/activation marker immediately before deletion, and **skip on ambiguity, errors, network/timeouts or races**. Maintain minimal non-PII deletion counts and error/audit outcomes, restrict retries and rate limit the job. No client-selected email, username or other mutable identifier may authorize deletion.
- Implement destructive cleanup **only on a trusted server** (for example, Supabase Cron invoking a properly authenticated Edge Function using a protected server-side credential). Use the official `auth.admin.deleteUser(user_id)` administrative API after review; never expose the Supabase secret/service-role key in Expo, arbitrary client RPCs or public Edge Function endpoints. Handle cascade to `profiles` and lifecycle records with reviewed foreign keys and deletion tests. Never directly delete rows from Supabase-managed `auth.users` by client SQL.
- For eventual hard delete, review owned Storage objects and other foreign keys first; Supabase may reject deletion while objects are owned. **Soft delete is not equivalent to reclaiming abandoned Auth rows**. JWTs previously issued may remain usable until expiry, so new protected server operations must check authorization and deletion/session state as appropriate. Do not promise immediate worldwide token invalidation.
- A deleted abandoned signup must start a **fresh verified registration** if the same email returns later. Do not falsely promise restoration of old UUID, protected installation binding or device-local data. If any evidence of earlier binding/local data exists, the cleanup candidate is ineligible and must be reviewed rather than deleted.

**Required owner decisions before enabling abandoned-signup cleanup:** whether 7/30 days and 7-day warning are acceptable, where the minimal server-authoritative protection marker lives, how first local account binding is made race-safe, how to represent an OTP-verified-but-password-incomplete identity without creating guest workout access, email/warning deliverability, hard-delete/recovery wording and the server-only job's security controls. **Established free-user expiry is a distinct high-risk proposal below; the abandoned-signup protection rule must not be silently reused to authorize deletion of previously activated local users.** The owner has requested a cleanup policy but has **not** approved live deletion or infrastructure changes.

**Official implementation references (recheck before deployment):** [Supabase Admin deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser) · [Managing user data / deletion caveats](https://supabase.com/docs/guides/auth/managing-user-data) · [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) · [Supabase Cron](https://supabase.com/docs/guides/cron).

## Proposed inactive established FREE-account retention — separate owner risk gate

**New owner request (2026-11-15):** Even a **fully registered/previously active FREE-plan user** who later stops using Tio or uninstalls it should eventually have an unused Supabase account cleaned up after **6 months or 1 year**. **Recommended documentation baseline: 12 months, not 6 months, before any irreversible removal.** This would be a new, **separate account-retention policy**, NOT an extension of the safe 7/30-day abandoned-signup deletion rules. **No live account expiry or job is approved.**

| Case / checkpoint | Proposed action | Status |
|---|---|---|
| Registered free user **active** or with recent authenticated server activity | Keep account, reset inactivity clock from trusted online account activity | Proposed |
| **6 months** since last trusted online account activity | Mark as potentially dormant and optionally send a **retention reminder** to their verified email; **do not delete** | Proposed |
| **11 months** since last trusted online account activity | Give a clear **at-least-30-day advance deletion warning** to the verified email explaining loss of identity and possible loss of local workouts; allow authenticated **Keep my account / Reactivate** | Proposed |
| **12 months** with no further trusted online account activity | **Eligibility for review only**, not unconditional deletion: no paid entitlement; full notice/grace satisfied; privacy/restore/security protections below independently approved; race-safe last-minute checks | **High-risk blocker until accepted and validated** |
| Paid member / later Sync account / user under explicit hold | Do not expire under FREE policy; separate future membership, retention and deletion rules | Proposed exclusion |
| User signs in, confirms Keep my account, or resumes qualifying authenticated online use | Cancel pending expiry and reset deadline without touching the device-local database | Proposed |

### Why a Tio free account cannot be erased blindly

- **Uninstall detection is not reliable.** The app generally cannot tell Supabase whether a user uninstalled Tio or has spent a year actively using it completely offline. `auth.users.last_sign_in_at`, an expired session, no heartbeat or no workout upload **cannot distinguish offline use from abandonment**.
- Preserve the [accepted offline-session policy](18-OFFLINE-SESSION-STATE-MACHINE.md): locally authorized workouts do not require repeated server contact. **Do not introduce compulsory online check-ins or server workout-data uploads** solely to make accounts deletable. If a minimal online account-activity timestamp is introduced, it must be server-owned, disclosed, low-volume, authorized, and must **never include workouts, measurements, plans or history**.
- If the original `auth.users.id` is hard-deleted, the bound installation can **lose its ability to authenticate with that UUID**. A new registration with the same email gets a **new account identity**; automatic rebind would violate the one-account/no-switch safety contract. Previously encrypted local workouts or user-owned backup archives **may become inaccessible or unrecoverable**. Merely retaining SQLite files is not sufficient protection.
- **Do not automatically delete an activated/locally bound free account in the current MVP.** Before authorizing this distinct future feature, the owner must explicitly accept the offline-user false-positive/data-loss risk **and** approve a tested same-account data export/recovery or account-expiration transition design. Without reliable recovery and enforceable user notice, the 12-month checkpoint remains **review-only / dry-run**, not destructive.
- Any eventual automatic deletion needs clear signup Terms/Privacy disclosure (with date, precise trigger, consequences and contact), 30-day prior notice plus a final reminder, verified-email deliverability handling, an accessible authenticated Keep my account path, and an adequate grace/appeal/recovery policy. A failed or ambiguous notification, existing account-dispute hold, status mismatch, concurrent login or entitlement uncertainty **blocks deletion**.
- Server-authoritative inactivity must be based on specifically defined **trusted online account actions** and timestamps, not just `last_sign_in_at`; track **minimal identity activity** only. Silence caused by loss of connectivity is an uncertainty, not proof that the person quit. This makes the proposal conservative and means some dormant accounts may remain until safe to remove.
- Billing/free status must be **validated on the server** before any cleanup; paid membership and Sync are currently future/unimplemented, so never assume a client-side `is_free` flag or grant new privileges. Do not turn on retention deletion by default as a side effect of enabling future plans.
- After owner approval, a scheduled private **dry-run report** can examine 6/11/12-month cohorts. Hard deletion, if later authorized, requires a separate non-public privileged job, re-check of UUID, entitlement, holds, authenticated recent activity and notification windows immediately before `auth.admin.deleteUser`. Dry-run, pause switch, batch caps, audit without PII, rollback limitations and independent security review are required.

### Decision conflict requiring explicit owner sign-off

This proposed policy **would change** the previous design's indefinite retention for established account IDs. It **must not silently override** ADR-003/011 persistent login, the single-bound-user rule, offline access, local-only recovery guarantees or future backup/Sync contracts. Either retain the existing permanent protection **or** separately authorize a 12-month expiry with an independently verified recovery/legal/privacy design and documented acceptance of irreversible identity/data consequences. Product requirement **direction** is recorded here; **destructive implementation authorization is not granted**.

## Signup and resume failure states

| Case | Required behavior |
|---|---|
| Invalid/expired OTP, server 429 or network outage at first signup | No verified local account binding or workout unlock; real provider error/cooldown; no fabricated success |
| Username already taken / invalid input | No duplicate handle; user can correct and retry without losing verified session |
| Mobile blank inside Account Setup | Required Username still validated and saved; profile can continue with `mobile_number = NULL`; no separate phone step or phone OTP |
| Name/DOB/Sex absent | Block final cloud-profile completion with accessible field error; **do not mark them optional** |
| Missing Units/Height/Weight/Activity/Goal | Resume missing local step; Home available only after required first-time setup succeeds |
| App killed during cloud profile save or local step | Safe idempotent resume after appropriate account/session verification; no duplicate measurement |
| Finalizing interrupted, incomplete or failed | Never display Done/Continue without durable verified completion; safely Retry or resume, avoid duplicate records or false finished state |
| Returning user, verified complete, offline | Open correct account-bound local Home without requiring OTP, profile server read or another account |
| Logout or second account sign-in attempt | Locked store, no account switching and no cross-account reads |
| Reinstall without local backup | Retrieve only permissible cloud account profile; never claim cloud restored local workouts |

## Decisions to finalize before real implementation

1. Verify the actual Supabase password-after-email-OTP mechanism **without changing the fixed Email → OTP → Password UI order**; reconcile ADR-017 wording, production email template/SMTP and server-enforced rate limits. Preserve 6 digits, 10 minutes, 60 s resend, 5 sends/hour, 5 failed attempts/challenge and 15-minute cooldown as **targets only until proven**; no CAPTCHA.
2. Define required `calculation_sex` choices/label, DOB minimum/maximum/underage policy and disclosure; avoid unexplained sensitive-data collection.
3. Finalize global username uniqueness, case/Unicode confusables, 3–16 grapheme validation, safe error messaging and update rules; existing ADR-017 calls username optional and must be revised if accepted.
4. Define `full_name`, phone normalization (when present), local metric ranges/categories, edit/resume/recovery rules and deletion/retention behavior.
5. Approve migration, ownership RLS, negative authorization tests, platform secure-session adapter and native encrypted database lifecycle **as separate implementation slices**.
6. Review the proposed **7-day unverified / 30-day verified-but-never-activated cleanup** thresholds, 7-day advance warning, server-authoritative activation guard and server-only dry-run/deletion mechanism. No live job is authorized.
7. Separately review the owner-requested **established FREE-plan inactivity policy**: **6-month review/reminder**, **11-month advance warning**, **12-month candidate review**. Resolve the conflict with offline-first permanent account binding, notification/identity recovery, privacy/legal and paid entitlement before any automated account deletion; don't mistake uninstall or `last_sign_in_at` for proof.

## Review/acceptance plan (not executed)

| ID | Acceptance evidence required |
|---|---|
| ONB-01 | Email → OTP → Password fixed; **Account Setup contains required Username and optional Mobile** on one screen; **Name is the next dedicated screen**; only the mobile field can be left blank |
| ONB-02 | DOB and Sex are required, no false defaults; invalid/empty inputs never mark cloud profile complete |
| ONB-03 | Server OTP verified before user binding or local workout unlock; proposed OTP→password provider path validated |
| ONB-04 | Username unique/normalized under approved policy; concurrent reservation and rename tests |
| ONB-05 | `profiles` RLS denies anonymous/other-user SELECT/INSERT/UPDATE/DELETE; immutable owner ID |
| ONB-06 | All Unit/Height/Weight/Activity/Goal values saved in encrypted account-bound local DB, not uploaded |
| ONB-07 | Restart, offline reopening, step-resume, logout/same-account login and wrong-account blocking |
| ONB-08 | Fresh install/reinstall, lost-key, broken connection, partial profile, invalid DOB and optional blank phone |
| ONB-09 | Cloud profile can be edited/deleted consistently with separate local-workout erase and account deletion contracts |
| ONB-10 | iOS/Android keyboard, large text, screen reader, date/sex choice UX and meaningful errors after live implementation |
| ONB-11 | After Goal, a centered progress ring shows a **centered real % when measurable** and “Personalizing your experience…”. At verified 100% it replaces % with centered done/checkmark and “You're all set!”; bottom Continue appears **only after** real required saves succeed, then opens Home |
| ONB-12 | Final screen excludes testimonial cards, stars, ratings, promotional counts, carousels and copied branding; supports reduced motion, dynamic text, interruption/retry, accessible progress %, **indeterminate fallback when unmeasurable**, and no fake timed progress |
| ONB-13 | Unverified Auth candidate after proposed 7-day deadline: dry-run lists only truly unverified, never-activated candidates; new verification/activation cancels deletion; privileged hard delete clears expected dependent rows with no client keys |
| ONB-14 | Verified cloud-profile-incomplete candidate: 30 days inactivity + 7-day verified-email warning, trusted last activity/activation marker and race-safe server preflight; resumed progress prevents deletion |
| ONB-15 | Cloud-profile-complete, protected/bound and offline-incomplete-local-setup users remain exempt forever from abandoned-signup cleanup even without a remote heartbeat; delete ambiguous cases **never** |
| ONB-16 | Idempotent daily job, dry-run/kill switch, logs without PII, failure/retry, same-email re-registration after safe deletion, and expired-JWT/session/Storage-FK handling are verified before enabling |
| ONB-17 | Previously active FREE user at 6/11/12 months without server activity: review-only 6-month checkpoint, verified advance notice by 11 months and **no live deletion** until a separate established-account risk gate is approved |
| ONB-18 | Activated user working offline for over 12 months must not be misrepresented as uninstalled; test returning login, persisted account UUID, local ciphertext/keys and failure handling if future account expiry is authorized |
| ONB-19 | Authenticated Keep my account / qualifying server activity cancels retention expiry; final eligibility re-check handles concurrent sign-in, paid entitlements, warning failures, disputes and ambiguous records safely |
| ONB-20 | Before any established-account hard delete, test privacy disclosure, warning and grace, independent recovery/backup or export solution, irreversibility, same-email new UUID, rejected cross-account rebind and rollback limitations |



Review evidence must distinguish **docs review** from runtime/server/native tests. Before Phase 1.2+ implementation, also satisfy [AUTH-01–14 and SEC-06](08-TEST-PLAN.md). No tests above have passed simply because they are written.

## Options considered

| Option | Benefit | Cost / risk |
|---|---|---|
| Supabase Auth only, all profile local (old boundary) | Minimal cloud PII | Minimal account profile unavailable on new device |
| **Private minimal cloud profile + local fitness (proposed)** | Account details follow user identity; workout data remains local | Expands personal data/retention/RLS and Auth-dependency obligations |
| Whole workout profile and history in Supabase | Cross-device remote data | Violates default local-first boundary; separate consent and future paid Sync gates |

**Rollback/revision:** Until an approved migration runs, no Supabase data changes exist to roll back. Revise proposed docs after owner review. After future deployment, rollback must preserve account IDs, existing profiles and local encrypted workout records; destructive operations require explicit policies.

**Sources:** [ADR-011/017](09-DECISIONS.md) · [Auth](04-AUTH-AND-SECURITY.md) · [Session lifecycle](18-OFFLINE-SESSION-STATE-MACHINE.md) · [MVP flows](20-MVP-UX-FLOWS.md) · [Local schema](03-LOCAL-DATA-MODEL.md) · [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data) · [Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless)
