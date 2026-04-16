---
name: update
description: >
  Use this skill when the user wants to update a role's status, move a role through
  pipeline stages, decline a role, mark something as applied or interviewing, or
  report a rejection. Triggers on "update", "applied to", "got rejected", "decline",
  "not interested", "got an offer", "interviewing at", or any natural-language
  status change for a tracked role. Also handles the bare `/jfm:update` command
  (no arguments) by showing active roles for the user to pick from.
user_summary: >
  Move a single role through your pipeline — mark it as applied, interviewing,
  offered, declined, or rejected.
---

# Update Role Status

**Shell setup:** Always `export JFM_DIR='<workspace path>'` (single quotes) before running tracker commands. The script refuses to operate if it can't resolve a real workspace.

**Read `search/references/routing.md` before processing any user message** — it defines how to decompose compound messages and where to route each type of input.

Update the stage or status of a tracked role, including declining roles.

Parse the user's input as: `Company Name - status` with an optional note/reason after. Examples:
- `/jfm:update Acme - applied`
- `/jfm:update Acme - interviewing phone screen scheduled for Thursday`
- `/jfm:update Acme - rejected got the generic "moved forward with other candidates" email`
- `/jfm:update Acme - closed posting removed, assume filled`
- `/jfm:update Acme - decline too much travel`
- `/jfm:update Acme - not interested, too enterprise-y`

Valid stages: `suggested`, `maybe`, `applied`, `interviewing`, `offered`, `rejected`, `closed`, `declined`

Common shorthand the user might use (map these to stages):
- "applied", "submitted" -> `applied`
- "interviewing", "interview", "phone screen", "screen" -> `interviewing`
- "offered", "offer" -> `offered`
- "rejected", "passed", "no" -> `rejected`
- "closed", "ghosted", "filled", "removed" -> `closed`
- "interested", "maybe" -> `maybe`
- "decline", "declined", "not interested", "pass", "skip", "nah" -> `declined`

## Steps

1. Find the application by company name:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js find --company "Company Name"
   ```
   If multiple roles at the same company, ask which one.

2. **If declining** (stage is `declined`):

   Extract the reason from the user's message (everything after the status keyword).

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js decline --id <id> --reason "reason text"
   ```

   Run the decline pattern learning process (from the search skill's decline-learning reference):
   - Check if this decline suggests a new pattern or refines an existing one
   - If a new pattern should be added:
     ```bash
     node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js add-decline-pattern --pattern "Pattern description" --learned-from "Company Name"
     ```
   - Tell the user what filter change was made (if any)

3. **If changing to any other stage**:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js stage --id <id> --stage <stage>
   ```

   If the user included a note, update the entry:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js update --id <id> --json '{"notes":"existing notes\n2026-03-27: new note text"}'
   ```
   Preserve existing notes — append the new note with a date stamp.

4. **Post-update actions**:
   - After every stage change or decline, use `present_files` to share `Kanban/index.html`, then tell the user: "Your board has been updated."
   - If new stage is `applied`, suggest running `/jfm:apply` to generate a cover letter if they haven't already
   - If new stage is `interviewing`, suggest running `/jfm:prep` for that company
   - If new stage is `rejected` or `closed`, acknowledge briefly — don't over-sympathize, just confirm and move on
   - If new stage is `offered`, run the **offer evaluation** (see below)

## Offer Evaluation

When a role moves to `offered`, help the user think through the offer. Don't just congratulate — be a useful sounding board:

1. **Capture the details** — ask what they know: base comp, equity, bonus, title, level, start date, remote/hybrid/onsite, team size, reporting structure. Save these as structured notes on the tracker entry.

2. **Compare against preferences** — check `profile.yaml` preferences:
   - Does the comp meet the floor? If equity is involved, note that it's speculative.
   - Does the travel/location match?
   - Does the seniority match?

3. **Compare against other active roles** — check the tracker for other roles in `interviewing` or `offered`:
   - Are there competing offers or late-stage interviews?
   - Should the user accelerate any timelines?

4. **Flag what to negotiate** — based on the user's preferences and the offer details, suggest specific negotiation points. Be concrete: "The base is $15K below your floor — worth asking" not "you could try negotiating."

5. **Timeline check** — ask about the decision deadline and suggest a response plan.

Save a summary of the offer evaluation to `{role_dir}/offer-notes.md`.

Don't be sycophantic about the offer. Be happy for them, then immediately be useful.

## Compound requests — config changes alongside status updates

Users often mention configuration changes while updating a role: "decline Cognite but add them to my watch list" or "not interested in this role but my work at Woolpert is relevant to companies like this."

**After handling the pipeline action (stage change, decline), scan the rest of the message for:**

- **Company interest** ("the company is interesting", "watch this one", "keep an eye on") → add to watch list via `update-filter-list --list watch --add '["Company"]'`
- **Industry interest** ("companies like this", "this sector is interesting") → add to industries via `update-filter-list --list industries --add '["industry"]'`
- **Career evidence** ("my experience at X includes...", "my project history at Y") → ask a focused follow-up, then save to profile.yaml via `set-profile`
- **URLs** — fetch them. Blog/portfolio → evidence. Careers page → offer as source. Job posting → offer to assess.
- **Source additions** ("add their careers page") → add to filters.yaml sources via `set-filters`

Handle the pipeline action first, then address each secondary intent separately. Confirm each change individually. Don't silently drop any part of the user's message.

See `search/references/routing.md` for the full routing decision tree.

## No arguments — show active roles

If no arguments are provided (user just typed `/jfm:update`), list their active roles so they can pick one:

1. Get all applications:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js list
   ```

2. Filter to active stages only: `suggested`, `maybe`, `applied`, `interviewing`, `offered`. Exclude `declined`, `rejected`, `closed`.

3. Show them grouped by stage, most actionable first:

   > Which role do you want to update?
   >
   > **Interviewing:**
   > - Acme Corp — VP Engineering
   >
   > **Applied:**
   > - BigCo — Director of Programs
   > - StartupX — Head of Engineering
   >
   > **Suggested (new):**
   > - CoolCo — TPM Lead
   > - AnotherCo — Partner Engineering Manager
   >
   > Just tell me the company (or company + role if there are multiple) and what happened — like "Acme - got a phone screen scheduled" or "CoolCo - decline, too junior"
   >
   > **Quick stage reference:**
   > Suggested -> **Maybe** (interested) -> **Applied** -> **Interviewing** -> **Offered**
   > Or at any point: **Decline** (pass with a reason) / **Rejected** / **Closed** (ghosted/filled)

This makes `/jfm:update` feel like a dashboard interaction, not a blank prompt.
