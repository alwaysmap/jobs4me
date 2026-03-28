---
name: assess
description: >
  Use this skill when the user wants to assess or evaluate a specific job posting,
  paste a job URL, ask "is this a good fit?", or use /assess. Fetches the posting,
  runs a structured fit assessment against the user's profile, and optionally adds
  it to the tracker. Also use when the user pastes a JD directly and asks for an opinion.
user_summary: >
  Paste a job URL or description and get a fit assessment — what matches your
  background, what gaps exist, and whether it's worth pursuing.
---

# Assess a Job Posting

**Shell setup:** before running tracker commands, `export JFM_DIR='<workspace path>'` (single quotes). Then omit `--dir` from commands. See `search/references/data-safety.md`.

Assess a specific job posting against the user's profile.

## Steps

1. Read `profile.yaml`, `archetypes.yaml`, and `filters.yaml`
2. Fetch the URL provided by the user using WebFetch
3. Extract the job description from the page
4. Run a full fit assessment using the search skill's fit assessment framework
5. Present the assessment to the user (Recommendation, Gaps, Positive Fit)
6. Ask if they want to add it to the tracker — or decline it immediately
7. **If adding**, add via the tracker script (with `--rebuild-board` so the board updates automatically):
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js add --dir . --rebuild-board --json '{"company":"...","role":"...","url":"...","archetype":"...","stage":"suggested","agent_summary":"..."}'
   ```
8. Get the file paths for the new entry and save the JD:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js paths --id <id> --dir .
   ```
   This returns `role_dir` and `company_dir`. Save the JD to `{role_dir}/jd.md`. Create the directories if they don't exist (`mkdir -p`).
9. **If declining** (user says "not interested", "pass", "decline", etc.):
   - If already added to tracker, decline it:
     ```bash
     node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js decline --id <id> --reason "reason text" --dir . --rebuild-board
     ```
   - If not yet added, add it as declined so the reason is tracked:
     ```bash
     node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js add --dir . --rebuild-board --json '{"company":"...","role":"...","url":"...","stage":"declined","decision":{"proceed":"no","reason":"reason text"}}'
     ```
   - **Always run decline pattern learning** (see `search/references/decline-learning.md`):
     check if this decline suggests a new pattern or refines an existing one. If so:
     ```bash
     node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js add-decline-pattern --dir . --pattern "Pattern description" --learned-from "Company Name" --rebuild-board
     ```
     Tell the user what filter change was made (if any).

10. **Auto company research** — after adding a non-declined role, check if this company already has research:
    ```bash
    node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js needs-research --dir .
    ```
    If the company appears in the `needs_research` list, launch a background sub-agent to generate the Company Overview (see the "Company Overview" section of the prep skill for the template). Save it to `{company_dir}/overview.md`. This is a company-level doc shared across all roles at that company — only one research pass per company. The `needs-research` command automatically skips companies that only have declined/rejected/closed roles.

If no URL is provided, ask the user for one. They can also paste the JD text directly instead of a URL.

## Decline Pattern Learning

Any time a role is declined — whether during assessment, review, update, or any other flow — consider whether the decline reason represents a generalizable pattern. Read `search/references/decline-learning.md` for the full process. The key question: **would this reason apply to future roles too?** If yes, add or refine a decline pattern. If it's a one-off, just note it and move on.
