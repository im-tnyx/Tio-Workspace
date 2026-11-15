# Phase 1.1 — Expo UI shell (implementation PR)

**Status:** Approved **for separate implementation PR review only**; not merged, tested on devices, deployed or approved for Auth/data. See [task record](../.ai/tasks/phase1/local-20261114-expo-shell.md), [ADR-015–018](09-DECISIONS.md), [Design](../DESIGN.md).

## What is scaffolded

- Expo SDK 58, React Native 0.88.1, TypeScript, Expo Router under `src/app/`.
- Tnyx / `com.tnyx.tio` iOS/Android configuration and **portrait-only** preference (native device verification pending).
- Four root mock tabs: Home, Workout, Library, You; Standard full-width bottom navigation from ordered tab config. Nested screen routes hide the dock.
- Root compact TopBar revealed by shared scroll coordinator; nested TopBar/back immediately present.
- Central neutral tokens and System(default)/Light/Dark, Glass(default)/Solid preferences. Device accessibility/Glass fallback and persisted UI-only settings; no workout storage.
- English-only placeholder copy, system fonts, centralized strings and locale-aware formatting seams; dumb screens and common UI primitives.
- TypeScript, ESLint, pure shell tests and a CI workflow. **Committed npm lockfile generated on GitHub runner**, with `npm ci` in CI for repeatable dependency installation; native validation and complete CI pass are still required.

## Excluded and unimplemented

No live login/signup, OTP, account binding, encryption, database, real workout editor or saving, server, subscription, AI, backup, Sync, deployment or production icon. These screens are **only preview placeholders**. No Color picker, Pill style, Hindi/Custom Font selectors or landscape layout.

## How to validate after installing Node.js 22.13+

```sh
npm install
npm run expo:check
npm run typecheck
npm run lint
npm test
npm run start
```

Run on physical Android/iPhone before accepting visual, blur, keyboard, safe-area or orientation claims. Use the current SDK-matched Expo Go or development build; Expo SDK 58's transition may require a development build. **No device results are yet recorded**.

## Required review

Verify static architecture and mock-only behavior first; ensure no SDK/storage/Auth imports, no network uploads and no secret files. Then independent reviewer evaluates the actual PR HEAD. CI results are reported only when observed, not inferred. Merge and Phase 1.2 Auth work need **separate owner approvals**.

## Phase 1.1 onboarding entry (owner refinement, 2026-11-14)

- The first app screen is **TNYX** in uppercase with **one filled GET STARTED button** and a separate text-only **“Already have an account? Log in”** line directly below it, on minimal neutral light/dark background. Only **Log in** is tappable within that line, opening the nonfunctional sign-in preview. No login fields, feature tabs, logo asset or promotional elements on Welcome.
- **GET STARTED → Sign up form preview** (latest owner direction). The form includes Email and Password using the existing shared `TextField`; entered values remain only in memory while the route is mounted. Pressing Sign up displays an unavailable message rather than creating an account. **Welcome → Log in** still opens the nonfunctional Sign in preview. `/auth` retains the earlier choice-screen preview for existing direct links but is no longer the GET STARTED destination. No Supabase account, OTP, saved session or fake successful entry.
- Real signup/signin flows remain **Phase 1.2 only** and will replace placeholders after separate authorization. Production builds cannot deep-link into preview Home/Workout/Library/You before verified authentication; development-only mock shell navigation is for UI review, with no personal or workout data.
- Onboarding and auth screen copy uses centralized English catalog, system font, System/Light/Dark neutral appearance. No backend, guest mode or workout access is introduced.

### Welcome placement and app-wide button sizing (owner refinement, 2026-11-14)

