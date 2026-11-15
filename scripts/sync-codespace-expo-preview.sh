#!/usr/bin/env bash
set -euo pipefail

readonly expected_branch="tnyx/expo-preview"
readonly expected_remote="https://github.com/im-tnyx/Tio-Workspace"
readonly script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly project_root="$(cd -- "${script_directory}/.." && pwd)"
readonly accepted_sha="${1:-}"

if [[ ! "$accepted_sha" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Refusing sync: expected the accepted push SHA as a 40-character lowercase hex argument.\n' >&2
  exit 1
fi

cd "$project_root"

actual_branch="$(git branch --show-current)"
if [[ "$actual_branch" != "$expected_branch" ]]; then
  printf 'Refusing sync: expected branch %s, found %s.\n' "$expected_branch" "${actual_branch:-detached HEAD}" >&2
  exit 1
fi

actual_remote="$(git remote get-url origin)"
actual_remote="${actual_remote%.git}"
if [[ "$actual_remote" != "$expected_remote" \
  && "$actual_remote" != "git@github.com:im-tnyx/Tio-Workspace" \
  && "$actual_remote" != "ssh://git@github.com/im-tnyx/Tio-Workspace" ]]; then
  printf 'Refusing sync: origin does not identify %s.\n' "$expected_remote" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain=v1 --untracked-files=normal)" ]]; then
  printf 'Refusing sync: the Codespace has uncommitted or untracked work. Commit or safely move it before retrying.\n' >&2
  exit 1
fi

before_sha="$(git rev-parse HEAD)"
printf 'Fetching accepted push %s into this Codespace.\n' "$accepted_sha"
git fetch --no-tags origin "$accepted_sha"
target_sha="$(git rev-parse FETCH_HEAD^{commit})"
if [[ "$target_sha" != "$accepted_sha" ]]; then
  printf 'Refusing sync: fetched commit differs from the accepted push SHA.\n' >&2
  exit 1
fi

if [[ "$before_sha" != "$target_sha" ]]; then
  git merge --ff-only "$target_sha"
fi

readonly dependency_state_directory="${HOME}/.cache/tnyx-expo-preview"
readonly dependency_marker="${dependency_state_directory}/dependency-manifests.sha256"
mkdir -p "$dependency_state_directory"
current_dependency_hash="$(sha256sum package.json package-lock.json | sha256sum | cut -d ' ' -f 1)"
installed_dependency_hash=""
if [[ -f "$dependency_marker" ]]; then
  installed_dependency_hash="$(<"$dependency_marker")"
fi

if ! git diff --quiet "$before_sha" "$target_sha" -- package.json package-lock.json \
  || [[ "$current_dependency_hash" != "$installed_dependency_hash" ]]; then
  printf 'Dependency lock changed or is not installed; stopping Expo before npm ci.\n'
  node scripts/start-codespace-expo.mjs --stop
  npm ci
  printf '%s\n' "$current_dependency_hash" > "$dependency_marker"
fi

node scripts/start-codespace-expo.mjs
printf 'Codespace is synced to %s.\n' "$target_sha"
