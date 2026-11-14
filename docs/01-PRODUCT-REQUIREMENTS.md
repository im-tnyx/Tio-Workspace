<div align="center">

# 🎯 Product Requirements
**Scope, user journeys and MVP acceptance**

[← Docs hub](00-INDEX.md) · [🏠 Home](../README.md) · [🎨 Design](../DESIGN.md)

</div>

> [!NOTE]
> **Document status:** Planning / proposed specification. Product implementation has not started.

---

**Document state:** Owner-selected MVP and single-account behavior recorded 2026-11-14; detailed visual design and security verification remain pending. **Implementation: not started.**

## Vision
A trustworthy Android/iOS workout diary that **requires an account** but stores the workout diary **locally by default**. The app should open straight to the dashboard after its first successful login and work for normal workout logging without connectivity. Personal cloud backup is opt-in; app-database sync is a separate future opt-in feature.

## Non-negotiable requirements
1. First-time signup/login uses **Supabase Auth email/password** online for the MVP; Google/Apple sign-in is a later optional evaluation. The user stays signed in across app closes/restarts unless they sign out or the session must be reauthenticated for security reasons.
2. An authenticated, previously initialized device must allow offline workout entry/read. No online auth check is required on every screen or app open.
3. Workout sessions, plans, sets, repetitions, weight, duration, notes and progress live in the **device SQLite database**, not Supabase Postgres, in initial releases.
4. **Single-account-per-installation:** one verified Supabase user UUID can be locally bound on a given installation. No in-app add-account or switch-account feature. A second identity cannot sign in while the original binding/workouts remain; existing data must never become readable by a different account.
5. Signing out removes the active session and locks/hides the bound account's local data; it does **not** erase workouts or release the identity binding. Re-login to the **same** verified account restores access. A distinct, clearly confirmed **erase-this-device** flow (including backup/data-loss warning) is required before any new identity can be bound; never offer an implicit switch.
6. The app must not claim a **Local Only** workout will automatically reappear on another device. After OS clear-data, uninstall/reinstall, phone loss or explicit erase, same-account online login leads to: **Personal Backup mode** → explicit user-initiated matching encrypted Drive/iCloud **Restore Backup**; **future previously enabled Supabase Sync mode** → automatic authorized download of available server workouts to a new local encrypted store, **no separate backup restore step**; **Local Only** or unavailable cloud data → empty local workout history. Normal same-account logout/re-login **without wiping local data** preserves it. Supabase Auth by itself stores no workout diary.
7. AI plan generation is optional and online. Its third-party API key lives in server-side function secrets, not the mobile binary.
8. **One active cloud option at a time:** default **Local Only**; optionally **Personal Backup** to user's Google Drive/iCloud (or encrypted manual export), **never Supabase backup storage**; or **future opt-in Supabase Sync**, not implemented or authorized now. Personal Backup and Supabase Sync are **mutually exclusive settings**, never both ON. Personal Backup alone offers manual/future best-effort Off/Daily/Weekly/Monthly schedule and explicit Restore; Sync mode would auto-download available authorized server records after same-account login with no Backup Restore button. Photos/videos require separately approved attachments; Personal Backup encryption is mandatory. Switching modes must inform the user about prior cloud copies and require explicit, verified deletion/permission handling—no silently retained dual cloud copy. Sync may propagate deletions and is not guaranteed historical recovery.
9. The owner accepts that previously verified offline local access can continue until online revalidation; offline mode cannot detect remote revocation in real time. Server operations require valid server-side authorization.
10. The owner selected an OS-protected **per-bound-account SQLCipher key** and a distinct **portable user-held backup recovery secret** as design principles. Actual key lifecycle, cryptographic format, recovery UX and Android/iOS validation are separate security gates.

**OS-managed backup boundary (future native gate):** “Local Only / Backup OFF” must not accidentally use Android Auto Backup, Android device-to-device transfer, or iOS device/iCloud app backup to copy local workout SQLite, sidecars, snapshots or sensitive account material. Define and test platform-specific exclusions; an in-app backup switch alone cannot control OS transfers. Do not promise absolute no-copy guarantees beyond verified platform control. See [backup & sync](05-BACKUP-AND-SYNC.md).

**Fresh-install backup discovery (future):** Reinstall/OS clear-data may erase the remembered backup choice. After same-account online authentication, offer voluntary **Find/Restore existing encrypted backup** even when local settings are empty/unknown. The user selects and authorizes their Drive/iCloud account (or imports an encrypted file), verifies a same-user archive and supplies a portable recovery secret. Discovery must not turn on backup, upload workouts or enable paid Supabase Sync.

