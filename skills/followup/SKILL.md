---
name: followup
description: >
  Use this skill when the user wants a briefing on which Applied roles need
  attention next, or when they want help drafting outreach for a specific role.
  Triggers on "what should I do next", "recommend follow-ups", "triage my applied
  roles", "should I follow up yet", "is it too soon to ping", "draft outreach
  for {company}", or "help me follow up on {company}". Also handles the
  `/jfm:followup` command. Has two modes: with no arguments, produces a briefing
  across all Applied roles; with a company name, runs a short validating
  conversation and drafts templated outreach notes saved to that role's directory.
user_summary: >
  Get a timing-aware briefing on your Applied roles with a specific next action
  for each one, or — with a company name — draft short, non-platitudinous
  outreach notes in three variants (cold, warm intro, recruiter) saved alongside
  your cover letter.
---

# Follow Up on Applied Roles

**Shell setup:** Always `export JFM_DIR='<workspace path>'` (single quotes) before running tracker commands. The script refuses to operate if it can't resolve a real workspace.

**Read `search/references/routing.md` before processing any user message** — it defines how to decompose compound messages and where to route each type of input.

This skill has two modes that share context and tone but serve different jobs:

- **Mode 1 — Briefing.** Invoked as `/jfm:followup` with no args. Produces a timing-aware briefing of every role in the `applied` stage: what to do next on each one, why, and which actions cluster together this week.
- **Mode 2 — Single-role outreach drafting.** Invoked as `/jfm:followup {company}`. Runs a short validating conversation about one role, then drafts three templated outreach variants (cold hiring manager, warm intro ask, recruiter ping) and saves them to the role's directory alongside the cover letter.

Mode 2 is documented in the "Mode 2 — Single-role outreach drafting" section later in this file. The rest of this file covers Mode 1 and the shared constraints that apply to both.

## Hard constraint: data access goes through tracker.js

**Every tracker / profile / filters read and write goes through `scripts/tracker.js`.** The skill never parses `tracker.yaml`, `profile.yaml`, or `filters.yaml` directly — not even for reads. This keeps backups, validation, board rebuilds, and schema consistency centralized in one script.

Reading generated markdown documents from the role directory (`jd.md`, `cover-letter.md`, `overview.md`, `outreach.md`) is fine — those are generated artifacts, not schema state.

If a mutation you need has no matching tracker.js command, stop and flag it — don't write yaml from this skill.

## Mode 1 — Briefing

### Invocation

- `/jfm:followup` with no arguments — briefing across all roles in `stage: applied`.
- Natural language: "what should I do next?", "triage my applied roles", "should I follow up on anything?", "what's going stale?"

### Read state

Always read via tracker.js — never parse yaml directly:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js list
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js get-profile
```

From `list`, filter to `stage: "applied"`. From `get-profile`, read the optional `follow_up_cadence` block.

If there are zero roles in `applied`, say so in one line and stop:

> No roles in the applied stage right now — nothing to follow up on. Run `/jfm:review` if you have suggestions waiting.

### Timing framework (defaults)

The skill ships with sensible defaults tuned for Director+/Principal-TPM roles. These define the day-bands that drive recommendations:

| Phase | Days since applied | Default action |
|---|---|---|
| Normal silence | 1–14 | Wait. No action needed. |
| Warm-contact window | 15–21 | Activate warm contacts quietly if any exist. |
| First follow-up | 21–30 | Short, no-pressure recruiter or hiring-manager note. |
| Final follow-up | 30–45 | Last polite re-assertion of interest. |
| Consider closed | 45+ | Move to closed unless there's a direct signal of life. |

These are band boundaries, not single numbers. Senior/Director roles trend slower than IC — 30–60 day cycles from application to first screen are normal, and summer/holiday lulls stretch that further.

### User-tunable cadence

The user can override any individual threshold via an optional `follow_up_cadence` block in `profile.yaml`:

```yaml
follow_up_cadence:
  normal_silence_days: 14
  warm_contact_days: 15
  first_followup_days: 21
  final_followup_days: 30
  consider_closed_days: 45
```

If the block is absent, defaults apply. If some keys are present and others are missing, missing keys fall back to defaults individually.

**How the user tunes it without reading any docs:** If they push back on a threshold during a run ("21 days is too long for my market, I'd ping at 10"), offer to save the change in one turn:

> Got it. Want me to save `first_followup_days: 10` as your default? Future runs will use it.

On yes, persist via `tracker.js set-profile` — the existing shallow-merge semantics handle nested blocks without clobbering siblings:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js set-profile --json '{"follow_up_cadence":{"first_followup_days":10}}'
```

Same learning loop as decline patterns in the review skill. Users never have to read a config schema.

### Computing days-since-applied

Use `app.dates.applied` as the source of truth — it's set when the role enters the applied stage and never resets on subsequent edits.

