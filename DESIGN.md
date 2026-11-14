<div align="center">

# 🎨 TIO / Design System
**Visual direction for the proposed mobile app and a consistent, readable documentation experience**

![Status](https://img.shields.io/badge/DESIGN-PROPOSED-6D5EF8?style=flat-square)
![Platform](https://img.shields.io/badge/PLATFORM-iOS%20%2B%20Android-334155?style=flat-square)

[← Home](README.md) · [Documentation hub](docs/00-INDEX.md) · [Product requirements](docs/01-PRODUCT-REQUIREMENTS.md)

</div>

> [!NOTE]
> This is a **visual specification**, not a delivered UI kit or a promise that any screens currently exist. **Owner-selected (ADR-015, 2026-11-14):** iOS-inspired Glass/Solid material, independent Light/Dark appearance, shared TopBar/reusable controls, and exactly four bottom tab roots (Home/Workout/Library/You). Remaining colors, icon/logo, initial theme defaults and native render/accessibility remain proposed or unverified.

## 01 · Product personality

**Minimal. Focused. Strong. Calm. Trustworthy.** A gym tool should be readable at a glance, even between sets. Prefer a confident visual rhythm instead of a crowded dashboard. Progress is motivating, but the product must not shame users or make health claims.

| Principle | Direction | Avoid |
|---|---|---|
| Clarity | One primary action per screen, concise labels, readable data | Overloaded dashboards and hidden controls |
| Speed | Fast start-workout, thumb-friendly set editing | Deep navigation during a workout |
| Privacy | Clearly labeled storage destinations and consent | Pretending cloud backup is automatic |
| Accessibility | Text scaling, touch targets, screen reader labels | Color-only statuses |
| Consistency | Shared spacing, typography and form states | Different patterns for the same task |

## 02 · Proposed color tokens

| Semantic token | Light | Dark | Use |
|---|---|---|---|
| `brand.primary` | `#6658E8` | `#9389FF` | Primary CTA and links |
| `brand.mint` | `#13B89A` | `#4DE0BC` | Workout-complete feedback |
| `surface.app` | `#F7F8FC` | `#0E1016` | Background |
| `surface.card` | `#FFFFFF` | `#181B25` | Elevated surfaces |
| `text.primary` | `#151824` | `#F6F7FB` | Main text |
| `text.secondary` | `#667085` | `#ADB5C5` | Hints/metadata |
| `stroke.default` | `#E5E7EF` | `#2B3040` | Borders |
| `status.danger` | `#C73853` | `#FF758D` | Destructive actions |

Tokens must be checked for accessible text contrast in real light/dark UI; these are proposals pending visual QA. No hard-coded color values inside feature screens once a token system exists.

## 02A · Owner-selected iOS-inspired shared shell (ADR-015)

The uploaded iOS app screenshot is **visual reference only**, showing a translucent rounded top header and grouped action treatment. Do not copy HEVY branding, image, icons or unapproved features. iOS-inspired styling should be supported across **both** iOS and Android when technically feasible.

- **Settings → Appearance has two independent choices:** **Material = Glass / Solid** and **Appearance = Light / Dark**. Four combinations are required: Glass+Light, Glass+Dark, Solid+Light, Solid+Dark. Exact default combination and optional OS-following preference remain undecided.
- **Glass:** background-aware, translucent/tinted surfaces with restrained backdrop blur, fine borders and rounded corners for shared navigation and suitable surfaces. **Solid:** matching geometry and semantics with opaque background tokens; no blur. Apply to every shared component rather than screen-by-screen copies.
- **Shared `TopBar`:** a single screen-configured title/back/optional-action component, with large-title/root and compact-back/nested variants, safe-area padding and theme material. The OS status bar remains native. Do not invent search/notification functionality because those icons appear in a reference image.
- **Shared `BottomTabBar`:** exactly **Home, Workout, Library, You**, visible **only on those four root-tab screens**. Hide on Active Workout, Plan Editor, exercise detail, History, Progress, Settings, personal backup, Auth and all other nested/modal/full-screen routes.
- **Reusable controls:** `Button`, `TextField`, `SearchField`, `Card`, `SheetSurface`, `Dialog`, `Switch`, `Select`, `StatusMessage`, `TopBar`, `BottomTabBar` and typography/icons share one theme token source. When code is approved, `src/shared/` owns non-business primitives and `src/app/` owns route layouts; feature screens only compose them, per [architecture](docs/10-REPOSITORY-STRUCTURE.md).
- **Accessibility & Android fallback:** maintain readable contrast over dynamic content, large text, predictable keyboard/safe areas, 44pt/48dp minimum touch targets, reduced-motion and reduce-transparency controls. If blur is unsupported or unreadable, render a legible tinted **Solid fallback** without changing the user's saved preference. Native implementation/QA is still pending.
- **Privacy:** appearance preferences are local UI state; toggling them cannot enable workout uploads, backup, sync, or change bound account identity.

## 03 · Layout and type

- **Spacing rhythm:** 4 / 8 / 12 / 16 / 24 / 32 px, subject to responsive scaling.
- **Cards:** 16px radius proposed; clear grouping; avoid decorative shadows that reduce legibility.
- **Type hierarchy:** large page title → section heading → body → supporting metadata. Prioritize device system fonts until typography licensing/performance are approved.
- **Touch targets:** aim for at least 44 × 44 pt on iOS and 48 × 48 dp on Android, with larger workout controls.
- **Icons:** consistent 24px outline icon family; always pair unfamiliar icons with labels.
- **Accessibility:** dynamic font sizes, voice labels, focus order, reduced-motion support, dark mode, and color-blind-friendly status cues.

Review proposed [MVP screens & interaction flows](docs/20-MVP-UX-FLOWS.md) before locking navigation and states. The owner-selected shell policy is recorded; exact mockups, color tokens and device testing still need review.

## 04 · Screens to design

| Screen | Primary action | Key design rule |
|---|---|---|
| Auth | Sign up / Sign in | Simple form, error clarity, stay signed in |
| Home | Start Workout | One dominant action and resume state |
| Live Workout | Add / complete set | Giant legible numbers; immediate autosave feedback |
| Exercise Library | Search / add exercise | Local-first search, clear custom exercise UI |
| Workout Plan | Edit schedule | Reorder with explicit save state |
| History | Inspect previous workouts | Fast filtering and stable historical values |
| Progress | View local insights | Accessible charts, explicit units |
| You / Settings | Profile, appearance, account and storage | You is a root tab; Settings nested; Glass/Solid and Light/Dark independent; Local Only remains default for workout storage |
| Backup (later) | Back up / Restore | Last success, recovery, permission states |
| AI Draft (later) | Review generated plan | Human approval before saving |

**Necessary states for every screen:** loading, empty, offline, error, permission denied, and completed. Offline should never be shown as an error for local workout logging.

## 05 · Component vocabulary (proposal)

**Shared primitives:** `TopBar`, `BottomTabBar`, `ThemeProvider`, `Button`, `TextField`, `SearchField`, `Switch`, `Select`, `Card`, `SheetSurface`, `Dialog`/`ConfirmationSheet`, `StatusMessage`, `EmptyState`, typography/icons. **Composed feature components:** `WorkoutCard`, `ExerciseRow`, `SetEditor`, `NumberInput`, `UnitPicker`, `BackupStatus`, `SyncConsent`, `ProgressChart` (cloud components only in later phases).

Design tokens and reusable components should be implemented independently of data fetching. No screens should directly read Supabase workout tables in local-only mode.

## 06 · Documentation visual language

Use the same quality bar for **every** Markdown document:

1. Short icon-led title and one-line purpose.
2. A compact top navigation link to [README](README.md) and [documentation hub](docs/00-INDEX.md).
3. One clear status note — **proposed / in review / approved / implemented**.
4. A “decision in one sentence” or summary table for skim-readers.
5. Headings with numbers only when they help navigation; diagrams and tables for architecture/flows.
6. GitHub-supported Mermaid diagrams and alerts; descriptive alt text for images.
7. A next-step section with relevant links; no broken routes and no fake status badges.
8. Keep paragraphs concise; do not replace essential information with decoration.

Suggested hierarchy: **Overview → Decisions → Flows → Edge cases → Verification → References**. Important warnings use GitHub callouts sparingly (1–2 per document).

## 06A · Proposed Phase 0 visual freeze for owner review

**Owner-selected (ADR-015):** exactly four bottom-root screens **Home, Workout, Library, You**, and root-only bottom bar; all detailed screens hide the dock. Shared iOS-style TopBar/controls and independent Glass/Solid × Light/Dark preferences. **Not yet finalized:** exact violet/mint colors, typography, initial defaults, final name/IDs, detailed screen hierarchy, contrast, native blur fallback and real device screenshots.

Use the [Phase 0 design and Phase 1 approval pack](docs/22-PHASE-0-DESIGN-AND-PHASE-1-APPROVAL.md) for exact review choices, Restore/Skip versus future Sync automatic hydration copy, acceptance criteria and the owner sign-off template. Do not read this paragraph as sign-off, app code authorization or a delivered UI.

## 07 · Future design assets

When implementation is approved: create real Figma/source assets, app icon, splash screen, state screenshots and a screenshot/asset provenance index. Do not use fake product screenshots in the current documentation-only README.

---

**Decision gate:** Visual direction is proposed and must be approved before application UI implementation.

[← README](README.md) · [Go to architecture →](docs/02-SYSTEM-ARCHITECTURE.md)
