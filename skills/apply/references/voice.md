# Cover Letter Voice and Structure

Loaded by the apply skill before generating any cover letter or tailored
resume. Contains the principles, mechanical rules, anti-pattern list,
anti-fabrication rule, no-subtitle rule, and the cover letter template.

The cover letter must sound like the user, not like a template. Read
`profile.yaml` → `writing_voice` (a free-form block scalar of the user's
voice rules) before drafting and apply it on top of everything below. The
user maintains that field as their durable voice memory — anything they've
corrected more than once should be there.

## Principles

- **Short** — 150-250 words. No padding, no filler.
- **Personal hook** — Open with a specific connection to the company or role,
  not "I'm writing to apply for…" Something concrete: a product the user has
  used, a person they know there, a problem they've solved that maps directly.
- **Evidence-linked** — Don't restate the resume. Link to 2-3 specific examples
  from the user's portfolio or blog that demonstrate fit. The user's website
  IS their portfolio.
- **Honest about gaps** — If there's a gap the JD highlights, address it
  briefly and honestly rather than ignoring it.
- **Simple close** — "Thanks," or "I hope to hear from you." No grandiose
  closing.
- **No buzzwords** — No "synergy", "leverage", "passionate about", "excited to
  bring my skills". Use plain language.

## Mechanical voice rules

These apply to cover letters, resumes, `agent_summary` blocks, and any
markdown the agent writes for the user:

- **Em dashes have no surrounding spaces.** `word—word`, never `word — word`.
- **One space after a period**, never two.
- **Smart quotes are fine** when the editor preserves them; straight quotes
  (`'` `"`) are fine when it doesn't. Don't mix within a document.

## Voice — patterns to cut on sight

These all read as pitch / sales voice and must be removed. The closer is
"state the fact, link the evidence, stop":

- "caught my attention because…" / "what excites me about…" — pitch-hook framing
- "I'd bring that playbook to…" / "I'd hit the ground running" — active selling
- "A couple of pieces of evidence" / "let me share why I'm a fit" — casemaking
  preamble
- "isn't abstract for me" / "the underlying work is the same" — performative
  confidence
- "it reads like a role I'd interview for anywhere" — self-promotional
- "The IC depth is real" / similar defensive self-promotion
- Any closing crescendo: "I'd love the chance to…", "excited to bring…",
  "ready to dive in"

Replace with concrete role/charter overlap. "I built this at GitHub. Details
at [link]." beats "I'd bring my proven playbook to scale your TPM org."

## Never fabricate inner thoughts, history, or feelings

Hooks must come from facts the user provided or public evidence (resume, blog,
profile.yaml, prior employers, location, public talks). Do not invent:

- Emotional framing — "excited about", "long admired", "always wanted to
  work on X"
- Personal history of interest — "I've watched X for years", "I've been using
  X since…", "I've been thinking about X"
- Inferred opinions — "I love what you're building" (unless the user said so)

If a hook needs a personal connection and you don't have one, ask the user —
or write a hook that leads with concrete role/charter overlap instead.

## No "Tailored for…" subtitle

Applies to BOTH the cover letter and the tailored resume.

**No "Tailored for {Company} — {Role}" subtitle, tagline, or italic header
line.** The folder and filename convey it. Putting it in the document signals
customization to the hiring manager and adds noise.

- **Cover letter header**: `# Cover Letter — {Company}, {Role}` (the H1 gets
  stripped at PDF render — see `pdf-rendering.md`) → blank line → date →
  blank line → salutation. No subtitle.
- **Resume header**: `# {Candidate Name}` → blank line → contact line →
  `## Summary`. Nothing in between.

## Cover letter template

```
# Cover Letter — {Company}, {Role}

{Date}

Dear {hiring contact, or "Hiring team" if unknown},

{Personal hook — 1-2 sentences connecting to the company/role}

{Core pitch — 2-3 sentences on why the user is a strong fit, with inline links to evidence}

{Gap acknowledgment if relevant — 1 sentence}

{Simple close}

{User's name}
{Contact info from profile.yaml}
{Portfolio URL}
```
