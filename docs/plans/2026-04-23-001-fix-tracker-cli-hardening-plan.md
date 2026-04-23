---
title: Tracker CLI hardening — parseJsonArg helper and stored_at annotations
type: fix
status: active
date: 2026-04-23
origin: docs/brainstorms/tracker-cli-hardening-requirements.md
---

# Tracker CLI hardening — parseJsonArg helper and stored_at annotations

## Overview

Two bugs surfaced in a JFM session revealed distinct weaknesses in `scripts/tracker.js`:

1. **Input-shape validation is missing** across 9 `JSON.parse(args.X)` call sites. `update-filter-list --add '"Crusoe"'` inserted six single-character entries into `target_companies` because `JSON.parse` returned a string that was then iterated as characters. The same pattern is waiting to fire on 8 other commands.
2. **Output discoverability is missing** on commands that write to hidden nested paths. `decline --reason "text"` persists the reason to `app.decision.reason`, but the calling agent looked for `declined_reason` on the record, didn't find it, and wrote a redundant `notes` entry as a workaround.

This plan ships a single `parseJsonArg` validation helper, routes all 9 call sites through it, tightens `set-archetypes` to reject a dual-input shortcut nobody uses, adds a `stored_at` annotation on the three nested-write commands (`decline`, `stage`, `batch-decline`), and bootstraps a shell-based test harness so the fixes stay fixed.

## Problem Frame

`scripts/tracker.js` is the data-layer boundary for the JFM plugin: every read and write of `tracker.yaml`, `profile.yaml`, `archetypes.yaml`, and `filters.yaml` goes through it (see `skills/followup/SKILL.md:34`). Its primary callers are AI coding agents (Claude Code in JFM sessions) and the plugin author directly. Agents routinely compose JSON arguments through multiple layers of shell quoting and routinely need to know where their writes landed on disk.

Today the CLI fails both audiences:
- **Silent wrong-shape acceptance** on JSON args. `JSON.parse(args.X)` returns whatever the argument parses to — string, number, null, array, object — and then the handler iterates it or dereferences fields on it, producing confusing downstream behavior without any error.
- **Opaque success** on nested-write commands. The handler writes the value to disk correctly, but the command output gives the caller no hint where the value landed, so agents guess and write redundant workarounds.

The fixes are surgical and do not touch any yaml schema or downstream reader. (See origin: `docs/brainstorms/tracker-cli-hardening-requirements.md`.)

## Requirements Trace

- **R1.** Valid JSON.parse shape assertions prevent the Crusoe-class bug. Malformed-shape input to any of the 9 call sites produces a loud, flag-named error instead of silent wrong behavior.
- **R2.** Agents can discover where nested-write values landed via a `stored_at` map on `decline`, `stage`, and `batch-decline` output.
- **R3.** Error messages name the offending flag (`--add`, `--json`, etc.) and include a neutral JSON-shape example — no embedded shell quoting.
- **R4.** Existing happy-path behavior is preserved for all 9 call sites, including `batch`'s non-empty-array invariant and `update-filter-list '[]'` as a valid no-op.
- **R5.** `set-archetypes --json '[...]'` (bare array) now errors loudly, pointing at the canonical `{"role_types": [...]}` form.
- **R6.** Grep for `JSON.parse(args\.` in `scripts/tracker.js` returns zero matches after the change.
- **R7a.** Running `update-filter-list --list target_companies --add '"Crusoe"'` against the hardened CLI exits non-zero with a loud error naming `--add`, and leaves `filters.yaml` byte-for-byte unchanged.
- **R7b.** Running `decline --id <id> --reason "text"` against the hardened CLI returns JSON whose top-level `stored_at.reason` is visible without reading source.
- **R8.** A shell-based test harness exists and covers: parseJsonArg branches, the Crusoe repro, the decline/stage/batch-decline `stored_at` outputs, and one malformed-shape case per converted command.

## Scope Boundaries

- No data-model changes to `tracker.yaml`, `profile.yaml`, `archetypes.yaml`, or `filters.yaml`.
- No wrapper shape on command return values (no `ok: true`, no `app: {}` nesting). Every mutating handler continues to return a bare record; `stored_at` is an additive top-level annotation on the three nested-write commands only.
- No new runtime dependencies. Plugin ships zero-dep aside from vendored `js-yaml` (`scripts/vendor/js-yaml.mjs`); this change must preserve that.
- No changes to downstream consumers of `tracker.js` stdout. Grep confirms no `skills/` or `commands/` caller parses the JSON output for field shape — the `stored_at` change is additive-safe.
- No generalization of `stored_at` to commands whose writes are user-named (`add --json`, `update --json`, `set-*`, `update-filter-list`). Triggers to reopen are documented in the origin doc.
- No `@file.json` / stdin input for JSON args. Trigger to reopen: one additional shell-quoting incident.
- No exit-code contract changes. Validation errors exit 1 uniformly, matching `main()` at `scripts/tracker.js:1342-1345`.
- No element-type validation in the helper. `parseJsonArg` validates shape (array vs object) only; element-type assertions stay at the call sites that need them. (Unit 4 adds one such assertion at `set-archetypes` — `role_types` must be an array. That is a call-site invariant, not a helper feature.)

### Deferred to Separate Tasks

