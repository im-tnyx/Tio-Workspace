<div align="center">

# 🧪 Test & Acceptance Plan
**Verifiable scenarios for offline operation, login and recovery**

[← Docs hub](00-INDEX.md) · [🏠 Home](../README.md) · [🎨 Design](../DESIGN.md)

</div>

> [!NOTE]
> **Document status:** Planning / proposed specification. Product implementation has not started.

---

**Status:** Manual/automated tests to build later. Nothing in this document implies tests have passed.

## Test priority legend
- **P0**: must pass before first workout MVP release
- **P1**: must pass before AI or backup release
- **P2**: must pass before future cloud sync launch

| ID | Priority | Scenario | Expected result |
|---|---|---|---|
| AUTH-01 | P0 | Fresh install -> register online | Verified user account and correct local partition |
| AUTH-02 | P0 | Force-close and reopen after login | Dashboard opens without requiring another login |
| AUTH-03 | P0 | Disable internet and reopen app | Already initialized user's local workouts accessible |
| AUTH-04 | P0 | Fresh install with no network/no previous login | Login requires connection; no unauthorized local access |
| AUTH-05 | P0 | Logout and restart | No account data accessible until authorized re-login |
| AUTH-06 | P0 | Attempt different user B login on installation bound to A (even after A logout) | B rejected; binding, key and A's ciphertext preserved; B never reads A's records |
| AUTH-07 | P0 | Log back in as same bound user A after logout | A's history opens; neither auth logout nor wrong-account attempt erased it |
| AUTH-08 | P0 | Remote session invalid while device offline | Previously verified account may access locally under accepted trust policy; online protected calls blocked until revalidation |
| DATA-01 | P0 | Complete workouts offline | Sets, reps, weights, timestamps persist in SQLite |
| DATA-02 | P0 | App killed mid workout | Last committed autosaved state recovers |
| DATA-03 | P0 | Edit/delete and restart | Correct record changes; no phantom duplicates |
| DATA-04 | P0 | Drizzle-generated SQLite schema upgrade on existing account | Bundled SQL applies offline after unlock, preserves complete existing workouts; journal advances exactly once |
| DATA-05 | P0 | Interrupted migration, insufficient storage or faulty SQL | Fail-closed recovery UI; no silent DB reset/plaintext fallback, verified encrypted snapshot can restore all data |
| DATA-06 | P0 | Attempt second account while local SQLCipher DB has an existing migration journal | New account blocked before opening/migrating; original bound DB and journal unchanged |
| DATA-07 | P0 | Repeat startup and restore compatible older-schema backup | Migration idempotent on current version; older restore verified for user/integrity and migrated after unlock |
| SEC-01 | P0 | Inspect mobile APK/IPA/config | No AI provider, Supabase service-role or backend secret key |
| SEC-02 | P0 | SQLCipher-enabled native build | `cipher_version` detected; raw database unreadable without key |
| SEC-03 | P0 | Wrong/missing key or native build without SQLCipher | Storage fails closed before ORM migration or workout UI; no plaintext replacement created |
| SEC-04 | P0 | Local Only: inspect Android pre-12 backup XML, Android 12+ cloud/device-transfer rules and actual copied SQLite, WAL/SHM, local snapshots | Effective native exclusions verified; any OS/OEM limitations documented, no implied Tio cloud upload |
| SEC-05 | P0 | Local Only: inspect iOS app-data/iCloud backup and device migration, then restore with missing/stale Keychain key | Effective native exclusion verified; no wrong-account unlock, plaintext fallback, phantom data or silent erase |