- **Welcome:** uppercase `TNYX` centered in the remaining main region; its **single filled GET STARTED button anchored at screen bottom** with a text-only `Already have an account? Log in` link immediately below, not next to the heading. GET STARTED opens the separate Sign up form preview; Log in opens the separate Sign in placeholder.
- **Latest shared button tokens (owner refinement):** `controlSizes.buttonMinHeight = 42`, `controlSizes.buttonRadius = radii.pill (999)` (**full pill**) and `controlSizes.buttonHitSlopVertical = 3` in `src/shared/theme/tokens/index.ts`, used by **all shared Button variants**. React Native sizing uses **pt** on iOS and **dp** on Android. Visible height is at least 42; vertical hit slop provides a nominal 48dp touch region (within parent bounds), subject to real-device accessibility verification. Dynamic type may increase control height. Cards and fields keep independent radius tokens.
- **Welcome screen placement (latest owner decision):** iOS and Android Welcome are both **cardless**, with GET STARTED and the text-only Log in line on the plain app background, no border/sheet/surface fill, 16pt/dp horizontal padding, and no extra bottom padding beyond the OS navigation safe-area inset. The 48pt/dp Log in target centers its 23pt text and leaves about 12.5pt of visual space below the text (under the requested 16pt), excluding the mandatory safe area. Welcome remains fixed/non-scrollable and the heading scales down below 620pt/dp display height. Validate real Android 3-button/gesture navigation and large text on devices.
- **BottomTabBar is not the same component as CTA Button**; keep its own height and accessible tap targets. Final visual/safe-area behavior remains subject to device QA and owner sign-off.

### Welcome animated wordmark and bottom actions (owner refinement, 2026-11-14)

- The Welcome wordmark is a **one-shot letter-by-letter `TNYX` reveal** using `TypewriterHeading` (`165ms` per letter), with a neutral circular dot that follows the visible letters and disappears 240ms after the final letter. The full title alone reserves a screen-centered footprint (no ghost dot spacer); the visible dot follows letters as an absolute overlay so the completed `TNYX` is centered without a left offset or wrap. The final wordmark stays static, without looping, network requests or generated AI.
- The decorative brand word is limited to one line and uses screen-width-responsive sizing without OS text-scaling; VoiceOver/TalkBack still receive the stable full `TNYX` heading. iOS/Android **Reduce Motion** skips the reveal, cursor and haptics. Per-letter selection feedback and a softer completion impact use SDK-58-matched `expo-haptics` and fail silently if unsupported or disabled by the OS; **real iPhone/Android behavior requires hardware QA**.
- The **GET STARTED** button remains the only filled Welcome action. A centered **“Already have an account? Log in”** line is directly below, with 8pt vertical separation between action rows; only the underlined **Log in** is a 48pt/dp minimum touch target linking to the **mock Sign in placeholder** (no live Auth). On **both iOS and Android**, no containing Card or bottom sheet is rendered. The shared Button retains its 42pt/dp minimum visible height, pill radius and 3pt/dp vertical hitSlop.
- The earlier Auth choice remains reachable at `/auth` as a static, mock-only preview, but Welcome no longer routes through it. The new Sign up form is **UI-only** (no signup/OTP/auth backend). Device keyboard/accessibility and visual verification remain outstanding.

- **Accessibility review disposition (P2):** On the centered Auth-choice variant, use a safe-area-aware `ScrollView` with `flexGrow: 1` and centered contents when they fit; at large system text sizes and small-phone heights, both Sign in/Sign up choices remain scroll-reachable. The Welcome bottom-actions variant remains independently bottom-anchored. Real iOS large-text accessibility testing remains pending.

## iPhone + GitHub Codespaces: reusable Expo Go launcher (owner convenience request)

- **Use one existing Codespace**, reopen/resume it instead of creating another. Keep the `feat/phase1-1-expo-shell-20261114` branch checked out while previewing PR #11; it is not merged into `main`.
- First check Expo CLI account with `npx expo whoami`; if logged out, sign in once with `npx expo login`. In **Expo Go on the iPhone**, stay signed into the **same Expo account**. A normal Codespace resume does not by itself require a fresh Expo login, although expired sessions/rebuilds can.
- After pulling this branch into the Codespace, open VS Code's **Terminal → Run Task → Start TNYX (Expo Go)**. This uses the repo's `npm run mobile` command (`expo start --tunnel --go`) and keeps Metro running in a dedicated terminal until stopped. Do **not** start a second Metro instance simultaneously. For exceptional Metro cache issues, stop it and use `npx expo start --tunnel --go --clear` manually.
- On iPhone, open the active development server in Expo Go. The **Recently Opened** list is a record of past development URLs, **not new Tnyx app installations or new Supabase user accounts**. Old entries may remain when the tunnel URL changes. The **CLEAR** action in Expo Go clears that recent list; it does not delete this GitHub repository. **The task does not promise a permanent tunnel URL or exactly one recent item.**
- **Pull shortcut (iPhone Codespaces; fixed after VS Code shell quoting error):** after this one-time update has been pulled into the Codespace, use **Terminal → Run Task → Pull Latest TNYX** before starting Expo. The task runs `bash ${workspaceFolder}/.vscode/pull-tnyx.sh` as a VS Code **process task**, with no nested `bash -c` quoting. It checks that the current branch is exactly `feat/phase1-1-expo-shell-20261114`, refuses if there are local working-tree changes, then runs a **fast-forward-only** pull and shows the updated commit. It will **never force, reset, delete, stash, commit or switch branches** for you. On a refusal, inspect the message and resolve it deliberately. After updating/fixing the shortcut, its corrected task definition must first be obtained with a manual `git pull --ff-only origin feat/phase1-1-expo-shell-20261114`. If dependency files changed, run `npm ci` after pulling and before restarting Expo. This task doesn't automatically stop/start Metro.
- The shortcut is a manually selected development task, **not** a background always-on Expo host or a deployment. A stopped Codespace/Metro process must be resumed/restarted. No credentials, tunnel tokens or personal data are written to the repository.

