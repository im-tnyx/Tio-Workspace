# 🧭 Current AI Context

> Read after [AGENTS.md](../AGENTS.md). This is a **pointer**, not proof that a task, branch, review, deployment, or approval exists.

| Field | Value |
|---|---|
| Status | **Idle — no assigned implementation task** |
| Active Task | **none** |
| Active Scope | **none** |
| Implementation Owner | **none assigned** |
| Branch / HEAD | Resolve from GitHub or actual worktree at session start |
| Pending product review | [Phase 0 issue #2](https://github.com/im-tnyx/Tio-Workspace/issues/2) |
| Phase 1 authorization | **Not granted** |
| Last context setup | 2026-11-13 |

## Next safe action

Review the [Phase 0 decision pack](../docs/17-PHASE-0-DECISION-PACK.md) and owner-approved choices. If a bounded new task is authorized, create a record using [the task template](tasks/TEMPLATE.md), then update this pointer **on that task branch**. Until then, remain documentation-only.

## Resume protocol

1. Read [AGENTS.md](../AGENTS.md); verify the live GitHub repository, issue, PR, branch and current commit.
2. If `Active Task` is `none`, do **not** invent a task or assume the last conversation authorized one.
3. If one task is listed later, read only its task file and explicitly named core summaries.
4. Reconcile stale notes against canonical [documentation](../docs/00-INDEX.md) and actual GitHub status before acting.
5. At handoff, record a single next action and update the pointer only within the authorized scope.

**Note:** Another branch may carry a documentation PR while this default-branch pointer says idle. The PR is GitHub's authority for that review; “idle” means there is no currently assigned implementation objective.
