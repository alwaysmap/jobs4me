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
VALIDATE_SKILL_REFS="${SCRIPT_DIR}/validate-skill-refs.js"

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

  # Unit 4: set-archetypes contract tightening
  test_set_archetypes_bare_array_errors
  test_set_archetypes_canonical_object_happy_path
  test_set_archetypes_missing_role_types_errors
  test_set_archetypes_role_types_wrong_type_errors
  test_no_json_parse_args_remains

  # Unit 5: stored_at annotations
  test_decline_stored_at
  test_stage_stored_at
  test_stage_stored_at_alias_resolution
  test_batch_decline_stored_at_top_level
  test_batch_decline_mixed_success_failure
  test_batch_decline_all_failure_omits_stored_at
  test_decline_reason_without_value_rejected
  test_batch_decline_reason_without_value_rejected
  test_stored_at_not_persisted_to_yaml
  test_stored_at_not_rendered_to_board

  # Unit 6: filter-candidates skip_companies wiring
  test_filter_candidates_skip_companies_matches
  test_filter_candidates_skip_companies_legacy_skip_key

  # Unit 7: liveness gate enforcement on add
  test_add_suggested_without_liveness_rejected
  test_add_suggested_with_liveness_verified_at_accepted
  test_add_suggested_with_skip_flag_accepted
  test_add_non_suggested_stage_no_liveness_required
  test_batch_add_suggested_without_liveness_rejected
  test_batch_add_suggested_with_skip_liveness_accepted
  test_verify_posting_requires_url
  test_verify_posting_handles_unreachable_host

  # Unit 8: stage-aware dedup in filter-candidates
  test_filter_candidates_dup_returns_existing_entry
  test_filter_candidates_resurface_for_stale_decline
  test_filter_candidates_no_resurface_for_substantive_decline
  test_filter_candidates_no_resurface_for_active_stage

  # Unit 9: filesystem sweep
  test_sweep_clean_workspace_no_findings
  test_sweep_invalid_scope_errors
  test_sweep_detects_drive_conflict
  test_sweep_apply_deletes_drive_conflict_with_original
  test_sweep_apply_exit_code_1_when_fixes_applied
  test_sweep_detects_orphaned_role_dir
  test_sweep_detects_missing_jd_for_applied
  test_sweep_dry_run_does_not_delete

  # Unit 10: skill reference integrity (progressive disclosure)
  test_skill_refs_all_resolve
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
  id=$(node "$TRACKER" add --dir "$ws" --skip-liveness-check --json '{"company":"BatchCo","role":"TPM"}' 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const o=JSON.parse(d);process.stdout.write(o.id);})')
  local out
  set +e
  out=$(node "$TRACKER" batch --dir "$ws" --json "[{\"op\":\"decline\",\"id\":\"$id\"}]" 2>/dev/null)
  local rc=$?
  set -e
  assert_exit_code 0 "$rc" "batch happy-path exit"
  # batch returns exit 0 even when all per-op calls fail; assert on the
  # actual per-op result so a regression can't hide behind exit 0.
  assert_json_field "$out" "results.0.ok" "true" "batch per-op success"
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

# ── Unit 4 scenarios: set-archetypes contract tightening ───────

test_set_archetypes_bare_array_errors() {
  # Bare array is rejected at the parseJsonArg object-shape gate; the error
  # is generic ("got array") rather than the canonical-shape message, which
  # is reserved for objects missing role_types or with role_types of the
  # wrong type. Either rejection is a valid contract-tightening outcome.
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" set-archetypes --dir "$ws" --json '["TPM", "PM"]' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "set-archetypes bare-array exit"
  assert_contains "$stderr" "got array" "bare-array rejected at shape gate"
  # Explicit guardrail: bare array must not fall through to the old
  # input.role_types || input fallback path.
  assert_not_contains "$stderr" "Archetypes validation failed" "bare-array rejected before archetype validation"
}

test_set_archetypes_canonical_object_happy_path() {
  local ws
  ws=$(setup_workspace)
  # Full valid role_types entry satisfying validateArchetypes (scripts/tracker.js:429).
  local payload='{"role_types":[{"key":"tpm","name":"TPM","titles":["Technical PM"],"keywords":["TPM"],"experience_mapping":{},"company_fit":{}}]}'
  set +e
  node "$TRACKER" set-archetypes --dir "$ws" --json "$payload" >/dev/null 2>&1
  local rc=$?
  set -e
  assert_exit_code 0 "$rc" "set-archetypes canonical-object exit"
  assert_file_contains "$ws/archetypes.yaml" "Technical PM" "archetypes.yaml contains role title"
}