**Future membership policy (ADR-014):** Supabase Sync will synchronize the **complete supported workout dataset** only for a paid Tio member who **separately enables Sync** in Settings. Membership purchase alone cannot trigger upload. Default Local Only and user-owned Google Drive/iCloud Personal Backup do **not** require Sync membership. Price, subscription lifecycle and implementation are not yet approved.

## Target platforms and proposed stack
- iOS and Android through React Native, Expo, TypeScript and Expo Router.
- Supabase Auth only for the initial account/login requirement. Supabase Edge Functions only when online functionality needs a server.
- **Owner-selected:** Expo SQLite + Drizzle ORM/Drizzle Kit + native SQLCipher for local records and versioned migrations (ADR-010); functionality and encryption are not yet tested.
- Expo SecureStore for small secrets/key material and a secure session storage adapter.
- Google Drive/iCloud integrations are **planned**, not currently set up.

## MVP screens and flows
| Screen | User goal | Offline availability |
|---|---|---|
| Welcome / Signup / Login / Password reset | Authenticate an account | New authentication requires internet |
| Startup / Session gate | Resume existing account securely | Previously initialized local account available offline |
| Dashboard | Today's plan, recent logs, quick start | Yes |
| Exercise library | Find/create an exercise | Yes for locally cached exercises |
| Workout session | Start, pause, record sets, reps, weights, notes, finish | Yes |
| Workout plans | Build/edit schedule and exercises | Yes |
| History & workout details | Review previous sessions | Yes |
| Progress | PRs, volume and measurements, calculated locally | Yes |
| Profile & settings | Change preferences; logout; manage data | Mostly |
| Backup & Restore (later milestone) | Save/recover encrypted personal backup | Transfer requires internet |
| AI Plan Generator (later milestone) | Get a generated draft plan | No |
| Supabase Sync (future membership) | Full supported workout-data Sync with paid entitlement and explicit user opt-in | Online; **not in MVP** |

## Workout entry behaviour
- Let users create an exercise with a name, muscle group, equipment and optional notes.
- Plan a workout day with ordered exercises and target sets/reps/rest.
- Record workout session start/end, per-set weight, reps, duration or distance (where applicable), warm-up flag, completion and notes.
- Calculate duration, exercise history, personal records and progress locally, including after device restart.
- Autosave changes in SQLite using transactions; avoid losing the current session when the app is backgrounded.
- Use metric units first with a clear pathway to imperial units, not destructive conversions.
- Handle edit/delete with confirmation and a future-sync-compatible tombstone strategy.

## MVP exclusions
No multi-account/add-account/switch-account UI, community features, social feed, trainer marketplace, billing/subscriptions, third-party health app integrations, multi-device realtime sync or automatic AI coaching are necessary for the first usable build. No claim of guaranteed background cloud backups before platform capability testing.

## User stories and acceptance
- As a new user, I can register online, reopen the app and go straight to Home without signing in again.
- As a returning user without network access, I can see/edit/finish workouts associated with my existing account.
- As a user, I can log out without my workout history being silently deleted.
- As the owner of a bound installation, I cannot add/switch to a second Tio account; signing in with another identity is rejected without exposing or deleting my existing workouts.
- As a returning user, I can log back into the **same** account after logout and recover my retained local history.
- As a privacy-conscious user, I can confirm that workout rows are not being uploaded to the application's database by default.
- As a user who chooses backup, I can restore onto a fresh installation **after demonstrating** the required account identity and decryption/recovery method.
- As a user choosing AI, I can see what personal inputs will be transmitted and decline.

## Success metrics (proposals)
Workout save reliability, crash-free sessions, startup-to-dashboard time, offline completion rate, restore success in tests and percentage of users who explicitly activate cloud features. Avoid analytics on workout content without informed consent.

## Open product decisions
Final app branding/IDs and visual polish; exercise catalog licensing; future Google/Apple login; optional PIN/biometrics and recovery/lockout UX; exact key lifecycle and future backup cryptography/provider UX; AI provider and quotas. **Approved MVP scope:** email/password, local exercises/plans, offline workout sets/reps/weight, history/progress, settings, logout and explicit erase warnings. Not a Phase 1 implementation approval.

---

[← Documentation hub](00-INDEX.md) · [Architecture →](02-SYSTEM-ARCHITECTURE.md)
