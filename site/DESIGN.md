---
name: Stead
description: A surveyed plat of your own backend, drawn in green ink on linen paper.
colors:
  linen-paper: "#f1ece0"
  linen-paper-shade: "#e8e1d0"
  survey-ink: "#1d3b34"
  body-graphite: "#2b2b2b"
  muted-lichen: "#4d5a54"
  boundary-rust: "#a8431f"
  on-rust: "#fbf7ee"
  night-paper: "#0f1f1b"
  night-paper-shade: "#162924"
  night-ink: "#cfe0cd"
  night-text: "#e6e2d6"
  night-muted: "#a9b8ae"
  night-rust: "#e58259"
  night-on-rust: "#1a0e08"
typography:
  display:
    fontFamily: "Josefin Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(2.6rem, 6.4vw, 5.4rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Josefin Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.7rem, 3.4vw, 2.6rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Josefin Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 600
    lineHeight: 1.08
  body:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Josefin Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    letterSpacing: "0.14em"
  code:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.84rem"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  none: "0px"
  focus: "2px"
spacing:
  gutter: "clamp(16px, 4vw, 40px)"
  grid-cell: "48px"
  field-pad: "14px 16px 16px"
  lot-pad: "22px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.survey-ink}"
    rounded: "{rounded.none}"
    padding: "14px 22px"
    height: "48px"
  button-hover:
    backgroundColor: "{colors.survey-ink}"
    textColor: "{colors.linen-paper}"
  button-solid:
    backgroundColor: "{colors.survey-ink}"
    textColor: "{colors.linen-paper}"
    rounded: "{rounded.none}"
    padding: "14px 22px"
    height: "48px"
  button-solid-hover:
    backgroundColor: "transparent"
    textColor: "{colors.survey-ink}"
  button-github:
    backgroundColor: "{colors.boundary-rust}"
    textColor: "{colors.on-rust}"
    rounded: "{rounded.none}"
    padding: "14px 22px"
    height: "48px"
  button-github-hover:
    backgroundColor: "{colors.survey-ink}"
    textColor: "{colors.linen-paper}"
  title-block:
    backgroundColor: "{colors.linen-paper}"
    textColor: "{colors.survey-ink}"
    rounded: "{rounded.none}"
  field-input:
    backgroundColor: "{colors.linen-paper-shade}"
    textColor: "{colors.body-graphite}"
    rounded: "{rounded.none}"
    padding: "11px 12px"
    height: "46px"
  schedule-head:
    backgroundColor: "{colors.survey-ink}"
    textColor: "{colors.linen-paper}"
    padding: "12px 16px"
  lot-tag:
    backgroundColor: "{colors.linen-paper}"
    textColor: "{colors.survey-ink}"
    padding: "6px 10px"
---

# Design System: Stead

## Overview

**Creative North Star: "The Survey Plat"**

Every page is a sheet from a land surveyor's drawer. Linen paper carries a faint 48px drafting grid, a double-ruled map border frames the content, and deep green survey ink does all the drawing. Projects are lots, schema boundaries are fence lines, the compose stack is a title block. The voice is exact, hand-measured and calm: hairline and 2px rules, square corners, uppercase draughtsman lettering for labels, and a readable book serif for everything that is prose.

Density is moderate and structural. Content is organised by ruled boxes (title block, plat, schedule table, survey form) rather than by cards floating on a surface. Rust is the only warm voice and it is rationed to two marks: the GitHub button and the corner marker of the live lot. Everything else, including focus, links, nav state and every other button, is ink on paper. A dark variant ("night plat") follows `prefers-color-scheme` with the same roles remapped.

**Key Characteristics:**
- Linen paper with a 7%-ink 48px grid; ink-only linework
- Double-ruled sheet border (1px outer, 5px gap, 2.5px inner)
- Square corners everywhere; no shadows
- Three-face system: Josefin Sans for lettering, Source Serif 4 for prose, JetBrains Mono for commands and schema names
- Solid line = built, dashed or hatched = not yet built
- Fonts self-hosted from assets/fonts via assets/fonts.css (no third-party font requests)

## Colors

A two-pigment palette: green ink and rust on warm paper, with graphite for reading text.