Fallback order if the preferred field is missing:

1. `app.dates.applied` (preferred — set when the stage transitions to applied)
2. `app.dates.identified` (when the role was first added to the tracker)
3. `app.last_updated` (last touched — approximate)

If the skill had to fall back to `dates.identified` or `last_updated` for a row, note it in the "why" column so the user knows the day count is approximate for that role.

**Do not use `last_updated` as the primary source.** It's rewritten on every edit, including note appends — which would corrupt the clock for any role whose notes have been touched.

### Briefing output format

Every Mode 1 run produces the same four sections, in order:

**1. Timing framework section.** A short prose paragraph explaining the day-bands in use, followed by one line stating whether defaults or overrides are in effect. If any key is overridden from `follow_up_cadence`, call out which one. End with a one-sentence nudge that the user can push back to tune it.

**2. Per-role table.** One row per Applied role. Columns:

| # | Company — Role | Days | Recommendation | Why |
|---|---|---|---|---|

- `#` — row number, newest first.
- `Company — Role` — compact label.
- `Days` — days since applied (integer).
- `Recommendation` — one of: *wait*, *activate warm contact*, *send first follow-up*, *send final follow-up*, *consider closed*, or a role-specific overlay like *verify comp range first* or *activate referral now*.
- `Why` — 1–3 sentences citing concrete evidence: prior follow-up history from notes, warm-contact mentions, assessment concerns (comp, fit), reposted-posting signals. Never generic filler. If notes are empty, say "notes empty — base recommendation only".

**3. Summary by action.** Three buckets to make the list scannable:

> **Send a message this week:** {list}
> **Decision point in ~1 week:** {list with deadline dates}
> **Pure wait:** {list with first-action target dates}

**4. Footer with opt-in durable actions.** Offer specific write actions the user can accept one at a time. Never batch these — each needs its own confirmation:

> Want me to:
> - Close **{Company}** now? (moves to closed)
> - Stamp follow-up dates into notes so they're hidden from the `/jfm:review` stale view until the date arrives?
> - Draft outreach for **{Company}** right now? (drops into the single-role drafting mode)
> - Save that timing tweak to your profile?

See `references/example-output.md` for the full target briefing shape on a synthetic 6-role board.

### Recommendation selection

Recommendation selection is a two-stage function inside the skill prompt, not code.

**Stage 1 — base recommendation from the cadence bands:**

| Days since applied | Base recommendation |
|---|---|
| `< normal_silence_days` (default 14) | Wait |
| `< warm_contact_days` (default 15) | Wait (warm-contact prompt if any exists) |
| `< first_followup_days` (default 21) | Activate warm contact if any; otherwise wait |
| `< final_followup_days` (default 30) | Send first follow-up |
| `< consider_closed_days` (default 45) | Send final follow-up |
| `>= consider_closed_days` | Consider closed |

**Stage 2 — overlay signals from the role record.** Read `notes`, `agent_summary`, and `decision.reason` for signals that upgrade, downgrade, or replace the base recommendation:

| Signal in notes / summary | Overlay |
|---|---|
| Prior follow-up with no response after 8+ days | Shift to *send final follow-up* or *consider closed* |
| Warm contact or referral mentioned | Prioritize *activate warm contact* / *activate referral now* |
| Assessment flagged comp below floor | *verify comp range first* — don't spend more energy until resolved |
| Posting flagged as reposted | Negative signal — push toward *consider closed* |
| Mission-alignment JD line noted | Add "find a warm path" emphasis in the Why column |
| Empty notes | Use base recommendation unchanged; note "notes empty" in Why |

Apply overlays in order; the last one wins when multiple apply.

### Footer actions — tracker.js commands

Every confirmed footer action executes exactly one tracker.js command. Never run these without an explicit user yes.

**Close a role:**

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js stage --id <id> --stage closed
```

`applied → closed` is a valid transition. The board auto-rebuilds.

**Stamp a follow-up date into notes.** Read existing notes first, then append a dated line. The format is fixed — greppable for future stale-detection:

```bash
# 1. Read existing notes
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js get --id <id>

# 2. Append a new dated line, preserving the existing notes:
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js update --id <id> --json '{"notes":"<existing notes>\n2026-04-20: follow_up_due — send first ping to recruiter"}'
```

Canonical format: `YYYY-MM-DD: follow_up_due — <one-line reason>`. Always preserve existing notes — never overwrite them.

**Note on interaction with the review skill's stale view:** Stamping a follow-up date resets `last_updated` to today, which drops the role out of the stale detection. This is intentional — after the user has committed to a follow-up date, the role should stop surfacing as "stale" until the stamped date approaches. Flag this briefly after the first stamp in a session.

**Save a cadence override:**

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js set-profile --json '{"follow_up_cadence":{"first_followup_days":10}}'
```

