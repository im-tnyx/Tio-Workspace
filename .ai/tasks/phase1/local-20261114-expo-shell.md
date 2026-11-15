# Phase 1.1 — Tnyx Expo Foundation & UI Shell

| Field | Value |
|---|---|
| Status | In Progress — PR review required |
| Objective | A reviewable, limited Expo/TypeScript skeleton with neutral appearance, root/nested navigation, reusable presentational components, dummy screens and CI |
| Implementation owner | Authorized Phase 1.1 implementation session, connected GitHub `im-tnyx` |
| Previous agent | None for this slice |
| Last commit agent | Current implementation owner; resolve commit SHA from live branch before handoff |
| Tracking / approval | Explicit owner-written 2026-11-14 chat permission; Phase 0 docs merged PR #10; readiness issue #2 |
| Branch | `feat/phase1-1-expo-shell-20261114` |
| Base SHA | `49438b50e3078b89fad3a9f086b9b93d8c635690` |
| Platform/scope | iOS + Android mock app shell; `src/app`, `src/shared`, mock feature screens, tooling only |
| Created | 2026-11-14 |

## Context and policy

- [x] `AGENTS.md`, `.ai/current.md`, core architecture/UI/coding/workflow and canonical `DESIGN.md` consulted.
- [x] Actual `main` and open PR list inspected before branch creation.
- [x] Explicit owner Phase 1.1 authorization and exclusion list confirmed.

## Approved work

- Expo SDK 58 + React Native 0.88.1 + React 19.3 / TypeScript strict, Expo Router.
- App display Tnyx, `com.tnyx.tio` Android/iOS, portrait only, English-only system font and no production icon asset yet.
- Neutral Black/White/Gray, appearance System(default)/Light/Dark, Glass(default)/Solid UI preference persisted only as non-sensitive local UI settings.
- Reusable tokens, primitives, root/nested TopBar, Standard config-driven bottom bar (4 roots initially), hero/scroll reveal, mock routed screens.
- Unit tests for shell contracts, TypeScript/ESLint and GitHub CI. Source organization follows ADR-009/015–018.

## Strict non-goals

**No** real Auth, OTP, Supabase, SQLite, SQLCipher, Drizzle, workout history/CRUD, cloud, AI, billing, membership, backup/sync, app-lock, downloadable custom fonts, Hindi translations, future Accent Color picker/Pill layout, release/deployment or merge. Screens must never imply actual saved workout data.

## External references/versions

Official Expo SDK 58, Expo Router and Expo Blur docs checked on 2026-11-14. Follow the [Phase 1.1 guide](../../../docs/24-PHASE-1-1-SHELL.md). Actual mobile build/native Glass and orientation behavior need separate device verification.

## Validation & review status

- **Static/local test evidence:** record actual commands or explicitly mark unrun in PR. The local execution environment cannot fetch npm registry packages; npm lockfile generated and committed via GitHub Actions; `npm ci` is used for deterministic install, but no reproducible native release build is claimed.
- **Review requested:** independent Codex review on actual PR HEAD after implementation.
- **Merge authorization:** not granted. No deployment.

## Handoff

**Next owner:** repository owner for PR review and separate merge approval.
**Next authorized action:** validate/review this bounded shell PR only; no additional feature slice without separate owner approval.
**Post-merge sync/archive:** yes, only after owner-authorized merge.

[Task template](../TEMPLATE.md) · [Readiness](../../../docs/21-PHASE-1-READINESS.md)

## Owner screenshot correction / agent handoff (2026-11-15)

- Owner authorized bounded Phase 1.1 UI fixes to the auth footer, Email to Password motion and review-related Android system Back; no scrolling and no other phase.
- Agent: ChatGPT GitHub connector implementation session on PR #11. Modified AuthPreviewPage, AuthPreviewFlow, static tests, Phase 1.1 guide and this record in a single Git commit; use live branch SHA as ground truth.
- Validation before merge: new-HEAD CI, real iPhone keyboard motion and equal gutters, Android system Back, short-screen and large-text accessibility, independent recorded PR review. No native device/build validation was performed in this session; no merge approval.

## Auth keyboard mismatch follow-up (2026-11-15)

