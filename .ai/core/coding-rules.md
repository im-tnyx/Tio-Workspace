# 🧑‍💻 Coding rules (future implementation)

> No code implementation is authorized during Phase 0; these guide future **approved** work only.

- Keep changes focused and reviewable. Read existing code before designing replacements.
- Architecture v2.1: feature-owned `domain/` repository interfaces and `data/` implementations; hooks/UI consume injected contracts, never import SQLite, Supabase SDK or SecureStore directly. Add `application/` use cases only for complex flows; pure domain rules stay independent of React.
- `src/app/` owns routes/layouts and root providers only; `src/platform/` shared database connection, migrations, Auth/keys and account switch; `src/shared/` non-business reuse. Ban cross-feature deep imports: use public `index.ts` APIs. No empty folder or npm package per feature.
- After **separate Phase 1 approval**, enforce boundaries through TypeScript and ESLint; do not install tooling during Phase 0.
- No Supabase workout CRUD directly from UI in local-only mode.
- SQL operations are parameterized and transactional; design migrations before applying them.
- Preserve stable record IDs, account ownership and testable deletion behaviour.
- Never build a feature around perpetual connectivity; local save remains authoritative.
- New modules, dependencies, native plugins, secrets or schemas require an approved scope and updated specs.
- Report only tests actually run, with exact scope and limitations. No fabricated build screenshots or fake “CI passed” statements.
- Phase 1 begins only after a written owner approval and the [readiness gate](../../docs/21-PHASE-1-READINESS.md).

**Canonical:** [AGENTS.md](../../AGENTS.md) · [Repository structure](../../docs/10-REPOSITORY-STRUCTURE.md) · [Test plan](../../docs/08-TEST-PLAN.md) · [Definition of done](../../docs/15-DEFINITION-OF-DONE.md)
