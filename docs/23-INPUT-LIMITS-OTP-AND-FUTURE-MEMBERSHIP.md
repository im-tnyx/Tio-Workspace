# 🔒 MVP input limits, verified signup and future membership boundaries

**Status:** Owner-selected app identifier, product limits and OTP targets · 2026-11-14 · No live Supabase/provider configuration, app code, membership or native validation

[← Docs hub](00-INDEX.md) · [Auth security](04-AUTH-AND-SECURITY.md) · [Data model](03-LOCAL-DATA-MODEL.md) · [Test plan](08-TEST-PLAN.md) · [Readiness](21-PHASE-1-READINESS.md)

> [!IMPORTANT]
> The owner approved **Android/iOS identifier `com.tnyx.tio`**, password **8–64**, required Username **3–16** in proposed Account Setup, maximum **50 programs per account** and **30 routines per program** (no creation minimum), **plus 3–25 Unicode graphemes per saved program/routine title**, sets per exercise **1–8**, and future **members-only custom exercises max 50**. CAPTCHA is deferred. Remaining discussed program/routine/session caps and OTP security targets below are selected as the baseline, **not proof of provider-enforced limits**. Do not implement paid membership or custom-exercise creation before a separate future phase approval.

## 01 · Approved behavior and trust boundary (ADR-017)

1. **New installation:** No usable workout/home/library/plan screens before a successful **online Email → six-digit OTP → Password enrollment and required setup**, or verified login to the correct existing account. Signup may create a pending identity, but **never bind or unlock workout SQLite on OTP verification alone; require trusted account activation and the same immutable UUID**. No anonymous/guest bypass. Signed-out, unverified, wrong-account and reauth-required states have only permitted auth/recovery UI.
2. **Returning verified device:** Keep ADR-011's persisted-session and **offline cached same-bound-user workout access**. Do **not** require a new OTP, internet connection or password on every app launch. After logout, lock the encrypted store and require same-account reauth; confirmed server revocation blocks online operations, recognizing that an offline device cannot detect it immediately.
3. **Email confirmation alone does not prevent abuse.** Supabase Auth's email OTP must be server-verified with real resend/send/attempt throttles, monitored production email sending and generic errors. **No CAPTCHA in the initial app** (future optional measure requiring separate owner approval). Client countdown is UX, not a security boundary.
4. **App lock (PIN/biometric) is deferred.** Do not make a PIN, biometric login, lock recovery or always-on unlock screen part of the current MVP. This is **not** permission to skip Auth/session isolation, OS key protection or SQLCipher.
5. **Membership and billing are deferred until after core workout MVP acceptance.** Current free app supports curated exercise browsing/selection, programs, routines, sets and offline history; **custom-exercise creation is not shipped**. A later separately approved members-only feature may create **up to 50 custom exercises/member** after server-side entitlement authorization. The data model may reserve `is_custom` and capability interfaces now, but Phase 1 must not add hidden paid features, paywalls, payments or Supabase workout uploads. Future paid Sync still requires explicit separate consent and server authorization.

**Security honesty:** no app can be guaranteed "unhackable." Target defense in depth, least privilege, secure storage and repeated negative testing. Online identity/authorization is enforced by the server; device-local workout access is protected by the single-bound-user, protected key and encrypted-store gate.

## 02 · Owner-selected product limits (implementation not verified)

| Field / scope | Minimum | Maximum | Rule |
|---|---:|---:|---|
| **Password** for signup/reset | **8 characters** | **64 characters** | Preserve exact input; no silent trimming, truncation or arbitrary symbol rules; validate on the actual Auth server and protect against known compromised passwords when supported |
| **Username** (required in proposed Account Setup, not sign-in ID; private schema approval pending) | **3 Unicode grapheme clusters** | **16 grapheme clusters** | Hindi/Devanagari permitted; normalize carefully and reject spoofing/control characters |
| Email address | Valid format | 254 chars (**technical proposal**) | Provider-authoritative validation; not a selected product quota |
| **Saved program title** | **3 grapheme clusters** | **25 grapheme clusters** | Unicode/Hindi-aware, validated at save; separate from program count |
| **Saved routine/day title** | **3 grapheme clusters** | **25 grapheme clusters** | Unicode/Hindi-aware, validated at save; separate from routine count |
| **Programs per account** | **No creation minimum; 0 allowed** | **50** | Count saved `workout_plans`, not completed history |
| **Routines/days per program** | **No creation minimum; 0 allowed** | **30** | Count `plan_days`, including empty valid programs |
| Exercises per routine/day | 0 when editing | 30 | Count `plan_exercises`; completion rules separate |
| **Sets per session exercise** | **1 on save/complete** | **8** | Editing draft can temporarily contain 0 before a set is saved |
| Exercises per completed session | 1 on finish | 40 | Count `session_exercises` |
| **Custom exercises** | No mandatory minimum | **50 per eligible future member** | **Future members-only**; unavailable to create in MVP; curated catalog remains usable without membership |

**Latest clarification:** There are TWO separate controls: user may create **0–50 programs/account** and **0–30 routines/program** (zero minimum), while **each saved program/routine name is 3–25 user-perceived Unicode graphemes** including Hindi. Allow temporary empty editing drafts, reject invalid final saves with localized errors, never silently truncate. Custom exercises stay future paid-members-only, so their name-length product quota remains undecided.

