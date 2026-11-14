<div align="center">

# ☁️ Backup, Restore & Future Sync
**Encrypted personal backups and optional cloud synchronization**

[← Docs hub](00-INDEX.md) · [🏠 Home](../README.md) · [🎨 Design](../DESIGN.md)

</div>

> [!NOTE]
> **Document status:** Planning / proposed specification. Product implementation has not started.

---

**Status:** Design only. Google Drive/iCloud connection, permissions and native capabilities have **not** been configured or tested.

## Three distinct storage modes
| Mode | Primary source | Other copy | Default? |
|---|---|---|---|
| **Local Only** | Account-specific local SQLite | None | **Yes** |
| **Local + Personal Backup** | Local SQLite | Encrypted snapshots in user's chosen Drive/iCloud location | No, user opts in |
| **Local + App Cloud Sync** | Local SQLite, synchronized | Supabase Postgres + RLS | **Future only**, opt-in |

A cloud backup is a restorable snapshot, **not** automatic cross-device realtime sync. Supabase login alone does not restore local-only workout history.

## Owner-selected backup behavior (2026-11-14; future phase)

**Default: Backup OFF, Local Only.** The user can keep logging without choosing a provider, granting cloud permission or paying for cloud storage. **No workout records or backup archives are uploaded to Supabase Postgres/Storage by signing in or by enabling a personal backup**; Supabase Auth holds account/session information, not the workout archive. A personal backup is a separately consented, client-encrypted archive in the user's selected Drive/iCloud destination or a manually exported encrypted file.

**Critical distinction:** (a) ordinary logout retains locked workout history and the sole account binding; same-account re-login reopens it, (b) a user-confirmed in-app erase/reset, OS app-data clear, uninstall/reinstall or phone loss may remove the local SQLite database and installation state. After **online login on a fresh/unbound installation**, show an **optional Restore backup** action for the same verified user UUID. When no compatible, successfully completed encrypted backup exists, or restore is skipped, open a **new empty local workout diary** even though the Supabase account still exists. **Never show old workout records merely because Auth succeeded.** Do not promise OS-level clear-data behavior is identical across Android/iOS: stale Keychain entries may persist on iOS; an installation marker and verified UUID/file/key consistency must gate any reuse.

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
- Storage mode: `Local Only (default)`, `Personal Backup` (connect provider and configure portable recovery secret), `Cloud Sync (coming later)`.
- Backup destination, **last successful** backup time/size, `Back up now`, `Restore backup`, **Off/Manual (on-demand)/Daily/Weekly/Monthly** frequency where OS allows, encryption/recovery setup, `Disconnect`, `Delete remote backup` (confirmed).
- A toggle cannot claim a backup is protected until an upload and restore verification succeeded.
- If upload fails (including full iCloud/Drive quota), never delete local data or overwrite the last good archive. Show actionable errors, retry/storage guidance and keep the last confirmed backup metadata.
- Automatic scheduling is **best effort**; mobile OS background limits mean precise periodic backups are not guaranteed.

## Restore procedure
1. On a new/unbound installation after reinstall, OS app-data clear, phone loss or explicit reset, **sign in online** to the same Supabase account; verify immutable user UUID. If no usable backup exists or the user skips restore, initialize an **empty** local store, not an invented cloud copy. Normal logout/relogin without erased data must instead reuse the retained local store.
2. Connect the user's backup provider and list available versioned archives.
3. Retrieve archive, validate header/schema, decrypt with user recovery method, authenticate payload and match source account ID.
4. Preview date/record counts. Default to **replace with confirmation**, preserving a local safety snapshot first; do not silently merge mismatched data.
5. Import in a transaction, rebuild derived views, verify row counts/integrity, then mark restore successful.
6. On error, keep original data untouched and show precise recovery guidance.

## Future app-database cloud sync (not phase-one work)
- Only after explicit opt-in and privacy terms. Local remains usable offline.
- Create user-owned, RLS-protected Postgres tables and a `SyncEngine` using stable UUIDs, revision/change journal, idempotent uploads, cursors, tombstones and conflict rules.
- Define initial migration/upload carefully, including server-to-local import for a fresh device, conflict UX, sync deletion and sign-out.
- Disabling sync should stop new uploads; provide policy for existing server copies and a separate verified cloud-delete option.
- Reconcile duplicates and concurrent edits; backup file replacement alone is not sync.
- Never enable upload solely because Supabase Auth is enabled.

## Sources to recheck
- https://developers.google.com/workspace/drive/api/guides/appdata
- https://docs.expo.dev/versions/latest/sdk/sqlite/
- https://developer.apple.com/icloud/

---

[← Documentation hub](00-INDEX.md) · [Roadmap →](06-ROADMAP.md)
