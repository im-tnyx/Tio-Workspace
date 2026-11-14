# 🎨 Phase 0 final design review & Phase 1 owner approval pack

**Status:** Proposed for owner review · **2026-11-14** · **No Phase 1 implementation approval recorded**

[← Docs hub](00-INDEX.md) · [Design system](../DESIGN.md) · [MVP flows](20-MVP-UX-FLOWS.md) · [Phase 1 readiness](21-PHASE-1-READINESS.md) · [Issue #2](https://github.com/im-tnyx/Tio-Workspace/issues/2)

> [!IMPORTANT]
> This is a **sign-off-ready recommendation**, not an owner decision, validated mockup, working UI, permission to create app code or a completed security audit. Only a later, separate written approval by the repository owner may authorize a named Phase 1 slice. Merging this document is **not** that authorization.

## 1. Decision summary

**Recommended outcome:** adopt the existing Tio visual direction as a *provisional MVP design baseline*, settle the limited choices below, then independently approve a narrowly scoped Phase 1.1 shell. Defer secrets, Supabase setup, SQLCipher/Drizzle integration, actual workout storage, AI, Google Drive/iCloud and paid sync until their separately defined slices and gates.

| Topic | Existing owner-selected policy | Proposed decision for owner |
|---|---|---|
| Functional scope | Auth, Home, Exercise Library, Plans, Active Workout, History, Progress, Settings — ADR-011 | Keep the selected screens; no new MVP feature |
| Account/privacy | Supabase email/password, single locally bound UUID, offline local workouts; no account switching | Preserve unchanged |
| Storage | Local encrypted SQLite default; Personal Backup or future paid Sync is separately chosen, never both active | Preserve unchanged |
| Product name | Tio is used provisionally | **Confirm “Tio” or specify final name**, app display name, Android application ID and iOS bundle ID before native release configuration |
| Visual identity | Violet/mint light/dark tokens in `DESIGN.md` are proposals | Approve as design baseline **or request exact changes**; logo and app icon remain unapproved |
| Local lock | PIN/biometrics undecided | **Defer** to a separate consent/recovery decision; do not imply an always-on unlock prompt |
| Phase 1 | No implementation authorized | Prefer **Phase 1.1-only written approval**, after design and tooling/startup plan sign-off |

**Owner decision fields — all pending:** name/identifiers; color/type/navigation acceptance; app-shell platform/tooling acceptance; initial acceptance thresholds; exact Phase 1 slice and exclusions; security exceptions, if any.

## 2. Proposed MVP visual baseline (approval pending)

### 2.1 Look and feel

- Product personality: **minimal, focused, strong, calm and trustworthy**. Optimize for legibility while resting between sets, not for gamification or health claims.
- Reuse `DESIGN.md` tokens as the **candidate**, not a new competing palette: violet `brand.primary` (`#6658E8` light / `#9389FF` dark), mint `brand.mint` (`#13B89A` / `#4DE0BC`), neutral surfaces and explicit danger colors.
- System fonts initially; proposed spacing steps **4/8/12/16/24/32**, 16px card radii, restrained elevation and a consistent 24px outline-icon style.
- Light and dark theme must both be reviewed. Specific tokens, contrast, brand assets and layout screenshots are **not approved/validated** merely by this proposal.
- Accessible controls: at least **44 × 44 pt iOS / 48 × 48 dp Android** targets as design goals, dynamic text scaling, screen-reader labels, clear focus order, reduced-motion support, and no color-only status.

### 2.2 Navigation and screen hierarchy

| Surface | Proposed primary content/action | Safeguards and validation |
|---|---|---|
| **Home** (main tab) | Today's plan, resume in-progress session, **Start Workout** as dominant CTA, recent log summary | Blank state with “Start a free workout”; offline never disables local logging |
| **Plans** (main tab) | Plan list; create/edit plan, schedule and exercise order | Save state and validation; Exercise Library available from planning |
| **History** (main tab) | Completed sessions, dates, searchable/filterable local records | Stable units; empty-state CTA; deleted data not shown as cached |
| **Progress** (main tab) | Personal bests, trends and local calculations | Readable charts/tables; “not enough data” explanation; no health diagnosis |
| **Settings** (main tab) | Bound account, units, Local Only storage, logout, separate confirmed local erase | No add/switch account UI; mode and privacy descriptions are explicit |
| **Active Workout** (focused full-screen flow) | Session header; large set/reps/weight inputs; Add/Complete Set; Finish | Thumb-friendly editing, autosave state “Saved on this device,” crash resume; no fake “Synced” status |
| **Exercise Library** (from Plans/Workout) | Local search, curated/manual custom exercise entry | No licensing-dependent catalog guarantee; empty results allow Add |
| **Auth/session gate** (outside tabs) | Welcome, Sign in, Sign up, forgot password, same-bound-account re-login | First login online; persisted session on normal app reopen; block different UUID before DB unlock |

Navigation choice is **proposed**: five main areas (Home/Plans/History/Progress/Settings), with Workout full-screen and Exercise Library contextual. Owner must review real wireframes/flows before calling visual design final.

### 2.3 Required UI states and copy

For each applicable screen: **loading, empty, offline, error, saving/retry, destructive confirmation and accessibility** states. Critical proposed copy:

| Event | Proposed user-facing text |
|---|---|
| First save | “Saved on this device” |
| Offline | “Offline · Workouts still work” |
| Sign out | “Your workouts stay on this device, linked to this account.” |
| Wrong account | “This device is linked to another Tio account. Sign in with the linked account.” |
| Local-only reset | “Erasing this device may permanently remove workouts without a usable backup.” Require a separate destructive confirmation |
| Empty device, unknown prior settings | “No workouts on this device.” Optional **Find existing encrypted backup** — not a mandatory restore dialog |
| Verified Personal Backup archive | **Restore / Skip** after user-initiated provider connection, archive verification and recovery secret; Restore requires separate replace confirmation |
| Future authorized paid Sync | “Downloading your workouts…” **No Personal Backup Restore dialog**; show honest errors/empty state if authorization/data unavailable |

A Personal Backup restore is not tied to the current/remembered upload mode, may be skipped, and must not silently enable upload. Future Supabase Sync requires previous explicit user opt-in, valid entitlement and current authorization, then may automatically hydrate local data. Auth alone never recreates local-only workouts. Refer to [recovery contract](19-BACKUP-RECOVERY-STRATEGY.md) and [MVP flows](20-MVP-UX-FLOWS.md).

## 3. Decisions that must be recorded versus legitimately deferred

| Ref | Required now to sign off shell | Deferred gate / risk |
|---|---|---|
| D01 | Confirm display name, provisional/final app identifiers and brand usage; no fake app icon approval | Final distributable icon/splash/legal trademark review before store release |
| Visual | Confirm or revise baseline tokens, five-tab navigation, workout editor hierarchy and proposed safety copy | Actual clickable wireframes, iOS/Android screenshots, text-scaling and contrast tests before UI exit |
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

- [ ] Owner confirms the proposed design baseline, initial name/identifier approach and navigation hierarchy, or documents revisions.
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
| 1.7 Release candidate | Full device validation | P0 AUTH/DATA/SEC and UX cases pass with recorded device/build evidence, no default workout upload, accessible UI |

**Important sequencing:** native proof cannot legitimately be marked complete before its test build exists. Approve **bounded work** and keep security-release gates pending; do not use a broad “Phase 1 approved” label to bypass them. Any Supabase project/credential, new permission or privacy-changing action needs explicit scoped approval before execution.

## 5. Owner sign-off record (template — NOT FILLED / NOT APPROVED)

Record this separately in [issue #2](https://github.com/im-tnyx/Tio-Workspace/issues/2) or a subsequent reviewed PR after considering this document:

| Field | Owner must provide |
|---|---|
| Approver / date | Repository owner identity and ISO date |
| Design decision | “Approve proposed Tio baseline” **or** exact visual/name/UX changes |
| Platform identifiers | Android application ID / iOS bundle ID, provisional or final |
| Phase authorization | “Approve **Phase 1.1 app shell only**” **or** a precisely enumerated alternate slice |
| Explicit exclusions | Auth project/credentials, workout database, AI, personal backup, paid Sync, deployment unless independently approved |
| Accepted risks | Native SQLCipher/Drizzle/OS-backup tests are **pending**, not passed |
| Evidence | Link to reviewed docs PR, owner comment, responsible implementer and required review/acceptance gates |
| Result | **PENDING** until the owner writes a clear approval; no acceptance inferred from a docs merge |

Recommended sign-off wording (copy only if actually intended by the owner):

> I approve the proposed Tio Phase 0 visual baseline and authorize **Phase 1.1 (Expo/TypeScript app shell, navigation/theme placeholders and basic tooling only)**. No Auth integration, SQLCipher/Drizzle database, workout feature, AI, cloud backup/sync, billing or deployment is authorized by this approval. Native/security gates remain pending. Owner/date/identifiers: [complete before posting].

## 6. Verification and handoff

- This pack is **documentation only**. It does not report a prototype, UI screenshots, device measurements, release proof, CI success, a Supabase project or user sign-off.
- On this documentation PR: check changed-file scope, all relative links, Markdown tables/fences and consistency with ADR-010–014, the UX flows, recovery specification and test plan.
- Independent review + explicit owner permission are still required **before merging the docs PR**.
- After docs merge and separate owner sign-off, start **Phase 1.1** in a new implementation PR with test evidence. Leave [issue #2](https://github.com/im-tnyx/Tio-Workspace/issues/2) open while Phase 0 decisions or approval remain unresolved.

**Current reference guidance (revalidate on actual implementation day):** [Expo SQLCipher/native-build guidance](https://docs.expo.dev/versions/latest/sdk/sqlite/), [Supabase React Native Auth guidance](https://supabase.com/docs/guides/auth/quickstarts/react-native), [auth/security baseline](04-AUTH-AND-SECURITY.md), [native acceptance](08-TEST-PLAN.md).

---

[← Phase 0 decision pack](17-PHASE-0-DECISION-PACK.md) · [Phase 1 readiness](21-PHASE-1-READINESS.md) · [Design](../DESIGN.md)
