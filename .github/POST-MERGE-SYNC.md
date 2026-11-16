# Post-Merge Git Sync — Tio Workspace

**Status:** Safe, manual procedure for humans and AI coding agents after a **verified** GitHub merge. This is guidance, **not** an automated script, a merge/deploy authorization, or a replacement for [AGENTS.md](../AGENTS.md) and the [post-merge playbook](../docs/12-POST-MERGE-PLAYBOOK.md).

**Repository:** `im-tnyx/Tio-Workspace` · **Stack:** Expo / React Native / TypeScript · **Default branch:** `main`. Do **not** copy Flutter, Watch OS, Melos or Gradle tasks from unrelated Tio projects.

## When to use it

- After GitHub confirms a PR merged into `main`, including an owner-authorized squash merge.
- Before starting a **separately approved** new task when your local `main` may be behind.
- After an authorized fast-forward update to `main`, or to recover safe local context after a different agent merges work.
- When closing the post-merge handoff and archiving a **verified completed** task.

A GitHub merged PR does **not** imply that the app was built, published, deployed, tested on a physical device, or that the next Phase 1 implementation slice was approved.

## 1. Safety first: inspect the exact worktree

Run in the **Tio Workspace checkout**, not another project. For the owner's Windows checkout:

```powershell
cd G:\projects\Tio-Workspace
git status -sb
git branch --show-current
git worktree list
```

Check for staged, unstaged **and untracked** user files. Expected clean status may be `## main...origin/main` **or** a clean task branch. **Do not assume cleanliness from the branch name.**

If there are changes, **stop**. Ask the owner about preserving them; use an explicitly agreed commit or carefully reviewed stash only if appropriate. Never silently run `git reset --hard`, `git clean -fd`, `git checkout -- .`, forced branch switches, or auto-stash. If `main` is checked out in another worktree, use that worktree or coordinate with its owner; do not force the checkout.

## 2. Verify the actual GitHub merge

Confirm that GitHub shows **merged**, not merely `closed` or a green check. Record PR number, base branch, **merge commit SHA**, date, and changed scope; compare with [PR review workflow](../docs/11-PR-REVIEW-WORKFLOW.md).

For example, if GitHub CLI (`gh`) is already configured with access:

```powershell
gh pr view <PR_NUMBER> --repo im-tnyx/Tio-Workspace --json state,mergedAt,mergeCommit,baseRefName
```

Otherwise inspect the PR on GitHub or use an authorized connector. **Use the returned merge commit SHA** for verification. With **squash merges** the original PR-head commit is typically **not** part of `main` history. Do not treat `git branch --contains <PR_HEAD_SHA>` as a valid squash-merge test.

## 3. Standard non-destructive local sync

