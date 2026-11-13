# 📋 Task lifecycle

[← AI context](../README.md) · [Current pointer](../current.md) · [Template](TEMPLATE.md)

This directory stores **active or paused** bounded work only; do not preload it on every new conversation.

1. After the owner authorizes a task, create one file under `.ai/tasks/<scope>/local-YYYYMMDD-short-slug.md` (e.g. `docs`, `auth`, `workouts`, `backup`, `security`).
2. Copy [`TEMPLATE.md`](TEMPLATE.md), fill objective, scope, owner, approval source, branch, relevant canonical docs and the next action.
3. Set [`.ai/current.md`](../current.md) to **that one** task. Never point at multiple tasks.
4. Update task state when evidence or blockers materially change. PR comments can hold the long review conversation; do not duplicate it here.
5. After confirmed merge and post-merge verification, move to `.ai/archive/<year>/` and clear/update `current.md` in a tracked change.

Allowed states: **In Progress · Blocked · Ready for Review · Complete**.

Do not create an implementation task until the [Phase 1 readiness gate](../../docs/21-PHASE-1-READINESS.md) is explicitly approved. No private user data, credentials or raw execution logs in tasks.
