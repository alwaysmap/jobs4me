---
title: "feat: Add jfm:followup skill for per-role recommendations and outreach drafting"
type: feat
status: active
date: 2026-04-10
origin: docs/brainstorms/jfm-followup-requirements.md
---

# feat: Add jfm:followup skill for per-role recommendations and outreach drafting

## Overview

Add a new skill at `skills/followup/SKILL.md` that serves two related use cases:

- **Mode 1 — Briefing** (`/jfm:followup` with no args): produces a thinking-partner briefing for roles in the `applied` stage — timing framework, per-role recommendation table with "what to do next" and "why", and an action-grouped summary.
- **Mode 2 — Single-role outreach drafting** (`/jfm:followup {company}`): runs a short validating conversation with the user about one role, then drafts three templated outreach variants (cold hiring manager, warm intro ask, recruiter/TA ping) and saves them to `{role_dir}/outreach.md`.

The skill is purely advisory for tracker state — it only mutates tracker / profile state through `scripts/tracker.js` when the user confirms footer-offered actions. It writes generated documents (`outreach.md`) directly to the role directory, matching the existing convention used by `/jfm:apply` (`cover-letter.md`) and `/jfm:prep` (`prep.md`).

Mode 1 ships with sensible Director+/Principal-TPM timing defaults and reads an optional `follow_up_cadence` block from `profile.yaml` to let users override any individual threshold. Users can tune the cadence by pushing back in conversation; the skill offers to persist the change via `tracker.js set-profile`.

## Problem Frame

Applied roles sit in an ambiguous silence window, and even once a user has decided to follow up on a specific role, drafting the actual outreach is its own blocker. Two related problems collapse into a single skill (see origin: `docs/brainstorms/jfm-followup-requirements.md`):

1. Users don't know what's typical, when to follow up, when to walk away, or which lever matches each role's situation. `/jfm:review applied` is an interactive triage loop — it doesn't produce an analytical briefing.
2. Once a user commits to following up on a specific role, they need help drafting short, specific, non-platitudinous outreach in multiple variants so they can pick the right one based on whatever warm path they do or don't have.

The example conversation in the origin document shows the shape for both modes: a four-section briefing for mode 1, and for mode 2 a validating conversation followed by a saved markdown file containing three ~130-word templated drafts plus sequencing guidance and a target send window.

## Requirements Trace

- **R1.** New skill at `skills/followup/SKILL.md`, auto-namespaced as `jfm:followup` via existing plugin config.
- **R2.** Mode 1 covers roles with `stage: applied` only in v1. Other stages explicitly out of scope.
- **R3.** Mode 1 produces inline chat output with four sections: timing framework, per-role table, summary by action, footer with opt-in actions.
- **R4.** Reads all tracker / profile / filters state through `scripts/tracker.js` commands (`list`, `get`, `get-profile`, `paths`). The skill never parses `tracker.yaml` or `profile.yaml` directly.
- **R5.** Writes all tracker / profile state changes through `scripts/tracker.js` commands (`stage`, `update`, `set-profile`). The skill never mutates yaml files directly.
- **R6.** Timing framework defaults are hardcoded in `skills/followup/SKILL.md` and overridable via an optional `follow_up_cadence` block in `profile.yaml`.
- **R7.** When the user pushes back on a timing threshold in conversation, the skill offers to persist the override via `set-profile` in a single confirmation turn.
- **R8.** Mode 1 per-role "why" columns cite concrete evidence from each role's `notes`, `agent_summary`, `decision`, and `dates` — not generic filler.
- **R9.** Never mutates tracker state without explicit per-action confirmation.
- **R10.** Supports single-role briefing via `/jfm:followup {company}` that drops into mode 2 (not a scoped-down mode 1).
- **R11.** Documented in `skills/help/SKILL.md` and `README.md`.
- **R12.** Mode 2 loads role context from `get --id <id>`, `paths --id <id>`, and any existing `{role_dir}/jd.md`, `{role_dir}/cover-letter.md`, and `{company_dir}/overview.md` — using them silently to inform drafts without making the user repeat context.
- **R13.** Mode 2 asks up to three targeted validating questions, skipping any already answered by on-file context.
- **R14.** Mode 2 drafts three ~130-word templated variants (cold hiring manager, warm intro ask with forwardable blurb, recruiter/TA ping). Each variant leads with the application fact and strongest alignment, includes one concrete comparison, names the honest gap, and closes with a 15-minute ask.
- **R15.** Mode 2 saves drafts to `{role_dir}/outreach.md` — a single file containing all three variants plus sequencing guidance and a target send window derived from the active cadence.
- **R16.** Mode 2 never sends, schedules, or transmits outreach. Every run explicitly reminds the user of this boundary.
- **R17.** Mode 1's footer can offer "draft outreach for {company}" as an opt-in action that hands off cleanly to mode 2 without re-asking for context the skill already loaded.

## Scope Boundaries

