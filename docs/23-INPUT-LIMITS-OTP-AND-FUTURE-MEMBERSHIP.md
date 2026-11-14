# 🔒 MVP input limits, verified signup and future membership boundaries

**Status:** Phase 0 owner-selected policy + **proposed numeric thresholds** · 2026-11-14 · **No code, Auth configuration, payments or test execution authorized**

[← Docs hub](00-INDEX.md) · [Auth security](04-AUTH-AND-SECURITY.md) · [Data model](03-LOCAL-DATA-MODEL.md) · [Test plan](08-TEST-PLAN.md) · [Readiness](21-PHASE-1-READINESS.md)

> [!IMPORTANT]
> The owner selected **mandatory verified email/password signup with email OTP, no guest access, bounded inputs/counts, anti-abuse enforcement, deferred app lock and membership only after the workout MVP is complete**. **Every number below is a reviewable engineering proposal**, not an approved production setting, provider capability or tested defense. Explicitly approve numeric thresholds and validate them on both device and server where applicable before implementation.

## 01 · Approved behavior and trust boundary (ADR-017)

1. **New installation:** No usable workout/home/library/plan screens before a successful **online Supabase email/password registration + email OTP verification**, or verified login to the correct existing account. Signup may create a pending identity, but **never bind or unlock workout SQLite before the email is confirmed and the immutable user UUID is verified**. No anonymous/guest bypass. Signed-out, unverified, wrong-account and reauth-required states have only permitted auth/recovery UI.
2. **Returning verified device:** Keep ADR-011's persisted-session and **offline cached same-bound-user workout access**. Do **not** require a new OTP, internet connection or password on every app launch. After logout, lock the encrypted store and require same-account reauth; confirmed server revocation blocks online operations, recognizing that an offline device cannot detect it immediately.
3. **Email verification is not a complete anti-bot defense.** Enable Supabase Auth email confirmation, OTP email template (user-entered code), **server/provider-enforced** send/verify throttles and abuse controls. Mobile countdowns are UX only. Consider CAPTCHA/risk challenges and production SMTP after verifying native/mobile compatibility. Always protect passwords/tokens and prevent user enumeration.
4. **App lock (PIN/biometric) is deferred.** Do not make a PIN, biometric login, lock recovery or always-on unlock screen part of the current MVP. This is **not** permission to skip Auth/session isolation, OS key protection or SQLCipher.
5. **Membership/billing is deferred until the core workout app is complete and accepted.** Plan clear future authorization/entitlement boundaries and stable UUID/data contracts now, but **no subscription, purchase, paywall, entitlement API, workout server sync or member-only restriction in Phase 1**. Existing free/offline features remain usable. Future paid Supabase Sync requires its **own user upload consent**, valid server authorization and approved RLS/deletion/retention; no upload on registration or membership purchase.

**Security honesty:** no app can be guaranteed "unhackable." Target defense in depth, least privilege, secure storage and repeated negative testing. Online identity/authorization is enforced by the server; device-local workout access is protected by the single-bound-user, protected key and encrypted-store gate.

## 02 · Candidate minimum / maximum limits (NOT yet owner-approved)

| Field / scope | Proposed minimum | Proposed maximum | Rule and ownership |
|---|---:|---:|---|
| **Password** (signup/reset) | 12 characters | 128 characters | Strong passphrases allowed; no silent trimming/truncation; align native UI validation with actual Supabase server password policy and compromised-password protection |
| **Email address** | Valid format | 254 characters | Treat format/length and identity verification as server-authoritative; do not reveal whether an address exists |
| **Username / profile display handle** | 3 grapheme clusters | 32 grapheme clusters | Optional profile field, **never a login credential**; Hindi/Unicode allowed. Normalize/validate carefully; reject control/invisible spoofing characters. No global uniqueness promised |
| **Custom exercise name** | 2 grapheme clusters | 80 grapheme clusters | Shared form/domain validator; localized/Unicode names supported |
| **Workout program/plan title** | 3 grapheme clusters | 80 grapheme clusters | A program maps to `workout_plans` |
| **Routine/day title** | 2 grapheme clusters | 60 grapheme clusters | A routine/day maps to `plan_days` |
| **Programs per bound account** | 0 | 50 | Count user-authored `workout_plans`, not history |
| **Routines/days per program** | 1 when saved | 30 | Count `plan_days`; incomplete draft may be empty |
| **Custom exercises per account** | 0 | 300 | `exercises.is_custom` true; do not count curated library records |
| **Exercises per routine/day** | 1 when saved | 30 | Count `plan_exercises`; prevent duplicate/repeat confusion; draft may be empty |
| **Sets per exercise in a session** | 1 when saved | 20 | Count `workout_sets` by session exercise; empty in-progress draft allowed |
| **Exercises in one active session** | 1 when completed | 40 | Count `session_exercises`; draft may be empty |

**Counting rules:** For names, count **user-perceived Unicode grapheme clusters** (not UTF-8 bytes or JS string `length`), and validate after intentional normalization with Unicode/Hindi rendering in mind. For passwords, preserve exact user input and use the server's accepted policy without silent transformation. Show live length/remaining counters and specific localized errors, never truncate a saved label automatically. `0` counts are valid for empty collections; required nonempty child bounds apply on **final save/complete**, not every intermediate draft.

