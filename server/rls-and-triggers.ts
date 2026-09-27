import { pool } from "./db";
import { log } from "./index";

async function ensureAppUserRole() {
  // RLS is enforced by switching to a non-owner role per transaction
  // (SET LOCAL ROLE app_user). The role must exist and the connecting user
  // must be a member of it. Idempotent, so it is safe on every boot.
  const client = await pool.connect();
  try {
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
          CREATE ROLE app_user NOLOGIN;
        END IF;
      END $$;
    `);
    await client.query(`GRANT app_user TO CURRENT_USER`);
    await client.query(`GRANT USAGE ON SCHEMA public TO app_user`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user`);
    log("app_user role ready", "rls");
  } catch (err) {
    log(
      `Could not create/grant app_user (database user needs CREATEROLE): ${err}`,
      "rls",
    );
  } finally {
    client.release();
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setupRLSAndTriggers() {
  await ensureAppUserRole();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE users ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE roles ENABLE ROW LEVEL SECURITY;`);

    await client.query(`ALTER TABLE users FORCE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE roles FORCE ROW LEVEL SECURITY;`);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'reports_to'
        ) THEN
          ALTER TABLE users ADD COLUMN reports_to UUID REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_select_users') THEN
          CREATE POLICY tenant_isolation_select_users ON users
            FOR SELECT
            USING (
              COALESCE(current_setting('app.current_tenant_id', true), '') = ''
              OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
            );
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_update_users') THEN
          CREATE POLICY tenant_isolation_update_users ON users
            FOR UPDATE
            USING (
              COALESCE(current_setting('app.current_tenant_id', true), '') = ''
              OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
            )
            WITH CHECK (
              COALESCE(current_setting('app.current_tenant_id', true), '') = ''
              OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
            );
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_insert_users') THEN
          CREATE POLICY tenant_isolation_insert_users ON users
            FOR INSERT
            WITH CHECK (true);
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_delete_users') THEN
          CREATE POLICY tenant_isolation_delete_users ON users
            FOR DELETE
            USING (
              COALESCE(current_setting('app.current_tenant_id', true), '') = ''
              OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
            );
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_select_roles') THEN
          CREATE POLICY tenant_isolation_select_roles ON roles
            FOR SELECT
            USING (
              COALESCE(current_setting('app.current_tenant_id', true), '') = ''
              OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
            );
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_update_roles') THEN
          CREATE POLICY tenant_isolation_update_roles ON roles
            FOR UPDATE
            USING (
              COALESCE(current_setting('app.current_tenant_id', true), '') = ''
              OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
            )
            WITH CHECK (
              COALESCE(current_setting('app.current_tenant_id', true), '') = ''
              OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
            );
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_insert_roles') THEN
          CREATE POLICY tenant_isolation_insert_roles ON roles
            FOR INSERT
            WITH CHECK (true);
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION audit_users_changes()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO audit_logs (table_name, operation, record_id, old_data, new_data, changed_by)
        VALUES (
          TG_TABLE_NAME,
          TG_OP,
          COALESCE(NEW.id, OLD.id),
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
          current_setting('app.current_username', true)
        );
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_users'
        ) THEN
          CREATE TRIGGER trg_audit_users
            AFTER INSERT OR UPDATE OR DELETE ON users
            FOR EACH ROW EXECUTE FUNCTION audit_users_changes();
        END IF;
      END $$;
    `);

    await client.query("COMMIT");
    log("RLS policies and audit trigger set up successfully", "rls");
  } catch (err) {
    await client.query("ROLLBACK");
    log(`Error setting up RLS/triggers: ${err}`, "rls");
    throw err;
  } finally {
    client.release();
  }
}

export async function queryWithTenantContext(tenantId: string, query: string, params?: any[]) {
  if (!UUID_RE.test(tenantId)) {
    throw Object.assign(new Error("tenantId must be a UUID"), { status: 400 });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE app_user`);
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
    const result = await client.query(query, params);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