- **Element-type assertion in `update-filter-list`:** `--add '[1, 2, 3]'` would pass shape validation and then crash at `item.toLowerCase()`. A local `if (!toAdd.every(x => typeof x === 'string'))` check at the call site closes this gap. Scoping note: if included, add one line of code and one test; if deferred, flag as residual risk and file as its own micro-issue.
- **Post-ship learnings capture:** Write a `docs/solutions/` entry documenting the `parseJsonArg` pattern and the shell-smoke-test harness style. The directory is near-empty and this work establishes two conventions (per learnings researcher).

## Context & Research

### Relevant Code and Patterns

- `scripts/tracker.js` — the target file. Key landmarks:
  - `parseArgs(argv)` at line 102 — co-locate the new `parseJsonArg` helper here.
  - 9 `JSON.parse(args.X)` sites: lines 758 (`add`), 765 (`update`), 855 (`batch`), 902 (`filter-candidates`), 967 (`set-profile`), 988 (`set-archetypes`), 999 (`set-filters`), 1025 (`update-filter-list --add`), 1036 (`update-filter-list --remove`).
  - `declineEntry` at line 555 — writes `decision.reason` and `dates.declined`.
  - `decline` handler at line 770, `stage` at line 777, `batch-decline` at line 882 — the three commands that gain `stored_at`.
  - `main()` at line 1290; error handling at lines 1342-1345 adds "Error:" prefix to thrown messages. **Thrown messages should not include that prefix.**
  - Existing JSON-arg rejection precedent at lines 856-858 (`batch` throws `'batch expects a non-empty JSON array of operations'`) — mirror this style for `parseJsonArg` errors.
- `scripts/build.js` — bundles `scripts/tracker.js` as-is. Single-file constraint: the helper stays inside `scripts/tracker.js`.
- `scripts/vendor/js-yaml.mjs` — the only runtime dependency. No new deps in this change.
- `skills/followup/SKILL.md:34` — declares the rule that every tracker/profile/filters read and write goes through `scripts/tracker.js`. Reinforces that tracker.js stdout is the contract.
- `skills/search/references/data-safety.md:101` — documents `set-archetypes --json '{...}'` in the object form. Confirms the bare-array path has no documented caller.

### Institutional Learnings

- `docs/solutions/integration-issues/cowork-plugin-runtime-constraints-2026-03-30.md` — relevant carry-overs:
  - Keep runtime deps minimal; hand-rolled shape checks preferred over `ajv`/`zod`.
  - Cowork plugins cache across sessions; the `set-archetypes` break won't reach live cowork sessions until a new session starts. Note this in release messaging.
- The repo has no prior `docs/solutions/` entry on CLI validation or test harnessing. This plan establishes both patterns; capture them afterward (see Documentation Plan).

### External References

None consulted. Local patterns are sufficient: Node.js built-in JSON handling, shell-based script testing matches existing `scripts/build.js` and `scripts/release.js` style, no high-risk domain.

## Key Technical Decisions

- **Helper lives inside `scripts/tracker.js`** near `parseArgs` at line 102. Rationale: `scripts/build.js` bundles the file as-is; a separate module would require a build.js include update for zero gain.
- **Helper signature: `parseJsonArg(raw, flagName, { expect })`** where `expect` is `'array' | 'object'`. Rationale: the two-value enum covers all 9 sites after dropping the `set-archetypes` dual-input; adding a third value (`'arrayOrObject'`) would muddy the contract for one site whose shortcut is unused.
- **Shape discrimination uses `Array.isArray` not `typeof`.** `typeof [] === 'object'` in JavaScript; a naive `typeof parsed === expect` check would let arrays through on `expect: 'object'` and reproduce the original bug class. Feasibility reviewer flagged this during brainstorm review.
- **Error messages use neutral JSON-shape hints, not shell-quoted examples.** `Expected a JSON array, e.g. ["Acme", "Crusoe"]` rather than `Example: --add '["Acme"]'`. Shell quoting varies across invocation contexts (bash vs. Claude Code Bash tool vs. Windows git-bash vs. node spawn arrays); an agent copy-pasting a quoted example may hit a second failure on different-shell escape rules.
- **Helper validates shape only, not length or element type.** Call sites keep their own invariants: `batch` keeps its length check after the helper call; `update-filter-list` can keep element-type checks inline.
- **No deprecation window on `set-archetypes` bare-array removal.** Grep confirms no caller uses the shortcut (`skills/search/references/data-safety.md:101` uses the object form). Hard-fail matches the repo's overall "loud errors" posture for this change. Note the break in release messaging because cowork plugins cache across sessions.
- **`stored_at` is a top-level annotation on the return value, not persisted to yaml.** The `writeTracker` call continues to persist the app record as-is; `stored_at` is attached to the returned object only. Spread order is always `{ ...app, stored_at: {...} }` (never the reverse) so an accidental future app field named `stored_at` cannot shadow the annotation. `stored_at` is a reserved field name in the return-value contract.
- **`batch-decline` places `stored_at` at the top level, not per result element.** The yaml paths are identical for every successful decline, and per-element attachment would falsely claim writes for `ok: false` elements where `declineEntry` threw. Top-level `stored_at` applies to the batch as a whole and is only meaningful alongside at least one `ok: true` result.
- **`stage` handler reads `app.stage` post-call** to build `stored_at.stage_date`. The resolved stage is only in scope inside `stageEntry`; re-applying `STAGE_ALIASES` at the handler would duplicate logic. `stageEntry` at `scripts/tracker.js:574` writes the resolved name back to `app.stage`, so reading it after the call gets the canonical form without re-resolution.
- **The set-archetypes contract tightening (line 988) lands in Unit 4, not Unit 3.** Converting line 988 in Unit 3 would make Unit 4's "characterization-first" test against the fallback vacuous (the helper would already reject bare arrays with a generic message). Atomic contract change keeps the better-worded canonical-shape error and the fallback removal in one unit.
- **Test harness is a shell script** at `scripts/test-tracker.sh`. Rationale: matches existing `scripts/*.js` style, zero runtime deps, creates temp workspaces via `mktemp -d`, asserts on stdout/stderr/exit-code/filesystem state. Native `node --test` would keep assertions in JS but adds test-file conventions the plugin doesn't have today.
- **Test harness invoked via `npm test`** from `scripts/package.json`. Rationale: standard npm convention; replaces the current placeholder stub.