- **Platform rendering limit (Android 3-button navigation):** Android's 3-button navigation area can show an OS-enforced semi-transparent contrast scrim, especially in Expo Go. The Android root view background now follows the resolved TNYX light/dark palette via existing `expo-system-ui` in `AppearanceProvider`; this can remove an app-root mismatch but **cannot guarantee a visually identical system navigation strip**. In Expo SDK 58, the separate `expo-navigation-bar` **native config plugin** (`enforceContrast: false`) requires an Android development/production build and cannot change the Expo Go host app's native setting. Do not hide the 3-button navigation or compromise icon visibility to conceal this difference. Verify 3-button and gesture modes in a standalone Android build; iOS home indicator and bottom spacing likewise need hardware QA. The Android welcome bottom sheet remains removed.

- **Fixed Welcome (owner refinement):** the Welcome route uses a non-scrolling `View` layout, with the animated title centered in the remaining flexible region and cardless bottom actions on both platforms anchored below it. Unlike the separate Auth-choice screen, the Welcome route has no `ScrollView`. On short screens its decorative heading is smaller; confirm the heading and two actions remain visible with larger accessibility fonts on-device. No gesture-driven scroll or bounce on Welcome.

- **iOS corner history (superseded):** the earlier floating-card continuous-curve approximation has been removed after owner feedback. iOS Welcome now uses no container card or corner radius; Android's former bottom sheet has also been removed by the latest owner request. The Welcome screen remains non-scrollable.

## Owner rollback — remove extra Android 3-button navigation configuration (2026-11-15)

- Following the owner's device comparison, the separate `expo-navigation-bar` dependency and native `enforceContrast: false` plugin configuration have been removed. Its `NavigationBar` runtime override, navigation-icon test/helper and the APK-only `eas.json` profile added solely for this experiment were also removed. Android's system navigation strip is again controlled by Android/Expo Go; a slight OS contrast shade can remain and is not treated as an app UI card.
- Existing `expo-system-ui` root background synchronization from the earlier theme refinement is retained. No change to cardless Welcome layout, TNYX typing, routes, iOS design or safe-area handling. Device QA remains outstanding.

## GET STARTED → Sign up form preview (owner refinement, 2026-11-15)

- On both iOS and Android, the Welcome **GET STARTED** button now routes directly to `/auth/sign-up` rather than the old `/auth` choice page. The separate Welcome **Log in** route remains `/auth/sign-in`. Back from direct signup returns to Welcome, with a safe fallback to `/`.
- The form presents a **Create account** heading, **Email** and **Password** fields using the existing reusable `src/shared/ui/TextField.tsx`. That primitive gained optional keyboard/auto-capitalization/secure-entry props without breaking existing callers. Email uses the email keyboard and no automatic capitalization; Password is masked. Autofill is switched off for this mock form.
- The form route stores entered text **only in component-local in-memory state**, never in AsyncStorage, logs, analytics, or a network request. **Sign up** shows the pre-existing unavailable-auth alert, does not submit entered values, create an account, start OTP, or bypass the session gate. A visible notice says not to enter a real password; this is not a credential collector or production signup implementation.
- Auth stage pages use a fixed, non-scrolling, keyboard-avoiding `AuthPreviewPage`, so small screens and the on-screen keyboard need not hide the fields. Welcome remains **non-scrollable**; no changes to its typography, cardless buttons or Android system navigation bar.
- Physical iOS/Android form layout, dynamic text, keyboard, screen-reader and credential-autofill behavior still need verification. Real auth is excluded from Phase 1.1 and requires a separate owner decision.

