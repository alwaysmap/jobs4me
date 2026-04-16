---
name: review
description: >
  Use this skill when the user wants to review, triage, or walk through their
  tracked roles in batch. Triggers on "review my board", "triage", "walk me through",
  "what needs attention", "review suggestions", "catch me up", or "what's new".
  Also handles the `/jfm:review` command with optional stage filter argument
  ("suggested", "maybe", "applied", "interviewing", "stale", "all"). This is the
  conversational alternative to updating one role at a time — decisions trigger
  background work (company research, interview prep) while the triage continues.
user_summary: >
  Walk through your tracked roles together — triage new suggestions, advance
  promising ones, and decline the rest. Handles multiple roles in one sitting.
---

# Review / Triage Session

**Shell setup:** The tracker script auto-detects the workspace directory. If needed, set `JFM_DIR` environment variable or use `--dir`.

**Read `search/references/routing.md` before processing any user message** — it defines how to decompose compound messages and where to route each type of input.

Walk the user through their tracked roles one at a time, grouped by what needs attention. This is a conversational triage — present a role, get a quick decision, apply it, kick off background work, move on.

## First Review Calibration

Before starting, check if all roles in `tracker.yaml` have `stage: suggested` (no roles in maybe, applied, interviewing, or other non-suggested stages). If so, this is likely the user's first review session. Frame it as calibration:

> "This first review helps me learn what you actually want. For each role, tell me what you think — your reactions help the agent get smarter. Be honest about why you like or dislike each one."

This sets the expectation that their feedback is training data, not just triage.

## Arguments

`/jfm:review` accepts an optional stage filter as its argument:

| Input | What gets queued |
|---|---|
| `/jfm:review` | Everything that needs attention (default priority order) |
| `/jfm:review all` | Same as no argument |
| `/jfm:review suggested` | Only new suggestions |
| `/jfm:review maybe` | Only roles marked as interesting |
| `/jfm:review applied` | Only roles in applied stage |
| `/jfm:review interviewing` | Only roles in interview stage |
| `/jfm:review stale` | Maybes >7 days + applied >14 days (things going cold) |

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
> {role type tag} · identified {date}
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

1. Apply the change via tracker.js — let the board auto-rebuild on each mutation (it takes ~1 second). This way the user can refresh `Kanban/index.html` at any point during the review and see current state.
2. If declining, extract the reason and consider whether it should become a decline pattern (see `search/references/decline-learning.md`). Add one if the reason is generalizable and meaningfully different from existing patterns.
3. **If the decision triggers background work, launch it as a sub-agent** (see Background Work below)
4. Acknowledge briefly — one line max — then immediately present the next role

### Batch shortcuts

When the user says **"decline all remaining suggestions"** or **"skip the rest"**, use `batch-decline` for all affected IDs in one call:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js batch-decline --ids id1,id2,id3 --reason "reason"
```

For mixed operations (e.g., "advance these three, decline the rest"), use the `batch` command:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js batch --json '[{"op":"stage","id":"acme-vp-eng","stage":"maybe"},{"op":"decline","id":"bigco-tpm","reason":"too enterprise"}]'
```

These write `tracker.yaml` once and auto-rebuild the board.

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

> Moved to Interviewing. I'll queue up company research and interview prep — run `/jfm:prep BigCo` when you're ready for a deep dive. **Next:**
>
> **StartupX** — Head of Engineering
> ...

**Bad flow** (don't do this):
> Great choice! Acme Corp looks like a really strong fit for you. I've moved it to Maybe. The role aligns well with your background in... [3 paragraphs of encouragement]

Keep the momentum. The whole point is speed.

## Follow-Up Work

Some decisions trigger follow-up work (company research, interview prep). Design the review flow to **defer heavy work** and keep the triage fast.

| Decision | What to do |
|---|---|
| Move to **Maybe** | Just move the stage. No research needed yet. |
| Move to **Maybe** and JD not yet saved | Fetch the JD and save it (quick — one web fetch). Then continue the review. |
| Move to **Interviewing** | Move the stage, then **after the review session ends**, offer to run `/jfm:prep` for that company. |
| User says **"tell me more"** | Show the full `agent_summary` and any existing overview. If no overview exists, say so. |

The key principle: **the review session is for decisions, not research**. Defer research to `/jfm:prep` or to the end of the session.

### After the review, if companies need research

At the end of the review, check if any newly-advanced companies need overviews:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js needs-research
```

If there are companies needing research, offer to do it. After each overview is written, use `present_files` to share it, then summarize.

If the user moved any role to Interviewing, also offer full interview prep via `/jfm:prep`.

## "Tell me more"

If the user says "tell me more" or "details" or "expand":

1. Show the full `agent_summary`
2. If there's a saved JD, mention it and offer to show key sections
3. If a Company Overview exists, show a 2-3 line summary from it
4. If no Company Overview exists, note it: "No company research yet — I can do that after we finish reviewing, or you can run `/jfm:prep {company}` later."
5. Re-prompt for a decision

## Batch Shortcuts

- **"decline all remaining suggestions"** — ask for a blanket reason, apply to all remaining suggested roles
- **"skip the rest"** — end the review session, leave remaining roles untouched
- **"only suggestions"** — switch filter mid-session
- **"advance all maybes"** — move all Maybe roles to Applied

## End of Review

After the last role (or when the user says "done"):

1. Summarize what happened
2. The board has been auto-rebuilt after each decision throughout the session. Tell the user to refresh `Kanban/index.html`.
3. If there are roles in Maybe that have been there a while, offer a gentle nudge

## Compound requests during review

During a review session, users may mention things beyond simple yes/no/decline decisions. **During the review:** handle quick config changes inline. **After the review summary**, address any deferred items.

See `search/references/routing.md` for the full routing decision tree.

## Tone

Brisk and efficient. This is a working session, not a conversation. Minimal commentary between roles. One role at a time. One decision at a time. No batching questions.
