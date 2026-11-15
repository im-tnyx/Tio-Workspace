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
| 15 | App Entry | Complete gates and open Home | — | Local |

Welcome includes Get Started; do not add a redundant separate Get Started page. Sign-in is a separate returning-user path. Final user-facing strings remain English-only for the current MVP per ADR-018.

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

## Signup and resume failure states

| Case | Required behavior |
|---|---|
| Invalid/expired OTP, server 429 or network outage at first signup | No verified local account binding or workout unlock; real provider error/cooldown; no fabricated success |
| Username already taken / invalid input | No duplicate handle; user can correct and retry without losing verified session |
| Mobile blank inside Account Setup | Required Username still validated and saved; profile can continue with `mobile_number = NULL`; no separate phone step or phone OTP |
| Name/DOB/Sex absent | Block final cloud-profile completion with accessible field error; **do not mark them optional** |
| Missing Units/Height/Weight/Activity/Goal | Resume missing local step; Home available only after required first-time setup succeeds |
| App killed during cloud profile save or local step | Safe idempotent resume after appropriate account/session verification; no duplicate measurement |
| Returning user, verified complete, offline | Open correct account-bound local Home without requiring OTP, profile server read or another account |
| Logout or second account sign-in attempt | Locked store, no account switching and no cross-account reads |
| Reinstall without local backup | Retrieve only permissible cloud account profile; never claim cloud restored local workouts |

## Decisions to finalize before real implementation

1. Verify the actual Supabase password-after-email-OTP mechanism **without changing the fixed Email → OTP → Password UI order**; reconcile ADR-017 wording, production email template/SMTP and server-enforced rate limits. Preserve 6 digits, 10 minutes, 60 s resend, 5 sends/hour, 5 failed attempts/challenge and 15-minute cooldown as **targets only until proven**; no CAPTCHA.
2. Define required `calculation_sex` choices/label, DOB minimum/maximum/underage policy and disclosure; avoid unexplained sensitive-data collection.
3. Finalize global username uniqueness, case/Unicode confusables, 3–16 grapheme validation, safe error messaging and update rules; existing ADR-017 calls username optional and must be revised if accepted.
4. Define `full_name`, phone normalization (when present), local metric ranges/categories, edit/resume/recovery rules and deletion/retention behavior.
5. Approve migration, ownership RLS, negative authorization tests, platform secure-session adapter and native encrypted database lifecycle **as separate implementation slices**.

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

Review evidence must distinguish **docs review** from runtime/server/native tests. Before Phase 1.2+ implementation, also satisfy [AUTH-01–14 and SEC-06](08-TEST-PLAN.md). No tests above have passed simply because they are written.

## Options considered

| Option | Benefit | Cost / risk |
|---|---|---|
| Supabase Auth only, all profile local (old boundary) | Minimal cloud PII | Minimal account profile unavailable on new device |
| **Private minimal cloud profile + local fitness (proposed)** | Account details follow user identity; workout data remains local | Expands personal data/retention/RLS and Auth-dependency obligations |
| Whole workout profile and history in Supabase | Cross-device remote data | Violates default local-first boundary; separate consent and future paid Sync gates |

**Rollback/revision:** Until an approved migration runs, no Supabase data changes exist to roll back. Revise proposed docs after owner review. After future deployment, rollback must preserve account IDs, existing profiles and local encrypted workout records; destructive operations require explicit policies.

**Sources:** [ADR-011/017](09-DECISIONS.md) · [Auth](04-AUTH-AND-SECURITY.md) · [Session lifecycle](18-OFFLINE-SESSION-STATE-MACHINE.md) · [MVP flows](20-MVP-UX-FLOWS.md) · [Local schema](03-LOCAL-DATA-MODEL.md) · [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data) · [Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless)