test_set_archetypes_missing_role_types_errors() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" set-archetypes --dir "$ws" --json '{}' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "set-archetypes missing-key exit"
  assert_contains "$stderr" 'set-archetypes --json requires { "role_types": [...] }' "missing-key canonical-shape error"
}

test_set_archetypes_role_types_wrong_type_errors() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" set-archetypes --dir "$ws" --json '{"role_types": "TPM"}' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "set-archetypes wrong-type exit"
  assert_contains "$stderr" 'set-archetypes --json requires { "role_types": [...] }' "wrong-type canonical-shape error"
}

test_no_json_parse_args_remains() {
  # R6: structural grep — no JSON.parse(args.*) left in tracker.js after Unit 4.
  # Pattern intentionally omits the trailing '.' so bracket-notation forms
  # (JSON.parse(args['json'])) also fail the check. The only permitted site
  # is JSON.parse(raw) inside parseJsonArg.
  local count
  count=$(grep -c 'JSON\.parse(args' "$SCRIPT_DIR/tracker.js" || true)
  if [ "$count" != "0" ]; then
    fail "expected 0 JSON.parse(args.*) sites in tracker.js, found $count"
  fi
}

# ── Unit 5 scenarios: stored_at annotations ────────────────────

# Seed a single application and echo its id.
# Tests bypass the liveness gate: fixture data is for behavior under test,
# not for verifying live postings. Real callers must satisfy the gate.
seed_app() {
  local ws="$1"
  local company="${2:-Acme}"
  local role="${3:-TPM}"
  node "$TRACKER" add --dir "$ws" --skip-liveness-check --json "{\"company\":\"$company\",\"role\":\"$role\"}" 2>/dev/null |
    node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const o=JSON.parse(d);process.stdout.write(o.id);})'
}

test_decline_stored_at() {
  local ws
  ws=$(setup_workspace)
  local id
  id=$(seed_app "$ws")
  local out
  out=$(node "$TRACKER" decline --dir "$ws" --id "$id" --reason "too junior" 2>/dev/null)
  assert_json_field "$out" "stored_at.reason"        "decision.reason"  "decline stored_at.reason"
  assert_json_field "$out" "stored_at.declined_date" "dates.declined"   "decline stored_at.declined_date"
  assert_json_field "$out" "decision.reason"         "too junior"       "decline persists reason on record"
  assert_json_field "$out" "stage"                   "declined"         "decline sets stage"
  # No wrapper shape — id is top-level, not app.id
  assert_json_field "$out" "id"                      "$id"              "decline returns bare record (no wrapper)"
}

test_stage_stored_at() {
  local ws
  ws=$(setup_workspace)
  local id
  id=$(seed_app "$ws")
  local out
  out=$(node "$TRACKER" stage --dir "$ws" --id "$id" --stage applied 2>/dev/null)
  assert_json_field "$out" "stored_at.stage"      "stage"         "stage stored_at.stage"
  assert_json_field "$out" "stored_at.stage_date" "dates.applied" "stage stored_at.stage_date"
  assert_json_field "$out" "stage"                "applied"       "stage mutates record.stage"
}

test_stage_stored_at_alias_resolution() {
  # STAGE_ALIASES in scripts/tracker.js maps 'possible' -> 'maybe'.
  # stored_at.stage_date must reflect the resolved canonical name ('maybe'),
  # not the alias the caller typed ('possible').
  local ws
  ws=$(setup_workspace)
  local id
  id=$(seed_app "$ws")
  local out
  out=$(node "$TRACKER" stage --dir "$ws" --id "$id" --stage possible 2>/dev/null)
  assert_json_field "$out" "stage"                "maybe"      "alias resolves to canonical stage"
  assert_json_field "$out" "stored_at.stage_date" "dates.maybe" "stage_date reflects resolved name, not alias"
}

