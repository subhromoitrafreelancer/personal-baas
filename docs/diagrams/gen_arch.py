#!/usr/bin/env python3
"""Generate architecture DOT for personal-baas (self-hosted BaaS: Postgres + PostgREST + NestJS control-server behind Caddy)."""

def esc(s):
    return s.replace('"', '\\"')

lines = []
a = lines.append

a('digraph architecture {')
a('  rankdir=TB;')
a('  graph [fontname="Helvetica", fontsize=22, label="personal-baas — System Architecture\\n'
  'self-hosted BaaS: Docker Compose stack, single public entry point via Caddy", labelloc=t, '
  'labeljust=c, pad=0.5, nodesep=0.45, ranksep=0.75, compound=true, splines=spline];')
a('  node [fontname="Helvetica", fontsize=11, shape=box, style="rounded,filled"];')
a('  edge [fontname="Helvetica", fontsize=9.5, color="#5d6d7e"];')

# ---------- Clients ----------
a('  subgraph cluster_clients {')
a('    label="Clients"; style="rounded,filled"; color="#7f8c8d"; fillcolor="#F8F9F9"; fontsize=15; fontname="Helvetica-Bold";')
a('    browser [label="Browser app\\n(examples/todo-app — fetch)\\n(examples/ats-app — React + @personal-baas/client-sdk)", fillcolor="#EBF5FB", color="#2E86C1"];')
a('    admin_browser [label="Platform admin\\n(browser, server-rendered\\nHandlebars admin console)", fillcolor="#EBF5FB", color="#2E86C1"];')
a('    svc_client [label="Service-role client\\n(server-to-server: secret API key,\\nuser-directory, functions mgmt)", fillcolor="#EBF5FB", color="#2E86C1"];')
a('  }')

# ---------- Edge ----------
a('  subgraph cluster_edge {')
a('    label="Edge — infrastructure/proxy/Caddyfile"; style="rounded,filled"; color="#B7950B"; fillcolor="#FEF9E7"; fontsize=15; fontname="Helvetica-Bold";')
a('    caddy_main [label="Caddy — main host\\n:8000 (HTTP) / :443 (HTTPS, auto Let\'s Encrypt\\nor internal CA for localhost)\\nsingle public entry point", fillcolor="#FCF3CF", color="#B7950B"];')
a('    caddy_sites [label="Caddy — sites.<PUBLIC_DOMAIN>\\nseparate origin for tenant-deployed\\nstatic sites (CSRF/session isolation\\nfrom /admin, Phase 25 fix)", fillcolor="#FCF3CF", color="#B7950B"];')
a('  }')

# ---------- Application layer: control-server ----------
a('  subgraph cluster_app {')
a('    label="apps/control-server — NestJS control service (single process, port 3000)"; '
  'style="rounded,filled"; color="#1A5276"; fillcolor="#EBF5FB"; fontsize=15; fontname="Helvetica-Bold";')

a('    subgraph cluster_edge_guards {')
a('      label="Request pipeline (main.ts)"; style="rounded,dashed"; color="#1A5276"; fontsize=12;')
a('      guards [label="Helmet + CORS (auth/storage/functions)\\n+ same-origin guard (/admin)\\n+ rate-limit guard (global + /auth/v1/login,signup)\\n+ JWT verify (RS256)", fillcolor="#D6EAF8", color="#1A5276", shape=note];')
a('    }')

a('    subgraph cluster_public_api {')
a('      label="Public BaaS API — modules/*"; style="rounded,filled"; color="#2471A3"; fillcolor="#D6EAF8"; fontsize=12.5; fontname="Helvetica-Bold";')
a('      mod_auth [label="auth\\n/auth/v1/*\\nsignup, login, refresh,\\nMFA (TOTP + backup codes)"];')
a('      mod_apikeys [label="api-keys\\npublishable / secret key\\nissue + revoke"];')
a('      mod_storage [label="storage\\n/storage/v1/*\\nbuckets + objects (MinIO-backed)"];')
a('      mod_hosting [label="hosting\\nstatic site deploy\\n(served via sites.<domain>)"];')
a('      mod_functions [label="functions\\n/functions/v1/*\\ninvoke -> function-runner"];')
a('      mod_scheduler [label="scheduler\\nin-process cron timer\\n-> invokes functions"];')
a('      mod_email [label="email\\ntransactional send\\n(Resend / SMTP)"];')
a('      mod_pdf [label="pdf\\nHTML -> PDF via configured\\nexternal HTTP provider"];')
a('      mod_vault [label="vault\\nencrypted per-project secrets\\n(libsodium secretbox)"];')
a('      mod_realtime [label="realtime\\n/realtime/v1 WebSocket gateway\\nPostgres NOTIFY -> pushed changes"];')
a('      mod_userdir [label="user-directory\\n/users/* (service-role only)\\nproject user listing"];')
a('    }')

a('    subgraph cluster_admin_console {')
a('      label="Admin Console — modules/* (Handlebars UI + admin/v1 API)"; style="rounded,filled"; color="#7D3C98"; fillcolor="#F4ECF7"; fontsize=12.5; fontname="Helvetica-Bold";')
a('      mod_adminauth [label="admin-auth\\nplatform admin login/session"];')
a('      mod_adminprojects [label="projects / admin-projects\\ncreate/list projects,\\nrewrites shared postgrest.conf"];')
a('      mod_adminusers [label="admin-users\\nplatform admin accounts"];')
a('      mod_dbtools [label="sql-console + sql-history\\ndb-explorer + db-management\\nadmin-db (shared query service)"];')
a('      mod_apiexplorer [label="api-explorer + openapi-docs\\nbrowse api/api_<slug>,\\npublic /openapi.json"];')
a('      mod_dashboard [label="dashboard-summary + landing\\noverview widgets, public landing"];')
a('    }')