## Open Questions

### Resolved During Planning

- **Helper name and location** → `parseJsonArg` in `scripts/tracker.js` near `parseArgs`.
- **Error exit codes** → uniform exit 1, matches existing `main()` behavior; no CLI contract change.
- **`set-archetypes` dual-input** → object-only; hard-fail bare arrays. No deprecation window.
- **Test harness** → shell smoke script at `scripts/test-tracker.sh`, bash 3.2 compatible.
- **Downstream caller audit for `stored_at`** → not needed. Grep confirms no skills or commands parse tracker.js stdout for field shape.
- **Element-type validation** → stays at call site. Helper is shape-only.
- **How to exercise `parseJsonArg` in tests** → Unit 2 wires the helper to `update-filter-list --add` (line 1025) as its representative call site, and all helper-branch scenarios exercise it through that public command. No hidden debug command, no `node -e` import hack, no ESM/CJS contortion.
- **`stage` handler's access to the resolved stage name** → read `app.stage` after `stageEntry` returns; `stageEntry` writes the resolved name back to `app.stage` at `scripts/tracker.js:574`.
- **`batch-decline` `stored_at` placement** → top-level (`{ declined, total, stored_at, results }`), not per-element. Avoids false claims for `ok: false` entries.
- **Shell harness JSON-field assertions** → `assert_json_field` helper using `node -e` for extraction. Zero new deps; no reliance on `jq`.

### Deferred to Implementation

- **Exact `parseJsonArg` error-message phrasing.** The plan specifies the required pieces (flag name, expected shape, JSON-shape hint) but final wording lands in code alongside the helper's test scenarios. Keep phrasing consistent between the three error branches (`missing required --X`, `invalid JSON for --X: ...`, `expected JSON {shape} for --X, got ...`) — either all use period-terminated sentences with capitalized openers, or none do. Mirror the existing style at `scripts/tracker.js:856-858` for voice.
- **Exact yaml paths in each `stored_at` map.** The plan enumerates the expected keys per command (see Unit 5). Implementer confirms against `declineEntry`, `stageEntry`, and the `batch-decline` handler when wiring up.
- **Whether to include the `update-filter-list` element-type check in this PR.** Low-cost addition; implementer's call. If included, add one assertion and one shell-test scenario. If deferred, file a micro-issue with the repro (`--add '[1, 2, 3]'` crashes at `.toLowerCase()`) so the residual risk has a ticket, not just a line in the Risks table.
- **Whitespace-only `raw` input to `parseJsonArg`.** The spec treats only `undefined | null | ''` as missing. `parseJsonArg(' ', 'add', { expect: 'array' })` would route through `JSON.parse(' ')`, throw with a `SyntaxError`, and surface as `invalid JSON for --add: ...` — correct but unhelpful. If the implementer wants to tighten, add `.trim() === ''` to the missing-value guard.

## Implementation Units

- [ ] **Unit 1: Bootstrap shell test harness**

**Goal:** Establish a repeatable, zero-dep test runner for `scripts/tracker.js` at `scripts/test-tracker.sh`, wire it to `npm test` in `scripts/package.json`.

**Requirements:** R8 (foundation; scenarios filled in by later units)

**Dependencies:** None.

**Files:**
- Create: `scripts/test-tracker.sh`
- Modify: `scripts/package.json` (replace test stub with `bash scripts/test-tracker.sh`)

**Approach:**
- Shebang `#!/usr/bin/env bash`. **Target bash 3.2 compatibility** — macOS system `/bin/bash` is 3.2. No associative arrays (`declare -A`), no `mapfile` / `readarray`, no `${var,,}`. `set -euo pipefail` is fine in 3.2.
- `trap cleanup EXIT` tears down any temp workspaces the scenarios created. ASCII banner headers match `scripts/build.js` / `scripts/release.js` style.
- Provides helpers (include a one-line signature comment next to each definition so Units 2-5 bind against a contract):
  - `setup_workspace()` — creates temp dir via `mktemp -d`, runs `node scripts/tracker.js init` inside, echoes the path. Caller captures with `ws=$(setup_workspace)`.
  - `assert_exit_code <expected> <actual> <context>`.
  - `assert_contains <haystack> <needle> <context>` — substring match for stdout/stderr captures.
  - `assert_file_contains <path> <needle> <context>`.
  - `assert_json_field <json-string> <dotted-path> <expected-value> <context>` — **uses `node -e` to parse and extract** (zero new deps; no reliance on `jq`). One-liner dispatches to `node -e 'const o=JSON.parse(process.argv[1]);const v=process.argv[2].split(".").reduce((a,k)=>a?.[k],o);process.exit(String(v)===process.argv[3]?0:1)' "$json" "$path" "$expected"`.
  - `fail <msg>` — prints context, exits 1.
