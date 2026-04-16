# Example Mode 1 briefing output

This is a synthetic target for what `/jfm:followup` should produce when run against a board with six Applied roles spread across the five timing bands. It's not a real user's board — names and details are made up. Use it as a structural anchor when rendering the real thing.

---

## Timing framework

I'm using a Director+/Principal-TPM cadence. These are day-bands, not hard numbers — senior roles run slower than IC and 30–60 day cycles from application to first screen are normal.

| Phase | Days | What it means |
|---|---|---|
| Normal silence | 1–14 | Silence is expected. No action. |
| Warm-contact window | 15–21 | Quietly activate referrals if any exist. |
| First follow-up | 21–30 | Short no-pressure recruiter or hiring-manager note. |
| Final follow-up | 30–45 | Last polite re-assertion of interest. |
| Consider closed | 45+ | Move to closed unless you have a direct signal of life. |

You're running defaults — no `follow_up_cadence` overrides in your profile. If your market runs faster or slower, push back and I'll save the tweak.

## Per-role recommendations

| # | Company — Role | Days | Recommendation | Why |
|---|---|---|---|---|
| 1 | ActBlue — Principal, Program & Ops Mgmt | 34 | **Send final follow-up, then close** | You already followed up with Jacqueline Edwards on 2026-03-07 per notes — no response after 8 days. Mission fit is strong but the signal is weak. One last ping this week; if nothing by 2026-04-20, move to closed. |
| 2 | G-P — Head of Program Management | 29 | **Send final follow-up** | You pinged Emilia Los on 2026-03-07. Notes also flag the role as reposted — a negative signal. Give the follow-up until 2026-04-16, then reassess. |
| 3 | Capital One — Sr. Director TPM | 18 | **Wait** | Capital One is slow-moving enterprise; 18 days is squarely normal. Plan a LinkedIn note to the listed recruiter around 2026-04-20 (day ~28). No action today. |
| 4 | Code for America — Sr. Director, Program Delivery | 17 | **Verify comp range first** | Nonprofit hiring is slow and the assessment flagged comp as possibly below your floor ($130K–$175K est). Before spending more energy, verify the actual posted range. If confirmed below floor, close it. If higher, follow up around 2026-04-21. |
| 5 | Zillow — Principal TPM, Customer Fulfillment Eng | 9 | **Activate warm contact now** | Notes mention you know a Principal TPM at Zillow already — internal referral is worth more than 30 days of waiting silently. Send a short "I applied for this role, would you mind flagging me to the hiring manager?" note this week. |
| 6 | Guild — Principal TPM | 3 | **Wait** | Just submitted. Nothing to do — notes empty — base recommendation only. First action window ~2026-04-28. |

## Summary by action

**Send a message this week:**
- ActBlue (final ping, then close if no response by 2026-04-20)
- G-P (final ping, deadline 2026-04-16)
- Zillow Principal TPM (activate your internal referral)

**Decision point in ~1 week:**
- Code for America (verify the posted comp range before investing more)

**Pure wait — plan for later:**
- Capital One (first follow-up target: 2026-04-20)
- Guild (first action window: 2026-04-28)

## Footer — opt-in actions

No status changes have been made. If you want, I can:

- **Close ActBlue and/or G-P** now if the final pings have already gone out and nothing came back. (One `stage` call each, one confirmation each.)
- **Stamp follow-up dates into notes** so they hide from `/jfm:review stale` until the stamped date approaches. Capital One at 2026-04-20, Guild at 2026-04-28, and so on.
- **Draft outreach for Zillow Principal TPM** right now — I'll load the JD and cover letter if they're on file and we can get a ~130-word note ready in two minutes. (Drops into single-role drafting mode.)
- **Save a cadence tweak** if any of these bands feel wrong for your market.

Which ones?

---

*Notes on this example:*

- Every "why" cell cites concrete evidence from notes, assessment flags, or specific dates. None say "strong fit" or "looks promising" without naming what.
- The two stale roles (ActBlue, G-P) use the *final follow-up* band because they've had prior activity logged — overlay logic upgraded the base recommendation.
- Code for America uses a *verify comp first* overlay instead of a timing-band recommendation because the assessment flagged a comp concern worth resolving before any outreach effort.
- Zillow at 9 days would normally be "wait" per the bands, but the warm-contact overlay upgrades it because a known referral path exists.
- Guild at 3 days has empty notes, so the recommendation is the unadjusted base band.
- The footer offers specific companies by name, not generic "would you like to close some roles?" — specificity is the whole point.
