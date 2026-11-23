#!/usr/bin/env bash
set -euo pipefail

[[ "$GITHUB_REPOSITORY" == "im-tnyx/Tio-Workspace" ]]
[[ "$SELECTED_PR" =~ ^[1-9][0-9]*$ ]]
[[ "$PREVIEW_SHA" =~ ^[0-9a-f]{40}$ && "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"

case "$PREVIEW_OPERATION" in
  codespaces_live) environment=tnyx-expo-pr-preview-trusted ;;
  publish_update|build_preview) environment=eas-preview ;;
  *) echo '::error::Unknown preview operation.'; exit 1 ;;
esac

evidence="$(mktemp -d)"
trap 'rm -rf -- "$evidence"' EXIT
gh api "repos/$GITHUB_REPOSITORY/pulls/$SELECTED_PR" > "$evidence/pr.json"
# Reject a stale or unrelated object before fetching it.
jq -e --arg head "$PREVIEW_SHA" --arg base "$GITHUB_SHA" --arg repo "$GITHUB_REPOSITORY" \
  --arg operation "$PREVIEW_OPERATION" '
  .state == "open" and .user.login == "im-tnyx" and .base.ref == "main" and
  .head.repo.full_name == $repo and .base.repo.full_name == $repo and
  .head.sha == $head and .base.sha == $base and
  (if $operation == "codespaces_live" then any(.labels[]?; .name == "tnyx-preview")
   else .draft == false end)
' "$evidence/pr.json" >/dev/null

# Fetch objects only. No checkout, hooks or execution from the candidate tree.
git -c core.hooksPath=/dev/null fetch --no-tags --no-recurse-submodules origin "$PREVIEW_SHA"
test "$(git rev-parse 'FETCH_HEAD^{commit}')" = "$PREVIEW_SHA"
git merge-base --is-ancestor "$GITHUB_SHA" "$PREVIEW_SHA"
git diff --raw --no-abbrev --no-renames --no-ext-diff --no-textconv --ignore-submodules=none -z \
  "$GITHUB_SHA" "$PREVIEW_SHA" -- > "$evidence/diff"
# An environment can be auto-created or reconfigured. Recheck the exact
# deployment policy in the protected job as well as before scheduling it.
env_api="https://api.github.com/repos/$GITHUB_REPOSITORY/environments/$environment"
curl -fsS --max-time 20 "$env_api" | jq -e '
  .deployment_branch_policy.custom_branch_policies == true and
  .deployment_branch_policy.protected_branches == false' >/dev/null
curl -fsS --max-time 20 "$env_api/deployment-branch-policies?per_page=100" | jq -e '
  .total_count == 1 and (.branch_policies | length) == 1 and
  .branch_policies[0].type == "branch" and .branch_policies[0].name == "main"' >/dev/null

touch "$evidence/labeled.txt"
if [[ "$PREVIEW_OPERATION" == codespaces_live ]]; then
  gh api --paginate "repos/$GITHUB_REPOSITORY/issues?state=open&labels=tnyx-preview&per_page=100" \
    --jq '.[] | select(.pull_request != null) | .number' > "$evidence/labeled.txt"
fi
gh api "repos/$GITHUB_REPOSITORY/pulls/$SELECTED_PR" > "$evidence/latest-pr.json"
test "$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq '.object.sha')" = "$GITHUB_SHA"
node .github/scripts/verify-expo-live-pr.mjs "$evidence/pr.json" \
  "$evidence/latest-pr.json" "$evidence/diff" "$evidence/labeled.txt"
