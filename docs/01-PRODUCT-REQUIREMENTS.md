<div align="center">

# 🎯 Product Requirements
**Scope, user journeys and MVP acceptance**

[← Docs hub](00-INDEX.md) · [🏠 Home](../README.md) · [🎨 Design](../DESIGN.md)

</div>

> [!NOTE]
> **Document status:** Planning / proposed specification. Product implementation has not started.

---

**Document state:** Owner-selected MVP and single-account behavior recorded 2026-11-14; detailed visual design and security verification remain pending. **Implementation: not started.**

## Vision
A trustworthy Android/iOS workout diary that **requires an account** but stores the workout diary **locally by default**. The app should open straight to the dashboard after its first successful login and work for normal workout logging without connectivity. Personal cloud backup is opt-in; app-database sync is a separate future opt-in feature.

## Non-negotiable requirements
1. First-time signup/login uses **Supabase Auth online Email → OTP → Password for new signup; existing activated accounts use Email → OTP direct login** (ADR-017); Google/Apple sign-in is a later optional evaluation. No guest/anonymous workout access; the protected local workout store is **not bound/unlocked before trusted completion and verification of the correct account UUID**. Signup OTP has server-side send/verify limits and abuse controls, not only a UI countdown. Previously verified users stay signed in across normal restarts unless signout/reauth requires otherwise.
2. An authenticated, previously initialized device must allow offline workout entry/read. No online auth check is required on every screen or app open.
3. Workout sessions, plans, sets, repetitions, weight, duration, notes and progress live in the **device SQLite database**, not Supabase Postgres, in initial releases.
4. **Single-account-per-installation:** one verified Supabase user UUID can be locally bound on a given installation. No in-app add-account or switch-account feature. A second identity cannot sign in while the original binding/workouts remain; existing data must never become readable by a different account.
5. Signing out removes the active session and locks/hides the bound account's local data; it does **not** erase workouts or release the identity binding. Re-login to the **same** verified account restores access. A distinct, clearly confirmed **erase-this-device** flow (including backup/data-loss warning) is required before any new identity can be bound; never offer an implicit switch.
6. The app must not claim a **Local Only** workout will automatically reappear on another device. After OS clear-data, uninstall/reinstall, phone loss or explicit erase, same-account online login leads to: **future previously enabled and authorized Supabase Sync** → automatic download of available server workouts into local encrypted SQLite, **no Restore Backup UI**; **known Personal Backup archive** → offer user-controlled **Restore or Skip**; **missing/unknown backup settings** → optional **Find existing encrypted backup** from the empty-history/recovery UI, with Restore or Skip only after an owned archive is found; **Local Only** or inaccessible data → empty local workout history, no automatic restore prompt. An explicit matching encrypted archive import must not require re-enabling Personal Backup mode. Normal same-account logout/re-login **without wiping local data** preserves it. Supabase Auth by itself stores no workout diary.
7. AI plan generation is optional and online. Its third-party API key lives in server-side function secrets, not the mobile binary.
8. **One active cloud option at a time:** default **Local Only**; optionally **Personal Backup** to user's Google Drive/iCloud (or encrypted manual export), **never Supabase backup storage**; or **future opt-in Supabase Sync**, not implemented or authorized now. Personal Backup and Supabase Sync are **mutually exclusive settings**, never both ON. Personal Backup alone offers manual/future best-effort Off/Daily/Weekly/Monthly schedule and explicit Restore; Sync mode would auto-download available authorized server records after same-account login with no Backup Restore button. Photos/videos require separately approved attachments; Personal Backup encryption is mandatory. Switching modes must inform the user about prior cloud copies and require explicit, verified deletion/permission handling—no silently retained dual cloud copy. Sync may propagate deletions and is not guaranteed historical recovery.
9. The owner accepts that previously verified offline local access can continue until online revalidation; offline mode cannot detect remote revocation in real time. Server operations require valid server-side authorization.
10. The owner selected an OS-protected **per-bound-account SQLCipher key** and a distinct **portable user-held backup recovery secret** as design principles. Actual key lifecycle, cryptographic format, recovery UX and Android/iOS validation are separate security gates.

