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

**Shell setup:** The tracker script auto-detects the workspace directory. Set `JFM_DIR` only if the path contains special characters.

**Read `search/references/routing.md` before processing any user message** — it defines how to decompose compound messages and where to route each type of input.

Assess a specific job posting against the user's profile.

## Steps

1. Read `profile.yaml`, `archetypes.yaml`, and `filters.yaml`
2. Fetch the URL provided by the user using WebFetch. Use **Haiku** for simple JD extraction from URLs if delegating to a sub-agent.
3. Extract the job description from the page
4. Run a full fit assessment using the search skill's fit assessment framework
5. Present the assessment to the user (Recommendation, Gaps, Positive Fit)
6. Ask if they want to add it to the tracker — or decline it immediately
7. **If adding**, add via the tracker script:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js add --json '{"company":"...","role":"...","url":"...","archetype":"...","stage":"suggested","agent_summary":"..."}'
   ```
8. Get the file paths for the new entry and save the JD:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js paths --id <id>
   ```
   This returns `role_dir` and `company_dir`. Save the JD to `{role_dir}/jd.md`. Create the directories if they don't exist (`mkdir -p`).

   After saving, use `present_files` to share the board with the user, then tell them what was created:
   > **Added to tracker** — {Company} / {Role}
   > **JD saved** — `{role_dir}/jd.md`
   > Your board has been updated — refresh to see it.
9. **If declining** (user says "not interested", "pass", "decline", etc.):
   - If already added to tracker, decline it:
     ```bash
     node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js decline --id <id> --reason "reason text"
     ```
   - If not yet added, add it as declined so the reason is tracked:
     ```bash
     node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js add --json '{"company":"...","role":"...","url":"...","stage":"declined","decision":{"proceed":"no","reason":"reason text"}}'
     ```
   - **Always run decline pattern learning** (see `search/references/decline-learning.md`):
     check if this decline suggests a new pattern or refines an existing one. If so:
     ```bash
     node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js add-decline-pattern --pattern "Pattern description" --learned-from "Company Name"
     ```
     Tell the user what filter change was made (if any).
   Use `present_files` to share `Kanban/index.html`, then tell the user: "Your board has been updated."

10. **Auto company research** — after adding a non-declined role, check if this company already has research:
    ```bash
    node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js needs-research
    ```
    If the company needs research, generate a Company Overview inline (see the "Company Overview" section of the prep skill). Save to `{company_dir}/overview.md`. One overview per company — skip companies that already have one.
    > "Researching {company}... done."

    Rebuild the board after writing the overview so it's embedded in the board.

If no URL is provided, ask the user for one. They can also paste the JD text directly instead of a URL.

## Compound requests during assessment

Users may share additional context alongside a job posting: "check this role — my work at Woolpert is relevant here because of water utilities" or "assess this, and add the company to my watch list."

**After the assessment, scan the rest of the message for:**

- **Company interest** → add to watch list or target companies
- **Industry interest** → add to filters.yaml industries list
- **Career evidence** → ask a follow-up, save to profile.yaml
- **Additional URLs** (careers page, blog post, portfolio) → route appropriately

Handle the assessment first, then address secondary intents. See `search/references/routing.md` for the full routing decision tree.

## Decline Pattern Learning

Any time a role is declined — whether during assessment, review, update, or any other flow — consider whether the decline reason represents a generalizable pattern. Read `search/references/decline-learning.md` for the full process. The key question: **would this reason apply to future roles too?** If yes, add or refine a decline pattern. If it's a one-off, just note it and move on.
