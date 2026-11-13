<div align="center">

# 🗄 Local Data Model
**Account-scoped SQLite entities and migration rules**

[← Docs hub](00-INDEX.md) · [🏠 Home](../README.md) · [🎨 Design](../DESIGN.md)

</div>

> [!NOTE]
> **Document status:** Planning / proposed specification. Product implementation has not started.

---

**Not implemented:** This is a schema specification, not a migration script. Actual SQLite DDL, constraints and indexes will be reviewed before development.

## Design rules
- Locally persisted data is authoritative until future sync is explicitly enabled.
- Use stable random UUID-style IDs for records created offline. Never rely on sequential IDs for cross-device identity.
- All account-owned rows are scoped to the Supabase `user_id`, including plans and workout content.
- UTC epoch millisecond timestamps (`created_at`, `updated_at`) on mutable records; render dates in the user's timezone.
- `schema_version` for local migrations and `deleted_at` tombstones for potentially synchronized user records.
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
