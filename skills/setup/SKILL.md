---
name: setup
description: >
  Use this skill when the user says "set up my job search", "get started",
  "configure the agent", "onboarding", or uses /setup. Walks through guided
  onboarding: profile creation, career evidence, role archetypes, target companies,
  search sources, and a first search sweep. Also use when the user wants to
  start fresh or redo their setup from scratch.
user_summary: >
  Set up your job search profile — your background, the kinds of roles you want,
  target companies, and where to look. Run this once to get started.
---

# Guided Onboarding

Walk the user through setting up their job search agent. This is a conversational onboarding — ask questions, listen, extract structure from their answers. Do not present forms or dump all questions at once.

## Phase 1: Evidence — "Tell me about yourself"

Start with:

> I'm going to help you set up a job search agent that finds roles for you and learns what you actually want. First, I need to understand your background.
>
> You can give me a link to your resume or LinkedIn, paste your resume text, or just tell me about your career in your own words. Whatever's easiest.
>
> Don't worry about getting everything perfect right now — everything we set up here can be changed later. You can always come back and refine things with `/tweak`.

Read whatever they provide. If it's a URL, fetch it. If it's pasted text, parse it.

**CRITICAL: ONE QUESTION AT A TIME.** After reading their background, ask a single follow-up question. Wait for their answer. Then ask the next one. Never batch multiple questions into one message. This is a conversation, not a survey.

Follow-ups to ask (one per message, in this order, skip any the resume already answers clearly):

1. What level of role are you targeting? (Director, VP, Head-of, etc.)
2. What's your minimum acceptable base compensation?
3. Where are you willing to work? (Remote, hybrid, specific cities?)
4. How much travel is too much?
5. Any industries or types of companies that are a hard no?

After each answer, briefly acknowledge it before asking the next question. For example: "Got it — VP or Head-of level, no interest in going back to IC. Next question:..."

Write the results to `profile.yaml` using this schema:

```yaml
name: "{Full Name}"
email: "{email if provided}"

evidence:
  resume_url: "{URL if provided}"
  portfolio_urls:
    - "{URL}"
  pasted_resume: |
    {resume text if pasted}
  additional_context: |
    {any career narrative they shared}

preferences:
  comp_floor_usd: {number}
  comp_floor_gbp: {number if targeting UK, otherwise omit}
  comp_exceptions: "{e.g., civic tech: floor drops to $160K}"
  max_travel_pct: {number}
  locations:
    - remote_us
  seniority_floor: "{director, vp, manager, etc.}"
```

## Phase 2: Evidence — "What makes you stand out?"

After capturing the resume basics, ask about additional evidence that goes beyond the resume. Frame it as optional but valuable:

> Your resume gives me the career arc, but the stuff that really sets you apart in assessments is evidence of impact — projects, writing, talks, open source work, anything where someone can see what you actually *do*.
>
> Some examples:
> - **Portfolio or project write-ups** — "I built X that did Y" with links
> - **Open source contributions** — GitHub repos, PRs, maintained projects
> - **Talks, writing, or teaching** — blog posts, conference talks, courses you taught
> - **Competitions or awards** — hackathons, design competitions, certifications
> - **Case studies in your own words** — even without a public link, describe a problem you solved, what you personally did, and the measurable outcome
>
> You can share URLs, paste text, or just tell me about them. Skip for now if you'd rather come back to this later — just say `/tweak` any time to add more.

For each piece of evidence they share:
- If it's a URL, fetch it and extract the key points
- If it's a narrative, extract the structured insight (situation -> action -> outcome)
- Tag each piece with the skills/themes it demonstrates (e.g., "team building", "technical architecture", "stakeholder management", "shipping under constraints")

Add everything to `profile.yaml` under the evidence section:

