# school-student-teacher-management

School management system for St. Aloysius' College (Galle, Sri Lanka): staff records, timetables, attendance, leave management and a self-service teacher portal.

Built with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Start, Self, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Nx** - Smart monorepo task orchestration and caching

## What the system does

### Staff management

- **Teacher records** — full CRUD with personal, address, emergency-contact and employment details; qualifications with file uploads and an approval flow.
- **Two staff categories** — `teacher` and `officeStaff` (`staff.staffCategory`).
- **Subject & class assignment** per academic year, sectional heads and department heads via `staff_position`.
- **Timetables** — period configuration plus class/teacher slot assignment with conflict detection (no double-booked teacher, no duplicate class slot), Excel/PDF exports.

### Leave management

Documented in detail in [`LEAVE_SYSTEM_DESIGN.md`](./LEAVE_SYSTEM_DESIGN.md) — the source of truth for the workflow.

- **Apply by type** — annual, casual, medical, maternity, official duty, other.
- **Two-step approval chain** — the **Deputy Principal recommends**, the **Principal approves/rejects**. The Principal's action sets `finalized_at` and locks the request; the DP recommendation is preserved for the audit trail. Owners can cancel non-finalised requests.
- **Dynamic quotas** — per-year limits live in the `leave_entitlement` table (e.g. medical 21 + other categories 20 = 41 days this year). Next year's numbers are a data edit, not a code change; historical years keep their own rows so past records are never rewritten. Remaining balance is derived (quota − approved days), never stored.

### Attendance & the late-arrival policy

- Day-level teacher attendance (`present` / `partial` / `absent`) plus per-period absence records with reasons.
- **Automatic late-arrival handling** (`attendance.recordArrival`):
  1. Arrival **by 07:30** (the year's `arrival_cutoff_time`) → marked present.
  2. Later, with short-leave allowance left → recorded as a **short leave** (2 per month by default).
  3. Allowance exhausted → recorded as a **half day**; 2 half days = 1 leave day, so a 21-day entitlement equals 42 half days.
- All policy numbers are rows in `attendance_policy` (per academic year) and monthly usage in `short_leave_usage` — minimum / maximum / current, append-only so history stays intact.

### Accounts & sign-up

- **The NIC is the username.** Staff (teachers and office staff) sign up at `/signup` with name, NIC, email and password — the NIC (lowercased, unique index) becomes their login username. One NIC = one person = one account.
- **Leadership sign-up** at `/signup/admin` for the Principal and Deputy Principals, gated by a shared `LEADERSHIP_SETUP_CODE` env secret, and automatically linked to their leadership position for the current year.
- Teachers get a self-service portal at `/dashboard/my` — profile, leave history and applications; admins manage everything under `/dashboard/staff`. The sidebar adapts to the signed-in role.
- An env-bootstrap admin account (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) exists for initial setup.

### Academic-year scoping

Assignments, timetables, attendance, leave and quotas are all scoped to an academic year. Opening a new year isolates data automatically — no archiving step.

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/web/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the fullstack application.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@school-student-teacher-management/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Environment Configuration

Each app owns its environment schema in `.env.schema`. Varlock generates `src/env.ts` during installation; run `bun run env:generate` after changing a schema. Commit schemas, and keep secrets in ignored env files or your deployment platform.

Auth-related variables (all in `apps/web/.env.schema`):

- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — bootstrap admin account, re-synced on server start
- `LEADERSHIP_SETUP_CODE` — shared secret required by the `/signup/admin` leadership page
- `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `DATABASE_URL`

Import the generated `ENV` accessor in application code. Shared database and auth packages receive configuration or initialized clients from the application. See [Varlock's monorepo guide](https://varlock.dev/guides/monorepos/).

Bun's automatic env loading is disabled in `bunfig.toml`; the framework integration or server bootstrap loads Varlock. Node deployments must include Varlock and its dependencies alongside the app schema.

Run standalone Node/Bun tools that use Varlock from the owning app directory so they load that app's schema and env files. `env:generate` only generates TypeScript files; it does not initialize environment values in a subsequent command.

## Deployment

### Docker Compose

- Target: web + server
- Config: `docker-compose.yml` (app Dockerfiles live in `apps/*/Dockerfile`)
- Build images: bun run docker:build
- Start: bun run docker:up
- Logs: bun run docker:logs
- Stop: bun run docker:down

Environment variables are read from each app's `.env` file (baked into web builds for public variables) and overridden in `docker-compose.yml` for container networking.

For more details, see the guide on [Deploying with Docker Compose](https://www.better-t-stack.dev/docs/guides/docker).

## Project Structure

```
school-student-teacher-management/
├── apps/
│   └── web/         # Fullstack application (React + TanStack Start)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic (staff, leaves, attendance, periods)
│   ├── auth/        # Authentication configuration & logic (NIC usernames, roles)
│   └── db/          # Database schema & queries (Drizzle)
```

### Key source locations

| Area | Path |
| --- | --- |
| Leave/attendance design doc | `LEAVE_SYSTEM_DESIGN.md` |
| Leave & quota schema | `packages/db/src/schema/leaves.ts` |
| Attendance & policy schema | `packages/db/src/schema/attendance.ts` |
| Staff & academic-year schema | `packages/db/src/schema/staff.ts` |
| Auth (NIC username, credentials) | `packages/auth/src/admin.ts` |
| Leave procedures (apply, review chain, quotas) | `packages/api/src/routers/staff/leaves/` |
| Attendance procedures (policy, recordArrival) | `packages/api/src/routers/staff/attendance/` |
| Sign-up procedures | `packages/api/src/routers/staff/signup.ts` |
| Teacher portal UI | `apps/web/src/components/staff/teacher-portal/` |
| Leave review UI (admin) | `apps/web/src/components/staff/leave-management/` |
| Sign-up pages | `apps/web/src/components/signup/` |
| Routes | `apps/web/src/routes/` (`/signup`, `/signup/admin`, `/dashboard/my/*`, `/dashboard/staff/*`) |

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run docker:build`: Build the Docker Compose images
- `bun run docker:up`: Build and start the Docker Compose stack
- `bun run docker:logs`: Tail logs from the Docker Compose stack
- `bun run docker:down`: Stop the Docker Compose stack

## Better Auth Schema Generation

After changing auth plugins or schema options, run `bun run auth:generate` from the project root. The script runs the Better Auth CLI through `varlock run` from the owning app directory, loading the auth instance from `src/services.ts`. Review the schema changes, then use your ORM's migration workflow to apply them.
