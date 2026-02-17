import { pool } from "./db";
import { log } from "./index";

export async function setupRLSAndTriggers() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE users ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE roles ENABLE ROW LEVEL SECURITY;`);

    await client.query(`ALTER TABLE users FORCE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE roles FORCE ROW LEVEL SECURITY;`);

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
          current_setting('app.current_user', true)
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE app_user`);
    await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
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
