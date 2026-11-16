# 🤝 Contributing to Tio Workspace

**Stage:** Phase 1.1 Expo/React Native mock shell merged; real Auth, local workout database and later features remain separately approval-gated.

[🏠 Home](README.md) · [📚 Documentation](docs/00-INDEX.md) · [🎨 Design](DESIGN.md) · [🤖 Agent instructions](AGENTS.md)

## Contribution philosophy

Clear decisions before code; **small, reviewable changes**; private-by-default workout data; evidence rather than claims. Everyone contributing (human or AI) follows [AGENTS.md](AGENTS.md).

## Branch and commit conventions

| Item | Pattern | Example |
|---|---|---|
| Planning branch | `docs/short-topic` | `docs/readme-and-pr-process` |
| Approved feature | `feat/short-topic` | `feat/local-workout-editor` |
| Approved bug fix | `fix/short-topic` | `fix/session-restore` |
| Commit (Conventional Commits style) | `type(scope): message` | `docs(architecture): clarify offline login` |

Keep unrelated edits out of the same PR. Do not commit `.env` files, API keys or account credentials.

## From idea to merge

1. **Issue / decision:** describe problem, expected behaviour and references to product spec or ADR.
2. **Read first:** consult README, relevant specs, security requirements and design standards.
3. **Branch:** create a topic branch from current `main`; never make a speculative production change.
4. **Write docs/tests:** update requirements and evidence; if implementation phase has been approved, add code.
5. **Self-review:** inspect diff, validate relative links, check privacy boundaries and test results.
6. **Open PR:** use [PR template](.github/PULL_REQUEST_TEMPLATE.md), link issue, state explicit scope and risks.
7. **Review:** resolve feedback, run applicable checks and obtain owner approval.
8. **Merge:** only after approval and gates pass; prefer squash for one coherent change unless maintainer chooses otherwise.
9. **Post-merge:** verify GitHub merge, follow the [playbook](docs/12-POST-MERGE-PLAYBOOK.md), then use the [safe local Git sync procedure](.github/POST-MERGE-SYNC.md) for a clean worktree before starting newly approved work. Never reset user changes or delete branches without authorization.

> [!IMPORTANT]
> **Phase 1.1's Expo/React Native mock shell is already merged**, but real Supabase Auth/OTP, encrypted local workout storage, further app features and cloud deployments are not implemented or authorized by that merge. Every additional implementation slice requires separate, bounded owner approval; merging documentation alone does not authorize implementation or deployment.

## Review requirements

- Requirements, security and cross-platform impacts considered.
- Changed documentation is easy to scan and has functional relative links.
- No claim of implemented behaviour without verified tests.
- App changes (once approved) must include offline/account-isolation tests and migration safety where relevant.
- No hardcoded vendor keys, `service_role`, OAuth client secrets or user session tokens in source files.

See [PR review workflow](docs/11-PR-REVIEW-WORKFLOW.md) and [definition of done](docs/15-DEFINITION-OF-DONE.md).

## Documentation style

Follow [DESIGN.md](DESIGN.md) and [documentation standards](docs/13-DOCUMENTATION-STANDARDS.md): short intro, status, links, clear headings, well-labeled tables/diagrams, actionable validation and next steps.

## Reporting issues

Use the GitHub [issue template chooser](.github/ISSUE_TEMPLATE/) for product ideas, documentation gaps and reproducible bugs. For security vulnerabilities, read [SECURITY.md](SECURITY.md) instead of filing a publicly visible issue.

## Questions

If a choice changes local-vs-cloud ownership, account deletion, backups, encryption or consent, record an ADR with alternatives and obtain explicit approval **before** implementation.
