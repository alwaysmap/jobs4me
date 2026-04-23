---
title: tracker CLI hardening — decline reason discoverability + JSON.parse arg safety
status: draft
date: 2026-04-22
---

# tracker CLI hardening

## Problem

Two bugs surfaced in a JFM session against `scripts/tracker.js`. They look alike on the surface but are two distinct failures that both compromise agent trust in the CLI.

**Problem A — output discoverability.** `decline --reason "text"` looked like it silently dropped the reason. The value is actually persisted at `app.decision.reason` (`scripts/tracker.js:558`), but the calling agent looked for a top-level `declined_reason` field, saw nothing, and wrote a redundant `notes` entry as a workaround. The data model and the input path are both correct — the failure is that the command's output gives agents no hint where the value landed, so they guess and guess wrong.

**Problem B — input shape validation.** `update-filter-list --add "Crusoe"` inserted six single-character entries (`C`, `r`, `u`, `s`, `o`, `e`) into `target_companies`. Root cause: `JSON.parse('"Crusoe"')` returns a string, and the loop at `scripts/tracker.js:1027` iterates strings as characters. The user worked around it by hand-editing `filters.yaml`.

Problem B is systemic: the same unchecked `JSON.parse(args.X)` pattern appears at **9 call sites** in `scripts/tracker.js` (lines 758, 765, 855, 902, 967, 988, 999, 1025, 1036). Every one of them is the same footgun waiting to fire again on a different command. `batch-decline` is not on this list — it uses `args.ids.split(',')`, not JSON, and is out of scope.

Problem A is a narrower symptom of a broader discoverability gap across every mutating command; this document addresses it for `decline` and leaves the general pattern as an open follow-up (see Non-goals).

## Users & goals

- **Primary:** agents (including Claude Code in JFM sessions) invoking `tracker.js` commands. Agents are the main consumers and the ones most likely to get shell-quoting wrong.
- **Secondary:** the plugin author invoking the CLI directly.

Goal: make `tracker.js` fail loudly and informatively on malformed JSON args, and make every command that writes to hidden nested paths (`decline`, `stage`, `batch-decline`) self-describing enough that an agent never has to guess where its values landed.

## Scope

**In scope:**
- **Problem A fix (discoverability).** `decline`, `stage`, and `batch-decline` command outputs each include a top-level `stored_at` annotation mapping caller concepts (e.g. `reason`, `declined_date`, `stage_date`) to the yaml paths where they were persisted. Additive-only change to return values; no wrapper, no data-model changes, no writes to yaml.
- **Problem B fix (shape validation).** Introduce a single helper (e.g. `parseJsonArg(argName, value, { expect: 'array' | 'object' })`) that:
  - Calls `JSON.parse` with a shape assertion using `Array.isArray` and a strict object check.
  - On parse failure or shape mismatch, throws a specific error naming the flag, the expected shape, and a neutral JSON-shape example.
  - Replaces every `JSON.parse(args.X)` call site in `scripts/tracker.js`. Each site declares its expected shape inline.
- **`set-archetypes` contract tightening.** Drop the bare-array shortcut; require the canonical `{"role_types": [...]}` object form. Breaking change in theory; dead-code removal in practice (no callers observed).
- **Regression coverage.** Add tests (or repro scripts) for:
  - `update-filter-list --add '"Crusoe"'` → errors, does not iterate characters.
  - `update-filter-list --add '["Crusoe"]'` → succeeds.
  - `decline --id X --reason "text"` → return value exposes `stored_at.reason` and `stored_at.declined_date`.
  - `stage --id X --stage applied` → return value exposes `stored_at.stage_date`.
  - At least one failure case per shape-expectant command to prove the helper is wired everywhere. (Planning may tighten this to a structural grep-returns-zero assertion + one helper unit test if the per-command spread proves wasteful against zero existing test infrastructure.)

**Out of scope:**
- Data-model changes. No new `declined_reason` top-level field; no rename of `decision.reason`.
- Auto-wrapping bare strings (e.g. `--add Crusoe` becoming `--add '["Crusoe"]'`). Rejected in favor of loud errors.
- `@file.json` / stdin input paths for JSON args. Useful idea, but expands scope beyond a bug fix. Re-visit if agents keep hitting quoting issues after this lands.
- Reject-unknown-fields strict mode on `update --json`. Separate discussion.
- Any change to downstream readers of `tracker.yaml` (board renderer, review skill, etc.).

## Behavior

### `stored_at` output annotation on nested-write commands

Three commands today write to nested paths inside an app record that aren't named by the user's flags: `decline` (writes `decision.reason`, `decision.proceed`, `dates.declined`), `stage` (writes `dates.{stage}`), and `batch-decline` (per-ID `decline` equivalent). These are the discoverability-gap commands. Commands where the user passes the target paths directly (`add --json`, `update --json`, `set-*`, `update-filter-list`) do not have this problem and are *not* changed by this item.

**Change:** each of the three commands' return values gains a top-level `stored_at` annotation — a map from the caller's input-concept to the yaml path where it landed. Additive, non-persisted, no wrapper.

