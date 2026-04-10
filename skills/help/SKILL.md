---
name: help
description: >
  Use this skill when the user asks "what can you do?", "help", "how does this work",
  "what commands are there", "what is this plugin", or any question about the plugin's
  capabilities. Also use when the user seems lost or unsure what to do next.
user_summary: >
  See what this agent can do — a quick overview of all commands and how they fit together.
---

# Help

When the user asks for help, read the `user_summary` field from each skill's SKILL.md frontmatter and present them as a concise overview grouped by workflow.

## Response

> **Jobs For Me** — an AI-powered job search agent that finds roles, assesses fit, and learns what you actually want.
>
> **Getting started:**
> - `/setup` — Set up your profile, role types, and search sources. Run once to get started.
>
> **Finding roles:**
> - `/search` — Search job boards for matching roles. Filters duplicates and bad fits automatically.
> - `/assess <url>` — Paste a job posting URL and get a fit assessment against your profile.
>
> **Managing your pipeline:**
> - `/review` — Walk through new suggestions and decide on each one.
> - `/update` — Move a single role through stages (applied, interviewing, declined, etc.)
> - `/followup` — Get recommended next actions for your Applied roles, or draft outreach for a specific one.
> - `/board` — Regenerate your kanban board (usually automatic — just refresh the page).
>
> **Preparing:**
> - `/prep <company>` — Generate interview prep with your experience mapped to the role.
> - `/apply <company>` — Draft a cover letter and optionally a tailored resume.
>
> **Adjusting:**
> - `/tweak` — Change anything about your setup. Nothing is locked in.
>
> Your board is at `Kanban/index.html` — open it in your browser to see your full pipeline.

## Contextual help

If the user has an existing profile (check for `profile.yaml`), tailor the response to their current state:

- If they have suggestions waiting, mention `/review`
- If they have 3+ roles in `applied`, mention `/followup` — it'll tell them which ones need attention and which are in pure-wait territory
- If they have roles in `applied` or `interviewing`, mention `/prep`
- If they haven't run a search yet, nudge toward `/search`
- If their `evidence_complete` is false, mention `/tweak` to add career evidence

Always include at the end:

> **Found a bug?** [Report it](https://github.com/alwaysmap/jobs4me/issues/new?template=bug.yml) · [Known issues](https://github.com/alwaysmap/jobs4me/issues?q=is%3Aissue+label%3Abug)
>
> **Docs:** [jobs4me.org](https://jobs4me.org)

Keep it short. The user asked for help, not a manual.