**Owner-selected baseline (ADR-016):** Tnyx uses **neutral Black/White/Gray by default, no forced Teal**. Primary actions, selected tabs and progress work without a colored accent. **Future** user-selectable named accent colors are possible via Settings, with Teal one candidate only; **no accent picker in current MVP**. Material Glass/Solid, System(default)/Light/Dark and English-only OS fonts remain independent; Hindi/custom fonts deferred. Screenshot UI/branding will not be copied. Actual native contrast and future presets untested.

**Owner-selected UI presentation (ADR-015; design only):** **Glass is default** for the iOS-inspired translucent shared TopBar and bottom dock; **Solid is available only in Settings → Appearance**, independently of Light/Dark. The **initial four configured root tabs** are **Home / Workout / Library / You**. A reusable navigation registry must support an owner-approved future change in tab count/order, without hardcoding four or letting user screens mutate the tabs. **Bottom-bar layout is Standard for MVP**, with an optional **Pill variant deferred**; Glass/Solid is a separate surface setting. The translucent Standard bar remains visible while scrolling root screens; nested/Auth/full-screen routes hide it. Root compact TopBar is hidden initially and revealed **only after scrolling**; nested/back TopBar appears immediately. All fields/buttons/sheets use future **`src/shared/theme/tokens/`** and `src/shared/ui/`. **Screens are dumb views**; scroll/route coordination lives in the app shell and state/business/SDK logic outside screens. Accessibility/no-blur Solid fallback preserves stored preference. UI preferences never cause cloud uploads; native testing remains pending.

**OS-managed backup boundary (future native gate):** “Local Only / Backup OFF” must not accidentally use Android Auto Backup, Android device-to-device transfer, or iOS device/iCloud app backup to copy local workout SQLite, sidecars, snapshots or sensitive account material. Define and test platform-specific exclusions; an in-app backup switch alone cannot control OS transfers. Do not promise absolute no-copy guarantees beyond verified platform control. See [backup & sync](05-BACKUP-AND-SYNC.md).

**Fresh-install backup discovery (future):** Reinstall/OS clear-data may erase the remembered backup choice. After same-account online authentication, offer voluntary **Find/Restore existing encrypted backup** even when local settings are empty/unknown. The user selects and authorizes their Drive/iCloud account (or imports an encrypted file), verifies a same-user archive and supplies a portable recovery secret. Discovery must not turn on backup, upload workouts or enable paid Supabase Sync.

**Future membership policy (ADR-014):** Supabase Sync will synchronize the **complete supported workout dataset** only for a paid Tnyx member who **separately enables Sync** in Settings. Membership purchase alone cannot trigger upload. Default Local Only and user-owned Google Drive/iCloud Personal Backup do **not** require Sync membership. Price, subscription lifecycle and implementation are not yet approved.

**Owner-selected limits/OTP/membership (ADR-017):** password **8–64**, required proposed Account Setup Username **3–16** graphemes, **max 50 programs/account and 30 routines/program** with zero permitted creation count **plus separately saved program/routine name lengths of 3–25 Unicode grapheme clusters**, max 30 exercises/routine, **sets per exercise 1–8**, max 40 completed-session exercises. **Custom exercise creation is FUTURE paid-membership-only, max 50/member**; free MVP provides curated Library, plans/routines and local workouts **without a Create Custom Exercise action**. Signup OTP targets are 6 digits/10 min/60 s resend/5 sends per email-hour/5 wrong attempts/15 min cooldown, subject to provider/server enforcement. **CAPTCHA deferred**, as are app lock, membership/payments and premium Sync. See [canonical limits](23-INPUT-LIMITS-OTP-AND-FUTURE-MEMBERSHIP.md); the code/backend have not been configured.

**Selected application identifiers:** Android application ID and iOS bundle ID **`com.tnyx.tio`**. Keep visible app name **Tnyx** and existing repo/backup identifiers unchanged; ownership, store uniqueness, build signing and native registration require verification.

**ADR-018 selected launch rules:** **Portrait-only Android/iOS app** (no landscape layout), **Appearance System (default)/Light/Dark** with OS-follow behavior/manual overrides, and **English-only system-font MVP**. No current Language selector, Custom Font UI, Hindi strings or font assets. Plan a centralized English message catalog/typed view state, shared font tokens and locale-aware formatting so future languages/font options need minimal screen refactoring; native configuration and QA only after Phase 1 approval.