### Primary
- **Survey Ink** (#1d3b34): All linework, headings, links and link hover, wordmark, table header fill, outline and solid buttons, nav current-page underline, focus rings, caret and form accent, status text, placeholder-todo marks, selection fill. The default drawing color.
- **Boundary Rust** (#a8431f): Used in exactly two places: the GitHub primary button (`.btn-github`, on-rust text #fbf7ee) and the 10px corner marker on the live lot. Nothing else.

### Neutral
- **Linen Paper** (#f1ece0): Page ground and raised panels (title block, schedule, form, lot tags).
- **Linen Shade** (#e8e1d0): Recessed surfaces: input fields, code blocks, the install command strip, scrollbar track.
- **Body Graphite** (#2b2b2b): Reading text.
- **Muted Lichen** (#4d5a54): Secondary text, hints, bearings, byline, captions, placeholders.
- **Rule** (ink at 28% alpha) for interior dividers; **Grid** (ink at 7% alpha) for the background drafting grid. Both are derived from Survey Ink.

### Night plat (dark)
Night Paper (#0f1f1b), Night Shade (#162924), Night Ink (#cfe0cd), Night Text (#e6e2d6), Night Muted (#a9b8ae), Night Rust (#e58259) with Night On-Rust (#1a0e08). Same roles, same rules; rust lightens to hold contrast.

### Named Rules
**The Rust Is Rationed Rule.** Rust appears only on the GitHub button and the live-lot corner marker. Focus, nav current page, link hover, form accents and error text are ink. Every other primary button is ink-filled (`.btn-solid`). Never rust on headings, decoration, dividers or other buttons.
**The Ink-Only Linework Rule.** Every rule, border and grid line is Survey Ink at full strength or at a stated alpha. No grays, no tinted dividers of another hue.

## Typography

**Display / Label Font:** Josefin Sans (Helvetica Neue, Arial, sans-serif), weights 600 and 700
**Body Font:** Source Serif 4 (Georgia, Times New Roman, serif), optical sizing auto, with italic
**Code Font:** JetBrains Mono (ui-monospace, SFMono-Regular, Menlo, monospace)

**Character:** Geometric draughtsman capitals set against a warm book serif. Headings and labels read as lettering on a drawing; paragraphs read as a note in the margin.

### Hierarchy
- **Display** (700, clamp(2.6rem, 6.4vw, 5.4rem), 1.08, -0.02em): The base h1 size. The home hero steps down to clamp(2.3rem, 4.8vw, 4.1rem); article and contact h1 to clamp(2.2rem, 5vw, 3.6rem) and clamp(2.2rem, 4.6vw, 3.6rem).
- **Headline** (700, clamp(1.7rem, 3.4vw, 2.6rem), 1.08, -0.01em): Section h2, with 3.5rem space above.
- **Title** (600, 1.3rem; 1.35rem inside lots, 1.08): h3 and lot names.
- **Body** (400, 1.125rem, 1.6): Prose, capped at 68ch. Hero lede runs clamp(1.05rem, 1.35vw, 1.2rem), max 34em.
- **Label** (600 to 700, 0.72 to 0.9rem, 0.08 to 0.14em tracking, uppercase): Nav, buttons, table heads, form labels, lot tags, title-block keys, byline. Always Josefin, always uppercase, always tracked.
- **Code** (400, 0.82 to 0.88rem): Install command (0.84rem), schema names, lot bearings and edge labels (0.75rem), article code blocks.

### Named Rules
**The Two Voices Rule.** Josefin letters things; Source Serif explains them. Never set a paragraph in Josefin or a label in the serif. Italic serif is reserved for hints and article standfirsts. Placeholder text is marked with `mark.todo`: Josefin 600 in ink inside a 2px dashed ink box, no fill.
**The Mono Is Literal Rule.** JetBrains Mono appears only for text a reader could type or find in a repo: commands, schema names, code, bearing marks and survey edge labels.

## Layout

A single framed sheet: outer margin clamp(8px, 2vw, 24px), then the double border, with inner inline padding at the fluid gutter (clamp(16px, 4vw, 40px)). Content is edge-to-edge inside the frame and organised on CSS grid. The home page order is: top bar, a compact hero row (h1 left at 1.25fr, lede right at 1fr, bottom-aligned), then the plat immediately beneath. The plat is a three-equal-column grid of lots; below it a legend row (column 1: north arrow, solid vs hatched key, one caption) sits beside the survey title block (columns 2 to 3: pitch, install command, GitHub button, contact link). Other grids: `.split` 1fr / 1.4fr pairs an h2 with a notes list; band 1.2fr / 1fr; contact 1fr / 1.1fr. Gaps are fluid, clamp(20px, 4vw, 56px). Articles are a centred single column at 70ch with figures up to 960px.

Vertical rhythm is generous and uneven by purpose: 3.5rem above h2, clamp(20px, 3.5vw, 40px) hero top padding, 22px lot padding, 12 to 16px inside table cells and fields. Small interior spacing steps are 8, 10, 12, 14, 16, 18, 22px. At 900px and below every multi-column grid collapses to one column, lots stack, the legend and title block drop their column placement (title block loses its left rule and the pitch gets a bottom hairline), the nav spans full width, and the schedule table becomes a stacked list with "Normally:" and "In Stead:" prefixes injected as small labels. Touch targets are at least 46 to 48px tall.

## Elevation & Depth

Flat. There are no shadows, blurs or gradients of depth. Hierarchy comes from line weight (1px hairline, 1.5px dashed lot, 2px panel, 2.5px sheet), from the paper/shade tonal step, and from the one translucent layer: the sheet and plat are paper mixed at 92% and 70% over the grid so the drafting grid shows faintly through.

### Named Rules
**The Line-Weight Hierarchy Rule.** Importance is expressed by rule weight and fill, never by shadow. Panels are 2px ink, dividers 1px, inner borders of a panel 1px at the Rule alpha.

## Shapes

Square. Radius is 0 on buttons, inputs, panels, tags and images; the only rounding is a 2px radius on the focus outline. Forms are rectangles with ruled edges. The signature silhouettes are the lot (a dashed or solid box), the double-ruled sheet, and the north arrow glyph beside the wordmark. A live lot has a solid border and a 10px solid rust square at its top-left corner; a not-yet-built lot is hatched with 135-degree 1px lines at Grid alpha and has a dashed border. The legend swatches (28 by 12px) repeat these two states, the hatched one in full ink lines.

## Components

### Buttons
- **Shape:** Square, 2px ink border, min-height 48px, padding 14px 22px, Josefin 700 uppercase 0.9rem tracked 0.1em.
- **Default (outline):** Transparent with ink text and border; hover fills ink with paper text.
- **Solid (`.btn-solid`):** Ink fill with paper text; hover inverts to transparent with ink text. The standard primary action everywhere.
- **GitHub (`.btn-github`):** Rust fill and border with on-rust text; hover flips to ink fill. The only rust button; one per page, in the title block.
- **Active / Disabled:** 1px downward nudge on press; disabled drops to 55% opacity with progress cursor.
- **Motion:** 0.18s on background, color and transform, ease cubic-bezier(0.16, 1, 0.3, 1).

### Navigation
Top bar with a 1px ink bottom rule: tracked-caps wordmark (0.32em) with the north-arrow mark on the left, three uppercase links on the right. Current page is a 2px ink underline. Links have no underline otherwise. Body links are underlined at 1px and thicken to 2px on hover (buttons excluded). On mobile the nav drops to its own full-width row, spaced between.

### Survey Title Block
The recurring fact panel, now the closing row of the plat: paper fill, a 1.5px ink top and left rule, two cells. The pitch cell holds a tracked-caps label, one sentence of serif, and the install command in a shade-filled, 1px-ink-bordered mono strip. The actions cell holds the GitHub button and a plain tracked-caps text link. A hairline Rule divides the cells.

### Plat and Lots
Three-cell grid inside a 2px ink border. Each lot has a dashed 1.5px border, a "LOT n" bearing in mono at top-right, an h3, a mono schema name, a short serif paragraph, capability tags (1px ink border, paper fill, 0.75rem uppercase), and a mono edge bearing label (for example a compass bearing and distance in feet) at the bottom-left in muted ink. Lots draw in with a clip-path wipe, staggered 0.12s, only when motion is allowed. The legend row beneath holds a 44 by 56px north arrow and the solid versus hatched key.

### Schedule Table
Two-pixel ink border, ink header row with paper text, row heads in Josefin 700, middle column muted, last column ink semibold. Rows divided by Rule hairlines.

### Survey Form
A boxed form of ruled fields. Labels are tracked caps (0.75rem), hints are italic serif muted, inputs sit on Linen Shade with a 1px ink border, 0 radius, min-height 46px. Focus is a 3px ink outline at zero offset; caret and accent-color are ink. Status lines are Josefin 600 in ink: success plain, error with a wavy underline. A honeypot field is positioned off-screen.

### Split
A two-column pairing (1fr / 1.4fr) of an h2 with its notes list (serif, 68ch, 1.2em indent). The notes drop their top offset when stacked on mobile.

### Article
Single 70ch column; byline in muted tracked caps over a 1px ink rule; first paragraph after h1 in muted italic; figures with 1px ink border and tracked caption; code blocks on Linen Shade with 1px ink border.

## Do's and Don'ts

### Do:
- **Do** frame every page in the double-ruled sheet and keep the 48px grid visible behind it.
- **Do** draw with Survey Ink only; reserve rust for the GitHub button and the live-lot marker.
- **Do** keep corners square and depth flat; vary rule weight instead.
- **Do** set labels in tracked uppercase Josefin and prose in Source Serif 4 capped at 68ch.
- **Do** mark built things with solid lines and unbuilt things with dashes or hatching.
- **Do** keep 3px ink focus outlines and 46 to 48px minimum control heights.
- **Do** gate the lot wipe behind `prefers-reduced-motion: no-preference`.

### Don't:
- **Don't** use rust for headings, decoration, dividers, focus, links, nav state or any button other than GitHub.
- **Don't** introduce shadows, rounded cards, glassmorphism or gradient fills.
- **Don't** set paragraphs in Josefin or labels in the serif; don't use a default-list display face.
- **Don't** lay content out as a headline-over-subcopy plus feature-card grid; use ruled lots, tables and the title block.
- **Don't** add a third accent hue; extra emphasis comes from ink weight, not new color.

## Not canonized

The small tracked-caps `.label` line above the title-block pitch ("Stead · one install, many projects") reads as an eyebrow; it is a defect the build carries, not a pattern for new surfaces. The `.h2-small` one-off size (1.5rem), the leftover `.titleblock dl/dt/dd` resets and the duplicated `.titleblock .cmd/.actions/.plain` rules are build residue, not type steps or tokens. No glyph icon or offset shadow exists in the build.
