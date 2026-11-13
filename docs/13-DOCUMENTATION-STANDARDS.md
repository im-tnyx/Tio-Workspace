# ✍️ Documentation design & quality standards

**Status:** Proposed canonical style guide for this repository.

[← Docs hub](00-INDEX.md) · [🎨 Design system](../DESIGN.md) · [🤖 Agent rules](../AGENTS.md)

## 01 · Reusable page anatomy

```text
# [Relevant emoji] Meaningful title
**Status:** Planned / In review / Approved / Implemented

[← Docs hub](00-INDEX.md) · [Related page](...)

> [!NOTE]
> One essential caveat, only if necessary.

## Context
## Decision / requirements
## Architecture or flow (Mermaid if useful)
## Risks and edge cases
## Verification / acceptance
## Related references
```

Each page should be readable standalone and give the reader a clear navigation route home. Prefer one meaningful diagram over a wall of ASCII art; use tables for comparisons, not long narrative disguised as data.

## 02 · Visual language

| Element | Guidance |
|---|---|
| Hero | One icon, clear title, one-sentence promise |
| Status | Say **planned** if it is planned; never fake live build badges |
| Diagram | GitHub Mermaid fenced block with understandable node text |
| Tables | Short columns, scannable entries, no tiny unreadable paragraphs |
| Callouts | Use GitHub native `[!NOTE]` or `[!IMPORTANT]` sparingly |
| Links | Prefer relative paths to tracked files for maintainability |
| Images | Accessible alt text, source/license documented, no speculative screenshots |
| Code | Labeled language fence and valid standalone example |
| Lists | Prefer concise procedures with measurable acceptance criteria |

## 03 · Writing rules

- Use direct English for engineering specs; user-facing UI copy may be localized later.
- Expand acronyms on first use and distinguish `account data`, `local workout data`, `AI request data`, `backup` and `sync`.
- Cite external claims in relevant docs and revalidate changing third-party provider details before implementation.
- Dates should be ISO `YYYY-MM-DD` for engineering metadata; explain timezones.
- Do not assert automatic backup, guaranteed session validity or universal iCloud capability before device tests.
- Write explicit **no-go** and **out-of-scope** sections for risky features.
- Spell out alternate/error flows and testable outcomes.

## 04 · Maintenance and consistency

Every PR editing a product contract checks: README, index, ADR, feature specs, security, tests and roadmap. File title/number conventions should remain stable; remove stale links after renames. Avoid duplicating a whole requirement in multiple places; use navigation links when possible.

## 05 · Quality gate

- [ ] No broken relative file links.
- [ ] Markdown preview is readable on desktop and mobile GitHub.
- [ ] Mermaid diagram renders with meaningful labels.
- [ ] Tables are not excessively wide.
- [ ] No secret, personal data or fake implementation status.
- [ ] New docs appear in [documentation hub](00-INDEX.md).
- [ ] Changed requirements have relevant acceptance tests.

---

[← Docs hub](00-INDEX.md) · [Contribution workflow →](11-PR-REVIEW-WORKFLOW.md)
