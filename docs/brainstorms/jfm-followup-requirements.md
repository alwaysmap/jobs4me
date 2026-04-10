---
title: jfm:followup — per-role next-action recommendations and outreach drafting for Applied roles
status: draft
date: 2026-04-10
---

# jfm:followup

## Problem

Applied roles sit in an ambiguous silence window, and even once a user has decided to follow up on a specific role, drafting the actual outreach is its own blocker. Two related problems collapse into a single skill:

1. **Which roles need attention, and what kind?** Users don't know what's typical, when to follow up, when to walk away, or which lever (recruiter ping, referral activation, close-and-move-on) matches each role's situation. `/jfm:review applied` exists, but it's an interactive triage loop — it doesn't produce a *thinking-partner briefing* that explains timing norms and recommends a specific next move per role with reasoning.
2. **How do I actually reach out on this specific role?** Once a user has committed to following up, they need help drafting short, specific, non-platitudinous outreach in multiple variants (cold hiring manager, warm intro ask, recruiter ping) so they can pick the right one based on whatever warm path they do or don't have.

The example conversation in the brainstorm prompt is the shape the user wants for mode 1: a timing framework, a per-role table with "what to do next" and "why", and a summary grouped by action. For mode 2, the shape is: a brief validating conversation to capture what's specific about this role (strongest alignment, honest gap, known warm paths), then multiple ~130-word templated drafts saved to a markdown file in the role directory alongside the existing cover letter and prep docs.

## Users & goals

Single user — the plugin author initially, then other senior/Director+/Principal-level job seekers via Gumroad. Two use cases:
- Turn 10 stale Applied roles into a clear, ranked set of "do this today / decide next week / pure wait" actions without having to guess norms.
- Given one role they care about, get templated outreach notes that lead with the strongest alignment, name the honest gap before the reader does, and end with a short, specific ask.

## Scope

**In scope:**
- New skill at `skills/followup/SKILL.md`, auto-namespaced as `jfm:followup`
- **Mode 1 — Briefing** (invoked as `/jfm:followup` with no args): covers roles with `stage: applied` only. Produces the timing framework, per-role recommendation table, and action-grouped summary.
- **Mode 2 — Single-role outreach drafting** (invoked as `/jfm:followup {company}`): short validating conversation, then drafts multiple templated outreach variants and saves them to `{role_dir}/outreach.md`.
- Reads tracker state via `tracker.js` (`list`, `get`, `get-profile`) and each role's `notes` / `agent_summary` / `dates` to compute days-since-applied and prior contact history.
- Reads any existing `{role_dir}/jd.md`, `{role_dir}/cover-letter.md`, and `{company_dir}/overview.md` that have been saved for the role, so the drafts can reference specifics from the JD and alignment narrative from the cover letter without asking the user to repeat themselves.
- Tunable timing cadence via optional `follow_up_cadence` block in `profile.yaml`.
- Skill offers to save user pushback as permanent cadence overrides.
- At the end of mode 1, offers optional durable actions: close specific roles, stamp follow-up dates into notes, verify ambiguous comp.
- At the end of mode 2, suggests a target send window based on the active cadence and the role's days-since-applied.
- Documented in `jfm:help` and `README.md`.

**Out of scope (for v1):**
- Interviewing, Maybe, Offered stage recommendations.
- Writing to `tracker.yaml` without explicit user confirmation.
- Persistent `todo.md`-style dashboard file — briefing output is ephemeral; only outreach drafts are persisted (to the role directory).
- Sending, scheduling, or in any way transmitting the drafted outreach. The skill drafts and saves — the user sends.
- Automated identification of hiring managers, recruiters, or warm connections. The skill asks the user who they know and works with whatever they share.
- Parameterization by seniority beyond what `profile.yaml` already contains.

## Behavior

### Mode 1 — Briefing

**Invocation:** `/jfm:followup` with no args.

