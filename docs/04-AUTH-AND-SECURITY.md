<div align="center">

# 🔐 Authentication & Security
**Persistent login, on-device isolation and secret handling**

[← Docs hub](00-INDEX.md) · [🏠 Home](../README.md) · [🎨 Design](../DESIGN.md)

</div>

> [!NOTE]
> **Document status:** Planning / proposed specification. Product implementation has not started.

---

**Status:** Design requirements, not a security audit or deployed configuration.

## Authentication contract
- Supabase Auth is proposed for new-account **Email → OTP → Password** enrollment, existing active-account **Email → OTP direct login**, explicit password recovery, signout and refresh. **Email verification must be enabled**; an unverified/pending signup never unlocks/binds local workout SQLite. Provider-compatible OTP template/verification method, production email transport and rate-limit settings are implementation gates, not enabled by these docs.
- `persistSession` and a correctly designed secure React Native storage adapter keep users signed in on normal app restarts.
- First account signup/login needs internet. Previously initialized devices can continue **local** workout work offline.
- App restart **does not** automatically require sign-in. Reauthentication may be required when the session is revoked, logout occurs, refresh credentials cannot be recovered, or security policies mandate it.
- Offline status must never be mistaken for positive proof that the remote account remains active; protect privileged server operations with fresh server-side authentication.
- **Owner-approved offline policy:** cached locally verified bound identity may use local workouts offline despite delayed remote revocation detection; once online, protected server calls must revalidate. Optional PIN/biometrics can be evaluated later, not silently required on every restart.

### Signup OTP, no-guest boundary and abuse protection (ADR-017)

- **Online first registration:** Email → six-digit OTP → initial Password → required setup → confirm same immutable account UUID and protected installation binding → only then unlock encrypted workout storage. `verifyOtp` creates a provisional Auth session before password/profile completion; OTP alone does not create a completed Tio account or authorize Home/protected cloud rows. On return before password, require fresh Email + OTP rather than resuming from that session; the proposed server-only short cleanup target applies only to a proven provisional UUID. Server-owned eligibility depends only on independently verified server facts, never a device `local_complete` claim. Cloud RLS enforces server eligibility and ownership; Home separately requires protected same-UUID local completion. An existing server-eligible user on a fresh installation still needs local setup or a separately verified matching restore. Existing eligible users go directly to OTP login with no password screen/update; password-complete incomplete users resume the appropriate server or local stage. No anonymous/guest mode, unverified-user access, local-only bypass or alternate account switching. See the [lifecycle contract](27-OTP-FIRST-AUTH-LIFECYCLE.md). The Auth screen remains available when locked. Persistent **completed-account** sessions and previously eligible offline cached sessions remain consistent with ADR-011; signup OTP is not demanded every app open.
- **Server-enforced anti-spam:** owner-selected OTP targets: 6 digits, 10-minute expiry, 60-second resend, 5 sends/email/hour, 5 failed attempts/challenge and 15-minute cooldown. Verify real Supabase/project/server-enforced capabilities; the UI countdown alone is not enforcement. **CAPTCHA is deferred and must not be included in MVP.** Use reviewed production SMTP, generic errors, no OTP/password logs; fail closed for expired/invalid attempts.
- **Security defense in depth:** enforce owner-selected password 8–64 and required proposed Username 3–16 at authoritative boundaries, with compromised-password checks when supported. Curated library and core workouts remain free; future member custom-exercise creation (max 50) requires a separately authorized server entitlement. Keep OS protected SQLCipher, one-bound-user key, secret hygiene, RLS for future server tables, negative brute-force/replay/account tests; no "unhackable" guarantee.
- **App lock (PIN/biometrics) is deferred**, not an MVP prerequisite. Security does **not** depend on a PIN screen.
- **Membership/payments deferred until core app completion**. Design stable domain/capability/entitlement interfaces only; do not ship purchases, paywall, remote workout storage or paid-feature gating in Phase 1. Future server entitlement alone cannot authorize uploading workouts; Sync still needs explicit consent.

**Numbers selected, backend unverified:** Password 8–64, required proposed Username 3–16, saved program/routine titles **3–25 graphemes**, and OTP target rates are owner-selected in [the canonical spec](23-INPUT-LIMITS-OTP-AND-FUTURE-MEMBERSHIP.md) and [tests](08-TEST-PLAN.md). **Only actual Supabase/provider configuration, production email, enforcement and native security testing remain pending**, not owner's numeric selection.

## Account isolation
- Bind **one local account per app installation** to the exact verified Supabase `auth.users.id`, not mutable email. Do **not** provide add-account/switch-account UI or maintain multiple account DBs.
- Persist the sole binding in protected pre-unlock installation metadata. Use its own OS-protected SQLCipher key and encrypted workout file; never select or decrypt a DB solely from an email or unverified token.
- On logout, remove auth tokens, clear secrets from memory where feasible, close/lock DB and route to **same-account login**. **Retain** binding, key and encrypted history; logout cannot unlock another account.
- On attempted login with a different user UUID, refuse access, discard any unintended second-account auth session/token, and preserve the original binding/data. Do not automatically rebind, wipe, migrate, create an alternate store or import another account's backup.
- Provide a **separate, deliberate and confirmed erase-local-data/reset-installation** action with account identity verification where available, backup-loss warning and explicit choice to remove protected local binding/key/data. No implicit erase on auth failure or sign-out; wrong-key errors fail closed.
- Supabase account deletion is a separate future online reauth/server operation; account deletion, local erase and personal cloud backup deletion are distinct operations with separately documented user consent.

