# Sub-Agent Model Selection

Use this table when launching sub-agents for tasks within the search,
prep, apply, or assess flows.

| Task | Model | Why |
|------|-------|-----|
| Fit assessment (per batch) | **Sonnet** | Structured rubric — fast, accurate |
| Company overview research | **Sonnet** | Web search + structured summary |
| JD extraction from URL | **Haiku** | Simple content extraction (promote to Sonnet if aggregator/snippet fallback was needed) |
| Interview prep generation | **Opus** | Deep experience mapping |
| Cover letter writing | **Opus** | Voice-sensitive writing |
| Decline pattern analysis | **Sonnet** | Pattern matching |

The general principle: structured rubrics with clear input shapes go to
Sonnet (fast, accurate enough). Voice-sensitive or deeply-reasoned work
(cover letters, interview prep) goes to Opus. Mechanical extraction (raw
text from a fetched URL) goes to Haiku, with promotion to Sonnet if the
extraction needed a fallback path because that signals the input is messy.
