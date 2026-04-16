---
name: tweak
description: >
  Use this skill when the user wants to adjust, change, or update their job search
  configuration — profile preferences, role types, sources, target companies, skip lists,
  career evidence, or compensation settings. Triggers on "tweak", "change my settings",
  "add a company", "update my sources", "adjust my filters", "add evidence", or natural
  asides like "keep an eye on Stripe" or "stop searching for sales roles". Also handles
  the `/jfm:tweak` command.
user_summary: >
  Adjust your search settings — add target companies, change role types,
  update filters, or tweak compensation and travel preferences.
---

# Tweak Configuration

**Read `search/references/routing.md` before processing any user message** — it defines where each type of input should be routed and the rule against saving job search data to Claude memory.

Help the user make targeted changes to their setup without re-running the full onboarding. This is the "come back and adjust anything" command.

## Start

Read the user's message to figure out what they want to change. If they just said `/jfm:tweak` with no specifics, show them what's adjustable:

> What would you like to adjust? Here are the things I can help with:
>
> - **Profile** — update your preferences (comp floor, location, travel, seniority)
> - **Career evidence** — add projects, write-ups, talks, case studies, or portfolio links
> - **Role types** — add, remove, or refine the types of roles I search for
> - **Target companies** — add a dream company, remove one, or put one on a watch list
> - **Skip list** — add companies or patterns to avoid
> - **Sources** — add a new job board, investor portfolio, career page, or industry site to search
>
> Just tell me what you want to change — you can also describe it naturally, like "keep an eye on Stripe" or "stop searching for sales roles" or "add the Bessemer portfolio to my sources."

## Handling natural language requests

Map the user's request to the right file and section:

| Request pattern | File | Action |
|---|---|---|
| "add [company] to my dream list" | filters.yaml | Add to target_companies |
| "watch [company]" / "keep an eye on [company]" | filters.yaml | Add to watch list |
| "skip [company]" / "never show me [company]" | filters.yaml | Add to skip_companies |
| "add [source/URL] to my sources" | filters.yaml | Add to sources with appropriate type |
| "interested in [industry/sector]" / "companies like this" | filters.yaml | Add to industries list |
| "stop searching for [role type]" | archetypes.yaml | Remove or disable the role type |
| "add a new role type for [description]" | archetypes.yaml | Draft a new role type, confirm with user |
| "change my comp floor to [amount]" | profile.yaml | Update preferences.comp_floor_usd |
| "I'm open to [location] now" | profile.yaml | Add to preferences.locations |
| "add [URL] to my evidence" | profile.yaml | Fetch URL, extract key points, add to evidence |
| "add career evidence" / "add projects" | profile.yaml | Enter career evidence mode (see below) |
| "my experience at [company] includes..." | profile.yaml | Extract as career evidence (see below) |
| "[URL to blog/portfolio/talk]" | profile.yaml | Fetch, extract key points, add to evidence |
| "[URL to company careers page]" | filters.yaml | Add as career_page source |

## Source types

When adding sources, help the user classify them:

- **job_board** — LinkedIn, Indeed, Wellfound, Hacker News, HigherEdJobs, Idealist.org, USAJOBS, Health eCareers, or any field-specific board. *Searched with role type keywords + location.*
- **org_portfolio** — any page that lists a cluster of employers: VC portfolio pages (a16z.com/portfolio), university system directories, health system networks, foundation grantee lists, PE firm portfolios. *Scanned to discover employers, then each employer's career page is checked.*
- **career_page** — a specific employer's careers/jobs page. *Checked directly for matching roles.*
- **curated_list** — "Best Places to Work" lists, professional association directories, conference sponsor lists, Carnegie Classification lists, "Top 50 Nonprofits" lists. *Scanned for employer names like org_portfolio.*
- **aggregator** — Glassdoor, Builtin, SchoolSpring, Social Work Job Bank, regional job boards. *Searched like job boards.*

If the user shares a portfolio or directory URL, fetch it to confirm it's a useful source and describe what you found:

> I checked that page — it lists 47 organizations, mostly in [domain]. I'll include it in future searches and check each one's career page for matching roles. Looks like a good source for your [role type] targets.

