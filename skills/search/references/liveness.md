# Liveness Gate

Loaded by the search skill before any candidate is added to `tracker.yaml`
as `suggested`. The script enforces this at write time — `tracker.js add`
refuses to persist a `suggested` entry without `--liveness-verified-at`.

## Why this exists

Aggregator mirrors and Google snippets lag the live posting by days to
weeks. Adding a "suggested" role from snippet content surfaces postings
that have actually closed — which is exactly the failure mode that motivated
this gate.

## The verify command

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js verify-posting \
  --url "<original posting URL>" \
  --role-title "<role title>"
```

Always against the **original posting URL** — not an aggregator mirror, not
a snippet, not a cached search result.

## What to require

Treat the role as live only when **all four** checks pass in the JSON
output:

1. **`status_2xx: true`** — not 404, not 410, not a redirect to a generic
   /careers index
2. **`title_present: true`** — the role title (or close variant) appears
   in the response body
3. **`no_closure_phrase: true`** — no closure language ("no longer
   accepting applications", "position filled", "this role is closed", etc.)
4. **`is_specific_page: true`** — for Greenhouse / Lever / Ashby
   deep-links, the page resolved to the specific role, not the company's
   generic board

If `live: false` or any check is ambiguous, **do not surface the role.**
Log it under "Companies to Watch" in the brief with a note: "Posting may
have closed — re-check next sweep."

## Adding to tracker after verification

When you `add` the role to the tracker, pass the verification timestamp
from the verify-posting result so the gate is enforced at write time:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js add \
  --liveness-verified-at "<fetched_at from verify-posting>" \
  --json '{"company":"...","role":"...","url":"...","stage":"suggested",...}'
```

The `add` command refuses to write a `suggested` entry without
`--liveness-verified-at`. This is intentional — agent code cannot silently
skip the gate.

For batch writes, pass `skip_liveness_check: true` per-op only when the
caller has *already* verified each entry's URL:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js batch --json '[{
  "op": "add",
  "entry": { "company": "...", "role": "...", "url": "...", "stage": "suggested",
             "dates": { "liveness_verified": "<ISO timestamp>" } }
}]'
```

## Liveness vs content extraction

The four content-extraction tiers in Phase 2 Step A (direct fetch, Chrome
MCP, aggregator, skip) are *separate* from liveness. Even if a role's JD
content was retrieved from an aggregator, the liveness fetch must still
hit the original posting URL. Aggregator content + aggregator liveness
check would just compound the staleness risk.
