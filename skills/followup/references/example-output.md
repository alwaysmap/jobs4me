# Example Mode 1 briefing output

This is a synthetic target for what `/jfm:followup` should produce when run against a board with six Applied roles spread across the five timing bands. The names, roles, and details are placeholder — generated to illustrate shape, not to anchor on any specific role type. Use it as a structural anchor when rendering the real thing.

---

## Timing framework

I'm using the senior-management cadence — day-bands, not hard numbers. Senior roles run slower than IC and 30–60 day cycles from application to first screen are normal at director level and above.

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
| 1 | Acme Corp — Principal, Program & Ops | 34 | **Send final follow-up, then close** | You already followed up with the recruiter on 2026-03-07 per notes — no response after 8 days. Fit is strong but the signal is weak. One last ping this week; if nothing by 2026-04-20, move to closed. |
| 2 | BigCo — Head of Program Management | 29 | **Send final follow-up** | You pinged the hiring manager on 2026-03-07. Notes also flag the role as reposted — a negative signal. Give the follow-up until 2026-04-16, then reassess. |
| 3 | EnterpriseCo — Sr. Director, Engineering | 18 | **Wait** | EnterpriseCo is slow-moving; 18 days is squarely normal. Plan a LinkedIn note to the listed recruiter around 2026-04-20 (day ~28). No action today. |
| 4 | NonProfitX — Sr. Director, Program Delivery | 17 | **Verify comp range first** | Nonprofit hiring is slow and the assessment flagged comp as possibly below your floor ($130K–$175K est). Before spending more energy, verify the actual posted range. If confirmed below floor, close it. If higher, follow up around 2026-04-21. |
| 5 | StartupY — Principal Engineer, Customer Fulfillment | 9 | **Activate warm contact now** | Notes mention you know a Principal Engineer at StartupY already — internal referral is worth more than 30 days of waiting silently. Send a short "I applied for this role, would you mind flagging me to the hiring manager?" note this week. |
| 6 | TinyCo — Principal Designer | 3 | **Wait** | Just submitted. Nothing to do — notes empty — base recommendation only. First action window ~2026-04-28. |

## Summary by action

**Send a message this week:**
- Acme Corp (final ping, then close if no response by 2026-04-20)
- BigCo (final ping, deadline 2026-04-16)
- StartupY Principal Engineer (activate your internal referral)

**Decision point in ~1 week:**
- NonProfitX (verify the posted comp range before investing more)

**Pure wait — plan for later:**
- EnterpriseCo (first follow-up target: 2026-04-20)
- TinyCo (first action window: 2026-04-28)

## Footer — opt-in actions

No status changes have been made. If you want, I can:

- **Close Acme Corp and/or BigCo** now if the final pings have already gone out and nothing came back. (One `stage` call each, one confirmation each.)
- **Stamp follow-up dates into notes** so they hide from `/jfm:review stale` until the stamped date approaches. EnterpriseCo at 2026-04-20, TinyCo at 2026-04-28, and so on.
- **Draft outreach for StartupY Principal Engineer** right now — I'll load the JD and cover letter if they're on file and we can get a ~130-word note ready in two minutes. (Drops into single-role drafting mode.)
- **Save a cadence tweak** if any of these bands feel wrong for your market.

Which ones?

---

*Notes on this example:*

- Every "why" cell cites concrete evidence from notes, assessment flags, or specific dates. None say "strong fit" or "looks promising" without naming what.
- The two stale roles (Acme Corp, BigCo) use the *final follow-up* band because they've had prior activity logged — overlay logic upgraded the base recommendation.
- NonProfitX uses a *verify comp first* overlay instead of a timing-band recommendation because the assessment flagged a comp concern worth resolving before any outreach effort.
- StartupY at 9 days would normally be "wait" per the bands, but the warm-contact overlay upgrades it because a known referral path exists.
- TinyCo at 3 days has empty notes, so the recommendation is the unadjusted base band.
- The footer offers specific companies by name, not generic "would you like to close some roles?" — specificity is the whole point.