## Industry interests

When the user expresses interest in an industry, sector, or domain — either directly ("I'm interested in water utilities") or indirectly ("companies like Cognite" when Cognite works in industrial data) — add the relevant industries to `filters.yaml`:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js update-filter-list --list industries --add '["water utilities", "industrial data"]'
```

After adding, explain how this affects searches:

> Got it — added "water utilities" and "industrial data" to your industry interests. I'll weight companies in these sectors more favorably in future searches.

**After adding an industry, always do these follow-ups:**

1. **Suggest sources** — search for job boards, associations, or directories specific to that sector. Present 2-3 concrete suggestions:
   > "For water utilities, you might want to add: **AWWA Career Center** (awwa.org/careers — job_board), **WaterWorld** (waterworld.com/careers — aggregator), or individual utility career pages. Want me to add any of these?"

2. **Check the watch list** — if a specific company triggered the interest, add it to the watch list (and offer to add its careers page as a source)

3. **Check role types** — do any existing role types in `archetypes.yaml` need keyword updates to capture roles in this sector? If the user targets "Technical Program Manager" roles, adding "utilities" or "infrastructure" to that role type's keywords helps surface relevant results. Confirm before changing.

4. **Check career evidence** — does the user have experience in this industry? If they mentioned it ("my work at Woolpert with water utilities"), capture it as evidence. If they didn't mention specific experience, ask: "Do you have experience in this area, or is this a new interest?"

## Extracting evidence from casual mentions

Users often mention career experience in passing — "my project history at Woolpert includes working with public water utilities" — without realizing it's valuable evidence for the search agent. **Don't let these slide.** This is career evidence that strengthens fit assessments and cover letters.

When the user mentions experience casually:

1. **Acknowledge it and ask one focused follow-up** to get enough for a case study:
   > "Working with public water utilities at Woolpert is great context for roles in this space. Can you tell me a bit more — what did you do there and what was the outcome?"

2. **Structure the response** as a case study (situation, action, outcome) with skill tags

3. **Save via tracker.js**:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js set-profile --json '{"evidence":{"case_studies":[...existing plus new...]}}'
   ```

4. **Check downstream effects** — does this experience suggest:
   - New industry interests for `filters.yaml`?
   - New keywords for `archetypes.yaml`?
   - A stronger `experience_mapping` for an existing role type?

Don't just save the evidence in isolation — connect it to the search configuration.

Similarly, when the user shares a URL (blog post, portfolio, talk), **always fetch it** and extract key points for evidence. Don't just note the URL — read it, summarize the relevance, and save structured evidence.

## Career evidence mode

If the user wants to add evidence beyond their resume (projects, talks, case studies, portfolio links), go deeper:

**Option A: Share links** — User shares URLs. Fetch them, extract key points, confirm, save to profile.yaml evidence section.

**Option B: Tell a story** — Ask three questions:
1. What was the situation or problem?
2. What did you personally do?
3. What was the measurable outcome?

Structure into a case study, tag with skills/themes, save.

**Option C: Fill gaps** — Read archetypes.yaml and identify which role types have requirements with weak evidence. Ask targeted questions.

After capturing evidence, suggest ways to strengthen their profile:
> You've got strong evidence for [X, Y] but I don't have much for [Z]. A few ideas: write up [that project] as a blog post, create a GitHub repo for [that side project]...

Update profile.yaml evidence section. Merge with existing — don't overwrite. Set `evidence_complete: true` when done.

## After making changes

- Read back the change to confirm: "Got it — added Stripe to your target companies."
- If the change affects search behavior, mention when it'll take effect: "This will show up in your next search sweep."
- If they added a company to watch, explain: "I'll flag any roles at Stripe when they show up, but won't actively search their careers page unless you add it as a source too. Want me to?"
- Offer to make related changes: "While we're at it, want to add their careers page as a direct source?"

## Multiple changes

If the user wants to make several changes, handle them one at a time and confirm each. Don't batch-write — read back each change before moving to the next.

## Tone

Quick and light. This isn't onboarding — it's a settings tweak. Get in, make the change, confirm, get out. No need for big explanations unless the user seems unsure about something.
