# Jobs For Me

An AI-powered job search agent that runs on your paid Claude plan. It learns what roles you'd actually take, finds them, assesses fit, and prepares you for interviews.

## What It Does

- **Searches for jobs on your behalf** — runs web searches across job boards and company career pages based on your target roles
- **Assesses fit** — scores each role against your background with a structured recommendation (Strong / Moderate / Stretch / Pass)
- **Learns from your decisions** — every decline updates the filter so the same kind of bad suggestion doesn't come back
- **Prepares you for interviews** — generates company overviews and interview prep docs with your experience mapped to the role's requirements
- **Tracks everything** — kanban board with your applications across stages (Suggested → Possible → Applied → Interviewing → Closed)

## Quick Start

1. In the Claude app sidebar, open **Customize → Plugins → Add marketplace** and enter `alwaysmap/alwaysmap-marketplace`
2. Find **Jobs for Me** in the listing and click **Install**
3. In the message box, select **Cowork**, then start a task and pick a folder for your job search data
4. Type `/jfm:setup` — or just say "set up my job search" — and follow the guided conversation

That's it. No dependencies to install, no API keys to configure — the plugin runs entirely on your Claude subscription inside Cowork's VM.

> **Plugins run in Cowork, not Chat.** If you don't see the `/jfm:` commands, check that Cowork is selected in the message box.

Setup gives you two options: a **full setup** (~10 minutes) that walks through your background, preferences, role types, target companies, and search sources, or a **quick start** (~3 minutes) where you just share your resume and describe the roles you want. Either way, everything is adjustable later with `/jfm:tweak`.

After setup, the first `/jfm:search` run takes around **20 minutes** — it's checking all your sources, assessing each role, and building your initial board. Future searches are faster because the agent already knows what to skip.

## Commands

There are two ways to invoke everything, and they do the same thing:

- **Just say what you want** — "decline this role", "what should I do next?", "find me new roles" — and the matching skill fires automatically.
- **Use a `/jfm:` slash command** — every command below is namespaced under the `jfm` plugin. This is the explicit shortcut when you already know which one you want.

| Command | What It Does |
|---------|-------------|
| `/jfm:setup` | Guided onboarding — profile, role types, sources, and first search |
| `/jfm:search` | Run a search sweep right now |
| `/jfm:assess <url>` | Assess a specific job posting against your profile |
| `/jfm:update <company> - <status>` | Move a role through stages — interested, applied, interviewing, decline, etc. |
| `/jfm:followup` | Recommend next actions for your Applied roles, or draft outreach for a specific one |
| `/jfm:prep <company>` | Generate interview prep for a company |
| `/jfm:board` | Regenerate and view your kanban board |
| `/jfm:tweak` | Adjust anything — companies, sources, role types, evidence, preferences |

Everything is adjustable after setup. Missed something? Run `/jfm:setup` again — it detects your existing config and helps you complete or adjust it (same as `/jfm:tweak`). Found a job posting on your own? Use `/jfm:assess` with the URL.

## Automate It

Set up a scheduled task so the agent searches for you automatically:

1. Click **Scheduled** in the Claude app sidebar, then **New task**
2. Choose **Create with Claude** and describe what you want ("run my job search every morning") — Claude asks a few multiple-choice questions and sets it up
3. Or choose **Set up manually** and fill in the task name, the prompt (`/jfm:search`), approval mode, and frequency — daily or weekdays works well

New roles show up on your board without you lifting a finger. Review them when it's convenient, decline the bad ones, and the agent learns from every decision.

> **Scheduled searches need your machine.** Cowork scheduled tasks normally run remotely, but a task that needs local files or apps only runs locally — and Jobs for Me keeps its data in a local folder and drives your browser to verify postings. Keep the desktop app open, with Chrome available, at the scheduled time. Cowork's scheduled tasks also can't be pinned to a folder on your computer, so confirm the task picks up your job search folder before relying on it.

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

- **A paid Claude plan** — Pro, Max, Team, or Enterprise
- **The Claude desktop app** (macOS or Windows). Cowork also runs on web and mobile, but Jobs for Me needs local file access and your browser, so the desktop app is the practical requirement.
- **Cowork, not Chat.** Plugins are available in Cowork and Claude Code; they aren't used in Chat. Chat and Cowork now share one app home — Cowork is a mode you select in the message box before describing your task, and you switch back by selecting Chat.

## How It Works

The plugin teaches Claude how to be a job search agent through skills (domain knowledge) and commands (explicit invocation surface). Each `/jfm:*` command runs the matching skill — you can also trigger the same skills with natural language. When you run `/jfm:search`, Claude reads your profile, role types, and filters, searches the web for matching roles, assesses each one against your background, and adds the good ones to your tracker.

Every time you decline a role with a reason, Claude checks if the reason represents a pattern and updates your filters. Over time, the agent gets better at predicting what you want.

The kanban board is a self-contained HTML file generated from your tracker data. Open `Kanban/index.html` in any browser or serve the `Kanban/` directory with `tailscale serve` to see your current pipeline. The board includes links to saved JDs, company overviews, and interview prep docs when they exist.

All mutations go through the same safe YAML handler with automatic backups and validation, so your data stays clean.
