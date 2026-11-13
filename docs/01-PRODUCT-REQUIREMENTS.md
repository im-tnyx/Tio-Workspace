<div align="center">

# 🎯 Product Requirements
**Scope, user journeys and MVP acceptance**

[← Docs hub](00-INDEX.md) · [🏠 Home](../README.md) · [🎨 Design](../DESIGN.md)

</div>

> [!NOTE]
> **Document status:** Planning / proposed specification. Product implementation has not started.

---

**Document state:** Proposed specification, 2026-11-13. **Implementation state: not started.**

## Vision
A trustworthy Android/iOS workout diary that **requires an account** but stores the workout diary **locally by default**. The app should open straight to the dashboard after its first successful login and work for normal workout logging without connectivity. Personal cloud backup is opt-in; app-database sync is a separate future opt-in feature.

## Non-negotiable requirements
1. First-time signup/login uses Supabase Auth online. The user stays signed in across app closes/restarts unless they sign out or the session must be reauthenticated for security reasons.
2. An authenticated, previously initialized device must allow offline workout entry/read. No online auth check is required on every screen or app open.
3. Workout sessions, plans, sets, repetitions, weight, duration, notes and progress live in the **device SQLite database**, not Supabase Postgres, in initial releases.
4. Workouts belong to one user account. One account must never view another account's local history, even on a shared device.
5. Signing out removes the active session and locks/hides that account's local data; it does **not** automatically erase the workout history. Provide a separate, clearly confirmed delete-local-data action.
6. The app must not claim a local-only workout will automatically appear on another device. Transfer requires an explicit backup/restore or future sync.
7. AI plan generation is optional and online. Its third-party API key lives in server-side function secrets, not the mobile binary.
8. Backup and online database sync are two independent, user-controlled features; neither silently enables the other.

## Target platforms and proposed stack
- iOS and Android through React Native, Expo, TypeScript and Expo Router.
- Supabase Auth only for the initial account/login requirement. Supabase Edge Functions only when online functionality needs a server.
- Expo SQLite for local records, encrypted native SQLite build when approved and implemented.
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
| Cloud Sync toggle (future) | Opt in/out of app database sync | Toggle controls online syncing |

## Workout entry behaviour
- Let users create an exercise with a name, muscle group, equipment and optional notes.
- Plan a workout day with ordered exercises and target sets/reps/rest.
- Record workout session start/end, per-set weight, reps, duration or distance (where applicable), warm-up flag, completion and notes.
- Calculate duration, exercise history, personal records and progress locally, including after device restart.
- Autosave changes in SQLite using transactions; avoid losing the current session when the app is backgrounded.
- Use metric units first with a clear pathway to imperial units, not destructive conversions.
- Handle edit/delete with confirmation and a future-sync-compatible tombstone strategy.

## MVP exclusions
No community features, social feed, trainer marketplace, billing/subscriptions, third-party health app integrations, multi-device realtime sync or automatic AI coaching are necessary for the first usable build. No claim of guaranteed background cloud backups before platform capability testing.

## User stories and acceptance
- As a new user, I can register online, reopen the app and go straight to Home without signing in again.
- As a returning user without network access, I can see/edit/finish workouts associated with my existing account.
- As a user, I can log out without my workout history being silently deleted.
- As two users sharing a phone, we cannot browse each other's logs after switching accounts.
- As a privacy-conscious user, I can confirm that workout rows are not being uploaded to the application's database by default.
- As a user who chooses backup, I can restore onto a fresh installation **after demonstrating** the required account identity and decryption/recovery method.
- As a user choosing AI, I can see what personal inputs will be transmitted and decline.

## Success metrics (proposals)
Workout save reliability, crash-free sessions, startup-to-dashboard time, offline completion rate, restore success in tests and percentage of users who explicitly activate cloud features. Avoid analytics on workout content without informed consent.

## Open product decisions
App display name and branding; exercise library source/licensing; Google/Apple sign-in in addition to email login; whether PIN/biometrics are optional; backup UX and recovery mechanism; AI provider; subscription or usage quota if AI costs arise.

---

[← Documentation hub](00-INDEX.md) · [Architecture →](02-SYSTEM-ARCHITECTURE.md)
