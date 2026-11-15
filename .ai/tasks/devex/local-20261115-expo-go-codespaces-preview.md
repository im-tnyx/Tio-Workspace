# Expo Go live preview from GitHub Codespaces

| Field | Value |
|---|---|
| Status | In Progress |
| Objective | Let the owner manually create one Codespace on `tnyx/expo-preview`, then have owner pushes wake/sync it so Expo Go can load the latest compatible mock-shell UI without a local machine |
| Implementation owner | Codex local workspace session; repository owner keeps GitHub secret/Codespace and merge authority |
| Previous agent | None |
| Last commit agent | Codex; verify latest SHA on [PR #18](https://github.com/im-tnyx/Tio-Workspace/pull/18) before merge |
| Tracking / approval | Owner selected “Dedicated preview branch + auto-wake” in this conversation on 2026-11-15; no merge or Codespace start authorization is inferred |
| Branch / PR | `tnyx/expo-preview` / [#18](https://github.com/im-tnyx/Tio-Workspace/pull/18) |
| Base SHA / inspected HEAD | `095c3edb4a7b1969598bc01162d66496febbf0c2` (`main` at task start) |
| Platform and file scope | GitHub Actions, GitHub Codespaces dev container, Expo CLI setup docs and `.ai/` task continuity; no application feature code |
| Created / updated | 2026-11-15 |

## Required context

- [x] Read root `AGENTS.md`, `.ai/current.md`, task template, docs index, PR review workflow, and post-merge playbook.
- [x] Verified local root `G:\projects\Tio-Workspace`, clean worktree, branch and base SHA before editing.
- [x] Verified live repository `im-tnyx/Tio-Workspace`, default branch `main`, and open PR #17.
- [x] Read [Phase 1 readiness](../../../docs/21-PHASE-1-READINESS.md), [Phase 1.1 shell guide](../../../docs/24-PHASE-1-1-SHELL.md), and existing EAS preview workflow.
- [x] Consulted official Expo and GitHub Codespaces documentation on login, tunnels, lifecycle, API permissions and SSH.
- [x] Verified published PR #18 head `d8cea24ede6b82a29b937cdeabe2b282251780b0` and read [Codex review #5912003077](https://github.com/im-tnyx/Tio-Workspace/pull/18#pullrequestreview-5912003077); recheck after the remediation push.

## Approved scope / non-goals

- Add `.devcontainer/devcontainer.json` to install locked dependencies and start Expo after a manual Codespace create/resume.
- Add a secret-less push signal for `tnyx/expo-preview` and a trusted default-branch worker that accepts only owner pushes, finds one matching Codespace, wakes it if stopped, and SSH-syncs its clean worktree with fast-forward-only Git.
- Add an idempotent Expo starter and fail-closed sync script; install the tunnel helper in the Codespace image lifecycle using Expo's documented global package route.
- Document the one-time owner actions for a `main`-restricted `expo-codespaces-trusted` environment with its `CODESPACES_TOKEN` environment secret, manual Codespace creation, and same-account Expo CLI login.
- Out of scope: starting/creating the Codespace in this task, setting or viewing token secrets, modifying GitHub repo security settings, EAS publishing, app features/UI, Auth, Supabase, SQLite, releases, or production.
- Approval source: owner's explicit selection of the dedicated preview branch plus auto-wake after the Codespaces-write secret and compute implications were disclosed.

## Selected skills and tools

- GitHub connector: verified repository metadata, open PR #17, branch and PR state.
- Expo official documentation: current CLI tunnel dependency, Expo Go account sign-in and tunnel behavior.
- GitHub official documentation: Codespaces REST permissions, Codespaces SSH, lifecycle and idle-time behavior.
- No Expo-specific installed skill was available. No new external service or credential was created.

## Durable decisions

- First Codespace creation is manual and remains owner-controlled; push workflows never create one.
- Only a successful push signal for `tnyx/expo-preview` by `im-tnyx` can wake/sync. The signal has no secret; trusted worker code comes from the default branch. PR open, review, merge, main pushes and other branches do not trigger this worker.
- Use an environment-scoped Actions secret `CODESPACES_TOKEN` in `expo-codespaces-trusted`, restricted to `main`, separate from Expo/EAS `EXPO_TOKEN`; the owner configures it directly in GitHub.
- Pass the accepted `workflow_run.head_sha` into Codespace sync and fetch that immutable commit, so a later branch update cannot change what this run executes.
- Remote sync is clean-worktree-only and `git merge --ff-only`; it never resets, stashes, or overwrites Codespace edits.
- Expo Go needs the same Expo account as Expo CLI. Tunnel URLs are publicly reachable to anyone with the URL.
- PR #17 is still open and edits `.ai/current.md`; its owner must reconcile the active-task pointer before merging either PR. This implementation does not modify PR #17's branch.

## Progress

- [x] Verify scope and branch from live local/GitHub state.
- [x] Prepare Codespaces config, push workflow, sync/starter scripts, docs and task pointer.
- [x] Keep the repository lockfile unchanged; use the official global tunnel-helper install in Codespaces `postCreateCommand`.
- [x] `git diff --check`, `node --check`, Codespaces JSON parsing, and both workflow YAML parses passed.
- [ ] Bash syntax parser unavailable in this Windows session (`bash -n` returned `E_ACCESSDENIED`); inspect script and retry with available CI/runtime before merge.
- [x] Independent AI-assisted review found and helped close dependency-install ordering and retry-marker issues.
- [x] Re-review of the final staged diff returned `PASS` against base `095c3edb4a7b1969598bc01162d66496febbf0c2`.
- [x] Published [PR #18](https://github.com/im-tnyx/Tio-Workspace/pull/18) at initial head `d8cea24ede6b82a29b937cdeabe2b282251780b0`.
- [x] Codex [review #5912003077](https://github.com/im-tnyx/Tio-Workspace/pull/18#pullrequestreview-5912003077) recorded two blocking security findings; remediation is in progress.
- [ ] Push remediation, verify its exact remote head/checks, and request re-review.
- [ ] Owner configures the secret and manually creates one Codespace after merge.

## Changed files

- `.devcontainer/devcontainer.json`
- `.github/workflows/expo-preview-push-signal.yml`, `.github/workflows/expo-codespaces-preview-worker.yml`
- `scripts/start-codespace-expo.mjs`
- `scripts/sync-codespace-expo-preview.sh`
- `docs/00-INDEX.md`, `docs/27-EXPO-GO-CODESPACES-LIVE-PREVIEW.md`
- `.ai/current.md`, this task file

## PR review evidence and findings

- Review requested from: `/root/codespaces_preview_review` (independent AI-assisted local review).
- Reviewer identity / URL / assessed scope: local independent AI-assisted review passed final staged diff against base `095c3edb4a7b1969598bc01162d66496febbf0c2`. GitHub Codex [review #5912003077](https://github.com/im-tnyx/Tio-Workspace/pull/18#pullrequestreview-5912003077) inspected published head `d8cea24ede6b82a29b937cdeabe2b282251780b0`.
- Review status: `CHANGES_REQUESTED` in task terms for two actionable Codex findings; GitHub recorded `COMMENTED`, not formal `APPROVED` or `REQUEST_CHANGES`.
- Verdict: P2 repository-level token scope and P1 mutable branch-tip sync; fixes must be reviewed at the new pushed head.
- Merge approval: not granted.

## Validation evidence

- Checks run on the current working tree: `git diff --check` pass; `node --check scripts/start-codespace-expo.mjs` pass; `.devcontainer/devcontainer.json` parses as JSON; `js-yaml` parses both workflows.
- Credential-pattern scan of staged files found no token-like strings.
- `npm install --package-lock-only --ignore-scripts` could not reach `registry.npmjs.org` (`ENOTFOUND`); no lockfile change was needed after moving the Expo tunnel helper to the Codespace global install.
- `bash -n scripts/sync-codespace-expo-preview.sh` unavailable: host Bash launch returned `E_ACCESSDENIED`.
- App startup, Codespaces API start/SSH, Expo CLI login and phone connection remain unverified until owner performs the documented one-time setup.
- Not run: Expo Go physical-device connection, live Codespace lifecycle, GitHub Actions wake/SSH, and Expo account login; no Codespace or token was created/configured by this task.
- Security boundary: token value remains owner-managed in the `main`-restricted GitHub Actions environment secret; no credential is present in source.
- Independent review findings: `scripts/sync-codespace-expo-preview.sh` initially ran `npm ci` before stopping Metro and fingerprinted only `package-lock.json`; both issues were fixed by stopping first and recording hashes of both dependency manifests after a successful install. Final staged diff re-review returned `PASS`; exact published head still needs review.
- GitHub Codex found that a repository secret was readable by other repository workflows and that fetching the mutable preview branch could execute a later unaccepted push. The remediation scopes the token to `expo-codespaces-trusted` with an exact `main` deployment branch rule and fetches only the SHA from the qualifying push. New-head verification and review remain pending.

## Handoff

**Next owner:** Repository owner and independent PR reviewer.

**Next authorized action:** Push and re-review the security remediation at the exact PR head. After a separately authorized merge, the owner configures the `main`-restricted environment and its token, manually creates one Codespace on the preview branch, and signs Expo CLI into the existing Expo Go account.

**Post-merge synchronization/archive needed:** Yes, only after owner-authorized merge and verified file/branch state.