- Owner observed a large notice-to-CTA gap and keyboard/CTA motion mismatch after the initial screenshot fix. The source had an unneeded 57pt notice min-height and two concurrent keyboard animation/padding owners.
- Scoped work: natural-height stable safety copy above CTA with 8pt gap, fixed 16pt button gutter outside iOS native keyboard avoidance, explicit retained Email ref focus restore on Password→Email, contract tests and doc correction. No auth backend, Supabase, SQLite, scrolling or merge.
- Evidence: GitHub current branch commit/CI to be verified; physical iOS/Android movement and high-text accessibility remain unverified until observed on devices; ask Codex for independent re-review.

## Owner-requested password visibility (2026-11-15)

- Scope: add a show/hide eye toggle on the right side of password inputs in the Phase 1.1 preview. Implemented in the reusable `TextField`, so Sign in, Sign up and New password share it. Default hidden, accessible show/hide labels, 48pt touch area, no additional native dependency.
- Boundaries: no other screen layout/navigation, no scrolling, no real credential handling or Supabase changes. Updated tokens, English strings, contract test and Phase 1.1 guide. Current-head CI and independent review must be observed before owner merge decision; physical iOS/Android QA remains pending.

## Owner-confirmed keyboard footer did not rise (2026-11-15)

- Corrected the post-Welcome iOS CTA after observing the earlier nested KAV structure failed on-device. Single owner: `keyboardWillChangeFrame` + native `scheduleLayoutAnimation` + pure screen geometry overlap; no KAV or second padding animation. Footer remains inside the non-scrolling auth page with fixed 16pt gutter. Android remains unchanged.
- Code: `AuthPreviewPage.tsx`, `authKeyboardGeometry.ts`, shell tests, Phase 1.1 guide and task note. Password eye and mock-only auth behavior retained. Current CI and fresh native QA/re-review required; no merge approval.

- CI token-guard follow-up: replace inline numeric keyboard test inside `paddingBottom` expression with `Math.max(keyboardInset, insets.bottom)`, preserving native keyboard clearance while keeping the project's token guard satisfied. Recheck full CI at updated HEAD; original commit failed the token guard before TypeScript/tests ran.

- Follow-up CI typecheck correction: React Native 0.88 strict types require `TextInputInstance` (not the `TextInput` component function) for the retained Email field `useRef` and reusable TextField `Ref` prop. Exact issue surfaced on previous HEAD after token guard passed; full CI must be rerun.

## Listener-before-autofocus / keyboard overlay recovery (2026-11-15)

- Owner verified Continue was still hidden underneath keyboard at `c94e8def5f`. Current-HEAD Codex review identified `useEffect` listener registration racing native initial `autoFocus`; a keyboard event can be emitted before listener installation. Previous static tests cannot exercise this.
- New `AuthPreviewPage` registers `keyboardWillShow`, `keyboardWillChangeFrame`, `keyboardDidShow` fallback, hide listeners and metrics reconciliation **before mounting auto-focused form children** using `useLayoutEffect` + ready gate. Footer moves into an absolutely positioned, persistent bottom region at `max(keyboardInset, safeArea.bottom) + 16pt`; left/right inset 16pt, warning CTA gap 8pt. Welcome/real Auth/Supabase unaffected; non-scrolling design preserved.
- Acceptance requires CI on exact new HEAD plus physical iPhone screenshot/video confirming real native keyboard movement; iOS and Android small-screen/accessibility risk remains unverified. Request independent current-HEAD review and never merge without owner action.

## Shared auth footer offscreen screenshot correction (2026-11-15)

- Owner screenshot of auto-focused iPhone Email stage has no Continue and no warning; owner confirms all auth screens affected. The physical screen-height keyboard inset was applied inside an app route that might already be resized by the native keyboard, leading to possible double-offset and offscreen footer. Source-derived hypothesis, not directly instrumented.
- Fix shared `AuthPreviewPage`: root `ViewInstance.measureInWindow` + `onLayout` for its actual window bottom; keyboard native `screenY`; footer overlap from the two in one coordinate frame. Keep first-autofocus listener gating, persistent absolute footer and 16pt gutters. Update pure geometry tests for full vs resized root. No scrolling, backend, unrelated screen, merge or cloud changes.
- Must verify new SHA CI, independent review, then native iPhone keyboard screenshot/movement. User-observed regression overrides claims from earlier static CI.

## Owner-approved shared TopBar/height-token consistency fix (2026-11-15)

