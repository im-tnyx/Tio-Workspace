<div align="center">

# 🎨 Tnyx / Design System
**Visual direction for the proposed mobile app and a consistent, readable documentation experience**

![Status](https://img.shields.io/badge/DESIGN-PROPOSED-6D5EF8?style=flat-square)
![Platform](https://img.shields.io/badge/PLATFORM-iOS%20%2B%20Android-334155?style=flat-square)

[← Home](README.md) · [Documentation hub](docs/00-INDEX.md) · [Product requirements](docs/01-PRODUCT-REQUIREMENTS.md)

</div>

> [!NOTE]
> This is a **visual specification**, not a delivered UI kit or working UI. **Owner-selected (ADR-015, 2026-11-14):** initial **Home/Workout/Library/You** root tabs; a **config-driven BottomTabBar** whose tab count can change in later owner-approved revisions; **Standard bar layout now**, optional **Pill layout later**; independent default Glass/Settings Solid material and Light/Dark appearance; shared TopBar and dumb reusable screens. Exact branding, initial Light/Dark, native glass/accessibility and future tab/layout changes remain separate decisions.

## 01 · Product personality

**Minimal. Focused. Strong. Calm. Trustworthy.** A gym tool should be readable at a glance, even between sets. Prefer a confident visual rhythm instead of a crowded dashboard. Progress is motivating, but the product must not shame users or make health claims.

| Principle | Direction | Avoid |
|---|---|---|
| Clarity | One primary action per screen, concise labels, readable data | Overloaded dashboards and hidden controls |
| Speed | Fast start-workout, thumb-friendly set editing | Deep navigation during a workout |
| Privacy | Clearly labeled storage destinations and consent | Pretending cloud backup is automatic |
| Accessibility | Text scaling, touch targets, screen reader labels | Color-only statuses |
| Consistency | Shared spacing, typography and form states | Different patterns for the same task |

## 02 · Owner-selected Aqua Teal / accessible token candidates

| Semantic token | Light | Dark | Use |
|---|---|---|---|
| `brand.primary` | `#00BFBF` | `#00BFBF` | Owner-selected screenshot-derived aqua-teal brand anchor; large primary surfaces/buttons |
| `brand.onPrimary` | `#062629` | `#062629` | Dark readable label/icon on bright aqua-teal CTA or splash |
| `brand.link` | `#006A6A` | `#57E2E2` | Proposed accessible on-surface links and text, not bright primary teal on white |
| `brand.mint` | `#13B89A` | `#4DE0BC` | Workout-complete feedback |
| `surface.app` | `#F7F8FC` | `#0E1016` | Background |
| `surface.card` | `#FFFFFF` | `#181B25` | Elevated surfaces |
| `text.primary` | `#151824` | `#F6F7FB` | Main text |
| `text.secondary` | `#667085` | `#ADB5C5` | Hints/metadata |
| `stroke.default` | `#E5E7EF` | `#2B3040` | Borders |
| `status.danger` | `#C73853` | `#FF758D` | Destructive actions |

**Owner-selected updated ADR-016 (2026-11-14): replace the previous Violet direction with the aqua-teal color in the supplied screenshot.** The dominant image background was sampled as **RGB(0,191,191) / `#00BFBF`**, the exact approved brand reference/anchor. Distinct link text, contrast-safe foreground, Glass tints, gradient, pressed and dark-mode tokens remain **candidate derived values**, subject to native light/dark testing. The image's third-party wordmark/content is not licensed or reused. Existing `brand.mint` is an optional supporting/success token, not the competing primary. Do not apply the screenshot color to every screen background automatically.

**Contrast design warning:** On `#00BFBF`, white text is approximately **2.28:1** contrast (insufficient for normal body/button labels). Proposed `#062629` foreground is approximately **6.99:1** against this teal, while `#006A6A` is approximately **6.42:1** against white. Choose separate, contrast-tested semantic foregrounds; do not hardcode white CTA text. Validate Glass-over-content states, dynamic gradients, translucent tab bar icons and text for WCAG contrast on Android/iOS. The sampled color is not proof the complete palette is accessible.

Tokens must be checked for accessible text contrast in real light/dark UI; these are proposals pending visual QA. No hard-coded color values inside feature screens once a token system exists.

## 02A · Owner-selected iOS-inspired shared shell (ADR-015)

The uploaded iOS app screenshot is **visual reference only**, showing a translucent rounded top header and grouped action treatment. Do not copy HEVY branding, image, icons or unapproved features. iOS-inspired styling should be supported across **both** iOS and Android when technically feasible.

- **Settings → Appearance has two independent choices:** **Material = Glass / Solid** and **Appearance = Light / Dark**. Four combinations are required: Glass+Light, Glass+Dark, Solid+Light, Solid+Dark. **Glass is the default** until the user chooses Solid from Settings; Light/Dark startup choice and optional OS-following preference remain undecided.
- **Glass (default material):** visible background translucency, restrained blur/tint and legible text on the shared TopBar, **Standard edge-aligned full-width bottom navigation bar**, and suitable fields/cards/sheets. **Solid (user material preference):** the same component geometry with an opaque surface, selected in Settings → Appearance. The **bar layout is a separate axis**: Standard **now**, Pill **future only**. Do not confuse Glass with Pill—Standard can be translucent; a future Pill could also use Glass or Solid. Accessibility/no-blur fallback may draw opaque surfaces without changing the stored Glass preference.
- **Shared `TopBar`:** a single component with title/back/optional actions and safe-area padding. **Root screens:** show a hero/title in content; the compact TopBar is **hidden at the initial top scroll position and reveals only after scrolling past a threshold**, with smooth reduced-motion-friendly transition/hysteresis and hiding again at top. **Nested screens:** shared compact/back TopBar is **visible immediately** for navigation. Root scroll threshold/visibility is computed in the **shared route shell/scroll coordinator, never inside a dumb screen**. Native OS status bar is separate; screenshot search/notification icons do not authorize those features.
- **Shared `BottomTabBar`:** **initial configuration** contains four root destinations **Home / Workout / Library / You**, visible through root scrolling and hidden on nested/Auth/full-screen routes. The component must render from an **ordered navigation registry/list** (stable tab key, label, icon and valid route), **not hardcode a four-item layout, index, width or route allowlist**. The owner can later authorize fewer/more root tabs, reordering or a **Pill** layout without rebuilding screens. **Current layout = Standard**, safe-area-aligned across the bottom with evenly distributed icon+label destinations; **future layout = Pill** is only a planned alternative and is **not a current Settings control or implemented feature**. Current material remains Glass by default (Solid preference in Settings). Overflow/compact-width, safe areas, keyboard, text scaling and accessibility need deliberate handling, never silently dropping destinations.
- **Orthogonal nav/style contract:** tab configuration (count/order/route) is controlled by a future **app-shell navigation config**, not feature screens or user preferences. `layoutVariant: Standard | Pill` belongs to shared navigation presentation (Standard selected for MVP); `material: Glass | Solid` and `appearance: Light | Dark` remain independent theme settings. Do not introduce a user-editable tab list or Pill switch without a later owner decision.
- **Theme tokens:** future canonical folder **`src/shared/theme/tokens/`** holds colors, foreground text, glass tint/opacity/blur, surfaces, borders, shadows, spacing, radii, typography, icon sizes, motion and semantic component aliases. Light/Dark and Glass/Solid resolve centrally; no hardcoded theme branches per screen. `src/shared/ui/` owns reusable `TopBar`, `BottomTabBar`, `Button`, `TextField`, `SearchField`, `Card`, `SheetSurface`, `Dialog`, `Switch`, `Select` and status components. `src/app/` owns navigation/scroll coordination. Features compose primitives, per [architecture](docs/10-REPOSITORY-STRUCTURE.md).
- **Accessibility & Android fallback:** maintain readable contrast over dynamic content, large text, predictable keyboard/safe areas, 44pt/48dp minimum touch targets, reduced-motion and reduce-transparency controls. If blur is unsupported or unreadable, render a legible tinted **Solid fallback** without changing the user's saved preference. Native implementation/QA is still pending.
- **Privacy:** appearance preferences are local UI state; toggling them cannot enable workout uploads, backup, sync, or change bound account identity.

## 03 · Layout and type

- **Spacing rhythm:** 4 / 8 / 12 / 16 / 24 / 32 px, subject to responsive scaling.
- **Cards:** 16px radius proposed; clear grouping; avoid decorative shadows that reduce legibility.
- **Type hierarchy:** large page title → section heading → body → supporting metadata. Owner selected **Default device/system** and **Custom app-provided** typography modes; both need Hindi/Devanagari rendering. The exact Custom font and license are pending.
- **Touch targets:** aim for at least 44 × 44 pt on iOS and 48 × 48 dp on Android, with larger workout controls.
- **Icons:** consistent 24px outline icon family; always pair unfamiliar icons with labels.
- **Accessibility:** dynamic font sizes, voice labels, focus order, reduced-motion support, dark mode, and color-blind-friendly status cues.

Review proposed [MVP screens & interaction flows](docs/20-MVP-UX-FLOWS.md) before locking navigation and states. The owner-selected shell policy is recorded; exact mockups, color tokens and device testing still need review.

### Brand, typography and multilingual foundation (owner-selected ADR-016)

**App display name: Tnyx.** The repository `Tio-Workspace` is unchanged. **Aqua Teal `#00BFBF` is the owner-selected image-derived primary brand anchor (superseding Violet)**; contrast-safe derived tokens and a possible separate Mint success accent remain in visual review.

**Settings → Appearance → Typography** offers two independent, persistent local choices:
- **Default:** device/system font stack, including OS language/script fallback.
- **Custom:** future licensed, app-bundled font family with **complete Hindi/Devanagari support or a deliberately paired Devanagari-capable fallback**. Glyph gaps or failed font loads fall back to a readable OS font without data loss or silently changing the stored preference.

Both modes apply via `src/shared/theme/tokens/` and shared UI components to TopBar, bottom tabs, cards, buttons, text fields, placeholders, dialogs, workout numbers/units and screen-reader content. Screen JSX remains dumb; no hard-coded font branches. Validate matras, conjuncts, line wrapping, text input caret/selection, numeric input, large accessibility text, mixed Hindi/English strings and native Android/iOS rendering.

**Typography mode is not a language selector.** Future languages require locale resources/message keys and appropriate formatting; font switching never translates content. Exact Custom font family, weight/style map, licensing, binary footprint and initial locale availability are **still pending**. No fonts/code/localizations have been added by Phase 0 documentation.

### Dumb/presentational screen rule (ADR-015)

**Every screen is dumb:** it renders typed view state and shared token-driven components, and forwards typed user-intent callbacks. It does **not** fetch data, call repositories/SQLite/Supabase/SecureStore/HTTP, decide auth state, calculate workout rules, compute theme materials, or own TopBar scroll thresholds. Feature hooks/controllers coordinate presentation and effects **outside screens**; feature domain/application owns business logic; feature data/platform adapters own I/O. Route layouts/shared scroll coordinator own tab visibility and root TopBar reveal. Small transient focus/animation state in reusable controls is presentation only, not workout/business logic.

These are **future folder boundaries only**: no application code or folders have been created.

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

**Owner-selected (ADR-015):** **initially four bottom-root screens Home, Workout, Library, You** through a **changeable navigation registry** (future number/order owner-controlled), a **Standard bar layout now**, and optional Pill layout reserved for later; all detailed screens hide the bottom bar. Shared scroll-revealed root TopBar (nested immediately visible), **config-driven Standard bottom bar with default Glass material** (Pill layout deferred), centralized theme tokens, dumb screens and independent Glass/Solid × Light/Dark preferences. **Selected (ADR-016):** Tnyx display name, image-sampled Aqua Teal brand anchor `#00BFBF` (replaces Violet), Default/Custom Hindi-ready typography. **Pending:** accessible derived Light/Dark/glass tokens and separate success accent, Custom font/license, initial Light/Dark, scroll threshold/motion, Android/iOS application IDs, icon, detailed visual hierarchy and real-device QA.

Use the [Phase 0 design and Phase 1 approval pack](docs/22-PHASE-0-DESIGN-AND-PHASE-1-APPROVAL.md) for exact review choices, Restore/Skip versus future Sync automatic hydration copy, acceptance criteria and the owner sign-off template. Do not read this paragraph as sign-off, app code authorization or a delivered UI.

## 07 · Future design assets

When implementation is approved: create real Figma/source assets, app icon, splash screen, state screenshots and a screenshot/asset provenance index. Do not use fake product screenshots in the current documentation-only README.

---

**Decision gate:** Visual direction is proposed and must be approved before application UI implementation.

[← README](README.md) · [Go to architecture →](docs/02-SYSTEM-ARCHITECTURE.md)