test_batch_decline_stored_at_top_level() {
  local ws
  ws=$(setup_workspace)
  local id_a id_b
  id_a=$(seed_app "$ws" "Alpha" "TPM")
  id_b=$(seed_app "$ws" "Bravo" "PM")
  local out
  out=$(node "$TRACKER" batch-decline --dir "$ws" --ids "$id_a,$id_b" --reason "batch test" 2>/dev/null)
  assert_json_field "$out" "stored_at.reason"        "decision.reason" "batch-decline top-level stored_at.reason"
  assert_json_field "$out" "stored_at.declined_date" "dates.declined"  "batch-decline top-level stored_at.declined_date"
  assert_json_field "$out" "declined"                "2"               "batch-decline counts successes"
  assert_json_field "$out" "total"                   "2"               "batch-decline reports total"
  # No per-element stored_at — path ends at results[0] without stored_at leaf.
  assert_json_field "$out" "results.0.stored_at"     "__undefined__"   "batch-decline does not attach per-element stored_at"
  assert_json_field "$out" "results.0.ok"            "true"            "batch-decline result[0].ok"
}

test_batch_decline_mixed_success_failure() {
  local ws
  ws=$(setup_workspace)
  local id_a
  id_a=$(seed_app "$ws" "Alpha" "TPM")
  local out
  # One valid id + one nonexistent id exercises the failure branch.
  out=$(node "$TRACKER" batch-decline --dir "$ws" --ids "$id_a,ghost-id" --reason "mixed test" 2>/dev/null)
  assert_json_field "$out" "declined"            "1"       "mixed batch-decline: one success"
  assert_json_field "$out" "total"               "2"       "mixed batch-decline: two total"
  # Top-level stored_at remains (at least one success occurred).
  assert_json_field "$out" "stored_at.reason"    "decision.reason" "mixed batch: top-level stored_at survives"
  # Successful element shape preserved.
  assert_json_field "$out" "results.0.ok"        "true"    "mixed batch: success element ok"
  assert_json_field "$out" "results.0.stored_at" "__undefined__" "success element has no per-element stored_at"
  # Failure element shape preserved AND carries no stored_at (would falsely claim a write).
  assert_json_field "$out" "results.1.ok"        "false"   "mixed batch: failure element ok=false"
  assert_json_field "$out" "results.1.stored_at" "__undefined__" "failure element has no stored_at (no write occurred)"
}

test_batch_decline_all_failure_omits_stored_at() {
  # When every id is invalid, declined=0, writeTracker doesn't fire, and
  # stored_at must be omitted — otherwise the response falsely claims
  # writes occurred at the documented yaml paths.
  local ws
  ws=$(setup_workspace)
  local out
  out=$(node "$TRACKER" batch-decline --dir "$ws" --ids "ghost-a,ghost-b" --reason "all fail" 2>/dev/null)
  assert_json_field "$out" "declined"        "0"             "all-failure declined count"
  assert_json_field "$out" "total"           "2"             "all-failure total count"
  assert_json_field "$out" "stored_at"       "__undefined__" "stored_at omitted when no writes occurred"
  assert_json_field "$out" "results.0.ok"    "false"         "all-failure element 0 ok=false"
  assert_json_field "$out" "results.1.ok"    "false"         "all-failure element 1 ok=false"
}

