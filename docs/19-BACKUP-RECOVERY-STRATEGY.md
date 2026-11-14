<div align="center">

# ☁️ Personal Backup & Recovery Strategy
**Recoverable encryption without accidental cloud synchronization.**

![Status](https://img.shields.io/badge/STATUS-DESIGN%20SPIKE-6D5EF8?style=flat-square)

[← Docs hub](00-INDEX.md) · [🧭 Decision pack](17-PHASE-0-DECISION-PACK.md) · [☁️ Backup spec](05-BACKUP-AND-SYNC.md)

</div>

> [!WARNING]
> This specifies a **future** feature. No Google Drive, iCloud, native entitlement, key-derivation implementation or recovery flow has been integrated or tested. It is not safe to promise user data survives uninstall until full fresh-device restore testing succeeds.

## 01 · Three distinct keys/copies

| Component | Purpose | Recovery properties |
|---|---|---|
| SQLCipher key | Encrypt on-device SQLite | May be device-bound; never assume it can be moved to a new phone |
| Backup encryption key | Authenticated-encrypt portable archive | Must be recoverable **independently** of the original device |
| Supabase auth session | Confirm account identity and protect online operations | Does **not** decrypt backup by itself |

**Owner-approved principle (ADR-011):** a separate **portable user-held recovery secret** must protect future encrypted personal backups. **Unapproved implementation proposal:** derive or wrap a backup data-encryption key using a high-entropy recovery code or adequately strong passphrase, with a vetted memory-hard password KDF and random salt, encrypted using a well-reviewed authenticated encryption implementation. The full cryptographic format needs an independent security review before launch. Do not invent cryptography or store the only recovery secret in the cloud archive.

## 02 · Minimum viable backup order

```mermaid
flowchart TD
  A["Local SQLite snapshot"] --> B["Versioned manifest + integrity metadata"]
  B --> C["Encrypt locally with recovery method"]
  C --> D{"User chooses destination"}
  D --> E["Encrypted file export/import"]
  D --> F["Google Drive appDataFolder (planned)"]
  D --> G["iCloud native integration (feasibility first)"]
  E --> H["Restore on a fresh installation"]
  F --> H
  G --> H
  H --> I["Decrypt, validate account, restore atomically"]
```

**Sequencing recommendation:** prove a manual encrypted export/import **before** promising Google Drive/iCloud automation. This separates cryptographic correctness from provider-specific OAuth and native integration.

## 03 · Google Drive plan

- Consider private `appDataFolder` with least-privilege `drive.appdata` authorization; confirm OAuth platform account selection and app identity before implementation.
- Backups in `appDataFolder` are **hidden from the normal Drive UI**, are not Android OS device backups and may be deleted by the user. Provide a clear in-app list and delete/restore controls.
- Handle revoked consent, wrong Google account, quota exceeded, interrupted upload, missing archive, duplicate backups and app reinstallation.
- Never report “Backup completed” until encrypted upload finishes and provider confirms durable file metadata; maintain last-success time separately from attempted time.

## 04 · iCloud reality check

- “iCloud backup” might mean iCloud Documents, CloudKit or Apple's OS-level app backup; they have different capabilities and deletion/restore semantics.
- Native iCloud support can require entitlements, an Apple Developer account, configured containers and native build integration. **Expo Go alone is not a deployment proof.**
- Prototype actual cross-device upload, file discovery, permission errors and deletion on real iOS hardware before committing to automatic backup.
- If native integration is too costly/fragile for an early milestone, provide **encrypted export/import via Files/share sheet** as an honest fallback.

## 05 · File format contract (draft, not final crypto)

```text
tio-backup-v1
  manifest.json: format_version, app_schema_version, owner_user_id,
                 exported_at_utc, cipher_suite_id, kdf_id, kdf_parameters,
                 salt, nonce, payload_length
  payload.enc:   authenticated encrypted snapshot
```

- The manifest must be authenticated (e.g., as associated data), not merely stored alongside ciphertext.
- Do not place private exercise/workout content in unencrypted metadata.
- For a database export, generate a **transactionally consistent** snapshot rather than copying an open DB file unsafely.
- Import should be atomic, with a local safety checkpoint and a non-destructive validation preview.
- Refuse unrecognized future versions by default; support documented migration paths rather than silently dropping fields.

## 06 · Restore UX

**Owner-selected behavior (2026-11-14):** Personal backup is optional and **OFF until the user enables it**. A fresh login does not restore workouts from Supabase. After OS app-data clear, uninstall/reinstall, confirmed local erase/reset or replacement phone, an authenticated same-account user may choose **Restore backup** if there is a completed matching encrypted archive and their portable recovery secret. No archive / backup never enabled / upload failed / restore skipped → start with **empty local workout data**. A prior Supabase account and login identity may still exist; “new account” is a UX description of empty local history, **not** a newly created Auth user. Do not silently auto-restore.

**Backup settings reference:** a familiar, dedicated Settings → Backup page with last successful backup, **Back up now**, Off/Daily/Weekly/Monthly automatic backup (best effort), progress, failure/retry, storage management and recovery guidance. Cloud encryption is always required, even if a reference screenshot shows it off. Photo/video include switches are relevant **only if separately approved user attachments exist**, not as new Phase 1 features. Provider capability and exact background cadence require native validation. See [backup screen contract](05-BACKUP-AND-SYNC.md).

**Platform wipe nuance:** Android app-data removal commonly deletes sandbox data, but iOS Keychain entries can outlive uninstall. Detect a fresh installation independently from Keychain remnants; a missing/unknown SQLite file or install marker must not be interpreted as a successfully restored workout history. Fail closed on inconsistent binding/key/file states.

## 06A · Restore steps

1. On new device: successfully sign in to Tio online and confirm account identity.
2. Select user-owned backup destination and file/version.
3. Enter recovery passphrase/code or use an explicitly approved recovery flow.
4. Validate authenticated integrity, compatible schema, source account ID, record totals and size limits.
5. Show confirmation: **Replace local history** (default for v1), with clear warning and a safety snapshot.
6. Import into a temporary/staging database; validate integrity; atomically switch current account's store only on success.
7. Confirm new workouts/history are queryable before showing “Restored”; on failure keep existing local store intact.

**Account mismatch / one-account installation:** never import a backup from another UUID into the bound installation, and never change the binding as part of restore. Fresh-install restore must bind the same verified Supabase user; importing into a different bound identity is blocked, not a switch/transfer UX.

## 07 · Failure and recovery matrix

| Failure | Expected safe result |
|---|---|
| Wrong recovery code | No restore; no data overwritten |
| Modified or truncated archive | Authentication fails; preserve current DB |
| Missing/revoked cloud permission | Continue local mode; user can retry connection |
| Backup deletion from provider | Warn no remote copy; don't imply restore is available |
| Phone lost, no backup | Local-only history may be unrecoverable |
| Upload interrupted | No success badge; retain previous verified snapshot |
| Wrong signed-in Tio account | Stop restore and explain account mismatch |
| New device without local SQLCipher key | Restore is **still possible** using independent backup recovery method |

## 08 · Owner decisions required

- [x] Independent user-held portable recovery **principle** selected; [ ] choose the precise code/passphrase UX, cryptographic KDF/format and loss warnings after security review.
- [x] User can select no backup; **manual backup on demand** and optional future scheduled backups chosen as UX policy. Native schedule feasibility and exact cadence still require testing.
- [ ] Decide cross-platform encrypted file export delivery order after feasibility tests; do not claim it is implemented.
- [ ] Should Android default to appDataFolder and iOS start with Files export fallback?
- [ ] Retention/rotation, file deletion, last successful backup metadata and key-loss warnings.

## External documentation

[Google Drive appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata) · [Apple iCloud capability setup](https://developer.apple.com/documentation/xcode/configuring-icloud-services/) · [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)

---

[← Backup spec](05-BACKUP-AND-SYNC.md) · [Decision pack](17-PHASE-0-DECISION-PACK.md) · [Phase 1 gate →](21-PHASE-1-READINESS.md)
