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
- Supabase Auth manages email/password registration, verification if enabled, login, password reset, signout and session refresh.
- `persistSession` and a correctly designed secure React Native storage adapter keep users signed in on normal app restarts.
- First account signup/login needs internet. Previously initialized devices can continue **local** workout work offline.
- App restart **does not** automatically require sign-in. Reauthentication may be required when the session is revoked, logout occurs, refresh credentials cannot be recovered, or security policies mandate it.
- Offline status must never be mistaken for positive proof that the remote account remains active; protect privileged server operations with fresh server-side authentication.
- **Owner-approved offline policy:** cached locally verified bound identity may use local workouts offline despite delayed remote revocation detection; once online, protected server calls must revalidate. Optional PIN/biometrics can be evaluated later, not silently required on every restart.

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

## Current sources (revalidate before implementing)
- https://supabase.com/docs/guides/auth/quickstarts/react-native
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/functions/secrets
- https://docs.expo.dev/versions/latest/sdk/sqlite/
- https://docs.expo.dev/versions/latest/sdk/securestore/

---

[← Documentation hub](00-INDEX.md) · [Threat model →](14-THREAT-MODEL.md)