- **Out of scope:** Interviewing, Maybe, Offered, or any non-Applied stage recommendations or drafting. V2 candidate.
- **Out of scope:** Persistent briefing dashboard file. Mode 1 output is ephemeral chat; only mode 2 drafts are persisted (to the role directory).
- **Out of scope:** Sending, scheduling, or transmitting outreach in any form.
- **Out of scope:** Automated discovery of hiring managers, recruiters, or warm connections. The skill asks the user what they know.
- **Out of scope:** Cross-plugin integrations (calendar, email, LinkedIn, browser automation).
- **Out of scope:** Changes to `scripts/tracker.js`. v1 uses only existing commands. If the author later wants pre-computed "days-since-applied" data, that can be added as a new `list-applied` command in v1.1.
- **Out of scope:** Changes to `/jfm:review` behavior. A future enhancement to `/jfm:review stale` that honors `follow_up_due` dates stamped by `/jfm:followup` is noted in Future Considerations but not built here.
- **Out of scope:** Automated tests. This repo has no test infrastructure for skills; verification is manual smoke testing against a representative tracker.yaml.

## Context & Research

### Relevant Code and Patterns

- **`scripts/tracker.js:740`** — `list` command returns `applications` array. Entry point for reading all applied roles (mode 1).
- **`scripts/tracker.js:744`** — `get --id <id>` returns a single application record including `notes`, `dates`, `agent_summary`, `decision`. Used by both modes.
- **`scripts/tracker.js:1171`** — `paths --id <id>` returns `company_dir`, `role_dir`, and existence flags for `jd.md`, `overview.md`, `prep.md`, `cover-letter.md`. Mode 2 uses this to locate files to read and to compute the destination for `outreach.md`.
- **`scripts/tracker.js:955`** — `get-profile` returns the full `profile.yaml` content. The skill reads `follow_up_cadence` from this.
- **`scripts/tracker.js:959`** — `set-profile --json` merges one level deep. Passing `{"follow_up_cadence":{"first_followup_days":10}}` merges into an existing `follow_up_cadence` block without clobbering sibling keys.
- **`scripts/tracker.js:569`** — `stageEntry` sets `app.dates[newStage] = today()` when transitioning. `app.dates.applied` is the canonical "when did they apply" timestamp and is immutable across subsequent updates. The skill uses this (not `last_updated`) for all days-since-applied math.
- **`scripts/tracker.js:546`** — `updateEntry` auto-sets `last_updated = today()` on every edit. Important for the "stamp follow-up date into notes" action (see Key Technical Decisions).
- **`scripts/tracker.js:563`** — `STAGE_TRANSITIONS.applied` allows `closed` as a valid destination. The "close a role" footer action uses `stage --id <id> --stage closed`.
- **`skills/review/SKILL.md`** — Pattern for stage-filtered reads, priority ordering, compound-decision handling, and brisk tone.
- **`skills/update/SKILL.md:72-77`** — Pattern for `update --id --json` note-preservation semantics (read current notes, append dated line, write back).
- **`skills/apply/SKILL.md:1-11`** — SKILL.md frontmatter shape.
- **`skills/apply/SKILL.md:37-65`** — Pattern for loading role context via `paths --id <id>`, reading existing artifacts from the role directory, generating a new document, saving it to the role directory, and presenting it inline with `present_files`. Mode 2's flow mirrors this closely.
- **`skills/help/SKILL.md`** — Needs an entry for `/followup` in the command menu at lines 19-37.

### Institutional Learnings

- **`docs/solutions/integration-issues/cowork-plugin-runtime-constraints-2026-03-30.md`** — Plugin runs in read-only paths under Cowork. All tracker.js invocations must use `${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js`, never a relative or absolute workspace path. No background agents — the skill must do all work inline during the conversation.

### External References

None. Local patterns are strong enough that external research adds no value for a new skill in this plugin. Mode 2's outreach templating follows well-known advice already captured in the origin document (application-fact lead, concrete comparison, name the gap, short ask) — no external research improves on a clear SKILL.md rubric.

## Key Technical Decisions

- **Days-since-applied source of truth: `app.dates.applied`**, not `last_updated`. Rationale: `last_updated` is rewritten on every edit (including note appends), which would corrupt the clock. `dates.applied` is set once when the stage transitions and never moves. Fallback order if missing: `dates.applied` → `dates.identified` → `last_updated`.

- **Cadence override storage: single nested block in `profile.yaml`** under the key `follow_up_cadence`. Five child keys: `normal_silence_days`, `warm_contact_days`, `first_followup_days`, `final_followup_days`, `consider_closed_days`. Missing keys fall back to SKILL.md defaults. Existing `set-profile` shallow-merge semantics already support this write pattern — no tracker.js changes required.

- **Cadence override persistence: one confirmation, one write.** When the user pushes back on a threshold, the skill proposes the exact change and on yes invokes `set-profile --json '{"follow_up_cadence":{"<key>":<value>}}'`. Same learning pattern as decline patterns in `/jfm:review`.

- **Follow-up-date stamping format: `YYYY-MM-DD: follow_up_due — <short reason>`** as a single appended line to the role's `notes`. Greppable, human-readable, parseable by a future `/jfm:review stale` enhancement. The skill reads existing notes via `get --id`, appends the line, and writes back via `update --id --json '{"notes":"..."}'`. Existing notes are preserved intact.

