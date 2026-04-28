# Follow-up Timing Framework

Loaded by the followup skill before computing per-role recommendations in
Mode 1. Defines the cadence bands, the override mechanism, and the
days-since-applied source-of-truth rules.

## Default cadence bands

These are tuned for senior management and senior-IC roles. Senior cycles
trend slower than mid-level — 30–60 day cycles from application to first
screen are normal at director level and above, and summer/holiday lulls
stretch that further. Adjust the bands via `follow_up_cadence` (below) if
your market is faster.

| Phase | Days since applied | Default action |
|---|---|---|
| Normal silence | 1–14 | Wait. No action needed. |
| Warm-contact window | 15–21 | Activate warm contacts quietly if any exist. |
| First follow-up | 21–30 | Short, no-pressure recruiter or hiring-manager note. |
| Final follow-up | 30–45 | Last polite re-assertion of interest. |
| Consider closed | 45+ | Move to closed unless there's a direct signal of life. |

These are band boundaries, not single numbers.

## User-tunable cadence

The user can override any individual threshold via an optional
`follow_up_cadence` block in `profile.yaml`:

```yaml
follow_up_cadence:
  normal_silence_days: 14
  warm_contact_days: 15
  first_followup_days: 21
  final_followup_days: 30
  consider_closed_days: 45
```

If the block is absent, defaults apply. If some keys are present and
others missing, missing keys fall back to defaults individually.

## Tuning conversationally

If the user pushes back on a threshold during a run ("21 days is too long
for my market, I'd ping at 10"), offer to save the change in one turn:

> Got it. Want me to save `first_followup_days: 10` as your default?
> Future runs will use it.

On yes, persist via `tracker.js set-profile` — the existing shallow-merge
semantics handle nested blocks without clobbering siblings:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js set-profile \
  --json '{"follow_up_cadence":{"first_followup_days":10}}'
```

Same learning loop as decline patterns in the review skill. Users never
have to read a config schema.

## Computing days-since-applied

Use `app.dates.applied` as the source of truth — it's set when the role
enters the applied stage and never resets on subsequent edits.

Fallback order if the preferred field is missing:

1. `app.dates.applied` (preferred — set when the stage transitions to
   applied)
2. `app.dates.identified` (when the role was first added to the tracker)
3. `app.last_updated` (last touched — approximate)

If the skill had to fall back to `dates.identified` or `last_updated` for
a row, note it in the "why" column so the user knows the day count is
approximate for that role.

**Do not use `last_updated` as the primary source.** It's rewritten on
every edit, including note appends — which would corrupt the clock for
any role whose notes have been touched.

## Recommendation selection

Two-stage function inside the skill prompt, not code.

### Stage 1 — base recommendation from the cadence bands

| Days since applied | Base recommendation |
|---|---|
| `< normal_silence_days` (default 14) | Wait |
| `< warm_contact_days` (default 15) | Wait (warm-contact prompt if any exists) |
| `< first_followup_days` (default 21) | Activate warm contact if any; otherwise wait |
| `< final_followup_days` (default 30) | Send first follow-up |
| `< consider_closed_days` (default 45) | Send final follow-up |
| `>= consider_closed_days` | Consider closed |

### Stage 2 — overlay signals from the role record

Read `notes`, `agent_summary`, and `decision.reason` for signals that
upgrade, downgrade, or replace the base recommendation:

| Signal in notes / summary | Overlay |
|---|---|
| Prior follow-up with no response after 8+ days | Shift to *send final follow-up* or *consider closed* |
| Warm contact or referral mentioned | Prioritize *activate warm contact* / *activate referral now* |
| Assessment flagged comp below floor | *verify comp range first* — don't spend more energy until resolved |
| Posting flagged as reposted | Negative signal — push toward *consider closed* |
| Mission-alignment JD line noted | Add "find a warm path" emphasis in the Why column |
| Empty notes | Use base recommendation unchanged; note "notes empty" in Why |

Apply overlays in order; the last one wins when multiple apply.

## Stamping a follow-up date

Read existing notes first, then append a dated line. The format is fixed —
greppable for future stale-detection:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js get --id <id>

node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js update --id <id> \
  --json '{"notes":"<existing notes>\n2026-04-20: follow_up_due — send first ping to recruiter"}'
```

Canonical format: `YYYY-MM-DD: follow_up_due — <one-line reason>`. Always
preserve existing notes — never overwrite them.

**Interaction with the review skill's stale view:** stamping a follow-up
date resets `last_updated` to today, which drops the role out of stale
detection. This is intentional — after the user has committed to a
follow-up date, the role should stop surfacing as "stale" until the
stamped date approaches. Flag this briefly after the first stamp in a
session.
