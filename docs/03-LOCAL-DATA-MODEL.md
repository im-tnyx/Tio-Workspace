<div align="center">

# 🗄 Local Data Model
**Account-scoped SQLite entities and migration rules**

[← Docs hub](00-INDEX.md) · [🏠 Home](../README.md) · [🎨 Design](../DESIGN.md)

</div>

> [!NOTE]
> **Document status:** Planning / proposed specification. Product implementation has not started.

---

**Not implemented:** This is a schema specification, not a migration script. Actual SQLite DDL, constraints and indexes will be reviewed before development.

## Proposed Drizzle ORM and local migration contract

> [!IMPORTANT]
> **Phase 0 proposal — owner decision pending.** Drizzle is a query/schema toolkit, **not** a database or remote storage service. No application code, packages, native builds, migrations or Supabase infrastructure are authorized by this document.

| Responsibility | Proposed owner |
|---|---|
| Device-local data | Expo SQLite, encrypted by SQLCipher in a verified native build |
| Account-file lifecycle | `platform/database/LocalDatabaseManager`, bound to the verified Supabase `user_id` |
| Encryption keys | `platform/security/` and OS-protected storage; distinct per account |
| Schema and migrations | TypeScript Drizzle schema + reviewed, version-controlled SQLite SQL generated via `drizzle-kit generate` |
| Migration execution | Bundled offline SQL applied only to the matching, already-unlocked local database |
| Feature queries | Drizzle adapters in `features/<name>/data/`; repository contracts remain in `features/<name>/domain/` |
| Applied version tracking | One Drizzle migration journal; `app_meta` for separate app/install metadata, not a competing authoritative migration counter |

**Startup gate (proposal):** resolve the permitted account binding → open only its DB file → confirm SQLCipher is actually in the native binary → apply its protected database key → verify the keyed database can be read → run bundled pending Drizzle migrations → check resulting schema/integrity → open feature repositories and the dashboard. Keep user-data operations blocked during migration. Do not migrate a shared/default, locked, plaintext or different account's file. No network call is needed for local migration.

**Safety and failure:** Review every generated SQL diff (especially `DROP`, renames, table rebuilds, indexes and foreign keys). Prefer additive migrations; do not use unreviewed `drizzle-kit push` against on-device user data. Before destructive change, require an adequately tested **consistent encrypted account-bound rollback snapshot**, sufficient free space and a documented recovery procedure. Do not assume every migration runs atomically or that Drizzle supplies automatic reversible `down` migrations. On failure, preserve the original encrypted DB/key, block UI access, surface a recoverable error and offer only explicit, verified account-matched restore/retry. **Never** silently erase/recreate a database or fall back to plaintext.

**Minimal MVP:** create only the *approved* tables needed for a meaningful workout-log slice. The complete logical schema below is a proposal, not a commitment to migrate every table in release one. Keep necessary exercise/session/set relations and user ownership; do not collapse joins solely to minimize table count. Agree weight precision, foreign keys and first migration subset before coding.

**Phase 1 feasibility gate:** pin compatible Expo SDK / `expo-sqlite` / `drizzle-orm` / `drizzle-kit` versions; validate SQL file bundling, migration journal and any required Metro/Babel support. Exercise the flow on real Android/iPhone native builds. Expo Go is insufficient to validate SQLCipher. See [security order](04-AUTH-AND-SECURITY.md), [migration acceptance tests](08-TEST-PLAN.md) and [readiness gate](21-PHASE-1-READINESS.md).

