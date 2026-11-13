# Implementation roadmap — documentation-first

**Current phase:** Planning. No estimate, release date or deployed feature is committed.

## Phase 0 — Planning and decisions (CURRENT)
- [x] Establish repository with README and separate planning documents.
- [x] Define local-first contract, account persistence and no default workout upload.
- [ ] Review open questions in `09-DECISIONS.md`.
- [ ] Approve MVP screen list, backup privacy, encryption and account lifecycle.
- [ ] Agree on design style and decide platform/dev-build requirements.
**Exit:** Product and technical plan accepted; only then start app development.

## Phase 1 — Foundational offline MVP (NEXT, NOT STARTED)
- [ ] Expo TypeScript project, routing, navigation, lint/test tooling.
- [ ] Supabase Auth: signup/login/logout/forgot password, verified identity and persistent session.
- [ ] Initial offline session gate and account-specific storage isolation.
- [ ] SQLite schema/migrations, repository layer, SQLCipher/native build checks.
- [ ] Exercise library, plans, start/stop workout, sets/reps/weights, history.
- [ ] Local progress calculations, robust autosave, settings and data deletion UX.
- [ ] Verify first login online -> normal restart -> dashboard, including offline.
**Exit:** End-to-end workout logging works with network disabled after login.

## Phase 2 — AI workout plan generation (PLANNED)
- [ ] Define plan-generation input and minimal data collection/consent.
- [ ] Deploy authenticated Edge Function with secrets, quota and provider client.
- [ ] Validate returned plan against domain schema; user reviews draft before local save.
- [ ] Handle no network, provider errors, latency and API cost.
**Exit:** No provider API secret shipped in mobile app; plans persist locally.

## Phase 3 — Personal encrypted backup & restore (PLANNED)
- [ ] Finalize backup format, recovery passphrase/code and rotation design.
- [ ] Support manual encrypted export/import; prove restore on fresh installation.
- [ ] Google Drive OAuth/appDataFolder integration; consent, error handling.
- [ ] iCloud native feasibility spike; integrate a proven approach or provide explicit export/import fallback.
- [ ] Add backup status, manual trigger, remote deletion and best-effort scheduling if safe.
- [ ] Run full lost-phone/new-device/account-mismatch/failed-backup recovery tests.
**Exit:** A real encrypted backup can be reliably restored by its rightful user.

## Phase 4 — Optional app-cloud database sync (FUTURE; NOT AUTHORIZED FOR INITIAL BUILD)
- [ ] Review privacy policy, consent and user controls.
- [ ] Design Supabase Postgres schema and RLS ownership policies.
- [ ] Build sync adapter, change journal, conflict resolution and failure recovery.
- [ ] Test two devices offline concurrently; deletion tombstones and account removal.
- [ ] Add explicit opt-in, progress state, and verified disable/delete-cloud-data flows.
**Exit:** Optional multi-device sync behaves predictably without breaking local-only mode.

## Go/no-go criteria before each phase
- All relevant security risks documented and testable.
- No secrets in repository or mobile app.
- Manual testing on Android and iOS physical devices, especially for native encryption/backups.
- Acceptance tests in `08-TEST-PLAN.md` passing.
- User explicitly approves moving beyond documentation into implementation.

## Out of scope for initial development
Payments, community/social, wearable integrations, full server-side workout archive, realtime collaboration, background upload guarantees and account-free guest mode.

## Traceability
Every planned feature should map to: requirement -> UI screen -> data contract -> test case -> implementation milestone. Changes to privacy defaults require revising these documents first.
