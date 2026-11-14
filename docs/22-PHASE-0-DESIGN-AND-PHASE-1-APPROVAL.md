# 🎨 Phase 0 final design review & Phase 1 owner approval pack

**Status:** Proposed for owner review · **2026-11-14** · **No Phase 1 implementation approval recorded**

[← Docs hub](00-INDEX.md) · [Design system](../DESIGN.md) · [MVP flows](20-MVP-UX-FLOWS.md) · [Phase 1 readiness](21-PHASE-1-READINESS.md) · [Issue #2](https://github.com/im-tnyx/Tio-Workspace/issues/2)

> [!IMPORTANT]
> This is a **sign-off-ready recommendation**, not an owner decision, validated mockup, working UI, permission to create app code or a completed security audit. Only a later, separate written approval by the repository owner may authorize a named Phase 1 slice. Merging this document is **not** that authorization.

## 1. Decision summary

**Recommended outcome:** Tnyx minimal **Black/White/Gray default without a mandatory accent**; user-selectable named Accent Color presets are a **future option, not MVP UI**. System(default)/Light/Dark, portrait-only Standard Glass/neutral design and English-only system fonts now with future localization seams. Native identity/security and owner Phase 1 approval remain separate.

| Topic | Existing owner-selected policy | Proposed decision for owner |
|---|---|---|
| Functional scope | Auth, Home, Exercise Library, Plans, Active Workout, History, Progress, Settings — ADR-011 | Keep the selected screens; no new MVP feature |
| Account/privacy | **Owner-selected** online email/password + verified signup OTP, no guest and correct bound UUID; previously verified same-account offline workouts still work | Password/OTP **numeric targets already selected**, but production email, provider/server enforcement, rate-limit security and native tests are **not yet configured/verified** (ADR-017) |
| Storage | Local encrypted SQLite default; Personal Backup or future paid Sync is separately chosen, never both active | Preserve unchanged |
| App identity | Tnyx display name and **Android application ID / iOS bundle ID `com.tnyx.tio`** owner-selected | Store registration/uniqueness, **icon concept preferred** (black rounded square, white celebratory motion figure and waist swoosh); final original vector, launcher-safe exports, trademark review and ownership unverified; repo remains `Tio-Workspace` |
| UI shell / visual identity | **Owner-selected ADR-015:** initial four tabs Home/Workout/Library/You in **Standard full-width + Glass translucent bar**; reusable config allows future owner-approved tab count/order and future Pill layout; scroll-revealed root TopBar, nested immediate TopBar, Settings Solid/System(default)-Light-Dark and portrait-only, dumb/token-driven screens | Palette, typography, native OS-theme switching, icon, scroll threshold, native QA and any future Pill/count feature are pending |
| Typography / i18n | **English-only OS/system font in MVP**, no Language/Custom Font setting or Hindi resources; centralized English messages, locale-aware formatters and shared typography roles (ADR-018) | Hindi/other-language translations, optional licensed Custom font/glyph QA are later separately approved phases |
| Local lock | **Not in MVP** (ADR-017) | Optional PIN/biometrics considered only in a separately approved future slice |
| Phase 1 | No implementation authorized; Phase 1.1 shell has **no live Auth/OTP or paid membership** | Prefer **Phase 1.1-only written approval**; Phase 1.2 OTP and Phase 1.4–1.6 capped local data after separate gates; membership after core app |

**Still-pending owner decisions:** app ID `com.tnyx.tio` registration/ownership and original icon, **exact neutral theme/Glass contrast and future optional Accent Color preset values** (Teal is not default), future Custom font/locale rollout (deferred), **System(default)/Light/Dark chosen**, scroll tuning, real-device visual QA, scoped Phase 1 authorization/exclusions and security exceptions. No extra decorative accent is planned. **Glass is the already-selected default material**; ADR-015 shell/token/presentation choices are recorded.

## 2. Proposed MVP visual baseline (approval pending)

### 2.1 Look and feel

- Product personality: **minimal, focused, strong, calm and trustworthy**. Optimize for legibility while resting between sets, not for gamification or health claims.
- **Selected neutral default:** White/near-white Light; Black/charcoal Dark, with neutral primary buttons, selected tabs and progress. **No Teal by default.** Future user-choice accent menu may offer approved named colors, Teal just one possible preset; **not implemented now**. Material Glass/Solid and Light/Dark remain separate, meaningful status colors permitted; test accessible neutral contrast. No screenshot brand/assets copied.
- **English-only MVP (ADR-018):** OS/system fonts, shared font tokens and centralized English message keys/formatting; no Hindi translation, Language selector, Custom Font setting or bundled fonts now. Future languages/fonts require separate approval. Layout/spacings remain proposed values.
- **ADR-015 selected:** **Glass material is default**, with translucent iOS-inspired TopBar and **Standard full-width bottom navigation** now; **Pill is a future layout variant, not today's material or Settings control**. Solid material is selected only through Settings → Appearance, independently of System(default)/Light/Dark (6 preference/4 resolved combinations). The future app shell supplies root tabs from owner-controlled configuration (initial four, fewer/more later); root TopBar scroll-revealed and nested back TopBar immediate. System selected; native OS follow, exact thresholds, contrast, blur fallback and native screenshots remain unvalidated.
- Accessible controls: at least **44 × 44 pt iOS / 48 × 48 dp Android** targets as design goals, dynamic text scaling, screen-reader labels, clear focus order, reduced-motion support, and no color-only status.

### 2.1A Tnyx typography / internationalization foundation (ADR-016)

**MVP typography/language:** English-only on Auth/OTP, nav, workouts and screen-reader messages; platform OS/system font. Appearance offers **System(default), Light, Dark**, plus Glass/Solid. **No Language or Custom Font selector/font binaries/Hindi strings** in the initial app. English message keys, typed screen text, locale-aware dates/numbers/units/plurals and shared font roles minimize future screen refactor. Hindi/custom fonts are future separately authorized work.

**Orientation:** Supported Android/iPhone app is **portrait-only** on all routes, with no landscape UI/rotation setting. Native testing must verify physical rotation during workout, Auth/keyboard, app resume and modal use; tablet/iPad OS multitasking support is not assumed validated.

### 2.2 Owner-selected four-root navigation and screen hierarchy (ADR-015)

| Surface | Owner-selected route / primary action | Safety and visual contract |
|---|---|---|
| **Home** — root tab 1 | Dashboard, today's plan, Start/Resume Workout | Dock visible only here and three other roots; offline local action enabled |
| **Workout** — root tab 2 | Start/resume, Plan list/editor and History links | Only root has dock; Plan Editor, Active Workout and History hide it |
| **Library** — root tab 3 | Search/select curated exercises only in core MVP | Root dock visible; no custom-exercise creation until separately approved later membership (max 50) |
| **You** — root tab 4 | Bound account overview, Progress and Settings | Root has dock; Progress/Settings nested without dock; no switch-account UI |
| **Active Workout** — nested full screen | Thumb-friendly sets/reps/weight, Finish, autosave | Dock hidden; shared TopBar compact/back variant |
| **Plans / History / Progress / Settings** — nested | All existing ADR-011 MVP functionality retained | Dock hidden; shared themed input/button/sheet components |
| **Auth/session gate** — outside tabs | Sign in, sign up, same-bound re-login | Dock hidden; online first login, reject second UUID |

**Four current root buttons:** Home, Workout, Library, You, supplied by a **tab registry**, not a hardcoded four-item UI. The default layout is **Standard full-width**, the material is **translucent Glass**; the **floating Pill layout is deferred** but future-compatible. An owner-approved revision can change the configured root tab count/order without replacing screens. The Standard bar persists on configured roots while scrolling; Solid is selected only in Settings (accessibility/no-blur fallback excepted). Nested/full-screen/Auth routes never render bottom navigation. Root shared compact TopBar appears **only after scrolling** and hides at scroll top; nested back TopBar is immediately visible. Shared route layout owns scroll/visibility, not screens; OS status bar separate. iOS images are visual references only, not copied assets or extra features.

**Reusable theme/UI contract:** Navigation has **three independent dimensions**: ordered owner-controlled root tab config (initial four), layout variant **Standard now / Pill future**, and Settings' **Glass (default) vs Solid** material, plus independent Light/Dark appearance. Settings does **not** currently expose layout or tab-count editing; preferences are local and never enable backup/sync. **Future `src/shared/theme/tokens/`** defines semantic colors/text, glass tint/opacity/blur, opaque surfaces, border/shadow, spacing, radii, typography/icons, motion and component aliases. `src/shared/ui/` components TopBar, BottomTabBar, TextField, Button, Card, SheetSurface, Switch, Select and Dialog all use these tokens, not per-screen style branches. **Dumb screens** only compose props/view state and callbacks; app shell owns scrolling/tab visibility, feature hooks/controllers and domain/application own state/rules, data/platform own SDK/I/O. Unsupported blur/reduced transparency uses temporary readable Solid fallback, without changing preference. Native blur/performance/a11y untested. Initial Light/Dark, scroll threshold and final visuals pending.

### 2.3 Required UI states and copy

For each applicable screen: **loading, empty, offline, error, saving/retry, destructive confirmation and accessibility** states. Critical proposed copy:

| Event | Proposed user-facing text |
|---|---|
| First save | “Saved on this device” |
| Offline | “Offline · Workouts still work” |
| Sign out | “Your workouts stay on this device, linked to this account.” |
| Wrong account | “This device is linked to another Tnyx account. Sign in with the linked account.” |
| Local-only reset | “Erasing this device may permanently remove workouts without a usable backup.” Require a separate destructive confirmation |
| Empty device, unknown prior settings | “No workouts on this device.” Optional **Find existing encrypted backup** — not a mandatory restore dialog |
| Verified Personal Backup archive | **Restore / Skip** after user-initiated provider connection, archive verification and recovery secret; Restore requires separate replace confirmation |
| Future authorized paid Sync | “Downloading your workouts…” **No Personal Backup Restore dialog**; show honest errors/empty state if authorization/data unavailable |

A Personal Backup restore is not tied to the current/remembered upload mode, may be skipped, and must not silently enable upload. Future Supabase Sync requires previous explicit user opt-in, valid entitlement and current authorization, then may automatically hydrate local data. Auth alone never recreates local-only workouts. Refer to [recovery contract](19-BACKUP-RECOVERY-STRATEGY.md) and [MVP flows](20-MVP-UX-FLOWS.md).

### Phase 0 security/limits update — owner-selected ADR-017

**ADR-017 refined owner-selected numerical limits:** password **8–64**, username **3–16**; program/routine creation **max 50/account and 30/program**, **zero minimum creations, saved program/routine title length 3–25 graphemes**; exercises/routine max 30, sets/exercise **1–8**, completed-session exercises max 40. **Future paid-member-only custom exercise creation max 50/member**; free MVP curated Library has no Add Custom action. Signup remains verified email OTP with targets **6 digits, 10-minute expiry, 60-second resend, 5 sends/email-hour, 5 wrong attempts and 15-minute cooldown**, requiring real provider/server enforcement. **CAPTCHA is deferred**, as are app lock, membership/payments/paywall and paid Sync. Already verified matching offline use remains allowed. No Auth/backend configuration or native test has been performed. See [canonical spec](23-INPUT-LIMITS-OTP-AND-FUTURE-MEMBERSHIP.md).

## 3. Decisions that must be recorded versus legitimately deferred

| Ref | Required now to sign off shell | Deferred gate / risk |
|---|---|---|
| D16 / D17 / ADR-017 | Product numbers/password/username/program/routine saved title 3–25, creation-count/set limits and OTP targets **owner-selected**; future custom member cap 50; **CAPTCHA deferred** | Provider/server enforceability, rate limits and native/abuse tests pending; no member custom creation in MVP |
| D01 / ADR-016 | **Tnyx and Android/iOS app ID `com.tnyx.tio`** selected | Store uniqueness/ownership/registration and monochrome moving-person concept preferred; final original editable vector/icon export + owner release approval pending |
| Visual / language / orientation | Neutral UI; **System(default)/Light/Dark** with Glass/Solid; **portrait-only**, **English-only OS font** MVP (ADR-018); future accents/custom fonts/Hindi deferred | `UX-08/11/14 P0` native OS-follow/portrait/font/contrast tests pending; `UX-13/15` future-only |
| D02–D06, D10, D13 | Already owner-selected via ADR-010/011; **do not reopen silently** | Native key lifecycle, encryption and migration tests must pass before local encrypted storage release |
| D07 | Agree Personal Backup is **later** and manual export/import is the first feasibility target | Google Drive scopes, iCloud native path, crypto format, scheduler and fresh-install restore in Phase 3 |
| D08 | Exclude AI from Phase 1 | Provider, privacy, output contract, quota and Edge Function design in Phase 2 |
| D09 | **Owner explicitly deferred app lock from MVP (ADR-017)** | Later optional lock/recovery UX needs separate approval; not an MVP go/no-go |
| D11 | Default proposal: **no workout-content analytics** and minimize any future crash telemetry | Provider, retention and user disclosure require separate approval |
| D12 / ADR-014/017 | **No membership/billing/paywall until after core workout MVP**; design stable domain interfaces now | Future paid Sync needs server entitlement, separate upload consent, RLS, expiry/export and deletion policy |
| OS backup | Require test strategy and no false Local Only claims | Android backup/cloud/D2D exclusions, iOS file backup flags and lost/stale key fail-closed tests before relevant native release |

No team or agent should mark a deferred high-risk test **passed** merely because the implementation is deferred.

## 4. Phase 1 readiness: split the approval from the exit tests

### 4.1 To approve **only Phase 1.1 — shell**

- [x] Owner selected **`com.tnyx.tio`** app ID, password 8–64, username 3–16, program/routine maximum creation counts and saved title 3–25, sets 1–8, member-only custom 50 and OTP targets; CAPTCHA deferred.
- [ ] Verify provider/server feasibility, platform/store ID ownership, original icon, theme contrast, future font licensing, native System OS-follow and portrait and native/device gates before implementation/release.
- [ ] Owner states exact Phase 1.1 scope and excludes Auth credentials/project setup, encryption/storage implementation, real workouts, AI, backups, server sync, billing and releases.
- [ ] Review Expo SDK and React Native compatibility on the actual implementation date; select a native development-build and iOS/Android test approach. No packages/config are installed in this PR.
- [ ] Owner accepts that SQLCipher, Drizzle, secure storage and OS backup controls are **unverified** and must remain blocked until their later implementation gates.
- [ ] Owner records dated written **Phase 1.1 authorization in a separate GitHub issue/PR comment**, with responsible implementation owner and review/rollback expectations.
- [ ] New implementation work uses a separate bounded PR, not this documentation branch.

**Phase 1.1 intended deliverable after separate approval:** Expo/TypeScript shell, basic route/navigation placeholders with theme tokens and non-sensitive CI/lint/test setup; an Android and iOS native/device launch strategy. **No Supabase calls, keys, account creation, real SQLite database or cloud transfers** in 1.1 unless separately scoped and approved.

### 4.2 Later gates inside Phase 1 — not prerequisites to merely write the shell

| Slice | Entry gate | Mandatory exit evidence before progressing/releasing |
|---|---|---|
| 1.2 Auth | Separately approved online email/password + OTP verification and server/provider anti-abuse; binding/security | Only verified signup unlocks, no guest, resend/rate/replay and persisted/offline same account tests pass |
| 1.3 Secure SQLite | Native SQLCipher/Drizzle compatibility and OS key lifecycle reviewed | `PRAGMA cipher_version`, fail-closed missing-key path, account binding before unlock, migrations; Android/iOS backup/transfer exclusion evidence |
| 1.4–1.6 Workout MVP | Secure local data and selected caps | Program/routine saved-name 3–25 and count-based quotas, 1–8 sets and curated free Library tested; custom-exercise creation/paywall excluded; existing history preserved |
| 1.7 Release candidate | Full device validation | Phase 1 **P0 AUTH-01–14, LIMIT-01–05 (future member-only LIMIT-06 excluded), SEC-01–06, DATA and UX-01–05/08–12/14 (future accent UX-13 and localization UX-15 excluded)** with device/server evidence; future Backup/Sync cases remain later gates |

**Important sequencing:** native proof cannot legitimately be marked complete before its test build exists. Approve **bounded work** and keep security-release gates pending; do not use a broad “Phase 1 approved” label to bypass them. Any Supabase project/credential, new permission or privacy-changing action needs explicit scoped approval before execution.

## 5. Owner sign-off record (template — NOT FILLED / NOT APPROVED)

Record this separately in [issue #2](https://github.com/im-tnyx/Tio-Workspace/issues/2) or a subsequent reviewed PR after considering this document:

| Field | Owner must provide |
|---|---|
| Approver / date | Repository owner identity and ISO date |
| Design decision | ADR-015 Standard Glass nav, ADR-016 neutral/future accent, ADR-017 limits/OTP; **ADR-018 System(default)/Light/Dark, portrait-only, English-only OS/system font with future localization seams** | Native OS mode, portrait orientation, device English scaling, ID/icon and Phase 1 approvals pending |
| Platform identifiers | **`com.tnyx.tio`** on Android and iOS; selected but not registered or store-verified |
| Phase authorization | “Approve **Phase 1.1 app shell only**” **or** a precisely enumerated alternate slice |
| Explicit exclusions | Auth project/credentials, workout database, AI, personal backup, paid Sync, deployment unless independently approved |
| Accepted risks | Native SQLCipher/Drizzle/OS-backup tests are **pending**, not passed |
| Evidence | Link to reviewed docs PR, owner comment, responsible implementer and required review/acceptance gates |
| Result | **PENDING** until the owner writes a clear approval; no acceptance inferred from a docs merge |

Recommended sign-off wording (copy only if actually intended by the owner):

> I confirm remaining Tnyx visual details and separately authorize **Phase 1.1 (Expo/TypeScript shell, ADR-015 Standard + Glass initial four-tab bar (registry-based), root scroll-reveal TopBar, portrait-only and System(default)/Light/Dark English/system-font shared theme tokens/dumb-screen placeholders and basic tooling only)**. No Hindi/custom font or language selector or landscape UI; no Auth integration, SQLCipher/Drizzle database, workout feature, AI, cloud backup/sync, billing or deployment is authorized by this approval. Native/security gates remain pending. Owner/date/identifiers: [complete before posting].

## 6. Verification and handoff

- This pack is **documentation only**. It records the owner's ADR-015 shell/theme selection, not a prototype, implemented UI, device measurements, release proof, CI success, Supabase project or separate **Phase 1 implementation sign-off**.
- On this documentation PR: check changed-file scope, all relative links, Markdown tables/fences and consistency with ADR-010–014, the UX flows, recovery specification and test plan.
- Independent review + explicit owner permission are still required **before merging the docs PR**.
- After docs merge and separate owner sign-off, start **Phase 1.1** in a new implementation PR with test evidence. Leave [issue #2](https://github.com/im-tnyx/Tio-Workspace/issues/2) open while Phase 0 decisions or approval remain unresolved.

**Current reference guidance (revalidate on actual implementation day):** [Expo SQLCipher/native-build guidance](https://docs.expo.dev/versions/latest/sdk/sqlite/), [Supabase React Native Auth guidance](https://supabase.com/docs/guides/auth/quickstarts/react-native), [auth/security baseline](04-AUTH-AND-SECURITY.md), [native acceptance](08-TEST-PLAN.md).

---

[← Phase 0 decision pack](17-PHASE-0-DECISION-PACK.md) · [Phase 1 readiness](21-PHASE-1-READINESS.md) · [Design](../DESIGN.md)