| AUTH-09 | P0 | Explicit erase/reset installation vs logout | Logout preserves binding/history; reset warns of permanent loss, requires confirmation, and only then permits fresh online account binding |
| AI-01 | P1 | Call function without valid user token | Denied and no vendor API call |
| AI-02 | P1 | Valid plan generation | Preview/edit response; saves only on user acceptance |
| AI-03 | P1 | Offline/429/5xx AI request | Local logging unaffected; understandable error |
| BKP-01 | P1 | Encrypted backup then fresh-device restore | Same account can recover full matching records |
| BKP-02 | P1 | Wrong recovery code or altered archive | Restore fails without modifying current local database |
| BKP-03 | P1 | Restore backup from different account | Rejected: one bound account per installation; no account-switch or cross-account import flow |
| BKP-04 | P1 | Upload interrupted or cloud quota exhausted | Local data and last good backup preserved |
| BKP-05 | P1 | Uninstall without a successful backup | Correctly communicate that local data can be lost |
| BKP-06 | P1 | Offline background / OS kills job | No false 'backup successful' indication |
| BKP-07 | P1 | Backup OFF; perform workouts then OS-clear app data/reinstall and same-account login | No default Supabase workout upload; fresh empty workout store, accurate loss warning; no automatic history recovery |
| BKP-08 | P1 | Optional encrypted successful backup → clear app data/reinstall → same-account login | Offer optional restore, require matching UUID + portable recovery secret; verify complete records before declaring restore successful |
| BKP-09 | P1 | Backup in progress/fails due to no network, storage quota or permission | Last successful timestamp and archive unchanged; local workouts remain; actionable Retry/Manage storage, never false success |
| BKP-10 | P1 | Automatic backup OFF / Daily / Weekly / Monthly | No background transfer when off; any enabled schedule honors consent, OS best-effort rules, quota limits and actual completion timestamps |
| BKP-11 | P1 | Lost recovery secret, incorrect account, or incompatible encrypted backup | No restore possible without valid secret/identity; no backend bypass, no overwrite or false recovery promise |
| BKP-12 | P1 | Future optional media attachments absent/present | No photo/video switches or uploads without approved attachment support and consent; when present, inclusion/size is correctly reflected |
| BKP-13 | P1 | User enables personal backup to Google Drive/iCloud | Archive is client-encrypted and sent only to user-selected provider; **zero workout/backup data** in Supabase Postgres/Storage, with no Tio server archive copy |
| BKP-14 | P1 | User leaves personal backup OFF in Local Only mode and uses local workouts | No Drive/iCloud or Supabase workout payload transfer; local logging unaffected |
| BKP-15 | P1 | Completed encrypted backup → clear app settings/reinstall → same-account sign-in with no local backup mode/provider → user selects Find backup | Explicit provider authorization discovers matching archive; **Restore / Skip** shown after validation, user may Restore without enabling Backup or may Skip without altering local data/mode; no implicit upload or second-account binding |
| BKP-16 | P1 | Fresh device with wrong Drive/iCloud account, revoked consent, missing archive, changed app identity or unavailable iCloud container | Honest not-found/error and encrypted import fallback; local data untouched and no implicit backup or Supabase sync |
| BKP-17 | P1 | Personal Backup archive found, user selects Skip or cancels restore | No import, overwrite, cloud-mode enablement, or changed local workouts; continue to empty/local Home with optional manual Find Backup later |

| AUTH-10 | P0 | Fresh installation marker after OS clear/reinstall with stale OS Keychain entry | Do not trust orphaned key/session or show phantom history; require verified online identity and safe empty/restore flow |
| SYNC-01 | P2 | Offline edits on two devices | Defined conflict policy works without silent loss |
| SYNC-02 | P2 | User disables sync | No further uploads; existing cloud data policy honored |
| SYNC-03 | P2 | User A attempts to read user B's cloud rows | Denied by RLS/authorization |
| SYNC-04 | P2 | Future settings select Local Only / Personal Backup / Supabase Sync | Exactly one active cloud mode; enabling backup disables/blocks sync and vice versa; default neither; no simultaneous cloud uploads |
| SYNC-05 | P2 | Same-account login after OS wipe with previously enabled, authorized and entitled Sync and available server records | Automatically rehydrate encrypted local SQLite after checking server-side opt-in and identity/authorization, **without any Personal Backup Restore prompt/button**; truthful progress/error/empty state; no claim of historical versions |
| SYNC-06 | P2 | Switch Personal Backup ↔ future Sync with existing remote data | Show explicit prior-cloud-copy disclosure, require consent and verified cleanup; block/handle failed deletion; never silently retain two active destinations or destroy local diary |
| SYNC-07 | P2 | Sync OFF/never enabled, no personal backup, then clear app data and same-user login | Empty local workouts; Auth alone cannot produce server workout data and Restore Backup is not offered without a matching archive |
| SYNC-08 | P2 | No paid entitlement or member without separate Sync consent | No Supabase workout upload; Local Only works and user-owned Personal Backup remains optional |
| SYNC-09 | P2 | Paid member explicitly turns on future Sync | Complete supported workout history/plans/exercises/sessions/sets and progress source data sync under user-bound RLS; can rehydrate new device |
| SYNC-10 | P2 | Membership expires or is cancelled | Block unauthorized new uploads, retain local SQLite, and follow separately approved server export/retention/deletion policy |

