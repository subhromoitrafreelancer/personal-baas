---
name: Personal BaaS Admin Console
description: A self-hosted BaaS control plane styled as a night-ops instrument panel, not a SaaS dashboard.
colors:
  graphite-canvas: "#12151a"
  graphite-surface: "#191d24"
  graphite-surface-muted: "#20252d"
  graphite-border: "#2a303b"
  graphite-border-strong: "#3a4150"
  ink-primary: "#e7eaee"
  ink-muted: "#98a1b0"
  ink-faint: "#67707f"
  signal-teal: "#35c9b9"
  signal-teal-hover: "#2aab9d"
  signal-amber: "#dba337"
  signal-red: "#e0594c"
  signal-slate: "#8890a6"
  panel-chrome: "#0d0f13"
  panel-chrome-elevated: "#171b22"
  paper-canvas: "#f3f1ea"
  paper-surface: "#fffdf9"
  paper-border: "#ddd7c8"
  paper-ink: "#1c1a16"
  paper-teal: "#12867a"
  paper-amber: "#92650a"
  paper-red: "#b23a2c"
typography:
  body:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.4
  heading:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
  section-label:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.72rem"
    fontWeight: 600
    letterSpacing: "0.08em"
  badge:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.68rem"
    fontWeight: 500
    letterSpacing: "0.03em"
  caption:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
  secondary:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 400
  card-title:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 600
  instrument:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.5rem"
    fontWeight: 500
rounded:
  sm: "3px"
  md: "4px"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.5rem"
  6: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.signal-teal}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 0.9rem"
  button-primary-hover:
    backgroundColor: "{colors.signal-teal-hover}"
  button-danger:
    backgroundColor: "{colors.signal-red}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
  badge:
    backgroundColor: "{colors.graphite-surface-muted}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.section-label}"
    rounded: "{rounded.sm}"
---

# Design System: Personal BaaS Admin Console

## Overview

**Creative North Star: "The Operations Control Room"**

This console is a night-ops instrument panel, not a SaaS dashboard — the aesthetic of the rooms where real infrastructure actually gets watched (NOC floors, ATC displays, Grafana/Datadog lineage), deliberately refusing the rounded-card, purple-gradient, soft-shadow look every generic admin panel defaults to. Density reads as competence, not clutter: a fixed tab rail groups the console's sections by proportion, functional color is spent on exactly three roles (teal for nominal/interactive, amber for caution, red for destructive actions only), and numeric/identifier data is set in a measured monospace so it reads as instrumentation rather than prose. Dark is the base theme — a night-ops panel; a light "daylight-ops" theme exists as the alternate, not the default, because this is a tool an operator watches, not a document they read in daylight by default. The tab rail follows the same toggle as the rest of the console (2026-09-14: it briefly stayed fixed-dark as a "physical panel" conceit, but that read as a bug — a light-mode operator got a dark rail with no way to change it). Only the login card and public landing page stay permanently dark, as a deliberate "airlock" look neither page can toggle.

