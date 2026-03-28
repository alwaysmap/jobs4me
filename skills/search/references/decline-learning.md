# Decline Pattern Learning

When the user declines a role, update the filters to prevent similar bad suggestions in the future.

## Process

1. Read the decline reason (from `/decline` command or conversation)
2. Read current `decline_patterns` from `filters.yaml`
3. Determine if this decline represents:
   - **A new pattern** not yet captured (add it)
   - **A refinement** of an existing pattern (update it with the new example)
   - **A one-off** that doesn't generalize (don't add a pattern, just note it)
4. If adding or updating, include `learned_from` with the company name
5. Write the updated `filters.yaml`
6. Tell the user what changed

## When to Add a New Pattern

Add a pattern when:
- The same type of decline has happened 2+ times (or 1 time if the reason is clearly generalizable)
- The pattern can be described concisely enough that a future search can check for it
- The pattern won't accidentally filter out good roles

Examples of good patterns:
- "Travel > 15%" (learned from Veeam at 40%)
- "Requires deep hands-on software engineering" (learned from Toast)
- "Enterprise-conglomerate-acquired company" (learned from Mission Cloud via CDW)

Examples of one-offs that shouldn't become patterns:
- "I already know someone there and it's awkward"
- "They just hired someone I don't want to work with"

## When to Update an Existing Pattern

Update when a new decline is a variant of an existing pattern. Add the new company to `learned_from`:

```yaml
- pattern: "On-site or hybrid in cities user isn't near"
  learned_from: "Intuit (Mountain View), CaptivateIQ (Raleigh), Datadog (NYC hybrid)"
```

## When to Remove or Relax a Pattern

If the user expresses interest in a role that would be filtered by an existing pattern, the pattern may be too aggressive. Ask before modifying:

> "This role matches your decline pattern for '{pattern}'. Should I relax that filter, or is this an exception?"

## Proactive Auditing

After processing a batch of declines (e.g., after a search sweep where the user reviews suggested cards), proactively check if any new patterns have emerged. Don't wait for the user to flag stale filters. Look for:

1. New patterns not yet captured
2. Existing patterns that need refinement based on new examples
3. Patterns that are too aggressive and filtering out valid roles