- Each scenario is a top-level function (`test_parseJsonArg_missing_value`, `test_crusoe_repro_errors`, etc.). A `main` loop invokes every `test_*` function via name-lookup, prints pass/fail per scenario, exits non-zero on any failure. Scenarios are self-contained (no shared state).
- **No placeholder scenarios.** This unit ships the skeleton + helpers. `main` iterates a function list that is empty at Unit 1 commit time — `npm test` exits 0 by doing nothing. Units 2-5 append real scenarios.
- **No dependency changes** — `scripts/package.json` edit is only the `test` script value. `scripts/package-lock.json` is not regenerated; a scripts-section edit alone does not require `npm install`.

**Execution note:** Foundation for test-first posture on Units 2-5.

**Patterns to follow:**
- `scripts/build.js` and `scripts/release.js` — ESM Node scripts, banner style, terse output, `process.exit(1)`-on-failure posture. The bash harness isn't a direct sibling but inherits their output style and exit-code discipline.
- No existing shell-test pattern in the repo — this unit sets precedent.

**Test scenarios:**
- **Test expectation: none — this unit ships test infrastructure with no assertions of its own. Validity is proven structurally (see Verification).**

**Verification:**
- `npm --prefix scripts test` exits 0 against an empty scenario list.
- Script is executable (`chmod +x scripts/test-tracker.sh`) and invokable as `bash scripts/test-tracker.sh`.
- Running under macOS system `/bin/bash` (3.2) produces the same result — no bash-4+ idioms slipped in.
- `assert_json_field` extracts a known field from a canned JSON string without invoking `jq` or any non-`node` binary.

---

- [ ] **Unit 2: Add `parseJsonArg` helper, wire one representative call site, cover both via harness**

**Goal:** Introduce the validating JSON-argument parser in `scripts/tracker.js`, wire it to the `update-filter-list --add` call site (line 1025) so helper behavior is exercised end-to-end through an existing public command, and add shell-harness scenarios covering every helper branch via that call site. This sidesteps the export / hidden-debug-command / ESM-vs-CJS issues entirely — Unit 3 handles the remaining 8 call sites.

**Requirements:** R1, R3, R7a

**Dependencies:** Unit 1.

**Files:**
- Modify: `scripts/tracker.js` — add helper near `parseArgs` around line 102; swap line 1025 `JSON.parse(args.add)` to `parseJsonArg(args.add, 'add', { expect: 'array' })`.
- Modify: `scripts/test-tracker.sh` — add the scenario functions listed below.

**Approach:**
- Helper signature: `parseJsonArg(raw, flagName, { expect })` where `expect` is `'array' | 'object'`.
- Behavior:
  - If `raw === undefined`, `raw === null`, `raw === ''`, or `typeof raw !== 'string'` → `throw new Error('missing required --' + flagName)`. The `typeof !== 'string'` guard catches the `parseArgs` case where `--add` is passed with no following value and the parser assigns `args.add = true`.
  - Wrap `JSON.parse(raw)` in try/catch; on catch, `throw new Error(\`invalid JSON for --\${flagName}: \${truncate(raw, 40)}. Expected a JSON \${expect}, e.g. \${SHAPE_HINT[expect]}.\`)`.
  - After parse, discriminate: `expect: 'array'` requires `Array.isArray(parsed)`; `expect: 'object'` requires `parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)`. On mismatch, throw `expected JSON {expect} for --{flagName}, got {typeLabel}. Expected shape: {hint}` where `typeLabel` is the inline expression `Array.isArray(parsed) ? 'array' : parsed === null ? 'null' : typeof parsed`.
  - Return the parsed value on success.
- `SHAPE_HINT` is a module-scope constant object: `{ array: '["Acme", "Crusoe"]', object: '{"notes":"..."}' }`. Module-scope eval order is safe — command handlers run after module evaluation completes.
- No named `describe(parsed)` helper — the inline ternary covers the six output labels (`array`, `null`, `string`, `number`, `boolean`, `object`) and avoids creating a definition site the error templates have to call.
- Helper throws; `main()` continues to handle exit-1 uniformly.
- Do not log inside the helper. All output goes through the thrown error → `main()` stderr path at `scripts/tracker.js:1342-1345`.

**Execution note:** Test-first. Write the scenarios listed below in `scripts/test-tracker.sh`, confirm they fail against pre-helper code, then land the helper + the line-1025 swap and confirm green.

**Patterns to follow:**
- Existing error style at `scripts/tracker.js:856-858` (`batch` throws `'batch expects a non-empty JSON array of operations'`) — same voice: imperative, no "Error:" prefix, flag/command named inline.
- `parseArgs` style at `scripts/tracker.js:102-113` — short helper, pure, no I/O, no side effects.

**Test scenarios** — all exercise `parseJsonArg` end-to-end via `update-filter-list --add`:

