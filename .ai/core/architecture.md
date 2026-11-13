# 🏗 Architecture snapshot

**Phase:** Documentation only. No Expo runtime or Supabase infrastructure exists.

- Planned stack: React Native + Expo + TypeScript for iOS/Android.
- Mandatory online signup/sign-in through Supabase Auth, with a normally persistent session on reopen.
- **Offline-first workouts:** SQLite is the local source of truth after a previously successful account sign-in. Workout CRUD must not depend on internet.
- Account-specific local storage prevents user A seeing user B's diary; proposed encryption and key lifecycle still need owner approval and native-device validation.
- UI → application use cases → domain repository contracts → local data adapter. Keep remote SDKs out of the domain.
- Future AI requests are authenticated Supabase Edge Function calls; AI provider secret remains server-side and generated drafts need user approval before local save.
- Optional encrypted personal backups to the user's Drive/iCloud are snapshots; future Supabase Postgres multi-device sync is distinct and separately opt-in.
- Stable IDs, owner IDs, timestamps and tombstones should support later migration, but no future sync is implemented.

**Canonical:**
[System architecture](../../docs/02-SYSTEM-ARCHITECTURE.md) ·
[Data model](../../docs/03-LOCAL-DATA-MODEL.md) ·
[Phase 0 decisions](../../docs/17-PHASE-0-DECISION-PACK.md)
