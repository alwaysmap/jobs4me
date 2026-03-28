# Fit Assessment Framework

Structured process for evaluating whether a role matches a user's profile.

## Step 1: Hard Constraint Check

Check these first. If any fail, the role is an automatic pass (do not proceed to deeper analysis):

- **Compensation**: Is the listed or estimated comp at or above the user's floor? (Check `preferences.comp_floor_usd` or `preferences.comp_floor_gbp`). Note any comp exception rules (e.g., civic tech floor).
- **Location**: Does the role match the user's acceptable locations? Remote-only users should not see hybrid roles unless the user has listed that specific city.
- **Travel**: Is travel under the user's max? Check the JD for phrases like "up to X% travel" or "frequent travel required."
- **Seniority**: Is the role at or above the user's seniority floor? A Director-floor user should not see Senior Manager roles unless the scope is clearly Director-equivalent.

If a constraint fails, return a brief agent_summary:

```
### Recommendation
**Pass** — [constraint] does not meet minimum ([value] vs. required [floor])
```

## Step 2: Archetype Matching

Determine which archetype the role best fits. Read `archetypes.yaml` and compare:

- Does the role title match or closely resemble any `target_titles`?
- Does the JD language overlap with `search_keywords`?
- Does the company size/type match `company_fit`?

If no archetype is a reasonable match, the role may still be worth flagging if it's an unusual opportunity. Note this in the recommendation.

## Step 3: Evidence Mapping

For the matched archetype, read its `experience_mapping` and compare against the JD requirements:

- Which requirements does the user's experience directly address?
- Which requirements are adjacent (related but not direct)?
- Which requirements have no evidence in the user's background?

Also check the user's `profile.yaml` evidence (resume URL, portfolio, additional context) for supporting detail.

## Step 4: Company Health Check

Research the company briefly:

- What do they do and how do they make money?
- Recent funding, revenue, or growth signals
- Glassdoor/reputation signals if easily findable
- Any red flags (layoffs, leadership turnover, regulatory issues)

Summarize in 2-3 sentences. This becomes the `company_health` section of the JD file.

## Step 5: Write the Agent Summary

Output format (this exact order — recommendation first):

```markdown
### Recommendation
**[Strong/Moderate/Stretch/Pass]** — [One sentence rationale]

### Gaps & Concerns
- [Gap 1: what's missing and how significant]
- [Gap 2: ...]

### Positive Fit
- [Evidence 1: specific experience that maps to a requirement]
- [Evidence 2: ...]
```

Strength levels:
- **Strong**: 80%+ of requirements directly addressed by evidence, no hard constraint issues, company health is positive
- **Moderate**: 60-80% match, or one soft concern (adjacent experience, slightly below ideal seniority, untested domain)
- **Stretch**: 40-60% match, or significant gap in a core requirement, but the role is interesting enough to flag
- **Pass**: Hard constraint failure, or <40% match, or serious company health red flags

## JD File Format

When saving a JD, use this structure:

```markdown
# {Company} — {Role Title}

**Source**: [Where found](url)
**Posted**: {date if known}
**Location**: {location as listed}
**Compensation**: {if listed, otherwise "Not listed"}

## Company Health

{2-3 sentences on finances, culture, hiring posture, risk flags}

## Job Description

{Full JD text, cleaned up for readability. Use inline markdown links — never bare URLs.}
```