- Happy path — array input: `update-filter-list --list target_companies --add '["Acme"]'` → exit 0, `filters.yaml` gains `Acme` as a single entry.
- Happy path — empty array no-op: `update-filter-list --list target_companies --add '[]'` → exit 0, `filters.yaml` unchanged.
- Error — missing `--add` value: `update-filter-list --list target_companies --add` (flag present, no value — `parseArgs` sets `args.add = true`) → exit 1, stderr contains `missing required --add`.
- Error — empty-string value: `update-filter-list --list target_companies --add ''` → exit 1, stderr contains `missing required --add`.
- Error — invalid JSON (R7a Crusoe — bare token): `update-filter-list --list target_companies --add 'Crusoe'` → exit 1, stderr contains `invalid JSON for --add` and the shape hint `["Acme", "Crusoe"]`.
- Error — shape mismatch (string) (R7a Crusoe — JSON-quoted): `update-filter-list --list target_companies --add '"Crusoe"'` → exit 1, stderr contains `expected JSON array for --add, got string`. `filters.yaml` byte-for-byte unchanged.
- Error — shape mismatch (object): `update-filter-list --list target_companies --add '{"a":1}'` → exit 1, stderr contains `expected JSON array for --add, got object`.
- Error — shape mismatch (number): `update-filter-list --list target_companies --add '42'` → exit 1, stderr contains `got number`.
- Error — shape mismatch (null): `update-filter-list --list target_companies --add 'null'` → exit 1, stderr contains `got null`.
- Error — shape mismatch (boolean): `update-filter-list --list target_companies --add 'true'` → exit 1, stderr contains `got boolean`.

The `expect: 'object'` branch is covered in Unit 3 when the remaining 8 call sites land — no need for duplicative object-branch scenarios here.

**Verification:**
- All scenarios above pass via `npm test`.
- `grep -c 'function parseJsonArg' scripts/tracker.js` returns 1.
- The helper does not import anything new (still zero runtime deps beyond vendored js-yaml).
- Line 1025 no longer contains `JSON.parse(args.add)`.

---

- [ ] **Unit 3: Convert the 9 `JSON.parse(args.X)` call sites to `parseJsonArg`**

**Goal:** Replace every `JSON.parse(args.X)` with `parseJsonArg(args.X, 'flagName', { expect })` at the 9 enumerated sites. Preserve existing invariants inline. Land the Crusoe regression repro.

**Requirements:** R1, R4, R6, R7 (Crusoe leg)

**Dependencies:** Unit 2.

**Files:**
- Modify: `scripts/tracker.js` (lines 758, 765, 855, 902, 967, 999, 1036 — seven sites; line 1025 was swapped in Unit 2, line 988 swaps in Unit 4)
- Modify: `scripts/test-tracker.sh` (add one representative wiring scenario per command)

**Approach:**

Site-by-site conversion. Each swap is a single-line mechanical transformation. Unit 2 already exercised the helper's full branch matrix via `update-filter-list --add`; this unit proves the helper is correctly *wired* at the remaining seven sites. One representative wiring scenario per command is enough — re-running the full branch matrix at every site re-proves helper behavior, not wiring.

Site 988 (`set-archetypes`) is intentionally deferred to Unit 4 so the contract tightening (bare-array path removal) lands as a single atomic change. Leaving `JSON.parse` at line 988 for Unit 3 means R6's zero-grep assertion lands in Unit 4's verification, not here.

| Line | Command | Current | Replace with |
|---|---|---|---|
| 758 | `add` | `JSON.parse(args.json)` | `parseJsonArg(args.json, 'json', { expect: 'object' })` |
| 765 | `update` | `JSON.parse(args.json)` | `parseJsonArg(args.json, 'json', { expect: 'object' })` |
| 855 | `batch` | `JSON.parse(args.json)` | `parseJsonArg(args.json, 'json', { expect: 'array' })` — keep the `ops.length === 0` check at lines 856-858 immediately after |
| 902 | `filter-candidates` | `JSON.parse(args.json)` | `parseJsonArg(args.json, 'json', { expect: 'array' })` |
| 967 | `set-profile` | `JSON.parse(args.json)` | `parseJsonArg(args.json, 'json', { expect: 'object' })` |
| 999 | `set-filters` | `JSON.parse(args.json)` | `parseJsonArg(args.json, 'json', { expect: 'object' })` |
| 1036 | `update-filter-list --remove` | `JSON.parse(args.remove)` | `parseJsonArg(args.remove, 'remove', { expect: 'array' })` |

**Execution note:** Test-first per site: add the wiring scenario (confirm red against pre-swap code), swap, confirm green.

**Patterns to follow:**
- The swap is a single-line mechanical transformation per site.
- The `batch` command at lines 855-858 is the template for "helper plus inline invariant preserved": call `parseJsonArg`, then run the existing length check, throw if it fails.
- Element-type checks stay local. `update-filter-list --add` may optionally gain `if (!toAdd.every(x => typeof x === 'string')) throw new Error(...)` — see Deferred to Separate Tasks and the Risks table.

**Test scenarios** (one representative wiring case per command; R4 no-op cases; invariant preservation):

- Wiring — `add --json '"not an object"'` → exit 1, stderr names `--json` and contains `got string`.
- Wiring — `update --id <id> --json '"x"'` → exit 1, stderr names `--json`.
- Wiring — `batch --json '{"a":1}'` → exit 1, stderr names `--json` and contains `got object` (expected array).
- Wiring — `filter-candidates --json '"x"'` → exit 1, stderr names `--json` and contains `got string`.
- Wiring — `set-profile --json '[]'` → exit 1, stderr contains `got array`.
- Wiring — `set-filters --json '[]'` → exit 1, stderr contains `got array`.
- Wiring — `update-filter-list --list target_companies --remove '"x"'` → exit 1, stderr names `--remove`.
- Invariant — `batch --json '[]'` → exit 1, stderr contains the existing `batch expects a non-empty JSON array of operations` (length-check invariant preserved after the helper call).
- Invariant — `batch --json '[{"op":"decline","id":"x"}]'` → happy path succeeds through both helper and length check.
- R4 no-op — `set-filters --json '{}'` → exit 0, `filters.yaml` unchanged.
- Happy path — each `--json 'object'` or `--json 'array'` command accepts its correct shape and behaves as before (one happy-path scenario per command is sufficient since pre-existing behavior is presumed stable; pick a canonical valid invocation for each).