`decline --id <id> --reason "text"` returns:

```json
{
  "id": "...",
  "company": "...",
  "role": "...",
  "stage": "declined",
  "decision": { "proceed": "no", "reason": "the text the user passed" },
  "dates": { ..., "declined": "2026-04-22" },
  "last_updated": "2026-04-22",
  "stored_at": {
    "reason": "decision.reason",
    "declined_date": "dates.declined"
  }
}
```

`stage --id <id> --stage applied` returns the app record plus:

```json
"stored_at": {
  "stage": "stage",
  "stage_date": "dates.applied"
}
```

`batch-decline --ids a,b --reason "..."` returns its existing per-ID result array; each element includes the same `stored_at` block as single `decline`.

**Rules:**
- **No `ok: true` wrapper; no `app: { ... }` nesting.** Every other mutating handler in `scripts/tracker.js` returns a bare record (`add` at `:756`, `update` at `:764`, `update-filter-list` at `:1042`). Wrapping only these three would create an inconsistent shape — exactly the kind of inconsistency this doc is trying to reduce.
- `stored_at` is an annotation on the return value, **not persisted to `tracker.yaml`**. The `writeTracker` call must continue to persist the app record as-is.
- The keys in `stored_at` are caller-facing concepts (`reason`, `declined_date`, `stage_date`, `stage`), not yaml path leaves. The values are the yaml paths. This is the load-bearing piece — it teaches the next agent where each value lives without making them parse the schema.
- Audit callers of `decline`, `stage`, and `batch-decline` stdout in `skills/` before landing to confirm no consumer will regress on the additive field. Additive changes on a bare record are low-risk, but verify.

Other mutating commands (`add`, `update`, `set-*`, `update-filter-list`) do not get `stored_at` in this change — their writes are user-named and don't have the hidden-path problem.

### `parseJsonArg` helper

Signature (exact name and API to be finalized in planning — this is the shape, not the contract):

```js
parseJsonArg(argName, value, { expect }) // expect: 'array' | 'object'
```

Behavior:
- Missing value (undefined, null, or literal empty string `''`) → throw "missing required --{argName}". Valid empty JSON structures (`[]`, `{}`) parse and pass through normally; they are not treated as missing.
- `JSON.parse` throws → rethrow with "invalid JSON for --{argName}: {short excerpt}. Expected a JSON {expect}, e.g. {shape_hint}."
- Parse succeeds but shape does not match `expect` → throw with "expected JSON {expect} for --{argName}, got {actual} ({short excerpt}). Expected shape: {shape_hint}."
- Parse succeeds and shape matches → return parsed value.

**Shape discrimination (important — `typeof [] === 'object'` in JS):**
- `expect: 'array'` requires `Array.isArray(parsed)`. Nulls, objects, and primitives are rejected.
- `expect: 'object'` requires `parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)`. Nulls, arrays, and primitives are rejected.

**Error message rules:**
- Name the specific flag (`--add`, `--json`, etc.) so agents can identify the offending arg without inspecting source.
- Use `shape_hint` as a neutral JSON-shape example — `["Acme", "Crusoe"]` for arrays, `{"notes":"..."}` for objects. Do not embed shell-specific quoting (single quotes, escapes) in the hint, since those vary across invocation contexts (bash vs. agent Bash tool vs. Windows git-bash vs. node spawn arrays).

**The helper validates input shape only.** Element-type validation (e.g. "array of strings") and length/content invariants (e.g. "non-empty array") remain the call site's responsibility. See Open Questions for whether to extend the helper with element-type support in a follow-up.

### Call-site conversion

Every existing `JSON.parse(args.X)` in `scripts/tracker.js` is replaced with `parseJsonArg('X', args.X, { expect: '...' })`. Shapes:

| Line | Command | Arg | Expected shape | Observed failure? |
|---|---|---|---|---|
| 758 | `add` | `--json` | object | no — preventative |
| 765 | `update` | `--json` | object | no — preventative |
| 855 | `batch` | `--json` | array (non-empty) | no — preventative |
| 902 | `filter-candidates` | `--json` | array | no — preventative |
| 967 | `set-profile` | `--json` | object | no — preventative |
| 988 | `set-archetypes` | `--json` | object (see note below) | no — preventative |
| 999 | `set-filters` | `--json` | object | no — preventative |
| 1025 | `update-filter-list` | `--add` | array (of strings) | **yes — Crusoe repro** |
| 1036 | `update-filter-list` | `--remove` | array (of strings) | no — preventative |

Two call sites already carry invariants beyond shape that must be preserved or deliberately broken during conversion:

