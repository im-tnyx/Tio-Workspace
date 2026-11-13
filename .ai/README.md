<div align="center">

# 🤖 TIO / AI Context System

**Small, durable context for reliable agent handoffs.**

[🏠 Project](../README.md) · [📜 Agent policy](../AGENTS.md) · [🧭 Current work](current.md)

</div>

> [!IMPORTANT]
> This is an **agent memory and task-continuity layer**, modeled on the structure of [Tio Ledger's AI context](https://github.com/im-tnyx/Tio-Ledger/tree/main/.ai). It is **not a second product specification**, not an approval mechanism, and not storage for user or workout data. The app is still in documentation-only Phase 0.

## 🚀 Startup: read only what's needed

1. Read repository [`AGENTS.md`](../AGENTS.md), the main authority for agent boundaries.
2. Read [`.ai/current.md`](current.md) to discover the single active objective.
3. Only if an active task is listed, read **that one task file**.
4. Read just the [`core/`](core/README.md) summaries explicitly named in that task's `Required Context`.
5. Read the linked canonical `docs/`/`DESIGN.md` files and live GitHub source needed for the task.
6. Verify actual repository branch, commit, PR state, approval, and changed files. These always supersede stale context notes.

**Never** preload the entire `tasks/` or `archive/` folders, or assume previously written status is current.

## 🗂 Context layout

```text
.ai/
├── README.md                 # How agents load and maintain context
├── current.md                # Single active-task pointer (starts idle)
├── core/
│   ├── README.md             # Topic index and loading guidance
│   ├── architecture.md       # Local-first system map
│   ├── coding-rules.md       # Dependency and quality constraints
│   ├── product-rules.md      # Workout-data and login invariants
│   ├── security-rules.md     # Auth, isolation, consent and secrets
│   ├── ui-rules.md           # UI and documentation design
│   └── workflow-rules.md     # Task ownership, PR and merge gates
├── tasks/
│   ├── README.md             # Task lifecycle and naming
│   └── TEMPLATE.md           # Copy for one bounded task
└── archive/
    └── README.md             # Completed task retention rules
```

Folders `tasks/<scope>/` and `archive/<year>/` are created **only when records exist**. No empty placeholder folders or copied Tio Ledger history.

## 🧭 Truth and authority

| Authority | Content | Rule |
|---|---|---|
| GitHub live state + actual source/config | Reality of branches, PRs, tests, deployed code | Verify directly |
| [`AGENTS.md`](../AGENTS.md) | Agent authorization and restrictions | Follow before edits |
| [`docs/`](../docs/00-INDEX.md), [`DESIGN.md`](../DESIGN.md), approved ADRs | Product and architecture intent | Canonical design sources |
| `.ai/core/` | Short read-on-demand reminders | Summaries only; update when stale |
| `.ai/current.md` + `.ai/tasks/` | What task is active and how to resume it | Continuity, not permission |
| `.ai/archive/` | Historical task notes | Not authoritative for current state |

Conflicts are resolved in favor of the real state and canonical documentation, not whichever AI summary was edited most recently.

## 🧹 Maintenance contract

- Keep `current.md` to one task pointer, real scope, blockers, and next action. **No hardcoded “current HEAD” SHA.**
- Keep each active task concise (target ≲150 lines), with decisions, links, check results, review state and handoff.
- Never store session tokens, keys, private workout records, entire conversation transcripts, generated secrets, provider credentials or raw command logs.
- A PR merge does not make its architecture recommendations automatically approved.
- Archive completed task records **after** verifying merge and post-merge checks. Clear `current.md` in the same housekeeping change or an explicitly tracked follow-up.
- Use a branch and reviewable PR for project changes. An agent must not infer merge authorization.

---

[📋 Task instructions](tasks/README.md) · [📦 Archive policy](archive/README.md) · [🚦 Phase 0 decisions](../docs/17-PHASE-0-DECISION-PACK.md)
