# 🏗 Architecture snapshot

**Phase:** Documentation only. No Expo runtime or Supabase infrastructure exists.

- Planned stack: React Native + Expo + TypeScript for iOS/Android.
- Mandatory online signup/sign-in through Supabase Auth, with a normally persistent session on reopen.
- **Offline-first workouts:** SQLite is the local source of truth after a previously successful account sign-in. Workout CRUD must not depend on internet.
- Account-specific local storage prevents user A seeing user B's diary; proposed encryption and key lifecycle still need owner approval and native-device validation.
- **Owner-chosen architecture v2.1:** feature-first modular monolith. `src/app/` = routes only; `src/features/<name>/` owns UI, domain repository ports and feature data adapters; `src/platform/` owns SQLite connection/migrations/account switch, Auth adapter and keys; `src/shared/` is reusable non-business UI/theme/utils; `src/bootstrap/` is optional wiring. None of these directories exist yet.
- Feature screens/hooks must not directly import SQLite, Supabase or SecureStore. Cross-feature deep imports are banned; use deliberate `index.ts` public contracts. Complex orchestration can add `application/` use cases; no empty folders or packages per feature. [Canonical structure v2.1](../../docs/10-REPOSITORY-STRUCTURE.md).
- Future AI requests are authenticated Supabase Edge Function calls; AI provider secret remains server-side and generated drafts need user approval before local save.
- Optional encrypted personal backups to the user's Drive/iCloud are snapshots; future Supabase Postgres multi-device sync is distinct and separately opt-in.
- Stable IDs, owner IDs, timestamps and tombstones should support later migration, but no future sync is implemented.

**Canonical:**
[System architecture](../../docs/02-SYSTEM-ARCHITECTURE.md) ·
[Data model](../../docs/03-LOCAL-DATA-MODEL.md) ·
[Phase 0 decisions](../../docs/17-PHASE-0-DECISION-PACK.md)
