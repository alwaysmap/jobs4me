---
name: search
description: >
  Use this skill when the user wants to "search for jobs", "find new roles",
  "run a search sweep", "look for open positions", or "check job boards".
  Also handles the `/jfm:search` command and runs from scheduled search tasks.
  Use when assessing whether a specific role is a good fit, or when updating
  decline patterns after the user rejects suggestions.
user_summary: >
  Search job boards for new roles that match your profile. Filters out
  duplicates and known bad fits automatically, then suggests the best matches.
version: 0.3.0
---

# Job Search Agent

Autonomous job search, fit assessment, and learning loop for a configured job seeker.

## Files

| File | Loaded when |
|------|-------------|
| `SKILL.md` (this file) | Always |
| `references/routing.md` | First — before processing any user message. Decomposes compound input and pins the no-memory rule. |
| `references/career-page-search.md` | Phase 1 — career page scraping, Chrome MCP fallback, ATS URL patterns. |
| `references/liveness.md` | Phase 2 / Phase 3 boundary — **MANDATORY** before any `add` of a `suggested` entry. |
| `references/fit-assessment.md` | Phase 2 Step B — the structured rubric for sub-agent fit assessments. |
| `references/yaml-writing.md` | Phase 3 — write protocol, formatting rules, dedup table. |
| `references/data-safety.md` | Phase 3 — referenced from yaml-writing.md; mandatory before any file write. |
| `references/yaml-schema.md` | Phase 3 / debugging — full schema for tracker / profile / archetypes / filters. |
| `references/brief-format.md` | Phase 3 end — search brief template. |
| `references/decline-learning.md` | After any decline (per-decline or per-batch). |
| `references/model-selection.md` | Whenever spawning sub-agents. |

## Shell Setup

Always `export JFM_DIR='<workspace path>'` (single quotes) before running any tracker command. The script refuses to operate on a phantom workspace, so setting this up front avoids silent writes to the wrong directory when the path contains spaces or special shell characters. Dependencies are vendored — no `npm install` needed.

```bash
export JFM_DIR='<workspace path>'
```

## Routing

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

**Read `references/career-page-search.md`** — describes the tiered approach for JS-rendered career pages (Chrome MCP, Google `site:`, aggregator, direct fetch), the Chrome availability check to run at the start of every sweep, and ATS-specific URL patterns + 404 handling. Career pages without a Chrome / Google fallback often return only a JS skeleton; the reference is the difference between finding roles and silently missing them.

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
4. **Skip and log.** If Tiers 1–3 all fail, skip the role and add the company to "Companies to Watch" in the brief. Snippet-only content is not a basis for assessment — assessing on a snippet is how stale postings get surfaced as "Strong" matches.

Batch all direct-fetch attempts concurrently in groups of 5. Handle failures individually with Chrome or aggregator.

> "Fetching full postings... {done}/{total} ({n} via Chrome, {m} via aggregator)"

**Step B — Parallel fit assessments:** Launch 3-5 sub-agents in parallel using the model specified in `references/model-selection.md`. Each sub-agent receives:
- The user's profile data (from `profile.yaml` and `archetypes.yaml`)
- Its batch of candidates with fetched JD content
- The fit assessment framework (see `references/fit-assessment.md`)

**Step C — Stream results to the user:** As each sub-agent completes, immediately tell the user what was found:
> "Strong match: **Senior Platform Engineer at Acme Corp** — deep experience overlap, remote, comp in range."
> "Stretch: **Staff SRE at BigCo** — comp might be below floor, but interesting scope."
> "Pass: **DevOps Manager at TinyCo** — requires on-site, below seniority floor."

Don't wait for all assessments to finish before displaying anything.

---

### Liveness gate (mandatory before writing any role to tracker)

Between Phase 2 and Phase 3, **read `references/liveness.md`**. The script enforces this gate at write time — `tracker.js add` refuses to persist a `suggested` entry without `--liveness-verified-at`. The reference covers the verify-posting command, the four checks to require, what to do on failure (Companies to Watch), and how to thread the verification timestamp into the `add` call.

---

### Phase 3: Building your pipeline

All assessments are done and live. Now persist everything and build the board.

**Read `references/yaml-writing.md`** before any tracker mutation — it covers the write protocol, formatting rules, and the stage-aware dedup table for handling duplicate `(company, role)` matches.

**Add recommended roles in one batch write** (use `--no-board` to skip intermediate rebuilds — we rebuild once after all JDs are saved):
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js batch --no-board --json '[{"op":"add","entry":{"company":"...","role":"...","url":"...","archetype":"...","stage":"suggested","agent_summary":"...","dates":{"liveness_verified":"<ISO ts>"}}}]'
```

**Save JDs** for each new role (use `--no-board` on all but the last):

> Always save the JD locally — Greenhouse / Lever / Ashby postings are removed once roles close, and the user needs the JD for cover letters, prep, and a record of what they applied for. Save the JD even when declining: declined JDs feed the decline-pattern learning loop.

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

When assessing a single role (via the assess skill or during a sweep), read `references/fit-assessment.md` for the full framework. Output format:

1. **Recommendation** — Strong / Moderate / Stretch / Pass, with a one-line rationale
2. **Gaps & Concerns** — what's missing or risky
3. **Positive Fit** — evidence of match from the user's background

Always check hard constraints first (comp floor, travel, location, seniority). If a hard constraint fails, mark as Pass immediately.

## Decline Pattern Learning

Run on **two cadences**:

1. **Per-decline (lightweight)** — when a single decline happens via `/jfm:update`, `/jfm:assess`, or in conversation, check whether the reason matches an existing pattern (refinement) or is clearly new and generalizable (one-off addition). Don't force a pattern from a single one-off.
2. **Per-batch (audit)** — at the end of any review session that processed multiple declines (the review skill's "End of Review" section), audit the full set against existing patterns. This is where most patterns get codified — single declines often look one-off but a batch reveals the theme.

**Read `references/decline-learning.md`** for the full process: when to add vs refine vs flag a too-aggressive pattern, and the canonical "Posting is stale or closed" pattern.
