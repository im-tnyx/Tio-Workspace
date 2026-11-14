<div align="center">

# ☁️ Backup, Restore & Future Sync
**Encrypted personal backups and optional cloud synchronization**

[← Docs hub](00-INDEX.md) · [🏠 Home](../README.md) · [🎨 Design](../DESIGN.md)

</div>

> [!NOTE]
> **Document status:** Planning / proposed specification. Product implementation has not started.

---

**Status:** Design only. Google Drive/iCloud connection, permissions and native capabilities have **not** been configured or tested.

## One active cloud mode — local SQLite always
| Mode | Primary source | Other copy | Default? |
|---|---|---|---|
| **Local Only** | Account-specific local SQLite | None | **Yes** |
| **Local + Personal Backup** | Local SQLite | Encrypted snapshots in user's chosen Drive/iCloud location | No, user opts in |
| **Local + App Cloud Sync** | Local SQLite, synchronized | Separately built Tio server-side Supabase Postgres + RLS | **Future paid membership + separate user opt-in only**; no current server workout storage |

A cloud backup is a restorable snapshot, **not** automatic cross-device realtime sync. **Supabase Auth login alone** does not restore local-only workout history. Only a **future, separately authorized and previously user-enabled** Supabase Sync mode may automatically download the same authenticated user's available server workout records into a new local SQLite store; that is *sync hydration*, not the **Restore Backup** action.

## Owner-selected backup behavior (2026-11-14; future phase)

**Default: Backup OFF, Local Only.** The user can keep logging without choosing a provider, granting cloud permission or paying for cloud storage. **No workout records or backup archives are uploaded to Supabase Postgres/Storage by signing in or by enabling a personal backup**; Supabase Auth holds account/session information, not the workout archive. A personal backup is a separately consented, **client-encrypted archive saved only to the user's chosen Google Drive/iCloud location or manual encrypted file**, never to Tio-managed Supabase Storage/Postgres. The future sync backend must never be silently reused as the personal-backup destination.

**Critical distinction:** Ordinary logout retains locked workout history and same-account re-login reopens it. A user-confirmed erase/reset, OS clear-data, uninstall/reinstall or phone loss may remove local SQLite. After online login to a fresh installation, recovery depends on the **previously enabled active cloud mode**: **Personal Backup** → offer explicit **Restore Backup** using a completed matching encrypted Drive/iCloud archive and user-held recovery secret; **future Supabase Sync** → verify the same account and **automatically download available server data** without a Backup Restore step; **Local Only** (or unavailable/failed cloud data) → empty local workout history. In all modes, never fabricate an old diary from Auth login alone. iOS Keychain entries can outlive uninstall; installation markers and verified file/key/UUID consistency must prevent stale-key data access.

**Backup source of truth:** Only confirmed completed client-encrypted copies count as restorable. A failed/in-progress upload is not a backup. Automatic backup is **best effort**, only after user opt-in, and may be delayed or omitted by mobile OS scheduling. Backup OFF, disconnect, local erase and deleting a remote archive are distinct operations.

## WhatsApp-inspired backup screen contract (not a clone)

| Section | Planned behavior |
|---|---|
| Settings → Backup | Separate optional page with backup OFF by default, destination/provider, latest **successful** backup timestamp/size, and clear recovery warning |
| Back up now | Available after explicit provider/storage setup and recovery-secret preparation; creates a consistent authenticated-encrypted snapshot |
| Automatic backup | User selects **Off / Daily / Weekly / Monthly** where platform scheduling is proven feasible; no guarantee of exact timing; manual backups remain user initiated |
| Include photos / videos | **Only display when Tio actually supports user-created workout/progress attachments in a later approved feature**; both are separately consented, may substantially increase upload size and cloud quota use; no such media scope is authorized for the initial MVP |
| Backup encryption | **Always enabled** before cloud upload or manual export; do not copy an “End-to-end encryption: Off” setting. User-held portable recovery secret must be configured and retained |
| In progress | Show genuine state, bytes/total and percent **only if measurable**, with last successful backup shown separately. Never label an in-progress upload “Backed up” |
| Failed | Show actionable reason (e.g. iCloud/Drive storage quota, no network, permission revoked), **Retry** and **Manage storage** where supported; retain last good backup and local workouts |
| Manage backup | Explicit controls for provider choice, scheduling, backup now, restore, disconnect, remote delete (confirmed), recovery guidance; no silent cloud deletion |