`set-profile` merges one level deep for nested objects, so this doesn't clobber other `follow_up_cadence` keys.

**Draft outreach for a specific role.** Hand off to Mode 2 with the role context already loaded from this pass. The user shouldn't have to re-walk the validation conversation for anything the briefing already surfaced.

## Mode 2 — Single-role outreach drafting

When the user names a specific company, the skill shifts from briefing to drafting. The job is to produce three templated outreach variants for that one role, saved to a file in the role's directory alongside the existing cover letter.

This mode never sends, schedules, or transmits outreach. It drafts, saves, and advises. The user sends.

### Invocation

- `/jfm:followup {company}` — single-role mode on a role in `stage: applied`.
- Natural language: "draft outreach for Affirm", "help me follow up on Zillow", "write a follow-up note for the ActBlue role".
- Can also be triggered from Mode 1's footer offer. When triggered this way, the mode already has the role loaded — don't re-run the context reads.

### Resolve the role

Find the matching role via `find --company`. If multiple applied roles match, ask which one. If nothing matches in the applied stage, say so in one line and stop:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js find --company "Affirm"
```

> No applied role at **Affirm** right now. Run `/jfm:followup` for a full briefing or `/jfm:update` to log an application.

Once the role is identified, load full context:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js get --id <id>
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js paths --id <id>
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js get-profile
```

From `paths --id <id>` you get the canonical `role_dir`, `company_dir`, and existence flags for the artifacts on disk.

### Load on-file context silently

Read whichever of these exist, and use them to pre-fill what you'd otherwise have to ask the user. Don't quote them wholesale — just mine them for signal:

- `{role_dir}/jd.md` — job description. Source of requirement specifics and any mission-alignment lines.
- `{role_dir}/cover-letter.md` — the strongest-alignment narrative the user already committed to. If this has a clear one-line hook, use it verbatim; don't ask the user to re-invent one.
- `{company_dir}/overview.md` — company mission, product, and market context. Source for avoiding generic platitudes.
- `{role_dir}/outreach.md` — prior drafts, if this isn't the first run for the role.

The profile's `follow_up_cadence` (already loaded via `get-profile`) informs the target send window suggestion later in this flow.

### Prior-draft detection

If `{role_dir}/outreach.md` already exists, read it and show a one-line summary before doing anything else:

> Found prior drafts in `{role_dir}/outreach.md` from {date}. Want me to regenerate from scratch (overwrite) or add a new dated section below the existing content?

Default to regenerate-and-overwrite on yes. "Add dated section" is the lower-stakes option for iterative tuning.

### Present a context card

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

### Validating conversation — up to three questions, one at a time

Ask only what isn't already clear from the context card. The ceiling is three questions total. The floor is zero — if the on-file context fully covers the template slots, skip straight to drafting and say so:

> I have enough from your cover letter and the JD. Drafting now.

When you do ask, ask one question at a time. Four question templates, with skip rules:

1. **Strongest-alignment one-liner.** Skip if the cover letter already has a clear one-line hook.
2. **The honest gap.** Skip if the assessment flagged one clearly.
3. **Warm path.** Always ask.
4. **Mission-specific take.** Only ask if the JD has a mission-alignment line.

If the user says "just use what you have" at any point, stop asking and draft based on what's on file.

### Template shape (enforced)

Each of the three variants must:

- **Lead** with the application fact plus a one-sentence strongest alignment. Never "I hope this finds you well."
- **Include one concrete comparison** from the user's background — specific, not a list of adjectives.
- **Name the honest gap** — stated before the reader has to infer it.
- **Close with a 15-minute ask** — specific beats polite.
- **Stay at ~130 words** (±20). Short is a feature.
- **Avoid mission platitudes.**

### Three variants

**1. Cold hiring manager.** Direct application + ask.
**2. Warm intro ask.** Addressed to a mutual connection, includes a forwardable blurb.
**3. Recruiter / TA ping.** Lighter, process-focused.

### Save to `{role_dir}/outreach.md`

Write all three variants. See `references/outreach-example.md` for the full file shape.

### Present the file inline

After writing, use `present_files` to surface `{role_dir}/outreach.md` inline. Summarize in one paragraph which variant to try first and why.

### Advisory close — every run

> **Saved to `{role_dir}/outreach.md`.** I draft and save — I don't send, schedule, or transmit. You copy the one you want, adjust anything that doesn't sound like you, and send it yourself.

The boundary is hard: no browser automation, no email integration, no LinkedIn access.

## Tone

Analytical, evidence-backed, brisk. No filler, no encouragement, no cheerleading.

## Compound requests during a run

Handle the pipeline action first, then address each secondary intent separately. See `search/references/routing.md` for the full routing decision tree.
