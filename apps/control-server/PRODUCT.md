# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase: NestJS control service serving server-rendered Handlebars views, styled with hand-written CSS and vanilla JS (no bundler, no frontend framework). Confirmed to stay zero-build-step for this admin UI overhaul — no bundler/preprocessor is being introduced; the redesign works within plain CSS (custom properties, etc.) and plain JS.

## Users

The operator(s) who deploy and run a personal-baas instance: developers or small technical teams self-hosting their own backend infrastructure. They log into this admin console (session-cookie authenticated, same-origin only, no public signup) to configure and run one or more "projects" (isolated tenants sharing one Postgres instance via per-project schema+role isolation). This is a working tool used routinely for real operational tasks, not a one-time setup wizard: creating/inspecting app users, running SQL, browsing the database, wiring auth/storage/functions/scheduler/email/MFA/PDF/vault/rate-limiting, and reviewing audit history.

## Product Purpose

personal-baas is a self-hosted, lightweight Backend-as-a-Service: Postgres + PostgREST + a NestJS control service behind a single reverse-proxy entry point. The admin console (this surface) is the operator's control plane for the entire stack — every backend capability the platform offers is configured and observed here. Success is an operator being able to confidently manage real infrastructure (not a toy) through this console.

## Positioning

Full ownership and control versus hosted BaaS platforms (Supabase/Firebase-style): your own Postgres, your own containers, your own data, deployed via Docker Compose behind Caddy — no vendor account, no usage-based billing, no third party holding your data. One control-plane admin console multiplexes many isolated projects on a single instance.

## Operating Context

Deployed via Docker Compose (Postgres, PostgREST, control-server, Caddy reverse proxy). Admin console is reached over HTTP(S) same-origin only — no CORS, no external embedding. Existing pages (17 total, listed under Capabilities) span: Dashboard, Projects, SQL Editor, Database Explorer, API Explorer, Users, API Keys, Storage, Hosting, Functions, Scheduler, Vault, Email, PDF, Audit Log, plus Login and a pre-login Landing page.

## Capabilities and Constraints

- Session-cookie auth for `/admin`, same-origin only (a `sameOriginGuard` blocks unsafe methods without a same-origin signal) — this is a security constraint, not a stylistic one; the overhaul must not weaken it.
- Vault/secrets values are write-only-reveal by design (once saved, never re-displayed in plaintext) — any redesigned secret-entry UI must preserve this behavior.
- Multi-project model: most pages are scoped by a `?projectId=` selector that falls back to a default project; this project-switcher pattern is functional, not decorative, and must survive the redesign.
- All 17 existing pages/features must keep their current functionality — this is a visual/UX overhaul, not a feature change or removal.
- No bundler/build step (confirmed above) — plain CSS and vanilla JS only, consistent with the rest of the repo's dependency-light philosophy.

## Evidence on Hand

Existing implementation is the only visual evidence — no external brand assets, logo, or marketing materials exist beyond the plain-text wordmark "Personal BaaS" used in the topbar, login card, and landing page. No user research or usability testing has been conducted; the redesign brief ("boring," "not pro quality," wants usability + modern professional look) is the user's own direct assessment as the primary/sole operator of this instance.

## Product Principles

- Operate mode: the console exists so a technical operator can get real infrastructure work done quickly and correctly — scanability, consistency, and low friction outrank decorative flourish.
- Full-stack coverage, one console: every backend capability (auth, storage, functions, scheduler, vault, email, PDF, database) surfaces through this same admin shell, so a consistent shared design system across all 17 pages matters more than any single page's polish.
- Trustworthy by default: this tool holds real production secrets, real user data, and destructive actions (delete project, reset MFA, etc.) — the UI must always make risk and state legible, never decorative at the expense of clarity.
- Zero-dependency-creep: matches the rest of the codebase's preference for plain, inspectable tooling over frameworks/build chains.

## Accessibility & Inclusion

No project-specific accessibility requirement has been established. Default to solid baseline practice (sufficient color contrast in both light and dark themes, visible keyboard focus states, semantic form labeling) since this is a professional tool used daily by technical operators.
