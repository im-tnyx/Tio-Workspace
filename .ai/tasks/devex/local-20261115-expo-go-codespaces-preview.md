# Expo Go live preview from GitHub Codespaces

| Field | Value |
|---|---|
| Status | REVIEW — PR #17 merged; PR #18 findings, current-head checks and owner setup pending |
| Objective | Let the owner manually create one Codespace on `tnyx/expo-preview`, then have owner pushes wake/sync it so Expo Go can load the latest compatible mock-shell UI without a local machine |
| Implementation owner | Codex local workspace session; repository owner keeps GitHub secret/Codespace and merge authority |
| Previous agent | None |
| Last commit agent | Codex; verify latest SHA on [PR #18](https://github.com/im-tnyx/Tio-Workspace/pull/18) before merge |
| Tracking / approval | Owner selected “Dedicated preview branch + auto-wake” in this conversation on 2026-11-15; no merge or Codespace start authorization is inferred |
| Branch / PR | `tnyx/expo-preview` / [#18](https://github.com/im-tnyx/Tio-Workspace/pull/18) |
| Base SHA / inspected HEAD | `095c3edb4a7b1969598bc01162d66496febbf0c2` at task start; `main` at PR #17 merge is `fdc33d719975940058018dd283c7e9b4915c0286` |
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
- Add an idempotent Expo starter and fail-closed sync script; Expo SDK 58 uses its account-signed WebSocket tunnel by default, so the Codespace only runs `npm ci`.
- Document the one-time owner actions for a `main`-restricted `expo-codespaces-trusted` environment with its `CODESPACES_TOKEN` environment secret, manual Codespace creation, and same-account Expo CLI login.
- Out of scope: starting/creating the Codespace in this task, setting or viewing token secrets, EAS publishing, app features/UI, Auth, Supabase, SQLite, releases, or production. Repository visibility and the minimum GitHub access controls became in scope through the owner's subsequent explicit public-visibility approval for this setup.
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
- Expo Go needs the same Expo account as Expo CLI and a device binary compatible with project SDK 58. Physical iPhone compatibility was not verified. Tunnel URLs are publicly reachable to anyone with the URL.
- PR #17 merged first. This branch reconciles `.ai/current.md` against its merge commit, preserves the guard policy and task evidence, and keeps PR #18 as the active pointer.

## Progress

- [x] Verify scope and branch from live local/GitHub state.
- [x] Prepare Codespaces config, push workflow, sync/starter scripts, docs and task pointer.
- [x] Keep the repository lockfile unchanged; SDK 58's default signed WebSocket tunnel does not need the optional ngrok helper.
- [x] `git diff --check`, `node --check`, Codespaces JSON parsing, and both workflow YAML parses passed.
- [x] Git Bash syntax validation passed after running the installed Git Bash with the needed host permission; the initial Windows attempt returned `E_ACCESSDENIED`.
- [x] Independent AI-assisted review found and helped close dependency-install ordering and retry-marker issues.
- [x] Re-review of the final staged diff returned `PASS` against base `095c3edb4a7b1969598bc01162d66496febbf0c2`.
- [x] Published [PR #18](https://github.com/im-tnyx/Tio-Workspace/pull/18) at initial head `d8cea24ede6b82a29b937cdeabe2b282251780b0`.
- [x] Codex [review #5912003077](https://github.com/im-tnyx/Tio-Workspace/pull/18#pullrequestreview-5912003077) recorded two blocking security findings; remediation is in progress.
- [x] Pushed remediation as `e762fe58f646c595bc323b74089bed0600ec58ff`; independent AI re-review accepted the SHA pin but kept the token-scope finding open.
- [x] Owner explicitly approved public visibility after source/history/Actions-log disclosure and audit. Verified all 694 reachable blobs and 215/215 Actions log archives had no strong secret-pattern matches; no active Actions artifacts were listed. This bounded scan cannot prove absence of every sensitive value.
- [x] Changed repository visibility to public; verified `private=false`. Configured and read back `main` protection: one PR approval, stale-review dismissal, last-push approval, conversation resolution, admin enforcement, no force pushes or deletion.
- [x] Created and verified `expo-codespaces-trusted` with exact `main` deployment branch policy; its secret list is empty.
- [x] Prior five Codex review threads were fixed and resolved; later `im-tio` review raised two new startup findings at `9e0a8e2`.
- [x] PR #17 merged as `fdc33d7`; reconciled its `.ai/current.md` and docs index conflicts on PR #18's branch without reverting the attribution guard.
- [ ] Publish the SDK 58 tunnel readiness and first-login retry fixes, then re-review the new head and required App checks.
- [ ] Owner verifies a compatible SDK 58 Expo Go binary on the physical iPhone; the logged-in Projects listing alone does not prove it.
- [x] GitHub Codex [review #5912161075](https://github.com/im-tnyx/Tio-Workspace/pull/18#pullrequestreview-5912161075) on `c35410c` reported remote SSH quoting, tunnel readiness, and Expo-generated worktree findings; remediation is prepared for review.
- [ ] Owner configures the secret and manually creates one Codespace after merge.

## Changed files

- `.devcontainer/devcontainer.json`
- `.github/workflows/expo-preview-push-signal.yml`, `.github/workflows/expo-codespaces-preview-worker.yml`
- `scripts/start-codespace-expo.mjs`
- `scripts/sync-codespace-expo-preview.sh`
- `.gitignore`; remove generated `expo-env.d.ts` from Git tracking while keeping the local file
- `docs/00-INDEX.md`, `docs/27-EXPO-GO-CODESPACES-LIVE-PREVIEW.md`
- `.ai/current.md`, this task file

## PR review evidence and findings

- Review requested from: `/root/codespaces_preview_review` (independent AI-assisted local review).
- Reviewer identity / URL / assessed scope: local independent AI-assisted review passed final staged diff against base `095c3edb4a7b1969598bc01162d66496febbf0c2`. GitHub Codex [review #5912003077](https://github.com/im-tnyx/Tio-Workspace/pull/18#pullrequestreview-5912003077) inspected published head `d8cea24ede6b82a29b937cdeabe2b282251780b0`.
- Review status: `CHANGES_REQUESTED` in task terms; GitHub Codex recorded `COMMENTED`, not formal `APPROVED` or `REQUEST_CHANGES`.
- Verdict: P1 mutable branch-tip sync fixed at `e762fe5`; P2 secret scope was blocked on the private repository but now has public-repository `main` protection and an exact-`main` environment policy. Current-head independent re-review is pending.
- Merge approval: not granted.

## Validation evidence

- Checks run on the current working tree: `git diff --check` pass; `node --check scripts/start-codespace-expo.mjs` pass; `.devcontainer/devcontainer.json` parses as JSON; `js-yaml` parses both workflows.
- Credential-pattern scan of staged files found no token-like strings.
- `npm install --package-lock-only --ignore-scripts` could not reach `registry.npmjs.org` (`ENOTFOUND`); no lockfile change was needed after moving the Expo tunnel helper to the Codespace global install.
- `bash -n scripts/sync-codespace-expo-preview.sh` passed using Git Bash with the needed host permission; an initial sandboxed attempt returned `E_ACCESSDENIED`.
- App startup, Codespaces API start/SSH, Expo CLI login and phone connection remain unverified until owner performs the documented one-time setup.
- Not run: Expo Go physical-device connection, live Codespace lifecycle, GitHub Actions wake/SSH, and Expo account login; no Codespace or token was created/configured by this task.
- Security boundary: no Codespaces token has been configured; no credential is present in source. The owner will add it only to the verified `expo-codespaces-trusted` environment after review/merge.
- Independent review findings: `scripts/sync-codespace-expo-preview.sh` initially ran `npm ci` before stopping Metro and fingerprinted only `package-lock.json`; both issues were fixed by stopping first and recording hashes of both dependency manifests after a successful install. Final staged diff re-review returned `PASS`; exact published head still needs review.
- GitHub Codex found that a repository secret was readable by other repository workflows and that fetching the mutable preview branch could execute a later unaccepted push. The remediation references `expo-codespaces-trusted` and fetches only the SHA from the qualifying push. Independent re-review of `e762fe5` found the SHA issue fixed but token access only partly mitigated: any workflow on allowed `main` could request the environment.
- Codex review #5912161075 identified three startup/sync defects: nested SSH shell quoting flattened the remote command, Metro `/status` appeared before tunnel readiness, and Expo typed-route generation modified tracked files. The follow-up removes nested `bash -lc`, checks Expo CLI's `/_expo/open` endpoint for a tunnel link as well as local Metro, and ignores/untracks generated `expo-env.d.ts` while preserving its local copy. Exact pushed-head re-review remains pending.
- Historical finding before visibility change: `im-tio` has push and `im-tnyx` has admin; private-repository `main` protection/rulesets returned HTTP 403. Owner then explicitly approved public visibility after disclosure of source/history/215 Actions logs. On the public repository, live API verification showed protected `main` with one approval, stale-review dismissal, last-push approval, resolved conversations and admin enforcement; force pushes/deletion disabled. The new Codespaces environment has one exact `main` deployment policy and no secret. This removes the identified branch-access blocker but does not replace PR review or device validation.

## Handoff

**Next owner:** Repository owner and independent PR reviewer.

**Next authorized action:** Publish the reconciled PR #18 branch, inspect current-head review/checks and close only substantively fixed threads. Keep `CODESPACES_TOKEN` out of repository secrets. Merge still requires separate owner authorization; first Codespace creation and Expo login remain owner-operated.

**Post-merge synchronization/archive needed:** Yes, only after owner-authorized merge and verified file/branch state.
