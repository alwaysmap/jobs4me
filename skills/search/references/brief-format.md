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
- **Archetype**: {archetype name}
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

## Companies Confirmed with 0 Open Roles

{List of include-list companies whose career pages were checked and had no matching roles}

## Market Observations

{Structural patterns worth noting: market tightness, hybrid creep, domain specialization trends, salary trends, companies hiring aggressively vs. freezing}
```

## Guidelines

- Keep the brief scannable. The user should be able to read it in 2 minutes and know what happened.
- The "Companies to Watch" section is high value — these are roles the user might want to override the filters for. Always include the suggested action (e.g., "keep on watch — if remote version opens, high priority").
- The "Near Misses" table should be concise — just enough to show what was filtered and why.
- Market Observations should be honest about structural barriers (e.g., "most Director TPM roles this week require on-site Bay Area").
- If zero new roles were found, say so directly and focus the brief on market observations and watch list activity.
