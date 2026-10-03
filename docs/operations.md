# Operations runbook

How to deploy, upgrade, back up and look after this system. Written after the October 2026 forensic repair; every command here has been run against a real PostgreSQL during that repair unless it says otherwise.

## Runtime and tools

- **Bun 1.4.0** exactly (`.bun-version`, `packageManager`). The lockfile is version 2 and older Bun cannot read it. If your installed Bun is older and you do not want to upgrade it globally, `npx -y bun@1.4.0 install --frozen-lockfile` runs the pinned version once.
- PostgreSQL 17 or 18. Item photos are stored in PostgreSQL (`files.data`) since migration 0011; MinIO is no longer used.
- `apps/web/.env` from `apps/web/.env.example`. Every secret ships blank.

## Setting up a fresh environment

```sh
bun install --frozen-lockfile
bun run db:verify-migrations        # proves the history builds from zero (scratch DB)
bun run db:migrate                  # applies it to DATABASE_URL
bun run seed                        # optional demo data; refuses NODE_ENV=production
bun run test:local                  # integration suite on scratch databases
cd apps/web && bun run check-types  # production build + types
```

There is **no** `db:push` in a normal setup. `db:push` on this schema proposes truncating `grade_subject_config` (see AGENTS.md); never run it with `--force`.

## Deploying

The container (`apps/web/Dockerfile`) runs `scripts/migrate.mjs` before the server and refuses to start if a migration fails. Migrations are applied in one transaction per batch, so a failure leaves the previous schema intact.

**Before every deploy that contains a migration, take a backup** (next section). Several migrations have pre-flight checks that stop with a count and change nothing (0007: NIC and inventory ownership backfill; 0008: open loans; 0009: second current year, invalid leave or timetable rows). Fix the rows they name, then deploy again.

## Upgrading a database that was built with `drizzle-kit push`

Such a database has no migration ledger, so `db:migrate` would replay 0000. Find out which migration it matches, record that, then migrate:

```sh
# read-only: builds a reference DB from 0000..NNNN and compares catalogs
bun --env-file=apps/web/.env scripts/baseline-existing-db.ts --through 0007
# only if it reports an exact match:
bun --env-file=apps/web/.env scripts/baseline-existing-db.ts --through 0007 --apply
bun run db:migrate
```

The development database `school-student-teacher-management-v2` matched `0000..0007` exactly on 1 October 2026, and every pre-flight of 0008–0010 passed against it (no open loans, one current year, no invalid leave or timetable rows). It was **not** upgraded during the repair; back it up and run the three commands above.

## Migration 0011: photos from MinIO into PostgreSQL

0011 replaces `files.key` (a MinIO object key) with `files.data` (the bytes). It refuses, with a count and **without changing anything**, while any `files` row has no bytes or bytes whose length differs from its recorded `size`. An empty `files` table migrates straight through. With photos in it:

1. Back up the database **and** the MinIO bucket.
2. Put the old object-store settings in a **separate** file, not `apps/web/.env`. Leftover `MINIO_*` lines in `apps/web/.env` are undeclared since 203f827, and varlock's leak scanner then aborts any response that happens to contain one of their values (e.g. `MINIO_USE_SSL=false`), which breaks pages in production. Remove them from `apps/web/.env`.
3. Dry run, then copy:
   ```sh
   bun --env-file=apps/web/.env --env-file=minio.env scripts/backfill-file-bytes.ts
   bun --env-file=apps/web/.env --env-file=minio.env scripts/backfill-file-bytes.ts --apply
   ```
   The script adds `files.data` as a nullable column, copies each object whose length matches the row, never overwrites bytes already copied and never deletes anything. It lists every row it could not fill and exits 1.
4. For each listed row decide by hand: find the object and re-run, or (only if the photo is truly gone) delete that `files` row and clear any `inventory_item` photo that points at it.
5. `bun run db:migrate`. If interrupted at any point, re-run from step 3: every step is idempotent and 0011 is all-or-nothing.

## Database roles

The app must not connect as a superuser (D1). One-time setup, as a superuser:

```sql
CREATE ROLE sms_owner LOGIN PASSWORD '<generated>';   -- migrations
CREATE ROLE sms_app   LOGIN PASSWORD '<generated>';   -- the server
CREATE ROLE sms_backup LOGIN PASSWORD '<generated>';  -- optional: pg_dump only
GRANT pg_read_all_data TO sms_backup;
ALTER DATABASE "<db>" OWNER TO sms_owner;
-- then, for an existing database, as a superuser:
REASSIGN OWNED BY postgres TO sms_owner;   -- run inside <db> only
```

Then, connected as `sms_owner`:

```sh
MIGRATION_DATABASE_URL=postgres://sms_owner:…@host/db bun run db:migrate
MIGRATION_DATABASE_URL=postgres://sms_owner:…@host/db bun scripts/db-roles.ts --app sms_app --apply
```

Set `DATABASE_URL` to `sms_app` and `MIGRATION_DATABASE_URL` to `sms_owner`; `scripts/migrate.mjs` uses the latter. `sms_app` gets row access only: no DDL, no `TRUNCATE`, no access to the migration ledger, and `account_audit_log` is insert/select only. `packages/api/test/least-privilege.test.ts` runs the app this way. `REASSIGN OWNED` has not been exercised on a populated database here; try it on a restored copy first.

