# Mode 2 — Single-role outreach drafting

Loaded by the followup skill when invoked with a specific company name
(`/jfm:followup {company}` or natural language naming a role). The job is
to produce three templated outreach variants for one role, saved to a
file in the role's directory alongside the cover letter.

This mode never sends, schedules, or transmits outreach. It drafts,
saves, and advises. The user sends.

## Invocation

- `/jfm:followup {company}` — single-role mode on a role in `stage: applied`.
- Natural language: "draft outreach for {Company}", "help me follow up on {Company}", "write a follow-up note for the {Company} role".
- Can also be triggered from Mode 1's footer offer. When triggered this way, the mode already has the role loaded — don't re-run the context reads.

## Resolve the role

Find the matching role via `find --company`. If multiple applied roles match, ask which one. If nothing matches in the applied stage, say so in one line and stop:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js find --company "Acme Corp"
```

> No applied role at **Acme Corp** right now. Run `/jfm:followup` for a full briefing or `/jfm:update` to log an application.

Once the role is identified, load full context:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js get --id <id>
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js paths --id <id>
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js get-profile
```

From `paths --id <id>` you get the canonical `role_dir`, `company_dir`, and existence flags for the artifacts on disk.

## Load on-file context silently

Read whichever of these exist, and use them to pre-fill what you'd otherwise have to ask the user. Don't quote them wholesale — just mine them for signal:

- `{role_dir}/jd.md` — job description. Source of requirement specifics and any mission-alignment lines.
- `{role_dir}/cover-letter.md` — the strongest-alignment narrative the user already committed to. If this has a clear one-line hook, use it verbatim; don't ask the user to re-invent one.
- `{company_dir}/overview.md` — company mission, product, and market context. Source for avoiding generic platitudes.
- `{role_dir}/outreach.md` — prior drafts, if this isn't the first run for the role.

The profile's `follow_up_cadence` (already loaded via `get-profile`) informs the target send window suggestion later in this flow.

## Prior-draft detection

If `{role_dir}/outreach.md` already exists, read it and show a one-line summary before doing anything else:

> Found prior drafts in `{role_dir}/outreach.md` from {date}. Want me to regenerate from scratch (overwrite) or add a new dated section below the existing content?

Default to regenerate-and-overwrite on yes. "Add dated section" is the lower-stakes option for iterative tuning.

## Present a context card

Before asking any questions, show the user what you already know. Keep it tight:

> **{Company}** — {Role} · applied {N} days ago · cadence band: *{band name}*
>
> On file:
> - Cover letter: {yes — one-line hook from the letter / no}
> - JD: {yes — short summary of the top 2-3 requirements / no}
> - Company overview: {yes — one-line on mission/product / no}
> - Warm contact mentioned in notes: {yes — name / no}
> - Prior follow-up activity: {summary from notes / none logged}

This tells the user what the drafts will be grounded in and lets them correct anything stale before the questions start.

## Validating conversation — up to three questions, one at a time

Ask only what isn't already clear from the context card. The ceiling is three questions total. The floor is zero — if the on-file context fully covers the template slots, skip straight to drafting and say so:

> I have enough from your cover letter and the JD. Drafting now.

When you do ask, ask one question at a time. Four question templates, with skip rules:

1. **Strongest-alignment one-liner.** Skip if the cover letter already has a clear one-line hook.
2. **The honest gap.** Skip if the assessment flagged one clearly.
3. **Warm path.** Always ask.
4. **Mission-specific take.** Only ask if the JD has a mission-alignment line.

If the user says "just use what you have" at any point, stop asking and draft based on what's on file.

## Template shape (enforced)

Each of the three variants must:

- **Lead** with the application fact plus a one-sentence strongest alignment. Never "I hope this finds you well."
- **Include one concrete comparison** from the user's background — specific, not a list of adjectives.
- **Name the honest gap** — stated before the reader has to infer it.
- **Close with a 15-minute ask** — specific beats polite.
- **Stay at ~130 words** (±20). Short is a feature.
- **Avoid mission platitudes.**

## Three variants

**1. Cold hiring manager.** Direct application + ask.
**2. Warm intro ask.** Addressed to a mutual connection, includes a forwardable blurb.
**3. Recruiter / TA ping.** Lighter, process-focused.

## Save to `{role_dir}/outreach.md`

Write all three variants. See `outreach-example.md` for the full file shape.

## Present the file inline

After writing, use `present_files` to surface `{role_dir}/outreach.md` inline. Summarize in one paragraph which variant to try first and why.

## Advisory close — every run

> **Saved to `{role_dir}/outreach.md`.** I draft and save — I don't send, schedule, or transmit. You copy the one you want, adjust anything that doesn't sound like you, and send it yourself.

The boundary is hard: no browser automation, no email integration, no LinkedIn access.
