# Career Page Search Strategy — JS-rendered Boards

Loaded in Phase 1 of the search sweep when scraping company career pages.
Most modern career pages (Greenhouse, Ashby, Workday, custom React SPAs)
return only a JavaScript skeleton on a plain HTTP fetch — listings render
client-side. Use the tiered approach below.

## Tiered fetch

| Tier | Method | How | When to use |
|------|--------|-----|-------------|
| 1 | **Chrome MCP** | `tabs_context_mcp` → `navigate` to career URL → `javascript_tool` to extract `document.body.innerText` | Best: live, fully rendered. Use whenever Chrome is connected. |
| 2 | **Google `site:` search** | `site:job-boards.greenhouse.io/SLUG "director" remote` | Chrome not available. Google indexes rendered pages — most reliable non-browser fallback. |
| 3 | **Aggregator mirror** | Search `builtin.com`, `himalayas.app`, or `remotive.com` | Secondary confirmation only. Flag staleness risk in brief. |
| 4 | **Direct WebFetch** | Fetch the URL directly | Static sites, Lever pages, and some custom career pages. |

## Chrome MCP availability check

Run at the start of every sweep before doing anything else:

```
Call tabs_context_mcp (no arguments):
  → Returns tab list: Chrome is ready — use Tier 1 for all JS-rendered career pages
  → Returns error / "not connected": Chrome is unavailable — use Tier 2 (Google site:)
```

Never silently return 0 results from a JS-rendered career page. If a direct
fetch yields only a JS skeleton (page body is < 500 chars, or contains only
`<script>` tags and no visible text), immediately escalate to the next tier
and note the fallback used in the search brief.

## Chrome MCP extraction pattern

After `navigate()` to the career page URL:

```javascript
const lines = document.body.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
const relevant = lines.filter(l => /director|head of|VP |vice president|senior director|principal/i.test(l));
JSON.stringify({ total_lines: lines.length, relevant_count: relevant.length, relevant: relevant.slice(0, 30) });
```

If the page has a department/category filter UI (Ashby, some Greenhouse
pages), check whether `relevant` is empty before assuming no matches — the
listing may be paginated or filtered. Try navigating to a department-specific
URL or look for a "View all" element.

## Platform-to-URL patterns for Tier 2 Google `site:` searches

| Platform | Career URL pattern | Google `site:` query |
|----------|--------------------|----------------------|
| Greenhouse | `job-boards.greenhouse.io/{slug}` | `site:job-boards.greenhouse.io/{slug} "director"` |
| Ashby | `jobs.ashbyhq.com/{Company}` | `site:jobs.ashbyhq.com/{Company} "director"` |
| Lever | `jobs.lever.co/{company}` | `site:jobs.lever.co/{company} "director"` |
| Workday | `{company}.wd1.myworkdayjobs.com` | `site:{company}.wd1.myworkdayjobs.com "director"` |
| Custom SPA | `company.com/careers` | `site:company.com/careers "director" "remote"` |

Greenhouse slugs are typically lowercase (`gitlab`, not `GitLab`). Ashby
slugs often match the company name's casing exactly.

## Handling 404 / failed loads

When a career page URL returns 404 or fails to load:

1. Try alternate slug casing and alternate ATS platforms before giving up:
   - `jobs.ashbyhq.com/{Company}` 404 → try `jobs.ashbyhq.com/{company}` (lowercase), then Google: `"{company}" careers jobs`
   - `job-boards.greenhouse.io/{slug}` 404 → company may have switched ATS; search `site:jobs.lever.co/{slug}` or `site:jobs.ashbyhq.com/{company}`
   - Custom career page fails → try appending `/open-roles`, `/join-us`, `/jobs`

2. If a working URL is found, update filters.yaml via `set-filters` (read current state first, patch the affected source, write back):
   ```bash
   # Read current sources
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js get-filters

   # Write back with corrected URL (replace entire sources array)
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js set-filters --json '{"sources": [<updated array>]}'
   ```

3. If no working URL is found after retries, note the dead source in the
   search brief with a suggested action for the user (e.g., "Hinge Health
   careers URL returned 404 — run `/jfm:tweak` to update or remove this
   source").

> **Note for plugin maintainers:** `update-filter-list` does not support
> `sources` — only company lists. A dedicated `update-source --name <n>
> --url <url>` command would make this cleaner.
