---
name: sweep
description: >
  Internal filesystem reconciliation skill for the JFM workspace. Invoked by
  other JFM skills (search, assess, prep, apply, update, review) when an
  expected file is missing, when Google Drive sync conflicts accumulate, or
  on a periodic cadence. NOT intended for direct user queries — natural-language
  requests like "clean up my files" or "fix my workspace" should be handled by
  the most relevant user-facing skill, which may then call this one.
user-invocable: false
---

# Filesystem reconciliation

Reconciles the JFM workspace against `tracker.yaml`. Wraps `tracker.js sweep`
for deterministic checks and adds judgment-based fixes the script can't make
on its own.

## When this skill runs

- **As a last resort**, called by another skill that hit a missing-file error
  (e.g., "expected jd.md not found", "overview.md missing for advance to
  applied")
- **Periodically** when the user explicitly schedules a reconciliation run
- **After a known sync incident** when the user reports Drive conflict files
  or "Resource deadlock avoided" errors

This skill is hidden from natural-language triggers via `user-invocable: false`.
The description deliberately avoids common cleanup verbs ("clean", "fix",
"tidy", "organize") so the matcher does not surface it for ordinary requests.

## Workflow

### 1. Shell setup

```bash
export JFM_DIR='<workspace path>'
```

### 2. Run the dry-run sweep

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js sweep --dry-run --scope all
```

Capture the JSON output. Fields per finding:

- `type` — see the table in step 4 for the full set
- `severity` — `error` / `warn` / `info`
- `path` / `expected_path` / `app_id` / `company` — context
- `auto_fixable` — whether `--apply` would handle it
- `remediation` — short text describing what a human should do

The `summary` block aggregates counts by severity and `auto_fixable`.

### 3. Auto-fix the safe categories

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js sweep --apply --scope drive,temp,backups
```

Auto-fixed types:

- `drive_conflict` (when an original sibling exists)
- `stale_temp` (under `/tmp/`, older than 24h)
- `backup_beyond_retention` (`.backups/` files older than 30 days)

Exit code 1 from `--apply` means fixes were applied successfully — that's the
intended signal, not a failure. Exit code 2 means partial failure (some fixes
errored). Report the count to the user as a single line:

> Auto-fixed N items: 3 Drive conflicts, 1 stale temp file.

### 4. Handle the judgment cases

For each remaining finding (those with `auto_fixable: false`):

| Finding type | Action |
|---|---|
| `missing_jd` | Read the tracker entry's `url`. Run `tracker.js verify-posting --url ...`. If `live: true` → fetch + save JD via `save-jd`. If closed → leave the missing-JD state, note "posting closed since application" on the entry. |
| `missing_overview` | Generate Company Overview inline (see prep skill's "Company Overview" section). Save to `{company_dir}/overview.md`. |
| `missing_role_dir` | `mkdir -p` the expected path. Note: any docs that lived there are lost — the dir will be empty. |
| `orphaned_role_dir` | Show the user the dir's contents. Ask: re-link to a tracker entry, archive (move to `companies/_archived/`), or delete. **Don't auto-delete** — orphans often hold work the user wants to keep. |
| `name_mismatch` | If `app.company` and `directory_name` are obviously the same (case/punctuation only), rename the directory to match the tracker entry. If ambiguous, ask. |
| `empty_company_dir` | Delete after confirmation. |
| `misplaced_file` | Show the user the file. Ask which company/role it belongs to, then move it. |

### 5. Drive-specific reconciliation

If the workspace is on a Google Drive folder (path contains `GoogleDrive-`,
`Library/CloudStorage/GoogleDrive`, or has `.drive` artifacts):

- For each `drive_conflict` finding without an original sibling: `diff` the
  conflict file content with what's in the same role directory, if anything.
  If they're effectively identical → delete the conflict. If different → show
  the diff to the user and ask which to keep.
- Watch for half-synced files: a file with size 0 that has an mtime > 5
  minutes old is likely a sync failure. Touch the file (`cat "$path" >/dev/null`)
  and ask the user to confirm Drive sync is healthy before retrying.
- If `tracker.js` reports any `EDEADLK` / `EAGAIN` / `EBUSY` warnings during
  the run, those files were treated as empty — the board metadata is correct
  but the body is blank. After Drive sync settles, re-write those files using
  agent file tools (which bypass FUSE caching) to restore the body content.

### 6. Rebuild the board

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js build-board
```

### 7. Report

One-line summary per finding type, totals at the end:

> Sweep complete. Auto-fixed 4 (3 Drive conflicts, 1 stale temp). Resolved
> with judgment: 2 missing JDs (re-fetched), 1 name mismatch (renamed dir).
> 1 unresolved: orphaned role dir at `companies/AcmeCo/2025-11-04-vp-eng/` —
> waiting on your decision.

## Calling from another skill

The search, assess, prep, apply, and update skills can invoke this skill when
they hit a "file expected but missing" error. Pattern:

> The role directory for `{id}` is missing its expected JD file. Running an
> internal sweep to check whether this is a known reconciliation issue.
>
> [Invoke sweep skill with scope=tracker-files]

The calling skill should NOT silently retry after a sweep — it should report
the sweep's findings and let the user decide whether to continue.

## Why split between script and skill

The deterministic checks (orphan detection, conflict file detection, missing
file detection) belong in the script — they're testable, fast, and don't need
an LLM. The judgment cases (deciding whether two files are "the same" content,
generating a missing overview, asking the user about an orphan dir) need the
agent.

The script provides a structured-data API; this skill provides judgment on top.
Other skills should prefer to call `tracker.js sweep --dry-run` directly when
they only need to *check* state — only invoke this skill when they need
remediation.
