# Data Safety Protocol

**All tracker.yaml and filters.yaml mutations MUST go through the tracker.js script.** Never write YAML by hand.

## The Script

Location: `${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js`

Run via Bash. The script auto-detects the workspace by walking up from the current directory looking for `tracker.yaml` or `profile.yaml`. It also auto-installs npm dependencies on first run.

The workspace directory can be set explicitly if needed (in priority order):

1. **`--dir <path>`** flag on each command
2. **`JFM_DIR` environment variable** — set once, all commands pick it up
3. **Auto-detection** — walks up from cwd looking for `tracker.yaml` or `profile.yaml`

**Use `JFM_DIR` only when the workspace path contains special shell characters** (`!`, `$`, `#`, spaces, etc.):

```bash
export JFM_DIR='/path/to/My Project!'
```

For most cases, just run commands directly — no `--dir` needed:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js <command> [options]
```

**Board auto-rebuild:** All mutating commands automatically rebuild `Kanban/index.html` after every change. Pass `--no-board` to skip this during batch operations where you want one rebuild at the end.

## Commands

### Reading

```bash
# List all applications as JSON
node tracker.js list
# Get one application by id
node tracker.js get --id acme-corp-director-of-tpm
# Find by company name (fuzzy match)
node tracker.js find --company "Acme"
# Count by stage
node tracker.js count
# Export JSON for board template injection
node tracker.js board-json
# Validate the tracker file
node tracker.js validate```

### Writing

```bash
# Add a new application (pass fields as JSON)
node tracker.js add --dir . --json '{"company":"Acme Corp","role":"Director of TPM","url":"https://acme.com/careers","archetype":"tpm_leadership","agent_summary":"### Recommendation\n**Strong** — ..."}'

# Update fields on an existing application (merge, not replace)
node tracker.js update --id acme-corp-director-of-tpm --dir . --json '{"notes":"Phone screen went well","stage":"interviewing"}'

# Change stage only
node tracker.js stage --id acme-corp-director-of-tpm --stage applied
# Decline with a reason
node tracker.js decline --id acme-corp-director-of-tpm --reason "40% travel required"
# Initialize an empty tracker
node tracker.js init
# Add a decline pattern to filters.yaml
node tracker.js add-decline-pattern --dir . --pattern "Travel > 15%" --learned-from "BigCo (40% travel)"
```

## What the Script Does Automatically

Every mutating command:

1. **Backs up** the current file to `.backups/` with a timestamp (keeps last 20)
2. **Validates** after writing — checks entry count, required fields, valid stages, no duplicate ids
3. **Rebuilds `Kanban/index.html`** automatically (pass `--no-board` to skip during batch operations)
4. **Returns** the affected entry as JSON to stdout (parseable by Claude)

## What Claude Should Do

- **To read tracker data**: call `list`, `get`, `find`, or `count` and parse the JSON output
- **To add a new role**: build the JSON object with all fields, call `add`
- **To update a role**: call `update` with just the changed fields (the script merges)
- **To change stage**: call `stage` (simpler than update for just stage changes)
- **To decline**: call `decline` with the id and reason
- **To generate the board**: call `build-board` which reads YAML + markdown and writes `Kanban/index.html`
- **To read other YAML files** (profile.yaml, archetypes.yaml): use the Read tool directly — these files are written rarely and by the /setup command

## Files Claude MAY Write Directly

Only markdown content files — never YAML config:

- `briefs/*.md` — search brief markdown files
- `companies/*/overview.md` — company research docs
- `companies/*/*/jd.md`, `companies/*/*/prep.md` — role-specific docs
- `companies/*/*/cover-letter.md`, `companies/*/*/resume.md` — application materials

## Files Claude Must NEVER Write Directly

**ALL YAML files must be written through tracker.js commands.** This ensures schema validation, backups, and board rebuilds.

| File | Read command | Write command |
|------|-------------|---------------|
| `tracker.yaml` | `list`, `get`, `find`, `count` | `add`, `update`, `decline`, `stage`, `batch` |
| `profile.yaml` | `get-profile` | `set-profile --json '{...}'` |
| `archetypes.yaml` | `get-archetypes` | `set-archetypes --json '{...}'` |
| `filters.yaml` | `get-filters` | `set-filters --json '{...}'`, `update-filter-list --list <name> --add/--remove '[...]'` (lists: target_companies, skip_companies, watch, industries) |

**To see the expected shape of any file:** `node tracker.js schema --file profile` (or `archetypes`, `filters`, `tracker`, `all`)

**If a write fails validation**, the error message shows exactly which field is wrong and what's expected. Run `schema` to see the full shape.

## Surfacing Created Files

**REQUIRED: Every time you create or update a document, present it to the user with `present_files`.** Never silently write a file. After writing any document (overview, prep, JD, cover letter, brief, board):

1. **Call `present_files`** with the file path(s) so the user can open them directly
2. **Summarize what was created** — document type and a 2-3 line summary of the content
3. **Mention the board** if the doc is viewable there

**NEVER use markdown links** to local file paths — they render as broken links in Cowork. Always use `present_files` instead.

Example flow:
1. Write files
2. Call `present_files(["${JFM_DIR}/companies/Oracle/overview.md", "${JFM_DIR}/companies/Oracle/2026-03-30-sr-principal-tpm/prep.md", "${JFM_DIR}/Kanban/index.html"])`
3. Tell the user: "Created company overview and interview prep for Oracle. Both are viewable on your board — click the role card to read them."

This applies to ALL skills that write files — search (JDs, briefs, overviews), prep (overview, prep), apply (cover letter, resume), assess (JD, overview), board (Kanban/index.html).