test_decline_reason_without_value_rejected() {
  # decline --reason with no following value: parseArgs sets args.reason=true
  # (boolean). The guard must reject it before it reaches declineEntry, which
  # would otherwise persist boolean `true` to decision.reason in the yaml.
  local ws
  ws=$(setup_workspace)
  local id
  id=$(seed_app "$ws")
  local stderr
  set +e
  stderr=$(node "$TRACKER" decline --dir "$ws" --id "$id" --reason 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "decline --reason without value exit"
  assert_contains "$stderr" "--reason requires a string value" "decline --reason error names the flag"
  # tracker.yaml should have NO 'reason: true' entry (that would be the bug).
  assert_file_not_contains "$ws/tracker.yaml" "reason: true" "no boolean reason persisted"
}

test_batch_decline_reason_without_value_rejected() {
  # Same guard on batch-decline: flag-without-value becomes boolean true and
  # must be rejected before declineEntry runs across every id.
  local ws
  ws=$(setup_workspace)
  local id
  id=$(seed_app "$ws")
  local stderr
  set +e
  stderr=$(node "$TRACKER" batch-decline --dir "$ws" --ids "$id" --reason 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "batch-decline --reason without value exit"
  assert_contains "$stderr" "--reason requires a string value" "batch-decline --reason error names the flag"
}

test_stored_at_not_persisted_to_yaml() {
  local ws
  ws=$(setup_workspace)
  local id
  id=$(seed_app "$ws")
  node "$TRACKER" decline --dir "$ws" --id "$id" --reason "test" >/dev/null 2>&1
  assert_file_not_contains "$ws/tracker.yaml" "stored_at" "stored_at not persisted to tracker.yaml"
  # Same check via a fresh read through the CLI — `get` should not surface stored_at either.
  local out
  out=$(node "$TRACKER" get --dir "$ws" --id "$id" 2>/dev/null)
  assert_json_field "$out" "stored_at" "__undefined__" "get does not surface stored_at"
}

test_stored_at_not_rendered_to_board() {
  local ws
  ws=$(setup_workspace)
  local id
  id=$(seed_app "$ws")
  # decline auto-rebuilds the board at Kanban/index.html (not $ws/index.html).
  # An unconditional assertion catches both "stored_at leaked" and "board
  # rebuild silently stopped running" — either breaks the contract.
  node "$TRACKER" decline --dir "$ws" --id "$id" --reason "board test" >/dev/null 2>&1
  if [ ! -f "$ws/Kanban/index.html" ]; then
    fail "decline did not produce Kanban/index.html (auto-board-rebuild missing)"
  fi
  assert_file_not_contains "$ws/Kanban/index.html" "stored_at" "stored_at not rendered to board html"
}

# ── Unit 6 scenarios — filter-candidates skip_companies ────────

# Regression test for the bug where filter-candidates read filters.skip
# instead of filters.skip_companies, silently passing through every
# skip-listed company.
test_filter_candidates_skip_companies_matches() {
  local ws
  ws=$(setup_workspace)
  node "$TRACKER" update-filter-list --dir "$ws" --list skip_companies --add '["Acme Corp"]' >/dev/null 2>&1
  local out
  out=$(node "$TRACKER" filter-candidates --dir "$ws" --json '[{"company":"Acme Corp","role":"TPM","url":"https://example.com/a"}]' 2>/dev/null)
  assert_json_field "$out" "passed" "0" "skip_companies match should not pass"
  assert_json_field "$out" "filtered" "1" "skip_companies match should land in filtered"
  assert_json_field "$out" "filtered_detail.0.reason" "skip_list" "filtered with reason=skip_list"
}

# Backward-compat: legacy filters.yaml using `skip:` (not `skip_companies:`)
# must still filter. readFilters aliases the key, but filter-candidates must
# also fall through correctly.
test_filter_candidates_skip_companies_legacy_skip_key() {
  local ws
  ws=$(setup_workspace)
  # Hand-write a legacy filters.yaml using the old `skip:` key
  cat > "$ws/filters.yaml" <<'YAML'
sources: []
target_companies: []
skip:
  - Legacy Co
watch: []
industries: []
decline_patterns: []
YAML
  local out
  out=$(node "$TRACKER" filter-candidates --dir "$ws" --json '[{"company":"Legacy Co","role":"TPM","url":"https://example.com/l"}]' 2>/dev/null)
  assert_json_field "$out" "passed" "0" "legacy skip key should not pass"
  assert_json_field "$out" "filtered_detail.0.reason" "skip_list" "legacy skip key filtered as skip_list"
}

# ── Unit 7 scenarios — liveness gate ───────────────────────────

# A bare `add` of a `suggested` entry must be refused — the agent has
# to verify-posting first and pass --liveness-verified-at, or
# explicitly opt out with --skip-liveness-check.
test_add_suggested_without_liveness_rejected() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" add --dir "$ws" --json '{"company":"Acme","role":"TPM"}' 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "add suggested without liveness exits non-zero"
  assert_contains "$stderr" "liveness-verified-at" "error mentions the required flag"
  assert_contains "$stderr" "verify-posting" "error points at the verify-posting command"
}

test_add_suggested_with_liveness_verified_at_accepted() {
  local ws
  ws=$(setup_workspace)
  local out
  set +e
  out=$(node "$TRACKER" add --dir "$ws" --liveness-verified-at "2026-04-28T12:00:00Z" --json '{"company":"Acme","role":"TPM"}' 2>&1)
  local rc=$?
  set -e
  assert_exit_code 0 "$rc" "add with liveness-verified-at succeeds"
  assert_json_field "$out" "company" "Acme" "entry persisted"
  assert_json_field "$out" "dates.liveness_verified" "2026-04-28T12:00:00Z" "liveness_verified date persisted on entry"
}

test_add_suggested_with_skip_flag_accepted() {
  local ws
  ws=$(setup_workspace)
  local out
  set +e
  out=$(node "$TRACKER" add --dir "$ws" --skip-liveness-check --json '{"company":"Acme","role":"TPM"}' 2>&1)
  local rc=$?
  set -e
  assert_exit_code 0 "$rc" "add with --skip-liveness-check succeeds"
  assert_json_field "$out" "company" "Acme" "skip-liveness-check still persists entry"
}

# Adding a non-suggested entry retroactively (e.g., user manually marking
# something as already-applied) does NOT require liveness — the user's
# presence is the verification.
test_add_non_suggested_stage_no_liveness_required() {
  local ws
  ws=$(setup_workspace)
  local out
  set +e
  out=$(node "$TRACKER" add --dir "$ws" --json '{"company":"Acme","role":"TPM","stage":"applied"}' 2>&1)
  local rc=$?
  set -e
  assert_exit_code 0 "$rc" "add stage=applied without liveness succeeds"
  assert_json_field "$out" "stage" "applied" "stage persisted"
}

test_batch_add_suggested_without_liveness_rejected() {
  local ws
  ws=$(setup_workspace)
  local out
  set +e
  out=$(node "$TRACKER" batch --dir "$ws" --json '[{"op":"add","entry":{"company":"BatchCo","role":"TPM"}}]' 2>/dev/null)
  set -e
  assert_json_field "$out" "results.0.ok" "false" "batch add without liveness fails per-op"
  assert_contains "$out" "liveness-verified-at" "batch add error surfaces liveness flag name"
}

test_batch_add_suggested_with_skip_liveness_accepted() {
  local ws
  ws=$(setup_workspace)
  local out
  set +e
  out=$(node "$TRACKER" batch --dir "$ws" --json '[{"op":"add","skip_liveness_check":true,"entry":{"company":"BatchCo","role":"TPM"}}]' 2>/dev/null)
  set -e
  assert_json_field "$out" "results.0.ok" "true" "batch add with skip_liveness_check succeeds"
}

test_verify_posting_requires_url() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" verify-posting --dir "$ws" 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "verify-posting without --url exits non-zero"
  assert_contains "$stderr" "url" "verify-posting error names the missing flag"
}

