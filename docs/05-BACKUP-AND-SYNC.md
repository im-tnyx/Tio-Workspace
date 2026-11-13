# Personal backup, restore and future cloud sync

**Status:** Design only. Google Drive/iCloud connection, permissions and native capabilities have **not** been configured or tested.

## Three distinct storage modes
| Mode | Primary source | Other copy | Default? |
|---|---|---|---|
| **Local Only** | Account-specific local SQLite | None | **Yes** |
| **Local + Personal Backup** | Local SQLite | Encrypted snapshots in user's chosen Drive/iCloud location | No, user opts in |
| **Local + App Cloud Sync** | Local SQLite, synchronized | Supabase Postgres + RLS | **Future only**, opt-in |

A cloud backup is a restorable snapshot, **not** automatic cross-device realtime sync. Supabase login alone does not restore local-only workout history.

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
- Storage mode: `Local Only (default)`, `Personal Backup` (connect provider), `Cloud Sync (coming later)`.
- Backup destination, last successful backup time and size, `Back up now`, `Restore backup`, frequency where OS allows, encryption/recovery setup, `Disconnect`, `Delete remote backup` (confirmed).
- A toggle cannot claim a backup is protected until an upload and restore verification succeeded.
- If upload fails, never delete local data. Show actionable errors and keep the last confirmed backup metadata.
- Automatic scheduling is **best effort**; mobile OS background limits mean precise periodic backups are not guaranteed.

## Restore procedure
1. Reauthenticate the Tio account if needed and verify ownership of target account.
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
