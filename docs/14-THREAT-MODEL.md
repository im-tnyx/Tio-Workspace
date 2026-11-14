# 🧯 Threat model — local-first workout app

**Status:** Initial threat analysis. Must be revisited during implementation and any external integration.

[← Docs hub](00-INDEX.md) · [🛡 Security policy](../SECURITY.md) · [🔐 Auth & security](04-AUTH-AND-SECURITY.md)

## 01 · Assets and trust boundaries

| Asset | Trust boundary | Risk |
|---|---|---|
| Supabase Auth refresh/session tokens | Protected device ↔ Auth service | Stolen credentials, session replay |
| Workout records | App process ↔ encrypted local database | Cross-account access, unencrypted file theft |
| Local encryption keys | OS keystore/keychain ↔ app | Device compromise, accidental key loss |
| AI provider credentials | Edge Function secret store ↔ AI vendor | Secret exposure, quota abuse |
| AI request inputs | User approval ↔ remote provider | Unnecessary personal-data transmission |
| Backup archive | Device encryption ↔ user's cloud account | Wrong-account restore, tampering, lost recovery code |
| Optional future sync rows | User account ↔ hosted database | Broken RLS/IDOR, privacy defaults changed |

## 02 · Primary threat scenarios and mitigations

| Scenario | Planned safeguard | Verification |
|---|---|---|
| Second user B is admitted to A-bound installation or sees A data | Single protected installation binding; reject different UUID, retain locked ciphertext | `AUTH-06`, `AUTH-07`, `AUTH-09` |
| OS-managed cloud/device backup or phone migration copies Local Only SQLite without explicit Tio backup consent | Future Android legacy/cloud/D2D and iOS native file backup exclusions; acknowledge OS/OEM limits | `SEC-04`, `SEC-05` |
| Reinstall loses local backup/provider settings while a valid personal archive remains | Same-account voluntary provider discovery, verified owner/encryption and safe no-result path | `BKP-15`, `BKP-16` |
| Device backup copied without authorization | Authenticated encryption and secure key custody | `SEC-02` and future restore negative tests |
| Local key lost on reinstall | Independent recoverable **backup** encryption method | `BKP-01`, `BKP-05` |
| App binary reverse engineered | No AI/vendor/service-role secrets in client | `SEC-01` |
| AI Edge Function called by unauthenticated actor | Verified user, rate limits, quotas | `AI-01` |
| Backup swapped, altered or wrong account | Integrity check, account ID verification, atomic restore | `BKP-02`, `BKP-03` |
| Cloud sync leaks across users | Owner-scoped RLS, server auth, negative tests | `SYNC-03` |
| Remote outage during a workout | Local-first writes; cloud calls isolated | `DATA-01`, `AI-03` |
| Logout leaves data visible | Clear session and memory; close local store | `AUTH-05` |

### New owner-selected threat controls — planned, not verified (ADR-017)

| Threat | Required design mitigation | Acceptance |
|---|---|---|
| Bots create unverified accounts, abuse email sending, brute-force or replay signup OTP | Mandatory online email-password signup **plus OTP confirmation** before binding/unlocking a workout store; server/provider resend/send/verify controls, short expiry, safe error handling, CAPTCHA/risk screening as appropriate; client countdown is not a security boundary | `AUTH-11/12`, `SEC-06` |
| Forged session/guest mode or offline startup attempts to bypass authentication | No guest workout flow; correct immutable UUID and protected local binding before SQLCipher unlock; preserve ADR-011 *previously verified* offline use without online revocation claims | `AUTH-13/14`, `AUTH-06`, `SEC-02/03` |
| Unbounded password/username/workout input or huge collections causing DoS/data corruption | Shared validated min/max policy, server auth enforcement and domain/local transaction caps; length counted properly for Hindi graphemes; no silent truncation/old-history deletion | `LIMIT-01/02/03/04` |
| Later paid membership bypass or accidental server workout uploads | Keep membership out of MVP while retaining stable ownership/data interfaces; future entitlement validated server-side, separate explicit Sync upload opt-in, RLS and no local-workout lockout on expiry | `SYNC-03/08/09/10` — future phase |

**Residual risk:** Passwords/OTP and SQLCipher reduce exposure but cannot guarantee an "unhackable" device or backend. Native binary inspection, key attacks, authenticated server security and provider-specific quotas still need adversarial testing.

## 03 · Non-goals and residual risk

A compromised/rooted phone, vulnerable OS, leaked recovery phrase, malware or device access while unlocked cannot be fully mitigated by app-level encryption. Automatic backup frequency is limited by mobile OS scheduling. An online-authenticated account does not guarantee locally saved workouts can be recovered after uninstall.

## 04 · Review triggers

New OAuth provider, iCloud entitlement, AI data category, password/key recovery strategy, analytics vendor, cloud-sync enablement, user deletion flow, native encryption library or major dependency change.

## 05 · Security release bar

Do not claim secure encrypted database or safe backup until tested on real devices. No secrets in mobile binaries or Git history; RLS policies tested against unauthorized users before future server workout storage.

---

[← Security spec](04-AUTH-AND-SECURITY.md) · [Test plan →](08-TEST-PLAN.md)
