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

## Files

| File | Loaded when |
|------|-------------|
| `SKILL.md` (this file) | Always |
| `references/timing.md` | Mode 1 — cadence bands, override mechanism, days-since-applied source-of-truth, two-stage recommendation selection, follow-up-date stamping. |
| `references/mode-2-drafting.md` | Mode 2 only — single-role workflow, context-card protocol, validating conversation, template shape, save format. Skip entirely in Mode 1. |
| `references/example-output.md` | Mode 1 — sample briefing on a synthetic 6-role board, for shape reference. |
| `references/outreach-example.md` | Mode 2 — full file shape for `{role_dir}/outreach.md`. |
| `../search/references/routing.md` | First — before processing any user message. |

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

### Compute recommendations

**Read `references/timing.md`** before generating any per-role recommendation. The reference covers the cadence bands (defaults + overrides), the days-since-applied source-of-truth and fallback chain, and the two-stage recommendation function (base from band → overlay from notes/summary/decision signals). Stamping a follow-up date into notes also lives there.

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

### Footer actions — tracker.js commands

Every confirmed footer action executes exactly one tracker.js command. Never run these without an explicit user yes.

**Close a role:**

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js stage --id <id> --stage closed
```

`applied → closed` is a valid transition. The board auto-rebuilds.

**Stamp a follow-up date:** see `references/timing.md` ("Stamping a follow-up date" section) for the exact `update --json` invocation and the canonical `YYYY-MM-DD: follow_up_due — <reason>` format. The reference also covers the interaction with the review skill's stale-view filter.

**Save a cadence override:**

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js set-profile --json '{"follow_up_cadence":{"first_followup_days":10}}'
```

`set-profile` merges one level deep for nested objects, so this doesn't clobber other `follow_up_cadence` keys.

**Draft outreach for a specific role.** Hand off to Mode 2 with the role context already loaded from this pass. The user shouldn't have to re-walk the validation conversation for anything the briefing already surfaced.

## Mode 2 — Single-role outreach drafting

When the user names a specific company (or accepts the Mode 1 footer's draft-outreach offer), shift from briefing to drafting. **Read `references/mode-2-drafting.md`** for the full Mode 2 workflow: role resolution, on-file context loading, prior-draft detection, the context card, the up-to-three validating questions with skip rules, the enforced template shape, the three variants (cold hiring manager / warm intro ask / recruiter ping), the save target, and the advisory close that pins the no-send boundary.

This mode never sends, schedules, or transmits outreach. It drafts, saves, and advises. The user sends.

## Tone

Analytical, evidence-backed, brisk. No filler, no encouragement, no cheerleading.

## Compound requests during a run

Handle the pipeline action first, then address each secondary intent separately. See `search/references/routing.md` for the full routing decision tree.