**Validation:** For username and saved program/routine names, count user-perceived Unicode graphemes, not JS UTF-16 units; passwords are not normalized/truncated and must match the actual Supabase policy. The user chose a password minimum of **8**; that does not make weak passwords safe, so use compromised-password and server anti-abuse protections where available. Client limits alone are not security gates. Domain/application validators and local DB transactions enforce applicable program/routine/sets limits; future paid custom-exercise creation requires an authoritative **server entitlement**. No historical workout sessions are silently deleted, capped by plan quotas or hidden because a later limit/payment policy changes. Support reviewed import/legacy over-limit recovery rather than auto-pruning.

## 03 · Owner-selected OTP targets (NOT configured or verified)

| Control | Proposed target | Enforcement and caveat |
|---|---|---|
| Signup verification | **Email → six-digit OTP → Password** | Confirm the email with Supabase Auth before any workout unlock; exact code format/template verified against current provider |
| OTP lifetime | **10 minutes** | Set in provider Auth settings if supported; short-lived, single use, never store plaintext OTP in analytics/workout DB |
| Resend wait | **60 seconds minimum** | Real server/provider delay, plus UI countdown; return honest retry-after and 429 messages |
| Send quota per email/identity | **5 sends per hour** (selected target) | Verify real provider/gateway per-email enforcement; built-in project quotas are not necessarily equivalent |
| Failed OTP verifications | **5 attempts per challenge** | Server-side counter/revocation where provider supports; if unsupported design an approved secure gateway, not a fake UX-only limit |
| Abuse cooldown | **15 minutes** after threshold | Temporary server-enforced block with clear recovery; never permanently lock a legitimate user due only to device-local counters |
| IP/device abuse detection | **Provider/project-level throttles and monitoring; no CAPTCHA in MVP** | Future optional CAPTCHA requires explicit approval; do not invent an IP/device enforcement guarantee |

**Provider feasibility:** The owner accepted **6 digits, 10-minute OTP expiry, 60-second resend, 5 sends/email/hour, 5 wrong code attempts/challenge, 15-minute abuse cooldown** as targets. **These are not configured or independently verified capabilities**. Actual Supabase limits vary by endpoint and project; some per-email/attempt controls may need a separately approved secure server-side gateway and reviewed production SMTP. The mobile resend timer is never sufficient enforcement. If configured provider constraints conflict with these targets, report the gap before implementation instead of claiming protection.

**Safe flows:** New account: Email → OTP → Password → required setup → same-UUID protected binding → Home. Existing active account: Email → OTP → direct login without password update. Incomplete account: OTP → trusted-stage resume; do not reset an existing password. See the [lifecycle contract](27-OTP-FIRST-AUTH-LIFECYCLE.md). Wrong/expired OTP, resend flooding, 429, offline first signup, duplicate/unverified email and account mismatch must **fail closed** and leave workout data locked. Generic, non-enumerating responses where appropriate; avoid logging code/password/token/email in analytics or crash traces. A valid persisted same-user session skips OTP on ordinary reopen; existing active users who initiate email login receive OTP and keep their password unchanged.

**Supabase documentation (checked 2026-11-14; recheck before implementation):** [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates) · [Rate limits](https://supabase.com/docs/guides/auth/rate-limits) · [Password-based Auth](https://supabase.com/docs/guides/auth/passwords) · [Bot protection](https://supabase.com/docs/guides/auth/auth-captcha) · [Production checklist](https://supabase.com/docs/guides/security/production-checklist).

## 04 · Later membership without MVP rework

- **Phase 1 local-first contract:** stable owner `user_id`, local exercise/plan/session/set UUIDs, timestamps, future-safe tombstone semantics and feature/domain interfaces, with no paid entitlement columns required just to use offline workouts. Avoid UI/business logic coupled directly to Stripe/store APIs, payment tiers or Supabase workout tables.
- **At a later separately approved phase**, add an entitlement provider and capability policy **outside dumb screens**; server validates any premium operation, not a local flag or user-editable JWT metadata. Local-only workout logging and user-owned Personal Backup remain independent of membership.
- **Paid Sync is opt-in separate from purchase** and mutually exclusive with Personal Backup. No server workout upload until active entitlement, verified same-user auth, explicit Sync upload choice and verified RLS/security pass.
- **No retroactive lost data:** changing paid limits or subscription status must not delete local workouts; decide export/retention, downgrade and remote-copy deletion rules explicitly before billing launches.

## 05 · Required future validation / decision sign-off

**Owner has selected policy:** min/max across sensitive input/collections, verified email OTP signup with real anti-abuse defenses, no guest access, optional app-lock **deferred**, membership **after** working app and upfront modularity to limit future refactor.

**Still pending:** provider ability to enforce approved OTP targets and password 8–64, production SMTP/hook settings, required proposed Username creation/uniqueness and private-profile approval, custom-exercise membership entitlement design, native device/abuse tests, original app icon and verification of `com.tnyx.tio` ownership/uniqueness in both ecosystems. **Product numbers including saved program/routine name 3–25 are selected; no backend controls are yet running.** CAPTCHA remains deferred.

**Exit tests after separately approved work:** `AUTH-11/12/13/14`, `LIMIT-01/02/03/04`, `SEC-06` in [test plan](08-TEST-PLAN.md). Also preserve existing offline, logout, account-mismatch, ciphertext and OS-backup negative tests. **Phase 1.1 shell** remains nonfunctional placeholders; Auth is Phase 1.2, encrypted workout store is Phase 1.3, and feature limits are checked with respective local workout features (1.4–1.6). Future membership/Sync implementation is outside Phase 1.

---

[← Phase 0 approval pack](22-PHASE-0-DESIGN-AND-PHASE-1-APPROVAL.md) · [← Decision queue](17-PHASE-0-DECISION-PACK.md)
