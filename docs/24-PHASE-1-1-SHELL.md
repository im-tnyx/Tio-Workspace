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
- **Updated shared button tokens (owner refinement):** `controlSizes.buttonMinHeight = 46`, `controlSizes.buttonRadius = 0` (**square/no rounding**) and `controlSizes.buttonHitSlopVertical = 2` in `src/shared/theme/tokens/index.ts`, used by **all shared Button variants**. iOS sizes are in **pt**, Android in **dp**. The visible button is at least 46 tall; hit slop gives an effective 50dp vertical touch region on Android (parent bounds permitting), meeting the 48dp target. Dynamic type can increase height. Cards and fields keep their own separate radius tokens.
- **Welcome horizontal side inset:** `spacing.lg = 16`; **Welcome CTA bottom gap** remains the safe-area bottom inset + `spacing.xl = 24` above the home indicator. CTA width fills the content width, up to 400dp/pt. Full-pill radius is a future option, **not** selected now.
- **BottomTabBar is not the same component as CTA Button**; keep its own height and accessible tap targets. Final visual/safe-area behavior remains subject to device QA and owner sign-off.
