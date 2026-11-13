# 🔀 Workflow and handoff rules

## Read sequence
1. [AGENTS.md](../../AGENTS.md)
2. [Current pointer](../current.md)
3. One active task record if assigned
4. Only the required [core summaries](README.md) and canonical documents
5. Verify the live GitHub branch/PR/files before any changes

## Single owner / single pointer
- Exactly one active primary task pointer at a time. Tasks can be marked `In Progress`, `Blocked`, `Ready for Review` or `Complete`.
- Track a bounded objective, allowed files, owner, approval, source links, verifiable progress, tests and next action.
- Other agents may review independently without becoming the implementation owner. Avoid simultaneous conflicting writes.
- Review is recommended before merging; self-review and green CI do **not** equal an independent approval.
- Do not invent formal GitHub approval or infer it from a conversation summary.

## Approval gates
- Phase 0: documentation, task context and review templates only.
- New implementation, deployment, database schema, paid API, OAuth/native permissions, remote data collection, privacy changes or destructive Git operations require owner authorization.
- A documentation PR merge does not approve architecture decisions or Phase 1.
- Creating a PR never grants merge permission; record scope-specific authorization before merge.
- If an independent review is deferred, record owner authorization and reasons, open risks and follow-up checkpoint; do not silently waive it.

## Work cycle
1. **Plan**: tie the objective to an issue and canonical specification; record scope/non-goals.
2. **Implement only approved work**: focused branch, clear commit messages, no unrelated edits.
3. **Verify**: report exact checks run, skipped checks and findings; account/security concerns need explicit tests.
4. **Review**: use [PR workflow](../../docs/11-PR-REVIEW-WORKFLOW.md), then obtain owner authorization to merge.
5. **Post-merge**: verify merged SHA and relevant paths, update docs/issues, then archive the completed task and clear the pointer.
6. **Resume**: if branch/PR no longer exists or status conflicts with GitHub, reconcile first; historical SHAs are not current branch heads.

## Minimal task record
Copy [task template](../tasks/TEMPLATE.md). Avoid transcripts, copy-pasted official docs and large raw terminal logs. Keep active task context concise (target ~150 lines).

**Canonical:** [AGENTS.md](../../AGENTS.md) · [Contribution](../../CONTRIBUTING.md) · [Review workflow](../../docs/11-PR-REVIEW-WORKFLOW.md) · [Post merge](../../docs/12-POST-MERGE-PLAYBOOK.md)
