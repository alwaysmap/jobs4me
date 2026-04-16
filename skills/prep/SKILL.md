---
name: prep
description: >
  Use this skill when the user says "I have an interview", "help me prepare",
  "prep for my interview at {company}", "create interview prep", or "company overview".
  Also handles the `/jfm:prep` command and triggers when a role moves to the
  interviewing stage. Generates two research documents: a company overview and an
  interview prep guide with experience-mapped case studies.
user_summary: >
  Prepare for an interview — generates a company overview and an interview guide
  with talking points mapped to your actual experience.
version: 0.1.0
---

# Interview Prep Generator

Create research documents that help the user walk into an interview with company context and pre-mapped case studies.

## When to Trigger

- User explicitly asks for interview prep
- User moves a role to `interviewing` stage
- User says they have a phone screen or interview coming up

## Workflow

1. Read `profile.yaml` and `tracker.yaml`
2. Find the application matching the company name:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js find --company "Company Name"
   ```
   If multiple roles are returned for the same company, list them with role titles and stages and ask which one:
   > I found two roles at Google:
   > 1. Staff Engineer (maybe)
   > 2. Engineering Manager (interviewing)
   >
   > Which one are you prepping for?
3. Get file paths for the chosen application:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js paths --id <id>
   ```
   This returns `company_dir`, `role_dir`, and current file locations.
4. If a JD exists (check `has_jd` from paths output), read it. If not, ask the user for the job posting URL and fetch it.
5. Read the user's evidence: fetch resume URL if provided, read portfolio URLs, read additional context.
6. Generate the two documents below.
7. Save files to the company structure:
   - Company Overview → `{company_dir}/overview.md` (shared across roles at this company)
   - Interview Prep → `{role_dir}/prep.md` (role-specific)
   Create directories with `mkdir -p` if they don't exist.
8. Update the application's stage to `interviewing` in `tracker.yaml` if it isn't already.
9. **Show the user what was created.** After saving, present the documents inline:

   > **Company Overview** — `{company_dir}/overview.md`
   > {Show a 3-4 line summary of what the overview covers}
   >
   > **Interview Prep** — `{role_dir}/prep.md`
   > {Show a 3-4 line summary: number of topics covered, key areas, questions to ask}
   >
   > Read the full docs in `{company_dir}/` or click the links on your board.

   Use `present_files` to share the created files and `Kanban/index.html` with the user.

If no company name is provided, check the tracker for roles in any non-terminal stage and list them, prioritizing `interviewing` and `applied`:

> Which role are you prepping for?
>
> **Interviewing:**
> - Acme Corp — VP Engineering
>
> **Applied:**
> - BigCo — Director of Programs
>
> **Other active roles:**
> - Google — Staff Engineer (maybe)
> - Google — Engineering Manager (suggested)
>
> Or paste a job posting URL and I'll prep for that one.

This makes it easy to pick without remembering exact names. Always show the role title — company name alone is ambiguous when there are multiple roles at the same company.

## Documents to Generate

**You MUST create exactly TWO separate files.** Do not combine them. They serve different purposes and appear as separate links on the board.

---

### File 1: Company Overview → `{company_dir}/overview.md`

This is a **company-level** document shared across all roles at this company. If it already exists, skip it.

Research the company and write a concise overview covering:

- **What they do**: Products, services, core business
- **How they make money**: Revenue model, key metrics, customer segments
- **Market position**: Competitors, differentiation, market share
- **Recent moves**: Funding rounds, acquisitions, product launches, leadership changes (last 12 months)
- **Culture signals**: Glassdoor themes, engineering blog tone, public statements on values
- **Why this role exists**: What problem is the company trying to solve by hiring for this role? (infer from JD + company context)

Keep it scannable — 10 minutes to read before an interview. **This file contains ONLY company research. No interview questions, no experience mapping.**

---

### File 2: Interview Prep → `{role_dir}/prep.md`

This is a **role-specific** document. It contains everything the user needs to prepare for interviews for THIS specific role.

Read `references/prep-template.md` for the detailed structure. The prep doc has three sections:

**Section A — JD-Based Interview Topics**

For each likely interview topic (inferred from the JD requirements):

1. **The likely question**: What will they probably ask about this area?
2. **Your story**: Which specific experience from the user's background maps here? (Pull from `profile.yaml` evidence, resume, portfolio)
3. **Bridge to their needs**: How does this story connect to what the company needs?
4. **Gaps to address honestly**: Where is the evidence thin? How should the user frame this?

**Section B — Industry & Company Context Questions**

Beyond the JD requirements, anticipate questions based on the company's industry, stage, and recent context. These are questions interviewers ask because of *who they are*, not just what the role needs.

Research the company to identify:
- **Industry vertical** (fintech, healthtech, developer tools, enterprise SaaS, etc.)
- **Company stage** (early startup, growth, public, turnaround)
- **Recent context** (acquisition, IPO, layoffs, new market entry, leadership change)

Generate 3-5 industry/context questions in the prep doc:

```markdown
## Industry & Company Context Questions

### {Topic — e.g., "Regulated environment"}
**Why they'll ask**: {e.g., "Fintech companies always probe for compliance comfort"}
**Likely question**: "{e.g., Tell me about shipping in a regulated environment}"
**Your story**: {mapped from user's evidence}
```

Common patterns to check:
- **Fintech/healthtech**: Compliance, regulated shipping, security posture, working with legal
- **Developer tools**: Dogfooding, developer empathy, open source community, API design
- **Enterprise SaaS**: Long sales cycles, customer success alignment, multi-tenant architecture
- **Marketplace/platform**: Two-sided dynamics, supply/demand balance, trust & safety
- **Hardware + software**: Manufacturing timelines, firmware/software coordination, supply chain, hardware iteration cost
- **AI/ML companies**: Responsible AI, evaluation methodology, data quality, model deployment, keeping up with rapid change
- **Growth-stage startups**: Wearing multiple hats, building process from scratch, hiring fast, ambiguity tolerance
- **Post-acquisition**: Integration experience, culture merging, reorg navigation, stakeholder alignment across orgs
- **Public companies**: Board-level reporting, quarterly cadence, analyst scrutiny, SOX compliance awareness

Generate 3-5 of these industry/context questions per company. They should feel like the questions a well-prepared candidate would *expect* but a generic prep guide would miss.

**Section C — Questions to Ask Them**

End the prep doc with 5-8 thoughtful questions that demonstrate research and genuine curiosity about the role. These should be specific to the company and role, not generic.

---

**Reminder: File 1 (`overview.md`) = company research only. File 2 (`prep.md`) = Sections A + B + C above. Two separate files, two separate links on the board.**

## Evidence Sources

Read the user's evidence in this order of preference:

1. `profile.yaml` → `evidence.resume_url` (fetch and read)
2. `profile.yaml` → `evidence.portfolio_urls` (check for relevant projects)
3. `profile.yaml` → `evidence.additional_context` (user-written narrative)
4. `archetypes.yaml` → the matched role type's `experience_mapping`

The user's thinnest area is typically case studies — the interview prep doc should do the heavy lifting of connecting their experience to the role's requirements. Don't just list qualifications; tell the user which story to tell for each topic.

Company overview research uses **Sonnet** sub-agents. Interview prep generation uses the main **Opus** agent for deeper reasoning about experience mapping.

## Additional Resources

- **`references/prep-template.md`** — full template with section structure and examples
