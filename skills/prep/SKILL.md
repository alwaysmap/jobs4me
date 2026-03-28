---
name: prep
description: >
  Use this skill when the user says "I have an interview", "help me prepare",
  "prep for my interview at {company}", "create interview prep", "company overview",
  or when a role moves to the interviewing stage. Generates two research documents:
  a company overview and an interview prep guide with experience-mapped case studies.
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
2. Find the application matching the company name in the tracker. If multiple roles at the same company, ask which one.
3. Get file paths for this application:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js paths --id <id> --dir .
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
9. Offer to regenerate `Kanban/index.html`.

If no company name is provided, check the tracker for roles in `applied` or `interviewing` stages and list them:

> Which company are you prepping for?
>
> **Currently active:**
> - Acme Corp — VP Engineering (interviewing)
> - BigCo — Director of Programs (applied)
>
> Or paste a job posting URL and I'll prep for that one.

This makes it easy to pick without remembering exact names.

## Documents to Generate

For each company/role, create two files in the workspace:

### 1. Company Overview (`companies/{Company}/overview.md`)

Research the company and write a concise overview covering:

- **What they do**: Products, services, core business
- **How they make money**: Revenue model, key metrics, customer segments
- **Market position**: Competitors, differentiation, market share
- **Recent moves**: Funding rounds, acquisitions, product launches, leadership changes (last 12 months)
- **Culture signals**: Glassdoor themes, engineering blog tone, public statements on values
- **Why this role exists**: What problem is the company trying to solve by hiring for this role? (infer from JD + company context)

Keep it scannable — the user should be able to read this in 10 minutes before an interview.

### 2. Interview Prep (`companies/{Company}/{YYYY-MM-role-slug}/prep.md`)

Read `references/prep-template.md` for the detailed structure. The core pattern:

For each likely interview topic (inferred from the JD requirements):

1. **The likely question**: What will they probably ask about this area?
2. **Your story**: Which specific experience from the user's background maps here? (Pull from `profile.yaml` evidence, resume, portfolio)
3. **Bridge to their needs**: How does this story connect to what the company needs?
4. **Gaps to address honestly**: Where is the evidence thin? How should the user frame this?

End with **Questions to ask them** — 5-8 thoughtful questions that demonstrate research and genuine curiosity about the role.

### 3. Industry & Company-Specific Questions

Beyond the JD requirements, research the company's **industry, business model, and stage** to anticipate questions the JD won't spell out. These are the questions interviewers ask because of *who they are*, not just what the role needs.

**Research the company to identify:**
- **Industry vertical** (fintech, healthtech, developer tools, enterprise SaaS, etc.) — each has signature interview topics
- **Company stage** (early startup, growth, public, turnaround) — this shapes what they care about
- **Recent context** (acquisition, IPO, layoffs, new market entry, leadership change) — interviewers will want to know you understand their moment

**Then generate a section in the prep doc:**

```markdown
## Industry & Company Context Questions

These are questions likely to come up because of {Company}'s position as a {stage} {industry} company, not just from the JD:

### {Topic 1 — e.g., "Regulated environment"}
**Why they'll ask**: {e.g., "Fintech companies always probe for comfort with compliance, audit trails, and working with legal/risk teams"}
**Likely question**: "{e.g., Tell me about a time you shipped a product in a regulated environment. How did you balance speed with compliance?}"
**Your story**: {mapped from user's evidence}

### {Topic 2 — e.g., "Scaling past product-market fit"}
**Why they'll ask**: {e.g., "Series C companies are usually past PMF and struggling with process/org scaling"}
**Likely question**: "..."
**Your story**: ...
```

Common industry-specific patterns to check:
- **Fintech/healthtech**: Compliance, regulated shipping, security posture, working with legal
- **Developer tools**: Dogfooding, developer empathy, open source community, API design
- **Enterprise SaaS**: Long sales cycles, customer success alignment, multi-tenant architecture, enterprise security reviews
- **Marketplace/platform**: Two-sided dynamics, supply/demand balance, trust & safety, network effects
- **Hardware + software**: Manufacturing timelines, firmware/software coordination, supply chain, hardware iteration cost
- **AI/ML companies**: Responsible AI, evaluation methodology, data quality, model deployment, keeping up with rapid change
- **Growth-stage startups**: Wearing multiple hats, building process from scratch, hiring fast, ambiguity tolerance
- **Post-acquisition**: Integration experience, culture merging, reorg navigation, stakeholder alignment across orgs
- **Public companies**: Board-level reporting, quarterly cadence, analyst scrutiny, SOX compliance awareness

Generate 3-5 of these industry/context questions per company. They should feel like the questions a well-prepared candidate would *expect* but a generic prep guide would miss.

## Evidence Sources

Read the user's evidence in this order of preference:

1. `profile.yaml` → `evidence.resume_url` (fetch and read)
2. `profile.yaml` → `evidence.portfolio_urls` (check for relevant projects)
3. `profile.yaml` → `evidence.additional_context` (user-written narrative)
4. `archetypes.yaml` → the matched archetype's `experience_mapping`

The user's thinnest area is typically case studies — the interview prep doc should do the heavy lifting of connecting their experience to the role's requirements. Don't just list qualifications; tell the user which story to tell for each topic.

## Additional Resources

- **`references/prep-template.md`** — full template with section structure and examples
