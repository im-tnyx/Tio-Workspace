<div align="center">

# 🗺 Implementation Roadmap
**Documentation first — sequenced, approval-gated delivery**

[← Docs hub](00-INDEX.md) · [🏠 Home](../README.md) · [🎨 Design](../DESIGN.md)

</div>

> [!NOTE]
> **Document status:** Planning / proposed specification. Product implementation has not started.

---

**Current phase:** Planning. No estimate, release date or deployed feature is committed.

## Phase 0 — Planning and decisions (CURRENT)
- [x] Establish repository with README and separate planning documents.
- [x] Define local-first contract, account persistence and no default workout upload.
- [x] Prepare [structured Phase 0 review pack](17-PHASE-0-DECISION-PACK.md), [offline session flow](18-OFFLINE-SESSION-STATE-MACHINE.md), [backup recovery plan](19-BACKUP-RECOVERY-STRATEGY.md) and [MVP UX draft](20-MVP-UX-FLOWS.md) (**proposals only**).
- [ ] Review remaining open decisions in `09-DECISIONS.md`; owner-selected email login, single-account lifecycle, offline cached policy, encryption/recovery principles and MVP scope are now recorded.
- [x] Owner confirmed functional MVP scope and the single-account/offline/privacy principles (2026-11-14). **Native security validation, detailed recovery UX and visual sign-off are still pending**.
- [ ] Agree on design style and decide platform/dev-build requirements.
**Exit:** Product and technical plan accepted and [Phase 1 readiness gate](21-PHASE-1-READINESS.md) signed off; only then start app development.

## Phase 1 — Foundational offline MVP (NEXT, NOT STARTED)
- [ ] Expo TypeScript project, routing, navigation, lint/test tooling.
- [ ] Supabase Auth: signup/login/logout/forgot password, verified identity and persistent session.
- [ ] Initial offline session gate and **single-account installation binding**; no add-account or switch-account flow.
- [ ] SQLite schema/migrations, repository layer, SQLCipher/native build checks.
- [ ] Exercise library, plans, start/stop workout, sets/reps/weights, history.
- [ ] Local progress calculations, robust autosave, settings, logout and **separate confirmed local erase/reset UX**.
- [ ] Verify first login online -> normal restart -> dashboard, including offline.
**Exit:** End-to-end workout logging works with network disabled after login.

## Phase 2 — AI workout plan generation (PLANNED)
- [ ] Define plan-generation input and minimal data collection/consent.
- [ ] Deploy authenticated Edge Function with secrets, quota and provider client.
- [ ] Validate returned plan against domain schema; user reviews draft before local save.
- [ ] Handle no network, provider errors, latency and API cost.
**Exit:** No provider API secret shipped in mobile app; plans persist locally.

## Phase 3 — Personal encrypted backup & restore (PLANNED)
- [ ] Implement **owner-selected optional backup OFF by default (ADR-012)**; finalize encrypted archive format, portable recovery passphrase/code and rotation design.
- [ ] Support manual encrypted export/import; prove restore on fresh installation.
- [ ] Google Drive OAuth/appDataFolder integration; consent, error handling.
- [ ] iCloud native feasibility spike; integrate a proven approach or provide explicit export/import fallback.
- [ ] Add Settings → Backup with **last successful backup, manual Back up now, progress, failure/retry/storage status**, remote deletion, **Off/Daily/Weekly/Monthly best-effort** scheduling where tested; never allow unencrypted backup.
- [ ] Run full OS clear-data/reinstall/phone-loss, same-account optional restore, **no-backup → empty diary**, missing recovery key, quota-failure, wrong-account and interrupted-backup tests; photo/video include controls only if a separate attachment feature is later approved.
**Exit:** A real encrypted backup can be reliably restored by its rightful user.

## Phase 4 — Optional paid full-workout Supabase Sync (FUTURE; NOT AUTHORIZED FOR INITIAL BUILD)

**ADR-014 selects the future paid-membership business rule, not implementation.** A valid subscription **and** independent opt-in are required for full supported workout-data sync. Local-only workout features and Personal Backup remain usable without membership. No paid plan, billing integration or server workout tables are authorized.
- [x] Record **ADR-013/014** owner decision: future paid full-data Supabase Sync is a separate optional cloud mode with explicit consent, never a personal-backup destination. **Policy selected, implementation not authorized**.
- [ ] Before implementing, separately approve billing, entitlement, privacy/RLS/server architecture, provider costs, retention/expiry and testable opt-in/disable rules; obtain each user's explicit Sync consent. No Supabase workout tables or uploads exist today.
- [ ] Review privacy policy, consent and user controls.
- [ ] Design Supabase Postgres schema and RLS ownership policies.
- [ ] Build sync adapter, change journal, conflict resolution and failure recovery.
- [ ] Test two devices offline concurrently; deletion tombstones and account removal. Explain that sync may propagate deletion/corruption and therefore is not an historical backup, even when the user elects to skip separate personal backup.
- [ ] Add explicit opt-in, progress state, and verified disable/delete-cloud-data flows.
**Exit:** Optional multi-device sync behaves predictably without breaking local-only mode.

## Go/no-go criteria before each phase
- All relevant security risks documented and testable.
- No secrets in repository or mobile app.
- Manual testing on Android and iOS physical devices, especially for native encryption/backups.
- Acceptance tests in `08-TEST-PLAN.md` passing.
- User explicitly approves moving beyond documentation into implementation.

## Out of scope for initial development
Multi-account / switch-account UI, payments, community/social, wearable integrations, full server-side workout archive, realtime collaboration, background upload guarantees and account-free guest mode.

## Traceability
Every planned feature should map to: requirement -> UI screen -> data contract -> test case -> implementation milestone. Changes to privacy defaults require revising these documents first.

---

[← Documentation hub](00-INDEX.md) · [Definition of done →](15-DEFINITION-OF-DONE.md)
