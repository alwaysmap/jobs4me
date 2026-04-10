# Jobs For Me

An AI-powered job search agent that runs on your Claude Pro or Max subscription. It learns what roles you'd actually take, finds them, assesses fit, and prepares you for interviews.

## What It Does

- **Searches for jobs on your behalf** — runs web searches across job boards and company career pages based on your target roles
- **Assesses fit** — scores each role against your background with a structured recommendation (Strong / Moderate / Stretch / Pass)
- **Learns from your decisions** — every decline updates the filter so the same kind of bad suggestion doesn't come back
- **Prepares you for interviews** — generates company overviews and interview prep docs with your experience mapped to the role's requirements
- **Tracks everything** — kanban board with your applications across stages (Suggested → Possible → Applied → Interviewing → Closed)

## Quick Start

1. Upload `jfm.zip` through the Cowork plugin settings (Customize → Personal plugins → +)
2. Start a new Cowork session and select a folder for your job search data
3. Type `/setup` and follow the guided conversation

That's it. No dependencies to install, no API keys to configure — the plugin runs entirely on your Claude subscription inside Cowork's VM.

Setup gives you two options: a **full setup** (~10 minutes) that walks through your background, preferences, role types, target companies, and search sources, or a **quick start** (~3 minutes) where you just share your resume and describe the roles you want. Either way, everything is adjustable later with `/tweak`.

After setup, the first `/search` run takes around **20 minutes** — it's checking all your sources, assessing each role, and building your initial board. Future searches are faster because the agent already knows what to skip.

## Commands

| Command | What It Does |
|---------|-------------|
| `/setup` | Guided onboarding — profile, role types, sources, and first search |
| `/search` | Run a search sweep right now |
| `/assess <url>` | Assess a specific job posting against your profile |
| `/update <company> - <status>` | Move a role through stages — interested, applied, interviewing, decline, etc. |
| `/followup` | Recommend next actions for your Applied roles, or draft outreach for a specific one |
| `/prep <company>` | Generate interview prep for a company |
| `/board` | Regenerate and view your kanban board |
| `/tweak` | Adjust anything — companies, sources, role types, evidence, preferences |

Everything is adjustable after setup. Missed something? Run `/setup` again — it detects your existing config and helps you complete or adjust it (same as `/tweak`). Found a job posting on your own? Use `/assess` with the URL.

## Automate It

Set up a scheduled task so the agent searches for you automatically:

1. Open the scheduled tasks menu (clock icon in the sidebar)
2. Create a new task, name it something like "daily-search"
3. Pick Jobsbyme → `/search` as the command
4. Set your frequency — daily or twice a day works well

New roles show up on your board without you lifting a finger. Review them when it's convenient, decline the bad ones, and the agent learns from every decision.

## Your Data

All your data lives as plain files in your selected folder:

- `profile.yaml` — your background and preferences
- `archetypes.yaml` — the types of roles you're targeting
- `filters.yaml` — company include/exclude lists and decline patterns
- `tracker.yaml` — all applications and their state
- `Kanban/index.html` — kanban board (open in your browser, or serve with `tailscale serve`)
- `briefs/` — search summaries
- `active/` — saved job descriptions for active roles

You can read and edit any of these files directly. They're plain YAML and markdown.

**Back up your data** by keeping your job search folder in a synced location — Google Drive, Dropbox, or iCloud. Everything is plain files, so standard sync just works.

## Requirements

- Claude Desktop with Cowork mode (Pro or Max subscription)

## How It Works

The plugin teaches Claude how to be a job search agent through skills (domain knowledge) and commands (actions). When you run `/search`, Claude reads your profile, role types, and filters, searches the web for matching roles, assesses each one against your background, and adds the good ones to your tracker.

Every time you decline a role with a reason, Claude checks if the reason represents a pattern and updates your filters. Over time, the agent gets better at predicting what you want.

The kanban board is a self-contained HTML file generated from your tracker data. Open `Kanban/index.html` in any browser or serve the `Kanban/` directory with `tailscale serve` to see your current pipeline. The board includes links to saved JDs, company overviews, and interview prep docs when they exist.

All mutations go through the same safe YAML handler with automatic backups and validation, so your data stays clean.
