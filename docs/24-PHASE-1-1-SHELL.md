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
- **GET STARTED → Sign in / Sign up choice screen**. Choices open explicitly nonfunctional placeholders in Phase 1.1: no Supabase account, OTP, stored session or fake successful entry.
- Real signup/signin flows remain **Phase 1.2 only** and will replace placeholders after separate authorization. Production builds cannot deep-link into preview Home/Workout/Library/You before verified authentication; development-only mock shell navigation is for UI review, with no personal or workout data.
- Onboarding and auth screen copy uses centralized English catalog, system font, System/Light/Dark neutral appearance. No backend, guest mode or workout access is introduced.

### Welcome placement and app-wide button sizing (owner refinement, 2026-11-14)

- **Welcome:** uppercase `TNYX` centered in the remaining main region; its **single filled GET STARTED button anchored at screen bottom** with a text-only `Already have an account? Log in` link immediately below, not next to the heading. Sign in/Sign up choice is a separate, centered screen and remains mock-only.
- **Latest shared button tokens (owner refinement):** `controlSizes.buttonMinHeight = 42`, `controlSizes.buttonRadius = radii.pill (999)` (**full pill**) and `controlSizes.buttonHitSlopVertical = 3` in `src/shared/theme/tokens/index.ts`, used by **all shared Button variants**. React Native sizing uses **pt** on iOS and **dp** on Android. Visible height is at least 42; vertical hit slop provides a nominal 48dp touch region (within parent bounds), subject to real-device accessibility verification. Dynamic type may increase control height. Cards and fields keep independent radius tokens.
- **Welcome screen placement (updated):** iOS uses an inset floating Card with 8pt/dp outer side padding, 32pt/dp corners and only a 4pt/dp gap at the physical screen bottom; the iOS home-indicator safe-area inset is **inside** the Card surface, eliminating the black strip beneath it while keeping controls safely above the indicator; Android uses a full-width bottom-attached, top-rounded surface with the navigation safe-area padding **inside** it. Main content stays scrollable at small heights; buttons remain above system controls. The CTA fills the card/sheet content width, and TNYX stays centered in the remaining region. The 16pt/dp internal surface padding remains.
- **BottomTabBar is not the same component as CTA Button**; keep its own height and accessible tap targets. Final visual/safe-area behavior remains subject to device QA and owner sign-off.

### Welcome animated wordmark and bottom action card (owner refinement, 2026-11-14)

- The Welcome wordmark is a **one-shot letter-by-letter `TNYX` reveal** using `TypewriterHeading` (`165ms` per letter), with a neutral circular dot that follows the visible letters and disappears 240ms after the final letter. The full title + dot space is reserved so the heading does not jump or wrap. The final wordmark stays static, without looping, network requests or generated AI.
- The decorative brand word is limited to one line and uses screen-width-responsive sizing without OS text-scaling; VoiceOver/TalkBack still receive the stable full `TNYX` heading. iOS/Android **Reduce Motion** skips the reveal, cursor and haptics. Per-letter selection feedback and a softer completion impact use SDK-58-matched `expo-haptics` and fail silently if unsupported or disabled by the OS; **real iPhone/Android behavior requires hardware QA**.
- The **GET STARTED** button remains the only filled Welcome action inside a dedicated neutral welcome surface; a centered **“Already have an account? Log in”** text line is immediately underneath. Only **Log in** is an underlined, accessible 48pt/dp minimum touch target linking to the **mock Sign in placeholder** (no live Auth). iOS renders the rounded floating card close to the safe-area edge; Android renders a full-width top-rounded bottom sheet. The shared Button retains its **42pt/dp min height**, full-pill radius and 3pt/dp vertical hitSlop.
- Auth choice remains a **static centered TNYX heading with Sign in/Sign up mock-only options**, no signup/OTP logic, and no new functional features. Device visual and reduced-motion verification remain outstanding.

- **Accessibility review disposition (P2):** On the centered Auth-choice variant, use a safe-area-aware `ScrollView` with `flexGrow: 1` and centered contents when they fit; at large system text sizes and small-phone heights, both Sign in/Sign up choices remain scroll-reachable. The Welcome bottom-card variant remains independently bottom-anchored. Real iOS large-text accessibility testing remains pending.

## iPhone + GitHub Codespaces: reusable Expo Go launcher (owner convenience request)

- **Use one existing Codespace**, reopen/resume it instead of creating another. Keep the `feat/phase1-1-expo-shell-20261114` branch checked out while previewing PR #11; it is not merged into `main`.
- First check Expo CLI account with `npx expo whoami`; if logged out, sign in once with `npx expo login`. In **Expo Go on the iPhone**, stay signed into the **same Expo account**. A normal Codespace resume does not by itself require a fresh Expo login, although expired sessions/rebuilds can.
- After pulling this branch into the Codespace, open VS Code's **Terminal → Run Task → Start TNYX (Expo Go)**. This uses the repo's `npm run mobile` command (`expo start --tunnel --go`) and keeps Metro running in a dedicated terminal until stopped. Do **not** start a second Metro instance simultaneously. For exceptional Metro cache issues, stop it and use `npx expo start --tunnel --go --clear` manually.
- On iPhone, open the active development server in Expo Go. The **Recently Opened** list is a record of past development URLs, **not new Tnyx app installations or new Supabase user accounts**. Old entries may remain when the tunnel URL changes. The **CLEAR** action in Expo Go clears that recent list; it does not delete this GitHub repository. **The task does not promise a permanent tunnel URL or exactly one recent item.**
- **Pull shortcut (iPhone Codespaces; fixed after VS Code shell quoting error):** after this one-time update has been pulled into the Codespace, use **Terminal → Run Task → Pull Latest TNYX** before starting Expo. The task runs `bash ${workspaceFolder}/.vscode/pull-tnyx.sh` as a VS Code **process task**, with no nested `bash -c` quoting. It checks that the current branch is exactly `feat/phase1-1-expo-shell-20261114`, refuses if there are local working-tree changes, then runs a **fast-forward-only** pull and shows the updated commit. It will **never force, reset, delete, stash, commit or switch branches** for you. On a refusal, inspect the message and resolve it deliberately. After updating/fixing the shortcut, its corrected task definition must first be obtained with a manual `git pull --ff-only origin feat/phase1-1-expo-shell-20261114`. If dependency files changed, run `npm ci` after pulling and before restarting Expo. This task doesn't automatically stop/start Metro.
- The shortcut is a manually selected development task, **not** a background always-on Expo host or a deployment. A stopped Codespace/Metro process must be resumed/restarted. No credentials, tunnel tokens or personal data are written to the repository.

- **Platform rendering limit:** in Expo Go, iOS home-indicator and Android 3-button navigation colors are partly controlled by the host/OS. Android edge-to-edge visual continuity and navigation contrast scrim must be inspected on a real development/release build; the CSS-like sheet in the Welcome screen is **not** a native modal, and no system-bar overrides are claimed to be tested.