# verify-posting against a guaranteed-unresolvable host returns a
# structured live:false result — never crashes.
test_verify_posting_handles_unreachable_host() {
  local ws
  ws=$(setup_workspace)
  local out
  set +e
  out=$(node "$TRACKER" verify-posting --dir "$ws" --url "http://this-host-does-not-exist.invalid/job/1" --timeout-ms 3000 2>/dev/null)
  local rc=$?
  set -e
  assert_exit_code 0 "$rc" "verify-posting on unreachable host still exits 0"
  assert_json_field "$out" "live" "false" "unreachable host yields live=false"
  assert_json_field "$out" "checks.status_2xx" "false" "unreachable host yields status_2xx=false"
}

# ── Unit 8 scenarios — stage-aware dedup ───────────────────────

# A duplicate (company, role) match must surface the existing entry's
# stage, decline_reason, and last_updated so the agent can apply the
# dedup table in skills/search/SKILL.md without re-reading tracker.yaml.
test_filter_candidates_dup_returns_existing_entry() {
  local ws
  ws=$(setup_workspace)
  seed_app "$ws" "DupCo" "TPM" >/dev/null
  local out
  out=$(node "$TRACKER" filter-candidates --dir "$ws" --json '[{"company":"DupCo","role":"TPM","url":"https://example.com/d"}]' 2>/dev/null)
  assert_json_field "$out" "filtered_detail.0.reason" "duplicate" "duplicate reason set"
  assert_json_field "$out" "filtered_detail.0.existing_entry.stage" "suggested" "existing stage surfaced"
  assert_json_field "$out" "filtered_detail.0.suggest_resurface" "false" "suggested-stage dup does not flag resurface"
}

