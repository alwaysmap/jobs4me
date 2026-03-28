---
name: review
description: >
  Use this skill when the user wants to review, triage, or walk through their
  tracked roles in batch. Triggers on "review my board", "triage", "walk me through",
  "what needs attention", "review suggestions", "catch me up", "what's new",
  or any request to process multiple roles in one sitting. Also use when the user
  says "/review" with no arguments. Supports stage filters like "/review suggested"
  or "/review interviewing". This is the conversational alternative to running
  /update one role at a time — decisions trigger background work (company research,
  interview prep) via sub-agents while the triage continues.
user_summary: >
  Walk through your tracked roles together — triage new suggestions, advance
  promising ones, and decline the rest. Handles multiple roles in one sitting.
---

# Review / Triage Session

**Shell setup:** before running tracker commands, `export JFM_DIR='<workspace path>'` (single quotes). Then omit `--dir` from commands. See `search/references/data-safety.md`.

Walk the user through their tracked roles one at a time, grouped by what needs attention. This is a conversational triage — present a role, get a quick decision, apply it, kick off background work, move on.

## Arguments

`/review` accepts an optional stage filter:

| Input | What gets queued |
|---|---|
| `/review` | Everything that needs attention (default priority order) |
| `/review all` | Same as no argument |
| `/review suggested` | Only new suggestions |
| `/review maybe` | Only roles marked as interesting |
| `/review applied` | Only roles in applied stage |
| `/review interviewing` | Only roles in interview stage |
| `/review stale` | Maybes >7 days + applied >14 days (things going cold) |

The user can also use natural language: "review what's new", "triage my suggestions", "what needs attention in applied".

## Start a Review Session

1. Read `tracker.yaml`, `profile.yaml`, and `filters.yaml`
2. Build the review queue based on the filter (or full priority order if no filter)
3. Tell the user what's in the queue:

> **{N} roles to review**{stage filter note, e.g., " (suggested only)"} — let's walk through them.
>
> For each one I'll show you the summary. You can say:
> - **yes** / **interested** — move to Maybe
> - **apply** — mark as Applied
> - **advance** — move to the next stage (Maybe→Applied, Applied→Interviewing)
> - **skip** — leave it, come back later
> - **decline {reason}** — pass on it
> - **tell me more** — I'll pull up the full JD and assessment
>
> Ready?

Wait for confirmation, then start presenting roles.

## Priority Order (when no stage filter)

Present roles in this order — most actionable first:

1. **New suggestions** (`stage: suggested`, sorted newest first) — fresh from search sweeps, need a yes/no
2. **Stale maybes** (`stage: maybe`, `last_updated` older than 7 days) — user said "interested" but hasn't acted
3. **Stale applied** (`stage: applied`, `last_updated` older than 14 days) — may need follow-up or might be ghosted
4. **Active interviewing** (`stage: interviewing`) — quick status check: "Still active?"

Skip stages that have zero roles. If the queue is empty:

> Nothing needs attention right now. Your board is clean.

When a stage filter is used, show **all** roles in that stage (not just stale ones), sorted newest first.

## Presenting a Role

For each role, show a compact card:

> **{Company}** — {Role Title}
> {archetype tag} · identified {date}
> {First 2-3 lines of agent_summary, focusing on the Recommendation line}
>
> [Job posting]({url})

Keep it tight — the user should be able to make a snap decision from this. Don't dump the full assessment unless they ask.

**For stale maybes**, add a nudge:

> You marked this as interesting **{N} days ago**. Ready to apply, or should we let it go?

**For stale applied**, add context:

> You applied **{N} days ago**. Any movement on this, or should we mark it closed?

**For interviewing roles**, prompt for status:

> You're interviewing here. Any updates — next round scheduled, offer, rejection? Or still waiting?

## Processing Decisions

After each decision:

1. Apply the change via tracker.js **without** `--rebuild-board` during the review session — the board will be rebuilt once at the end
2. If declining, extract the reason and consider whether it should become a decline pattern (see `search/references/decline-learning.md`). Add one if the reason is generalizable and meaningfully different from existing patterns.
3. **If the decision triggers background work, launch it as a sub-agent** (see Background Work below)
4. Acknowledge briefly — one line max — then immediately present the next role

### Batch shortcuts

When the user says **"decline all remaining suggestions"** or **"skip the rest"**, use `batch-decline` for all affected IDs in one call:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js batch-decline --ids id1,id2,id3 --reason "reason" --dir . --rebuild-board
```

For mixed operations (e.g., "advance these three, decline the rest"), use the `batch` command:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js batch --dir . --rebuild-board --json '[{"op":"stage","id":"acme-vp-eng","stage":"maybe"},{"op":"decline","id":"bigco-tpm","reason":"too enterprise"}]'
```