- **Line 855 (`batch`)** currently enforces a non-empty array: `if (!Array.isArray(ops) || ops.length === 0) throw …`. The helper validates shape only, not length. Keep the length check inline at the call site after the helper call.
- **Line 988 (`set-archetypes`)** currently accepts *either* `{role_types: [...]}` or a bare array `[...]` via `input.role_types || input`. This change **drops the bare-array path**: `set-archetypes` becomes object-only and rejects bare arrays with a loud error pointing at the canonical shape (`{"role_types": [...]}`). Grep of the repo shows no caller using the bare-array shortcut (`skills/search/references/data-safety.md:101` documents the object form), so this is effectively dead-code removal. Planning should still confirm with a final grep before landing the break.

Zero-length but shape-valid inputs (e.g. `update-filter-list --add '[]'`) are legitimate no-op calls and must continue to succeed.

## Success criteria

- `node scripts/tracker.js update-filter-list --list target_companies --add '"Crusoe"'` exits non-zero with a message naming `--add`, the expected shape (`array`), and a corrected example. `filters.yaml` is unchanged.
- `node scripts/tracker.js update-filter-list --list target_companies --add '["Crusoe"]'` appends `Crusoe` as a single entry (existing happy-path behavior preserved).
- `node scripts/tracker.js decline --id <id> --reason "text"` returns JSON with a top-level `stored_at: { reason: "decision.reason", declined_date: "dates.declined" }`.
- `node scripts/tracker.js stage --id <id> --stage applied` returns JSON with a top-level `stored_at: { stage: "stage", stage_date: "dates.applied" }`.
- `node scripts/tracker.js batch-decline --ids a,b --reason "..."` returns per-ID results each carrying the same `stored_at` block as single `decline`.
- `node scripts/tracker.js set-archetypes --json '["TPM","PM"]'` errors loudly with a message pointing at the canonical `{"role_types": [...]}` form.
- All 9 former `JSON.parse(args.X)` call sites route through the new helper. Grep for `JSON.parse(args\.` in `scripts/tracker.js` returns zero results after the change.
- `batch`'s non-empty invariant at line 855 is preserved (calling `batch --json '[]'` still errors loudly, as it does today).
- `update-filter-list --add '[]'` and `set-filters --json '{}'` continue to succeed as no-op calls.
- Every targeted command has a test or repro for at least one malformed-shape case and one happy-path case.
- **Outcome replay:** Running the two original incident invocations against the hardened CLI — `update-filter-list --list target_companies --add '"Crusoe"'` and `decline --id <id> --reason "text"` — produces (a) a loud, flag-named error for Crusoe with an unchanged `filters.yaml`, and (b) a decline output where `stored_at.reason` is visible at the top level without reading source. These are the specific agent-facing failure modes that motivated the plan.
- No changes to `tracker.yaml`, `filters.yaml`, `profile.yaml`, or `archetypes.yaml` schema on disk.

## Open questions for planning

- **Exact helper name and module location.** `parseJsonArg` in the existing utilities section vs. a new file. Must stay single-file-buildable per `scripts/build.js`. Low-stakes, planning-time decision.
- **Error exit codes.** Current CLI exits 1 uniformly on handler throws (`scripts/tracker.js:1342-1345`). Planning should decide whether validation errors should exit with a distinct code (e.g. 2 for usage errors, following common CLI convention) — changes behavior for any caller already branching on exit codes.
- ~~`set-archetypes` dual-input~~ — resolved: object-only, bare-array path dropped. See `set-archetypes` note under the Call-site Conversion table.
- **No test harness exists.** `package.json` test script is the default stub; there is no `test/` directory. Planning must pick: node's built-in `node --test`, a shell smoke script invoking `node scripts/tracker.js …` against a temp workspace and grepping output, or another approach. The plugin ships zero-dep, so the shell smoke script matches the existing ethos; the built-in runner keeps assertions in JS but adds bootstrapping work.
- **Element-type validation.** The helper validates shape but not element types — `update-filter-list --add '[1,2,3]'` passes the shape check and then crashes at `item.toLowerCase()`. Decide whether the helper grows `{ of: 'string' }` support, the call site adds an explicit element-type assertion, or this is acknowledged as an unaddressed residual risk. Not a blocker for the original Crusoe repro, but listed so it doesn't get silently forgotten.

## Non-goals

- Redesigning the CLI contract (e.g. moving away from JSON-on-command-line to named scalar flags or stdin input).
- Adding a schema field to make `declined_reason` a first-class top-level property.
- Extending `stored_at` to commands whose writes are already user-named (`add --json`, `update --json`, `set-*`, `update-filter-list`). These commands let the caller pass the target path directly, so the discoverability failure mode doesn't apply. **Trigger to reopen:** a user-named-field command produces a discoverability incident anyway → promote `stored_at` to those commands too.
- Richer `schema` command output as an alternative discoverability mechanism. The `stored_at` approach on nested-write commands is the local fix; a schema-driven "where does field X live?" query is the broader investment. **Trigger to reopen:** `stored_at` on the three target commands doesn't prevent the next guess-wrong incident.
- `@file.json` / stdin input for JSON args. **Trigger to reopen:** one additional shell-quoting-related incident after this ships → promote `@file` input to a P0 follow-up for the batch-ish commands (`batch`, `filter-candidates`, `set-archetypes`, `set-filters`).
