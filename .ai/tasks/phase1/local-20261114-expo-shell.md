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
