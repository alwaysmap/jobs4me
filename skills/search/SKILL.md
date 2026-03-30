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

The tracker script auto-detects the workspace directory and auto-installs npm dependencies on first run. Set `JFM_DIR` only if the workspace path contains special shell characters (`!`, `$`, spaces):

```bash
export JFM_DIR='<workspace path>'
```

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

**Update the user after each source or batch of sources:**
> "Searching LinkedIn for [role type]... found 12 candidates."
> "Checking [Company] careers page... 2 new postings."
> "Wellfound returned an error — skipping for now."

Track source status as you go: results found, nothing found, or errored.

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

**Step A — Batch web fetches:** Fetch all candidate URLs concurrently in batches of 5.
> "Fetching full postings... {done}/{total}"

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

Keep it fast — each overview should take 1-2 minutes of web search + writing. After each overview, show the user what was created:
> **Oracle — Company Overview** — `companies/Oracle/overview.md`
> {2-3 line summary: what they do, revenue model, why this role exists}
>
> **Databricks — Company Overview** — `companies/Databricks/overview.md`
> {2-3 line summary}

After all research is complete, rebuild the board one final time so overviews are embedded:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js build-board
```

**Write the search brief.** This is REQUIRED after every search — including the first one.

1. Create the directory if needed: `mkdir -p briefs/`
2. Write the brief to `briefs/{YYYY-MM-DD}.md` (see `references/brief-format.md` for the template)
3. Include: summary, new suggestions, companies to watch, near misses, source status table, market observations

The brief is the user's record of what happened in each search. It's viewable on the board via the Briefs menu.

> "Search brief saved to `briefs/{date}.md`."

---

### Phase 4: Ready for review

> **Search complete.** Found {N} new roles across {M} companies.
>
> Your board is at `Kanban/index.html` — open it to see everything.
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
| JD extraction from URL | **Haiku** | Simple content extraction |
| Interview prep generation | **Opus** | Deep experience mapping |
| Cover letter writing | **Opus** | Voice-sensitive writing |
| Decline pattern analysis | **Sonnet** | Pattern matching |

## Additional Resources

- **`references/fit-assessment.md`** — structured assessment framework
- **`references/brief-format.md`** — search brief template
- **`references/decline-learning.md`** — filter updates from declines
- **`references/data-safety.md`** — mandatory write protocol