## Reusable Sign in / Sign up form (owner refinement, 2026-11-15)

- Both `/auth/sign-up` and `/auth/sign-in` now render exactly the same presentational `AuthCredentialsScreen`, selected via a typed `mode: 'sign-up' | 'sign-in'` prop. Shared `TextField` instances keep the same Email/Password field geometry, secure password masking, keyboard configuration and non-autofilling preview behavior.
- In Sign up mode only the heading (Create account), description, primary button (Sign up), and preview notice differ from Sign in mode (Sign in heading and button, sign-in description/notice). These strings are centralized in `src/shared/i18n/en.ts`.
- Routes own transient in-memory text and show an unavailable-auth alert on action; they neither authenticate nor submit/store credentials. The user is warned not to enter a real password. Back from a direct sign-in link falls back to Welcome, consistent with direct sign-up.
- The redundant earlier `SignUpScreen` was removed; auth choice remains a separate optional mock page and the Welcome entry routes remain unchanged. No Phase 1.2 auth backend or session behavior implemented. Android/iOS device keyboard/large-text and screen-reader QA remain pending.

## Borderless auth header (owner screenshot refinement, 2026-11-15)

- Both Sign up and Sign in use the same plain header in `AuthPreviewPage`: an accessible 48pt/dp **icon-only back chevron** and the short screen title, with **no visible "Back" text, enclosing card, or header border**. The arrow still announces **Back** to screen readers. Form heading, email/password fields, keyboard scrolling and preview-only auth behavior remain unchanged.
- The shared `TopBar` used elsewhere stays untouched; this is restricted to auth preview routes. Real device/iOS and Android visual accessibility testing remains pending.

## Borderless auth screen reference refinement (owner screenshot, 2026-11-15)

- Sign up and Sign in reuse the **same** `AuthCredentialsScreen`, with a reference-inspired minimal layout: one plain back arrow at top, a single large heading, muted explanatory copy, oversized Email/Password placeholders and **no border, underline, input card, or filled field background**. The reusable `TextField` now supports an opt-in `variant="bare"`; default outlined fields elsewhere are unchanged. Labels remain accessible through `accessibilityLabel` even though the bare fields omit separate visible field labels.
- The current stage's action and warning sit toward the bottom when space allows; the shared auth page has **no ScrollView**, and the native keyboard-avoiding layout moves the form without changing its top header. Small-screen/accessibility behavior must be checked in Expo Go on devices.
- The visual reference shows a **Use phone** action, which is not implemented. A later owner-approved UI preview adds a code entry step but **never sends or verifies an OTP**, authenticates, or transmits credentials. Warning not to enter a real password remains visible. Welcome screen and Android navigation styling unchanged.

## Fixed non-scrolling email → OTP preview → password flow (owner direction, 2026-11-15)

- Sign up and Sign in share **one fixed non-scrollable auth layout** and the same presentational `AuthCredentialsScreen`. Only the current stage renders (Email → OTP → Password); no `ScrollView` exists in `AuthPreviewPage`. The back arrow returns to the previous stage before exiting to Welcome. KeyboardAvoidingView and compact spacing aim to preserve the single field and CTA above the keyboard; short phones, large accessibility text and Android keyboard-resize still require hardware QA.
- The Email input uses a **soft muted placeholder** `tom@example.com`, in a borderless reusable `TextField variant="bare"`. Placeholder colors are softer than the input text in both light and dark appearances, while outlined fields elsewhere keep their existing style. The OTP demo input uses the same bare field, a numeric keyboard, a six-character maximum and the placeholder `000000`. Password is masked and shown only at the final step.
- **No OTP is sent, verified or accepted as proof of ownership**; any six digits are accepted strictly to navigate through the UI preview. The on-screen wording explicitly says no code was sent or verified. Email input is only checked for a simple shape and stays in component-local memory. The final Sign up/Sign in button shows `authComingLater` instead of creating an account or session; password is cleared after this alert action. **Do not enter real credentials**. Real Email OTP, authentication, persistence and network calls remain excluded from Phase 1.1.
- On the Password stage the copy differs for Sign up (Create a password) and Sign in (Enter your password); the three steps otherwise share layout. The current stage button is disabled until the UI-only email shape, six digit code length, or nonempty password test passes; these are not security checks.

## Keyboard focus and fixed auth header correction (owner feedback, 2026-11-15)