UX references: user-provided WhatsApp iOS/Android backup screenshots (2026-11-14) illustrate **status card, progress/error presentation, scheduling picker and optional media controls**. They are inspiration for behavior, **not copied branding, platform capabilities, images or security defaults**. Google Drive/iCloud and automatic scheduling still require platform feasibility testing.

## Explicit storage boundaries and future sync decision (owner clarified 2026-11-14)

1. **Local-first, mandatory baseline:** Exercise plans, sets, reps, workout history and progress are stored and read from encrypted on-device SQLite. Online sign-in does not enable any workout upload.
2. **Optional personal backup, user-owned destination only:** Until a user expressly enables backup, **no personal-cloud upload** occurs. After consent, Tio prepares and encrypts an archive **on device** and transfers it to the user's explicitly selected Google Drive or iCloud (or creates a manually exported encrypted file). The archive is **not stored in Supabase Postgres or Supabase Storage**, and Tio's app backend must not serve as an implicit workout-data backup destination. Provider permission and recovery-secret setup are separate from signing in with Supabase Auth.
3. **Future server sync, separate product:** A later, **individually authorized and opt-in** feature could use app-managed Supabase Postgres with server-side authorization/RLS, synchronization, conflict handling, costs/operations and deletion controls. **No such workout tables, server sync process or default upload are in scope now.** If this *exclusive* cloud mode is enabled and server data still exists, same-account online login on a wiped/new device can **rehydrate local SQLite automatically** rather than requiring backup Restore. **Sync is not historical backup**: deletions/corruption can propagate; do not guarantee recovery of older versions.
4. **Mutually exclusive cloud settings:** Settings shows **Local Only (default)**, **Personal Backup (Google Drive/iCloud)** or **Supabase Sync (future / unavailable now)** as *one active choice*, not two independently enabled switches. Backup ON requires Supabase Sync OFF; Sync ON requires Backup OFF. Choosing Local Only permits neither. Supabase Auth exists independently of all three modes.
5. **Safe mode transition:** Before activating a different cloud mode, clearly explain that previous Google Drive/iCloud archives or Supabase rows may still exist. Require **separate, explicit consent to remove the prior cloud copy** and verify provider/server deletion where supported; if removal or permission verification fails, do **not** claim only one cloud copy exists or silently enable the new cloud mode. Do not erase workouts on device. Changing mode, disabling uploads, deleting prior remote data and deleting a Supabase Auth account are **distinct actions**. Manual user-exported files cannot be remotely erased, so no universal one-copy guarantee is possible.

## Future paid membership for full Supabase Sync (owner policy ADR-014)

**Future Supabase Sync is optional paid Tio membership, not default.** Only after a user has a valid paid membership **and separately, explicitly enables Sync** may the app upload and synchronize the **complete supported workout dataset** (exercises, workout plans, sessions, sets/reps/weights, notes, history and progress source records) to Supabase Postgres with per-user authorization/RLS. Buying membership alone does **not** grant consent to upload workouts. Local encrypted SQLite remains the primary offline store.

**Free/local-only logging and optional Personal Backup to the user's Google Drive/iCloud do not require this Tio Sync membership.** ADR-013 permits **only one active cloud mode**: Personal Backup **or** paid Supabase Sync (or neither). Future paid Sync may download available server workouts automatically after same-account sign-in, without a Personal Backup Restore step. Sync can propagate deletes; it is not a historical backup.

The price, membership tiers, billing provider, trials, renewals, expiry/grace periods, entitlement checks, cancellation, user data export, retention and cloud deletion policy are **not decided**. Expiry must not delete the local workout database or silently enable another cloud mode. No billing, server workout tables, SyncEngine or entitlement integration is authorized/implemented today.

## Backup format proposal
```text
tio-backup-v1/
  manifest.json      version, exported_at, source_account_id, app_schema_version,
                     record counts, digest/format metadata (no secrets)
  payload.enc        encrypted, authenticated, self-contained exported data
```
- Generate a **consistent SQLite snapshot/export** so partial session writes are not backed up.
- Encrypt before upload with an authenticated scheme (e.g. audited AES-GCM implementation); derive a backup key from a user-held recovery passphrase/code through a vetted KDF and unique salt/nonce.
- A device-only SecureStore/Keystore key must **not** be the sole backup decryption key, otherwise a new phone cannot restore it.
- Confirm password/recovery-code handling, recovery UX and lost-key warning before enabling backup. App servers must not silently hold decryption secrets.
- Include schema version, source account ID, authenticated integrity, timestamp and compatibility metadata. Verify digest/auth tag before import. Avoid storing workout content in manifest/logs.
- Version encryption and format for backward compatibility and migrations.
- Test import/restore from both the same and a completely new device.

