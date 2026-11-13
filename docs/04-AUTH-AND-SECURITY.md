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
- Protect cached local access with an explicit offline trust policy; optional PIN/biometrics are a product decision.

## Account isolation
- Bind each local account to the exact verified Supabase `auth.users.id`, not email (which can change).
- Prefer an encrypted database per authenticated account and a distinct securely managed key per account.
- On logout, remove session tokens, wipe active secrets from memory where feasible, close handles and route to Login. The user's local data **remains**, but must not be browseable as a signed-out or different user.
- Re-login to the same identity may reopen that account's existing database. Login as another account must open a different store.
- Offer an explicitly confirmed `Delete local workout data` action and document that it cannot be undone without a backup.
- Decide and test account-deletion behaviour separately from ordinary logout.

## On-device encryption
- Proposed: Expo SQLite with SQLCipher in a **development/production native build**, not Expo Go.
- After opening DB, confirm `PRAGMA cipher_version` exists before trusting encryption; set key before any schema reads.
- Never hardcode SQLCipher encryption keys or API keys; manage small key material via platform-protected storage (e.g., Expo SecureStore) with appropriate lifecycle handling.
- Consider backup/restore of the **encryption key** carefully: a device-bound key must not be the only means of decrypting a cloud backup on a new device.
- Expo SecureStore behaviour differs by OS on uninstall. Do not promise that it survives reinstall or that deleting an app always deletes iOS Keychain values.
- Sensitive logs/tokens must not be printed to console, crash reports or analytics; clean debug traces.

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
Cold start offline; app kill during write; expired/revoked session; logout then user switch; stolen/modified backup; malicious imported file; auth token leakage; AI endpoint unauthorized call; excessive function requests; Android uninstall/reinstall; iOS Keychain reinstall semantics; recovery-key loss; database encryption verification.

## Current sources (revalidate before implementing)
- https://supabase.com/docs/guides/auth/quickstarts/react-native
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/functions/secrets
- https://docs.expo.dev/versions/latest/sdk/sqlite/
- https://docs.expo.dev/versions/latest/sdk/securestore/

---

[← Documentation hub](00-INDEX.md) · [Threat model →](14-THREAT-MODEL.md)