**Verification:**
- All scenarios above pass.
- Running `node scripts/tracker.js help` and any other command that doesn't take JSON still works — no collateral damage.
- Line 988 still reads `JSON.parse(args.json)` at this unit's close (Unit 4 swaps it).

---

- [ ] **Unit 4: Convert `set-archetypes` (line 988) and tighten contract to object-only**

**Goal:** Swap `JSON.parse(args.json)` at line 988 to `parseJsonArg(args.json, 'json', { expect: 'object' })`, remove the `input.role_types || input` fallback at line 989, require an explicit `role_types` array, and close R6 (zero `JSON.parse(args\.` remaining). All in one atomic change so the contract tightens without intermediate states that half-accept bare arrays.

**Requirements:** R5, R6

**Dependencies:** Unit 2 (needs `parseJsonArg`). Orthogonal to Unit 3, but conventionally sequenced after it.

**Files:**
- Modify: `scripts/tracker.js:987-992` — swap the JSON.parse, remove the fallback, add the `role_types` array assertion.
- Modify: `scripts/test-tracker.sh` — add the break and invariant coverage.

**Approach:**
- Swap line 988: `const input = parseJsonArg(args.json, 'json', { expect: 'object' });`. After this swap alone, bare-array input gets a generic `expected JSON object for --json, got array` error — technically correct but unhelpful about what the right shape is.
- Replace the body at line 989 (currently `const doc = { role_types: input.role_types || input };`) with a strict check: `if (!Array.isArray(input.role_types)) throw new Error('set-archetypes --json requires { "role_types": [...] }'); const doc = { role_types: input.role_types };`.
- The strict check gives the canonical-shape error both for bare arrays (via parseJsonArg rejecting at the object-shape step) and for objects missing `role_types` (via this assertion). Together they close the contract.
- **Before landing, run a widened grep** to confirm no caller uses the bare-array shortcut: search `skills/`, `commands/`, `docs/`, `README.md`, and `RELEASING.md`. Only `skills/search/references/data-safety.md:101` references `set-archetypes` and uses the object form; no CHANGELOG file exists in the repo. If the widened grep surfaces any stale example, update or remove it in this unit.

**Execution note:** Characterization-first. Before touching line 988, capture current behavior in the harness:
1. Add "bare array succeeds today via fallback" as a *passing* characterization scenario against the unmodified code — proves the current behavior is what we think it is.
2. Add "canonical-shape error when bare array is passed after contract tightens" as a *failing* scenario.
3. Land the swap + strict check. The first scenario flips (now fails, which is the intended break) — delete or invert it; the second flips green.

**Patterns to follow:**
- Error style from `scripts/tracker.js:856-858` — imperative, name the command, show the canonical shape.

**Test scenarios:**
- Break (R5): `set-archetypes --json '["TPM", "PM"]'` → exit 1, stderr contains `set-archetypes --json requires { "role_types": [...] }`.
- Happy path preservation: `set-archetypes --json '{"role_types": ["TPM", "PM"]}'` → exit 0, `archetypes.yaml` has the updated role types.
- Error path — missing key: `set-archetypes --json '{}'` → exit 1, stderr contains `set-archetypes --json requires { "role_types": [...] }`.
- Error path — wrong type: `set-archetypes --json '{"role_types": "TPM"}'` → exit 1, stderr contains the canonical-shape message (the assertion triggers because `"TPM"` is not an array).
- Documented-invocation sanity: running the exact invocation shown at `skills/search/references/data-safety.md:101` against a temp workspace succeeds.

**Verification:**
- All scenarios above pass.
- Grep for `input.role_types || input` in `scripts/tracker.js` returns zero results.
- **R6 lands here:** `grep -c 'JSON\.parse(args\.' scripts/tracker.js` returns 0 after Unit 4.
- `skills/search/references/data-safety.md:101` still works against the hardened command.

---

- [ ] **Unit 5: Add `stored_at` annotations to `decline`, `stage`, `batch-decline`**

**Goal:** Attach a `stored_at` map to the return value of the three commands that write to hidden nested paths.

**Requirements:** R2, R7b

**Dependencies:** Unit 1 (test harness). Independent of Units 2-4, but commit order is linear.

**Files:**
- Modify: `scripts/tracker.js` — `decline` handler around line 770; `stage` handler around line 777; `batch-decline` handler around line 882.
- Modify: `scripts/test-tracker.sh` — add per-command scenarios plus the decline outcome-replay.

