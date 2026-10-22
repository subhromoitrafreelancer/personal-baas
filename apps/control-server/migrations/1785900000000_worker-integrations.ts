import type { MigrationBuilder } from 'node-pg-migrate';
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE platform.worker_integrations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL,
      credential_hash text UNIQUE NOT NULL CHECK (credential_hash ~ '^[a-f0-9]{64}$'),
      enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE platform.worker_project_grants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      integration_id uuid NOT NULL REFERENCES platform.worker_integrations(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,
      allowed_secret_names text[] NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(integration_id, project_id)
    );
    CREATE TABLE platform.worker_project_leases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      grant_id uuid NOT NULL REFERENCES platform.worker_project_grants(id) ON DELETE CASCADE,
      api_key_id uuid UNIQUE NOT NULL REFERENCES platform.api_keys(id),
      expires_at timestamptz NOT NULL, revoked_at timestamptz,
      last_renewed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ON platform.worker_project_leases(grant_id);
    -- A grant/integration disable is effective for already-issued REST/storage JWTs too.
    -- Re-enabling never resurrects a revoked key. Deletion has the same semantics.
    CREATE FUNCTION platform.revoke_worker_keys() RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      IF TG_OP = 'DELETE' OR NOT NEW.enabled THEN
        UPDATE platform.api_keys k SET revoked_at = coalesce(k.revoked_at, now()),
          revoked_by = 'worker-grant-revocation'
        FROM platform.worker_project_leases l JOIN platform.worker_project_grants g ON g.id=l.grant_id
        WHERE k.id=l.api_key_id AND
          ((TG_TABLE_NAME='worker_integrations' AND g.integration_id=OLD.id) OR
           (TG_TABLE_NAME='worker_project_grants' AND g.id=OLD.id));
        UPDATE platform.worker_project_leases l SET revoked_at=coalesce(l.revoked_at,now())
        FROM platform.worker_project_grants g WHERE g.id=l.grant_id AND
          ((TG_TABLE_NAME='worker_integrations' AND g.integration_id=OLD.id) OR
           (TG_TABLE_NAME='worker_project_grants' AND g.id=OLD.id));
      END IF;
      IF TG_OP='DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $fn$;
    CREATE TRIGGER worker_integration_revoke BEFORE UPDATE OF enabled OR DELETE
      ON platform.worker_integrations FOR EACH ROW EXECUTE FUNCTION platform.revoke_worker_keys();
    CREATE TRIGGER worker_grant_revoke BEFORE UPDATE OF enabled OR DELETE
      ON platform.worker_project_grants FOR EACH ROW EXECUTE FUNCTION platform.revoke_worker_keys();
    REVOKE ALL ON platform.worker_integrations, platform.worker_project_grants,
      platform.worker_project_leases FROM PUBLIC;
    REVOKE ALL ON FUNCTION platform.revoke_worker_keys() FROM PUBLIC;
  `);
}
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    UPDATE platform.api_keys SET revoked_at=coalesce(revoked_at,now()), revoked_by='worker-rollback'
      WHERE id IN (SELECT api_key_id FROM platform.worker_project_leases);
    DROP TABLE platform.worker_project_leases, platform.worker_project_grants,
      platform.worker_integrations;
    DROP FUNCTION platform.revoke_worker_keys();
  `);
}