## Google Drive (Android, maybe iOS if product chooses)
- Proposed private app-managed area: Google Drive `appDataFolder` with least-privilege `drive.appdata` OAuth scope.
- User grants explicit Google permission. Store provider tokens securely and refresh where needed.
- Scope, account mismatch, revoked permissions, quota, missing backup and provider errors need clear UI.
- The app data folder is hidden from normal Drive UI; users can still remove app data. This is not an immutable backup.
- No cloud access until the user opts in.

## iCloud (iOS)
- User-facing product requirement: backup/restore with the user's iCloud account.
- Exact approach must be decided after native-feasibility review (iCloud Documents/CloudKit/OS backup mechanisms are not interchangeable).
- iCloud access may require Apple entitlements, an iOS development build and native modules/config plugins not available in Expo Go.
- Do **not** promise WhatsApp-style automatic iCloud backup with a generic Expo library without proof-of-concept testing.
- As an initial fallback, offer encrypted export/import through system share/document pickers, then consider native provider integration.

## Settings UX (planned)
- **Single-choice** cloud storage setting: `Local Only (default)`, `Personal Backup` (connect user Drive/iCloud + recovery secret), or `Supabase Sync (future; disabled/unavailable)`. Only one cloud destination may be active. A separate Backup screen appears only in Personal Backup mode; future Sync settings/status appear only in Sync mode.
- Backup destination, **last successful** backup time/size, `Back up now`, `Restore backup`, **Off/Manual (on-demand)/Daily/Weekly/Monthly** frequency where OS allows, encryption/recovery setup, `Disconnect`, `Delete remote backup` (confirmed).
- A toggle cannot claim a backup is protected until an upload and restore verification succeeded.
- If upload fails (including full iCloud/Drive quota), never delete local data or overwrite the last good archive. Show actionable errors, retry/storage guidance and keep the last confirmed backup metadata.
- Automatic scheduling is **best effort**; mobile OS background limits mean precise periodic backups are not guaranteed.

## Restore procedure
1. On a new/unbound installation after reinstall, OS app-data clear, phone loss or explicit reset, **sign in online** to the same Supabase account; verify immutable user UUID. **Personal Backup mode** may offer user-initiated restore of an available matching archive; **future, previously enabled Supabase Sync mode** may automatically hydrate the local store from authorized server workout records (not a backup Restore). **Local Only**, or absence of accessible data, results in an empty store. Normal logout/relogin without wiped local data must instead reuse the retained local store.
2. Connect the user's backup provider and list available versioned archives.
3. Retrieve archive, validate header/schema, decrypt with user recovery method, authenticate payload and match source account ID.
4. Preview date/record counts. Default to **replace with confirmation**, preserving a local safety snapshot first; do not silently merge mismatched data.
5. Import in a transaction, rebuild derived views, verify row counts/integrity, then mark restore successful.
6. On error, keep original data untouched and show precise recovery guidance.

## Future app-database cloud sync (not phase-one work)
- **Not implemented or authorized now**. Only after a separate owner decision, server architecture/security review, explicit user opt-in and privacy terms. Local remains usable offline.
- Create user-owned, RLS-protected Postgres tables and a `SyncEngine` using stable UUIDs, revision/change journal, idempotent uploads, cursors, tombstones and conflict rules.
- Define initial migration/upload carefully, including server-to-local import for a fresh device, conflict UX, sync deletion and sign-out.
- Disabling sync should stop new uploads; provide explicit deletion controls for existing Supabase rows. Switching from Sync to Personal Backup (or vice versa) must **not** silently leave two active cloud modes or assume old remote copies disappeared; design provider deletion/consent and failure handling before implementation.
- Reconcile duplicates and concurrent edits; backup file replacement alone is not sync.
- Never enable upload solely because Supabase Auth is enabled. Future sync may make the user's workout history available again after online login if enabled and implemented, but it is **not automatically a point-in-time backup**; synchronize/delete semantics can propagate unintended changes. Never force personal Google Drive/iCloud backup just because future sync is active.

## Sources to recheck
- https://developers.google.com/workspace/drive/api/guides/appdata
- https://docs.expo.dev/versions/latest/sdk/sqlite/
- https://developer.apple.com/icloud/

---

[← Documentation hub](00-INDEX.md) · [Roadmap →](06-ROADMAP.md)
