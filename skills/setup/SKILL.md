---
name: setup
description: >
  Use this skill when the user says "set up my job search", "get started",
  "configure the agent", or "onboarding". Also handles the `/jfm:setup` command.
  On first run, walks through onboarding with a choice of full or quick setup.
  On subsequent runs, detects existing config and behaves like the tweak skill —
  helping the user complete or adjust their setup rather than starting from scratch.
user_summary: >
  Set up your job search profile — your background, the kinds of roles you want,
  target companies, and where to look. Run this once to get started.
---

# Guided Onboarding

Walk the user through setting up their job search agent. This is a conversational onboarding — ask questions, listen, extract structure from their answers. Do not present forms or dump all questions at once.

## First Run vs. Returning User

**Before anything else**, check whether `profile.yaml` exists in the workspace.

- **If `profile.yaml` does NOT exist** → this is a first-time setup. Proceed to "Welcome & Setup Choice" below.
- **If `profile.yaml` exists** → this is a returning user. Do NOT restart onboarding. Instead, read `profile.yaml`, `archetypes.yaml`, and `filters.yaml`, identify what's missing or incomplete, and offer to help fill the gaps — same behavior as the tweak skill. Say:

> Welcome back! You already have a profile set up. Let me check what's in place and what could use attention.
>
> {Summary of current state: profile ✓, role types ✓/✗, companies ✓/✗, sources ✓/✗, evidence_complete true/false, industries ✓/✗}
>
> What would you like to update or complete? You can also just tell me what you need — "add a new role type", "change my sources", "update my comp floor" — and I'll handle it.

Then behave exactly like the tweak skill. Do not re-ask onboarding questions for sections that are already complete.

**Upgrade detection:** When reading `filters.yaml` for a returning user, check for fields that may not exist in older configs. If `industries` is missing, it's fine — the field is optional and defaults to an empty list. Don't prompt the user to fill it unprovoked, but if they mention industry interests during the session, save them normally via `update-filter-list --list industries --add '["..."]'`. The tracker script handles the missing field gracefully.

---

## Welcome & Setup Choice

This is the very first message the user sees. It MUST present the two setup paths as a clear choice.

> **Welcome to Jobs For Me!** I'm going to set up a job search agent that finds roles for you and learns what you actually want.
>
> There are two ways to get started:
>
> **1. Full setup** (recommended, ~10 minutes) — I'll interview you about your background, preferences, target role types, dream companies, and search sources. This gives the agent the most to work with from day one.
>
> **2. Quick start** (~3 minutes) — Just give me your resume and a short description of the kinds of roles you're interested in. I'll infer the rest and you can refine later with `/jfm:tweak`.
>
> Everything is adjustable after either path — nothing is permanent. Which would you prefer?

Wait for their answer. Then proceed to the matching path.

---

## Quick Start Path

### Quick start — Step 1 of 3: Your background

> **Quick start — Step 1 of 3: Your background**
>
> Share your resume — a link, pasted text, or just tell me about your career. Whatever's easiest.

Process their input (fetch URL, parse text, etc.). Write `profile.yaml` with what you can extract.

### Quick start — Step 2 of 3: What kinds of roles?

> **Quick start — Step 2 of 3: What kinds of roles?**
>
> Describe the types of roles you're looking for. A sentence or two is fine — for example: "VP of Engineering at mid-stage startups" or "Director-level program management, remote, $200K+".

From their description, generate full role type entries. Each role type MUST include:
- `key` — kebab-case identifier
- `name` — human-readable name
- `titles` — 4-6 target job title variations
- `keywords` — search keywords for job boards
- `experience_mapping` — a paragraph mapping the user's resume experience to this role type
- `company_fit` — company size/type preference (inferred from their description)

Write `archetypes.yaml` with the same schema as the full setup. The quick start must produce data that is complete enough for the search skill to use immediately. Set reasonable defaults for preferences based on whatever they've shared.

### Quick start — Step 3 of 3: Where to search