- The previous auth page changed its **top** safe-area padding when the keyboard showed, visibly moving the back arrow/header. `AuthPreviewPage` now keeps the entire 54pt icon-only back header **outside** the `KeyboardAvoidingView` with constant top safe-area padding. Only the fixed form section below the header responds to the keyboard. No `ScrollView` is reintroduced; final short-device and large-text keyboard testing remains outstanding.
- The existing reusable `TextField` now passes through `autoFocus` and removes the Android default underline. Email, OTP and Password stages each mount a distinctly keyed, auto-focused input. Advancing/backtracking between steps no longer forcibly dismisses the keyboard; it is dismissed only on exit or the terminal preview action, reducing flicker and preserving numeric/password keyboard choice.
- The Email stage now includes the subdued helper **"We'll send you a verification code when authentication is available."** This is intentionally future-tense: the prototype does **not** send or verify a real OTP, and the clear preview-only warning remains visible beneath Continue. No username, backend, signup, session, or data storage was added.

## Sign in and Forgot password — distinct preview flows (owner reference, 2026-11-15)

- **Sign up remains unchanged:** Email → six-digit OTP *UI demo* → Create a password. No OTP is sent/verified and no account is created.
- **Sign in is now Email → Password**, without an OTP stage. After entering an email and pressing Continue, the Password screen keeps the entered email visible **above** the reusable borderless password input, similar to the supplied reference. The fixed top header has a **Forgot password** text button at the upper-right only on this Sign in password stage. Back returns to Email; neither stage has a `ScrollView`.
- Pressing **Forgot password** opens a *local UI preview* with **Confirm your email address → six-digit reset OTP demo → Create new password**. The confirmation field is prefilled from Sign in but editable; no reset email or code is actually sent. Any six digits only change the visible preview stage and are **not verification**. The final Reset password action clears the demo password and explains that **no password was changed**. Back traverses the recovery steps and returns to the Sign in Password screen.
- Inputs remain auto-focused on stage changes, with the constant-safe-area back header outside the keyboard-resizing form. All fields stay in component-local state only; there is no network, recovery service, user lookup, OTP service, persistence, account creation, credential validation, or authorization. Preview warnings advise against real passwords.
- The earlier document's shared Email → OTP → Password sequence described an earlier iteration; this section **supersedes that description for Sign in**. Verify field position, keyboard avoidance, large-text behavior and the new top-right button on iOS and Android physical devices. PR remains Draft/unmerged.

## Auth keyboard CTA motion and soft disabled styling (owner screenshot, 2026-11-15)

- The auth page previously **switched bottom padding after `keyboardDidShow`** while iOS's `KeyboardAvoidingView` was already responding to the opening keyboard. This second JavaScript-driven layout update could make the Continue button visibly snap. Removed the keyboard show/hide state and used a **constant bottom safe-area inset**, leaving keyboard displacement to the platform keyboard-avoiding view. The fixed, icon-only top header stays outside the keyboard-resizing container. No scrolling or new keyboard dependencies introduced. Actual keyboard motion still needs testing in Expo Go on iPhone and Android.
- The shared `Button` gains an opt-in `disabledTone="soft"` used **only on auth previews**, with charcoal disabled backgrounds and grey labels; all existing callers continue using their previous disabled opacity. Empty `TextField variant="bare"` placeholders are a little fainter, without changing entered text color or outlined fields elsewhere. Auth shades are centralized in `authPreviewMuted` under the theme tokens, including matching light-mode colors, with a regression test.
- When a valid address/code/password is entered, Continue retains the regular enabled primary-button styling. No OTP service, account action, user data persistence or password recovery logic was activated.

## Owner update: 46pt onboarding buttons, strict new-token CI and tighter keyboard CTA (2026-11-15)

