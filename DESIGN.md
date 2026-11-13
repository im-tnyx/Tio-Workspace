<div align="center">

# 🎨 TIO / Design System
**Visual direction for the proposed mobile app and a consistent, readable documentation experience**

![Status](https://img.shields.io/badge/DESIGN-PROPOSED-6D5EF8?style=flat-square)
![Platform](https://img.shields.io/badge/PLATFORM-iOS%20%2B%20Android-334155?style=flat-square)

[← Home](README.md) · [Documentation hub](docs/00-INDEX.md) · [Product requirements](docs/01-PRODUCT-REQUIREMENTS.md)

</div>

> [!NOTE]
> This is a **visual specification**, not a delivered UI kit or a promise that any screens currently exist. Preview designs, tokens and screenshots require explicit review during implementation.

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

## 03 · Layout and type

- **Spacing rhythm:** 4 / 8 / 12 / 16 / 24 / 32 px, subject to responsive scaling.
- **Cards:** 16px radius proposed; clear grouping; avoid decorative shadows that reduce legibility.
- **Type hierarchy:** large page title → section heading → body → supporting metadata. Prioritize device system fonts until typography licensing/performance are approved.
- **Touch targets:** aim for at least 44 × 44 pt on iOS and 48 × 48 dp on Android, with larger workout controls.
- **Icons:** consistent 24px outline icon family; always pair unfamiliar icons with labels.
- **Accessibility:** dynamic font sizes, voice labels, focus order, reduced-motion support, dark mode, and color-blind-friendly status cues.

Review proposed [MVP screens & interaction flows](docs/20-MVP-UX-FLOWS.md) before locking navigation and states. They remain unapproved until owner review.

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
| Settings | Manage account and storage | Show Local Only as default |
| Backup (later) | Back up / Restore | Last success, recovery, permission states |
| AI Draft (later) | Review generated plan | Human approval before saving |

**Necessary states for every screen:** loading, empty, offline, error, permission denied, and completed. Offline should never be shown as an error for local workout logging.

## 05 · Component vocabulary (proposal)

`Button` (primary/secondary/destructive), `WorkoutCard`, `ExerciseRow`, `SetEditor`, `NumberInput`, `UnitPicker`, `StatusMessage`, `EmptyState`, `ConfirmationSheet`, `BackupStatus`, `SyncConsent` and `ProgressChart`.

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

## 07 · Future design assets

When implementation is approved: create real Figma/source assets, app icon, splash screen, state screenshots and a screenshot/asset provenance index. Do not use fake product screenshots in the current documentation-only README.

---

**Decision gate:** Visual direction is proposed and must be approved before application UI implementation.

[← README](README.md) · [Go to architecture →](docs/02-SYSTEM-ARCHITECTURE.md)
