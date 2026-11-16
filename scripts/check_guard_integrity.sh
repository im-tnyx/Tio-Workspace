#!/usr/bin/env bash
# Guard source/workflow integrity — trusted-base execution only.
# Usage: check_guard_integrity.sh <base-sha> <head-sha> <pr> <approved-pr:head-sha>
# Exit 0 clean or exact owner approval, 1 blocked protected change,
# exit 2 technical/invalid input; never permit exceptions to technical errors.
set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "check_guard_integrity: usage: $0 <base> <head> <pr> <approval>" >&2
  exit 2
fi
base_sha="$1"
head_sha="$2"
pr_number="$3"
approved_pr_head="$4"
if [[ ! "$base_sha" =~ ^[0-9a-f]{40}$ ]] ||
   [[ ! "$head_sha" =~ ^[0-9a-f]{40}$ ]] ||
   [[ ! "$pr_number" =~ ^[1-9][0-9]*$ ]]; then
  echo "check_guard_integrity: invalid SHA or PR number." >&2
  exit 2
fi
for sha in "$base_sha" "$head_sha"; do
  if ! git cat-file -e "$sha^{commit}" 2>/dev/null; then
    echo "check_guard_integrity: missing commit $sha." >&2
    exit 2
  fi
done
if ! git merge-base --is-ancestor "$base_sha" "$head_sha"; then
  echo "check_guard_integrity: base is not an ancestor of head." >&2
  exit 2
fi

changed_file="$(mktemp)"
trap 'rm -f "$changed_file"' EXIT
# NUL separation safely handles special filenames. --no-renames ensures
# renaming or deleting a protected file is still identified as a change.
if ! git diff --no-renames --name-only -z "$base_sha" "$head_sha" > "$changed_file"; then
  echo "check_guard_integrity: failed to inspect PR diff." >&2
  exit 2
fi

protected_count=0
while IFS= read -r -d '' path; do
  case "$path" in
    AGENTS.md|.github/workflows/*|.github/PULL_REQUEST_TEMPLATE.md|docs/26-COMMIT-ATTRIBUTION-GUARD.md|scripts/check_commit_attribution.sh|scripts/check_commit_attribution_test.sh|scripts/check_attribution_base_freshness.sh|scripts/check_guard_integrity.sh|scripts/check_guard_integrity_test.sh)
      protected_count=$((protected_count + 1))
      echo "PROTECTED GUARD CHANGE: $path"
      ;;
  esac
done < "$changed_file"

if [ "$protected_count" -eq 0 ]; then
  echo "check_guard_integrity: no protected guard changes."
  exit 0
fi

# The owner/admin controls this variable through the restricted trusted
# GitHub Actions environment. Neither PR code nor PR body can set it.
# Binding both PR number and the entire head SHA prevents stale approvals.
if [ "$approved_pr_head" = "$pr_number:$head_sha" ]; then
  echo "check_guard_integrity: $protected_count protected change(s) approved for exact PR #$pr_number at $head_sha."
  exit 0
fi

echo "check_guard_integrity: $protected_count protected change(s) BLOCKED on PR #$pr_number at $head_sha." >&2
echo "Owner/admin: review independently, then set trusted environment variable ATTRIBUTION_GUARD_CHANGE_APPROVED_PR_HEAD to '<PR>:<40-hex-HEAD>'; clear immediately afterward." >&2
exit 1