**Confirmed visual rejections:** rounded pastel KPI cards with a big-number/small-label/accent template; a purple/indigo "AI SaaS" accent (the console's previous accent, `#4f46e5`); soft drop shadows as the primary depth cue; a flat 15-link horizontal navbar.

**Key Characteristics:**
- Restrained, functional-only color: teal/amber/red carry meaning, never decoration.
- Instrument-panel typography: IBM Plex Sans for prose/labels, IBM Plex Mono for every id, count, timestamp, and status.
- Hairline borders and engraved-label badges instead of soft shadows and pill chips.
- A visible "value-tick" flash on any live number/status change instead of a silent DOM swap.
- The tab rail follows the theme toggle like the rest of the console; only the login card and landing page stay permanently dark.

## Colors

Exactly three functional colors carry meaning; everything else is graphite/ink neutrals (dark theme) or paper/ink neutrals (light theme).

### Primary
- **Signal Teal** (`#35c9b9` dark / `#12867a` light): the one interactive/nominal accent — links, primary buttons, active nav state, "nominal" status, focus rings.

### Secondary
- **Signal Amber** (`#dba337` dark / `#92650a` light): caution states only (e.g. empty buckets, timeouts). Never used decoratively.
- **Signal Red** (`#e0594c` dark / `#b23a2c` light): destructive actions and critical/error states only — RLS warnings, delete confirmations, failed runs.

### Neutral
- **Graphite Canvas** (`#12151a`): the dark theme's page background.
- **Graphite Surface** (`#191d24`) / **Graphite Surface Muted** (`#20252d`): cards, table headers, panels.
- **Ink Primary** (`#e7eaee`) / **Ink Muted** (`#98a1b0`) / **Ink Faint** (`#67707f`): text hierarchy on dark surfaces.
- **Paper Canvas** (`#f3f1ea`) / **Paper Surface** (`#fffdf9`): the light "daylight-ops" theme's background and cards — warm paper-white, never stark `#fff`.
- **Panel Chrome** (`#0d0f13`) / **Panel Chrome Elevated** (`#171b22`): the login card and landing hero only — fixed dark in both themes.
- **Rail tokens** (`--color-rail-*`): the tab rail's own bg/text/border/accent set, theme-reactive — dark values match Panel Chrome exactly, light values are a muted paper panel (`#ece8dd` bg, `#1c1a16` text) so it reads as a shell surface without going stark white.

### Named Rules
**The Three-Signal Rule.** Only teal, amber, and red ever carry semantic weight. A fourth color reaching for attention is a bug, not a feature — if something needs a new color to stand out, the actual fix is spacing or hierarchy, not a new hue.

**The Fixed-Chrome Rule.** Only the login card and landing hero always render in the dark graphite/panel-chrome palette regardless of the active theme — an "airlock" look for the two pages that have no theme toggle of their own. The tab rail is explicitly *not* covered by this rule (see 2026-09-14 fix above): it uses its own `--color-rail-*` tokens, which do switch with the theme.

## Typography

**Body/Heading Font:** IBM Plex Sans (self-hosted, `/admin/static/fonts/`)
**Label/Mono Font:** IBM Plex Mono (self-hosted, `/admin/static/fonts/`)

**Character:** IBM Plex was designed for technical/engineering documentation — it reads as precise and workmanlike rather than expressive, which is exactly the register an Operate-mode console wants. The pairing does one job: Sans carries prose and UI chrome, Mono marks anything that is data (an id, a count, a timestamp, a status code) so the eye learns to trust monospace as "this is a real value," not styling.

### Hierarchy
The real scale in use, smallest to largest — a dense console legitimately needs more steps than a five-role hierarchy, so this is the full documented ramp rather than a trimmed ideal:

- **0.68rem** (mono, uppercase, tracked): badges, the tightest instrument labels.
- **0.72rem** (mono, uppercase, tracked, 600): page-level section labels (`.page > h2`).
- **0.75rem**: field labels, small captions, sub-values.
- **0.8rem**: secondary body text (snippet headers, muted sub-lines).
- **0.85rem** (the workhorse size): default UI text, form inputs, table cells, buttons.
- **0.9rem**: card-header/modal-header titles.
- **1rem**: emphasized inline text (rare).
- **1.3–1.35rem** (600, -0.01em tracking): page `<h1>` and the auth card's heading.
- **1.5rem** (500, mono, tabular-nums): an instrument value — a live readout's number (dashboard instance readouts).

### Named Rules
**The Workhorse Rule.** 0.85rem is the default for anything the operator reads continuously (body text, inputs, table cells). Sizes above 1rem are reserved for page/card titles; sizes below 0.75rem are reserved for tracked, uppercase instrument labels — never body prose.

### Named Rules
**The Mono-Means-Data Rule.** Monospace is reserved for identifiers, counts, timestamps, status codes, and log/SQL content. It is never used as a "technical-looking" costume on ordinary prose.

## Layout

Every authenticated page is `<tab-rail> + <main class="page"> + <footer>` as flat siblings of `<body>`; a CSS Grid shell (`body:has(> .tab-rail)`) lays them out as a fixed-width rail column (232px) beside a fluid content column, with the footer in its own row under the content — chosen specifically so none of the 15 page templates needed their closing markup touched. `.page` content itself centers at a 1200px max-width inside that column. Below 900px the rail collapses into a slide-in drawer toggled by a fixed hamburger button, and the grid drops to a single column.

## Elevation & Depth

Mostly flat. Depth is a hairline border (`--color-border`) first, a small shadow second — `--shadow-sm`/`--shadow-md` exist for genuinely floating elements (modals, toasts, the auth card) but are never the primary way a card separates from its background. This is a deliberate departure from the previous system's `box-shadow`-on-every-card default.

### Shadow Vocabulary
- **sm** (`0 1px 2px rgba(0,0,0,0.3)` dark / `rgba(28,26,22,0.08)` light): subtle lift for toasts and small floating controls.
- **md** (`0 4px 16px rgba(0,0,0,0.4)` dark / `rgba(28,26,22,0.1)` light): modals, the auth card, the mobile rail drawer.

### Named Rules
**The Border-Before-Shadow Rule.** A card separates from its background with a 1px border first. Reach for a shadow only when the element is genuinely floating above the page (modal, toast, drawer).

## Shapes

Small, crisp radii (3–4px) rather than the previous system's softer 4–6px — corners read as machined/engineered, not bubbly. Status badges are near-rectangular engraved plates (a hairline border in the status's own color, uppercase mono label) rather than fully-rounded pills. Channel rows (Dashboard's project list) and the instrument strip use a 3px functional-color left border as a status stripe — the one deliberately "colored border" in the system, earned by the world's own instrumentation grammar rather than used as decoration.

## Components

### Buttons
- **Shape:** 3px radius, 1px border.
- **Primary:** teal fill, white text — the single most prominent visual weight on any page.
- **Outline/Danger:** unchanged structurally from the incumbent system; danger now uses Signal Red.
- **Hover/Focus:** background/border shift on hover; focus ring uses the rail's own accent token inside the tab rail (tuned against `--color-rail-bg` in either theme) and the theme accent everywhere else.

### Badges
- **Style:** hairline border in the status's own color, uppercase tracked monospace, `--radius-sm` corners — an engraved plate, not a pill.
- **States:** success/active (teal), danger/disabled (red), warning/timeout (amber), info/invited (slate), pending/running (slate, deliberately distinct from amber — "still working" vs. "needs attention").

### Cards / Panels
- **Corner style:** `--radius` (4px).
- **Background:** `--color-surface`, 1px `--color-border`.
- **Shadow:** `--shadow-sm` only, not the primary separation cue (see Elevation & Depth).

### Navigation (Tab Rail)
- **Style:** theme-reactive panel (`--color-rail-bg`, not the fixed chrome tokens), grouped into six sections (Dashboard standalone, then Data / Auth / Storage & Compute / Integrations / Platform), each group's rail footprint following naturally from its own link count. Leaf links inside a group get extra left padding (1.15rem vs. the group label's 0.6rem) so they read as visibly nested under their heading.
- **States:** default (muted rail text), hover (a theme-appropriate overlay tint — white-based in dark mode, black-based in light mode), active (rail accent text + tinted background).
- **Mobile:** collapses to a slide-in drawer under a fixed hamburger toggle at ≤900px.

