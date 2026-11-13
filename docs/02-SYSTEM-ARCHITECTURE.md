<div align="center">

# 🏗 System Architecture
**Local-first boundaries, flows and module contracts**

[← Docs hub](00-INDEX.md) · [🏠 Home](../README.md) · [🎨 Design](../DESIGN.md)

</div>

> [!NOTE]
> **Document status:** Planning / proposed specification. Product implementation has not started.

---

**Status:** Proposed design only. No code or infrastructure has been created.

## Boundary diagram

```text
                          ┌──────────────────────────┐
                          │ React Native / Expo app  │
                          │ UI · domain services     │
                          └───────────┬──────────────┘
                                      │
                          ┌───────────▼──────────────┐
                          │ WorkoutRepository        │
                          │ Local SQLite = authority │
                          └───────────┬──────────────┘
                                      │
             ┌────────────────────────┼──────────────────────────┐
             │                        │                          │
     [Authentication]           [AI (online)]             [Personal backup]
     Supabase Auth              Supabase Edge Function    Drive / iCloud
     accounts/sessions          provider secret on server encrypted export
             │                        │                          │
             └────────────────────────┴──────────────────────────┘

     FUTURE ONLY: Optional sync engine <-> Supabase Postgres (RLS)
```

**Important:** A login session and the online identity **do not mean** workout data is uploaded. Initial workout reads/writes must not require HTTP calls.

## Proposed source tree (not created)
```text
src/
  app/                   Expo Router screens/layouts
  features/auth/         signup, login, session gate
  features/workouts/     workout editor, live session, history
  features/plans/        templates, schedule
  features/progress/     calculations, chart view
  features/settings/     privacy, logout, backups
  features/ai/           plan generator, result review
  domain/                types, validation, use cases, repository contracts
  data/local/            SQLite schema, migrations, SQL repositories
  data/remote/auth/      Supabase auth adapter
  data/remote/ai/        authenticated Edge Function caller
  services/backup/       encrypted export/import adapters (planned)
  services/sync/         cloud sync adapters (future only)
  security/              secure session and local key management
```

## Critical abstractions
- `WorkoutRepository` defines list/get/create/update/delete for sessions, sets and exercise history.
- `PlanRepository` handles plans and assigned workout days.
- `SessionManager` owns authenticated identity and cached offline identity, and routes to Login or Dashboard.
- `LocalDatabaseManager` opens only the matching user's encrypted SQLite partition and migrates schema.
- `BackupPort` exports/imports a **versioned, encrypted** snapshot with provider-specific adapters.
- `SyncPort` is a future optional online synchronization boundary; its absence must not affect local operations.

## App startup sequence
1. Load local installation state and protected session securely; show splash/loading gate, not a flash of another user's Dashboard.
2. If no previously authenticated local account/session: show Welcome/Login (online required for signup).
3. If an existing session and matching offline account binding are present: unlock that account's local store and show Dashboard, including offline.
4. If online, refresh/revalidate session as appropriate in background; handle revocation/expired refresh credentials safely without mixing accounts.
5. If session is confirmed invalid, require authentication for server operations; handle local access according to the explicit security policy rather than pretending online validation happened offline.
6. Logout clears auth credentials, closes local DB and returns to Login; local logs remain account-isolated until explicit erasure.

## Data direction
- Exercise/workout edits: UI -> use case -> local SQLite transaction -> UI observes changed local data.
- Optional AI draft: UI -> authenticated Edge Function -> AI provider -> validated response -> preview -> user accepts -> SQLite.
- Optional backup: SQLite consistent snapshot -> encrypted, versioned archive -> Drive/iCloud storage. Restore follows verified reverse path.
- Future sync: local change log -> authenticated sync API/DB with RLS -> reconciliation -> local DB. Local write remains first.

## Network resilience
Use explicit states: `offline`, `authenticated-online`, `authentication-needs-revalidation` and `signed-out`. Never block a local write because an AI endpoint or backup provider is unavailable. Queue **only user-enabled** cloud activity and implement retries/idempotency later.

## Data ownership
Current device stores workouts. Supabase Auth stores account identity/session data. Supabase Edge Functions may receive minimal AI-request fields and third-party model providers process those fields. Personal backups go to the user's chosen cloud account; an optional future app cloud database is a different destination.

## Engineering decisions to validate
Expo SDK and native-build choice; encryption key lifecycle; database per user vs scoped rows; use of a sync-oriented change journal from day one; third-party backup integrations on both OSs; performance and battery impact of background operations.

---

[← Documentation hub](00-INDEX.md) · [Local data model →](03-LOCAL-DATA-MODEL.md)