- **`last_updated` reset on stamp is acceptable.** When the skill stamps a follow-up note, tracker.js auto-resets `last_updated` to today. This drops the role out of `/jfm:review stale`'s current 14-day detection — which is actually desired. After the user has committed to a follow-up date, the role should stop surfacing as "stale" until the stamped date approaches. A future `/jfm:review` enhancement to honor `follow_up_due` dates is noted in Future Considerations.

- **Zero read-side yaml parsing from the skill.** Every tracker / profile / filters read goes through `list`, `get`, `get-profile`, or `paths`. Reading generated markdown documents from the role directory (`jd.md`, `cover-letter.md`, `overview.md`, `outreach.md`) is fine — those are generated artifacts, not schema state.

- **Recommendation selection (mode 1) is a two-stage function.** Stage 1: compute a base recommendation from days-since-applied against the active cadence bands. Stage 2: overlay role-specific signals from `notes` / `agent_summary` / `decision` that can upgrade, downgrade, or replace the base recommendation (e.g., `verify comp range first`, `activate referral now`, `final ping then close`). Both stages happen inside the skill prompt, not in code.

- **Mode 2 outreach file location: `{role_dir}/outreach.md`.** Matches the `cover-letter.md` / `prep.md` / `resume.md` convention used by `/jfm:apply` and `/jfm:prep`. Resolved via `tracker.js paths --id <id>` which returns the canonical `role_dir`. The file is a single markdown document containing all three variants, sequencing guidance, and a target send window — not three separate files.

- **Mode 2 re-run behavior: regenerate in place with preview.** If `outreach.md` already exists, the skill reads it, shows a one-line "existing drafts from YYYY-MM-DD on file" note, and asks whether to regenerate (overwriting) or add a new dated section below the existing content. Default on yes is "regenerate and overwrite"; "add dated section" is the lower-stakes option for iterative tuning.

- **Mode 2 validation conversation: skip what's already known.** The skill should only ask questions whose answers aren't already derivable from the cover letter, JD, or assessment. If the cover letter already has a strong one-line alignment statement, don't ask the user to repeat it; read it. If the JD doesn't have a mission-alignment line, don't ask about company mission. The ceiling is three questions total; the floor is zero if the on-file context fully covers the template slots.

- **No new tracker.js commands in v1.** Every action the skill needs — listing applied roles, reading profile cadence, closing a role, stamping notes, saving a cadence override, resolving role directories — is already supported. v1 diff is concentrated in `skills/followup/`.

- **Mode 2 never transmits.** The skill's hard boundary: draft, save to file, advise. No sending, no scheduling, no browser automation, no LinkedIn access, no "connect" or "message" actions even if such tools are available. The SKILL.md must state this explicitly in its tone/constraints section and the skill must reiterate it at the end of every mode-2 run.

## Open Questions

### Resolved During Planning

- **Which date field is the source of truth for days-since-applied?** Resolved: `app.dates.applied`, fallback to `dates.identified` then `last_updated`.
- **Does `set-profile` support nested-block updates without clobbering siblings?** Resolved: yes, one level of deep merge at `scripts/tracker.js:965`.
- **What's the canonical format for stamped follow-up dates in notes?** Resolved: `YYYY-MM-DD: follow_up_due — <reason>`, appended as a new line.
- **Does closing an applied role require any other cleanup?** Resolved: no. `stage --id <id> --stage closed` is a valid transition and sets `dates.closed` automatically. Auto board rebuild handles UI.
- **Single-role mode shape** — is it a scoped-down mode 1 or its own mode 2? Resolved: mode 2 (distinct flow). A single-role briefing without drafting is low value; the point of naming a specific company is that the user wants to act on it.
- **Should `/jfm:review applied` link to `/jfm:followup`?** Resolved: no edits to `/jfm:review` in v1. Discovery via `/jfm:help` is sufficient.
- **Outreach file location and naming** — `{role_dir}/outreach.md`, one file containing all three variants. Matches existing convention.
- **Re-running mode 2 on an existing file** — regenerate in place by default, with an "add dated section" option.

### Deferred to Implementation