**Output structure:**
1. **Timing framework section** — short prose explaining the day-bands in use. Renders the active cadence (defaults or user overrides). One line noting whether defaults or overrides are in play, with a nudge that the user can push back to tune it.
2. **Per-role table** — one row per Applied role, columns: #, Company + Role, Days since applied, Recommendation (one of: *wait*, *activate warm contact*, *send first follow-up*, *send final follow-up*, *consider closed*, or a role-specific variant like *verify comp range first*), and a 1–3 sentence "why" that pulls from the role's notes, prior follow-up history, and mission/comp fit.
3. **Summary by action** — three buckets: "Send a message this week", "Decision point in ~1 week", "Pure wait (with first-action dates)". Makes the list scannable.
4. **Footer with durable offers** — e.g., "Want me to close ActBlue/G-P now? Stamp follow-up dates into notes so the next `/jfm:review` surfaces them? Draft the outreach for Zillow Principal TPM?" Each offer is confirmed separately before any write. Offers that would drop into mode 2 hand off cleanly to single-role drafting.

### Mode 2 — Single-role outreach drafting

**Invocation:** `/jfm:followup {company}`. If the company has multiple matching roles, the skill asks which one. If no matching role exists in the applied stage, the skill says so and does not proceed.

**Flow:**

1. **Load context.** Read the role via `get --id <id>`. Resolve the role directory via `paths --id <id>`. Silently read any of the following that exist: `{role_dir}/jd.md`, `{role_dir}/cover-letter.md`, `{company_dir}/overview.md`, the role's `notes`, `agent_summary`, and `decision`.
2. **Present a compact context card.** Show the company + role, days since applied, cadence-band recommendation, and a short list of what the skill already knows (strongest alignment from the cover letter, honest gap if one is already named, any follow-up history from notes). Do not dump the full cover letter or JD — the point is to show the user what's already on file so they don't repeat it.
3. **Validating conversation — up to three short questions.** Only ask what isn't already clear from the context card. Typical questions:
   - "What's the one specific comparison you want this to lead with?" (skip if the cover letter already has a strong one-liner)
   - "What's the honest gap you'd want to name yourself rather than have the reader infer?" (skip if flagged in the assessment)
   - "Any warm path I should write toward — known hiring manager, a mutual connection, a recruiter you've already spoken to? Or should I assume cold?"
   - "Anything specific about the company's mission or product I should avoid making a platitude of?" (only if the JD has a mission-alignment line like Affirm's "morally aligned with our vision")
4. **Draft three templated variants.** Length ~130 words each. Shared structure: lead with the application fact + one-sentence strongest alignment → one concrete comparison from the user's background → name the honest gap → close with a 15-minute ask. The three variants are:
   - **Cold hiring manager** — direct application + ask. Use when the hiring manager is identifiable but there's no warm path.
   - **Warm intro ask** — addressed to a mutual connection, includes a *forwardable blurb* the mutual can paste without writing anything themselves. Use when a connection exists.
   - **Recruiter / TA ping** — lighter, process-focused ("Any update on timing?" + re-assert fit in one sentence). Fallback when no hiring manager is identifiable.
5. **Save to `{role_dir}/outreach.md`.** Single file with all three variants, plus a short "sequencing guidance" section (which to try first given what the user shared) and a target send window derived from the active cadence (e.g., "Target first send: 2026-04-19 to 2026-04-25"). Use `present_files` to surface the file inline, same as `/jfm:apply` does for cover letters.
6. **Advisory close.** Remind the user the skill does not send or schedule. Offer to re-draft a specific variant if the tone isn't right, or to regenerate after they share a specific name.

### Template properties (both modes, but enforced strictly in mode 2)

- **Length:** ~130 words per variant. Short is a feature.
- **Lead:** application fact + one-sentence strongest alignment. Never "I hope this finds you well."
- **Concrete comparison:** one specific comparison from the user's background ("I ran the TPM function at GitHub through the Copilot launch"). No abstractions, no list of adjectives.
- **Name the gap:** the user's honest weakness relative to the JD, stated before the reader has to infer it. This is the non-obvious move — it signals self-awareness and pre-empts the objection.
- **Close:** a 15-minute ask, not an open-ended coffee chat. Specific beats polite.
- **No platitudes about the company's mission.** If mission alignment matters per the JD, the skill must get a specific take from the user or decline to include the angle at all.

### Timing framework defaults (mode 1)

Shipped in SKILL.md, tuned for Director+/Principal TPM roles:

| Phase | Days | Default action |
|---|---|---|
| Normal silence | 1–14 | Wait. No action. |
| Warm-contact window | 15–21 | Activate referrals quietly if available. |
| First follow-up | 21–30 | Short, no-pressure recruiter or hiring-manager note. |
| Final follow-up | 30–45 | Last polite re-assertion of interest. |
| Consider closed | 45+ | Suggest moving to closed unless direct signal of life. |

These are day-band boundaries, not single numbers — the skill reads the current day count against the nearest band.

### User-tunable cadence

Optional block in `profile.yaml`:

```yaml
follow_up_cadence:
  normal_silence_days: 14
  warm_contact_days: 15
  first_followup_days: 21
  final_followup_days: 30
  consider_closed_days: 45
```

If absent, the skill uses defaults. If present, values override defaults individually (missing keys fall back to defaults).

**How users tune without reading docs:** When the user pushes back on timing inside a `/jfm:followup` run ("21 days is too long for my market, I'd ping at 10"), the skill responds:

> Got it. Want me to save `first_followup_days: 10` as your default? Future runs will use it.

On confirm, the skill persists the override **exclusively** via `scripts/tracker.js set-profile` — the skill must never edit `profile.yaml` (or any other yaml file) directly. The existing shallow-merge semantics in `set-profile` (`scripts/tracker.js:959`) already support one-level-deep merge for nested objects, so a single call works without clobbering other `follow_up_cadence` keys:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js set-profile --json '{"follow_up_cadence":{"first_followup_days":10}}'
```

Same learning loop as decline patterns in `/jfm:review`.

### Signal inputs per role (mode 1)

For each Applied role the skill considers:
- `dates.applied` (primary) with fallback to `dates.identified` or `last_updated` for days-since-applied
- Raw `notes` field for prior follow-up history ("followed up with Jacqueline Edwards on 4/2")
- Role `fit` / `comp` flags from the initial assessment (e.g., "possibly below floor")
- Whether the role has a warm-contact mention in notes ("internal contact: Straker")
- Whether the posting has been flagged as reposted (negative signal)
- Whether an assessment exists that flagged concerns worth resolving before investing more effort

The skill should *read* the notes text with light pattern recognition — it doesn't need a structured schema. If a follow-up was clearly logged, treat it as a data point; if the notes are empty, say so in the "why" column.

### Context inputs per role (mode 2)

On top of mode 1's inputs, single-role mode also loads:
- `{role_dir}/jd.md` if it exists — for requirement specifics to name the honest gap against
- `{role_dir}/cover-letter.md` if it exists — for the strongest alignment narrative the user already committed to
- `{company_dir}/overview.md` if it exists — for mission/product specifics so the drafts can avoid generic platitudes

All three reads are silent — the skill uses them to inform the drafts, not to quote them wholesale.

### Actions (advisory only)

`/jfm:followup` never mutates tracker state without confirmation. Mode 1's footer offers are per-action opt-ins. Mode 2 writes exactly one file — `{role_dir}/outreach.md` — and the skill surfaces it inline after writing.

**Hard constraint: every mutation to tracker / profile / filters state must go through `scripts/tracker.js`.** The skill never edits `tracker.yaml`, `profile.yaml`, `filters.yaml`, or any other yaml file directly. This is a project-wide rule — it keeps backups, validation, board rebuilds, and schema consistency centralized in one script. Writing `{role_dir}/outreach.md` is fine because it's a generated document, not schema state, and follows the same pattern as `/jfm:apply` writing `cover-letter.md` and `/jfm:prep` writing `prep.md`.

| User-confirmed action | Mechanism |
|---|---|
| Close a role (e.g., ActBlue, G-P) | `tracker.js stage --id <id> --stage closed` |
| Stamp a follow-up date into notes | `tracker.js update --id <id> --json '{"notes":"...\n2026-04-20: follow_up_due"}'` (preserving prior notes) |
| Save a cadence override | `tracker.js set-profile --json '{"follow_up_cadence":{"<key>":<value>}}'` |
| Save outreach drafts for a role | Write to `{role_dir}/outreach.md` directly (same convention as cover-letter.md / prep.md) |
| Read tracker state at the start | `tracker.js list`, `get --id <id>`, `get-profile`, `paths --id <id>` |

If a desired mutation has no matching tracker.js command, the correct move is to **add the command to `scripts/tracker.js` first**, not to write yaml from the skill. Flag that gap during planning so it can be scoped in.

### Data-access boundary (read side)

For consistency, all tracker / profile / filters reads go through `tracker.js` (`list`, `get`, `get-profile`, `paths`). The skill should not parse `tracker.yaml` or `profile.yaml` directly even for read operations. If a new read shape is needed (e.g., "all applied roles with days-since-applied computed"), add a command to `tracker.js` rather than reading yaml from the skill. Reading generated markdown documents from the role directory (`jd.md`, `cover-letter.md`, `overview.md`) is fine — those are generated artifacts, not schema state.

## Success criteria

- Running `/jfm:followup` on a board with ≥5 Applied roles produces output visually and structurally matching the example conversation in the brainstorm prompt.
- Per-role "why" columns cite concrete evidence from notes / fit / comp, not generic filler.
- A user who pushes back on a timing band can have their override saved to `profile.yaml` in a single turn, via `tracker.js set-profile`.
- No role's status changes without the user explicitly confirming the action from the footer offers.
- `/jfm:followup {company}` loads role context from the tracker and role directory, asks at most three targeted validating questions (skipping ones already answered by on-file context), and produces three ~130-word templated outreach variants saved to `{role_dir}/outreach.md`.
- Mode 2 drafts lead with a concrete comparison, name the honest gap before the reader has to infer it, and avoid platitudes about company mission.
- The skill never sends, schedules, or transmits outreach. Every mode-2 run explicitly reminds the user of this.

## Open questions for planning

- **Follow-up date stamping format** — if the user accepts "stamp follow-up dates into notes", what's the exact note format so `/jfm:review stale` can pick them up? (Probably a dated line like `2026-04-20: follow_up_due` — needs planning-time decision.)
- **Outreach file naming** — `outreach.md` matches the `cover-letter.md` / `prep.md` convention. Confirm in planning, but default to that.
- **Re-running mode 2 on a role that already has `outreach.md`** — overwrite, append, or refuse? Probably: read the existing file, offer to regenerate in place (with a one-line diff preview) or append a dated new section.
- **Relationship between mode 1 footer and mode 2** — if mode 1 offers "draft outreach for {company}", that should drop directly into mode 2's flow for that role without re-asking for context the skill already loaded.
- **Interviewing stage follow-up** — same pattern could apply to roles mid-interview (thank-you notes, between-round follow-ups). V2 candidate.

## Non-goals

- Replacing `/jfm:review`. `/jfm:review` is a triage loop for decisions; `/jfm:followup` is a briefing for planning plus a drafting tool for acting.
- Sending outreach. The skill drafts and saves; the user sends.
- Automated hiring manager, recruiter, or warm-connection discovery. The skill asks the user for what they know.
- Cross-plugin integrations (calendar, email, LinkedIn).

## Notes on namespacing

The plugin's `name: "jfm"` in `.claude-plugin/plugin.json` auto-namespaces every skill in `skills/` as `jfm:<name>`. No config change needed. `/jfm:followup` will work automatically once `skills/followup/SKILL.md` exists. Users can invoke short-form (`/followup`) or namespaced (`/jfm:followup`) — the latter is always unambiguous when multiple plugins define the same short name.