Official references (recheck versions at implementation): [Drizzle + Expo SQLite](https://orm.drizzle.team/docs/sqlite/connect-expo-sqlite), [migration fundamentals](https://orm.drizzle.team/docs/migrations), [Expo SQLite SQLCipher](https://docs.expo.dev/versions/latest/sdk/sqlite/).

## Design rules
- Locally persisted data is authoritative until future sync is explicitly enabled.
- Use stable random UUID-style IDs for records created offline. Never rely on sequential IDs for cross-device identity.
- All account-owned rows are scoped to the Supabase `user_id`, including plans and workout content.
- UTC epoch millisecond timestamps (`created_at`, `updated_at`) on mutable records; render dates in the user's timezone.
- The proposed Drizzle migration journal is authoritative for applied schema versions; `app_meta` records only distinct installation/compatibility metadata. Use `deleted_at` tombstones for potentially synchronized user records.
- Database transactions for session edits, set updates and import. Parameterized SQL only.
- The local file must not be shared across users without strict access controls; the preferred proposal is **per-account encrypted database files**, with account-ID-safe file naming.

## Tables
| Table | Key fields | Purpose |
|---|---|---|
| `app_meta` | `key` PK, `value` | Schema revision and data installation markers |
| `local_accounts` | `user_id` PK, `last_used_at` | Safe mapping of known accounts to local files; never passwords |
| `exercises` | `id` PK, `user_id`, `name`, `category`, `equipment`, `is_custom`, timestamps | Local exercise catalog/custom exercises |
| `workout_plans` | `id` PK, `user_id`, `title`, `goal`, `notes`, timestamps | Plan templates |
| `plan_days` | `id` PK, `plan_id`, `day_index`, `title`, timestamps | Weekly/day structure |
| `plan_exercises` | `id` PK, `plan_day_id`, `exercise_id`, `sort_order`, `target_sets`, `target_reps_min`, `target_reps_max`, `rest_seconds` | Plan prescriptions |
| `workout_sessions` | `id` PK, `user_id`, `plan_day_id` nullable, `started_at`, `ended_at` nullable, `status`, `notes`, timestamps | Actual workout occurrence |
| `session_exercises` | `id` PK, `session_id`, `exercise_id`, `sort_order`, `notes` | Exercises actually performed |
| `workout_sets` | `id` PK, `session_exercise_id`, `sort_order`, `set_type`, `reps`, `weight_kg`, `duration_seconds`, `distance_m`, `rpe`, `completed_at`, timestamps | Actual set data |
| `body_measurements` | `id` PK, `user_id`, `measured_at`, `weight_kg`, `body_fat_pct` nullable, `notes` | Optional measurements |
| `user_preferences` | `user_id` PK, `preferred_weight_unit`, `week_start`, `theme`, `backup_opt_in` | Per-account settings |
| `local_changes` (future-compatible) | `event_id` PK, `user_id`, `entity_type`, `entity_id`, `operation`, `changed_at` | Optional local change journal for future sync |

**Numeric:** Store weights canonically in kg; UI may convert to lb. Use an appropriate exact numeric representation/precision policy rather than silently introducing cumulative rounding errors. Enforce exercise/set bounds in domain validation.

## Relationship sketch
```text
workout_plans 1 ─── * plan_days 1 ─── * plan_exercises * ─── 1 exercises
workout_sessions 1 ─── * session_exercises * ─── 1 exercises
session_exercises 1 ─── * workout_sets
local account (user_id) 1 ─── * account-owned records
```

## Data lifecycle
- **Create/update:** write locally in one transaction, update timestamps, refresh derived stats from local source.
- **Delete:** soft-delete user-owned sync candidates where practical; purge only via explicit irreversible erase or retention policy.
- **Logout:** clear current auth binding and secure keys in memory; close DB; do not delete persisted workouts.
- **User switch:** close prior account DB before opening the next. Authenticate the next identity online before decrypting its data.
- **Uninstall/device loss:** local database may be lost. Recovery requires a **completed compatible backup**; signing into Supabase alone does not reconstruct workouts.
- **Schema migration:** monotonically increasing versions with upgrade/rollback testing and a snapshot before destructive changes.
- **Import:** verify schema version, account identity, authenticated integrity and key before changing any data; restore atomically.

## Queries and indexes to plan
Session history by `user_id + started_at`, plans by owner and update time, sets by session exercise and sort order, exercise history via session exercises, and uniqueness for stable IDs. Schema/index benchmarks after realistic sample data.

## Cloud-readiness without cloud dependence
Keep `user_id`, stable IDs, timestamps and deletion markers from day one. Define deterministic conflict handling **before** sync launches; these fields alone do not magically resolve simultaneous edits.

---

[← Documentation hub](00-INDEX.md) · [Security →](04-AUTH-AND-SECURITY.md)
