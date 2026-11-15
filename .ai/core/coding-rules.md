# 🧑‍💻 Coding rules (mock shell exists; further work gated)

> The Phase 1.1 Expo/TypeScript **mock UI shell** and its basic tooling merged via PR #11 on 2026-11-15. This does **not** authorize any new feature, real Auth/OTP, database, cloud integration or deployment.

- Keep changes focused and reviewable. Read existing code before designing replacements.
- Architecture v2.1: feature-owned `domain/` repository interfaces and `data/` implementations; hooks/UI consume injected contracts, never import SQLite, Supabase SDK or SecureStore directly. Add `application/` use cases only for complex flows; pure domain rules stay independent of React.
- `src/app/` owns routes/layouts and root providers only; `src/platform/` future shared database connection, migrations, Auth/keys and **single-bound-account lock/reset** (no account switching); `src/shared/` non-business reuse. Ban cross-feature deep imports: use public `index.ts` APIs. No empty folder or npm package per feature.
- Phase 1.1 already includes TypeScript, ESLint, design-token checks and static shell tests; **feature-specific import/dependency boundaries** for Auth, domain and database modules remain to be designed and enforced in separately approved slices. Do not install additional tooling without scope approval.
- No Supabase workout CRUD directly from UI in local-only mode.
- SQL operations are parameterized and transactional; design migrations before applying them.
- Preserve stable record IDs, account ownership and testable deletion behaviour.
- Never build a feature around perpetual connectivity; local save remains authoritative.
- New modules, dependencies, native plugins, secrets or schemas require an approved scope and updated specs.
- Report only tests actually run, with exact scope and limitations. No fabricated build screenshots or fake “CI passed” statements.
- Every **additional** Phase 1 slice needs its own written owner approval and applicable [readiness/security gates](../../docs/21-PHASE-1-READINESS.md); Phase 1.1 approval is not reusable.

**Canonical:** [AGENTS.md](../../AGENTS.md) · [Repository structure](../../docs/10-REPOSITORY-STRUCTURE.md) · [Test plan](../../docs/08-TEST-PLAN.md) · [Definition of done](../../docs/15-DEFINITION-OF-DONE.md)
