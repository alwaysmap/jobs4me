---
name: apply
description: >
  Use this skill when the user wants to apply for a role — "write a cover letter",
  "help me apply", "draft my application for {company}", "tailor my resume",
  or when a role moves to the applied stage and needs application materials.
  Generates a cover letter and optionally a tailored resume for a specific role.
user_summary: >
  Draft application materials for a role — a short, personal cover letter in
  your voice and an optionally tailored resume highlighting relevant experience.
---

# Apply for a Role

Generate application materials — a cover letter and optionally a tailored resume — for a specific tracked role.

## When to Trigger

- User explicitly asks to write a cover letter or application
- User says "help me apply to {company}"
- User says "draft materials for {company}"
- User moves a role to `applied` and asks for help with the application

## Workflow

1. Read `profile.yaml`, `archetypes.yaml`, and `tracker.yaml`
2. Find the application matching the company. If multiple roles at the same company, ask which one.
3. Get file paths:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js paths --id <id> --dir .
   ```
4. Read the JD (from `{role_dir}/jd.md`). If it doesn't exist, ask the user for the posting URL and fetch + save it.
5. Read the Company Overview if it exists (`{company_dir}/overview.md`). If not, generate one first (see prep skill).
6. Read the user's evidence:
   - `profile.yaml` → `evidence.resume_url` (fetch the full resume)
   - `profile.yaml` → `evidence.portfolio_urls`
   - `profile.yaml` → `evidence.additional_context`
   - `archetypes.yaml` → the matched archetype's `experience_mapping`
7. Generate the cover letter (see format below)
8. Ask the user if they'd like a tailored resume (see format below)
9. Save files to the role directory:
   - Cover letter → `{role_dir}/cover-letter.md`
   - Tailored resume → `{role_dir}/resume.md` (if requested)
10. Move the role to `applied` if it isn't already:
    ```bash
    node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js stage --id <id> --stage applied --dir . --rebuild-board
    ```
11. Show the user the cover letter for review. Iterate if they give feedback.

## Cover Letter Format

The cover letter must sound like the user, not like a template. Read the user's writing voice notes in `profile.yaml` if available, and follow these principles:

- **Short** — 150-250 words. No padding, no filler.
- **Personal hook** — Open with a specific connection to the company or role, not "I'm writing to apply for..." Something concrete: a product the user has used, a person they know there, a problem they've solved that maps directly.
- **Evidence-linked** — Don't restate the resume. Link to 2-3 specific examples from the user's portfolio or blog that demonstrate fit. The user's website IS their portfolio.
- **Honest about gaps** — If there's a gap the JD highlights, address it briefly and honestly rather than ignoring it.
- **Simple close** — "Thanks," or "I hope to hear from you." No grandiose closing.
- **No buzzwords** — No "synergy", "leverage", "passionate about", "excited to bring my skills". Use plain language.

### Structure

```
{Personal hook — 1-2 sentences connecting to the company/role}

{Core pitch — 2-3 sentences on why the user is a strong fit, with inline links to evidence}

{Gap acknowledgment if relevant — 1 sentence}

{Simple close}

{User's name}
{Contact info from profile.yaml}
{Portfolio URL}
```

## Tailored Resume

Only generate if the user asks. The tailored resume is NOT a rewrite — it's the user's actual resume with these adjustments:

- **Reorder experience bullets** to lead with the most relevant ones for this role
- **Add a 2-3 line "Summary" section** at the top that mirrors the JD's key requirements
- **Highlight** specific achievements that map to the JD's requirements
- **Keep everything truthful** — never invent experience, inflate numbers, or claim skills the user doesn't have

Save as markdown. The user can convert to their preferred format.

## Iteration

The user will almost certainly want to edit the cover letter. When they give feedback:

1. Apply their changes
2. Re-save to the same file
3. Don't re-explain what you changed — just show the updated version

Keep the iteration tight. The user knows what they want to sound like.

## Post-Apply

After materials are ready and the role is in `applied` stage:

- Note the application date in the tracker
- Remind the user to actually submit (the plugin generates materials, it doesn't submit applications)
- Suggest setting a follow-up reminder if the company is known to be slow

## Evidence Sources

Read evidence in this order of preference:

1. `profile.yaml` → `evidence.resume_url` (fetch and read)
2. `profile.yaml` → `evidence.portfolio_urls` (check for relevant projects)
3. `profile.yaml` → `evidence.additional_context` (user-written narrative)
4. `archetypes.yaml` → the matched archetype's `experience_mapping`
5. Company Overview (`{company_dir}/overview.md`) for company context
6. JD (`{role_dir}/jd.md`) for role requirements
