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

## When to Trigger

- User explicitly asks to write a cover letter or application
- User says "help me apply to {company}"
- User says "draft materials for {company}"
- User moves a role to `applied` and asks for help with the application

## Workflow

1. Read `profile.yaml`, `archetypes.yaml`, and `tracker.yaml`
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
6. Read the user's evidence:
   - `profile.yaml` → `evidence.resume_url` (fetch the full resume)
   - `profile.yaml` → `evidence.portfolio_urls`
   - `profile.yaml` → `evidence.additional_context`
   - `archetypes.yaml` → the matched role type's `experience_mapping`
7. Generate the cover letter (see format below)
8. Ask the user if they'd like a tailored resume (see format below)
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

12. **Render PDFs.** Once the user has approved the markdown drafts, render `cover-letter.md` and (if requested) `resume.md` to PDF using the canonical pandoc setup. See `references/pdf-rendering.md` for the full command, fonts, and rationale.

    After rendering, use `present_files` to share the PDFs alongside the markdown sources. The PDFs are what the user actually submits — markdown is the editable source.

## Cover Letter Format

The cover letter must sound like the user, not like a template. Read the user's writing voice notes in `profile.yaml` if available, and follow these principles:

- **Short** — 150-250 words. No padding, no filler.
- **Personal hook** — Open with a specific connection to the company or role, not "I'm writing to apply for..." Something concrete: a product the user has used, a person they know there, a problem they've solved that maps directly.
- **Evidence-linked** — Don't restate the resume. Link to 2-3 specific examples from the user's portfolio or blog that demonstrate fit. The user's website IS their portfolio.
- **Honest about gaps** — If there's a gap the JD highlights, address it briefly and honestly rather than ignoring it.
- **Simple close** — "Thanks," or "I hope to hear from you." No grandiose closing.
- **No buzzwords** — No "synergy", "leverage", "passionate about", "excited to bring my skills". Use plain language.

### Voice — patterns to cut on sight

These all read as pitch / sales voice and must be removed. The closer is "state the fact, link the evidence, stop":

- "caught my attention because…" / "what excites me about…" — pitch-hook framing
- "I'd bring that playbook to…" / "I'd hit the ground running" — active selling
- "A couple of pieces of evidence" / "let me share why I'm a fit" — casemaking preamble
- "isn't abstract for me" / "the underlying work is the same" — performative confidence
- "it reads like a role I'd interview for anywhere" — self-promotional
- "The IC depth is real" / similar defensive self-promotion
- Any closing crescendo: "I'd love the chance to…", "excited to bring…", "ready to dive in"

Replace with concrete role/charter overlap. "I built this at GitHub. Details at [link]." beats "I'd bring my proven playbook to scale your TPM org."

### Never fabricate inner thoughts, history, or feelings

Hooks must come from facts the user provided or public evidence (resume, blog, profile.yaml, prior employers, location, public talks). Do not invent:

- Emotional framing — "excited about", "long admired", "always wanted to work on X"
- Personal history of interest — "I've watched X for years", "I've been using X since…", "I've been thinking about X"
- Inferred opinions — "I love what you're building" (unless the user said so)

If a hook needs a personal connection and you don't have one, ask the user — or write a hook that leads with concrete role/charter overlap instead.

### Structure

**No "Tailored for {Company} — {Role}" subtitle, tagline, or italic header line.** The folder and filename convey it. Putting it in the document signals customization to the hiring manager and adds noise.

Cover letter header: `# Cover Letter — {Company}, {Role}` (the H1 gets stripped at PDF render — see `references/pdf-rendering.md`) → blank line → date → blank line → salutation. No subtitle.

```
# Cover Letter — {Company}, {Role}

{Date}

Dear {hiring contact, or "Hiring team" if unknown},

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

**No "Tailored for {Company} — {Role}" subtitle, tagline, or italic header line.** Same rule as the cover letter: the folder and filename carry that context. Resume header structure: `# {Candidate Name}` → blank line → contact line → `## Summary`. Nothing in between.

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
4. `archetypes.yaml` → the matched role type's `experience_mapping`
5. Company Overview (`{company_dir}/overview.md`) for company context
6. JD (`{role_dir}/jd.md`) for role requirements

## Additional Resources

- **`references/pdf-rendering.md`** — canonical pandoc / xelatex setup for converting markdown drafts to submission-ready PDFs (Step 12)
