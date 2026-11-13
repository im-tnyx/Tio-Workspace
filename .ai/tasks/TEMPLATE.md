# [Task title]

> **Template only.** Copy to `.ai/tasks/<scope>/local-YYYYMMDD-short-slug.md` after the bounded task is approved. This file does not authorize implementation, deployment or merge.

| Field | Value |
|---|---|
| Status | In Progress / Blocked / Ready for Review / Complete |
| Objective | One concrete, measurable outcome |
| Implementation owner | Agent/human with permission to edit this slice |
| Previous agent | None / previous authorized owner |
| Last commit agent | None / agent role + inspected commit SHA |
| Tracking / approval | Issue or PR link **and separate owner authorization reference** |
| Branch | Verify current branch from actual repository |
| Base SHA / inspected HEAD | Record evidence at inspection time, not permanent current state |
| Platform and file scope | Docs / shared / iOS / Android / Auth / workouts etc. |
| Created / updated | YYYY-MM-DD |

## Required context (read on demand)
- [ ] [`AGENTS.md`](../../AGENTS.md) read and applicable constraints identified
- [ ] [Current pointer](../current.md) reconciled
- [ ] Relevant [core summary](../core/README.md) and [canonical spec](../../docs/00-INDEX.md) linked
- [ ] Live issue/PR, branch, ownership, approvals verified

## Approved scope / non-goals
- In scope: list bounded paths, features and acceptance criteria.
- Out of scope: explicitly name changes that must not be included.
- Approval source: link to the specific written owner permission.

## Selected skills and tools
- Task-to-skill mapping: skill/tool name and reason selected.
- Instructions read: exact skill or official docs path/URL (when applicable).
- Unavailable capabilities: what could not be used and why.

## Durable decisions
Record decisions actually made with approval/source links. Proposed architecture is not approval.

## Progress
- [ ] Next verifiable unit of work.

## Changed files
List exact repository paths; avoid pasted diffs or chat transcripts.

## Validation evidence
- Checks run: command/tool, observed target commit and result.
- Not run / unavailable / not applicable: state which and why.
- Required CI vs supplemental checks: verify current repository ruleset if applicable.
- Security findings vs scanner/infrastructure errors: distinguish them.
- Review type: Independent / Self-review / Automated non-binding.
- Open findings, residual risks and owner review status.

## Handoff
**Next owner:**  
**Next authorized action:**  
**Post-merge synchronization/archive needed:** Yes / No

[← Task guide](README.md) · [Root agent contract](../../AGENTS.md)
