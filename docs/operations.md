# Operations runbook

How to deploy, upgrade, back up and look after this system. Written after the October 2026 forensic repair; every command here has been run against a real PostgreSQL during that repair unless it says otherwise.

## Runtime and tools

- **Bun 1.4.0** exactly (`.bun-version`, `packageManager`). The lockfile is version 2 and older Bun cannot read it. If your installed Bun is older and you do not want to upgrade it globally, `npx -y bun@1.4.0 install --frozen-lockfile` runs the pinned version once.
- PostgreSQL 17 or 18. MinIO (or any S3) for item photos.
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

## Backups and restore

Nothing in the repository schedules backups; the deployment must.

```sh
# nightly, keep at least 14
pg_dump --format=custom --file=sams-$(date +%F).dump "$DATABASE_URL"
# restore into an EMPTY database, never over a live one
createdb sams_restore
pg_restore --no-owner --dbname=sams_restore sams-YYYY-MM-DD.dump
```

Back up the MinIO bucket (`mc mirror local/<bucket> <backup-target>`) on the same schedule: `files` rows point at its objects. Test a restore at least once a term; a backup never restored is a hope, not a backup.

## Seeded seats and passwords

- The env passwords are **initial** passwords only. Boot never overwrites an existing seat's password.
- Boot **refuses to start** if a seat password is unset, shorter than 12 characters, or equal to any value ever committed to this repository.
- To rotate a seat: change its value in the environment, then `bun --env-file=apps/web/.env scripts/rotate-seat-password.ts <username>`. This replaces the stored hash and signs the seat out everywhere.

## Email

Sign-in codes, verification, password reset and teacher self-registration need mail. Set `MAIL_TRANSPORT=resend`, `RESEND_API_KEY` and `MAIL_FROM`. With no transport in production, the code-sending endpoints answer **503** rather than pretending to send. A configured provider that fails at send time is only **logged**: better-auth deliberately swallows send errors so response timing cannot reveal which addresses have accounts. Watch the log for `Failed to run background task`.

## Logs

Every API error is one JSON line: `level`, `time`, `requestId`, `userId`, `path`, and for database errors only the SQLSTATE and constraint — never the SQL or its parameters. The client receives the same `x-request-id` header, so a user can quote it. Account administration is recorded in the `account_audit_log` table (who, against whom, allowed or denied).

## Inventory integrity

```sh
bun --env-file=apps/web/.env scripts/reconcile-inventory.ts
```

Read-only. Exits 1 and lists every item whose stored quantity differs from the sum of its ledger. Run it after any manual data repair, and on a schedule.

## Single-instance constraints

This app is built for one server process. These are held in process memory and are therefore **per instance**: better-auth's rate limiter, the sign-up rate limiter (`packages/api/src/lib/rate-limit.ts`), the OTP send throttle and the inventory event publisher. Running several instances multiplies the limits by the instance count and splits live events. Move them to PostgreSQL or Redis before scaling out.

Behind a reverse proxy, configure it to set `X-Forwarded-For` and configure better-auth's `advanced.ipAddress` so its rate limiter can tell clients apart; without that, better-auth logs that it falls back to one shared bucket.

## Time

Timestamps are stored without a time zone; the container pins `TZ=UTC`. School dates ("today", the attendance month, due dates) are computed in `Asia/Colombo` by `packages/db/src/dates.ts`. Converting the 92 timestamp columns to `timestamptz` is a planned migration, not yet done.