Only after Step 1 reports a clean worktree and the owner of any separate worktree agrees:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git status -sb
```

If `git switch` is unavailable with an older Git, use `git checkout main` **only when the worktree is clean**.

**Why `--ff-only`?** It will refuse a divergent local branch instead of creating an accidental merge commit. If `git pull --ff-only` fails, **stop** and investigate; do **not** rebase, merge, reset, force-push, or discard changes as a shortcut. Verify the remote and local repo really refer to `im-tnyx/Tio-Workspace` before any later push.

## 4. Verify refs and the merged commit

```powershell
git log --oneline -5 --decorate
git rev-parse main
git rev-parse origin/main
git status -sb
```

After a successful clean `git pull --ff-only`, local `main` and `origin/main` should have the **same SHA**. Use the **actual GitHub merge SHA** to check that the merged commit is an ancestor of the current `main`:

```powershell
git merge-base --is-ancestor <MERGE_COMMIT_SHA> main
if ($LASTEXITCODE -ne 0) { throw "Merge commit not contained in local main" }
git show --check --oneline <MERGE_COMMIT_SHA>
```

The merge commit need not still be the **tip** of `main` if subsequent PRs have landed. Do not assume a successful `git fetch` alone updated local `main`; it updates remote-tracking refs, not the checked-out branch.

## 5. Validation proportional to the merged change

| Change scope | Validations to consider | What not to claim |
|---|---|---|
| Markdown / `.ai/` only | Check GitHub-rendered Markdown, relative links, archived task pointers and merged files; inspect `git show --check <MERGE_COMMIT_SHA>` | No Expo/device build was run merely because docs merged |
| Approved Expo/React Native / TS change | `npm ci` (locked install), `npm run verify`, and `npm run expo:check` when Expo dependencies changed | Node tests are not proof of iOS/Android native behavior |
| Approved native/dependency change | Relevant Android/iOS dev-build checks, Expo compatibility and actual device QA | Expo Go may not support newly added native modules |
| Future approved Supabase / Auth / data change | Review approved migrations, grants/RLS/negative tests, session and data isolation, privacy and rollback | Docs approval is **not** permission to apply a migration |

Only execute tests that fit the changed scope and available environment. Report every check as **run / passed / failed / skipped** with the actual command, observed result and limitation. Never claim a CI run or native QA that did not occur. Do **not** run Flutter, Melos, Wear OS or Gradle from the example project as Tio Workspace verification.

## 6. Optional cleanup — never automatically destructive

After confirming a merge, and **only if** the repository owner approves deletion and no other worktree, PR or workflow still needs the branch:

```powershell
git branch -d <MERGED_LOCAL_BRANCH>
# Only with explicit owner approval, after verifying the exact remote branch:
git push origin --delete <MERGED_REMOTE_BRANCH>
```

**Important for squash merges:** `git branch -d` can refuse because the squashed source commits are not ancestors of `main`. This is a safety signal: **stop rather than using `git branch -D`**. Never force-delete automatically. Avoid deleting `main`, `tnyx/expo-preview`, protected branches, live task branches or branches owned by other agents. GitHub may have already auto-deleted a PR branch.

## 7. Start new work only from verified `main`

After recording the previous task's actual merged status and receiving a **new bounded task authorization**:

```powershell
git switch main
git pull --ff-only origin main
git status -sb
git switch -c docs/<NEW_TASK_NAME>
```

Use the appropriate `docs/`, `feat/` or `fix/` branch prefix and follow [CONTRIBUTING.md](../CONTRIBUTING.md). Do not reuse a merged source branch, begin Auth/SQLCipher/Supabase implementation merely from a merged ADR, or push to `main` directly. A new PR needs its **own** review, required App-owned `Commit attribution guard` check, and separate owner merge authorization.

**Preview branch exception:** `tnyx/expo-preview` is a dedicated Codespaces sync trigger, **not a disposable ordinary PR branch**. Do not delete or rewrite it during routine cleanup. A qualifying push invokes the [Codespaces preview workflow](../docs/27-EXPO-GO-CODESPACES-LIVE-PREVIEW.md); a `main` merge alone is not proof that the phone received new UI.

## 8. Post-merge task handoff

- Verify merged SHA, changed files, actual CI/reviewer/owner decision and any remaining follow-ups.
- Reconcile [`.ai/current.md`](../.ai/current.md) against **live** GitHub. Once a task is genuinely complete, archive the record under [`.ai/archive/`](../.ai/archive/README.md), clear/update the pointer and preserve historical evidence.
- Make such changes through **another focused reviewable PR** when needed. Never silently commit directly to protected `main`; do not label post-merge updates as merged before GitHub verifies them.
- Record separately if the temporary guard exception is owner-confirmed removed but cannot be independently inspected. Never remove or weaken permanent branch protections, guard workflows, App checks or review requirements.
- Report outstanding native QA, preview workflow limitations and Phase 1.2 approval blockers honestly.

## Copyable handoff checklist

- [ ] Correct repository and actual local branch/worktree identified.
- [ ] Worktree inspected; user changes preserved (or sync deferred).
- [ ] PR confirmed merged; actual **merge commit SHA** recorded.
- [ ] `origin` fetched; `main` updated **fast-forward only**.
- [ ] `main` and `origin/main` SHAs compared; merged commit is an ancestor.
- [ ] Relevant post-merge validation reported accurately.
- [ ] Linked task / `.ai/current.md` / archive updated **only via authorized tracked change**.
- [ ] Old branch retained unless deletion was separately authorized and safe.
- [ ] Next bounded scope approved before a fresh branch is created.

**End-of-task report:** original branch and worktree cleanliness; PR URL and merge SHA; resulting `main` SHA; commands run and results; files/task pointers updated; skipped checks; whether any branch was deleted; next authorized action.

[Agent policy](../AGENTS.md) · [Post-merge playbook](../docs/12-POST-MERGE-PLAYBOOK.md) · [PR review](../docs/11-PR-REVIEW-WORKFLOW.md)
