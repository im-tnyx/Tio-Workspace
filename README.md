# Tio Workspace — Workout Log App

> **Status:** Documentation / planning only (13 November 2026). **No mobile app or backend is implemented yet.**

Tio is a planned **React Native + Expo** workout logger built around **local-first, offline-capable data storage**. Users sign up or log in to an online account once and normally stay signed in across app restarts. Their workout history stays **on the device** by default.

## Core commitments

- **Account required:** Supabase Auth for signup, login, password recovery and persistent sessions.
- **Local-first workouts:** SQLite is the source of truth for workout logs, plans and progress.
- **Offline after initial login:** Existing users can log workouts without a live internet connection; account creation, online verification and some session recovery still require internet.
- **No workout data in the app's server database by default.**
- **AI plan generation (optional):** Authenticated Supabase Edge Functions hold provider API secrets on the server; only the minimum required inputs are transmitted.
- **Personal backups (planned):** Explicit, encrypted backups to the user's Google Drive or iCloud where supported.
- **Future sync (opt-in):** Possible Supabase Postgres sync through a repository/sync abstraction, but not in the first release.

## Read the plan

1. [Product requirements](docs/01-PRODUCT-REQUIREMENTS.md) — user flows, MVP scope and screens.
2. [System architecture](docs/02-SYSTEM-ARCHITECTURE.md) — boundaries, modules and offline strategy.
3. [Local data model](docs/03-LOCAL-DATA-MODEL.md) — SQLite schema and migration rules.
4. [Authentication and security](docs/04-AUTH-AND-SECURITY.md) — sessions, encryption, account isolation and API secrets.
5. [Backup, restore and future sync](docs/05-BACKUP-AND-SYNC.md) — Google Drive, iCloud and migration path.
6. [Implementation roadmap](docs/06-ROADMAP.md) — milestones and dependencies; **not yet executed**.
7. [AI/API contracts](docs/07-API-CONTRACTS.md) — planned Edge Function contract.
8. [Testing and acceptance](docs/08-TEST-PLAN.md) — expected behaviour and edge cases.
9. [Architecture decisions](docs/09-DECISIONS.md) — accepted intentions, proposals and open questions.

## Explicitly not implemented

This repository currently contains **documentation only**. No Expo scaffold, Supabase deployment, database migration, OAuth configuration, API key, production backup integration or cloud sync has been created.

## Rules for implementation later

1. Review and approve decisions before writing app code.
2. Keep workout features independent of network availability wherever practical.
3. Do not embed service-role, AI provider or OAuth client secrets in a mobile bundle.
4. Make export/restore and account isolation testable, and do not claim data survives uninstall without a successful backup.
5. Re-check Expo, Supabase, Apple and Google docs when implementation begins; versions and platform policies change.
