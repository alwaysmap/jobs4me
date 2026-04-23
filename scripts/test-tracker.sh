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
  node "$TRACKER" init --dir "$ws" >/dev/null 2>&1
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
  # Unit 2: parseJsonArg helper — exercised via update-filter-list --add
  test_ufl_add_array_happy_path
  test_ufl_add_empty_array_noop
  test_ufl_add_missing_value_flag_only
  test_ufl_add_empty_string_value
  test_ufl_add_invalid_json_bare_token
  test_ufl_add_shape_mismatch_string_crusoe
  test_ufl_add_shape_mismatch_object
  test_ufl_add_shape_mismatch_number
  test_ufl_add_shape_mismatch_null
  test_ufl_add_shape_mismatch_boolean

  # Unit 3: wiring verification at remaining seven sites
  test_wiring_add_json_shape_mismatch
  test_wiring_update_json_shape_mismatch
  test_wiring_batch_json_shape_mismatch
  test_wiring_batch_length_invariant
  test_wiring_batch_happy_path
  test_wiring_filter_candidates_shape_mismatch
  test_wiring_set_profile_shape_mismatch
  test_wiring_set_filters_shape_mismatch
  test_wiring_set_filters_empty_object_noop
  test_wiring_ufl_remove_shape_mismatch
)

# ── Unit 2 scenarios ───────────────────────────────────────────

test_ufl_add_array_happy_path() {
  local ws
  ws=$(setup_workspace)
  local out
  out=$(node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add '["Acme"]' 2>&1)
  assert_exit_code 0 "$?" "happy-path array add"
  assert_file_contains "$ws/filters.yaml" "Acme" "filters.yaml should contain Acme"
}

test_ufl_add_empty_array_noop() {
  local ws
  ws=$(setup_workspace)
  # Prime filters.yaml with a known entry so we can prove the no-op preserves it.
  node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add '["Seed"]' >/dev/null 2>&1
  local before
  before=$(cat "$ws/filters.yaml")
  node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add '[]' >/dev/null 2>&1
  assert_exit_code 0 "$?" "empty-array no-op exit"
  local after
  after=$(cat "$ws/filters.yaml")
  if [ "$before" != "$after" ]; then
    fail "empty-array no-op should leave filters.yaml unchanged"
  fi
}

test_ufl_add_missing_value_flag_only() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "flag-only --add exit"
  assert_contains "$stderr" "missing required --add" "flag-only --add error names flag"
}

test_ufl_add_empty_string_value() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add '' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "empty-string --add exit"
  assert_contains "$stderr" "missing required --add" "empty-string --add error names flag"
}

test_ufl_add_invalid_json_bare_token() {
  local ws
  ws=$(setup_workspace)
  # Prime filters.yaml so we can detect any byte-level change on error.
  node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add '["Seed"]' >/dev/null 2>&1
  local before
  before=$(cat "$ws/filters.yaml")
  local stderr
  set +e
  stderr=$(node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add 'Crusoe' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "invalid-JSON --add exit"
  assert_contains "$stderr" "invalid JSON for --add" "invalid JSON names flag"
  assert_contains "$stderr" '["Acme", "Crusoe"]' "invalid JSON includes shape hint"
  local after
  after=$(cat "$ws/filters.yaml")
  if [ "$before" != "$after" ]; then
    fail "invalid-JSON --add should leave filters.yaml unchanged"
  fi
}

test_ufl_add_shape_mismatch_string_crusoe() {
  local ws
  ws=$(setup_workspace)
  # Prime filters.yaml so we can prove the Crusoe repro leaves it byte-for-byte unchanged.
  node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add '["Seed"]' >/dev/null 2>&1
  local before
  before=$(cat "$ws/filters.yaml")
  local stderr
  set +e
  stderr=$(node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add '"Crusoe"' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "string-shape --add exit (Crusoe repro)"
  assert_contains "$stderr" "expected JSON array for --add, got string" "Crusoe shape-mismatch error"
  local after
  after=$(cat "$ws/filters.yaml")
  if [ "$before" != "$after" ]; then
    fail "Crusoe repro should leave filters.yaml byte-for-byte unchanged"
  fi
}

test_ufl_add_shape_mismatch_object() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add '{"a":1}' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "object-shape --add exit"
  assert_contains "$stderr" "expected JSON array for --add, got object" "object-shape error"
}

test_ufl_add_shape_mismatch_number() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add '42' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "number-shape --add exit"
  assert_contains "$stderr" "got number" "number-shape error"
}

