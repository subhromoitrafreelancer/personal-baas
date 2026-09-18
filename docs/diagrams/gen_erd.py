#!/usr/bin/env python3
"""Generate ERD DOT for personal-baas from the actual migration schema."""

# schema -> color (cluster bg, header bg, header text)
SCHEMA_STYLE = {
    "platform":  ("#FCF3E7", "#E67E22", "white"),
    "auth":      ("#EAF2FB", "#2E86C1", "white"),
    "storage":   ("#EAFAF1", "#229954", "white"),
    "hosting":   ("#F5EEF8", "#8E44AD", "white"),
    "functions": ("#FDEDEC", "#C0392B", "white"),
    "scheduler": ("#FEF9E7", "#B7950B", "white"),
    "vault":     ("#ECEFF1", "#455A64", "white"),
    "email":     ("#E8F8F5", "#17A589", "white"),
    "pdf":       ("#FDF2F0", "#CB4335", "white"),
    "notes":     ("#F4F6F6", "#909497", "white"),
}

# table definition: (schema, name, [(col, type, flag)]) flag in {"pk","fk","fk?","uq",""}
TABLES = [
 ("platform","projects",[
   ("id","uuid","pk"),("slug","text","uq"),("name","text",""),
   ("schema_name","text","uq"),("anon_role","text",""),
   ("authenticated_role","text",""),("service_role_role","text",""),
   ("mfa_required","bool",""),("created_at","timestamptz",""),("updated_at","timestamptz",""),
 ]),
 ("platform","platform_admins",[
   ("id","uuid","pk"),("email","text","uq"),("password_hash","text",""),
   ("created_at","timestamptz",""),("last_login_at","timestamptz",""),
 ]),
 ("platform","admin_sql_history",[
   ("id","uuid","pk"),("admin_id","uuid","fk?"),("admin_email","text",""),
   ("mode","text",""),("sql","text",""),("success","bool",""),
   ("statement_count","int",""),("duration_ms","int",""),("executed_at","timestamptz",""),
 ]),
 ("platform","api_keys",[
   ("id","uuid","pk"),("project_id","uuid","fk"),("name","text",""),
   ("kind","text","publishable|secret"),("created_by","text",""),
   ("revoked_at","timestamptz",""),("created_at","timestamptz",""),
 ]),
 ("platform","settings",[
   ("key","text","pk"),("value","jsonb",""),("updated_at","timestamptz",""),
 ]),

 ("auth","users",[
   ("id","uuid","pk"),("project_id","uuid","fk"),("email","text","uq/proj"),
   ("password_hash","text",""),("status","text","active|disabled|invited"),
   ("email_verified","bool",""),("role","text",""),("user_metadata","jsonb",""),
   ("app_metadata","jsonb",""),("last_sign_in_at","timestamptz",""),
   ("password_changed_at","timestamptz",""),("created_at","timestamptz",""),
 ]),
 ("auth","identities",[
   ("id","uuid","pk"),("user_id","uuid","fk"),("provider","text","uq w/provider_user_id"),
   ("provider_user_id","text",""),("created_at","timestamptz",""),
 ]),
 ("auth","sessions",[
   ("id","uuid","pk"),("user_id","uuid","fk"),("expires_at","timestamptz",""),
   ("revoked_at","timestamptz",""),("ip_address","inet",""),("user_agent","text",""),
   ("created_at","timestamptz",""),
 ]),
 ("auth","refresh_tokens",[
   ("id","uuid","pk"),("session_id","uuid","fk"),("token_hash","text","uq"),
   ("family_id","uuid",""),("parent_token_id","uuid","fk (self)"),
   ("issued_at","timestamptz",""),("expires_at","timestamptz",""),
   ("consumed_at","timestamptz",""),("revoked_at","timestamptz",""),
 ]),
 ("auth","password_reset_tokens",[
   ("id","uuid","pk"),("user_id","uuid","fk"),("token_hash","text","uq"),
   ("expires_at","timestamptz",""),("used_at","timestamptz",""),
   ("created_at","timestamptz",""),
 ]),
 ("auth","audit_events",[
   ("id","uuid","pk"),("user_id","uuid","fk?"),("event_type","text",""),
   ("ip_address","inet",""),("metadata","jsonb",""),("created_at","timestamptz",""),
 ]),
 ("auth","mfa_factors",[
   ("id","uuid","pk"),("user_id","uuid","fk, uq"),("type","text","totp"),
   ("secret_nonce","bytea",""),("secret_ciphertext","bytea",""),
   ("verified","bool",""),("verified_at","timestamptz",""),
   ("created_at","timestamptz",""),
 ]),
 ("auth","mfa_backup_codes",[
   ("id","uuid","pk"),("user_id","uuid","fk"),("code_hash","text",""),
   ("used_at","timestamptz",""),("created_at","timestamptz",""),
 ]),

 ("storage","buckets",[
   ("id","uuid","pk"),("project_id","uuid","fk"),("name","text","uq/proj"),
   ("public","bool",""),("size_limit_bytes","bigint",""),("created_at","timestamptz",""),
 ]),
 ("storage","objects",[
   ("id","uuid","pk"),("bucket_id","uuid","fk"),("path","text","uq/bucket"),
   ("owner","uuid","fk? (auth.users)"),("size","bigint",""),
   ("content_type","text",""),("created_at","timestamptz",""),
 ]),

 ("hosting","sites",[
   ("id","uuid","pk"),("project_id","uuid","fk, uq"),
   ("created_at","timestamptz",""),("updated_at","timestamptz",""),
 ]),
 ("hosting","site_files",[
   ("id","uuid","pk"),("site_id","uuid","fk"),("path","text","uq/site"),
   ("size","bigint",""),("content_type","text",""),("deployed_at","timestamptz",""),
 ]),

 ("functions","functions",[
   ("id","uuid","pk"),("project_id","uuid","fk"),("name","text","uq/proj"),
   ("code","text",""),("timeout_ms","int",""),
   ("created_at","timestamptz",""),("updated_at","timestamptz",""),
 ]),
 ("functions","invocations",[
   ("id","uuid","pk"),("function_id","uuid","fk"),("status","text",""),
   ("duration_ms","int",""),("error","text",""),("invoked_at","timestamptz",""),
 ]),

 ("vault","secrets",[
   ("id","uuid","pk"),("project_id","uuid","fk"),("name","text","uq/proj"),
   ("nonce","bytea",""),("ciphertext","bytea",""),
   ("created_at","timestamptz",""),("updated_at","timestamptz",""),
 ]),

 ("scheduler","scheduled_jobs",[
   ("id","uuid","pk"),("project_id","uuid","fk"),("function_id","uuid","fk"),
   ("name","text","uq/proj"),("cron_expression","text",""),("enabled","bool",""),
   ("next_run_at","timestamptz",""),("last_run_at","timestamptz",""),
   ("last_status","text",""),("created_at","timestamptz",""),
 ]),
 ("scheduler","job_runs",[
   ("id","uuid","pk"),("job_id","uuid","fk"),("started_at","timestamptz",""),
   ("finished_at","timestamptz",""),("status","text",""),("error","text",""),
 ]),

 ("email","provider_configs",[
   ("id","uuid","pk"),("project_id","uuid","fk, uq"),
   ("provider","text","resend|smtp"),("from_address","text",""),
   ("smtp_host","text",""),("smtp_port","int",""),("enabled","bool",""),
   ("created_at","timestamptz",""),
 ]),
 ("email","sent_messages",[
   ("id","uuid","pk"),("project_id","uuid","fk"),("to_address","text",""),
   ("subject","text",""),("provider","text",""),("status","text","sent|failed"),
   ("created_at","timestamptz",""),
 ]),

 ("pdf","provider_configs",[
   ("id","uuid","pk"),("project_id","uuid","fk, uq"),("api_url","text",""),
   ("auth_header","text",""),("response_mode","text","binary|json_url|json_base64"),
   ("enabled","bool",""),("created_at","timestamptz",""),
 ]),
 ("pdf","render_requests",[
   ("id","uuid","pk"),("project_id","uuid","fk"),("status","text","success|failed"),
   ("duration_ms","int",""),("output_bytes","int",""),("created_at","timestamptz",""),
 ]),
]