# A previously declined-as-stale entry should be flagged for resurface
# review when the same (company, role) reappears.
test_filter_candidates_resurface_for_stale_decline() {
  local ws
  ws=$(setup_workspace)
  local id
  id=$(seed_app "$ws" "StaleCo" "TPM")
  node "$TRACKER" decline --dir "$ws" --id "$id" --reason "Posting closed before I could apply" >/dev/null 2>&1
  local out
  out=$(node "$TRACKER" filter-candidates --dir "$ws" --json '[{"company":"StaleCo","role":"TPM","url":"https://example.com/r"}]' 2>/dev/null)
  assert_json_field "$out" "filtered_detail.0.suggest_resurface" "true" "stale decline triggers resurface flag"
  assert_json_field "$out" "filtered_detail.0.existing_entry.stage" "declined" "existing entry stage=declined"
}

# A decline for a substantive reason (travel, comp, domain) is NOT a
# resurface — the user said no for a real reason. Surface the duplicate
# but don't flag for re-review.
test_filter_candidates_no_resurface_for_substantive_decline() {
  local ws
  ws=$(setup_workspace)
  local id
  id=$(seed_app "$ws" "TravelCo" "TPM")
  node "$TRACKER" decline --dir "$ws" --id "$id" --reason "Travel exceeds 15% — out of range" >/dev/null 2>&1
  local out
  out=$(node "$TRACKER" filter-candidates --dir "$ws" --json '[{"company":"TravelCo","role":"TPM","url":"https://example.com/t"}]' 2>/dev/null)
  assert_json_field "$out" "filtered_detail.0.suggest_resurface" "false" "substantive decline does not trigger resurface"
}

# A duplicate against any active-pipeline stage (suggested, applied,
# interviewing) is just a no-op skip.
test_filter_candidates_no_resurface_for_active_stage() {
  local ws
  ws=$(setup_workspace)
  local id
  id=$(seed_app "$ws" "ActiveCo" "TPM")
  node "$TRACKER" stage --dir "$ws" --id "$id" --stage applied >/dev/null 2>&1
  local out
  out=$(node "$TRACKER" filter-candidates --dir "$ws" --json '[{"company":"ActiveCo","role":"TPM","url":"https://example.com/a"}]' 2>/dev/null)
  assert_json_field "$out" "filtered_detail.0.suggest_resurface" "false" "active stage does not trigger resurface"
  assert_json_field "$out" "filtered_detail.0.existing_entry.stage" "applied" "active stage surfaced"
}

# ── Unit 9 scenarios — filesystem sweep ────────────────────────

test_sweep_clean_workspace_no_findings() {
  local ws
  ws=$(setup_workspace)
  local out
  set +e
  out=$(node "$TRACKER" sweep --dir "$ws" 2>/dev/null)
  local rc=$?
  set -e
  assert_exit_code 0 "$rc" "clean sweep exits 0"
  assert_json_field "$out" "mode" "dry-run" "default mode is dry-run"
  assert_json_field "$out" "summary.errors" "0" "clean workspace has no errors"
}

test_sweep_invalid_scope_errors() {
  local ws
  ws=$(setup_workspace)
  local stderr
  set +e
  stderr=$(node "$TRACKER" sweep --dir "$ws" --scope "bogus" 2>&1 >/dev/null)
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "invalid scope exits non-zero"
  assert_contains "$stderr" "Invalid --scope" "error names the bad scope"
}

test_sweep_detects_drive_conflict() {
  local ws
  ws=$(setup_workspace)
  mkdir -p "$ws/companies/Acme/2026-04-01-tpm"
  printf 'real content' > "$ws/companies/Acme/2026-04-01-tpm/jd.md"
  printf 'conflict' > "$ws/companies/Acme/2026-04-01-tpm/jd (Conflicted copy 2026-04-22).md"
  local out
  set +e
  out=$(node "$TRACKER" sweep --dir "$ws" --scope drive 2>/dev/null)
  set -e
  assert_json_field "$out" "findings.0.type" "drive_conflict" "drive_conflict detected"
  assert_json_field "$out" "findings.0.auto_fixable" "true" "auto-fixable when original sibling exists"
}