test_ufl_add_shape_mismatch_null() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add 'null' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "null-shape --add exit"
  assert_contains "$stderr" "got null" "null-shape error"
}

test_ufl_add_shape_mismatch_boolean() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add 'true' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "boolean-shape --add exit"
  assert_contains "$stderr" "got boolean" "boolean-shape error"
}

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

# ── Unit 3 scenarios: wiring verification ─────────────────────

test_wiring_add_json_shape_mismatch() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" add --dir "$ws" --json '"not an object"' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "add --json shape-mismatch exit"
  assert_contains "$stderr" "--json" "add wiring names flag"
  assert_contains "$stderr" "got string" "add wiring reports actual type"
}

test_wiring_update_json_shape_mismatch() {
  local ws
  ws=$(setup_workspace)
  # Seed a record so update has something to target; capture id from add's stdout.
  local id
  id=$(node "$TRACKER" add --dir "$ws" --json '{"company":"Acme","role":"TPM"}' 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const o=JSON.parse(d);process.stdout.write(o.id);})')
  local stderr
  set +e
  stderr=$(node "$TRACKER" update --dir "$ws" --id "$id" --json '"x"' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "update --json shape-mismatch exit"
  assert_contains "$stderr" "--json" "update wiring names flag"
}

test_wiring_batch_json_shape_mismatch() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" batch --dir "$ws" --json '{"a":1}' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "batch --json shape-mismatch exit"
  assert_contains "$stderr" "--json" "batch wiring names flag"
  assert_contains "$stderr" "got object" "batch wiring reports actual type (expected array)"
}

test_wiring_batch_length_invariant() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" batch --dir "$ws" --json '[]' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "batch empty-array length-check exit"
  assert_contains "$stderr" "batch expects a non-empty JSON array of operations" "batch length invariant preserved"
}

test_wiring_batch_happy_path() {
  local ws
  ws=$(setup_workspace)
  # Seed a record, then decline it via batch to exercise the happy path.
  local id
  id=$(node "$TRACKER" add --dir "$ws" --json '{"company":"BatchCo","role":"TPM"}' 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const o=JSON.parse(d);process.stdout.write(o.id);})')
  set +e
  node "$TRACKER" batch --dir "$ws" --json "[{\"op\":\"decline\",\"id\":\"$id\"}]" >/dev/null 2>&1
  local rc=$?
  set -e
  assert_exit_code 0 "$rc" "batch happy-path exit"
}

test_wiring_filter_candidates_shape_mismatch() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" filter-candidates --dir "$ws" --json '"x"' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "filter-candidates --json shape-mismatch exit"
  assert_contains "$stderr" "--json" "filter-candidates wiring names flag"
  assert_contains "$stderr" "got string" "filter-candidates wiring reports actual type"
}

test_wiring_set_profile_shape_mismatch() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" set-profile --dir "$ws" --json '[]' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "set-profile --json shape-mismatch exit"
  assert_contains "$stderr" "--json" "set-profile wiring names flag"
  assert_contains "$stderr" "got array" "set-profile wiring reports actual type (expected object)"
}

test_wiring_set_filters_shape_mismatch() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" set-filters --dir "$ws" --json '[]' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "set-filters --json shape-mismatch exit"
  assert_contains "$stderr" "--json" "set-filters wiring names flag"
  assert_contains "$stderr" "got array" "set-filters wiring reports actual type (expected object)"
}

test_wiring_set_filters_empty_object_noop() {
  local ws
  ws=$(setup_workspace)
  # Seed filters so we can observe no-op behavior
  node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --add '["Seed"]' >/dev/null 2>&1
  local before
  before=$(cat "$ws/filters.yaml")
  set +e
  node "$TRACKER" set-filters --dir "$ws" --json '{}' >/dev/null 2>&1
  local rc=$?
  set -e
  assert_exit_code 0 "$rc" "set-filters empty-object no-op exit"
  local after
  after=$(cat "$ws/filters.yaml")
  if [ "$before" != "$after" ]; then
    fail "set-filters --json '{}' should be a no-op"
  fi
}

test_wiring_ufl_remove_shape_mismatch() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" update-filter-list --dir "$ws" --list target_companies --remove '"x"' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "update-filter-list --remove shape-mismatch exit"
  assert_contains "$stderr" "--remove" "remove wiring names flag"
  assert_contains "$stderr" "got string" "remove wiring reports actual type (expected array)"
}

run_tests