### Row-Actions Menu (dense tables)
A single shared dropdown (`.actions-menu`), built once and repositioned per click via the trigger button's bounding rect rather than one menu per row — keeps a dense table's actions column to one compact kebab (⋮) button instead of a row of buttons, and avoids clipping inside a horizontally-scrolling `.table-wrap`. First used on the Users table.

### Merged Identity Cell (dense tables)
Where a table would otherwise need two separate ID and Email columns, they merge into one `.identity-cell`: the human-meaningful value (email) as the primary line, the UUID as a smaller muted mono line beneath it — both keep their own copy button. First used on the Users table.

### Instrument Bank (signature component — Dashboard)
The Dashboard replaces the previous same-size KPI-card grid with two instrument-panel patterns: a **channel bank** (one table row per project, a 3px left status stripe carrying its RLS-warning state) and an **instrument strip** (a single hairline-divided panel of dense readouts — buckets, objects, storage used, audit events, realtime connections — rather than separate bordered boxes each with its own shadow). Values poll every 45s and flash a brief `value-tick` animation on change (a 180ms opacity/translate cross-fade) so a live number reads as a visible instrument event, not a silent DOM swap.

## Do's and Don'ts

### Do:
- **Do** reserve teal/amber/red for real semantic meaning only (The Three-Signal Rule).
- **Do** set every id, count, timestamp, and status in IBM Plex Mono (The Mono-Means-Data Rule).
- **Do** keep only the login card and landing page in the fixed dark chrome palette regardless of the active theme (The Fixed-Chrome Rule) — the tab rail follows the theme toggle.
- **Do** separate cards from their background with a border before reaching for a shadow (The Border-Before-Shadow Rule).
- **Do** give a genuinely live value a `value-tick` flash on change rather than a silent update.

### Don't:
- **Don't** reintroduce same-size icon+heading+text KPI cards as a page's primary structure — that is the exact pattern this redesign replaced.
- **Don't** add a fourth "brand" color outside teal/amber/red; fix the underlying hierarchy or spacing instead.
- **Don't** style badges as fully-rounded pills — they are engraved plates (hairline border, uppercase mono, small radius).
- **Don't** use a colored left border as decoration outside the channel-row and toast status-stripe pattern it was earned for (both carry real per-item state — nominal/danger, success/error/info — never a flat brand accent).
- **Don't** hardcode a component permanently dark (or permanently light) unless it's genuinely outside the theme toggle's reach (only login/landing qualify). A component the user can reach via the toggle must actually change with it.