- User explicitly requested to correct the earlier PR #11 audit: all implemented **navigation-header screens** should reuse the shared `TopBar` and content/header minimum height must derive from design tokens rather than inline 54/default native header. Preserve the existing auth plain icon-only header and root/nested rounded Glass/Solid variants as approved; Welcome and Auth Choice remain headerless by design.
- Focused changes in `TopBar`, `topBarSizes` tokens, `RootChrome`, `NestedPage`, `AuthPreviewPage`, shell tests and Phase 1.1 guide. Current 54pt content height, 48pt back targets, safe-area positions, scrolling visibility, password eye and measured keyboard/CTA anchoring remain visually unchanged. TopBar optional action API is reusable without introducing new visible actions.
- Validation: new HEAD GitHub CI and current-HEAD independent review must be observed; physical iPhone/Android header/keyboard layout still unverified. No release, Auth backend, Supabase, SQLite, merge or adjacent feature work authorized. Resolve final SHA from live PR state.

## Owner-go-ahead: compact non-scrollable auth P2 response (2026-11-15)

- Owner's `Go` authorizes only the outstanding P2 auth keyboard/small-phone overlap correction, not merge or Supabase Auth. Shared page measures actual root, header and footer dimensions, subtracts the keyboard clearance and footer gutter, and exposes the form-space budget to all Email/OTP/Password/recovery stages. Compact mode reduces spacing/intro; tight mode prioritizes active input and CTA, keeping inactive Sign in Email mounted but off-layout on Password step. Root/nested/auth TopBar variants and height tokens unchanged, password eye and notice preserved; no ScrollView.
- Added pure `authViewport` helpers, token thresholds and static geometry/viewport tests. CI and independent review still required on new SHA. Real compact iPhone/Android keyboard/dynamic-font QA not available in connector; a mathematically impossible extreme no-scroll viewport remains a review/owner decision, so do not mark P2 resolved on static checks alone.

## Merge gate P2 escape follow-up (2026-11-15)

- After owner directed 'Go to merge gate', verified current HEAD, exact CI, independent review and persistent P2. Replied to and resolved 11 **verified fixed** legacy GitHub inline threads, preserving the active P2 keyboard/accessibility thread open. Confirmed baseline commit ancestry using GitHub compare (merge-base matches baseline, behind_by=0). This does not dismiss the active human `CHANGES_REQUESTED` review.
- Focused corrective work within the already-approved P2: when a visible keyboard leaves less than the active input's usable height, the **shared TopBar** temporarily exposes 'Hide keyboard' via Keyboard.dismiss, restoring the form/CTA without scrolling. Tokenized bare TextInput minimum, shared copy, measured viewport pure helper and tests; normal header/auth flows unchanged. Device QA and human rereview are required. No merge authority is inferred from gate preparation.

## Merge gate — Android autoFocus keyboardDidShow race correction (2026-11-15)

- Current reviewer `im-tio` CHANGES_REQUESTED at `5aa0a49a09d3` because Android's initial auto-focused TextInput could race with the passive visibility listener, disabling Hide keyboard in a tiny viewport. Agent: ChatGPT GitHub connector session; owner remains PR maintainer. Scoped change moves shared DidShow/DidHide into pre-autofocus useLayoutEffect and gates children on both platforms, reconciles current keyboard visibility next frame, preserves iOS frame animations and exact existing appearance. Contract test and docs updated; no backend, native build, EAS, merge or branch rewrite.
- Need exact-head CI and independent `im-tio` re-review; native Android/iPhone accessibility QA required. The existing P2 thread and reviewer CHANGES_REQUESTED remain open until evidence is sufficient.

## Owner-reported Android keyboard and back icon regression (2026-11-15)

- Owner shared native Android screenshot: keyboard covers Continue and warning, while the Back arrow glyph looks very small. iOS is reported correct. Official Expo edge-to-edge Android keyboard docs confirm the route need not shrink for IME; `AuthPreviewPage` wrongly sent keyboard frame position updates only on iOS. Fix in current PR #11 Phase 1.1: common DidShow/DidHide frame updates and metrics reconciliation on Android + iOS, preserving iOS Will-event animation, measured-root overlap, 16pt footer gutter and non-scrolling behavior. Tokenized 32dp visible BackArrowIcon replaces platform font glyph within existing 48dp accessible Pressable. No new dependencies or native build.
- New HEAD needs actual GitHub CI, independent line-level rereview and native Android + iOS QA; screenshot alone documents old bug, not its resolution. Keep P2/CHANGES_REQUESTED open and do not merge, deploy, publish or modify Supabase.

