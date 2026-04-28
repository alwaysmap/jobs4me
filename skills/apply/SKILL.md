---
name: apply
description: >
  Use this skill when the user wants to apply for a role — "write a cover letter",
  "help me apply", "draft my application for {company}", or "tailor my resume".
  Also handles the `/jfm:apply` command and triggers when a role moves to the
  applied stage and needs application materials. Generates a cover letter and
  optionally a tailored resume for a specific role.
user_summary: >
  Draft application materials for a role — a short, personal cover letter in
  your voice and an optionally tailored resume highlighting relevant experience.
---

# Apply for a Role

Generate application materials — a cover letter and optionally a tailored resume — for a specific tracked role.

## Files

| File | Loaded when |
|------|-------------|
| `SKILL.md` (this file) | Always |
| `references/voice.md` | Step 7 (cover letter), Step 8 (tailored resume) — contains the principles, mechanical rules, anti-pattern list, anti-fabrication rule, no-subtitle rule, and cover letter template. **MANDATORY** before any draft. |
| `references/pdf-rendering.md` | Step 12 — pandoc / xelatex setup, fonts, margins, H1 handling. |

## When to Trigger

- User explicitly asks to write a cover letter or application
- User says "help me apply to {company}"
- User says "draft materials for {company}"
- User moves a role to `applied` and asks for help with the application

## Workflow

1. Read `profile.yaml`, `archetypes.yaml`, and `tracker.yaml`.
2. Find the application matching the company:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js find --company "Company Name"
   ```
   If multiple roles are returned for the same company, list them with role titles and stages and ask which one:
   > I found two roles at Google:
   > 1. Staff Engineer (maybe)
   > 2. Engineering Manager (applied)
   >
   > Which one are you applying to?
3. Get file paths:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js paths --id <id>
   ```
4. Read the JD (from `{role_dir}/jd.md`). If it doesn't exist, ask the user for the posting URL and fetch + save it.
5. Read the Company Overview if it exists (`{company_dir}/overview.md`). If not, generate one first (see prep skill).
6. Read the user's evidence (in priority order — see Evidence Sources below).
7. **Read `references/voice.md`** — mandatory before drafting. Generate the cover letter, applying every rule in voice.md plus `profile.yaml` → `writing_voice` (the user's durable voice rules).
8. Ask the user if they'd like a tailored resume. If yes, generate it under the same voice rules (the no-subtitle rule and mechanical rules in `references/voice.md` apply); see Tailored Resume below for the resume-specific adjustments.
9. Save files to the role directory:
   - Cover letter → `{role_dir}/cover-letter.md`
   - Tailored resume → `{role_dir}/resume.md` (if requested)
10. Move the role to `applied` if it isn't already:
    ```bash
    node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js stage --id <id> --stage applied
    ```
11. **Show the user what was created.** Present the cover letter inline (full text) so they can review it without opening a file:

    > **Cover letter** — `{role_dir}/cover-letter.md`
    >
    > {Show the full cover letter text here}

    Use `present_files` to share the created markdown files and `Kanban/index.html` with the user.

    Iterate if they give feedback — update the file and show the revised version inline.

12. **Render PDFs.** Once the user has approved the markdown drafts, render `cover-letter.md` and (if requested) `resume.md` to PDF using the canonical pandoc setup. **Read `references/pdf-rendering.md`** for the full command, fonts, header.tex content, and the H1 strip-vs-keep rule.

    After rendering, use `present_files` to share the PDFs alongside the markdown sources. The PDFs are what the user actually submits — markdown is the editable source.

## Tailored Resume

Only generate if the user asks. The tailored resume is NOT a rewrite — it's the user's actual resume with these adjustments:

- **Reorder experience bullets** to lead with the most relevant ones for this role
- **Add a 2-3 line "Summary" section** at the top that mirrors the JD's key requirements
- **Highlight** specific achievements that map to the JD's requirements
- **Keep everything truthful** — never invent experience, inflate numbers, or claim skills the user doesn't have

Header structure and the no-subtitle rule are in `references/voice.md` ("No 'Tailored for…' subtitle" section) — same rules apply to both cover letter and resume.

## Iteration

The user will almost certainly want to edit the cover letter. When they give feedback:

1. Apply their changes
2. Re-save to the same file
3. Don't re-explain what you changed — just show the updated version

Keep the iteration tight. The user knows what they want to sound like. Recurring corrections (e.g., "stop saying 'caught my attention'") belong in `profile.yaml` → `writing_voice` so they stick across all future drafts.

## Post-Apply

After materials are ready and the role is in `applied` stage:

- Note the application date in the tracker
- Remind the user to actually submit (the plugin generates materials, it doesn't submit applications)
- Suggest setting a follow-up reminder if the company is known to be slow

## Evidence Sources

Read evidence in this order of preference:

1. `profile.yaml` → `writing_voice` (the user's voice rules — apply on top of every draft)
2. `profile.yaml` → `evidence.resume_url` (fetch and read)
3. `profile.yaml` → `evidence.portfolio_urls` (check for relevant projects)
4. `profile.yaml` → `evidence.additional_context` (user-written narrative)
5. `archetypes.yaml` → the matched role type's `experience_mapping`
6. Company Overview (`{company_dir}/overview.md`) for company context
7. JD (`{role_dir}/jd.md`) for role requirements
