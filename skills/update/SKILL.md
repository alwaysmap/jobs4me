---
name: update
description: >
  Use this skill when the user wants to update a role's status, move a role through
  pipeline stages, decline a role, mark something as applied or interviewing, or
  report a rejection. Triggers on "update", "applied to", "got rejected", "decline",
  "not interested", "got an offer", "interviewing at", or any status change for a
  tracked role. Also use when the user just says /update with no arguments to show
  their active roles.
user_summary: >
  Move a single role through your pipeline — mark it as applied, interviewing,
  offered, declined, or rejected.
---

# Update Role Status

**Shell setup:** The tracker script auto-detects the workspace directory. Set `JFM_DIR` only if the path contains special characters.

Update the stage or status of a tracked role, including declining roles.

Parse the user's input as: `Company Name - status` with an optional note/reason after. Examples:
- `/update Acme - applied`
- `/update Acme - interviewing phone screen scheduled for Thursday`
- `/update Acme - rejected got the generic "moved forward with other candidates" email`
- `/update Acme - closed posting removed, assume filled`
- `/update Acme - decline too much travel`
- `/update Acme - not interested, too enterprise-y`

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
   - If new stage is `applied`, suggest running `/apply` to generate a cover letter if they haven't already
   - If new stage is `interviewing`, suggest running `/prep` for that company
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

## No arguments — show active roles

If no arguments are provided (user just typed `/update`), list their active roles so they can pick one:

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

This makes `/update` feel like a dashboard interaction, not a blank prompt.