- The shared `Button` now accepts a semantic `size="onboarding"` variant backed by `controlSizes.onboardingButtonMinHeight = 46`. All Welcome/GET STARTED and auth Continue/Sign up/Sign in/Reset password CTAs use that variant. Buttons elsewhere default to `size="app"` with the original 42pt minimum. Larger user fonts can increase the actual rendered height; this is a minimum, not a maximum.
- The new `scripts/check-design-tokens.cjs` CI guard parses **all `src/**/*.ts(x)`** files (excluding the token definitions themselves) using TypeScript AST, and fails when new raw `#hex`, `rgb(...)`, CSS named colors, or numeric style dimensions are introduced instead of imports from `src/shared/theme/tokens/`. It runs a self-test then checks the project in the existing GitHub Actions shell workflow and `npm run verify`. The immutable comparison commit `b8e0250f5b7973b5798399d40fb67b1aa241dcbf` records pre-existing literals, which are **grandfathered, not endorsed**: cleanup of that existing design-token debt should be a separate task. CI checkout fetches history so the baseline can always be inspected; moving/rewriting the baseline is not part of this feature.
- iOS auth-only keyboard gap: the CTA now sits after the preview warning (which has been moved **above** the action, never removed), so its bottom edge can reach the keyboard instead of leaving the notice's full height below it. `AuthPreviewPage` listens to `keyboardWillShow/WillHide` and calls `Keyboard.scheduleLayoutAnimation` so keyboard-aware bottom inset changes join the system animation; while the keyboard is up the bottom padding is `spacing.sm` (8pt), restored at the owner's request, returning to full safe-area clearance when closed. The back header stays pinned and the page remains non-scrollable. iPhone/Android keyboard-motion validation is still pending.

- **Owner correction:** Restored the prior keyboard-visible bottom padding from `spacing.xs` to `spacing.sm` (8pt). Button/header behavior, `KeyboardAvoidingView`, and the warning-above-CTA layout were not modified in this rollback; the reported motion-versus-gap issue needs separate physical iPhone verification. Do not attribute it solely to padding.

## Fixed in-place Sign in email → password expansion (owner refinement, 2026-11-15)

- On **Sign in only**, the initial heading is **Enter your email** (not "Enter your email address"), with **no introductory description**. The existing soft `tom@example.com` borderless Email field sits close beneath a **single-line reserved heading** in both stages, with no wasted second-line space.
- After a valid email and Continue, the heading changes **in place** to **Enter your password**. The same keyed, controlled Email `TextField` remains mounted in exactly the same field group at the same vertical position, with the entered email visible. A masked, auto-focused reusable Password `TextField` is **added below** it. The email input remains editable while focus transfers, preventing a forced keyboard close/reopen between stages. No route transition, new page animation, ScrollView, header movement, or extra description. `Forgot password` continues to appear top-right on the password stage and its existing mock recovery flow is unchanged.
- `authPreviewLayout` theme tokens define the reserved Sign in title slots for regular/compact sizes; existing heading font and button-size variants remain. Sign up still follows Email → demo OTP → Password with its original copy. **No authentication, OTP verification or credential persistence**; preview warning remains above the CTA. Check the transition and keyboard focus in Expo Go before considering iPhone/Android UX verified.

## Restore auth CTA-to-keyboard clearance (owner refinement, 2026-11-15)

- The earlier switch placing the `UI preview only` notice **above** the Continue CTA made the button appear too close to the open keyboard. The notice is now back **below** the button, with `spacing.md` separating them. The notice remains visible and honest; its height provides the prior breathing room between the CTA and keyboard.
- No change to `AuthPreviewPage` keyboard handling or bottom inset, fixed top header, 46pt onboarding CTA, 42pt app CTA, input focus, Sign in layout, design tokens, or mock auth functionality. Physical-device keyboard spacing and motion verification remains pending. This section supersedes the older note-above-CTA descriptions.

## Compact Sign in heading-to-email spacing (owner refinement, 2026-11-15)

- The earlier attempt to avoid Email → Password layout movement reserved a **two-line heading height** (92pt normal, 78pt compact), which created an obvious empty gap between **Enter your email** and the Email input. This is now a **single-line heading slot**, 46pt normal or 39pt compact, defined in the shared `authPreviewLayout` tokens.
- On Sign in only, the heading uses `numberOfLines={1}` with `adjustsFontSizeToFit` so **Enter your email** and **Enter your password** fit the *same* slot even on narrower screens, preserving the email input's location as the password input appears underneath. The form's sign-in heading-to-field gap uses `spacing.lg` (16pt), not the generic 24pt; Sign up and recovery layout remains unchanged.
- No change to keyboard padding, CTA positioning, disabled shades, mock preview notices, 46pt onboarding button minimum, 42pt app button minimum, or the no-real-auth limitation. Real device visual confirmation, particularly large accessibility text and narrow screens, remains necessary.

## Persistent auth chrome outside Welcome (owner refinement, 2026-11-15)