> **Quick start — Step 3 of 3: Where to search**
>
> Based on your background in [field], I'd suggest starting with: **[Source 1]**, **[Source 2]**, and **[Source 3]**. Want me to add any others, or shall we go with these?

By this point you know the user's background and target roles. Suggest 3-5 specific sources tailored to their field (see "Tailored Source Suggestions" below). Write `filters.yaml` with their sources.

> **Setup complete!** I've got your profile, role types, and sources configured. You can refine any of this later with `/jfm:tweak` — add dream companies, more sources, career evidence, or adjust your preferences.

Proceed to "First Search Offer" below.

---

## Full Setup Path

Walk through 5 steps. **Every step transition MUST include the step indicator** so the user always knows where they are and how much is left.

### Step 1 of 5: Your background

> **Step 1 of 5: Your background**
>
> You can give me a link to your resume or LinkedIn, paste your resume text, or just tell me about your career in your own words. Whatever's easiest.
>
> Don't worry about getting everything perfect — everything here can be changed later with `/jfm:tweak`.

Read whatever they provide. If it's a URL, fetch it. If it's pasted text, parse it.

**CRITICAL: ONE QUESTION AT A TIME.** Ask a single follow-up, wait, acknowledge, then ask the next. Never batch questions.

After reading their resume, ask follow-ups from this list. **Tell the user how many questions are left** so they know the pace. Skip any the resume already answers clearly.

1. "Quick follow-up (I have up to 5 short questions, but I'll skip any your resume already answered) — What level of role are you targeting? Director, VP, Head-of?"
2. "Got it. What's your minimum acceptable base compensation?"
3. "Where are you willing to work? Remote, hybrid, specific cities?"
4. "How much travel is too much?"
5. "Last one — any industries or types of companies that are a hard no?"

After each answer, acknowledge briefly: "Got it — VP or Head-of level. Next question:..."

When done, confirm:

> **Profile saved.** Moving on to career evidence...

Write `profile.yaml`:

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

### Step 2 of 5: Career evidence