## Rotating secrets

Never paste a secret into chat, a ticket or a commit. Generate with `openssl rand -base64 48`.

| Secret | How | Consequence |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Change it in the environment and restart. | Session cookies are signed with it: **every user is signed out** and must sign in again (verified by `security-remediation.test.ts`). Pending email-verification links stop working. Then `DELETE FROM session;` as the owner to remove the now-useless rows. |
| Seat passwords | `scripts/rotate-seat-password.ts <username>` (below). | That seat is signed out everywhere. |
| Database passwords | `ALTER ROLE sms_app PASSWORD '…'`, update `DATABASE_URL`, restart; same for `sms_owner`. | Brief outage between the two steps. |
| `RESEND_API_KEY` | Create a new key in Resend, update the env, restart, revoke the old key. | None if done in that order. |

The development secrets shared in a chat session in September 2026 must be treated as public: rotate all of the above for any environment that ever used them.

## Backups and restore

Nothing in the repository schedules backups; the deployment must.

```sh
# nightly, keep at least 14
pg_dump --format=custom --file=sams-$(date +%F).dump "$DATABASE_URL"
# restore into an EMPTY database, never over a live one
createdb sams_restore
pg_restore --no-owner --dbname=sams_restore sams-YYYY-MM-DD.dump
```

Item photos are in the database since migration 0011, so the dump above includes them. Test a restore at least once a term; a backup never restored is a hope, not a backup.

## Seeded seats and passwords

- The env passwords are **initial** passwords only. Boot never overwrites an existing seat's password.
- Boot **refuses to start** if a seat password is unset, shorter than 12 characters, or equal to any value ever committed to this repository.
- To rotate a seat: change its value in the environment, then `bun --env-file=apps/web/.env scripts/rotate-seat-password.ts <username>`. This replaces the stored hash and signs the seat out everywhere.

## Email

Sign-in codes, verification, password reset and teacher self-registration need mail. Set `MAIL_TRANSPORT=resend`, `RESEND_API_KEY` and `MAIL_FROM`. With no transport in production, the code-sending endpoints answer **503** rather than pretending to send. A configured provider that fails at send time is only **logged**: better-auth deliberately swallows send errors so response timing cannot reveal which addresses have accounts. Watch the log for `Failed to run background task`.

## Logs

Every API error is one JSON line: `level`, `time`, `requestId`, `userId`, `path`, and for database errors only the SQLSTATE and constraint — never the SQL or its parameters. The client receives the same `x-request-id` header, so a user can quote it. Account administration is recorded in the `account_audit_log` table (who, against whom, allowed or denied), and so are the privileged procedures (`action` = `rpc:staff.updateStaff` etc., listed in `packages/api/src/lib/audit.ts`), including refused calls. `detail` carries the target id, the request id and, on failure, the error code — never the submitted values.

## Inventory integrity

```sh
bun --env-file=apps/web/.env scripts/reconcile-inventory.ts
```

Read-only. Exits 1 and lists every item whose stored quantity differs from the sum of its ledger. Run it after any manual data repair, and on a schedule.

## Single-instance constraints

This app is built for one server process. These are held in process memory and are therefore **per instance**: better-auth's rate limiter, the sign-up rate limiter (`packages/api/src/lib/rate-limit.ts`), the OTP send throttle and the inventory event publisher. Running several instances multiplies the limits by the instance count and splits live events. Move them to PostgreSQL or Redis before scaling out.

## Network: TLS, proxy and client addresses

Intended topology: Internet → TLS-terminating reverse proxy (nginx, Caddy) → the app on a private port → PostgreSQL on a private network. The app port must not be reachable except from the proxy.

- **Public origin.** Set `BETTER_AUTH_URL` to the `https://` address users type. HSTS and `upgrade-insecure-requests` are sent only when it is `https://` and `NODE_ENV=production` (`apps/web/src/lib/security-headers.ts`).
- **Client address.** `TRUSTED_PROXY_HOPS` is the number of proxies you run in front of the app. With 0 (the default) `X-Forwarded-For` is ignored and the socket address is used. With one proxy, set it to 1 and make the proxy **overwrite** the header with the peer address (`proxy_set_header X-Forwarded-For $remote_addr;` in nginx), which is also the only form better-auth's own rate limiter trusts (it accepts a single-entry header).
- **Body sizes.** The app refuses RPC bodies over 8 MB, auth bodies over 64 KB and photo uploads over 8 MB itself; set the proxy's limit (`client_max_body_size 9m`) to match so large bodies are refused before they are buffered.
- These were reasoned from the code, not tested through a real proxy: no proxy was available during the remediation.

## Time

Timestamps are stored without a time zone; the container pins `TZ=UTC`. School dates ("today", the attendance month, due dates) are computed in `Asia/Colombo` by `packages/db/src/dates.ts`. Converting the 92 timestamp columns to `timestamptz` is a planned migration, not yet done.