- **Scope: after Welcome only.** The approved Welcome page and its cardless bottom CTA/typewriter remain completely unchanged. Sign up, Sign in and Forgot password continue to use the existing `AuthPreviewFlow` and one `AuthPreviewPage` instance per route.
- The **same mounted parent** `AuthPreviewPage` owns the fixed safe-area back header (with contextual Forgot password when applicable), the non-scrolling keyboard-adjusted layout, and a **single persistent bottom CTA/preview-warning footer**. The child `AuthCredentialsScreen` now renders **only the middle stage content** (heading, helper, Email/OTP/Password inputs). Step changes update the parent's CTA label, disabled state, warning and optional top-right action through props; they do **not** replace the header/footer or navigate to a new route.
- The bottom note keeps its original position **under** the 46pt onboarding button and reserves a minimum three-caption-line space via `authPreviewLayout.footerNoticeMinHeight`, preventing variable preview-message lengths from pushing the CTA around between stages at normal font sizes. Accessibility text scaling may legitimately grow beyond this minimum rather than truncating safety copy.
- Existing iOS keyboard-will-show/will-hide padding behavior, the 8pt keyboard-open inset, Android keyboard behavior, Sign in's retained Email field, Forgot password preview, CTA disabled style, and 42pt app-internal buttons are unchanged. No real OTP, signup, session or recovery. New pure test asserts the parent/middle/Welcome boundary. **Physical iPhone and Android keyboard animation QA is still required**; persistent React components reduce remount/reflow causes but cannot promise zero platform keyboard motion.

## Equal auth footer side/bottom gutter, including after preview copy removal (2026-11-15)

- This applies to **post-Welcome auth routes only**. The persistent `AuthPreviewPage` now uses the **same `spacing.lg` (16pt)** for horizontal spacing and the bottom spacing of the footer in both iOS keyboard states. While the keyboard is visible, the logical bottom gutter is exactly 16pt above the keyboard; when hidden, the 16pt gutter is **in addition to** the OS bottom safe-area inset. That avoids confusing the needed home-indicator clearance with the design gutter. iOS changes the inset during `keyboardWillShow/WillHide` with native-layout timing; the fixed header, non-scrolling middle, 46pt CTA, 42pt in-app buttons and unchanged Welcome are preserved.
- The `UI preview only` notice below the button is explicitly **temporary**: `footerNotice` is optional and its minimum-height slot is rendered only while copy is supplied. Removing it later does **not** remove or change the parent's 16pt side and bottom padding. Currently every auth-preview stage still supplies its safety warning, and no preview copy has been removed.
- On Android, the system resizes the app around the keyboard; the fixed safe-area parent continues to use the OS bottom inset. Real-device visual QA is required to confirm the apparent keyboard-to-footer distance under Android navigation modes. Static contract tests assert the shared token, optional notice and parent/footer structure; tests cannot guarantee native keyboard animation smoothness.

## Auth preview screenshot follow-up — equal footer gutter (2026-11-15)

- The owner's iPhone screenshot showed excess visible gap above the keyboard: temporary **UI preview only** copy was below Continue. The same persistent auth footer now places the notice **above** its button; Continue sits last, with **16pt/dp bottom** spacing against the visible keyboard, equal to its **16pt/dp left and right** gutters. When the keyboard is hidden the system safe-area inset is additional. Welcome and other screens stay unchanged.
- A three-line **minimum-height** warning slot prevents normal Email to Password notice changes from shifting the CTA. Avoid duplicate iOS keyboard-will-show JS animations when switching focused field type while the keyboard is open. Native keyboard geometry may still change; real iPhone testing is required before claiming completely smooth motion.
- Sign in, Sign up and recovery remain **non-scrolling**. On especially small phones with maximum text scaling, some content may not fit above the native keyboard; that review finding remains open pending actual device QA. No forced truncation of security notices or input fields is introduced.
- Android system Back uses the same step-aware handler as the on-screen arrow, scoped to the focused route. The OS may first dismiss the keyboard; the next Back then navigates the preview step. Real Android hardware/gesture tests remain necessary.
- No live Auth, OTP, Supabase, storage, network calls, deployment, or merge. Current-HEAD CI and independent review remain gating.


## Single-owner keyboard motion + compact auth footer (2026-11-15; supersedes previous timing description)

