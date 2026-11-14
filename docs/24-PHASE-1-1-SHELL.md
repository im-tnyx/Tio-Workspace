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

- The first app screen is exactly **TNYX** in uppercase and **one GET STARTED button**, on minimal neutral light/dark background. No login fields, secondary text, feature tabs, logo asset or promotional elements on Welcome.
- **GET STARTED → Sign in / Sign up choice screen**. Choices open explicitly nonfunctional placeholders in Phase 1.1: no Supabase account, OTP, stored session or fake successful entry.
- Real signup/signin flows remain **Phase 1.2 only** and will replace placeholders after separate authorization. Production builds cannot deep-link into preview Home/Workout/Library/You before verified authentication; development-only mock shell navigation is for UI review, with no personal or workout data.
- Onboarding and auth screen copy uses centralized English catalog, system font, System/Light/Dark neutral appearance. No backend, guest mode or workout access is introduced.

### Welcome placement and app-wide button sizing (owner refinement, 2026-11-14)

- **Welcome:** uppercase `TNYX` centered in the remaining main region; its **single GET STARTED button anchored at screen bottom**, not next to the heading. Sign in/Sign up choice is a separate, centered screen and remains mock-only.
- **Latest shared button tokens (owner refinement):** `controlSizes.buttonMinHeight = 42`, `controlSizes.buttonRadius = radii.pill (999)` (**full pill**) and `controlSizes.buttonHitSlopVertical = 3` in `src/shared/theme/tokens/index.ts`, used by **all shared Button variants**. React Native sizing uses **pt** on iOS and **dp** on Android. Visible height is at least 42; vertical hit slop provides a nominal 48dp touch region (within parent bounds), subject to real-device accessibility verification. Dynamic type may increase control height. Cards and fields keep independent radius tokens.
- **Welcome screen padding:** exact **16pt/dp left + right** (`spacing.lg`) and **16pt/dp below the CTA above the bottom safe-area boundary** (`insets.bottom + spacing.lg` from the physical edge); this is the same 16pt design spacing on all three sides and dynamically clears the iOS home indicator. CTA fills the available phone width (no artificial 400pt cap). The TNYX heading stays centered in the main available region.
- **BottomTabBar is not the same component as CTA Button**; keep its own height and accessible tap targets. Final visual/safe-area behavior remains subject to device QA and owner sign-off.

### Welcome animated wordmark and bottom action card (owner refinement, 2026-11-14)

- Replace the static Welcome wordmark with a **one-shot letter-by-letter `TNYX` typewriter reveal** using the shared `TypewriterHeading` component (`165ms` per letter), with a short visible cursor that disappears on completion. The final wordmark stays static; it does not loop or make network/AI requests.
- The animated text reserves the full wordmark's layout footprint so the screen does not jump. VoiceOver/TalkBack receive the stable full `TNYX` accessibility heading rather than individual letters; iOS/Android **Reduce Motion** shows the full word instantly.
- The **GET STARTED** button remains the only Welcome action, now **inside the shared neutral `Card`** with a subtle border/surface; the card is bottom-anchored with the previously selected **16pt/dp left/right and 16pt/dp + bottom safe area** outer padding. The **button itself** retains global **42pt/dp min height**, full-pill radius and 3pt/dp vertical hitSlop.
- Auth choice remains a **static centered TNYX heading with Sign in/Sign up mock-only options**, no signup/OTP logic, and no new functional features. Device visual and reduced-motion verification remain outstanding.

- **Accessibility review disposition (P2):** On the centered Auth-choice variant, use a safe-area-aware `ScrollView` with `flexGrow: 1` and centered contents when they fit; at large system text sizes and small-phone heights, both Sign in/Sign up choices remain scroll-reachable. The Welcome bottom-card variant remains independently bottom-anchored. Real iOS large-text accessibility testing remains pending.
