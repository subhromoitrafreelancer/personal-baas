# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Static HTML/CSS/JS with a small PHP handler for the contact form, uploaded to a Hostinger hPanel subdomain (`stead.dataharmoni.com`). No build server or Node runtime on the host. Article pages are plain HTML; Medium and Substack versions are exported separately. Confirmed as the recommended default by the user's go-ahead; revisit only if the host cannot run PHP.

## Users
Primary: solo developers and small teams shipping internal tools, MVPs and line-of-business apps who would otherwise reach for a hosted backend service but want to own their data and their bill. They know SQL and a frontend framework; they do not want to hand-build auth, CRUD endpoints, file storage and PDF generation again.
Secondary: freelancers and small agencies building many client apps, who care about repeatable setup, per-client isolation, and clean handover.
Visitors arrive from Medium, Substack, or a shared link, usually mid-evaluation and skeptical of "yet another backend".

## Product Purpose
Stead (the codebase is named `personal-baas`) is a self-hosted, lightweight backend platform: point it at a Postgres schema and get a secure REST API, auth, storage, serverless functions and an admin console, running on your own infrastructure. The site exists to (1) get developers to try it from GitHub, and (2) bring in project enquiries and developer feedback through a contact form. Success is a visitor who understands in one minute what they get, and either clones the repo or writes in.

## Positioning
Own the whole backend: your Postgres, your containers, your data, deployed with Docker Compose behind one reverse proxy. No vendor account, no usage-based billing. Authorization lives in the database (row-level security and grants), so the API, docs and tests follow the schema instead of being written separately. One instance runs many isolated projects (a schema and role set per project).

## Operating Context
- Repository: https://github.com/subhromoitrafreelancer/personal-baas (public; confirmed reachable). Current codebase is the version being promoted.
- Install and upgrade docs live in the repo (`docs/install.md`, `docs/upgrade.md`). Default entry is Docker Compose.
- Site is hosted on a subdomain of `dataharmoni.com`. Medium and Substack carry the same article with exported PNG diagrams.
- Project history: first commit 2026-07-15; control-server at 0.8.2 as of 2026-10-09.

## Capabilities and Constraints
Shipped, per the README: instant REST API over tables/views/functions (PostgREST) with row-level security; SQL editor, database explorer and API explorer; generated OpenAPI spec; email/password auth, project-scoped JWTs, TOTP MFA with backup codes, rate limiting and lockout; per-bucket object storage; static site hosting on a separate origin; serverless JS/TS functions in an isolated worker; cron-style scheduler; encrypted secrets vault; transactional email; on-demand PDF generation; multi-project isolation; audit log of operator actions.
Constraints:
- Never use the name "Supabase", "Firebase" or "clone" in site or article copy. Describe the category ("hosted backend services") instead.
- New project schemas need a manual PostgREST restart after creation. Say so honestly where setup is described.
- License: Apache-2.0 (confirmed by the user 2026-10-18). The repo does not yet contain a LICENSE file and package.json is still marked private; the user must add the file before launch. Site copy may say "Apache-2.0 licensed" only once that file is committed.
- Do not claim performance, scale or security guarantees beyond what the repo documents.

## Brand Commitments
Name: Stead (a steady place you run yourself). Plain, unpretentious voice, written for developers but not nerdy; human, specific and direct; no hype or startup cliches. The product is a person's own work, so first person is allowed in the article. Tagline direction (unconfirmed): a steady backend you run yourself.

## Evidence on Hand
- Working codebase, 81 commits, feature list above.
- Example apps: `examples/ats-app` (recruitment hierarchy/workflow app on React, Vite and shadcn, using only the platform's auth, REST/RLS and RPC) and `examples/todo-app`.
- A second real project built on the platform for a client: an approval workflow for an automotive-parts manufacturer. Must be fully anonymized: no client name, screenshots, data or identifiers.
- Time and cost figures: the user will provide estimates, to be labelled as estimates; build timeline may be derived from git dates.
- Absent, and not to be fabricated: customer logos, testimonials, user counts, GitHub stars, benchmarks, pricing, uptime figures.

## Product Principles
1. Say what it is and how to run it before saying why it is good.
2. Show real things (the schema, the app, the repo); never invented proof.
3. Honest about trade-offs: self-hosting has a cost, and the site says when not to use Stead.
4. Written by a developer for developers: concrete, plain language, no jargon-as-decoration.
5. Two clear doors: try it, or talk to me.

## Accessibility & Inclusion
No product-specific standard established. Default to WCAG 2.2 AA, readable at phone width, light and dark themes, and usable without JavaScript for reading the article.
