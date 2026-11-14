# 🎨 Phase 0 final design review & Phase 1 owner approval pack

**Status:** Proposed for owner review · **2026-11-14** · **No Phase 1 implementation approval recorded**

[← Docs hub](00-INDEX.md) · [Design system](../DESIGN.md) · [MVP flows](20-MVP-UX-FLOWS.md) · [Phase 1 readiness](21-PHASE-1-READINESS.md) · [Issue #2](https://github.com/im-tnyx/Tio-Workspace/issues/2)

> [!IMPORTANT]
> This is a **sign-off-ready recommendation**, not an owner decision, validated mockup, working UI, permission to create app code or a completed security audit. Only a later, separate written approval by the repository owner may authorize a named Phase 1 slice. Merging this document is **not** that authorization.

## 1. Decision summary

**Recommended outcome:** adopt the owner-selected **Tnyx** identity, **Violet** direction and Hindi-capable Default/Custom typography alongside the proposed MVP visual baseline, settle the limited choices below, then independently approve a narrowly scoped Phase 1.1 shell. Defer secrets, Supabase setup, SQLCipher/Drizzle integration, actual workout storage, AI, Google Drive/iCloud and paid sync until their separately defined slices and gates.

| Topic | Existing owner-selected policy | Proposed decision for owner |
|---|---|---|
| Functional scope | Auth, Home, Exercise Library, Plans, Active Workout, History, Progress, Settings — ADR-011 | Keep the selected screens; no new MVP feature |
| Account/privacy | Supabase email/password, single locally bound UUID, offline local workouts; no account switching | Preserve unchanged |
| Storage | Local encrypted SQLite default; Personal Backup or future paid Sync is separately chosen, never both active | Preserve unchanged |
| App identity | **Tnyx** final app display name selected (ADR-016); repo still `Tio-Workspace` | Android application ID, iOS bundle ID and icon/logo assets pending |
| UI shell / visual identity | **Owner-selected ADR-015:** initial four tabs Home/Workout/Library/You in **Standard full-width + Glass translucent bar**; reusable config allows future owner-approved tab count/order and future Pill layout; scroll-revealed root TopBar, nested immediate TopBar, Settings Solid/independent Light-Dark, dumb/token-driven screens | Palette, typography, Light/Dark startup, icon, scroll threshold, native QA and any future Pill/count feature are pending |
| Typography / i18n | **Owner-selected (ADR-016):** Settings Default OS / Custom app font, both Hindi/Devanagari-ready with fallback; future language selection separate; shared token-driven controls | Custom font family/license and native large-text/Hindi QA pending; no font assets in this PR |
| Local lock | PIN/biometrics undecided | **Defer** to a separate consent/recovery decision; do not imply an always-on unlock prompt |
| Phase 1 | No implementation authorized | Prefer **Phase 1.1-only written approval**, after design and tooling/startup plan sign-off |

**Still-pending owner decisions:** Android/iOS app IDs, icon, **exact Violet hex/contrast**, possible Mint accent, **Custom font family/license**, initial locale launch, **initial Light/Dark**, scroll threshold/animation, device visual QA, scoped Phase 1 authorization/exclusions and security exceptions. **Glass is the already-selected default material**; ADR-015 shell/token/presentation choices are recorded.

## 2. Proposed MVP visual baseline (approval pending)

### 2.1 Look and feel

- Product personality: **minimal, focused, strong, calm and trustworthy**. Optimize for legibility while resting between sets, not for gamification or health claims.
- **Violet primary direction is owner-selected**, while exact `DESIGN.md` `brand.primary` shades (`#6658E8` Light / `#9389FF` Dark) remain **proposals pending contrast QA**; Mint (`#13B89A` / `#4DE0BC`) is a proposed accent, not a separately approved brand choice.
- **Typography owner-selected (ADR-016):** Settings Default device font / Custom app font, both Hindi/Devanagari-capable through script-aware fallback, independent of language selection. Exact Custom font/license and native Hindi glyph QA pending. Spacing `4/8/12/16/24/32`, 16px radii and 24px icons remain proposed design values.
- **ADR-015 selected:** **Glass material is default**, with translucent iOS-inspired TopBar and **Standard full-width bottom navigation** now; **Pill is a future layout variant, not today's material or Settings control**. Solid material is selected only through Settings → Appearance, independently of Light/Dark (four combinations). The future app shell supplies root tabs from owner-controlled configuration (initial four, fewer/more later); root TopBar scroll-revealed and nested back TopBar immediate. Light/Dark startup, exact thresholds, contrast, blur fallback and native screenshots remain unvalidated.
- Accessible controls: at least **44 × 44 pt iOS / 48 × 48 dp Android** targets as design goals, dynamic text scaling, screen-reader labels, clear focus order, reduced-motion support, and no color-only status.

### 2.1A Tnyx typography / internationalization foundation (ADR-016)

Settings → Appearance → Typography offers **Default OS/system** and **Custom app font**, both Hindi/Devanagari compatible with explicit fallback when glyphs are missing. Shared typography tokens drive all labels, fields, sheets, workout units and navigation. Future language/translation resources are separate from font selection. Validate words such as `व्यायाम`, `प्रगति`, `सेट`, `वज़न` and mixed Hindi/English input on Android/iOS, including ligatures/matras, line wrapping, large text, accessibility focus and caret movement. Custom font files, exact license, language packs and runtime checks are **not implemented**.

### 2.2 Owner-selected four-root navigation and screen hierarchy (ADR-015)

| Surface | Owner-selected route / primary action | Safety and visual contract |
|---|---|---|
| **Home** — root tab 1 | Dashboard, today's plan, Start/Resume Workout | Dock visible only here and three other roots; offline local action enabled |
| **Workout** — root tab 2 | Start/resume, Plan list/editor and History links | Only root has dock; Plan Editor, Active Workout and History hide it |
| **Library** — root tab 3 | Search/add curated or custom exercises | Root has dock; exercise detail/editor nested without dock |
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

## 3. Decisions that must be recorded versus legitimately deferred

| Ref | Required now to sign off shell | Deferred gate / risk |
|---|---|---|
| D01 / ADR-016 | **Tnyx display name selected**; app IDs, original icon/logo pending | Trademark/assets and store release review remain separate; repo name unchanged |
| Visual / typography | **Violet primary direction and Default/Custom Hindi-ready type selected (ADR-016)**; ADR-015 Standard+Glass configurable nav remains; exact colors/font and startup Light/Dark pending | iOS/Android screenshots, Hindi/large type inputs, 3/4/5+ tabs, scroll, contrast and blur/keyboard QA pending |
| D02–D06, D10, D13 | Already owner-selected via ADR-010/011; **do not reopen silently** | Native key lifecycle, encryption and migration tests must pass before local encrypted storage release |
| D07 | Agree Personal Backup is **later** and manual export/import is the first feasibility target | Google Drive scopes, iCloud native path, crypto format, scheduler and fresh-install restore in Phase 3 |
| D08 | Exclude AI from Phase 1 | Provider, privacy, output contract, quota and Edge Function design in Phase 2 |
| D09 | Explicitly defer optional local PIN/biometrics | Later lockout and recovery consent decision; never silently require at every app open |
| D11 | Default proposal: **no workout-content analytics** and minimize any future crash telemetry | Provider, retention and user disclosure require separate approval |
| D12 / ADR-014 | Exclude paid Sync and billing from Phase 1 | Phase 4 RLS/owner auth, consent, entitlement/expiry, remote deletion and conflicts |
| OS backup | Require test strategy and no false Local Only claims | Android backup/cloud/D2D exclusions, iOS file backup flags and lost/stale key fail-closed tests before relevant native release |

No team or agent should mark a deferred high-risk test **passed** merely because the implementation is deferred.

## 4. Phase 1 readiness: split the approval from the exit tests

### 4.1 To approve **only Phase 1.1 — shell**

- [ ] Owner confirms **exact Violet values, Custom font family/license, initial Light/Dark**, scroll-tuning and app IDs/icon; **Tnyx name, Violet direction and font modes are selected (ADR-016)**; **Standard Glass initial tab bar, future config-driven tab count/Pill variant, scroll-reveal TopBar and dumb token-driven screens already selected** under ADR-015.
- [ ] Owner states exact Phase 1.1 scope and excludes Auth credentials/project setup, encryption/storage implementation, real workouts, AI, backups, server sync, billing and releases.
- [ ] Review Expo SDK and React Native compatibility on the actual implementation date; select a native development-build and iOS/Android test approach. No packages/config are installed in this PR.
- [ ] Owner accepts that SQLCipher, Drizzle, secure storage and OS backup controls are **unverified** and must remain blocked until their later implementation gates.
- [ ] Owner records dated written **Phase 1.1 authorization in a separate GitHub issue/PR comment**, with responsible implementation owner and review/rollback expectations.
- [ ] New implementation work uses a separate bounded PR, not this documentation branch.

**Phase 1.1 intended deliverable after separate approval:** Expo/TypeScript shell, basic route/navigation placeholders with theme tokens and non-sensitive CI/lint/test setup; an Android and iOS native/device launch strategy. **No Supabase calls, keys, account creation, real SQLite database or cloud transfers** in 1.1 unless separately scoped and approved.

### 4.2 Later gates inside Phase 1 — not prerequisites to merely write the shell

| Slice | Entry gate | Mandatory exit evidence before progressing/releasing |
|---|---|---|
| 1.2 Auth | Separate owner-allowed setup, session persistence and identity-binding specification | First online signup, same-user re-login, persistence/offline eligibility, blocked second UUID tests |
| 1.3 Secure SQLite | Native SQLCipher/Drizzle compatibility and OS key lifecycle reviewed | `PRAGMA cipher_version`, fail-closed missing-key path, account binding before unlock, migrations; Android/iOS backup/transfer exclusion evidence |
| 1.4–1.6 Workout MVP | Local DB/security slice validated | Exercises/plans, transactional sets/reps, crash recovery, local History/Progress, separate erase versus logout |
| 1.7 Release candidate | Full device validation | Phase 1 **P0 AUTH/DATA/SEC + UX-01–05/UX-08–11** with device evidence; P1 UX-06 Backup and P2 UX-07 Sync are later gates |

**Important sequencing:** native proof cannot legitimately be marked complete before its test build exists. Approve **bounded work** and keep security-release gates pending; do not use a broad “Phase 1 approved” label to bypass them. Any Supabase project/credential, new permission or privacy-changing action needs explicit scoped approval before execution.

## 5. Owner sign-off record (template — NOT FILLED / NOT APPROVED)

Record this separately in [issue #2](https://github.com/im-tnyx/Tio-Workspace/issues/2) or a subsequent reviewed PR after considering this document:

| Field | Owner must provide |
|---|---|
| Approver / date | Repository owner identity and ISO date |
| Design decision | **ADR-016 Tnyx/Violet/Default-Custom Hindi-ready typography** and ADR-015 Standard+Glass/navigation selected; pending exact font, tokens, app IDs/icon and initial Light/Dark |
| Platform identifiers | Android application ID / iOS bundle ID, provisional or final |
| Phase authorization | “Approve **Phase 1.1 app shell only**” **or** a precisely enumerated alternate slice |
| Explicit exclusions | Auth project/credentials, workout database, AI, personal backup, paid Sync, deployment unless independently approved |
| Accepted risks | Native SQLCipher/Drizzle/OS-backup tests are **pending**, not passed |
| Evidence | Link to reviewed docs PR, owner comment, responsible implementer and required review/acceptance gates |
| Result | **PENDING** until the owner writes a clear approval; no acceptance inferred from a docs merge |

Recommended sign-off wording (copy only if actually intended by the owner):

> I confirm remaining Tnyx visual details and separately authorize **Phase 1.1 (Expo/TypeScript shell, ADR-015 Standard + Glass initial four-tab bar (registry-based), root scroll-reveal TopBar, shared theme tokens/dumb-screen placeholders and basic tooling only)**. No Auth integration, SQLCipher/Drizzle database, workout feature, AI, cloud backup/sync, billing or deployment is authorized by this approval. Native/security gates remain pending. Owner/date/identifiers: [complete before posting].

## 6. Verification and handoff

- This pack is **documentation only**. It records the owner's ADR-015 shell/theme selection, not a prototype, implemented UI, device measurements, release proof, CI success, Supabase project or separate **Phase 1 implementation sign-off**.
- On this documentation PR: check changed-file scope, all relative links, Markdown tables/fences and consistency with ADR-010–014, the UX flows, recovery specification and test plan.
- Independent review + explicit owner permission are still required **before merging the docs PR**.
- After docs merge and separate owner sign-off, start **Phase 1.1** in a new implementation PR with test evidence. Leave [issue #2](https://github.com/im-tnyx/Tio-Workspace/issues/2) open while Phase 0 decisions or approval remain unresolved.

**Current reference guidance (revalidate on actual implementation day):** [Expo SQLCipher/native-build guidance](https://docs.expo.dev/versions/latest/sdk/sqlite/), [Supabase React Native Auth guidance](https://supabase.com/docs/guides/auth/quickstarts/react-native), [auth/security baseline](04-AUTH-AND-SECURITY.md), [native acceptance](08-TEST-PLAN.md).

---

[← Phase 0 decision pack](17-PHASE-0-DECISION-PACK.md) · [Phase 1 readiness](21-PHASE-1-READINESS.md) · [Design](../DESIGN.md)