## Target platforms and proposed stack
- iOS and Android through React Native, Expo, TypeScript and Expo Router.
- Supabase Auth only for the initial account/login requirement. Supabase Edge Functions only when online functionality needs a server.
- **Owner-selected:** Expo SQLite + Drizzle ORM/Drizzle Kit + native SQLCipher for local records and versioned migrations (ADR-010); functionality and encryption are not yet tested.
- Expo SecureStore for small secrets/key material and a secure session storage adapter.
- Google Drive/iCloud integrations are **planned**, not currently set up.

**Exercise-library MVP scope refinement:** free app uses the **curated exercise catalog only**; do not expose functional custom exercise creation before the separately approved membership phase (later maximum 50 per eligible member). Program/routine creation and core workout logging remain free, with no membership gates. **Saved program/routine titles are 3–25 Unicode graphemes; no auto-truncation**.

## MVP screens and flows
| Screen | User goal | Offline availability |
|---|---|---|
| Welcome / Signup / Login / Password reset | Authenticate an account | New authentication requires internet |
| Startup / Session gate | Resume existing account securely | Previously initialized local account available offline |
| Dashboard | Today's plan, recent logs, quick start | Yes |
| Exercise library | Browse/search/select curated exercises; no custom creation in MVP | Yes for cached curated data |
| Workout session | Start, pause, record sets, reps, weights, notes, finish | Yes |
| Workout plans | Build/edit schedule and exercises | Yes |
| History & workout details | Review previous sessions | Yes |
| Progress | PRs, volume and measurements, calculated locally | Yes |
| Profile & settings | Change preferences; logout; manage data | Mostly |
| Backup & Restore (later milestone) | Save/recover encrypted personal backup | Transfer requires internet |
| AI Plan Generator (later milestone) | Get a generated draft plan | No |
| Supabase Sync (future membership) | Full supported workout-data Sync with paid entitlement and explicit user opt-in | Online; **not in MVP** |

## Workout entry behaviour
- Let users browse/search/select **curated exercises**. Custom exercise creation is a **future paid-member feature, max 50/member**, not an MVP screen or action.
- Plan a workout day with ordered exercises and target sets/reps/rest.
- Record workout session start/end, per-set weight, reps, duration or distance (where applicable), warm-up flag, completion and notes.
- Calculate duration, exercise history, personal records and progress locally, including after device restart.
- Autosave changes in SQLite using transactions; avoid losing the current session when the app is backgrounded.
- Use metric units first with a clear pathway to imperial units, not destructive conversions.
- Handle edit/delete with confirmation and a future-sync-compatible tombstone strategy.

## MVP exclusions
No multi-account/add-account/switch-account UI, community features, social feed, trainer marketplace, billing/subscriptions, third-party health app integrations, multi-device realtime sync or automatic AI coaching are necessary for the first usable build. No claim of guaranteed background cloud backups before platform capability testing.

## User stories and acceptance
- As a new user, I can register online, reopen the app and go straight to Home without signing in again.
- As a returning user without network access, I can see/edit/finish workouts associated with my existing account.
- As a user, I can log out without my workout history being silently deleted.
- As the owner of a bound installation, I cannot add/switch to a second Tnyx account; signing in with another identity is rejected without exposing or deleting my existing workouts.
- As a returning user, I can log back into the **same** account after logout and recover my retained local history.
- As a privacy-conscious user, I can confirm that workout rows are not being uploaded to the application's database by default.
- As a user who chooses backup, I can restore onto a fresh installation **after demonstrating** the required account identity and decryption/recovery method.
- As a user choosing AI, I can see what personal inputs will be transmitted and decline.

## Success metrics (proposals)
Workout save reliability, crash-free sessions, startup-to-dashboard time, offline completion rate, restore success in tests and percentage of users who explicitly activate cloud features. Avoid analytics on workout content without informed consent.

## Open product decisions
Original app icon, ID uniqueness/registration and visual polish; exercise catalog licensing; future Google/Apple login; optional PIN/biometrics and recovery/lockout UX; exact key lifecycle and future backup cryptography/provider UX; AI provider and quotas. **Approved MVP scope:** email/password, local exercises/plans, offline workout sets/reps/weight, history/progress, settings, logout and explicit erase warnings. Not a Phase 1 implementation approval.

---

[← Documentation hub](00-INDEX.md) · [Architecture →](02-SYSTEM-ARCHITECTURE.md)
