# 🎨 UI and documentation rules

**Design stage (2026-11-15):** Approved **Phase 1.1 mock UI shell** is merged (Welcome, Auth previews, shared TopBar/BottomTabBar/TextField/Button, appearance tokens); no real login/workout feature or released UI. Further visual/functional work requires separately approved scope.

- Follow [DESIGN.md](../../DESIGN.md) for proposed brand palette, spacing, accessibility and document presentation.
- Workout session is focused: start/resume, set/weight/reps editing, visible local autosave, history and progress.
- At each newly approved screen, define loading, empty, offline, error and **wrong-account/single-bound-device** safety states (no account-switch UI).
- UI should say **“Saved on this device”**, not “Synced,” in local-only mode.
- Do not show false completed backup, AI results or network connectivity.
- On startup, reauthentication or a rejected different-account attempt, never show data belonging to the previously bound account while locked.
- Touch-friendly controls, responsive text scaling, explicit unit display, screen-reader labels and non-color-only status.
- README/docs use Github-compatible Markdown, Mermaid diagrams, meaningful navigation and honest planned/implemented status.
- Do not copy Tio Ledger finance UI or assets; share only the generic context-management approach.

**Canonical:** [Design system](../../DESIGN.md) · [MVP UX flows](../../docs/20-MVP-UX-FLOWS.md) · [Documentation standards](../../docs/13-DOCUMENTATION-STANDARDS.md)
