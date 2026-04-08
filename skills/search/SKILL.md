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
version: 0.2.0
---

# Job Search Agent

Autonomous job search, fit assessment, and learning loop for a configured job seeker.

## Shell Setup

The tracker script auto-detects the workspace directory and auto-installs npm dependencies on first run. Set `JFM_DIR` only if the workspace path contains special shell characters (`!`, `$`, spaces):

```bash
export JFM_DIR='<workspace path>'
```

## Routing Rules

**Read `references/routing.md` before processing any user message.** It defines how to decompose compound messages, where each type of user input should be routed, and the rule against saving job search data to Claude memory.

## Core Files

Always read these fresh at the start of each operation — the user may have edited them by hand:

- **profile.yaml** — who the user is: resume URLs, portfolio, preferences
- **archetypes.yaml** — the types of roles they're targeting
- **filters.yaml** — company include/exclude/watch lists, sources, decline patterns
- **tracker.yaml** — all applications with stage, dates, agent summary

---

## Search Sweep

A search has **4 user-visible phases**. Tell the user what phase they're in and keep them updated throughout. Never go silent for more than a few seconds.

### What the user sees

```
Phase 1: Searching sources         "Searching LinkedIn... found 12. Checking Wellfound... 4 more."
Phase 2: Assessing candidates      "Assessing 9 roles... found 3 strong matches so far."
Phase 3: Building your pipeline    "Added 6 roles to your board. Launching company research..."
Phase 4: Ready for review          "Board is ready. Want to walk through the new suggestions?"
```

### First search notice

If this is the user's first search (tracker.yaml doesn't exist or has no entries), say this before starting:

> **Starting your first search.** This one takes longer than usual — around 20 minutes — while I check all your sources and assess each role. I'll keep you posted as I go. Future searches are much faster.

---

### Phase 1: Searching sources

Read `profile.yaml`, `archetypes.yaml`, and `filters.yaml`.

> Loaded your profile and {N} role types. Searching {M} sources...

For each role type, search the web for matching roles:
- Priority sources from `filters.yaml` first
- Career pages of target companies
- General job boards with role type keywords + location
- **If `industries` is set**: append industry terms to job board queries as context keywords (e.g., "Technical Program Manager" + "water utilities"). This surfaces roles at companies in preferred sectors that might otherwise be missed by title-only searches.

---

#### Career page search strategy — JS-rendered boards

**Critical:** Most company career pages (Greenhouse, Ashby, Workday, custom React SPAs) return only a JavaScript skeleton when fetched with WebFetch — job listings are rendered client-side and invisible to a plain HTTP fetch. Use the tiered approach below:

| Tier | Method | How | When to use |
|------|--------|-----|-------------|
| 1 | **Chrome MCP** | `tabs_context_mcp` → `navigate` to career URL → `javascript_tool` to extract `document.body.innerText` | Best: live, fully rendered. Use whenever Chrome is connected. |
| 2 | **Google `site:` search** | `site:job-boards.greenhouse.io/SLUG "director" remote` | Chrome not available. Google indexes rendered pages — most reliable non-browser fallback. |
| 3 | **Aggregator mirror** | Search `builtin.com`, `himalayas.app`, or `remotive.com` | Secondary confirmation only. Flag staleness risk in brief. |
| 4 | **Direct WebFetch** | Fetch the URL directly | Static sites, Lever pages, and some custom career pages. |

**Check Chrome MCP availability at the start of every sweep:**

```
Call tabs_context_mcp (no arguments):
  → Returns tab list: Chrome is ready — use Tier 1 for all JS-rendered career pages
  → Returns error / "not connected": Chrome is unavailable — use Tier 2 (Google site:)
```

Never silently return 0 results from a JS-rendered career page. If a direct fetch yields only a JS skeleton (page body is < 500 chars, or contains only `<script>` tags and no visible text), immediately escalate to the next tier and note the fallback used in the search brief.

**Chrome MCP extraction pattern:**

```javascript
// After navigate() to career page URL:
const lines = document.body.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
const relevant = lines.filter(l => /director|head of|VP |vice president|senior director|principal/i.test(l));
JSON.stringify({ total_lines: lines.length, relevant_count: relevant.length, relevant: relevant.slice(0, 30) });
```

If the page has a department/category filter UI (Ashby, some Greenhouse pages), check if `relevant` is empty before assuming no matches — the listing may be paginated or filtered. Try navigating to a department-specific URL or look for a "View all" element.