- Owner confirmed excess space between the warning and CTA and an iOS CTA movement mismatch. Replaced the 57pt minimum preview warning slot with natural text height, reduced the warning/button gap to 8pt and used identical truthfully worded temporary safety copy across all mock-only stages. The notice stays **above** the persistent CTA.
- The earlier JS `keyboardWillShow`/`keyboardWillHide` state, safe-area padding toggle and `Keyboard.scheduleLayoutAnimation` duplicated the keyboard avoidance animation. Removed these; native `KeyboardAvoidingView` is the only iOS keyboard layout owner. The fixed iOS home-indicator safe inset is now on an **outer wrapper** so the KAV measures its effective area; the inner CTA bottom gutter remains 16pt, equal to both side gutters. Android retains its existing resize/safe-area calculation.
- On Sign in, the retained Email input now explicitly regains focus when returning from Password; `autoFocus` on an already-mounted input was insufficient. Preview-only, no real auth/email/OTP/password storage, and no scrolling or Welcome redesign.
- Static CI must be observed on the new commit; iPhone Expo Go video/device QA is needed to assess whether native keyboard motion is visually synchronized. Small-phone extreme font scaling remains an unverified accessibility constraint with non-scrollable screens.


## Password eye visibility toggle (2026-11-15)

- In Phase 1.1 mock-only auth, any `TextField` marked `secureTextEntry` now shows a **right-side eye/eye-slash button** inside the same 60pt field row. It starts hidden, tapping shows the entered password, tapping again hides it. The same reusable behavior covers Sign in, Sign up and Forgot password / New password.
- A 48pt minimum touch target, centrally defined neutral icon geometry and localized English `Show password`/`Hide password` screen-reader labels make the control operable in light/dark themes; icon is created from React Native primitives without a new dependency. Email and OTP fields never render the eye, and an uneditable password cannot toggle visibility.
- Controlled input value and focus ref stay mounted; toggling does not submit, log, persist, transmit or verify passwords. No new route, scrolling, keyboard positioning, real Auth, Supabase, cloud or merge. Native iOS/Android visibility, focus and keyboard animation still require device QA.


## Native keyboard-frame auth footer correction (2026-11-15; overrides earlier KAV assumptions)

- The owner observed that the prior nested `KeyboardAvoidingView` caused Continue to remain at the bottom while the iOS keyboard opened. This is actual native feedback, not a CI simulation; the former prediction that KAV alone would synchronize was incorrect.
- The fixed, non-scrolling post-Welcome auth screen now listens to **one** iOS `keyboardWillChangeFrame` event. It computes screen-height minus native keyboard `endCoordinates.screenY`, requests `Keyboard.scheduleLayoutAnimation(event)` using the native event timing, and applies that overlap to the footer's parent bottom inset. Thus keyboard-show, keyboard-hide and email/password keyboard-height changes have the same position source.
- Bottom spacing is `keyboardOverlap + 16pt` while open, or `safeArea.bottom + 16pt` while closed. Side gutter stays 16pt. Warning stays above CTA with 8pt gap, identical text across preview steps. Android still uses system resizing. Header stays fixed, no scroll.
- Added pure screen-geometry tests. The iPhone keyboard/CTA motion is **not device-verified** for this commit; review and physical Expo Go check are required. No auth backend, Expo dependency change, Supabase, storage, merge or deployment.


## Initial autofocus keyboard overlay regression — listener-first, absolute CTA (2026-11-15)

- The owner reports that on iPhone Continue still remains under the keyboard on the latest CI-green HEAD. Independent Codex review found a concrete cause: native `TextInput` autofocus can trigger the first keyboard event **before** a passive `useEffect` installs the only `keyboardWillChangeFrame` listener. In that case the keyboard inset remains zero; successful TypeScript/unit checks do not prove keyboard movement.
- New layout registers iOS **will-show, will-change-frame, did-show fallback, will-hide, did-hide** listeners within `useLayoutEffect`, reconciles already visible `Keyboard.metrics()`, and only then mounts the child stage with its auto-focused TextField. This prevents the initial notification from racing the subscription; the DidShow fallback recovers missed Will notifications. The scheduled layout animation uses the native event for changed inset values.
- The single persistent footer is now **absolutely anchored** independently of middle form height: `bottom = max(keyboardInset, safeArea.bottom) + 16pt`, with 16pt left/right gutters and 8pt gap above the CTA to the compact safety notice. The top header remains fixed; the screen stays **non-scrolling**, the password eye and one static preview warning stay intact. No other feature screen is changed.
- Device confirmation remains required: iPhone Expo Go keyboard show/hide, email→password, repeat focus, safe-area alignment, small-phone accessibility limits. This change is not real Auth or OTP, not a backend or native deployment, and PR #11 remains subject to owner-only merge approval and independent review.