```yaml
evidence:
  resume_url: "{URL}"
  portfolio_urls:
    - url: "{URL}"
      description: "{what it demonstrates}"
    - url: "{URL}"
      description: "{what it demonstrates}"
  case_studies:
    - title: "{short title}"
      situation: "{context}"
      action: "{what they personally did}"
      outcome: "{measurable result}"
      tags:
        - "{skill/theme}"
  additional_context: |
    {career narrative}
```

If they skip, note that in profile.yaml:
```yaml
evidence:
  resume_url: "{URL}"
  evidence_complete: false  # remind to add via /tweak later
```

Reassure them:

> Totally fine to skip this for now. You can always run `/tweak` later to add projects, write-ups, or stories. The agent works with just a resume — the extra evidence just makes it sharper.

## Phase 3: Archetypes — "What kind of roles fit you?"

Based on their background, propose 2-4 role archetypes. Explain what an archetype is in plain terms:

> Based on your background, I can see a few different types of roles you'd be strong for. Let me suggest some — you can adjust, remove, or add to these.

For each archetype, draft:
- A name and key
- 4-6 target job titles
- Search keywords
- A paragraph mapping their specific experience to this role type
- Company size/type preference

Ask the user to confirm, edit, or add. Then write `archetypes.yaml`.

Reassure them:

> These archetypes aren't set in stone. As you use the agent and see what it finds, you might want to add a new one or retire one that isn't landing. Just say `/tweak` any time to adjust.

## Phase 4: Companies — "Who do you want to work for?"

Ask about target companies and exclusions. This is its own question — don't combine it with sources.

> Are there specific companies you'd love to work for? Dream list, aspirational targets, companies you've been watching — anything that comes to mind.

Wait for their answer, then ask the flip side:

> And on the other side — any companies you'd want to skip? Former employers you wouldn't go back to, companies with cultures you know don't fit, types of companies to avoid?

Capture both lists. If they can't think of many, reassure them:

> No pressure to have a long list. Companies will surface naturally as the agent runs searches — you can always add a dream company later with `/tweak`, or use `/assess` to evaluate a specific posting you find on your own.

## Phase 5: Sources — "Where should I look?"

This is a separate question from companies. Help the user think broadly about where good roles get posted:

> Now let's talk about where to search. The obvious ones are LinkedIn and Indeed, but the best leads often come from less obvious places.
>
> Each source works a little differently — **job boards** and **aggregators** get searched with your role keywords, **portfolio/directory sites** get scanned to discover companies whose career pages I then check individually, and **career pages** get checked directly for matching roles.
>
> Some ideas by category:
>
> - **Job boards** — LinkedIn, Indeed, plus boards specific to your field: Wellfound or Hacker News "Who's Hiring" (startups/tech), HigherEdJobs or Chronicle Vitae (academia), Idealist.org (nonprofit/social impact), USAJOBS or governmentjobs.com (public sector), Health eCareers or hospital system job portals (healthcare)
> - **Organization portfolios & directories** — sites that list a cluster of employers you'd want to work for. In tech, that's VC portfolio pages like a16z.com/portfolio. In academia, it might be an AAU member list or a specific university system's jobs portal. In healthcare, a regional health system's affiliated hospitals. In social services, a state agency directory or a foundation's grantee list. The key: any page that lists organizations where matching roles might exist.
> - **Company career pages** — if there are specific employers on your dream list, I'll check their careers pages directly
> - **Curated lists** — "Best Places to Work" lists, industry association member directories, conference sponsor lists, "Top 50 Nonprofits" lists, Carnegie Classification lists for universities, etc.
> - **Aggregators** — Glassdoor, Builtin, or field-specific aggregators like SchoolSpring (education), Social Work Job Bank, or your city/region's job board
>
> What sources make sense for your field? And are there any industry sites, professional associations, or employer directories where the right kind of organizations tend to cluster?

If they're unsure, reassure:

> You can start with the obvious ones and add more later with `/tweak`. People often discover great sources after the first few searches — maybe a professional association directory that keeps surfacing good employers, or a niche job board a colleague mentions. Easy to add as you go.

Write both phases into `filters.yaml`:

