---
name: search
description: >
  Use this skill when the user wants to "search for jobs", "find new roles",
  "run a search sweep", "look for open positions", "check job boards",
  or when a scheduled search task runs. Also use when assessing whether
  a specific role is a good fit, or when updating decline patterns
  after the user rejects suggestions.
user_summary: >
  Search job boards for new roles that match your profile. Filters out
  duplicates and known bad fits automatically, then suggests the best matches.
version: 0.1.0
---

# Job Search Agent

Autonomous job search, fit assessment, and learning loop for a configured job seeker.

## Shell Setup

Before running any tracker commands, set `JFM_DIR` so paths with special characters (`!`, `$`, spaces) work safely. Use single quotes:

```bash
export JFM_DIR='<workspace path>'
```

Then omit `--dir` from all commands — the script reads `JFM_DIR` automatically. See `references/data-safety.md` for details.

## Core Files

The user's workspace folder contains these YAML files. Always read them fresh at the start of each operation — the user may have edited them by hand:

- **profile.yaml** — who the user is: resume URLs, portfolio, preferences (comp floor, travel limits, locations, seniority floor)
- **archetypes.yaml** — the role types they're targeting: titles, search keywords, experience mapping
- **filters.yaml** — company include/exclude/watch lists, priority job board sources, and decline patterns
- **tracker.yaml** — all applications with stage, dates, agent summary, decision history

## Search Sweep

When running a search (via `/search` command or scheduled task):

1. Read `profile.yaml`, `archetypes.yaml`, and `filters.yaml`
2. For each archetype, search the web for matching roles:
   - Search priority sources listed in `filters.yaml` first
   - Search career pages of companies in the include list
   - Search general job boards with archetype keywords + location preferences
3. Collect all raw candidates as JSON: `[{"company":"...","role":"...","url":"...","description":"..."}]`
4. **Filter in bulk** — pass the entire candidate list through the script in one call:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js filter-candidates --dir . --json '<candidates JSON>'
   ```
   This checks every candidate against the skip list, decline patterns, and existing tracker entries in one pass. Only `passed` candidates need further evaluation. Note any `filtered_detail` entries with `reason: "decline_pattern"` as "near misses" for the brief.
5. For each passed candidate, fetch the full job posting and run a fit assessment (see `references/fit-assessment.md`)
6. **Add all recommended roles in one batch write**:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js batch --dir . --json '[{"op":"add","entry":{"company":"...","role":"...","url":"...","archetype":"...","stage":"suggested","agent_summary":"..."}}]'
   ```
   This writes `tracker.yaml` once, not N times.
7. For each new role, save the JD in one call:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js save-jd --id <id> --file /tmp/jd-content.md --dir .
   ```
   This creates the `companies/{Company}/{YYYY-MM-role}/` directory and writes `jd.md`. Write the JD content to a temp file first, then pass `--file`. Include inline markdown links and a Company Health paragraph in the JD.
8. **Auto company research** — after adding all roles and saving JDs, check which companies need research:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js needs-research --dir .
   ```
   For each company in the `needs_research` list, launch a background sub-agent to generate the Company Overview (see the "Company Overview" section of the prep skill for the template). Save to `{company_dir}/overview.md`. Only one overview per company — if a company already has research from a previous role, skip it.
9. Write a search brief to `briefs/` (see `references/brief-format.md`)
10. **Always regenerate `Kanban/index.html`** after writing the brief:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js build-board --dir .
   ```
   This runs instantly — no sub-agent needed. The board stays current after every sweep.

### Thin Results

If the search finds fewer than 3 new roles, don't just say "not much out there." Proactively coach the user:

> This sweep didn't turn up many new roles. A few ways to cast a wider net:
>
> - **Add more sources** — more job boards, investor portfolios, or company career pages. Use `/tweak` to add them. Look broadly, then filter.
> - **Broaden your archetypes** — if you're only searching for exact title matches, consider adding related titles or a new archetype for adjacent roles.
> - **Check your skip list** — decline patterns that were useful early on might be filtering out good roles now.
> - **Add specific companies** — if there are companies you'd love to work for, `/tweak` can add their career pages as a direct source.
>
> The best searches come from a wide funnel with smart filters, not a narrow funnel from the start.

If the search finds zero new roles, still check if existing suggested roles are stale (identified more than 14 days ago) and mention any that might need action.

## Fit Assessment

When assessing a single role (via `/assess` or during a sweep):

Read `references/fit-assessment.md` for the full assessment framework. The output is a structured `agent_summary` field in this order:

1. **Recommendation** — proceed / pass / flag, with a one-line rationale
2. **Gaps & Concerns** — what's missing or risky
3. **Positive Fit** — evidence of match from the user's background

Always check the role against the user's hard constraints first (comp floor, travel, location, seniority) before doing the deeper fit analysis. If a hard constraint fails, mark it as a pass with the constraint violation as the reason.

## Decline Pattern Learning

When the user declines a role (via `/update Company - decline reason` or in conversation):

Read `references/decline-learning.md` for the full process. After each decline or batch of declines:

1. Compare the decline reason against existing `decline_patterns` in `filters.yaml`
2. If a new pattern emerges, add it with the company name as `learned_from`
3. If an existing pattern needs refinement, update it
4. Report what was added/changed to the user

## YAML Writing Rules

**CRITICAL: Read `references/data-safety.md` before ANY file write.** Every write to a YAML file must follow the data safety protocol: backup first, validate after, use minimal edits, quote defensively.

When writing or updating `tracker.yaml`:

- **Backup before every write** — copy to `.backups/` with a timestamp
- **Prefer Edit over Write** — change only the lines that need changing, not the whole file
- **Validate after every write** — read back and confirm entry count matches
- Preserve the existing file structure exactly — read the file, parse it, update only the changed entries, write it back
- Use block scalar (`|`) for `agent_summary` fields (multi-line markdown)
- Quote role titles that contain special characters: `role: "Sr. Director, TPM"`
- Use ISO dates: `2026-03-27`
- Dedup on `company + role` pair, not just company — the same company can have multiple valid entries for different roles
- Always set `last_updated` to today's date when modifying an entry
- Never delete entries — declined roles are valuable for the learning loop
- Never strip unknown fields — the user may have added custom data

## Additional Resources

- **`references/fit-assessment.md`** — structured framework for scoring a role against a user profile
- **`references/brief-format.md`** — template and guidelines for search brief output
- **`references/decline-learning.md`** — how to update filters from decline decisions
- **`references/data-safety.md`** — mandatory protocol for all file writes (backup, validate, minimal edits)
