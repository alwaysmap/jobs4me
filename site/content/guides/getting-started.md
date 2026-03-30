---
title: Getting Started
summary: Set up your profile, run your first search, and start reviewing roles.
weight: 2
---

## Setup

Type `/setup` in your Cowork session. You'll be offered two paths:

- **Full setup** (~10 minutes) — a conversational interview covering your background, preferences, role types, target companies, and search sources
- **Quick start** (~3 minutes) — just share your resume and describe the kinds of roles you want

Either way, the agent will show you where you are at every step ("Step 2 of 5: Career evidence") and everything is adjustable later with `/tweak`.

### What gets created

| File | What it is |
|------|-----------|
| `profile.yaml` | Your background, evidence, and preferences |
| `archetypes.yaml` | The types of roles you're targeting |
| `filters.yaml` | Sources, target companies, skip list |

## First search

After setup, the agent offers to run your first search. Say yes.

**This first search takes about 20 minutes.** It's checking all your sources, fetching job postings, and assessing each one against your profile. Future searches are much faster because the agent already knows what to skip.

You'll see progress updates as it goes:

- "Searching LinkedIn... found 12 candidates"
- "Filtered to 9. Fetching postings..."
- "Strong match: VP Engineering at Acme Corp"

## First review

After the search, the agent offers to walk you through the results. This first review is a **calibration session** — your reactions teach the agent what you actually want.

For each role, you can say:

| Response | What happens |
|----------|-------------|
| **yes** / **interested** | Moves to Maybe |
| **decline [reason]** | Declined — reason teaches the filter |
| **skip** | Leave it for later |
| **tell me more** | Show the full assessment |

Be honest about why you like or dislike each one. "Too enterprise-y" or "not enough scope" are exactly the kind of feedback that makes future searches better.

## Viewing your board

After any search or review, your kanban board is updated at `Kanban/index.html`. Open it in your browser to see your full pipeline.

![Kanban board showing Suggested and Maybe columns with role cards](/images/board-overview.png)

Click any card to see the full assessment — recommendation, gaps, positive fit, and links to the job posting and research docs.

![Detail popup showing a role assessment with Strong recommendation](/images/board-detail.png)

Click "Company overview" or "Interview prep" to read the research docs in a slide-out panel.

![Company overview document in the slide-out viewer](/images/board-doc-viewer.png)

The board auto-rebuilds every time something changes. Just refresh.