## Owner's second Android screenshot: note visible but CTA still under Gboard (2026-11-15)

- Screenshot at latest `d25e5107`: 32dp vector-like arrow looks correct; preview warning is visible, but Continue remains partly obscured by keyboard/Gboard toolbar. Owner previously confirmed iOS correct. Source suggests Android window- vs physical-screen keyboard coordinate origin mismatch on cutout/status-bar devices; no native traces were available.
- Focused follow-up: store Android reported keyboard height, estimate full IME depth from physical screen height and keyboard top, subtract bottom safe-area and any observed native root resize, and take max with the previous root-overlap clearance. Pure tests for Gboard coordinate mismatch, partial/full native resize and hidden. iOS calculation and existing TopBar untouched, no scrolling or new dependency. Current-head CI and independent review required; physical Android screenshot is the acceptance gate. No merge, Supabase, Auth implementation or cloud build.

## Android native-KAV footer too high; remove duplicate safe-area offset (2026-11-15)

- Owner supplied latest Android screenshot with footer/CTA fully visible above Gboard but an oversized gap. Retained successful edge-to-edge Android KAV and changed Android-only footer extra safe inset to zero while keyboard visible; on hide continue honoring bottom safe area. Set KAV `keyboardVerticalOffset={-insets.top}` to compensate status/top offset already included by native route layout, using measured safe area rather than a magic dp constant. iOS keyboard formula and non-scrolling auth layout unchanged. Static regression tests and docs updated. Physical Android 16dp gap and movement still require owner validation; do not merge, deploy, add Auth backend or claim native pass.

## Android keyboard root KAV offset reversion (2026-11-15)

- Owner's two Android screenshots (hidden vs visible Gboard) at HEAD 49d329 show Continue still clipping after adding `keyboardVerticalOffset={-insets.top}`. Native React Native KeyboardAvoidingView docs define default offset=0 for full-screen root. Removed the negative vertical offset while keeping the keyboard-visible footer safe-area omission and 16dp design gutter, preserving the working Android KAV and iOS independent frame system. Contracts and docs updated. Requires fresh exact-HEAD CI, Android device visual test, im-tio review; do not merge or claim success until observed.

## 320×568 max-font input/footer collision targeted fix (2026-11-15)

- Owner authorized correcting the concrete overlap shown in their Android 15 small emulator maximum text/font screenshot. PR #11 scope: shared AuthPreviewPage reserves measured absolute footer space in keyboard-open form, prevents its TextInput from painting over footer, and switches only the most constrained keyboard-open preview warning to short 'UI preview only' visually while retaining full original warning via accessibilityLabel and restoring full copy when keyboard closes. `compactKeyboardNotice` is sticky until keyboard hide to prevent layout feedback oscillation and preserves Hide keyboard escape. Normal Android + iOS and no-scroll design intentionally unchanged. Static tests and docs updated; native small-emulator QA and independent reviewer evidence still outstanding. No merge, Supabase, Auth, EAS or deployment.

- Implementation stabilization: initial max-font patch had React ESLint set-state-in-effect violation. Removed derived-effect state entirely; store the full notice footer onLayout height as a stable baseline and calculate abbreviated-warning mode from that independent measurement. Keep `formContentBudget` conservatively tight and the Hide keyboard escape visible. No new feature scope; latest CI and native emulator recheck pending.

- Final scoped guard: protect field/footer separation only in `smallKeyboardNotice` mode rather than on all keyboard-open routes, leaving normal iOS/Android unaffected. Exact-head CI and emulator recheck pending.

## Android regular-width IME auto-closes regression report and isolation (2026-11-15)

- Owner reports larger Android keyboard opens then closes after max-font compact safety-notice patch, while small 320×568 max-font screenshot looks correct. React app has no automatic `Keyboard.dismiss` call: only explicit press/flow callbacks use it. Scope remediation: tokenize extreme compact maximum viewport width (340dp); only capture full footer baseline and show compact warning/input-space clipping below that threshold. Regular-width Android's keyboard-open render/measurement path is unchanged from earlier working commit. Unit contracts cover width and IME cases. Source-level, not yet native-confirmed; verify exact-head CI, both affected devices, im-tio review. No merge/Supabase/native configuration changes.
