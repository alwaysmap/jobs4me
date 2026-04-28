# YAML Writing Rules

Loaded by the search skill (and any skill that mutates `tracker.yaml`,
`filters.yaml`, `archetypes.yaml`, or `profile.yaml`) before writing.

## Mandatory protocol

**Read `data-safety.md` before ANY file write.** That file is the
canonical write protocol; this file covers the formatting and
deduplication rules.

## Formatting

- **All `tracker.yaml` / `filters.yaml` mutations go through `tracker.js`** — never write YAML by hand. The script backs up automatically, validates after write, and rebuilds the board.
- Use block scalar (`|`) for `agent_summary` fields.
- Quote role titles with special characters: `role: "Sr. Director, TPM"`.
- Use ISO dates: `2026-03-28`.
- Em dashes inside `agent_summary` text have no surrounding spaces:
  `word—word`, never `word — word`. (See also `apply/references/voice.md`
  for the cross-skill voice rules.)
- Never delete entries — declined roles are valuable for the learning
  loop.

## Deduplication

Dedup on `(company, role)` pairs, not company alone — Toast can
legitimately have a "Director, TPM" entry and a "Senior TPM" entry
simultaneously.

The `filter-candidates` script does the basic match and surfaces the
existing entry's `stage`, `decline_reason`, and `last_updated` in
`existing_entry`, plus a `suggest_resurface` boolean for the heuristic
case. When a candidate's `(company, role)` matches an existing tracker
entry, what the agent does next depends on the existing entry's stage
and decline reason:

| Existing entry | Action on new candidate |
|---|---|
| `suggested`, `maybe`, `applied`, `interviewing`, `offered` | Skip silently. Log under "Already in pipeline" in the brief. |
| `declined` because posting was stale or closed (`suggest_resurface: true`) | **Re-surface as a flagged duplicate.** Do not auto-add. Brief should call this out: "Reopened? Was previously logged as closed." |
| `declined` for substantive reason — travel, comp, domain, ownership (`suggest_resurface: false`) | Skip. Log under "Near Misses" with the original decline reason — useful signal that the company is hiring again. |
| `closed` (posting filled/removed, `suggest_resurface: true`) | Same as the stale-decline branch — flag for review. |
| `rejected` | Skip silently. |

The `suggest_resurface` flag fires when `existing_entry.decline_reason`
contains "stale", "closed", "posting", "removed", "filled", or "no longer
hiring". If your decline reason for a stale role doesn't match that
pattern, the script will treat it as a substantive decline — be specific
in decline reasons.
