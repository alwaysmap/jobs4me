# Search Brief Format

After each search sweep, write a brief to `briefs/{YYYY-MM-DD}.md` (or `{YYYY-MM-DD} (PM).md` if a second run that day).

## Structure

```markdown
# Job Search Brief — {date}

**Run time**: {time}
**New roles found**: {count}

## Summary

{2-4 sentences: market observations, structural patterns, notable finds or gaps}

## New Suggestions

{For each new role added to tracker as suggested:}

### {Company} — {Role Title}
- **Role type**: {role type name}
- **Recommendation**: {Strong/Moderate/Stretch}
- **Key fit**: {one sentence on why it matches}
- **Key concern**: {one sentence on the main gap, if any}

## Companies to Watch

{Roles that looked interesting but failed a filter or were edge cases:}

- **{Company}** — {Role}: {Why interesting} / {Why not added} / {Suggested action}

## Near Misses

| Company | Role | Reason Excluded |
|---------|------|-----------------|
| ... | ... | ... |

## Sources Checked

| Source | Type | Result |
|--------|------|--------|
| LinkedIn | job_board | 12 candidates |
| Wellfound | job_board | 3 candidates |
| Acme Corp careers | career_page | 0 — no matching roles |
| a16z portfolio | org_portfolio | Checked 8 companies, 2 had matches |
| HigherEdJobs | job_board | Error — timeout |

{List every source checked, what type it is, and what happened. This helps the user debug thin results and know which sources are working.}

## Companies Confirmed with 0 Open Roles

{List of include-list companies whose career pages were checked and had no matching roles}

## Industry Match Report

{If `filters.yaml` has industries set, report on them:}

| Industry Interest | Roles Found | Notes |
|---|---|---|
| water utilities | 2 | Both at regional utilities, director-level |
| industrial data | 1 | Cognite — stretch on seniority |

{If no roles matched any industry interest, say so: "No roles found in your preferred industries this sweep. Consider adding more sources in these sectors — I can suggest some if you run /tweak."}

## Market Observations

{Structural patterns worth noting: market tightness, hybrid creep, domain specialization trends, salary trends, companies hiring aggressively vs. freezing}
```

## Guidelines

- Keep the brief scannable. The user should be able to read it in 2 minutes and know what happened.
- The "Companies to Watch" section is high value — these are roles the user might want to override the filters for. Always include the suggested action (e.g., "keep on watch — if remote version opens, high priority").
- The "Near Misses" table should be concise — just enough to show what was filtered and why.
- Market Observations should be honest about structural barriers (e.g., "most Director TPM roles this week require on-site Bay Area").
- If zero new roles were found, say so directly and focus the brief on market observations and watch list activity.
