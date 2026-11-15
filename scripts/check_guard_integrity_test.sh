#!/usr/bin/env bash
# Local, disposable fixtures for trusted guard source-integrity enforcement.
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
checker="$script_dir/check_guard_integrity.sh"
[ -f "$checker" ] || { echo "integrity checker not found" >&2; exit 2; }
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
repo="$workdir/repo"
git init -q -b main "$repo"
git -C "$repo" config user.name "Test Runner"
git -C "$repo" config user.email "runner@example.invalid"
git -C "$repo" config commit.gpgsign false
mkdir -p "$repo/scripts" "$repo/.github/workflows"
printf 'base\n' > "$repo/README.md"
printf 'base\n' > "$repo/AGENTS.md"
printf 'base\n' > "$repo/scripts/check_commit_attribution.sh"
printf 'base\n' > "$repo/.github/workflows/commit-attribution-guard.yml"
git -C "$repo" add .
git -C "$repo" commit -q -m "chore: base fixture"
base_sha="$(git -C "$repo" rev-parse HEAD)"
passed=0
failed=0

run_case() {
  local expect="$1" label="$2" path="$3" mode="$4" expected_rc approval rc=0 output
  git -C "$repo" reset -q --hard "$base_sha"
  git -C "$repo" clean -q -fd
  mkdir -p "$repo/$(dirname "$path")"
  printf 'changed\n' >> "$repo/$path"
  git -C "$repo" add -A
  git -C "$repo" commit -q -m 'test: edit'
  local head_sha
  head_sha="$(git -C "$repo" rev-parse HEAD)"
  case "$mode" in
    none) approval="" ;;
    exact) approval="42:$head_sha" ;;
    wrong-pr) approval="43:$head_sha" ;;
    stale) approval="42:0000000000000000000000000000000000000000" ;;
    *) echo "bad test mode" >&2; exit 2 ;;
  esac
  case "$expect" in
    pass) expected_rc=0 ;;
    reject) expected_rc=1 ;;
    error) expected_rc=2 ;;
  esac
  output="$(cd "$repo" && bash "$checker" "$base_sha" "$head_sha" 42 "$approval" 2>&1)" || rc=$?
  if [ "$rc" -eq "$expected_rc" ]; then
    echo "PASS  [$expect] $label"
    passed=$((passed+1))
  else
    echo "FAIL  [$expect] $label (expected $expected_rc got $rc): $output"
    failed=$((failed+1))
  fi
}

run_case pass "normal application code" "src/workout.ts" none
run_case pass "normal product docs" "docs/PRODUCT.md" none
run_case pass "unrelated script" "scripts/other.sh" none
run_case reject "modified scanner" "scripts/check_commit_attribution.sh" none
run_case reject "modified trusted workflow" ".github/workflows/commit-attribution-guard.yml" none
run_case reject "new workflow" ".github/workflows/untrusted.yml" none
run_case reject "policy modification" "AGENTS.md" none
run_case reject "scanner test weakening" "scripts/check_commit_attribution_test.sh" none
run_case reject "integrity checker weakening" "scripts/check_guard_integrity.sh" none
run_case reject "wrong PR-number approval" "scripts/check_commit_attribution.sh" wrong-pr
run_case reject "stale head approval" "scripts/check_commit_attribution.sh" stale
run_case pass "exact owner PR+SHA approval" "scripts/check_commit_attribution.sh" exact

# Renames must not bypass guarded-path matching.
git -C "$repo" reset -q --hard "$base_sha"
git -C "$repo" clean -q -fd
git -C "$repo" mv scripts/check_commit_attribution.sh scripts/old_checker.sh
git -C "$repo" commit -q -m 'test: rename checker'
head_sha="$(git -C "$repo" rev-parse HEAD)"
rc=0
output="$(cd "$repo" && bash "$checker" "$base_sha" "$head_sha" 42 "" 2>&1)" || rc=$?
if [ "$rc" -eq 1 ]; then
  echo "PASS  [reject] rename protected checker"
  passed=$((passed+1))
else
  echo "FAIL  [reject] rename protected checker (rc=$rc): $output"
  failed=$((failed+1))
fi

rc=0
output="$(cd "$repo" && bash "$checker" "$base_sha" not-a-sha 42 "42:$head_sha" 2>&1)" || rc=$?
if [ "$rc" -eq 2 ]; then
  echo "PASS  [error] invalid SHA cannot be owner-exempted"
  passed=$((passed+1))
else
  echo "FAIL  [error] invalid SHA accepted (rc=$rc): $output"
  failed=$((failed+1))
fi

echo
echo "check_guard_integrity_test: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