- **Exact prompt wording for the timing framework section.** Short table or prose paragraph — implementer picks whichever reads cleaner against the origin-doc example.
- **Whether to show the URL column in the mode 1 per-role table.** The origin-doc example omits URLs from the table. Implementer decides based on readability.
- **Exact validation question wording for mode 2.** The rubric is fixed (up to 3 questions, skip what's on file); the phrasing is per-role and can be adjusted at runtime.
- **Reason text passed to `follow_up_due` stamps.** Generated from the per-role reasoning; format is fixed but prose is runtime.
- **Exact sequencing-guidance and target-send-window wording in `outreach.md`.** Template slots are defined; implementer chooses concise phrasings.

## High-Level Technical Design

> *This illustrates the intended flow and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
/jfm:followup [company]
   │
   ├── company omitted → MODE 1: BRIEFING
   │     │
   │     ├── [1] Read state via tracker.js
   │     │     ├── list                → all applications, filter to stage: applied
   │     │     └── get-profile         → optional follow_up_cadence block
   │     │
   │     ├── [2] Compute per-role signals (in-skill, no code)
   │     │     ├── days_since_applied = today - dates.applied (fallbacks: identified, last_updated)
   │     │     ├── active_cadence     = defaults ← follow_up_cadence overrides
   │     │     ├── base_rec           = band(days_since_applied, active_cadence)
   │     │     └── overlay            = signals(notes, agent_summary, decision)
   │     │                              → may upgrade/downgrade/replace base_rec
   │     │
   │     ├── [3] Render briefing inline
   │     │     ├── Timing framework section (active_cadence, defaults vs overrides)
   │     │     ├── Per-role table: #, Company — Role, Days, Recommendation, Why
   │     │     ├── Summary by action
   │     │     └── Footer: opt-in actions (close, stamp follow-up, draft outreach → hands off to MODE 2)
   │     │
   │     └── [4] Execute confirmed actions via tracker.js
   │           ├── stage --id <id> --stage closed
   │           ├── update --id <id> --json '{"notes":"<existing>\n2026-04-20: follow_up_due — <reason>"}'
   │           └── set-profile --json '{"follow_up_cadence":{"<key>":<value>}}'
   │
   └── company provided → MODE 2: SINGLE-ROLE OUTREACH DRAFTING
         │
         ├── [1] Resolve role
         │     ├── find --company <company>      → match applied roles; disambiguate if >1
         │     ├── get --id <id>                 → full role record
         │     └── paths --id <id>               → company_dir, role_dir, artifact flags
         │
         ├── [2] Load context (silent)
         │     ├── role.notes, agent_summary, decision, dates, follow_up_cadence (via get-profile)
         │     ├── {role_dir}/jd.md              → requirement specifics (if exists)
         │     ├── {role_dir}/cover-letter.md    → alignment narrative (if exists)
         │     ├── {company_dir}/overview.md     → mission/product specifics (if exists)
         │     └── {role_dir}/outreach.md        → prior drafts (if exists → regenerate prompt)
         │
         ├── [3] Present context card inline
         │     company + role, days since applied, cadence band, what's already on file
         │
         ├── [4] Validating conversation (up to 3 questions, skip what's known)
         │     ├── strongest-alignment one-liner?         (skip if cover letter covers it)
         │     ├── honest gap to name?                    (skip if assessment flags it)
         │     ├── warm path? hiring manager? recruiter?  (always ask)
         │     └── mission-specific take?                 (only if JD has a mission line)
         │
         ├── [5] Draft three variants
         │     ├── Cold hiring manager (~130 words)
         │     ├── Warm intro ask with forwardable blurb (~130 words)
         │     └── Recruiter/TA ping (~130 words)
         │         each variant: app fact + alignment → concrete comparison → name gap → 15-min ask
         │
         ├── [6] Save to {role_dir}/outreach.md
         │     single file: 3 variants + sequencing guidance + target send window
         │
         └── [7] Present inline + remind boundary
               present_files({role_dir}/outreach.md; "Drafts saved. I don't send — you do.")
```

### Recommendation decision matrix (mode 1)

| Days since applied | Base recommendation | Typical overlay triggers |
|---|---|---|
| `< normal_silence_days` (default 14) | Wait | Warm contact available → *activate warm contact*; comp concern → *verify comp first* |
| `< warm_contact_days` (default 15) | Wait + warm contact prompt | Same overlays |
| `< first_followup_days` (default 21) | Activate warm contact (if any) | No warm contact → still Wait |
| `< final_followup_days` (default 30) | Send first follow-up | Already followed up once → *send final follow-up* |
| `< consider_closed_days` (default 45) | Send final follow-up | Follow-up sent 10+ days ago with no response → *consider closed* |
| `>= consider_closed_days` | Consider closed | Direct signal of life in notes → override back to *wait* |

### Mode 2 template shape (enforced in SKILL.md)

Each of the three variants must:
- Lead with the application fact + one-sentence strongest alignment.
- Include one concrete comparison from the user's background (never a list of adjectives).
- Name the honest gap before the reader has to infer it.
- Close with a specific 15-minute ask.
- Stay at ~130 words (±20).
- Avoid platitudes about company mission unless the user supplied a non-generic take during the validation conversation.

## Implementation Units

- [ ] **Unit 1: Create `skills/followup/SKILL.md` with mode 1 (briefing) behavior**

**Goal:** Land the core skill file's mode 1 behavior — frontmatter, invocation triggers, timing framework defaults, briefing output format, recommendation logic, tracker.js invocation patterns, cadence override learning loop, and footer action handling.

**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R11.

**Dependencies:** None.

**Files:**
- Create: `skills/followup/SKILL.md`

**Approach:**
- Frontmatter: `name: followup`, `description`, `user_summary`. Follow the `skills/apply/SKILL.md` shape. Description should trigger on phrases like "what should I do next", "recommend follow-ups", "should I follow up yet", "is it too soon to ping", "triage my applied roles", "/followup".
- Body sections, in order:
  1. **Shell setup** — one line noting workspace auto-detection and `JFM_DIR` override, matching `skills/review/SKILL.md:19`.
  2. **Two modes** — one-paragraph overview of briefing vs single-role drafting, with a pointer that mode 2 is covered in a later section of the same file.
  3. **Mode 1 — Briefing: invocation and inputs** — `/jfm:followup` with no args; read state via `list` and `get-profile`; enumerate the three data reads and the "never parse yaml directly" constraint.
  4. **Timing framework (defaults)** — the five-band table. State that these are Director+/Principal-TPM tuned.
  5. **Cadence override mechanism** — `follow_up_cadence` block structure; how to read it from `get-profile`; fallback rule; in-conversation learning loop ("push back → skill offers to save → one-turn confirmation → `set-profile` call"); exact bash invocation.
  6. **Computing days-since-applied** — fallback order (`dates.applied` → `dates.identified` → `last_updated`) and why.
  7. **Briefing output format** — timing framework prose → per-role markdown table → summary by action → footer offers. Include a short worked example inline showing the expected structure.
  8. **Recommendation selection** — the two-stage function (band match, then signal overlay) with the decision matrix.
  9. **Footer actions (mode 1)** — enumerated opt-ins: close role, stamp follow-up date in notes, draft outreach (hands off to mode 2). Exact tracker.js command per action; note-preservation pattern (read then append then write).
  10. **Hard constraint callout** — "every tracker/profile/filters read and write goes through tracker.js, never yaml directly".
- SKILL.md body for mode 1 should be roughly the size of `skills/review/SKILL.md`. Unit 2 adds mode 2 to the same file.

**Patterns to follow:**
- `skills/review/SKILL.md` — tone, section ordering, tracker.js invocation style.
- `skills/update/SKILL.md:72-77` — note-preservation append pattern.
- `skills/apply/SKILL.md:1-11` — frontmatter shape.

**Test scenarios:**
- **Happy path:** Given a tracker.yaml with 5 applied roles at days 3, 12, 22, 35, and 50, running `/jfm:followup` produces a briefing with five rows mapped to the five bands and recommendations matching the decision matrix.
- **Happy path:** Given a role with `notes` containing "followed up 8 days ago, no response" at day 35, the recommendation shifts from "send final follow-up" to "consider closed".
- **Happy path:** Given a `profile.yaml` with `follow_up_cadence: {first_followup_days: 10}`, a role at day 12 receives a "send first follow-up" recommendation instead of "wait", and the timing framework section shows the overridden value with an "override in effect" note.
- **Edge case:** Given a role missing `dates.applied` (only `dates.identified`), the skill uses `dates.identified` and does not error.
- **Edge case:** Given a tracker.yaml with zero applied roles, the skill outputs a single-line message ("No roles in applied stage — your board is empty of applied work.") and exits without rendering the framework section.
- **Error path:** Given a corrupt `tracker.yaml`, the `list` call errors; the skill surfaces the error verbatim and does not attempt to mutate anything.
- **Integration scenario:** User says "21 days is too long for my market, I'd ping at 10". The skill proposes `set-profile --json '{"follow_up_cadence":{"first_followup_days":10}}'`, the user confirms, the skill executes the command, and a subsequent re-run reflects the new threshold.
- **Integration scenario:** User accepts a "close ActBlue now" offer from the footer. The skill runs `stage --id actblue-... --stage closed`, the board auto-rebuilds, and the skill confirms in one line.
- **Integration scenario:** User accepts a "stamp follow-up dates into notes" offer. The skill runs `get --id <id>`, appends a dated `follow_up_due` line, and writes back via `update --id <id> --json '{"notes":"..."}'`. Subsequent `get --id <id>` shows preserved prior notes plus the new line.
- **Integration scenario:** Mutation safety — presenting footer offers triggers zero tracker.js calls. Each offer executes only on explicit confirmation.

**Verification:**
- `/jfm:followup` on a representative board produces the four-section briefing.
- Every mutation is visible as a `node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js ...` bash command — no direct yaml edits.
- Re-running after a cadence override reflects the new thresholds.
- The skill never mutates state without an explicit per-action user confirmation.

---

- [ ] **Unit 2: Extend `skills/followup/SKILL.md` with mode 2 (single-role outreach drafting)**

**Goal:** Add the single-role outreach drafting mode to the same SKILL.md file — invocation, context loading, validating conversation, template shape, draft generation, file save, and advisory close.

**Requirements:** R10, R12, R13, R14, R15, R16, R17.

**Dependencies:** Unit 1 (mode 2 lives in the same file; mode 1 sections provide the timing context mode 2 references).

**Files:**
- Modify: `skills/followup/SKILL.md` (add mode 2 sections after mode 1)

**Approach:**
- Add a clearly-headed "Mode 2 — Single-role outreach drafting" section after the mode 1 sections from Unit 1. The section should include:
  1. **Invocation** — `/jfm:followup {company}`. Disambiguation behavior when multiple applied roles match. Refusal behavior when no applied role matches (short message, suggest running with no args).
  2. **Context loading** — the four reads via tracker.js (`find`, `get`, `paths`, `get-profile`) and the three silent markdown reads (`jd.md`, `cover-letter.md`, `overview.md`). Document what each read is used for.
  3. **Prior-draft detection** — if `{role_dir}/outreach.md` exists, read it and show a one-line summary ("Prior drafts from YYYY-MM-DD on file"). Ask whether to regenerate (overwrite) or append a dated section below.
  4. **Context card** — show company + role, days since applied, cadence band, and a terse list of what's already on file (cover letter: yes/no; JD: yes/no; overview: yes/no; warm contact mentioned in notes: yes/no).
  5. **Validating conversation rubric** — up to three questions, one at a time. The four question templates plus skip rules (skip strongest-alignment if cover letter has a clear one-liner; skip honest-gap if the assessment already flags one; always ask about warm path; ask mission-specific only if JD has a mission line).
  6. **Template shape** — the five required properties (lead with app fact + alignment, one concrete comparison, name the honest gap, 15-minute ask, ~130 words). State that platitudes about company mission are forbidden unless the user supplied a non-generic take.
  7. **Three variants** — cold hiring manager, warm intro ask (with forwardable blurb inline), recruiter/TA ping. Short description of when to use each.
  8. **Output file format** — a single `outreach.md` with:
     - Top block: metadata (role, days since applied, generated date, target send window derived from the active cadence)
     - One section per variant with a clear H2 heading and the draft body
     - Sequencing guidance: 2-3 sentences on which variant to try first given what the user shared
     - Advisory footer: "This skill drafts and saves. You send."
  9. **Save path** — `{role_dir}/outreach.md`, resolved via `paths --id <id>`.
  10. **Presentation** — use `present_files` to surface the file inline, matching `skills/apply/SKILL.md:57-64`.
  11. **Advisory close** — a one-paragraph reminder that the skill does not send, schedule, or transmit. Offer to re-draft a specific variant if the tone isn't right.
  12. **Handoff from mode 1** — document how the mode 1 footer's "draft outreach for {company}" offer hands off to mode 2 with the context already loaded, so the user doesn't re-walk the validation conversation for context the briefing already surfaced.
- The total SKILL.md length after Unit 2 should still be scannable. Reference `skills/followup/references/example-output.md` for the full briefing example and `skills/followup/references/outreach-example.md` for a full mode 2 example (Unit 3).

**Patterns to follow:**
- `skills/apply/SKILL.md:37-65` — load context via `paths`, read role-dir artifacts, generate new document, save to role directory, present inline.
- `skills/update/SKILL.md:72-77` — any in-body `update` call to append notes follows the read-preserve-write pattern.
- `skills/review/SKILL.md` — brisk tone for any inline prompts.

**Test scenarios:**
- **Happy path:** `/jfm:followup Affirm` on a board where Affirm has one applied role with an on-file cover letter and JD. The skill loads context, skips the strongest-alignment question (cover letter covers it), asks about warm path, asks about the honest gap, drafts three variants, and saves `{role_dir}/outreach.md` with all three variants plus sequencing guidance and a target send window.
- **Happy path:** `/jfm:followup Affirm` where the JD contains a mission-alignment line ("morally aligned with our vision"). The skill asks a fourth question about a mission-specific take before drafting.
- **Happy path:** `/jfm:followup Affirm` where the user says "just use what you have" to skip the validation conversation. The skill drafts based on on-file context only and surfaces a gentle one-line note flagging that the drafts may need adjustment.
- **Edge case:** `/jfm:followup Acme` where Acme has two applied roles. The skill asks which role and proceeds only after disambiguation.
- **Edge case:** `/jfm:followup Acme` where Acme has no applied role (maybe declined, closed, or never applied). The skill says so in one line and suggests running `/jfm:followup` with no args for a briefing instead.
- **Edge case:** `/jfm:followup Acme` where no cover letter, no JD, and no overview exist on file. The skill asks the full validation conversation (up to 3 questions) because nothing is pre-derivable, and the drafts are grounded only in what the user supplies.
- **Edge case:** `/jfm:followup Acme` where `{role_dir}/outreach.md` already exists. The skill reads it, shows the "prior drafts from YYYY-MM-DD on file" note, and asks regenerate vs append. On "append", the new section is dated and placed below existing content without overwriting.
- **Error path:** Role directory does not exist on disk (legacy flat layout). `paths --id <id>` returns a resolved path regardless; the skill creates any missing parent directories when writing `outreach.md`.
- **Integration scenario:** Mode 1 footer offers "Draft outreach for Zillow Principal TPM" → user accepts → mode 2 executes with context already loaded from the briefing pass, skipping re-reads the skill already has.
- **Integration scenario:** Boundary enforcement — the skill never attempts to drive a browser, access LinkedIn, or transmit the drafts. Every mode-2 run ends with the advisory-close reminder. Verify by inspecting the transcript of a full run.
- **Integration scenario:** Template validation — each of the three variants in the generated file is within 130±20 words, leads with the application fact, includes one concrete comparison, names a gap, and ends with a specific 15-minute ask. Verify by manual inspection on a representative role.

**Verification:**
- `/jfm:followup {company}` loads on-file context silently and asks at most three validating questions, skipping anything already answered.
- Generated `outreach.md` contains exactly three variants with the required structure and is saved to the canonical role directory.
- The mode 1 footer can hand off to mode 2 without re-asking for context.
- No send, schedule, or transmit action is ever taken.

---

- [ ] **Unit 3: Add `skills/followup/references/example-output.md` and `outreach-example.md` worked examples**

**Goal:** Provide concrete anchor outputs the skill can reference — one for mode 1's briefing shape and one for mode 2's full `outreach.md` file shape. Keeps SKILL.md focused on rules and decisions while giving the skill structural templates to match.

**Requirements:** R3, R8, R14, R15.

**Dependencies:** Unit 1 and Unit 2 (references them from SKILL.md).

**Files:**
- Create: `skills/followup/references/example-output.md` (mode 1 briefing)
- Create: `skills/followup/references/outreach-example.md` (mode 2 full outreach file)

**Approach:**
- **`example-output.md`**: use a synthetic 6-role board spread across the five timing bands. Show the full four-section briefing: timing framework prose → per-role markdown table (#, Company — Role, Days, Recommendation, Why) → summary by action buckets → footer offers. Include at least one example of each recommendation type plus one overlay variant (e.g., "verify comp first"). "Why" column entries must cite specific note content to model the evidence-backed reasoning style. ~80-120 lines.
- **`outreach-example.md`**: a full synthetic `outreach.md` file for one role (Affirm-style: fintech with a mission line). Include the top metadata block, the three variants (cold HM, warm intro ask with forwardable blurb, recruiter ping) each at ~130 words, the sequencing guidance paragraph, and the advisory footer. This file is the structural template the skill matches when writing real `outreach.md` files.
- Add SKILL.md references from Units 1 and 2 pointing to both files.
- Keep the outreach example specific enough that the model has a clear shape to hit, but synthetic enough that users don't accidentally copy the text verbatim.

**Patterns to follow:**
- `skills/search/references/routing.md` and similar for the `skills/{name}/references/` subdirectory convention.
- The origin doc's example conversation for briefing prose style.
- The conversation example the user shared for the outreach-file shape (three variants, sequencing, target window, advisory close).

**Test scenarios:**
- Test expectation: none — these are reference documents, not behavior-bearing units. Structural fidelity is verified by Unit 1 and Unit 2 integration scenarios producing output that matches the shape of each example.

**Verification:**
- SKILL.md references both files from the appropriate sections.
- Running `/jfm:followup` on a comparable board produces output structurally matching `example-output.md`.
- Running `/jfm:followup {company}` produces an `outreach.md` structurally matching `outreach-example.md`.

---

- [ ] **Unit 4: Update `skills/help/SKILL.md` to list `/followup` in the command menu**

**Goal:** Make `/jfm:followup` discoverable via `/jfm:help`.

**Requirements:** R11.

**Dependencies:** Unit 1 (skill must exist).

**Files:**
- Modify: `skills/help/SKILL.md`

**Approach:**
- Add one line under the "Managing your pipeline" section at roughly `skills/help/SKILL.md:26-29`:
  - `` `/followup` — Recommend next actions for your Applied roles, or draft outreach for a specific one ``
- Order it after `/update` and before `/board`.
- Add a contextual-help nudge at `skills/help/SKILL.md:42-47`: if the user has 3+ roles in `applied`, mention `/followup` as a next step.
- Do not expand the help output significantly.

**Patterns to follow:**
- Existing command-menu entries in `skills/help/SKILL.md`.

**Test scenarios:**
- **Happy path:** `/jfm:help` with 3+ applied roles includes both the `/followup` menu line and the contextual nudge.
- **Happy path:** `/jfm:help` with zero applied roles still lists `/followup` but does not surface the contextual nudge.
- Test expectation: manual smoke test only.

**Verification:**
- `/jfm:help` output includes `/followup` in the command menu.
- The 3+-applied-roles contextual branch mentions it.

---

- [ ] **Unit 5: Update `README.md` Commands table to include `/followup`**

**Goal:** Document `/jfm:followup` in the public README so Gumroad buyers see it alongside the existing commands.

**Requirements:** R11.

**Dependencies:** Unit 1.

**Files:**
- Modify: `README.md`

**Approach:**
- Add one row to the Commands table at `README.md:27-36`:
  - `` `/followup` `` · `Recommend next actions for Applied roles, or draft outreach for a specific one`
- Insert after the `/update` row, before `/prep`.
- No other README changes.

**Patterns to follow:**
- Existing Commands table at `README.md:27-36`.

**Test scenarios:**
- Test expectation: none — documentation change, verified by visual inspection.

**Verification:**
- `README.md` Commands table contains a `/followup` row.
- Row wording matches the skill's `user_summary` framing.

## System-Wide Impact

- **Interaction graph:** The skill consumes `tracker.yaml` via `list` / `get` / `find`, `profile.yaml` via `get-profile`, and role-directory markdown via `paths` + direct file reads. It potentially writes to tracker.yaml and profile.yaml via `stage` / `update` / `set-profile`, and writes `{role_dir}/outreach.md` directly (same pattern as `/jfm:apply` writing `cover-letter.md`). No other state is touched. Board auto-rebuild is handled by tracker.js for tracker mutations.
- **Error propagation:** All tracker.js errors propagate to the user verbatim. Markdown reads from the role directory fail silently — if `jd.md` or `cover-letter.md` don't exist, the skill just notes that in the mode-2 context card and proceeds with whatever is available.
- **State lifecycle risks:** The mode 1 note-append pattern requires reading current notes before writing to avoid clobbering — handled by `get --id` then `update --id --json '{"notes":"<preserved>\n<new line>"}'`, matching `skills/update/SKILL.md:72-77`. Mode 2's `outreach.md` write uses the regenerate-or-append prompt to avoid silently overwriting existing drafts.
- **API surface parity:** None — new skill, no shared API surface. Briefing output is ephemeral chat; outreach drafts are persisted files in a role directory (following the existing role-document pattern).
- **Integration coverage:** Cross-layer interaction with `/jfm:review stale`: stamping a `follow_up_due` note resets `last_updated` to today, which suppresses the role from `/jfm:review stale`'s 14-day detection. This is intentional (the user has committed to a follow-up date). A future `/jfm:review` enhancement to honor `follow_up_due` is out of scope here but noted in Future Considerations.
- **Unchanged invariants:** `scripts/tracker.js` is not modified. `tracker.yaml` schema is unchanged. The `profile.yaml` schema gains an optional `follow_up_cadence` block, but its absence is valid. Existing skills (`/jfm:review`, `/jfm:update`, `/jfm:apply`, `/jfm:prep`) are not edited except for the single menu-entry change in `/jfm:help`. The role-directory convention (`{role_dir}/jd.md`, `cover-letter.md`, `prep.md`, `resume.md`) gains one new filename (`outreach.md`) without touching any existing ones.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Skill accidentally edits a yaml file directly, violating the hard constraint | SKILL.md includes an explicit "never edit yaml directly" callout. Unit 1 and Unit 2 verification both check that every tracker mutation is visible as a tracker.js bash invocation. |
| Days-since-applied silently falls back to `last_updated` for all roles because `dates.applied` is missing on legacy entries | Three-level fallback chain handles this gracefully. Skill should note in output when it's falling back so the user knows the calculation is approximate for that row. Deferred-to-implementation polish item. |
| Note-stamping clobbers existing notes | Unit 1 requires the read-then-append pattern; follows `skills/update/SKILL.md:72-77`. |
| Cadence override clobbers other profile.yaml keys | `set-profile` shallow-merges one level deep (`scripts/tracker.js:965`). Verified in Unit 1 integration scenarios. |
| `/jfm:review stale` behavior diverges confusingly after follow-up stamps | Documented in System-Wide Impact and flagged as intentional. One-line user-facing note in the skill's footer. Future `/jfm:review` enhancement is out of scope. |
| Mode 2 validation conversation turns into a Q&A interrogation | Hard cap of three questions, skip rules for each, and an escape hatch ("just use what you have") documented in SKILL.md. Verified in Unit 2 test scenarios. |
| Mode 2 drafts generic platitudes about company mission | Template rubric forbids mission platitudes unless the user supplied a non-generic take during validation. Unit 2 verification checks this on a representative role. |
| Mode 2 accidentally sends or transmits outreach | Hard boundary enforced in SKILL.md ("draft, save, advise — never send") and reiterated in every mode-2 run's advisory close. Unit 2 integration scenarios verify no transmit action is taken. |
| Mode 2 clobbers existing `outreach.md` on re-run | Prior-draft detection step reads existing file, shows a "prior drafts on file" note, and asks regenerate vs append before writing. |
| Output too long to scan for 10+ applied roles (mode 1) | Summary-by-action section is the primary scanning surface; the per-role table is reference. Manual verification with a 10-role fixture. |
| No automated tests means regressions slip through | Accept for v1 (matches repo convention). Manual smoke scenarios enumerated per unit. Future investment in skill-level integration testing benefits the whole plugin. |

## Documentation / Operational Notes

- No release coordination required. New skill is additive; existing behavior unchanged.
- Follow `RELEASING.md` when shipping.
- After merge, run a manual smoke test against the author's own tracker.yaml (the source of the brainstorm example) for both modes: `/jfm:followup` for the full briefing, and `/jfm:followup Affirm` for single-role drafting. Verify the Affirm case produces drafts that match the shape the user sketched in the brainstorm prompt.
- Consider mentioning the new command in the next release notes and, if significant, in a Gumroad update email.

## Future Considerations

Not built in v1 but worth noting:

- **v1.1: `/jfm:review stale` honors `follow_up_due` stamps.** Add a parser that scans notes for `YYYY-MM-DD: follow_up_due` lines and surfaces roles whose stamped date has arrived.
- **v1.1: `list-applied` tracker.js command** that pre-computes `days_since_applied`. Would eliminate per-role work if the skill needs richer per-role data later.
- **v1.1: Mode 2 refinement loop** — after presenting the drafts, offer "regenerate variant N with [adjustment]" without requiring a full re-run.
- **v2: Expand `/jfm:followup` to Interviewing stage.** Same briefing pattern plus a "thank-you note" mode 2 variant for post-interview follow-ups.
- **v2: Send-draft-via-email integration.** Only if the user explicitly opts in and provides a send mechanism. Default remains draft-only.

## Sources & References

- **Origin document:** `docs/brainstorms/jfm-followup-requirements.md`
- Related code: `scripts/tracker.js`, `skills/review/SKILL.md`, `skills/update/SKILL.md`, `skills/apply/SKILL.md`, `skills/prep/SKILL.md`, `skills/help/SKILL.md`
- Related learnings: `docs/solutions/integration-issues/cowork-plugin-runtime-constraints-2026-03-30.md`
- Plugin manifest: `.claude-plugin/plugin.json` (name: jfm, auto-namespaces `skills/followup` as `jfm:followup`)