**Approach:**
- `decline` handler: after `declineEntry(...)`, return `{ ...app, stored_at: { reason: 'decision.reason', declined_date: 'dates.declined' } }`. `declineEntry` at `scripts/tracker.js:555-562` writes `app.decision.reason` and `app.dates.declined` — these paths are fixed strings; no dynamic construction needed.
- `stage` handler: after `stageEntry(doc, args.id, args.stage)` returns `app`, build `stored_at` using `app.stage` (which `stageEntry` sets to the resolved stage at `scripts/tracker.js:574` — aliases already applied, so this is the canonical stage name). Return `{ ...app, stored_at: { stage: 'stage', stage_date: 'dates.' + app.stage } }`. **Do not** reference a local `resolved` variable — it is only in scope inside `stageEntry`.
- `batch-decline` handler: add `stored_at` to the **top level** of the return object, not to each result element. The path strings are identical for every successful element, and attaching per-element would (a) duplicate the same object N times and (b) wrongly suggest a write happened for `ok: false` elements where `declineEntry` threw and no write occurred. New return shape: `{ declined, total, stored_at: { reason: 'decision.reason', declined_date: 'dates.declined' }, results }`. Individual result elements keep their existing `{ ok, id, company }` / `{ ok, id, error }` shape.
- **Spread order matters: always `{ ...app, stored_at: {...} }`**, never `{ stored_at: {...}, ...app }`. The latter would let an app field named `stored_at` silently overwrite the annotation. `stored_at` is a reserved field name in the return-value contract; never write it into the app record itself.
- `stored_at` is **not persisted to `tracker.yaml` and not rendered to the board**. The `writeTracker` call at `scripts/tracker.js:773` runs on the app record before `stored_at` is attached. The auto-board-rebuild at `scripts/tracker.js:1335-1340` reads the persisted record, so it also cannot pick up `stored_at`. Tests verify both (yaml and `index.html`).
- Keep `decline`, `stage`, `batch-decline` returning bare records (`decline` and `stage`) or the bare `{declined, total, results}` shape (`batch-decline`) plus the additive `stored_at` — no `ok: true` wrapper, no `app: {}` nesting. Every other mutating handler returns a bare record; a wrapper on these three would be a new inconsistency.

**Patterns to follow:**
- `decline` at `scripts/tracker.js:770-775` — the bare-return shape. `stage` at 777 and `batch-decline` at 882 follow the same pattern.
- No `stored_at` precedent exists. **Writing the `docs/solutions/` convention entry is a post-ship task (see Deferred to Separate Tasks); it is not part of Unit 5 completion criteria.**

**Test scenarios:**
- Happy path — decline: `decline --id <id> --reason "too junior"` → exit 0, `assert_json_field` confirms `stored_at.reason` === `decision.reason` and `stored_at.declined_date` === `dates.declined`. `decision.reason` on the record itself === `"too junior"`.
- Happy path — stage (applied): `stage --id <id> --stage applied` → exit 0, `stored_at.stage` === `stage` and `stored_at.stage_date` === `dates.applied`.
- Happy path — stage (alias resolution): `stage --id <id> --stage possible` (or whatever alias resolves to a canonical stage) → `stored_at.stage_date` reflects the *resolved* stage name, not the alias the user typed. Confirms the plan's `app.stage`-post-call approach works when aliases are involved.
- Happy path — batch-decline all success: `batch-decline --ids a,b --reason "x"` → exit 0, top-level `stored_at.reason` === `decision.reason` and `stored_at.declined_date` === `dates.declined`. Each element has `ok: true` and no per-element `stored_at`.
- Mixed success/failure — batch-decline with one valid and one invalid id: the valid element has `ok: true`; the invalid element has `ok: false` and `error: ...`; the top-level `stored_at` is still present (paths are real for the successful write that did happen). No element claims a false `stored_at` for the failed id.
- Persistence check — yaml: after a `decline` call, read `tracker.yaml` and confirm it contains no `stored_at` key. `get --id <id>` output also contains no `stored_at` (because the CLI reads from yaml).
- Persistence check — board: after a `decline` call, read `index.html` in the temp workspace and confirm it contains no `stored_at` string. Either invoke `decline` with `--no-board` and then inspect the resulting `index.html` after a separate `list` call, or let the auto-rebuild run and grep the rendered html.
- Invariant — no wrapper shape: decline stdout top-level keys are the existing bare-record fields (`id`, `company`, `role`, `stage`, `decision`, `dates`, `last_updated`) plus `stored_at`. No `ok` field, no `app` nesting.
- Outcome replay (R7b): running `decline --id <id> --reason "text"` produces output where `stored_at.reason` is visible at the top level via `assert_json_field`.

**Verification:**
- All scenarios pass.
- `grep -c 'stored_at' scripts/tracker.js` returns at least 3 (decline, stage, batch-decline handlers).
- `stored_at` appears in neither the persisted yaml nor the rendered html.
- No app record anywhere in the repo's YAML fixtures contains a `stored_at` field (would collide with the annotation).

## System-Wide Impact

- **Interaction graph:** `scripts/tracker.js` is the single boundary for all yaml reads/writes. 10 downstream skills invoke it (apply, assess, board, followup, review, update, plus references in search/). None parse JSON fields from stdout for shape (grep-verified). All rely on exit codes and human-readable output. Impact: additive-safe.
- **Error propagation:** All new errors thrown by `parseJsonArg` surface through the existing `main()` catch at `scripts/tracker.js:1342-1345`. Exit 1 uniform. No new channels.
- **State lifecycle risks:** `stored_at` must not be written to `tracker.yaml`. The `writeTracker` call runs on the app record before `stored_at` is attached — verify in tests (see Unit 5 persistence check).
- **API surface parity:** Other state-mutating commands (`add`, `update`, `set-*`, `update-filter-list`) intentionally do not get `stored_at`. Their writes are user-named and don't have the hidden-path problem. The bounded scope is documented in the origin requirements doc with explicit reopen triggers; a post-ship `docs/solutions/` entry captures it as repo guidance.
- **Integration coverage:** The shell harness covers end-to-end CLI invocation (the layer agents actually hit). No mock-only coverage; every scenario runs `node scripts/tracker.js <command>` against a temp workspace.
- **Unchanged invariants:**
  - `tracker.yaml` / `profile.yaml` / `archetypes.yaml` / `filters.yaml` schemas are unchanged.
  - Every existing handler still returns a bare record; no wrapper.
  - Exit-code contract unchanged (always 1 on error, 0 on success).
  - Auto-board-rebuild after mutation (`scripts/tracker.js:1335-1340`) is unchanged.
  - `batch`'s non-empty-array invariant is preserved (Unit 3).
  - Valid empty structures (`[]`, `{}`) still parse as no-ops.
  - The vendored `js-yaml` dep is the only runtime dep; no new deps added.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `set-archetypes` bare-array break catches an undocumented caller | Widen the pre-land grep to `skills/`, `commands/`, `docs/`, `README.md`, `RELEASING.md` (no CHANGELOG exists). Confirmed: only `skills/search/references/data-safety.md:101` references the command, in the object form. |