These write `tracker.yaml` exactly once and rebuild the board exactly once, regardless of how many roles are changed.

**Good flow:**
> **Acme Corp** — VP Engineering
> TPM Leadership · identified Mar 20
> **Strong** — deep match on technical program leadership, Copilot-scale experience maps directly
> [Job posting](https://...)

User: "yes"

> Got it — moved to Maybe. **Next:**
>
> **BigCo** — Director of Programs
> ...

User: "advance" (on a role currently in Applied)

> Moved to Interviewing. Kicking off company research and interview prep in the background — I'll have docs ready by the time we're done here. **Next:**
>
> **StartupX** — Head of Engineering
> ...

**Bad flow** (don't do this):
> Great choice! Acme Corp looks like a really strong fit for you. I've moved it to Maybe. The role aligns well with your background in... [3 paragraphs of encouragement]

Keep the momentum. The whole point is speed.

## Background Work via Sub-Agents

When a decision implies follow-up work, launch it as a sub-agent so the review session keeps moving. The user should never have to wait for research to finish before seeing the next card.

| Decision | Background work |
|---|---|
| **Any stage change** and no Company Overview exists | Launch sub-agent: generate Company Overview to `{company_dir}/overview.md` (see prep skill's "Company Overview" section). Check with `tracker.js needs-research`. One overview per company, shared across roles. |
| Move to **Interviewing** | Launch sub-agent: generate Interview Prep docs (prep skill). Company Overview will already exist from the step above. |
| Move to **Maybe** and JD not yet saved | Launch sub-agent: fetch the job posting URL, save JD to `{role_dir}/jd.md` (use `tracker.js paths` to get the path) |
| User says **"tell me more"** and no Company Overview exists | Launch sub-agent: quick company research (just the overview, not full interview prep) |

### How to launch background work

Use the Agent tool to spawn a sub-agent for each background task. Give it a clear, self-contained prompt with everything it needs — the skill to use, the company name, the workspace path, the file paths. The sub-agent should write its output files directly to the workspace.

**Example — launching interview prep in background:**
> Spawn a sub-agent with prompt:
> "Read the prep skill at {skill path}. Generate Company Overview and Interview Prep documents for {Company} — {Role}. The JD is at {jd path}. Profile is at {profile path}. Write outputs to {workspace path}. Update tracker.yaml to stage: interviewing for this role."

Don't wait for the sub-agent to finish. Acknowledge the launch and move to the next card:

> Moved to Interviewing. Research docs generating in the background. **Next:**

### When background work finishes

If a sub-agent finishes while the review is still going, **don't interrupt the flow**. Note the completion silently and include it in the end-of-review summary.

If the review is already over by the time it finishes, mention it:

> Your interview prep for Acme Corp is ready — `Acme Corp - Company Overview.md` and `Acme Corp - Interview Prep.md` are in your folder.

## "Tell me more"

If the user says "tell me more" or "details" or "expand":

1. Show the full `agent_summary`
2. If there's a saved JD in `active/`, mention it
3. If no Company Overview exists yet, launch one in the background
4. After they've read it, re-prompt for a decision:

> What's the call — interested, decline, or skip for now?

## Batch Shortcuts

The user might want to speed through even faster:

- **"decline all remaining suggestions"** — ask for a blanket reason, apply to all remaining suggested roles, run decline learning once for the batch
- **"skip the rest"** — end the review session, leave remaining roles untouched
- **"only suggestions"** — switch filter mid-session to just new suggestions
- **"advance all maybes"** — move all Maybe roles to Applied (for when the user has submitted a batch of applications)

## End of Review

After the last role (or when the user says "done" / "that's enough"):

1. Summarize what happened:

> **Review complete.** {N} roles reviewed:
> - {X} moved to Maybe
> - {Y} advanced (Applied / Interviewing)
> - {Z} declined
> - {W} skipped
>
> {If any decline patterns were added:} Updated filters: added "{pattern}" to decline patterns.
>
> {If background work was launched:}
> **Background work:**
> - Acme Corp — interview prep docs ✓ ready
> - BigCo — company overview ✓ ready
> - StartupX — interview prep ⏳ still generating

2. **Rebuild the board once** at the end of the review session:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js build-board --dir .
   ```
   Individual mutations during the session skip `--rebuild-board` to avoid N redundant rebuilds. This single final rebuild picks up all changes.

3. If there are roles in Maybe that have been there a while, offer a gentle nudge:

> You've got {N} roles sitting in Maybe. Want to do a quick `/review maybe` to advance or prune them?

## Tone

Brisk and efficient. This is a working session, not a conversation. Minimal commentary between roles. The user came here to make decisions fast — respect that by keeping the signal-to-noise ratio high.

One role at a time. One decision at a time. No batching questions.
