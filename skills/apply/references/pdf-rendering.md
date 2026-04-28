# PDF Rendering for Application Materials

Canonical setup for converting `cover-letter.md` and `resume.md` to PDF. Uses
pandoc + xelatex with TeX Gyre Pagella (Palatino-like serif) for body and Lato
(humanist sans) for headings. The PDFs are what the user submits — markdown is
the editable source.

## Why this setup

- **Pagella body + Lato sans headings** — pairs well, looks modern but not
  corporate. Do NOT use TeX Gyre Heros or any Helvetica clone.
- **Header file via `-H`** — multi-line `-V "header-includes=..."` content
  gets mangled at the shell layer and titlesec overrides silently fail. Use a
  separate `header.tex` file.
- **Hierarchical heading sizes** — H1 > H2 > H3 > H4. On a resume, H3 (company
  name) MUST be visibly larger than H4 (role title) — pandoc's default
  mapping otherwise inverts the hierarchy.
- **1.25" left/right margins, 1.0" top/bottom** — classic letter look without
  crowding.
- **Muted navy links** (`#214F99`) — present but not loud.

## Prerequisites

If any of these is missing, tell the user the exact `brew` command to run
before retrying:

- `brew install pandoc`
- `brew install --cask mactex-no-gui`
- `brew install --cask font-lato` (only if Lato isn't installed)

## header.tex

Write to `/tmp/jfm-header.tex` (or any temp path you reuse across renders):

```latex
\usepackage{titlesec}

% H1 (resume name / doc title): display size
\titleformat{\section}{\Huge\bfseries\sffamily}{}{0em}{}
\titlespacing*{\section}{0pt}{0pt}{0.6em}

% H2 (Summary, Skills, Work Experience)
\titleformat{\subsection}{\LARGE\bfseries\sffamily}{}{0em}{}
\titlespacing*{\subsection}{0pt}{1.5em}{0.5em}

% H3 (company names): MUST be larger than H4
\titleformat{\subsubsection}{\Large\bfseries\sffamily}{}{0em}{}
\titlespacing*{\subsubsection}{0pt}{1.2em}{0.3em}

% H4 (role title at a company)
\titleformat{\paragraph}[hang]{\large\bfseries\sffamily}{}{0em}{}
\titlespacing*{\paragraph}{0pt}{0.8em}{0.3em}

% Resume styling: no paragraph indent, consistent vertical rhythm
\setlength{\parindent}{0pt}
\setlength{\parskip}{0.4em}
```

## Render command

```bash
pandoc INPUT.md \
  -o OUTPUT.pdf \
  --pdf-engine=xelatex \
  -H /tmp/jfm-header.tex \
  -V mainfont="TeX Gyre Pagella" \
  -V sansfont="Lato" \
  -V monofont="TeX Gyre Cursor" \
  -V fontsize=11pt \
  -V geometry:"top=1.0in, bottom=1.0in, left=1.25in, right=1.25in" \
  -V linestretch=1.15 \
  -V colorlinks=true \
  -V urlcolor="[rgb]{0.13,0.33,0.60}" \
  -V linkcolor="[rgb]{0.13,0.33,0.60}"
```

## H1 handling

- **Resume**: keep the `# Candidate Name` H1 — it renders as the large name
  header at the top.
- **Cover letter**: strip the `# Cover Letter — {Company}, {Role}` H1 before
  rendering. The H1 is filename-equivalent metadata, not display content.

  ```bash
  sed '1{/^# /d;}' cover-letter.md > /tmp/cl-stripped.md
  pandoc /tmp/cl-stripped.md -o cover-letter.pdf ...
  ```

## End-to-end

A typical render of both documents from a role directory:

```bash
HEADER=/tmp/jfm-header.tex
cat > "$HEADER" <<'TEX'
\usepackage{titlesec}
\titleformat{\section}{\Huge\bfseries\sffamily}{}{0em}{}
\titlespacing*{\section}{0pt}{0pt}{0.6em}
\titleformat{\subsection}{\LARGE\bfseries\sffamily}{}{0em}{}
\titlespacing*{\subsection}{0pt}{1.5em}{0.5em}
\titleformat{\subsubsection}{\Large\bfseries\sffamily}{}{0em}{}
\titlespacing*{\subsubsection}{0pt}{1.2em}{0.3em}
\titleformat{\paragraph}[hang]{\large\bfseries\sffamily}{}{0em}{}
\titlespacing*{\paragraph}{0pt}{0.8em}{0.3em}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0.4em}
TEX

PANDOC_FLAGS=(
  --pdf-engine=xelatex
  -H "$HEADER"
  -V mainfont="TeX Gyre Pagella"
  -V sansfont="Lato"
  -V monofont="TeX Gyre Cursor"
  -V fontsize=11pt
  -V geometry:"top=1.0in, bottom=1.0in, left=1.25in, right=1.25in"
  -V linestretch=1.15
  -V colorlinks=true
  -V urlcolor="[rgb]{0.13,0.33,0.60}"
  -V linkcolor="[rgb]{0.13,0.33,0.60}"
)

# Cover letter — strip the H1 before rendering
sed '1{/^# /d;}' cover-letter.md > /tmp/cl-stripped.md
pandoc /tmp/cl-stripped.md -o cover-letter.pdf "${PANDOC_FLAGS[@]}"

# Resume — keep the H1 as the name header
[ -f resume.md ] && pandoc resume.md -o resume.pdf "${PANDOC_FLAGS[@]}"
```

After rendering, `present_files` the PDFs alongside the markdown sources.
