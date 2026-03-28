# Data Safety Protocol

**All tracker.yaml and filters.yaml mutations MUST go through the tracker.js script.** Never write YAML by hand.

## The Script

Location: `${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js`

Run via Bash. The workspace directory can be set three ways (in priority order):

1. **`--dir <path>`** flag on each command
2. **`JFM_DIR` environment variable** — set once, all commands pick it up
3. **Current working directory** as fallback

**Use `JFM_DIR` when the workspace path contains special shell characters** (`!`, `$`, `#`, spaces, etc.). Set it once with single quotes to prevent shell expansion:

```bash
export JFM_DIR='/path/to/My Project!'
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js list
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js count
# No --dir needed — JFM_DIR handles it
```

For paths without special characters, `--dir .` is fine:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js <command> --dir . [options]
```

## Commands

### Reading

```bash
# List all applications as JSON
node tracker.js list --dir .

# Get one application by id
node tracker.js get --id acme-corp-director-of-tpm --dir .

# Find by company name (fuzzy match)
node tracker.js find --company "Acme" --dir .

# Count by stage
node tracker.js count --dir .

# Export JSON for board template injection
node tracker.js board-json --dir .

# Validate the tracker file
node tracker.js validate --dir .
```

### Writing

```bash
# Add a new application (pass fields as JSON)
node tracker.js add --dir . --json '{"company":"Acme Corp","role":"Director of TPM","url":"https://acme.com/careers","archetype":"tpm_leadership","agent_summary":"### Recommendation\n**Strong** — ..."}'

# Update fields on an existing application (merge, not replace)
node tracker.js update --id acme-corp-director-of-tpm --dir . --json '{"notes":"Phone screen went well","stage":"interviewing"}'

# Change stage only
node tracker.js stage --id acme-corp-director-of-tpm --stage applied --dir .

# Decline with a reason
node tracker.js decline --id acme-corp-director-of-tpm --reason "40% travel required" --dir .

# Initialize an empty tracker
node tracker.js init --dir .

# Add a decline pattern to filters.yaml
node tracker.js add-decline-pattern --dir . --pattern "Travel > 15%" --learned-from "BigCo (40% travel)"
```

## What the Script Does Automatically

Every mutating command:

1. **Backs up** the current file to `.backups/` with a timestamp (keeps last 20)
2. **Validates** after writing — checks entry count, required fields, valid stages, no duplicate ids
3. **Returns** the affected entry as JSON to stdout (parseable by Claude)

## What Claude Should Do

- **To read tracker data**: call `list`, `get`, `find`, or `count` and parse the JSON output
- **To add a new role**: build the JSON object with all fields, call `add`
- **To update a role**: call `update` with just the changed fields (the script merges)
- **To change stage**: call `stage` (simpler than update for just stage changes)
- **To decline**: call `decline` with the id and reason
- **To generate the board**: call `build-board` which reads YAML + markdown and writes `Kanban/index.html`
- **To read other YAML files** (profile.yaml, archetypes.yaml): use the Read tool directly — these files are written rarely and by the /setup command

## Files Claude MAY Write Directly

These files are written infrequently and have simple schemas:

- `profile.yaml` — written during /setup, rarely changed after
- `archetypes.yaml` — written during /setup, occasionally edited
- `briefs/*.md` — markdown files, no schema concerns
- `companies/*/overview.md` and `companies/*/*/jd.md`, `companies/*/*/prep.md` — research docs
- `Kanban/index.html` — generated HTML, not user-editable data

## Files Claude Must NEVER Write Directly

- `tracker.yaml` — always use tracker.js
- `filters.yaml` — use tracker.js for decline_patterns; other filter changes are rare enough to be acceptable via Edit tool with care