**Non-goals:** Do not cap the number of **historical completed workout sessions** purely because of plan/template quotas. Do not delete, truncate or make existing restored data inaccessible when a future policy lowers a cap. Legacy/over-limit imports should be validated for memory/resource safety, remain readable when safe, and offer an explicit migration/edit path. Offline limits are enforced in **shared domain/application validators + local DB constraints/transactions where practical**, not only client input fields; later server API/AI/sync boundaries must revalidate independently. Exact rep/weight/duration ranges, notes lengths, storage quotas and overflow policy still require separate validation.

## 03 · Candidate signup OTP and abuse limits (NOT configured)

| Control | Proposed target | Enforcement and caveat |
|---|---|---|
| Signup verification | Email + password and **6-digit** email code | Confirm the email with Supabase Auth before any workout unlock; exact code format/template verified against current provider |
| OTP lifetime | **10 minutes** | Set in provider Auth settings if supported; short-lived, single use, never store plaintext OTP in analytics/workout DB |
| Resend wait | **60 seconds minimum** | Real server/provider delay, plus UI countdown; return honest retry-after and 429 messages |
| Send quota per email/identity | **3 sends per hour** | Provider/custom gateway enforcement; do not rely solely on client/device identity |
| Failed OTP verifications | **5 attempts per challenge** | Server-side counter/revocation where provider supports; if unsupported design an approved secure gateway, not a fake UX-only limit |
| Abuse cooldown | **15 minutes** after threshold | Temporary server-enforced block with clear recovery; never permanently lock a legitimate user due only to device-local counters |
| IP/device abuse detection | Adaptive risk/CAPTCHA + project limits | Evaluate IP, email, project quotas, privacy/security and mobile CAPTCHA support; no fictional guarantee of per-device enforcement |

**Provider feasibility:** Supabase Auth rate limits vary by endpoint, project and email provider and some can be configured. The built-in email sender is **testing-only** with a low **project-wide** quota; production needs reviewed custom SMTP or Send Email hook. A per-email count/attempt cap is **not guaranteed** by a mobile countdown or merely enabling Supabase defaults. Evaluate the actual provider capabilities and configure an authorized server-side abuse gate for any missing guarantees. Do not invent a `verifyOtp` type; use the correct signup/email verification flow and template supported by the selected SDK version.

**Safe flows:** Start password/email signup online → send one-time email verification → show code entry and masked address → verify with Supabase → validate correct UUID and protected installation binding → initialize/unlock bound encrypted storage → Home. Wrong/expired OTP, resend flooding, 429, offline first signup, duplicate/unverified email and account mismatch must **fail closed** and leave workout data locked. Generic, non-enumerating responses where appropriate; avoid logging code/password/token/email in analytics or crash traces. Password login for an already verified account need not resend signup OTP on every normal login unless separately approved.

**Supabase documentation (checked 2026-11-14; recheck before implementation):** [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates) · [Rate limits](https://supabase.com/docs/guides/auth/rate-limits) · [Password-based Auth](https://supabase.com/docs/guides/auth/passwords) · [Bot protection](https://supabase.com/docs/guides/auth/auth-captcha) · [Production checklist](https://supabase.com/docs/guides/security/production-checklist).

## 04 · Later membership without MVP rework

- **Phase 1 local-first contract:** stable owner `user_id`, local exercise/plan/session/set UUIDs, timestamps, future-safe tombstone semantics and feature/domain interfaces, with no paid entitlement columns required just to use offline workouts. Avoid UI/business logic coupled directly to Stripe/store APIs, payment tiers or Supabase workout tables.
- **At a later separately approved phase**, add an entitlement provider and capability policy **outside dumb screens**; server validates any premium operation, not a local flag or user-editable JWT metadata. Local-only workout logging and user-owned Personal Backup remain independent of membership.
- **Paid Sync is opt-in separate from purchase** and mutually exclusive with Personal Backup. No server workout upload until active entitlement, verified same-user auth, explicit Sync upload choice and verified RLS/security pass.
- **No retroactive lost data:** changing paid limits or subscription status must not delete local workouts; decide export/retention, downgrade and remote-copy deletion rules explicitly before billing launches.

## 05 · Required future validation / decision sign-off

**Owner has selected policy:** min/max across sensitive input/collections, verified email OTP signup with real anti-abuse defenses, no guest access, optional app-lock **deferred**, membership **after** working app and upfront modularity to limit future refactor.

**Still pending:** numeric caps table; OTP expiry/resend/verify quotas after provider feasibility; whether optional profile username exists and its naming rules; password strength controls; exact signup email template/SMTP/CAPTCHA; native iOS/Android test environments. These are **not** owner-approved numbers, deployed project settings or proven protections.

**Exit tests after separately approved work:** `AUTH-11/12/13/14`, `LIMIT-01/02/03/04`, `SEC-06` in [test plan](08-TEST-PLAN.md). Also preserve existing offline, logout, account-mismatch, ciphertext and OS-backup negative tests. **Phase 1.1 shell** remains nonfunctional placeholders; Auth is Phase 1.2, encrypted workout store is Phase 1.3, and feature limits are checked with respective local workout features (1.4–1.6). Future membership/Sync implementation is outside Phase 1.

---

[← Phase 0 approval pack](22-PHASE-0-DESIGN-AND-PHASE-1-APPROVAL.md) · [← Decision queue](17-PHASE-0-DECISION-PACK.md)