test_sweep_apply_deletes_drive_conflict_with_original() {
  local ws
  ws=$(setup_workspace)
  mkdir -p "$ws/companies/Acme/2026-04-01-tpm"
  printf 'real' > "$ws/companies/Acme/2026-04-01-tpm/jd.md"
  printf 'conflict' > "$ws/companies/Acme/2026-04-01-tpm/jd (Conflicted copy 2026-04-22).md"
  set +e
  node "$TRACKER" sweep --dir "$ws" --scope drive --apply >/dev/null 2>&1
  set -e
  if [ -f "$ws/companies/Acme/2026-04-01-tpm/jd (Conflicted copy 2026-04-22).md" ]; then
    fail "drive_conflict file should have been deleted by --apply"
  fi
  if [ ! -f "$ws/companies/Acme/2026-04-01-tpm/jd.md" ]; then
    fail "original sibling must not be touched"
  fi
}

test_sweep_apply_exit_code_1_when_fixes_applied() {
  local ws
  ws=$(setup_workspace)
  mkdir -p "$ws/companies/Acme/2026-04-01-tpm"
  printf 'real' > "$ws/companies/Acme/2026-04-01-tpm/jd.md"
  printf 'conflict' > "$ws/companies/Acme/2026-04-01-tpm/jd (Conflicted copy 2026-04-22).md"
  set +e
  node "$TRACKER" sweep --dir "$ws" --scope drive --apply >/dev/null 2>&1
  local rc=$?
  set -e
  assert_exit_code 1 "$rc" "successful --apply with fixes exits 1"
}

test_sweep_detects_orphaned_role_dir() {
  local ws
  ws=$(setup_workspace)
  # Create a role dir with no corresponding tracker entry
  mkdir -p "$ws/companies/OrphanCo/2026-04-01-stale-tpm"
  printf 'orphan content' > "$ws/companies/OrphanCo/2026-04-01-stale-tpm/jd.md"
  local out
  set +e
  out=$(node "$TRACKER" sweep --dir "$ws" --scope orphans 2>/dev/null)
  set -e
  assert_contains "$out" "orphaned_role_dir" "orphaned role dir detected"
  assert_contains "$out" "OrphanCo" "orphan path includes the company"
}

test_sweep_detects_missing_jd_for_applied() {
  local ws
  ws=$(setup_workspace)
  local id
  id=$(seed_app "$ws" "JDless" "TPM")
  node "$TRACKER" stage --dir "$ws" --id "$id" --stage applied >/dev/null 2>&1
  local out
  set +e
  out=$(node "$TRACKER" sweep --dir "$ws" --scope tracker-files 2>/dev/null)
  set -e
  assert_contains "$out" "missing_jd" "missing jd surfaced for applied entry"
  assert_contains "$out" "JDless" "missing jd finding tied to the company"
}

# ── Unit 10 — skill reference integrity ────────────────────────

# Every references/X.md path mentioned in any skills/*/SKILL.md must
# resolve to a real file on disk. Catches dangling progressive-disclosure
# pointers introduced by future restructures.
test_skill_refs_all_resolve() {
  local stderr
  set +e
  stderr=$(node "$VALIDATE_SKILL_REFS" --quiet 2>&1 >/dev/null)
  local rc=$?
  set -e
  if [ "$rc" != "0" ]; then
    fail "skill references validator failed: $stderr"
  fi
}

# Dry-run never deletes — even when the finding is auto-fixable.
test_sweep_dry_run_does_not_delete() {
  local ws
  ws=$(setup_workspace)
  mkdir -p "$ws/companies/Acme/2026-04-01-tpm"
  printf 'real' > "$ws/companies/Acme/2026-04-01-tpm/jd.md"
  printf 'conflict' > "$ws/companies/Acme/2026-04-01-tpm/jd (Conflicted copy 2026-04-22).md"
  set +e
  node "$TRACKER" sweep --dir "$ws" --scope drive >/dev/null 2>&1
  set -e
  if [ ! -f "$ws/companies/Acme/2026-04-01-tpm/jd (Conflicted copy 2026-04-22).md" ]; then
    fail "dry-run must not delete"
  fi
}

run_tests