a('    subgraph cluster_platform_svcs {')
a('      label="Cross-cutting / platform"; style="rounded,filled"; color="#616A6B"; fillcolor="#F2F3F4"; fontsize=12.5; fontname="Helvetica-Bold";')
a('      mod_database [label="database\\nshared baas_admin\\nPG connection pool"];')
a('      mod_audit [label="audit\\nwrites auth.audit_events"];')
a('      mod_health [label="health + metrics\\nliveness/readiness, /health*"];')
a('    }')
a('  }')

# ---------- Sidecar ----------
a('  subgraph cluster_sidecar {')
a('    label="apps/function-runner — sidecar process (port 3002, internal only)"; '
  'style="rounded,filled"; color="#943126"; fillcolor="#FDEDEC"; fontsize=13; fontname="Helvetica-Bold";')
a('    runner [label="POST /run\\nfresh worker_thread per invocation\\nesbuild TS/ESM -> CJS transpile\\nfull Node API, no Postgres credential\\nrestart: unless-stopped (crash isolation)", fillcolor="#FADBD8", color="#943126"];')
a('  }')

# ---------- Data layer ----------
a('  subgraph cluster_data {')
a('    label="Data layer"; style="rounded,filled"; color="#1D8348"; fillcolor="#EAFAF1"; fontsize=15; fontname="Helvetica-Bold";')

a('    postgrest [label="PostgREST v12\\nport 3001, stateless\\nverifies app-user JWT (JWK, RS256)\\nswitches Postgres role per JWT claim", fillcolor="#D5F5E3", color="#1D8348"];')

a('    subgraph cluster_pg {')
a('      label="PostgreSQL (single instance, pgdata volume)"; style="rounded,filled"; color="#186A3B"; fillcolor="#D4EFDF"; fontsize=12.5; fontname="Helvetica-Bold";')
a('      pg_tenant [label="api / api_<slug> schemas\\n1 per project, developer-defined\\ntables + RLS — the ONLY schemas\\nPostgREST is allowed to see", fillcolor="#ABEBC6", color="#186A3B"];')
a('      pg_platform [label="platform + auth + private\\n+ storage + hosting + functions\\n+ vault + scheduler + email + pdf\\ncontrol-server-owned metadata,\\nnever exposed via PostgREST", fillcolor="#ABEBC6", color="#186A3B"];')
a('    }')

a('    minio [label="MinIO\\nsingle bucket, object bytes only\\nlogical \\"buckets\\" = key prefixes\\nin storage.buckets metadata", fillcolor="#D5F5E3", color="#1D8348"];')
a('  }')

# ---------- Edges: clients -> edge ----------
a('  browser -> caddy_main [label="HTTPS"];')
a('  admin_browser -> caddy_main [label="HTTPS /admin/*"];')
a('  svc_client -> caddy_main [label="HTTPS + secret key"];')
a('  browser -> caddy_sites [label="deployed tenant\\nstatic site", style=dashed];')

# ---------- Edges: edge -> app / postgrest ----------
a('  caddy_main -> guards [label="/, /auth/*, /storage/*,\\n/functions/*, /realtime/*, /users/*,\\n/openapi.json, /admin/*, /health*"];')
a('  caddy_main -> postgrest [label="/rest/v1/* (prefix stripped)"];')
a('  caddy_sites -> guards [label="tenant site content\\n(isolated origin)"];')

# ---------- internal routing from guards to module groups ----------
a('  guards -> mod_auth;')
a('  guards -> mod_apikeys;')
a('  guards -> mod_storage;')
a('  guards -> mod_hosting;')
a('  guards -> mod_functions;')
a('  guards -> mod_realtime;')
a('  guards -> mod_userdir;')
a('  guards -> mod_adminauth;')
a('  guards -> mod_apiexplorer;')
a('  guards -> mod_dashboard;')

# ---------- cross-cutting wiring ----------
a('  mod_auth -> mod_audit [style=dotted, label="audit_events"];')
a('  mod_auth -> mod_database [style=dotted];')
a('  mod_adminprojects -> mod_database [style=dotted];')
a('  mod_dbtools -> mod_database [style=dotted];')
a('  mod_email -> mod_vault [label="reads provider secret", style=dotted];')
a('  mod_pdf -> mod_vault [label="reads provider secret", style=dotted];')
a('  mod_scheduler -> mod_functions [label="cron fires\\ninvocation"];')

# ---------- app -> sidecar ----------
a('  mod_functions -> runner [label="POST /run\\ncode + ctx (docker network only)"];')
a('  runner -> mod_vault [label="/internal/vault/resolve\\nctx.secrets.get()", style=dashed, constraint=false];')
a('  runner -> postgrest [label="direct (one hop\\nfewer than via Caddy)"];')

# ---------- app -> data ----------
a('  mod_database -> pg_platform [label="baas_admin\\n(schema admin, migrations,\\nSQL console)"];')
a('  mod_storage -> minio [label="object bytes\\n(control-server holds\\nMinIO credentials)"];')
a('  mod_adminprojects -> postgrest [label="rewrites shared\\npostgrest.conf on project\\ncreate (needs manual\\ndocker compose restart)", style=dashed];')

a('  postgrest -> pg_tenant [label="authenticator role,\\nswitches to anon /\\nauthenticated / service_role\\nor per-project role"];')

a('  { rank=same; caddy_main; caddy_sites; }')
a('  { rank=same; postgrest; runner; }')

a('}')

print("\n".join(lines))