```yaml
include:
  target_companies:
    - "{company name}"
  sources:
    - name: "{source name}"
      url: "{URL}"
      type: "{job_board | org_portfolio | career_page | curated_list | aggregator}"
      # job_board / aggregator: searched with archetype keywords + location
      # org_portfolio / curated_list: scanned for employer names, then each employer's career page is checked
      # career_page: checked directly for matching roles
skip:
  - "{company or pattern to avoid}"
watch:
  - "{company to keep an eye on but not actively search}"
decline_patterns: []
```

## Phase 6: First Run — "Let's see what's out there"

> Your agent is set up! Want me to run a first search right now so you can see what it finds?

If they say yes, initialize the tracker:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js init --dir .
```

Create empty directories: `active/`, `declined/`, `briefs/`

Then trigger the search skill to run a sweep. Show results and let them decline the bad ones — each decline uses the tracker script and teaches the filter.

After the first sweep, **always generate `Kanban/index.html`** and tell the user to open it:

> Open the `Kanban/` folder in your browser — that's your kanban board with everything we just found.

## Phase 7: What's Next — "Here's how to use this day-to-day"

After the first run, walk the user through what they can do going forward. This is critical — don't skip it.

> You're all set! Here's how this works day to day:
>
> **`/search`** — runs a new search sweep. The agent checks your sources, finds matching roles, and adds good ones to your board. You can run this whenever you want, or I can run it on a schedule.
>
> **`/update`** — when something happens with a role. Just type `/update` by itself and I'll show you your active roles to pick from. Or go direct: `/update Acme - interviewing`, `/update Acme - decline too much travel`, `/update Acme - rejected`. I'll learn from your declines to filter better next time.
>
> Roles move through these stages:
> - **Suggested** -> the agent found it and thinks it's a fit
> - **Maybe** -> you're interested and considering applying
> - **Applied** -> you've submitted an application
> - **Interviewing** -> you're in the interview process
> - **Offered** -> you have an offer
> - **Declined** -> you passed on it (with a reason that helps the agent learn)
> - **Rejected** / **Closed** -> they passed on you, or the role disappeared
>
> **`/assess`** — found a job posting on your own? Paste the URL and I'll evaluate it against your profile.
>
> **`/prep`** — preparing for an interview? I'll research the company and map your experience to their requirements.
>
> **`/board`** — regenerate your kanban board. It only rebuilds when the data has changed, so it's fast to run anytime.
>
> **`/tweak`** — change anything about your setup. Add a company to watch, a new source to search, update your preferences, add career evidence. Nothing is locked in.
>
> And if you want to start fresh on any part of the setup, just run `/setup` again — it'll walk you through the same process and update your files.
>
> **Set up automated search:** You can schedule `/search` to run automatically — daily, twice a day, whatever cadence makes sense. Go to the scheduled tasks menu (clock icon in the sidebar), create a new task, pick the Jobsbyme `/search` command, and set your frequency. New roles show up on your board without you lifting a finger.
>
> **Back up your data:** Keep your job search folder in a synced location (Google Drive, Dropbox, iCloud) so your data is backed up automatically. Everything is plain YAML and markdown files — easy to back up, easy to read, and yours to keep.

## Important

- **ONE QUESTION PER MESSAGE. This is the #1 rule.** Never ask two questions in the same message. Ask, wait, acknowledge, then ask the next. This applies to every phase, not just Phase 1.
- Be conversational, not robotic. This is a guided setup, not a form or a survey.
- If the user seems unsure about something, help them think through it before moving on.
- This whole setup should feel like 15 minutes, not an hour.
- **Reassurance is key.** At every phase, the user should feel like they can move forward even with incomplete answers. Reference `/tweak` and `/assess` so they see the escape hatches.
- Never make the user feel like they need to have everything figured out before the agent can help them.
- **The post-setup guidance in Phase 7 is not optional.** This is how people learn to use the product. Always show it after the first run.