**Platform-to-URL patterns for Tier 2 Google `site:` searches:**

| Platform | Career URL pattern | Google `site:` query |
|----------|--------------------|----------------------|
| Greenhouse | `job-boards.greenhouse.io/{slug}` | `site:job-boards.greenhouse.io/{slug} "director"` |
| Ashby | `jobs.ashbyhq.com/{Company}` | `site:jobs.ashbyhq.com/{Company} "director"` |
| Lever | `jobs.lever.co/{company}` | `site:jobs.lever.co/{company} "director"` |
| Workday | `{company}.wd1.myworkdayjobs.com` | `site:{company}.wd1.myworkdayjobs.com "director"` |
| Custom SPA | `company.com/careers` | `site:company.com/careers "director" "remote"` |

Greenhouse slugs are typically lowercase (`gitlab`, not `GitLab`). Ashby slugs often match the company name's casing exactly.

**When a career page URL returns 404 or fails to load:**

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

3. If no working URL is found after retries, note the dead source in the search brief with a suggested action for the user (e.g., "Hinge Health careers URL returned 404 — run `/tweak` to update or remove this source").

> **Note for plugin maintainers:** `update-filter-list` does not support `sources` — only company lists. A dedicated `update-source --name <name> --url <url>` command would make this cleaner. See the plugin improvement notes.

---

**Update the user after each source or batch of sources:**
> "Searching LinkedIn for [role type]... found 12 candidates."
> "Checking [Company] careers page via Chrome... 2 new postings."
> "Chrome not connected — using Google site: search for Greenhouse pages."
> "Wellfound returned an error — skipping for now."

Track source status as you go: results found, nothing found, errored, or fallback-used.

Collect all raw candidates as JSON: `[{"company":"...","role":"...","url":"...","description":"...","source":"..."}]`

> Collected {N} candidates from {M} sources. Filtering against your skip list and decline patterns...

**Filter in bulk** (one call, instant):
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js filter-candidates --json '<candidates JSON>'
```

> Filtered to {N} candidates ({M} duplicates removed, {K} matched decline patterns). Moving to assessments...

---

### Phase 2: Assessing candidates

This is the longest phase. Use parallelism to make it faster and stream results to keep the user engaged.

**Step A — Extract full JD content** (tiered per candidate URL):

For each candidate URL, try in order until usable content is retrieved:

1. **Direct WebFetch** — always try first (fast, no dependencies; works for Lever, plain HTML career pages, and some custom sites)
2. **Chrome MCP** — if direct fetch returns a JS skeleton (< 500 chars body text or no visible role content): `navigate` to the URL, then extract `document.body.innerText` via `javascript_tool`
3. **Aggregator mirror** — if Chrome is also unavailable: search `site:builtin.com "{role title} {company}"` or `himalayas.app/{company}`. Note "content sourced from aggregator — verify posting is still live" in the candidate record.
4. **Google snippet** — last resort: use the Google search result snippet as an abbreviated JD. Note "limited JD content — snippet only" in the assessment.

Batch all direct-fetch attempts concurrently in groups of 5. Handle failures individually with Chrome or aggregator.

> "Fetching full postings... {done}/{total} ({n} via Chrome, {m} via aggregator)"

**Step B — Parallel fit assessments:** Launch 3-5 **Sonnet** sub-agents in parallel. Each sub-agent receives:
- The user's profile data (from `profile.yaml` and `archetypes.yaml`)
- Its batch of candidates with fetched JD content
- The fit assessment framework (see `references/fit-assessment.md`)

Use Sonnet for fit assessments — it's ~3x faster than Opus and the structured rubric doesn't require deep reasoning.

**Step C — Stream results to the user:** As each sub-agent completes, immediately tell the user what was found:
> "Strong match: **Senior Platform Engineer at Acme Corp** — deep experience overlap, remote, comp in range."
> "Stretch: **Staff SRE at BigCo** — comp might be below floor, but interesting scope."
> "Pass: **DevOps Manager at TinyCo** — requires on-site, below seniority floor."

Don't wait for all assessments to finish before displaying anything.

---

### Phase 3: Building your pipeline

All assessments are done. Now persist everything and build the board.

**Add recommended roles in one batch write** (use `--no-board` to skip intermediate rebuilds — we rebuild once after all JDs are saved):
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js batch --no-board --json '[{"op":"add","entry":{"company":"...","role":"...","url":"...","archetype":"...","stage":"suggested","agent_summary":"..."}}]'
```

