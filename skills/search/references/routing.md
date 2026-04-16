# Routing User Input

**Read this before processing any user message in any skill.**

## Rule: No Claude Memory for Job Search Data

**NEVER save job search information to Claude's internal memory files** (the `~/.claude/` memory system). This includes:

- Companies the user mentions (interested in, wants to watch, wants to skip)
- Career experiences, projects, skills, or evidence the user shares
- Industry interests or sector preferences
- Compensation, location, or travel preferences
- Search sources, job boards, or career page URLs
- Decline reasons, role feedback, or fit assessments

**ALL of this goes into the plugin's YAML files** via `tracker.js` commands. The YAML files are the single source of truth — they persist across conversations, power the search agent, and are visible on the board.

The only things that belong in Claude memory are meta-preferences about how the user wants to interact with Claude itself (communication style, response length, etc.) — never job search content.

## Decomposing Compound Messages

Users often combine multiple intents in one message. Decompose every message into its individual actions and route each one to the correct YAML file. **Never drop secondary intents.**

For each piece of information in a user message, ask: "Where does this live?"

| User says... | Route to | Via |
|---|---|---|
| Company name + "watch" / "interesting" / "keep an eye on" | `filters.yaml` watch list | `update-filter-list --list watch --add '["Company"]'` |
| Company name + "dream" / "target" / "love to work at" | `filters.yaml` target_companies | `update-filter-list --list target_companies --add '["Company"]'` |
| Company name + "skip" / "never" / "not interested in the company" | `filters.yaml` skip_companies | `update-filter-list --list skip_companies --add '["Company"]'` |
| Company careers URL | `filters.yaml` sources | `set-filters` with new career_page source |
| Industry / sector interest ("companies like this", "I'm interested in [sector]") | `filters.yaml` industries | `update-filter-list --list industries --add '["industry"]'` |
| "My experience includes..." / project story / work history | `profile.yaml` evidence | `set-profile` to update case_studies or additional_context |
| Portfolio URL, blog post, talk, write-up | `profile.yaml` evidence | Fetch URL, extract key points, `set-profile` |
| Compensation / location / travel / seniority preference | `profile.yaml` preferences | `set-profile` with updated preferences |
| Role type change / new role interest | `archetypes.yaml` | `set-archetypes` |
| "Decline" / "not interested" in a tracked role | `tracker.yaml` | `decline --id <id> --reason "..."` |
| Stage change for a tracked role | `tracker.yaml` | `stage --id <id> --stage <stage>` |

## Example: Compound Message Decomposition

User: *"I don't see the role for Cognite but the company is interesting. Please decline this but add Cognite to my watch list, and maybe companies like this because my project history at Woolpert includes working with public water utilities, and I have a general interest [link]. [careers URL]"*

This contains **5 distinct actions**:

1. **Decline the role** → `tracker.js decline --id <id> --reason "role not found/not a fit"`
2. **Add Cognite to watch list** → `tracker.js update-filter-list --list watch --add '["Cognite"]'`
3. **Add industry interest** (water utilities / industrial data) → `tracker.js update-filter-list --list industries --add '["water utilities", "industrial data"]'`
4. **Add career evidence** (Woolpert + public water utilities work) → Probe for details, then `tracker.js set-profile` to add a case study
5. **Fetch the link and extract interests/evidence** → `WebFetch` the URL, identify relevant experience or interests, route to profile.yaml or filters.yaml

Handle all 5. Don't silently drop any.

## When the User Mentions Experience

When a user casually mentions work experience ("my project history at Woolpert includes working with public water utilities"), this is career evidence that belongs in `profile.yaml`. Before saving:

1. **Ask a focused follow-up** to get enough detail for a useful case study: "That's great context — can you tell me more about the water utilities work at Woolpert? What did you do and what was the outcome?"
2. **Structure it** as a case study (situation, action, outcome) with skill tags
3. **Save via** `tracker.js set-profile` to merge into the evidence section
4. **Check if this changes search behavior** — does the experience suggest new role types, industries, or keywords?

Don't just note it and move on. Career evidence makes fit assessments and cover letters stronger.

## When the User Shares a URL

Always fetch the URL. Determine what it is:

- **Job posting** → Route to the assess skill's behavior
- **Company careers page** → Offer to add as a source in `filters.yaml`
- **Blog post / portfolio / talk by the user** → Extract key points, add to `profile.yaml` evidence
- **Company info page** → Extract industry/product context, consider for watch list or industry interests
- **General interest / TIL** → Extract themes, check if they map to industry interests or evidence

## Skill Priority in Compound Messages

When a compound message spans multiple skills (e.g., update + tweak), handle the pipeline action first (decline, stage change), then handle configuration changes inline using the tweak skill's behavior. You don't need to formally invoke the tweak skill — just apply the same routing logic: identify the YAML file, make the change via `tracker.js`, confirm each change.