EDGES = [
 ("platform.api_keys","project_id","platform.projects","id",False),
 ("platform.admin_sql_history","admin_id","platform.platform_admins","id",True),
 ("auth.users","project_id","platform.projects","id",False),
 ("auth.identities","user_id","auth.users","id",False),
 ("auth.sessions","user_id","auth.users","id",False),
 ("auth.refresh_tokens","session_id","auth.sessions","id",False),
 ("auth.refresh_tokens","parent_token_id","auth.refresh_tokens","id",True),
 ("auth.password_reset_tokens","user_id","auth.users","id",False),
 ("auth.audit_events","user_id","auth.users","id",True),
 ("auth.mfa_factors","user_id","auth.users","id",False),
 ("auth.mfa_backup_codes","user_id","auth.users","id",False),
 ("storage.buckets","project_id","platform.projects","id",False),
 ("storage.objects","bucket_id","storage.buckets","id",False),
 ("storage.objects","owner","auth.users","id",True),
 ("hosting.sites","project_id","platform.projects","id",False),
 ("hosting.site_files","site_id","hosting.sites","id",False),
 ("functions.functions","project_id","platform.projects","id",False),
 ("functions.invocations","function_id","functions.functions","id",False),
 ("vault.secrets","project_id","platform.projects","id",False),
 ("scheduler.scheduled_jobs","project_id","platform.projects","id",False),
 ("scheduler.scheduled_jobs","function_id","functions.functions","id",False),
 ("scheduler.job_runs","job_id","scheduler.scheduled_jobs","id",False),
 ("email.provider_configs","project_id","platform.projects","id",False),
 ("email.sent_messages","project_id","platform.projects","id",False),
 ("pdf.provider_configs","project_id","platform.projects","id",False),
 ("pdf.render_requests","project_id","platform.projects","id",False),
]