**Save JDs** for each new role (use `--no-board` on all but the last):
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js save-jd --id <id> --file /tmp/jd-content.md --no-board
```

**Rebuild the board** once after all writes are done:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js build-board
```

> **Board updated** — {N} new roles added. Open or refresh `Kanban/index.html` to see your pipeline.

**Company research** — check which companies need overviews:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js needs-research
```
For each company needing research, generate a Company Overview inline (see prep skill's "Company Overview" section). Save to `{company_dir}/overview.md`. One overview per company — skip companies that already have one.

Keep it fast — each overview should take 1-2 minutes of web search + writing. After each overview, use `present_files` to share the overview file, then summarize:
> **Oracle — Company Overview** created
> {2-3 line summary: what they do, revenue model, why this role exists}

After all research is complete, rebuild the board one final time so overviews are embedded, then use `present_files` to share `Kanban/index.html`:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js build-board
```

**Write the search brief.** This is REQUIRED after every search — including the first one.

1. Create the directory if needed: `mkdir -p briefs/`
2. Write the brief to `briefs/{YYYY-MM-DD}.md` (see `references/brief-format.md` for the template)
3. Include: summary, new suggestions, companies to watch, near misses, source status table (include fallback method used for each JS-rendered source), market observations

The brief is the user's record of what happened in each search. It's viewable on the board via the Briefs menu.

> "Search brief saved to `briefs/{date}.md`."

---

### Phase 4: Ready for review

**MANDATORY: Present the kanban board.** Use `present_files` to share `Kanban/index.html` with the user. This is how they visualize the brief and all jobs — it must always be the final artifact of a search.

> **Search complete.** Found {N} new roles across {M} companies.
>
> Want to review the new suggestions now? I'll show each one and you can say yes, no, or skip.

If they say yes, trigger the review skill. If this is their first search, the review skill will frame it as a calibration session.

---

## Fit Assessment

When assessing a single role (via `/assess` or during a sweep):

Read `references/fit-assessment.md` for the full assessment framework. Output format:

1. **Recommendation** — Strong / Moderate / Stretch / Pass, with a one-line rationale
2. **Gaps & Concerns** — what's missing or risky
3. **Positive Fit** — evidence of match from the user's background

Always check hard constraints first (comp floor, travel, location, seniority). If a hard constraint fails, mark as Pass immediately.

## Decline Pattern Learning

When the user declines a role (via `/update Company - decline reason` or in conversation):

Read `references/decline-learning.md` for the full process. After each decline or batch:

1. Compare the decline reason against existing `decline_patterns` in `filters.yaml`
2. If a new pattern emerges, add it with the company name as `learned_from`
3. If an existing pattern needs refinement, update it
4. Report what was added/changed to the user

## YAML Writing Rules

**CRITICAL: Read `references/data-safety.md` before ANY file write.**

- **All tracker.yaml/filters.yaml mutations go through tracker.js** — never write YAML by hand
- The script backs up automatically, validates after write, and rebuilds the board
- Use block scalar (`|`) for `agent_summary` fields
- Quote role titles with special characters: `role: "Sr. Director, TPM"`
- Use ISO dates: `2026-03-28`
- Dedup on `company + role` pair
- Never delete entries — declined roles are valuable for the learning loop

## Sub-Agent Model Selection

| Task | Model | Why |
|------|-------|-----|
| Fit assessment (per batch) | **Sonnet** | Structured rubric — fast, accurate |
| Company overview research | **Sonnet** | Web search + structured summary |
| JD extraction from URL | **Haiku** | Simple content extraction (promote to Sonnet if aggregator/snippet fallback was needed) |
| Interview prep generation | **Opus** | Deep experience mapping |
| Cover letter writing | **Opus** | Voice-sensitive writing |
| Decline pattern analysis | **Sonnet** | Pattern matching |

## Additional Resources

- **`references/routing.md`** — compound message decomposition and anti-memory rules (read first)
- **`references/fit-assessment.md`** — structured assessment framework
- **`references/brief-format.md`** — search brief template
- **`references/decline-learning.md`** — filter updates from declines
- **`references/data-safety.md`** — mandatory write protocol
