# Tio-Workspace — Bugbot project rules

Always-on review policy for `im-tnyx/Tio-Workspace`. Follow with `AGENTS.md`, `.github/REVIEW_GUIDE.md`, `docs/04-AUTH-AND-SECURITY.md`, and `docs/11-PR-REVIEW-WORKFLOW.md`.

## Prioritize

1. Local-first workout privacy: no default cloud upload of workouts/sets/plans.
2. Auth honesty: do not treat local GoTrue/Mailpit results as managed-hosted proof.
3. AUTH-12 / AUTH-17 / AUTH-22: flag FAIL mislabeled as PASS, or production Auth unblocked without managed proof.
4. Cutover claims: logout-alone is not complete safe cutover; Admin/`service_role` is server-only.
5. Secrets: tokens, OTPs, passwords, `service_role` values, `.env`, or real user data in diffs.
6. Scope creep: Expo UI, hosted Auth PATCH, production migrations, or GitHub protection weakening in unrelated PRs.
7. Docs/evidence PRs: `LOCAL ONLY` vs `NOT VERIFIED` vs `BLOCKED` / `INCONCLUSIVE` labels must stay accurate.
8. Attribution: no AI `Co-Authored-By` / `Assisted-by` trailers.

## Output

- Prefer Blocking / Non-blocking / Question with path:line when possible.
- Inline suggestions should be minimal and safe.
- Bot `COMMENT` is not GitHub `APPROVED` and not merge authorization.