## On-device encryption
- Proposed: Expo SQLite with SQLCipher in a **development/production native build**, not Expo Go.
- After opening DB, confirm `PRAGMA cipher_version` exists before trusting encryption; set key before any schema reads.
- Never hardcode SQLCipher encryption keys or API keys; manage small key material via platform-protected storage (e.g., Expo SecureStore) with appropriate lifecycle handling.
- Consider backup/restore of the **encryption key** carefully: a device-bound key must not be the only means of decrypting a cloud backup on a new device.
- Expo SecureStore behaviour differs by OS on uninstall. Do not promise that it survives reinstall or that deleting an app always deletes iOS Keychain values.
- **OS backup and transfer (future implementation):** Exclude workout SQLite, WAL/SHM, local snapshots/staging files and account-sensitive metadata from unintended OS-managed backups and transfers where supported. Review Android pre-12 `fullBackupContent`, Android 12+ `dataExtractionRules` for `cloud-backup` and `device-transfer`, and iOS `URLResourceValues.isExcludedFromBackup` / `NSURLIsExcludedFromBackupKey`. `allowBackup=false` alone is not universal protection. Confirm effective native Expo config and actual device behaviour; this is not yet implemented.
- **Restore safety:** Reject orphaned OS-restored database/key/installation state without a matching verified account UUID, installation marker and decryptable account key; never open a mismatched DB, fall back to plaintext or silently erase. Portable encrypted Personal Backup remains separately user-opted and independently recoverable.

- Sensitive logs/tokens must not be printed to console, crash reports or analytics; clean debug traces.

## Proposed SQLCipher unlock before Drizzle migrations

For the [local Drizzle proposal](03-LOCAL-DATA-MODEL.md), the database must be **account-bound and decrypted before ORM migrations**:

1. Resolve the exact locally verified Supabase `user_id`, its encrypted file and its OS-protected key. If missing/mismatched, keep locked.
2. Open that file in a native build; query `PRAGMA cipher_version` and **fail closed** if absent. An unknown `PRAGMA key` can otherwise be ignored by plaintext SQLite.
3. Apply the correct key **before schema reads**, verify a keyed database read and reject corruption/wrong-key errors without deleting data; never log key material.
4. Run the bundled Drizzle SQL migration against this database alone; gate dashboard and repository access until migration and integrity checks pass.
5. On failure, preserve ciphertext/key; do not silently create a replacement DB, mark migration successful or open another user's store. Recover only via verified explicit retry/restore.

SQLCipher native compatibility, migration atomicity and exact key lifecycle require authorized Android/iPhone validation; the **D04–D06 owner-approved policies are not tested implementations**. This is a proposal, **not an implemented security guarantee**.

## Mobile vs server-side keys
| Credential | Location |
|---|---|
| Supabase **publishable** key and project URL | App bundle allowed; **not a secret** |
| Supabase user session tokens | Protected mobile session store |
| Supabase secret/service-role key | **Server only**, never in mobile app |
| Third-party AI provider key | Supabase Edge Function secrets only |
| Google OAuth mobile client identifier | App config as required; not a client secret |
| Google/Apple user access tokens | Protected device storage / provider SDK; minimum scopes |

## Edge Function protection
- Require a verified Supabase user identity for AI endpoints; do not treat a publishable key as authentication.
- Validate length, ranges and format of the workout request; cap token/compute budget and apply per-user rate limits/quotas.
- Provider key stays in Supabase's server-side secret store. Never put secrets in ordinary client-visible tables, `EXPO_PUBLIC_*`, repository history or response payloads.
- Send minimum required workout inputs to external AI APIs, after explaining the privacy implication and obtaining appropriate consent.
- Return typed/validated output. Log only safe request IDs, latency, error categories and usage, not full health/workout inputs.
- For future user-owned server tables: enable Row Level Security and explicit owner-scoped policies, including appropriate INSERT/UPDATE checks. Do not allow one user to query another user's rows.

## Security test cases
Cold start offline; app kill during write; expired/revoked session; logout then same-user re-login; blocked second-account login; confirmed reset/rebind; stolen/modified backup; malicious imported file; auth token leakage; AI endpoint unauthorized call; excessive function requests; Android uninstall/reinstall; iOS Keychain reinstall semantics; recovery-key loss; database encryption verification.

- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/docs/guides/auth/auth-captcha
- https://supabase.com/docs/guides/security/production-checklist
## Current sources (revalidate before implementing)
- https://supabase.com/docs/guides/auth/quickstarts/react-native
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/functions/secrets
- https://docs.expo.dev/versions/latest/sdk/sqlite/
- https://docs.expo.dev/versions/latest/sdk/securestore/

---

[← Documentation hub](00-INDEX.md) · [Threat model →](14-THREAT-MODEL.md)