## Proposed visual/UX acceptance scenarios — execute after approved UI implementation

| ID | Priority | Scenario | Expected result |
|---|---|---|---|
| UX-01 | P0 | Home/Workout/Library/You as exactly four bottom-root tabs; navigate to Active Workout, Plan Editor, Exercise Detail, History, Progress and Settings | Bottom dock visible **only** on the four roots, hidden on nested/Auth/full-screen routes; shared TopBar title/back variants, no account switching |
| UX-02 | P0 | Edit sets/reps/weight one-handed with large accessibility text and screen reader | No clipped controls, understandable focus/labels and device-appropriate touch targets |
| UX-03 | P0 | Previously initialized user opens and saves an active workout offline | “Saved on this device” reflects actual local persistence, no misleading “Synced” or blocked logging |
| UX-04 | P0 | Logout, wrong-bound-account attempt and separately confirmed local erase | Exact identity/privacy warning states; no accidental erase/account switch, cancellation is safe |
| UX-05 | P0 | Phase 1 Local Only default and Supabase Auth with no implemented cloud workout service | No default workout upload, no fake restore/sync screen, honest local-save/data-loss wording |

| UX-06 | P1 | **Phase 3 only:** user locates verified, encrypted same-account Personal Backup after reinstall | Optional **Restore / Skip**; Skip unchanged, confirmed restore after independent secret; no implicit upload or mode enablement |
| UX-07 | P2 | **Phase 4 only:** prior explicitly opted-in and currently authorized paid Supabase Sync on fresh install | Auto-hydrate available server rows **without Backup Restore dialog**, accurate empty/error states |
| UX-08 | P0 | Glass/Solid × Light/Dark permutations on Android/iOS and root/nested routes | All four combinations update shared TopBar, bottom dock, button, TextField and sheets consistently; readable native Solid fallback for unsupported/reduced transparency |

These are **planned**, unexecuted acceptance criteria. The first workout MVP requires **P0 UX-01–05 and UX-08**; **P1 UX-06 belongs to Personal Backup (Phase 3)** and **P2 UX-07 to paid Supabase Sync (Phase 4)**. A screenshot reference is not test evidence or an asset license.

## Test environments
Physical Android and iPhone devices, current supported OS versions, actual Expo development/release builds, unstable network, background and device-kill scenarios, low storage, attempted second account on a bound installation, deliberate erase/reset, reinstallation and cross-device restores.

## Release evidence
Record test date, device/OS/app build, whether the scenario passed, failure logs without secrets and evidence of restore outcomes. No release should advertise secure encryption/backup until testing verifies it.

## Privacy validation
- Inspect network requests during normal local workout logging: no workout payloads sent to app server.
- When AI is used, verify exactly which fields are transmitted and that keys stay server-side.
- When backup is disabled, verify there is no personal-cloud upload.
- When cloud sync is disabled, verify no workout records reach the app's online database.

---

[← Documentation hub](00-INDEX.md) · [Definition of done →](15-DEFINITION-OF-DONE.md)
