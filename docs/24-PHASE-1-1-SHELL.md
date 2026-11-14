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
- Auth form pages use a shared keyboard-avoiding, scroll-reachable `AuthPreviewPage`, so small screens and the on-screen keyboard need not hide the fields. Welcome remains **non-scrollable**; no changes to its typography, cardless buttons or Android system navigation bar.
- Physical iOS/Android form layout, dynamic text, keyboard, screen-reader and credential-autofill behavior still need verification. Real auth is excluded from Phase 1.1 and requires a separate owner decision.

## Reusable Sign in / Sign up form (owner refinement, 2026-11-15)

- Both `/auth/sign-up` and `/auth/sign-in` now render exactly the same presentational `AuthCredentialsScreen`, selected via a typed `mode: 'sign-up' | 'sign-in'` prop. Shared `TextField` instances keep the same Email/Password field geometry, secure password masking, keyboard configuration and non-autofilling preview behavior.
- In Sign up mode only the heading (Create account), description, primary button (Sign up), and preview notice differ from Sign in mode (Sign in heading and button, sign-in description/notice). These strings are centralized in `src/shared/i18n/en.ts`.
- Routes own transient in-memory text and show an unavailable-auth alert on action; they neither authenticate nor submit/store credentials. The user is warned not to enter a real password. Back from a direct sign-in link falls back to Welcome, consistent with direct sign-up.
- The redundant earlier `SignUpScreen` was removed; auth choice remains a separate optional mock page and the Welcome entry routes remain unchanged. No Phase 1.2 auth backend or session behavior implemented. Android/iOS device keyboard/large-text and screen-reader QA remain pending.
