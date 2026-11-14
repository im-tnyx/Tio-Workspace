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

## Selected module architecture v2.1 (owner accepted; not implemented)

**Chosen organization:** feature-first modular monolith with feature-owned business rules/repositories and shared platform adapters. See the [complete tree, dependency matrix and owner-approved layout](10-REPOSITORY-STRUCTURE.md). **Nothing under `src/` exists yet** and the layout decision does not authorize app initialization.

```text
src/
  app/                  Expo Router routes/layouts + root providers only
  features/
    auth/               login/session UI and feature logic
    home/               dashboard
    exercises/          exercise library
    workouts/           screens, components, hooks, domain, data, tests, index.ts
    plans/              plan editor
    progress/           progress/history screens
    settings/           account/local-data privacy settings
  platform/
    database/           SQLite connection/migrations/account rebind
    auth/               technical Supabase Auth client/adapter
    security/           key storage, encryption/isolation primitives
  shared/
    ui/                 reusable presentational components
    theme/              tokens
    utils/              pure general utilities
  bootstrap/            optional dependency wiring
```

Feature repository **interfaces live in `features/<name>/domain/`** and feature-specific implementations in `features/<name>/data/`. Screens/components/hooks do not import SQLite, SecureStore or Supabase SDK directly; complex coordination may add an optional `application/` use-case layer. `src/app/` owns routes/layouts and root providers only, feature-to-feature deep imports are forbidden, and public `index.ts` exports are used when cross-feature interaction is genuinely required. No empty folders, package-per-feature or speculative AI/backup/sync modules.

## Critical abstractions
- `features/workouts/domain/WorkoutRepository` defines list/get/create/update/delete for sessions, sets and exercise history; `features/workouts/data/` implements it using `platform/database/`.
- `features/plans/domain/PlanRepository` handles plans and assigned workout days; its adapter remains feature-owned.
- A feature-level session coordinator uses the technical `platform/auth/` adapter; the Expo Router gate chooses Login or Dashboard. Cached identity remains subject to pending offline-session approval.
- The proposed `platform/database/LocalDatabaseManager` opens/closes/rebinds the matching account's SQLite store and owns migrations; encrypted partitions and key lifecycle require separate owner approval and native testing.
- **Candidate, not approved:** `platform/database/` owns the native Expo SQLite + SQLCipher adapter and bundled Drizzle migration runner. Feature `data/` implementations may query with Drizzle behind domain repository interfaces; routes, screens, hooks and domain models do not import the ORM. Follow the [local migration proposal](03-LOCAL-DATA-MODEL.md) for unlock order and failure handling.
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
- Exercise/workout edits: feature UI/hook -> repository interface (optional application use case for complex flows) -> feature SQL adapter -> account-bound platform/database transaction -> UI observes updated local state.
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
