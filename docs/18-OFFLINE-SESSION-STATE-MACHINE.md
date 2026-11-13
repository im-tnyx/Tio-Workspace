<div align="center">

# 🔐 Offline Session & Account Lifecycle
**One login, persistent experience, honest offline security boundaries.**

![State](https://img.shields.io/badge/STATE-PROPOSED-6D5EF8?style=flat-square)

[← Docs hub](00-INDEX.md) · [🧭 Decision pack](17-PHASE-0-DECISION-PACK.md) · [🛡 Security](04-AUTH-AND-SECURITY.md)

</div>

> [!IMPORTANT]
> A cached session is **not** proof that the remote account remains valid today. Offline local workout access and authorization to call an online Edge Function are **different operations**.

## 01 · UX contract

After a user has successfully registered or signed in online, closing/killing/reopening the app should ordinarily reopen the dashboard **without a login form**. When the network is unavailable, the previously initialized user's local workouts should still open. This is subject to securely persisted credentials, device/user isolation and the selected offline access policy.

The app must never offer first-ever offline registration or unrestricted access to another user's local diary.

## 02 · Proposed state machine

```mermaid
stateDiagram-v2
    [*] --> Boot
    Boot --> SignedOut: No valid local account binding
    Boot --> OnlineSession: Verified stored session + network
    Boot --> OfflineSession: Previously verified account + no network
    Boot --> ReauthRequired: No recoverable credentials/key
    SignedOut --> OnlineSession: Successful online login / signup
    OnlineSession --> OfflineSession: Network unavailable
    OfflineSession --> OnlineSession: Network returns + session validated
    OnlineSession --> ReauthRequired: Confirmed revoked/invalid session
    OfflineSession --> ReauthRequired: Revalidation later fails
    ReauthRequired --> OnlineSession: Successful online re-login
    OnlineSession --> SignedOut: Explicit logout
    OfflineSession --> SignedOut: Explicit local logout
```

**Security refinement:** If online token refresh fails from network timeout, do **not** treat timeout as confirmed revocation. Distinguish genuine invalid credentials from mere loss of connectivity.

## 03 · State table

| State | Dashboard? | Local workout writes? | AI/cloud calls? |
|---|---|---|---|
| `Boot` / locked | No; splash/loading only | No | No |
| `SignedOut` | No | No | No |
| `OnlineSession` | Yes | Yes | Authenticated/consented operations only |
| `OfflineSession` (cached account) | Yes after local unlock | Yes | No until remote auth can be validated |
| `ReauthRequired` | No normal dashboard; show recovery/login | No by default; preserve encrypted file | No |
| `SwitchingAccount` (transient) | No until new account unlocked | No | No |

**Open policy:** How long may an offline cached account remain unlocked? Should a local app PIN/biometric be required after N days or when the device is shared? Do not silently invent a time limit.

## 04 · Startup sequence & trust checks

1. On app start, read installation metadata and protected session/identity storage; do not show last user's dashboard before identity/DB gate completes.
2. Verify that the locally bound account identifier corresponds to a prior **successful online sign-in** (bind to immutable Supabase user UUID, not email).
3. Unlock only that user's encrypted SQLite database with an account-specific key.
4. If online, validate/refresh server session as applicable; server calls always use valid authenticated credentials.
5. If offline and locally eligible, enter `OfflineSession`, show a quiet offline indicator, allow all basic workout CRUD.
6. If server **confirms** session invalid/revoked, move to `ReauthRequired`; do not erase local history. Decide whether any read-only local recovery view should exist only after security review.
7. If local DB key cannot be recovered, do not open an unencrypted replacement under the same identity or falsely display zero history. Offer documented backup recovery options.

## 05 · Logout, switch user, deletion

| User action | Session | Local database | Backup/server data |
|---|---|---|---|
| Close app | Persist, subject to policy | Retain account-specific data | Unchanged |
| Logout | Clear/revoke applicable auth credentials, close DB and clear in-memory keys | **Retained, locked** | Unchanged; show explicit distinction |
| Log into different account | New verified session | Open only new account partition | No implicit transfer |
| Delete local data | Requires clear confirmation and policy for offline account proof | Erase only selected account's local records/keys | Does not silently remove backup/cloud copies |
| Delete account (future flow) | Requires recent online reauth and server-side confirmation | Explicit data-deletion choice and recovery warning | Must separately handle third-party backup and any future sync copies |

Never use a plain email string to select the database or allow one account to reference another user's encryption key.

## 06 · Tokens and keys — do not conflate

- `Supabase publishable key`: okay in mobile app configuration; **not** an authorization credential by itself.
- `User access/refresh tokens`: session credentials; use a verified storage strategy appropriate for platform limits and lifecycle.
- `Local SQLCipher key`: separate per account; protected using OS key storage; retain as required to reopen local data after logout/relogin.
- `Backup recovery secret`: different, portable and user-recoverable so a new phone can decrypt the exported file.
- `AI provider secret`: only in server-side Edge Function secrets.

Expo Auth tutorials demonstrate different persistence adapters. Treat the exact production adapter, storage size limits and offline token refresh behaviour as **implementation acceptance tasks**, not as solved by documentation.

## 07 · Test matrix

| ID | Scenario | Expected outcome |
|---|---|---|
| S-01 | Online sign-up → kill app → reopen online | Home opens without asking to sign in |
| S-02 | Online sign-up → airplane mode → reopen | Correct user's local data opens |
| S-03 | Offline edit → kill app → reopen | Committed sets/weights still present |
| S-04 | Network timeout refreshing tokens | No false “revoked” conclusion, local work continues |
| S-05 | Server confirms revoked token after reconnect | Online functions stop and reauth is required |
| S-06 | Logout while online/offline | Login screen; no exposed workout content |
| S-07 | Account A logout → account B login | No cross-user reads or key reuse |
| S-08 | Same account login again | Existing local history preserved |
| S-09 | Reinstall/clear app data without backup | Explicit recovery explanation; do not promise history |
| S-10 | Cannot unlock encrypted DB | Safe error, no plaintext fallback, no overwrite |

## 08 · Owner decisions required

- [ ] Cached offline session access acceptable when remote revocation cannot be checked?
- [ ] Optional app lock or mandatory PIN/biometric?
- [ ] Exact logout/local-key retention and deletion UX approved?
- [ ] Reauth-required screen and recovery copy approved?

---

[← Review pack](17-PHASE-0-DECISION-PACK.md) · [Data model](03-LOCAL-DATA-MODEL.md) · [Phase 1 gate →](21-PHASE-1-READINESS.md)
