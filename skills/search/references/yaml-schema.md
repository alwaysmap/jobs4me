# YAML Schema Reference

**This is the canonical data contract for all YAML files.** Every skill that reads or writes YAML must follow these schemas exactly. The board builder (`tracker.js build-board`) depends on these field names.

If you need to add a field, add it here first. Do not invent new field names.

---

## profile.yaml

```yaml
name: "Full Name"                     # REQUIRED - string
email: "user@example.com"             # optional - string

evidence:                              # REQUIRED section
  resume_url: "https://..."           # optional - URL string
  portfolio_urls:                     # optional - array of URL strings
    - "https://..."
  additional_context: |               # optional - block scalar, career narrative
    Free-form text about background...
  case_studies:                       # optional - array of objects
    - title: "Project Title"           # REQUIRED in each case study
      company: "Company Name"         # optional
      date: "YYYY-MM"                # optional
      url: "https://..."             # optional - link to public artifact
      situation: "Context..."         # REQUIRED
      action: "What you did..."       # REQUIRED
      outcome: "Measurable result..." # REQUIRED
      tags:                           # REQUIRED - array of strings
        - "skill tag"
  evidence_complete: true             # boolean - false means user should add more

preferences:                           # REQUIRED section
  comp_floor_usd: 200000             # REQUIRED - integer, no formatting
  comp_floor_gbp: 150000             # optional - for UK roles
  comp_exceptions: "civic tech: $160K" # optional - string
  max_travel_pct: 25                  # REQUIRED - integer 0-100
  locations:                          # REQUIRED - array of strings
    - remote_us                       # use: remote_us, remote_uk, hybrid_<city>, onsite_<city>
  seniority_floor: "director"         # REQUIRED - string: ic, manager, director, vp, c-level
  hard_nos:                           # optional
    companies:                        # array of company names to never suggest
      - "Company Name"
    industries:                       # array of industry types to skip
      - "industry"
```

### Notes
- `case_studies[].tags` are lowercase tags used for matching, not display
- `evidence_complete` drives the "/tweak to add more" prompt
- `hard_nos.companies` is the profile-level skip list (also in filters.yaml)

---

## archetypes.yaml

```yaml
role_types:                            # REQUIRED - top-level key
  - key: "kebab-case-id"             # REQUIRED - unique identifier
    name: "Human Readable Name"       # REQUIRED - display name
    titles:                           # REQUIRED - array, 4-6 variations
      - "Exact Job Title"
      - "Alternate Title"
    keywords:                         # REQUIRED - array, search terms
      - "search phrase"
    experience_mapping: |             # REQUIRED - block scalar
      Paragraph mapping user's experience to this role type.
      Referenced by fit assessments and cover letter generation.
    company_fit: "Description"        # REQUIRED - string, target company type
```

### Notes
- Top-level key MUST be `role_types` (not `archetypes`)
- `key` is used as the `archetype` value in tracker.yaml entries
- `titles` are what gets searched on job boards
- `keywords` are additional search terms beyond exact titles
- `experience_mapping` is the most important field — it's used by fit assessment, cover letters, and interview prep

---

## filters.yaml

```yaml
sources:                               # REQUIRED - top-level key (NOT include.sources)
  - name: "Source Name"               # REQUIRED - display name
    url: "https://..."                # REQUIRED - URL
    type: job_board                   # REQUIRED - one of: job_board, org_portfolio, career_page, curated_list, aggregator
    priority: 1                       # optional - integer, lower = searched first

target_companies:                      # top-level array of strings
  - "Dream Company"

skip_companies:                        # top-level array of strings (NOT skip)
  - "Company to Never Suggest"

watch:                                 # top-level array of strings
  - "Company to Flag When Seen"

industries:                            # top-level array of strings
  - "Sector or domain of interest"     # used to weight search results favorably

decline_patterns:                      # top-level array of objects
  - pattern: "Pattern description"    # REQUIRED - what to match against
    learned_from: "Company Name"      # optional - which decline taught this
```

### Notes
- Sources are at the TOP LEVEL: `sources:`, not `include.sources:`
- Skip list is `skip_companies:`, not `skip:`
- `industries` captures positive sector/domain interests (e.g., "water utilities", "industrial data", "civic tech"). Used by the search agent to weight companies in these sectors more favorably. Managed via `update-filter-list --list industries --add/--remove`.
- `decline_patterns` are learned automatically from `/update Company - decline reason`
- Source `type` determines search behavior:
  - `job_board` / `aggregator` — searched with role type keywords + location
  - `org_portfolio` / `curated_list` — scanned for employer names, then career pages checked
  - `career_page` — checked directly for matching roles

---

## tracker.yaml

**NEVER write this file directly. Always use `tracker.js` commands.**

```yaml
applications:                          # REQUIRED - top-level key
  - id: "company-role-kebab"          # REQUIRED - auto-generated by tracker.js
    company: "Company Name"           # REQUIRED - exact company name
    role: "Role Title"                # REQUIRED - exact role title
    stage: suggested                  # REQUIRED - one of: suggested, maybe, applied, interviewing, offered, rejected, closed, declined
    url: "https://..."                # optional - job posting URL
    archetype: "role-type-key"        # optional - matches archetypes.yaml key
    last_updated: "2026-03-30"        # REQUIRED - ISO date, auto-set
    agent_summary: |                  # optional - markdown block scalar
      ### Recommendation
      **Strong** — one line rationale

      ### Gaps & Concerns
      - gap 1

      ### Positive Fit
      - evidence 1
    notes: "Free text"                # optional - user/agent notes
    decision:                         # optional - set on decline
      proceed: "no"                   # "yes" or "no"
      reason: "reason text"           # why
    dates:                            # REQUIRED - auto-managed
      identified: "2026-03-30"        # when first found
      maybe: "2026-03-30"            # when moved to stage (auto-set)
      applied: "2026-03-30"
      declined: "2026-03-30"
```

### Stage transitions
```
suggested → maybe, applied, declined
maybe → applied, interviewing, declined
applied → interviewing, rejected, closed, declined
interviewing → offered, rejected, closed, declined
offered → applied, closed, declined
rejected → applied
closed → suggested
declined → suggested, maybe
```

---

## Directory structure

```
{workspace}/
  profile.yaml
  archetypes.yaml
  filters.yaml
  tracker.yaml
  briefs/
    {YYYY-MM-DD}.md
  companies/
    {Company Name}/
      overview.md                     # company-level, shared across roles
      {YYYY-MM-DD-role-slug}/
        jd.md                         # role-specific job description
        prep.md                       # role-specific interview prep
        cover-letter.md               # role-specific (from /apply)
        resume.md                     # role-specific (from /apply)
        offer-notes.md                # role-specific (from /update with offer)
  Kanban/
    index.html                        # auto-generated board
  .backups/                           # auto-managed by tracker.js
```

### Notes
- Company directory names use the exact company name from tracker.yaml (spaces OK)
- Role subdirectory format is `YYYY-MM-DD-slugified-role-title`
- The board builder scans company directories for docs — it doesn't require exact directory name matches
- `overview.md` is ONE per company, shared across all roles at that company
- `prep.md` is ONE per role, inside the role subdirectory
