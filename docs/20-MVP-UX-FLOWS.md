<div align="center">

# 📱 MVP Screens & User Flows
**Design the offline workout experience before building screens.**

![Status](https://img.shields.io/badge/FUNCTIONAL%20SCOPE-OWNER%20SELECTED-6D5EF8?style=flat-square)

[← Docs hub](00-INDEX.md) · [🎨 Design system](../DESIGN.md) · [🎯 Requirements](01-PRODUCT-REQUIREMENTS.md)

</div>

> [!NOTE]
> The **functional MVP screen scope** (Auth, Home, Exercises, Plans, Workouts, History, Progress, Settings) is owner-selected (ADR-011), with **no account switching**. This is a text-first UX specification. No Figma file, final icon, screenshot or running prototype exists. Visual tokens in [DESIGN.md](../DESIGN.md) are proposals, not implemented components.

## 01 · Owner-selected root navigation (ADR-015)

```mermaid
flowchart TD
  S["Session gate"] -->|Server-eligible same UUID, protected local safety and session policy pass| Dock["Configured bottom nav - initial four roots"]
  S -->|First signup / signed out / mandatory cloud or local safety pending| Auth["Auth / pending setup"]
  Auth -->|New: Email then OTP then Password then required cloud profile| Eligible["Trusted server eligibility"]
  Auth -->|Existing: Email then Password, same server-eligible UUID| Eligible
  Auth -->|Password complete, required cloud field missing| CloudPending["Resume first missing mandatory cloud field"]
  CloudPending --> Eligible
  Eligible -->|Protected same-UUID binding, key and encrypted store| Ready["Device-local safety"]
  Ready -->|Uninterrupted first setup| Fitness["Required local fitness fields then Final Setup"]
  Fitness --> Dock
  Ready -->|Valid same-user return; fitness may remain pending| Dock
  Auth -->|Different UUID| Denied["Account mismatch - blocked"]
  Dock --> Home["Home - root"]
  Dock --> Workout["Workout - root"]
  Dock --> Library["Library - root"]
  Dock --> Progress["Progress - root"]
  Home --> Active["Active Workout - nested, dock hidden"]
  Workout --> Plans["Plans / Plan Editor - nested"]
  Workout --> Active
  Workout --> History["History - nested"]
  Library --> Exercise["Exercise detail / editor - nested"]
  Home --> Profile["Profile - nested via Home TopBar action"]
  Profile --> Settings["Settings - nested"]
  Settings --> Appear["Appearance: Glass/Solid, System(default)/Light/Dark"]
  Settings --> Backup["Personal Backup - later"]
  Settings --> Sync["Paid Sync - future"]
```

**Initial configured root tabs:** **Home, Workout, Library, Progress** (four for this MVP). This is a **Standard full-width bottom navigation bar now**, not a floating Pill or modal sheet. Its **material is default iPhone-inspired translucent Glass**, so **Standard + Glass** has background showing through; Solid is the separate Settings preference. A **Pill layout is a later presentation option, not included or user-selectable now**. The shared bar must consume an ordered **tab registry/config** so future owner-selected fewer/more/reordered roots work without hardcoded screen logic. The current Standard bar persists while scrolling configured root screens and hides on Active Workout, Plan Editor, History, Profile, exercise details, Settings, Backup and all non-tab/Auth/nested/full-screen routes. **Root compact title chrome remains scroll-revealed**; the Home TopBar profile action must remain directly reachable when Home opens, without requiring a scroll solely to reach Profile. Nested routes show shared compact/back TopBar immediately. Exact UI implementation needs separate approval; the current Expo mock remains unchanged. Workout links plans/history/session, Library has exercise lookup, Progress is a root, and Home's TopBar profile action opens the nested Profile screen with Settings and the incomplete-profile pill.

### Shared shell and theme choices (owner-selected)

- Settings → Appearance: **System(default), Light, Dark** and independent **Glass(default)/Solid**. System follows OS changes; manual overrides persist. Six preference combos resolve to four rendered material × Light/Dark states. No duplicate per-screen theme decisions.
- One **TopBar** takes the reference's rounded/translucent grouped style without copied branding or unapproved search/notifications. On root tab screens the compact TopBar is **hidden initially**, revealing **after scrolling** via centrally owned threshold/reduced-motion-friendly transition and hiding when back at top. On nested screens it is **visible immediately** with back affordance.
- One **BottomTabBar** draws the current **Standard safe-area-aligned, full-width bar**, with default background-translucent **Glass** or Settings-selected **Solid** material at any root scroll position. Its destinations come from the future **app-owned ordered tab config** (initial Home/Workout/Library/Progress, changeable later), not a four-slot constant; optional floating **Pill** is a later layout variant. All shared fields, buttons, cards, sheets, switches/selects and text use `src/shared/theme/tokens/` in light/dark.
- Future `src/shared/theme/tokens/` supplies tokens, `src/shared/ui/` supplies shared primitives, `src/app/` owns routes/tab visibility and shared scroll TopBar coordinator; features compose them. **Every screen stays dumb** (view state/props and callbacks only), with async/state orchestration in feature hooks/controllers, business rules in domain/application and SDK/I/O in data/platform. See [module architecture](10-REPOSITORY-STRUCTURE.md). **Future paths only**.
- Glass uses readable tinted translucent/blurred surfaces with borders; Solid uses opaque equivalents. Validate iOS/Android text contrast, keyboard/safe areas, 44pt/48dp touch targets, dynamic type and reduce-transparency/high-contrast fallback after implementation. If blur unavailable, render Solid fallback without changing saved preference.

**Config-driven tab contract (owner-selected architecture, not an active management screen):** future app shell supplies ordered root-tab descriptors with stable keys, accessible icon/label, valid destination and root/nested visibility. `BottomTabBar` accepts descriptors and a layout variant; Standard is the initial product selection, Pill reserved for later approval. No per-screen tab list, duplicated navigation logic, implicit extra tabs or user-facing tab editor in MVP. A count change may require new real destination screens and a separate reviewed product decision. Use responsive item distribution, safe-area and keyboard handling; verify 3/4/5+ tab fixtures and larger font sizes without clipped or unreachable tabs.

**MVP English-only, OS/system typography (ADR-018):** No Language/Custom Font picker or Hindi translations/font files yet. Use English message keys and typed screen state, centralized date/number/unit formatters and shared font tokens; do not hard-code text or font decisions in dumb JSX. Future Hindi/other languages and licensed script-aware fonts are independently approved extensions, with UX-15 future test; current English/system-font gate is UX-11.

**Selected UI direction (ADR-016):** Black/White/Gray is Tnyx's **neutral default with no mandatory colored accent**. Neutral navigation selection, progress, CTA and focus must be readable. A **future** Settings → Accent Color picker may let the user choose named colors (Teal `#00BFBF` is just one candidate), but is NOT part of initial MVP. Appearance Light/Dark and Glass/Solid are separate axes; semantic danger/error colors remain. Screenshot is visual reference only, not a UI clone. See [DESIGN](../DESIGN.md), [UX-12/13](08-TEST-PLAN.md).

**Application ID:** `com.tnyx.tio` selected for Android and iOS, subject to ownership/registration verification. Visible name is Tnyx; repo and versioned archive IDs remain unchanged.

**Portrait-only (ADR-018):** every supported phone route including Auth/OTP, root and nested screens, active workout and sheets; no landscape layout or toggle. App/native shell owns orientation, not feature screens. Real Android/iPhone rotation, resume, safe areas/keyboard and iPad/tablet compatibility must be verified before a supported-platform claim.

## 02 · Screen contract

**Owner-approved unified Auth presentation (policy only):** Keep the existing shared Expo Auth preview, its Sign In/Sign Up headings and helper text, typography, Email/Password fields, keyboard/focus behavior, Header/Back, persistent footer/Continue, accessibility, small-screen layout and visual styling. The two lightweight routes may continue to share one component. Selected **Sign Up** starts with Email only; Continue opens six-digit OTP, then successful verification reveals Create Password. Selected **Sign In** starts with Email only; Continue reveals the existing Password field while Email stays visible; `signInWithPassword` is the future normal authentication call, with no OTP or credential mutation. Do not use a public email-existence lookup or automatically switch mode. An email entered on Sign Up needs a generic, non-enumerating response: after fresh OTP, a surviving provisional UUID may securely finish **initial** password enrollment; a safely deleted provisional identity may start fresh; a password-complete account uses explicit Sign In/Forgot Password and must never be re-enrolled. Verify the provider/server mechanism before implementation. **Forgot Password** retains its preview text/behavior and follows Email → recovery verification → New Password → Sign In. Recovery-authenticated sessions may permit direct password updates; UI separation does not solve that Auth-level risk. No new screen, visual redesign or working Auth is implied.

| Screen | Primary CTA | Offline | Empty/error state |
|---|---|---|---|
| Session gate | Resume existing authenticated user | Yes if account is initialized and locally eligible | Need login / reauth / unavailable key |
| Auth | **Online new Email → OTP → Password → required cloud profile → local fitness onboarding → Final Setup → Home**; returning password login checks server eligibility and same-UUID local safety before the correct destination | No for new signup/verification | Pending/wrong/expired OTP, resend 429/cooldown, no guest, account mismatch denied, network error; OTP session or server eligibility alone cannot open Home/workout DB |
| Home | Start / Resume Workout | Yes | “Create your first plan” / “Start a free workout” |
| Workout (root) | Start/resume, plans and history links | Yes | Empty plans, in-progress resume |
| Exercise Library (Library root) | Browse/search **curated exercises only** in current MVP | Yes, offline curated list | Empty results, choose exercise; **no custom-create screen until future membership, max 50/member** |
| Progress (root) | Workout progress and trends | Yes for eligible local users | Insufficient data; calculations requiring missing fitness inputs request them |
| Plan Editor | Save workout plan | Yes | Missing required exercise fields |
| Active Workout | Log/complete sets | Yes | Autosave/transaction failure and resume |
| History | Open past session | Yes | No logged sessions |
| Profile (nested from Home TopBar) | Account, Settings and incomplete-profile pill | Mostly | Same-UUID account state; pill shown only for verified missing required fields |
| Settings (nested) | Appearance **System/Light/Dark** and Glass/Solid, account, logout and separate erase/reset | Mostly | OS-follow/manual override; **no Language/Custom Font picker in English MVP**, no account switch and reset warning |
| Personal Backup (later) | Optional Back up now / Restore / settings | Needs network for remote upload/download; manual encrypted file workflow depends on platform | OFF by default; last success/progress/failure/quota/recovery states |
| AI Draft (later) | Generate then approve | No | AI unavailable; preserve local session |
| Supabase Sync (future paid membership) | Full-workout-data premium alternative to Personal Backup | Not part of MVP | **Disabled/unavailable now**; when built, Settings offers one choice: Local Only / Personal Backup / Supabase Sync, never both ON |

## 03 · Happy path — first user

1. Welcome → enter Email online → enter and verify the six-digit emailed OTP with Supabase Auth → create the initial Password. OTP verification creates an Auth session but does not grant Home or activated protected cloud-resource access.
2. Complete the proposed required private cloud profile in order: Account Setup (Username required, Mobile optional) → Name → DOB → Sex. Only trusted server evidence of initial password enrollment and validated required profile advances the same UUID to server eligibility; a client `local_complete` signal cannot do so. The private schema and Auth mechanism still require separate approval.
3. After server eligibility is durably recorded, bind that UUID to the installation and complete protected device-local onboarding: Units → Height → Current Weight → Activity Level → Goal → Final Setup. Verify durable encrypted local completion for that UUID. **The uninterrupted first-run Home entry requires server eligibility and full device-local fitness completion; an interrupted return has the separate same-UUID local safety gate described below** under the session policy; no guest workouts or early store unlock.
4. Home offers “Start workout” and “Create plan”.
5. User starts a session, picks exercise, logs repetitions/weight and marks sets complete.
6. App commits changes to local SQLite transactionally. A clear “Saved on this device” indicator appears.
7. User finishes session; History and Progress update from local records.
8. Closing and reopening the app normally returns to Home without sign-in only when the previously verified same-UUID session/offline policy and protected local readiness still permit access.

### Interrupted account and fitness setup

- **Before initial password:** Supabase may hold a provisional Auth UUID, but it is not a completed Tio account. Restart Email + fresh OTP; a surviving provisional UUID can finish secure first enrollment after trusted verification, while a safely deleted UUID starts fresh. OTP expiry alone never deletes the Auth row. A password-complete account is never re-enrolled or silently reset through Sign Up; public responses stay generic.
- **Password complete, mandatory cloud profile incomplete:** after password login or a valid same-user session, resume the first missing Username, Name, DOB or Sex step without Home, duplicate data or UUID change. Verified Email plus those four fields are the mandatory cloud account minimum; Mobile is optional.
- **Cloud profile complete, local fitness incomplete:** an uninterrupted first attempt continues Units → Height → Current Weight → Activity Level → Goal → Final Setup. If interrupted and returning later, allow Home only after the independently verified same-UUID local binding, protected key and encrypted-store safety gate. Show a tappable **Profile-screen** completion pill reached through Home TopBar: “Your profile is 80% finished” with a trailing arrow, where 80% is only an example. Compute saved verified required fields / 10; exclude Mobile, and reserve 100% for a durably verified fitness-completion marker. If all fields are saved but that marker is pending, show a nonnumeric pending state. The pill opens the first missing fitness field or retries final verification, preserves prior answers and disappears only when all required values and full completion are durable. Missing-value calculations request inputs; unrelated safe features remain available. The pill is unrelated to the deferred bottom-navigation Pill layout.
- **Reinstall:** authenticate the same account, recover only its verified cloud profile, then safely initialize the local encrypted store or verify a matching restore. Auth does not restore workouts; do not bind or unlock another UUID. After local safety passes, do not repeat already saved fitness steps unnecessarily.

## 04 · Happy path — no internet at the gym

1. User opens app in airplane mode, previously initialized account is eligible for offline access.
2. Home, Plans, Active Workout, History and Progress work.
3. Login creation, AI plan generation, cloud backup and future sync are unavailable or clearly deferred.
4. UI **does not** queue or upload workout data to the application server unless a future explicit sync setting permits it.
5. Restoring network does not interrupt an active set editor.

## 05 · Critical interactions

| Interaction | Proposed copy | Accessibility/feedback |
|---|---|---|
| First saved set | “Saved on this device” | Short, non-blocking success feedback |
| Offline | “Offline · Workouts still work” | Icon + text, not only colored dot |
| Logout | “You'll be signed out. Your local workouts stay on this device and remain tied to this account.” | Explicit confirmation |
| Local erase/reset | “Erase this device's workouts and unlink this account? Without a backup, they cannot be recovered.” | Separate destructive confirmation; never hidden behind logout |
| No backup | “Backup is off. Clearing app data, uninstalling, or losing this phone can permanently remove your workout history.” | Visible in backup settings and before destructive reset |
| Restore available after fresh login (Personal Backup) | “An encrypted backup is available. Restore it?” — **Restore / Skip** | Ask only after verifying an accessible same-account archive and portable recovery secret; Skip keeps empty/local data unchanged and does not enable uploads. Restore requires final overwrite confirmation. |
| Missing backup settings on fresh install | “No workouts on this device.” + optional “Find existing encrypted backup” | Not an automatic restore prompt; user picks provider, verifies matching archive and may Restore or Skip without enabling Backup/Sync. |
| Future Sync after fresh login | “Downloading your workouts…” | Only if previously opted-in Sync is server-authorized and records are available; hydrate automatically after same-account login. **Never show the Backup Restore prompt/button during Sync hydration**; show truthful offline/error/empty states. |
| Cloud mode change (future) | “Choose one cloud option. Previous cloud copies may still exist.” | Never allow simultaneous Backup + Sync; disclose old copies, obtain consent and verify deletion/handling before asserting exclusive storage |
| Backup failed | “Backup failed. Your workouts are still saved on this device.” | Show reason, Retry and storage guidance; retain last successful backup date |
| AI draft | “Review and edit before saving” | Never auto-apply generated routines |
| Reauth | “Sign in again with the account already linked to this device.” | Do not claim the account was deleted because internet is unavailable |
| Different account login | “This device is linked to another Tnyx account. Sign in with that account; changing accounts is not supported.” | Block before data access; no automatic reset |

**Owner-selected security/limit UX (ADR-017):** required new Email → OTP → Password and no-guest access; target 6 digits/10-minute expiry/60-second resend/5 sends-hour/5 incorrect attempts/15-minute cooldown, requiring real provider/server verification; **CAPTCHA not in MVP**. Password 8–64, required proposed Account Setup Username 3–16 graphemes, program/routine creation max 50/30 (no minimum **creation count**; **saved program/routine names 3–25 graphemes**), sets 1–8. Free Library uses curated exercises; **custom exercise creation reserved for later paid members (max 50)**, with no current paywall or add-custom action. Previously verified same-account offline use retained. See [limits](23-INPUT-LIMITS-OTP-AND-FUTURE-MEMBERSHIP.md).

## 05A · Future paid Sync membership gate

Supabase Sync and any paid membership/paywall are **deferred until after the core workout MVP is complete**. No membership screen or purchase controls in the initial app; later approved Settings must clearly label Sync **Membership required**, not default. Membership purchase alone must not enable upload: a separate informed Sync opt-in is needed to transfer the **complete supported workout dataset**. Basic local workouts and Personal Backup are not gated behind this subscription. Pricing, payments, cancellation and server retention UX need separate authorization and testing.

## 05B · Future backup UI states (WhatsApp-inspired)

The owner-provided iOS/Android screenshots inform **information hierarchy only**, not an instruction to reproduce WhatsApp. Future Settings → Backup needs a visible **Off/default**, provider setup, **Back up now**, last **successful** backup date/size, optional schedule picker **Off/Daily/Weekly/Monthly**, current **Uploading** byte/percentage indicators when measurable, **Failed** reason/Retry/Manage storage, and a user-held encrypted recovery method. Encrypt every backup; no “E2E Off” switch. **Include photos/videos** is shown only if an approved attachment feature exists; it is **not** a workout MVP feature. OS-based automatic timing and iCloud/Drive availability are unverified.

**Clear data distinction:** Normal restart and logout do **not** wipe the diary. Clear storage/reinstall/reset may remove SQLite. After same-account online login, future **Supabase Sync** (if previously opted in, implemented and still authorized) downloads available server data automatically **without Restore Backup UI**; otherwise start with empty local history and optionally offer **Find existing encrypted backup** when settings were lost. A verified Personal Backup archive is **never restored automatically**: present **Restore / Skip**; Skip/cancel makes no changes, and Restore needs explicit overwrite confirmation. Supabase Auth alone has no workout copy. Local Only remains default, and Backup + Sync cannot both be active.

## 06 · Component and state requirements

- Touch-friendly weight and reps controls with unit indicators and number input validation.
- Strong contrast and text resizing; target iOS/Android hit-area guidance.
- Workout autosave shows *local* persistence status, not “Synced”.
- Confirmation for irreversible delete; allow editing an unfinished session after restart.
- Each screen covers `loading`, `empty`, `offline`, `error`, and account-safety states.
- Never expose cached workout data when a different account attempts login; **no identity-switching flow exists**.

**Owner-selected shell (ADR-015, revised):** **initial** four tab roots Home / Workout / Library / Progress in a **Standard full-width layout with default Glass translucency**; Profile is a nested screen reached from Home TopBar, with its action available when Home opens. Future tab count/order remains config-driven and the bottom-bar Pill layout is deferred. Root compact title chrome retains scroll reveal, while the Home profile action remains reachable without a scroll; nested TopBar is immediately visible. Settings-only Solid, System(default)/Light/Dark, portrait-only, centralized theme tokens and dumb screens remain. This revised navigation is documentation policy; the current mock shell still has a You tab and requires a separately approved UI slice. See the [approval pack](22-PHASE-0-DESIGN-AND-PHASE-1-APPROVAL.md).

## 07 · Design acceptance checklist

- [ ] Final home screen hierarchy selected.
- [x] Functional MVP screens and single-account auth/session-gate transitions selected (ADR-011; [session specification](18-OFFLINE-SESSION-STATE-MACHINE.md)); visual design/real-device tests pending.
- [ ] Workout set editor tested for one-handed operation and large text.
- [ ] Exact logout/erase/recovery wording and accessibility behavior reviewed in a design acceptance pass; policy selected.
- [x] Intended iOS/Android configured-root-only Standard Glass bar, initial four destinations, future tab-count/layout extensibility, nested hide and shared TopBar variants recorded (ADR-015); not tested in native builds.
- [ ] Android/iPhone **System(default)/Light/Dark + Glass/Solid**, portrait-only orientation, English-only system fonts, neutral Glass contrast and native fallbacks tested (`UX-08/11/14`). Hindi/custom fonts and accent picker are future-only.
- [ ] All cloud states explicitly distinguish default local-only from later opt-in features.

---

[← Design](../DESIGN.md) · [Session flow →](18-OFFLINE-SESSION-STATE-MACHINE.md) · [Phase 1 readiness →](21-PHASE-1-READINESS.md)
