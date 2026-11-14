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
| AUTH-09 | P0 | Explicit erase/reset installation vs logout | Logout preserves binding/history; reset warns of permanent loss, requires confirmation, and only then permits fresh online account binding |
| AI-01 | P1 | Call function without valid user token | Denied and no vendor API call |
| AI-02 | P1 | Valid plan generation | Preview/edit response; saves only on user acceptance |
| AI-03 | P1 | Offline/429/5xx AI request | Local logging unaffected; understandable error |
| BKP-01 | P1 | Encrypted backup then fresh-device restore | Same account can recover full matching records |
| BKP-02 | P1 | Wrong recovery code or altered archive | Restore fails without modifying current local database |
| BKP-03 | P1 | Restore backup from different account | Blocked or explicitly handled under an approved transfer policy |
| BKP-04 | P1 | Upload interrupted or cloud quota exhausted | Local data and last good backup preserved |
| BKP-05 | P1 | Uninstall without a successful backup | Correctly communicate that local data can be lost |
| BKP-06 | P1 | Offline background / OS kills job | No false 'backup successful' indication |
| BKP-07 | P1 | Backup OFF; perform workouts then OS-clear app data/reinstall and same-account login | No default Supabase workout upload; fresh empty workout store, accurate loss warning; no automatic history recovery |
| BKP-08 | P1 | Optional encrypted successful backup → clear app data/reinstall → same-account login | Offer optional restore, require matching UUID + portable recovery secret; verify complete records before declaring restore successful |
| BKP-09 | P1 | Backup in progress/fails due to no network, storage quota or permission | Last successful timestamp and archive unchanged; local workouts remain; actionable Retry/Manage storage, never false success |
| BKP-10 | P1 | Automatic backup OFF / Daily / Weekly / Monthly | No background transfer when off; any enabled schedule honors consent, OS best-effort rules, quota limits and actual completion timestamps |
| BKP-11 | P1 | Lost recovery secret, incorrect account, or incompatible encrypted backup | No restore possible without valid secret/identity; no backend bypass, no overwrite or false recovery promise |
| BKP-12 | P1 | Future optional media attachments absent/present | No photo/video switches or uploads without approved attachment support and consent; when present, inclusion/size is correctly reflected |
| AUTH-10 | P0 | Fresh installation marker after OS clear/reinstall with stale OS Keychain entry | Do not trust orphaned key/session or show phantom history; require verified online identity and safe empty/restore flow |
| SYNC-01 | P2 | Offline edits on two devices | Defined conflict policy works without silent loss |
| SYNC-02 | P2 | User disables sync | No further uploads; existing cloud data policy honored |
| SYNC-03 | P2 | User A attempts to read user B's cloud rows | Denied by RLS/authorization |

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
