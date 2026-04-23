#!/usr/bin/env bash
# test-tracker.sh — Shell smoke harness for scripts/tracker.js.
#
# Zero runtime deps beyond `bash`, `node`, and `mktemp`.
# Bash 3.2 compatible (macOS system bash). No associative arrays, no mapfile,
# no ${var,,} lowercasing.
#
# Usage:
#   npm test                            # via scripts/package.json
#   bash scripts/test-tracker.sh        # direct
#
# Scenarios are functions named test_*. Register each in the TESTS array;
# main loops over them, prints pass/fail, exits non-zero on any failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRACKER="${SCRIPT_DIR}/tracker.js"

# Track every temp workspace created so trap can clean them up on exit.
WORKSPACES=()

cleanup() {
  local ws
  for ws in "${WORKSPACES[@]:-}"; do
    if [ -n "$ws" ] && [ -d "$ws" ]; then
      rm -rf "$ws"
    fi
  done
}
trap cleanup EXIT

# ── Helpers ────────────────────────────────────────────────────

# setup_workspace — creates a temp workspace with `tracker.js init` run inside.
# Echoes the workspace path. Caller captures with: ws=$(setup_workspace)
setup_workspace() {
  local ws
  ws=$(mktemp -d 2>/dev/null || mktemp -d -t 'jfm-test')
  WORKSPACES+=("$ws")
  node "$TRACKER" init --dir="$ws" >/dev/null 2>&1
  echo "$ws"
}

# assert_exit_code <expected> <actual> <context>
assert_exit_code() {
  local expected="$1"
  local actual="$2"
  local context="$3"
  if [ "$expected" != "$actual" ]; then
    fail "$context: expected exit code $expected, got $actual"
  fi
}

# assert_contains <haystack> <needle> <context>
assert_contains() {
  local haystack="$1"
  local needle="$2"
  local context="$3"
  case "$haystack" in
    *"$needle"*) return 0 ;;
    *) fail "$context: expected to contain '$needle', got: $haystack" ;;
  esac
}

# assert_not_contains <haystack> <needle> <context>
assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  local context="$3"
  case "$haystack" in
    *"$needle"*) fail "$context: expected NOT to contain '$needle', got: $haystack" ;;
    *) return 0 ;;
  esac
}

# assert_file_contains <path> <needle> <context>
assert_file_contains() {
  local path="$1"
  local needle="$2"
  local context="$3"
  if [ ! -f "$path" ]; then
    fail "$context: file not found: $path"
  fi
  if ! grep -q -F -- "$needle" "$path"; then
    fail "$context: file $path does not contain '$needle'"
  fi
}

# assert_file_not_contains <path> <needle> <context>
assert_file_not_contains() {
  local path="$1"
  local needle="$2"
  local context="$3"
  if [ ! -f "$path" ]; then
    fail "$context: file not found: $path"
  fi
  if grep -q -F -- "$needle" "$path"; then
    fail "$context: file $path unexpectedly contains '$needle'"
  fi
}

# assert_json_field <json-string> <dotted-path> <expected-value> <context>
# Extracts field via node -e; compares string equality against expected.
assert_json_field() {
  local json="$1"
  local path="$2"
  local expected="$3"
  local context="$4"
  local actual
  actual=$(node -e '
    const o = JSON.parse(process.argv[1]);
    const v = process.argv[2].split(".").reduce((a, k) => (a == null ? a : a[k]), o);
    process.stdout.write(v === undefined ? "__undefined__" : String(v));
  ' "$json" "$path" 2>/dev/null) || fail "$context: JSON extraction failed on path '$path'"

  if [ "$actual" != "$expected" ]; then
    fail "$context: json field '$path' expected '$expected', got '$actual'"
  fi
}

# fail <msg> — prints the failure reason and exits non-zero via the test runner.
fail() {
  echo "  ✗ $1" >&2
  return 1
}

# ── Test registry ──────────────────────────────────────────────

# Register scenarios here. Each entry must be the name of a shell function
# defined below. Units 2-5 append their scenarios to this list.
TESTS=(
)

# ── Runner ─────────────────────────────────────────────────────

run_tests() {
  local total=0
  local failed=0
  local name

  if [ "${#TESTS[@]}" -eq 0 ]; then
    echo "── test-tracker: no scenarios registered ──"
    return 0
  fi

  echo "── test-tracker: running ${#TESTS[@]} scenario(s) ──"
  for name in "${TESTS[@]}"; do
    total=$((total + 1))
    if ( "$name" ); then
      echo "  ✓ $name"
    else
      failed=$((failed + 1))
    fi
  done

  echo "── ${total} run, $((total - failed)) passed, ${failed} failed ──"
  if [ "$failed" -gt 0 ]; then
    return 1
  fi
  return 0
}

run_tests