> **Step 2 of 5: Career evidence** (optional — skip if you'd rather come back later)
>
> Your resume gives me the career arc. The stuff that really helps in assessments is evidence of impact — projects, writing, talks, anything where someone can see what you actually *do*.
>
> Some examples: portfolio links, open source repos, blog posts, talks, or just describe a project in your own words.
>
> Share what you have, or say "skip" to move on. You can always add this later with `/jfm:tweak`.

For each piece of evidence:
- URL → fetch and extract key points
- Narrative → extract situation → action → outcome
- Tag with skills/themes

Add to `profile.yaml` evidence section. If they skip:
```yaml
evidence:
  evidence_complete: false
```

> Totally fine. You can add evidence anytime with `/jfm:tweak`. Moving on...

### Step 3 of 5: Role types

> **Step 3 of 5: Role types**
>
> Based on your background, here are the types of roles I think you'd be strong for:

Propose 2-4 role types. For each, draft:
- A name and key
- 4-6 target job titles
- Search keywords
- Experience mapping paragraph
- Company size/type preference

Present them clearly and ask:

> Do these look right? You can edit, remove, or add more. Say "looks good" to continue.

Write `archetypes.yaml` after confirmation.

> **Role types saved.** Two more steps...

### Step 4 of 5: Target companies

> **Step 4 of 5: Target companies**
>
> Are there specific companies you'd love to work for? Dream list, aspirational targets, companies you've been watching?

Wait for answer. Then:

> Any companies to skip? Former employers, bad cultures, types to avoid?

Capture both. Then ask about industries:

> Are there specific industries or sectors you're drawn to? For example: "civic tech", "climate", "healthcare", "industrial data", "water utilities". This helps me find companies in those spaces even if they're not on your dream list yet.

If they share industries, save them to `filters.yaml` via `update-filter-list --list industries`. If they skip:

> No problem — I'll learn your preferences as we go. You can add industries anytime with `/jfm:tweak`.

If they can't think of many companies:

> No pressure — companies will surface as the agent searches. You can add dream companies anytime with `/jfm:tweak`.

### Step 5 of 5: Search sources

> **Step 5 of 5: Search sources — last step!**

Present tailored source suggestions (see below). Then:

> Want to add any others, or shall we go with these?

Write `filters.yaml`.

> **Setup complete!** Your profile, role types, companies, and sources are all configured. Everything is adjustable later with `/jfm:tweak`.

---

## Tailored Source Suggestions

By Phase 5 (or Quick Start Step 3), you know the user's field. Instead of dumping every possible source, suggest 3-5 specific ones:

- **Tech:** LinkedIn, Wellfound, Hacker News Who's Hiring, relevant VC portfolio pages
- **Nonprofit:** Idealist.org, LinkedIn, Foundation Center, relevant association job boards
- **Healthcare:** Health eCareers, LinkedIn, hospital system career pages
- **Academia:** HigherEdJobs, Chronicle Vitae, university system portals
- **Government:** USAJOBS, governmentjobs.com, LinkedIn
- **General/mixed:** LinkedIn, Indeed, Glassdoor

Always include LinkedIn as a default. Let them add more with `/jfm:tweak`.

---

## First Search Offer

This phase is shared by both paths. After setup is complete:

> Want me to run a first search now?
>
> **Heads up:** The first search takes longer than future ones — expect around **20 minutes**. I'm checking all your sources and assessing each role against your profile. I'll keep you posted as I go. Future searches are faster because I already know what to skip.
>
> You can start the search now and do something else while it runs, or come back later and run `/jfm:search` when you're ready.

If yes, initialize the tracker (dependencies are vendored with the plugin — no install step needed):

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js init
```

Create empty directories: `active/`, `declined/`, `briefs/`

Then trigger the search skill. After the sweep completes:

> **Found {N} roles** that look like potential matches. Your board is ready.

Use `present_files` to share `Kanban/index.html` with the user.
>
> Want to walk through them now? I'll show each one and you can tell me yes, no, or skip. This first review helps me learn what you actually want — your reactions make future searches better.

If yes, trigger the review skill with calibration framing.

---

## What's Next

After the first run (or if the user defers the search), **always show this guidance.** This is not optional — it's how people learn to use the product.

> You're all set! Here's how this works day to day:
>
> **`/jfm:search`** — runs a new search sweep. You can run it whenever you want, or set it on a schedule.
>
> **`/jfm:review`** — walk through new suggestions and decide on each one.
>
> **`/jfm:update`** — move a single role through stages. `/jfm:update Acme - interviewing`, `/jfm:update Acme - decline too much travel`.
>
> **`/jfm:assess`** — found a posting on your own? Paste the URL and I'll evaluate it.
>
> **`/jfm:prep`** — preparing for an interview? I'll research the company and map your experience.
>
> **`/jfm:tweak`** — change anything about your setup. Nothing is locked in.
>
> Run `/jfm:setup` again anytime — it'll check what's in place and help you fill gaps (same as `/jfm:tweak`).
>
> **Automate it:** Schedule `/jfm:search` to run daily using the scheduled tasks menu (clock icon). New roles show up on your board without you lifting a finger.

---

## Rules

- **ONE QUESTION PER MESSAGE.** Never ask two questions in the same message. Ask, wait, acknowledge, then ask the next.
- **Step indicators are REQUIRED.** Every step transition must show where the user is (e.g., "Step 3 of 5"). Never skip these.
- **Sub-progress on multi-question steps.** When Phase 1 has multiple follow-ups, tell the user how many are left. "3 more quick questions..."
- **The setup choice (full vs quick) is REQUIRED** on first run. Never skip straight to questions.
- **The first-search time warning is REQUIRED.** Never let the user start a search without knowing it takes ~20 minutes.
- Be conversational, not robotic. Acknowledge before moving on.
- **Reassurance at every step.** Reference `/jfm:tweak` so they know nothing is permanent.
- **The What's Next section is REQUIRED.** Always show it after the first run or if the user defers the search.
