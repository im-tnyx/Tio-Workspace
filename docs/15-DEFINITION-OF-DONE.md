# ✅ Definition of done (DoD)

**Status:** Proposed merge criteria and milestone exit standards.

[← Docs hub](00-INDEX.md) · [🔀 PR workflow](11-PR-REVIEW-WORKFLOW.md) · [🧪 Test plan](08-TEST-PLAN.md)

## Documentation-only PR (current stage)

- [ ] Requirement/decision clearly stated, with impact on local vs remote data.
- [ ] Related docs, decision register and acceptance tests updated.
- [ ] Formatting follows [documentation standards](13-DOCUMENTATION-STANDARDS.md).
- [ ] Relative links, tables, Mermaid and paths checked.
- [ ] No personal records, credentials, secrets or fake shipping claims.
- [ ] Review complete and owner authorizes merge.
- [ ] Follow-up work identified, not silently started.

## Feature PR (future, only after implementation approval)

- [ ] Approved requirement, ADR and acceptance scenarios exist.
- [ ] Domain logic and data-access boundaries maintained.
- [ ] Unit/integration/device tests created and **actually run** with results.
- [ ] Offline flow, auth and user-isolation tests pass where relevant.
- [ ] Migrations have tested recovery/rollback plan.
- [ ] Credentials and privacy/consent flows reviewed.
- [ ] Accessibility and Android/iOS behavior checked.
- [ ] Required CI/review gates (once configured) green.
- [ ] Rollback, documentation and post-merge verification defined.

## Milestone gate

| Milestone | Done means |
|---|---|
| Phase 0 | Docs agreed and open high-risk decisions resolved |
| Phase 1 | Persistent login + offline workout CRUD proven on devices |
| Phase 2 | Authenticated AI endpoint, provider secret hidden, safe local save |
| Phase 3 | Encrypted backup reliably restores after reinstall/new phone |
| Phase 4 | Explicit opt-in sync, safe conflict handling and RLS checks |

> [!NOTE]
> A checked Markdown task is not evidence by itself. Include actual test output, screenshots or a reproducible procedure once implementation exists.

---

[← Test plan](08-TEST-PLAN.md) · [Post-merge →](12-POST-MERGE-PLAYBOOK.md)