def node_id(schema, name):
    return f"{schema}_{name}"

def html_table(schema, name, cols):
    bg, header_bg, header_fg = SCHEMA_STYLE[schema]
    rows = []
    for col, typ, flag in cols:
        if flag == "pk":
            colhtml = f'<B><U>{col}</U></B>'
        elif flag.startswith("fk"):
            colhtml = f'<I>{col}</I>'
        else:
            colhtml = col
        note = "" if flag in ("pk","",) else f'<FONT POINT-SIZE="9" COLOR="#555555"> {flag}</FONT>'
        rows.append(
            f'<TR><TD ALIGN="LEFT" PORT="{col}">{colhtml}{note}</TD>'
            f'<TD ALIGN="LEFT"><FONT COLOR="#666666">{typ}</FONT></TD></TR>'
        )
    body = "\n".join(rows)
    label = f'''<
<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="4" BGCOLOR="{bg}">
<TR><TD COLSPAN="2" BGCOLOR="{header_bg}"><FONT COLOR="{header_fg}"><B>{schema}.{name}</B></FONT></TD></TR>
{body}
</TABLE>>'''
    return f'  "{node_id(schema,name)}" [shape=plain, label={label}];\n'

def main():
    out = []
    out.append('digraph erd {')
    out.append('  rankdir=LR;')
    out.append('  graph [fontname="Helvetica", fontsize=22, label="personal-baas — Database ER Diagram\\n(PostgreSQL, per-schema clusters, platform.projects is the multi-tenancy root)", labelloc=t, labeljust=c, pad=0.4, nodesep=0.35, ranksep=0.9, splines=spline, compound=true];')
    out.append('  node [fontname="Helvetica", fontsize=11];')
    out.append('  edge [fontname="Helvetica", fontsize=9, color="#7f8c8d", penwidth=1.1];')

    by_schema = {}
    for schema, name, cols in TABLES:
        by_schema.setdefault(schema, []).append((name, cols))

    schema_order = ["platform","auth","storage","hosting","functions","scheduler","vault","email","pdf"]
    for schema in schema_order:
        bg, header_bg, _ = SCHEMA_STYLE[schema]
        out.append(f'  subgraph "cluster_{schema}" {{')
        out.append(f'    label="{schema} schema"; style="rounded,filled"; color="{header_bg}"; fillcolor="{bg}"; fontname="Helvetica-Bold"; fontsize=14; margin=16;')
        for name, cols in by_schema[schema]:
            out.append(html_table(schema, name, cols))
        out.append('  }')

    # notes node for api / api_<slug> and private
    out.append('  subgraph "cluster_notes" {')
    out.append('    label="developer-managed (not fixed by migrations)"; style="rounded,dashed"; color="#909497"; fontname="Helvetica-Bold"; fontsize=14; margin=16;')
    out.append('    "api_dev" [shape=box, style="rounded,filled", fillcolor="#F4F6F6", color="#909497", fontsize=11, label="api / api_<slug> schema\\n(one per project, exposed via PostgREST)\\ntables + RLS policies defined by the developer\\nin the SQL console"];')
    out.append('    "private_dev" [shape=box, style="rounded,filled", fillcolor="#F4F6F6", color="#909497", fontsize=11, label="private schema\\nbootstrap-only, never exposed via PostgREST"];')
    out.append('  }')
    out.append(f'  "api_dev" -> "{node_id("platform","projects")}" [style=dashed, color="#909497", label="schema_name", arrowhead=none];')

    for child, col, parent, pcol, nullable in EDGES:
        cschema, cname = child.split(".")
        pschema, pname = parent.split(".")
        cid = node_id(cschema, cname)
        pid = node_id(pschema, pname)
        style = "dashed" if nullable else "solid"
        out.append(
            f'  "{cid}":"{col}" -> "{pid}":"{pcol}" '
            f'[dir=both, arrowtail=crow, arrowhead=tee, style={style}, headclip=true, tailclip=true];'
        )

    out.append('}')
    print("\n".join(out))

if __name__ == "__main__":
    main()
