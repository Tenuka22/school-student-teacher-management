/**
 * Least-privilege grants for the application's database role (D1).
 *
 * The app used to connect as `postgres`, a superuser: any SQL injection, any
 * bug, any stolen `DATABASE_URL` could drop the database, read other
 * databases on the server, or delete the audit trail. The intended split:
 *
 * | role        | used by                          | holds                                   |
 * |-------------|----------------------------------|-----------------------------------------|
 * | `postgres`  | a person, for maintenance only   | superuser; never in an app's env        |
 * | owner role  | `scripts/migrate.mjs` (`MIGRATION_DATABASE_URL`) | owns the database and every table; runs DDL |
 * | app role    | the server (`DATABASE_URL`)      | DML on the tables, nothing else         |
 * | backup role | `pg_dump`                        | `pg_read_all_data` (PostgreSQL 14+)     |
 *
 * The app role may read and write rows, use sequences and call the trigger
 * functions — and nothing more: no DDL, no `TRUNCATE`, and on
 * `account_audit_log` no `UPDATE` or `DELETE`, so the audit trail is
 * append-only for the process that writes it. Default privileges extend the
 * same grants to tables later migrations create, so the grants do not have
 * to be re-run after every release (the audit-table revoke is on an existing
 * table and stays).
 *
 * Creating the two login roles (and choosing their passwords) is a one-time
 * step for a person — see docs/operations.md, "Database roles". This script
 * then applies the grants, connected **as the owner role**:
 *
 *   MIGRATION_DATABASE_URL=postgres://sms_owner:…@host/db \
 *     bun scripts/db-roles.ts --app sms_app            # print the SQL
 *   … bun scripts/db-roles.ts --app sms_app --apply    # apply it
 */
import { Client } from "pg";

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/u;

const quoted = (name: string): string => {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Not a plain role name: ${name}`);
  }
  return `"${name}"`;
};

/** The grant statements for `app`, run by the owner of the tables. */
export const appRoleGrants = ({
  database,
  owner,
  app,
}: {
  database: string;
  owner: string;
  app: string;
}): string[] => {
  const db = quoted(database);
  const ownerRole = quoted(owner);
  const appRole = quoted(app);
  return [
    `REVOKE ALL ON DATABASE ${db} FROM PUBLIC`,
    `GRANT CONNECT, TEMPORARY ON DATABASE ${db} TO ${appRole}`,
    "REVOKE CREATE ON SCHEMA public FROM PUBLIC",
    `GRANT USAGE ON SCHEMA public TO ${appRole}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appRole}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appRole}`,
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${appRole}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appRole}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${appRole}`,
    // Append-only audit trail for the process that writes it.
    `REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "account_audit_log" FROM ${appRole}`,
  ];
};

if (import.meta.main) {
  const url = process.env.MIGRATION_DATABASE_URL;
  const appIndex = process.argv.indexOf("--app");
  const app = appIndex === -1 ? undefined : process.argv[appIndex + 1];
  if (!(url && app)) {
    throw new Error(
      "Usage: MIGRATION_DATABASE_URL=<owner connection> bun scripts/db-roles.ts --app <role> [--apply]"
    );
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{
      db: string;
      me: string;
      su: boolean;
    }>(
      "select current_database() db, current_user me, (select rolsuper from pg_roles where rolname = current_user) su"
    );
    const [who] = rows;
    if (!who) {
      throw new Error("Could not read the connection's database and role");
    }
    if (who.su) {
      console.warn(
        "Connected as a superuser. Grants are applied for the role that owns the tables; connect as that owner so default privileges name the right role."
      );
    }
    const statements = appRoleGrants({ database: who.db, owner: who.me, app });
    if (process.argv.includes("--apply")) {
      await client.query("BEGIN");
      for (const statement of statements) {
        // oxlint-disable-next-line no-await-in-loop -- one transaction, in order
        await client.query(statement);
      }
      await client.query("COMMIT");
      console.log(`Applied ${statements.length} statements for ${app}.`);
    } else {
      console.log(`${statements.join(";\n")};`);
    }
  } finally {
    await client.end();
  }
}