| Cowork session cache delays the `set-archetypes` break rather than mitigating it | Cached sessions continue running old tracker.js until refresh. The break then lands disconnected from the release notes a user just read. Mitigation: put a one-line version-skew notice in `tracker.js help` output for one release, or stamp a note at the top of the `data-safety.md` file pointing at the new contract. This is a release-engineering task, not a code task — flag in release notes. |
| `parseJsonArg` error messages too generic to help agents self-correct | Include flag name and neutral JSON-shape hint in every error. Outcome-replay test (R7a) verifies the Crusoe error is actionable via its content; *agent interpretability is not measured by this plan* and is a residual concern — revisit structured-JSON-error channel if a future incident shows agents still can't recover. |
| `stored_at` accidentally written to yaml or rendered to board | Explicit persistence-check scenarios in Unit 5 assert absence from both `tracker.yaml` and `index.html`. Mitigation is architectural: attach `stored_at` only to the return value after `writeTracker` runs. Spread order `{ ...app, stored_at }` prevents app-field shadowing. |
| `update-filter-list --add` element-type hole (e.g. `'[1,2,3]'`) passes shape validation and crashes at `item.toLowerCase()` | Out of scope for this plan per brainstorm. Implementer may fold in a one-line `if (!toAdd.every(x => typeof x === 'string')) throw …` assertion at the call site (Unit 2 or Unit 3 — element check is per-site, not in the helper). If deferred, file as a micro-issue; do not ship with the gap undocumented. |
| `batch`'s nested `op.fields` and `op.entry` values are not shape-checked by `parseJsonArg` | The helper runs once on the outer `--json` array; malformed nested objects in individual ops bypass it. Out of scope for this plan (recursive validation would be its own design). Documented as residual risk — if an incident surfaces, harden `batch` ops as a separate follow-up. |
| Shell harness uses bash 4+ idioms and silently breaks on macOS system bash 3.2 | Unit 1 explicitly targets bash 3.2 compatibility (shebang `#!/usr/bin/env bash`, no associative arrays, no `mapfile`, no `${var,,}`). Verification includes running under `/bin/bash` on macOS. |
| Shell harness doesn't run on Windows contributors | Cowork / plugin audience is macOS/Linux in practice. If a Windows contributor surfaces, port the harness or add a `node --test` parallel harness. Residual, not blocker. |
| Shell harness fragility (temp dirs leaked on failure, scenario coupling) | `set -euo pipefail` + `trap cleanup EXIT`, scenario-level workspaces via `setup_workspace`, descriptive assertion failures. If any single scenario flakes, the team can swap just that scenario to `node --test` without rewriting the harness. |

## Documentation / Operational Notes

- **Release notes entry** — flag the `set-archetypes` break explicitly. Reference `docs/solutions/integration-issues/cowork-plugin-runtime-constraints-2026-03-30.md` for the cowork cache behavior so users understand why existing sessions don't break until refresh.
- **Extend the inline `schema` command output** at `scripts/tracker.js:1045+` with a brief note documenting that `decline`, `stage`, and `batch-decline` return a top-level `stored_at` map. Low priority but closes the information-architecture gap where an agent reading `schema` to learn the contract wouldn't otherwise know the field exists.
- **Write a `docs/solutions/` entry after landing** covering:
  - The `parseJsonArg` shape-validation pattern and error-message style
  - The shell-smoke-test harness conventions (temp workspace, `assert_*` helpers, scenario-per-function structure)
  - The `stored_at` convention bounded to hidden-nested-write commands, with the reopen triggers from the origin doc
- **Update `skills/search/references/data-safety.md:101`** if the canonical set-archetypes invocation changes phrasing (currently object form, no change needed — but double-check during implementation).

## Sources & References

- **Origin document:** `docs/brainstorms/tracker-cli-hardening-requirements.md`
- **Target file:** `scripts/tracker.js`
- **Build constraint:** `scripts/build.js` (bundles tracker.js as-is)
- **Runtime dep:** `scripts/vendor/js-yaml.mjs`
- **Release flow:** `RELEASING.md`
- **Cowork constraints learning:** `docs/solutions/integration-issues/cowork-plugin-runtime-constraints-2026-03-30.md`
- **Downstream consumer audit (grep):** `skills/apply`, `skills/assess`, `skills/board`, `skills/followup`, `skills/review`, `skills/update`, `skills/search/references/` — 10 invocations, none parse JSON output for field shape
- **Canonical set-archetypes docs:** `skills/search/references/data-safety.md:101`
- **Tracker data-layer rule:** `skills/followup/SKILL.md:34`
