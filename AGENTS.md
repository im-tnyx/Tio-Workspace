# 🤖 Agent Instructions — Tio Workspace

> **Current operating mode: DOCUMENTATION-ONLY.** This file is guidance for AI coding agents and human maintainers. It does not authorize new app code, infrastructure deployment or merge operations.

[🏠 README](README.md) · [🧠 AI Context](.ai/README.md) · [🎨 Design rules](DESIGN.md) · [📚 Docs hub](docs/00-INDEX.md) · [🤝 Contributor guide](CONTRIBUTING.md)

## Session start / context loading

1. Read this §AGENTS.md§ first. Then read [§.ai/current.md§](.ai/current.md) to discover whether one task is active.
2. If and only if §Active Task§ is not §none§, load that task record and only its explicitly needed [§.ai/core/§](.ai/core/README.md) summaries.
3. Open the canonical documents relevant to the objective; verify current GitHub/worktree branch, PR, commit and approval before editing.
4. Do not bulk-read §.ai/tasks/§ or §.ai/archive/§ and do not treat .ai summaries as authority above product specs or actual source state.

## Source of truth (read in order)
1. `README.md` — project status and foundational promises.
2. `docs/09-DECISIONS.md` — agreed intentions vs unapproved proposals.
3. `docs/01-PRODUCT-REQUIREMENTS.md` — product requirements.
4. `docs/02-SYSTEM-ARCHITECTURE.md` — module and data boundaries.
5. `docs/04-AUTH-AND-SECURITY.md` and `docs/05-BACKUP-AND-SYNC.md` — privacy/security requirements.
6. `DESIGN.md` and `docs/13-DOCUMENTATION-STANDARDS.md` — consistent presentation.
7. `docs/17-PHASE-0-DECISION-PACK.md` and `docs/21-PHASE-1-READINESS.md` — pending choices and implementation gate.
8. `docs/11-PR-REVIEW-WORKFLOW.md` and `docs/12-POST-MERGE-PLAYBOOK.md` — delivery process.

## Non-negotiable product invariants

| Must | Must not |
|---|---|
| Account required for initial registration/sign-in | Fake an offline signup flow |
| Preserve session on normal app close/reopen | Force login for every reopen |
| Store workouts locally by default | Upload workout records just because Auth exists |
| Allow already-initialized offline workout CRUD | Block workout completion on remote API availability |
| Isolate local workout records by verified account ID | Mix data between two accounts on one device |
| Put AI secrets only in server-side function secrets | Embed service-role, vendor keys or refresh secrets in code |
| Offer backup and sync only after opt-in, as distinct modes | Treat personal Drive/iCloud snapshots as realtime sync |
| Test recovery and encryption before promising safety | Claim device-loss recovery without verified backup |

## Phase-0 change scope
**Allowed now:** improve Markdown documentation, GitHub issue/PR templates and architecture decision records. Clarify requirements, explicit assumptions and acceptance tests.

**Not allowed without explicit approval:** installing or scaffolding Expo, modifying a live Supabase project, creating credentials or schemas, adding runtime dependencies, configuring production CI/secrets, changing remote RLS, integrating AI vendors, launching background sync or merging PRs.

## Editing procedure
1. Inspect current files and branch; never assume repository state or versions.
2. Prefer a focused `docs/...` branch and an auditable pull request, not direct `main` edits.
3. Update the appropriate requirement/ADR **before** implementation-oriented wording.
4. Preserve meaning: distinguish `planned`, `verified`, `deployed` and `future`.
5. Keep links relative, diagrams GitHub-compatible and the README's project status truthful.
6. Do a local/automated check when available: Markdown syntax, links, anchors, JSON/YAML examples, sensitive strings, frontmatter and diff scope.
7. Create a PR summary with scope, risks, changes, manual checks and rollback.
8. **Never merge** without review/authorization; follow `docs/12-POST-MERGE-PLAYBOOK.md` if the change is approved and merged.

## Architecture rules for future app code (after approval)
- UI -> domain/use case -> repository -> local SQLite. Network adapters must be separate.
- Domain types should not import Expo, Supabase or HTTP SDKs.
- Repository contracts make future opt-in cloud sync additive rather than a UI rewrite.
- Stable IDs, timestamps, owner IDs, migrations, deterministic conflict strategy.
- Auth token/AI key separation, least-privilege storage, encryption verification.
- User-set backup/sync consent checked at the point of every remote data transfer.
- Tests must verify offline continuity, session restoration, account switching and secure logout.

## Agent quality checklist
- [ ] Changes stay within approved phase and task.
- [ ] No secrets, personal tokens, private workout data or invented test results.
- [ ] No misleading “done” badges or claims.
- [ ] Both Android and iOS implications considered.
- [ ] New decisions logged and requirements/tests updated.
- [ ] PR description accurately states validation and limits.
- [ ] Links resolve and files are discoverable from index.

## Stop and escalate
Ask the owner to decide when a change affects cloud privacy defaults, deletion/recovery guarantees, auth requirements, encryption key custody, third-party data sharing, payments or uncontrolled infrastructure cost. For urgent exposed credentials or vulnerabilities, use `SECURITY.md` and do not post secrets into public issues.

**Status:** These are project instructions; they are not proof of agent execution or code readiness.
