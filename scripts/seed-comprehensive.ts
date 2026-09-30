/* oxlint-disable eslint/no-await-in-loop -- this script seeds rows in strict
   dependency order (an academic year before its classes, a class before its
   timetable, a staff row before the leave requests that reference it, ...),
   and every row needs an id generated after the row it depends on has
   actually landed. `Promise.all`-ing these would race inserts against their
   own foreign keys; the loops are sequential on purpose, not by omission. */
import { fileURLToPath } from "node:url";

import { faker } from "@faker-js/faker";
import {
  ensureBootstrapUsers,
  createStaffCredential,
  leadershipRoleForPosition,
  isSeededAccount,
} from "@school-student-teacher-management/auth";
import { createDb } from "@school-student-teacher-management/db";
import { isStructureEntryOfferedBySchool } from "@school-student-teacher-management/db/config/school";
import { INVENTORY_TRANSFER_REASON_KEYS } from "@school-student-teacher-management/db/constants/inventory";
import { DEFAULT_LEAVE_ENTITLEMENTS } from "@school-student-teacher-management/db/constants/leave";
import {
  COMPULSORY_BASKET_CATEGORY,
  getStructureVersion,
  resolveEntries,
} from "@school-student-teacher-management/db/constants/structureVersions/index";
import type { StructureVersionEntry } from "@school-student-teacher-management/db/constants/structureVersions/index";
import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import {
  class_,
  gradeSubjectConfig,
  classTeacherAssignmentHistory,
} from "@school-student-teacher-management/db/schema/academics";
import {
  attendancePolicy,
  shortLeaveUsage,
  teacherAttendance,
  teacherPeriodAbsence,
} from "@school-student-teacher-management/db/schema/attendance";
import { user as userTable } from "@school-student-teacher-management/db/schema/auth";
import {
  inventoryAuditLog,
  inventoryCategory,
  inventoryCustodyHistory,
  inventoryCustodyNoticeRecipient,
  inventoryDisposal,
  inventoryDisposalStatusHistory,
  inventoryIssue,
  inventoryIssueUnit,
  inventoryItem,
  inventoryTransaction,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import {
  leaveEntitlement,
  leaveRequest,
} from "@school-student-teacher-management/db/schema/leaves";
import {
  classPeriodSubject,
  classPeriodTeacher,
} from "@school-student-teacher-management/db/schema/periods";
import {
  academicYear,
  staff,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { teacherSubjectAssignment } from "@school-student-teacher-management/db/schema/teacher-subjects";
import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";

/**
 * Comprehensive dev reset + reseed.
 *
 * Unlike `scripts/seed.ts` (idempotent, additive, minimal), this script
 * **destroys every row this app owns in the staff/leave/period/inventory
 * domain and rebuilds it from scratch** so the whole system's behaviour can
 * be exercised end to end against known, exhaustive data: three academic
 * years (a closed past year, the current year, an unopened future year),
 * every staff employment/appointment/position permutation, a full timetable,
 * every leave-request status combination (including quota-boundary and
 * over-quota history, and deliberately overlapping requests), attendance
 * derived from both approved leave and the daily register, and the
 * inventory register's full lifecycle (borrows, issues, every disposal
 * status, custody transfers, custody requests, the counter ledger and the
 * audit log).
 *
 * Deliberately **out of scope**: the `student`/marking/exam tables. This
 * script is about the staff-management surface this session's work touched;
 * seeding a parallel, equally exhaustive student/marks dataset is a
 * separate task with its own permutation set, and folding it in here would
 * make one already-large script respowsible for two unrelated domains.
 *
 * Run with `bun run seed:full` from the repo root. **This truncates the
 * `user`/`session`/`account` tables too** — every signed-in session is
 * logged out — and then re-seeds the six institutional accounts itself via
 * `ensureBootstrapUsers`, the same function the web server calls on every
 * boot, so `admin`/`principal`/`deputy-principal`/`inventory-admin`/
 * `academic-admin`/`leave-admin` sign back in with the passwords already in
 * `apps/web/.env`.
 */

config({ path: fileURLToPath(new URL("../apps/web/.env", import.meta.url)) });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — check your .env file");
}

const db = createDb({ DATABASE_URL: databaseUrl });

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — check your .env file`);
  }
  return value;
};

const authConfig = {
  BETTER_AUTH_URL: requireEnv("BETTER_AUTH_URL"),
  BETTER_AUTH_SECRET: requireEnv("BETTER_AUTH_SECRET"),
  PRINCIPAL_PASSWORD: requireEnv("PRINCIPAL_PASSWORD"),
  PRINCIPAL_NAME: process.env.PRINCIPAL_NAME,
  DEPUTY_PRINCIPAL_PASSWORD: requireEnv("DEPUTY_PRINCIPAL_PASSWORD"),
  DEPUTY_PRINCIPAL_NAME: process.env.DEPUTY_PRINCIPAL_NAME,
  ADMIN_PASSWORD: requireEnv("ADMIN_PASSWORD"),
  ADMIN_NAME: process.env.ADMIN_NAME,
  INVENTORY_ADMIN_PASSWORD: requireEnv("INVENTORY_ADMIN_PASSWORD"),
  INVENTORY_ADMIN_NAME: process.env.INVENTORY_ADMIN_NAME,
  ACADEMIC_ADMIN_PASSWORD: requireEnv("ACADEMIC_ADMIN_PASSWORD"),
  ACADEMIC_ADMIN_NAME: process.env.ACADEMIC_ADMIN_NAME,
  LEAVE_ADMIN_PASSWORD: requireEnv("LEAVE_ADMIN_PASSWORD"),
  LEAVE_ADMIN_NAME: process.env.LEAVE_ADMIN_NAME,
};

const log = (line: string) => {
  console.log(`[seed:full] ${line}`);
};

faker.seed(20_260_930);

const newId = () => crypto.randomUUID();

// ─── 0. Wipe ─────────────────────────────────────────────────────────────

/**
 * Every table this script owns, in no particular order — `TRUNCATE ...
 * CASCADE` follows every foreign key regardless of its `ON DELETE` action
 * (including `restrict`), so ordering does not matter the way `DELETE`
 * ordering would.
 */
const TABLES_TO_WIPE = [
  "inventory_audit_log",
  "inventory_transaction",
  "inventory_custody_notice_recipient",
  "inventory_custody_history",
  "inventory_disposal_status_history",
  "inventory_disposal_unit",
  "inventory_disposal",
  "inventory_issue_unit",
  "inventory_issue",
  "inventory_item_replacement",
  "inventory_unit",
  "inventory_item",
  "inventory_category",
  "short_leave_usage",
  "teacher_period_absence",
  "teacher_attendance",
  "attendance_policy",
  "leave_request",
  "leave_entitlement",
  "class_period_teacher",
  "class_period_subject",
  "teacher_subject_assignment",
  "class_teacher_assignment_history",
  "grade_subject_config",
  "class",
  "staff_position",
  "staff",
  "academic_year",
  "verification",
  "session",
  "account",
  "user",
] as const;

const wipe = async () => {
  await db.execute(
    sql.raw(
      `TRUNCATE TABLE ${TABLES_TO_WIPE.map((t) => `"${t}"`).join(", ")} CASCADE;`
    )
  );
  log(`Truncated ${TABLES_TO_WIPE.length} tables`);
};

// ─── 1. Institutional accounts ──────────────────────────────────────────────

const seedInstitutionalAccounts = async () => {
  await ensureBootstrapUsers(db, authConfig);
  log(
    "Re-seeded the six institutional accounts (admin, principal, deputy-principal, inventory-admin, academic-admin, leave-admin)"
  );
};

// ─── 2. Academic years ──────────────────────────────────────────────────────

interface SeededYear {
  id: string;
  year: number;
  isCurrent: boolean;
}

/** Replicates every side effect `createAcademicYear` performs, for a script with no request context. */
const createYear = async (
  year: number,
  isCurrent: boolean
): Promise<SeededYear> => {
  const id = newId();
  const structureVersionKey = "v1";
  // Throws on a bad key, same guard the real procedure has.
  getStructureVersion(structureVersionKey);
  const structureSubversionKey = 1;
  const entries = resolveEntries(structureVersionKey, structureSubversionKey);

  await db.insert(academicYear).values({
    id,
    year,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    structureVersionKey,
    structureSubversionKey,
    isCurrent,
  });

  const offeredEntries = entries.filter((entry) =>
    isStructureEntryOfferedBySchool(
      entry.gradeLevel,
      entry.basketCategory,
      COMPULSORY_BASKET_CATEGORY
    )
  );
  await db.insert(gradeSubjectConfig).values(
    offeredEntries.map((entry: StructureVersionEntry) => ({
      id: newId(),
      academicYearId: id,
      gradeLevel: entry.gradeLevel,
      basketCategory: entry.basketCategory,
      subjectKey: entry.subjectKey,
      sortOrder: entry.sortOrder,
    }))
  );

  await db.insert(leaveEntitlement).values(
    DEFAULT_LEAVE_ENTITLEMENTS.map((entitlement) => ({
      id: newId(),
      academicYearId: id,
      leaveType: entitlement.leaveType,
      paymentStatus: entitlement.paymentStatus,
      maxDays: entitlement.maxDays,
      minDays: entitlement.minDays,
    }))
  );

  await db.insert(attendancePolicy).values({
    id: newId(),
    academicYearId: id,
  });

  log(
    `Created academic year ${year}${isCurrent ? " (current)" : ""} with ${offeredEntries.length} subject-config rows and ${DEFAULT_LEAVE_ENTITLEMENTS.length} leave-entitlement rows`
  );

  return { id, year, isCurrent };
};

// ─── 3. Staff ────────────────────────────────────────────────────────────

type StaffCategoryValue = "teacher" | "officeStaff";
type EmploymentStatusValue =
  | "active"
  | "onLeave"
  | "suspended"
  | "retired"
  | "terminated";
type AppointmentTypeValue =
  | "permanent"
  | "temporary"
  | "specifiedPeriod"
  | "directRecruitment"
  | "promoted"
  | "transferred"
  | "acting"
  | "contract";
type GenderValue = "male" | "female";

const APPOINTMENT_TYPES_CYCLE: AppointmentTypeValue[] = [
  "permanent",
  "temporary",
  "specifiedPeriod",
  "directRecruitment",
  "promoted",
  "transferred",
  "acting",
  "contract",
];
const EMPLOYMENT_STATUS_CYCLE: EmploymentStatusValue[] = [
  "active",
  "active",
  "active",
  "active",
  "active",
  "active",
  "onLeave",
  "suspended",
  "retired",
  "terminated",
];
const DISTRICTS = [
  "colombo",
  "kandy",
  "galle",
  "jaffna",
  "kurunegala",
  "matale",
  "negombo",
  "ratnapura",
] as const;
const RELIGIONS = ["buddhism", "catholicism", "islam"] as const;
const MOTHER_TONGUES = ["sinhala", "tamil"] as const;
const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;
const MARITAL_STATUSES = ["single", "married", "divorced", "widowed"] as const;

/** 9-digit-plus-letter (old) or 12-digit (new) NIC, guaranteed unique in one run. */
const usedNics = new Set<string>();
const nextNic = (): string => {
  for (;;) {
    const old = faker.datatype.boolean();
    const candidate = old
      ? `${faker.string.numeric(9)}${faker.helpers.arrayElement(["V", "X"])}`
      : `1${faker.string.numeric(11)}`;
    if (!usedNics.has(candidate)) {
      usedNics.add(candidate);
      return candidate;
    }
  }
};

interface SeededStaff {
  id: string;
  name: string;
  gender: GenderValue;
  category: StaffCategoryValue;
  employmentStatus: EmploymentStatusValue;
  username: string;
}

const SEED_PASSWORD = "seed-demo-2026";

const createStaffMember = async (options: {
  category: StaffCategoryValue;
  employmentStatus: EmploymentStatusValue;
  appointmentType: AppointmentTypeValue;
}): Promise<SeededStaff> => {
  const gender: GenderValue = faker.helpers.arrayElement(["male", "female"]);
  const firstName = faker.person.firstName(
    gender === "male" ? "male" : "female"
  );
  const lastName = faker.person.lastName();
  const name = `${firstName} ${lastName}`;
  const nic = nextNic();
  const email = faker.internet
    .email({ firstName, lastName, provider: "aloysiuscollege.lk" })
    .toLowerCase();

  const { userId, username } = await createStaffCredential(db, {
    nic,
    password: SEED_PASSWORD,
    name,
    email,
    role: options.category === "teacher" ? "teacher" : "user",
    emailVerified: true,
  });

  const id = newId();
  await db.insert(staff).values({
    id,
    name,
    email,
    nic,
    phone: `0${faker.helpers.arrayElement(["71", "72", "75", "76", "77"])}${faker.string.numeric(7)}`,
    birthDate: faker.date
      .birthdate({ min: 24, max: 62, mode: "age" })
      .toISOString()
      .slice(0, 10),
    gender,
    religion: faker.helpers.arrayElement(RELIGIONS),
    motherTongue: faker.helpers.arrayElement(MOTHER_TONGUES),
    bloodGroup: faker.helpers.arrayElement(BLOOD_GROUPS),
    maritalStatus: faker.helpers.arrayElement(MARITAL_STATUSES),
    spouseName:
      faker.helpers.maybe(() => faker.person.fullName(), {
        probability: 0.4,
      }) ?? null,
    addressLine1: faker.location.streetAddress(),
    addressLine2:
      faker.helpers.maybe(() => faker.location.secondaryAddress()) ?? null,
    city: faker.location.city(),
    district: faker.helpers.arrayElement(DISTRICTS),
    gramaNiladhariDivision: faker.location.county(),
    postalCode: faker.string.numeric(5),
    emergencyContactName: faker.person.fullName(),
    emergencyContactPhone: `0${faker.helpers.arrayElement(["71", "72", "75", "76", "77"])}${faker.string.numeric(7)}`,
    staffCategory: options.category,
    appointmentType: options.appointmentType,
    appointmentDate: faker.date.past({ years: 15 }).toISOString().slice(0, 10),
    teacherServiceNo:
      options.category === "teacher" ? `TSN-${faker.string.numeric(6)}` : null,
    employmentStatus: options.employmentStatus,
    userId,
  });

  return {
    id,
    name,
    gender,
    category: options.category,
    employmentStatus: options.employmentStatus,
    username,
  };
};

// ─── 4. Classes ──────────────────────────────────────────────────────────

const JUNIOR_LETTERS = ["A", "B", "C", "D", "E"];
const SECONDARY_LETTERS = ["A", "B", "C", "D", "E", "F"];
const AL_STREAMS = [
  "bioScience",
  "physicalScience",
  "commerce",
  "arts",
] as const;
const AL_STREAM_LABEL: Record<(typeof AL_STREAMS)[number], string> = {
  bioScience: "BIO",
  physicalScience: "PHY",
  commerce: "COM",
  arts: "ART",
};

interface SeededClass {
  id: string;
  gradeLevel: number;
  name: string;
}

const createClassesForYear = async (yearId: string): Promise<SeededClass[]> => {
  const rows: {
    id: string;
    academicYearId: string;
    gradeLevel: number;
    name: string;
    medium: string;
  }[] = [];

  for (let grade = 1; grade <= 11; grade += 1) {
    const letters = grade <= 5 ? JUNIOR_LETTERS : SECONDARY_LETTERS;
    for (const letter of letters) {
      rows.push({
        id: newId(),
        academicYearId: yearId,
        gradeLevel: grade,
        name: `${grade}-${letter}`,
        medium: letter === "A" ? "english" : "sinhala",
      });
    }
  }
  for (const grade of [12, 13]) {
    for (const streamKey of AL_STREAMS) {
      rows.push({
        id: newId(),
        academicYearId: yearId,
        gradeLevel: grade,
        name: `${grade}-${AL_STREAM_LABEL[streamKey]}`,
        medium: "english",
      });
    }
  }

  await db.insert(class_).values(rows);
  log(`Created ${rows.length} classes (grades 1-13) for one academic year`);
  return rows.map((r) => ({
    id: r.id,
    gradeLevel: r.gradeLevel,
    name: r.name,
  }));
};

// ─── run ─────────────────────────────────────────────────────────────────

/** When a person holds more than one seat, the senior one describes them. */
const LEADERSHIP_PRECEDENCE = ["principal", "vicePrincipal"] as const;

/**
 * Self-contained copy of `packages/api/src/routers/staff/set-current-year.ts`'s
 * `reconcilePositionDerivedRoles`. Not imported directly: that module lives
 * under `packages/api`, whose barrel drags in the TanStack Start server
 * entry points (`#tanstack-router-entry`) through `context.ts`, which a
 * standalone script run with `bun run` cannot resolve. The logic is small
 * and copied verbatim rather than re-derived, so a future change to the real
 * function is the signal to update this one too.
 */
const reconcilePositionDerivedRoles = async (
  academicYearId: string
): Promise<void> => {
  const rows = await db
    .select({
      userId: userTable.id,
      username: userTable.username,
      role: userTable.role,
      position: staffPosition.position,
      staffCategory: staff.staffCategory,
    })
    .from(staffPosition)
    .innerJoin(staff, eq(staffPosition.staffId, staff.id))
    .innerJoin(userTable, eq(staff.userId, userTable.id))
    .where(eq(staffPosition.academicYearId, academicYearId));

  const expectedByUserId = new Map<
    string,
    { leadership: string | null; staffCategory: string | null }
  >();

  for (const row of rows) {
    const existing = expectedByUserId.get(row.userId);
    const leadership = leadershipRoleForPosition(row.position);

    if (!existing) {
      expectedByUserId.set(row.userId, {
        leadership,
        staffCategory: row.staffCategory,
      });
      continue;
    }

    if (
      leadership &&
      LEADERSHIP_PRECEDENCE.includes(
        leadership as (typeof LEADERSHIP_PRECEDENCE)[number]
      ) &&
      (!existing.leadership ||
        LEADERSHIP_PRECEDENCE.indexOf(
          leadership as (typeof LEADERSHIP_PRECEDENCE)[number]
        ) <
          LEADERSHIP_PRECEDENCE.indexOf(
            existing.leadership as (typeof LEADERSHIP_PRECEDENCE)[number]
          ))
    ) {
      existing.leadership = leadership;
    }
  }

  const rowsByUserId = new Map(rows.map((row) => [row.userId, row]));
  const updates: Promise<unknown>[] = [];

  for (const [userId, expected] of expectedByUserId) {
    const current = rowsByUserId.get(userId);
    if (!current) {
      continue;
    }
    const nextRole =
      expected.leadership ??
      (expected.staffCategory === "teacher" ? "teacher" : "user");
    if (
      current.role === nextRole ||
      current.role === "admin" ||
      isSeededAccount(current.username)
    ) {
      continue;
    }
    updates.push(
      db
        .update(userTable)
        .set({ role: nextRole })
        .where(eq(userTable.id, userId))
    );
  }

  await Promise.all(updates);
};

interface YearContext {
  year: SeededYear;
  classes: SeededClass[];
  teachers: SeededStaff[];
  gradeSubjects: Map<number, string[]>;
}

const loadGradeSubjects = async (
  yearId: string
): Promise<Map<number, string[]>> => {
  const rows = await db
    .select({
      gradeLevel: gradeSubjectConfig.gradeLevel,
      subjectKey: gradeSubjectConfig.subjectKey,
    })
    .from(gradeSubjectConfig)
    .where(sql`${gradeSubjectConfig.academicYearId} = ${yearId}`);

  const byGrade = new Map<number, string[]>();
  for (const row of rows) {
    const list = byGrade.get(row.gradeLevel) ?? [];
    list.push(row.subjectKey);
    byGrade.set(row.gradeLevel, list);
  }
  return byGrade;
};

/** Inclusive [start, end] ISO date pair, `days` long from `start`. */
const dayRange = (start: string, days: number): [string, string] => {
  const startDate = new Date(start);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days - 1);
  return [start, endDate.toISOString().slice(0, 10)];
};

const isWeekday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;

// This orchestrator's size and branch count is the whole point of a seed
// script that covers 100% of the system's status permutations in one
// deterministic, readable pass \u2014 splitting it into a dozen same-purpose
// helper functions would not lower its real complexity, only hide the count.
/* oxlint-disable-next-line eslint/complexity -- see note above */
const run = async () => {
  await wipe();
  await seedInstitutionalAccounts();

  const pastYear = await createYear(2024, false);
  const currentYear = await createYear(2026, true);
  const futureYear = await createYear(2027, false);
  const allYears = [pastYear, currentYear, futureYear];

  // ─── Staff: teachers across every category/status/appointment permutation ──
  const teachers: SeededStaff[] = [];
  const TEACHER_COUNT = 42;
  for (let i = 0; i < TEACHER_COUNT; i += 1) {
    const appointmentType =
      APPOINTMENT_TYPES_CYCLE[i % APPOINTMENT_TYPES_CYCLE.length] ??
      "permanent";
    const employmentStatus =
      EMPLOYMENT_STATUS_CYCLE[i % EMPLOYMENT_STATUS_CYCLE.length] ?? "active";
    // biome-ignore lint: sequential await is intentional — NIC uniqueness and
    // createStaffCredential both touch shared state that must not race.
    const teacher = await createStaffMember({
      category: "teacher",
      employmentStatus,
      appointmentType,
    });
    teachers.push(teacher);
  }
  const OFFICE_STAFF_COUNT = 6;
  const officeStaff: SeededStaff[] = [];
  for (let i = 0; i < OFFICE_STAFF_COUNT; i += 1) {
    const officeAppointment =
      APPOINTMENT_TYPES_CYCLE[i % APPOINTMENT_TYPES_CYCLE.length] ??
      "permanent";
    // biome-ignore lint: see note above.
    const member = await createStaffMember({
      category: "officeStaff",
      employmentStatus: "active",
      appointmentType: officeAppointment,
    });
    officeStaff.push(member);
  }
  log(
    `Created ${teachers.length} teachers and ${officeStaff.length} office staff`
  );

  // Active teachers are the eligible pool: staffCategory teacher AND
  // employmentStatus active|null — see teacher-eligibility.ts.
  const activeTeachers = teachers.filter(
    (t) => t.employmentStatus === "active"
  );
  const shuffled = faker.helpers.shuffle(activeTeachers);

  // Leadership/positions, assigned once and held across every year that
  // teacher is active — a real school does not reshuffle leadership yearly.
  const [staffVicePrincipal, staffAssistantPrincipal] = shuffled;
  const sectionalHeads = shuffled.slice(2, 6);
  const sectionalScopes = [
    "primary",
    "grade6_7",
    "grade8_9",
    "grade10_11",
  ] as const;
  const departmentHeads = shuffled.slice(6, 10);
  const plainTeachers = shuffled.slice(10);

  const yearContexts: YearContext[] = [];

  for (const year of allYears) {
    const classes = await createClassesForYear(year.id);

    // Positions: every active teacher gets at least a plain "teacher"
    // position for the year (required for classPeriodTeacher eligibility);
    // the leadership/sectional/department seats layer on top of that.
    const positionRows: {
      id: string;
      staffId: string;
      academicYearId: string;
      position: string;
      sectionalScope: string | null;
    }[] = [];
    for (const t of activeTeachers) {
      positionRows.push({
        id: newId(),
        staffId: t.id,
        academicYearId: year.id,
        position: "teacher",
        sectionalScope: null,
      });
    }
    if (staffVicePrincipal) {
      positionRows.push({
        id: newId(),
        staffId: staffVicePrincipal.id,
        academicYearId: year.id,
        position: "vicePrincipal",
        sectionalScope: null,
      });
    }
    if (staffAssistantPrincipal) {
      positionRows.push({
        id: newId(),
        staffId: staffAssistantPrincipal.id,
        academicYearId: year.id,
        position: "assistantPrincipal",
        sectionalScope: null,
      });
    }
    for (const [i, t] of sectionalHeads.entries()) {
      positionRows.push({
        id: newId(),
        staffId: t.id,
        academicYearId: year.id,
        position: "sectionalHead",
        sectionalScope:
          sectionalScopes[i % sectionalScopes.length] ?? "primary",
      });
    }
    for (const t of departmentHeads) {
      positionRows.push({
        id: newId(),
        staffId: t.id,
        academicYearId: year.id,
        position: "headOfDepartment",
        sectionalScope: null,
      });
    }
    await db.insert(staffPosition).values(positionRows);

    const gradeSubjects = await loadGradeSubjects(year.id);

    // Teacher-subject assignments: every active teacher picks 2-4 subjects
    // that this year's gradeSubjectConfig actually offers, so
    // teacher-eligibility.ts's checks pass by construction.
    const allSubjectKeys = [...new Set([...gradeSubjects.values()].flat())];
    const tsaRows: {
      id: string;
      staffId: string;
      academicYearId: string;
      subjectKey: string;
    }[] = [];
    for (const t of activeTeachers) {
      const pickCount = faker.number.int({ min: 2, max: 4 });
      const picks = faker.helpers.arrayElements(allSubjectKeys, pickCount);
      for (const subjectKey of picks) {
        tsaRows.push({
          id: newId(),
          staffId: t.id,
          academicYearId: year.id,
          subjectKey,
        });
      }
    }
    // A teacher's subject picks are randomised per call and duplicates
    // within one teacher are already ruled out by `arrayElements`, but two
    // different teachers can still land on the same (staff, subject) pair
    // is impossible — `staffId` differs — so no dedupe is needed here.
    if (tsaRows.length > 0) {
      await db.insert(teacherSubjectAssignment).values(tsaRows);
    }

    yearContexts.push({
      year,
      classes,
      teachers: activeTeachers,
      gradeSubjects,
    });
    log(
      `Year ${year.year}: ${positionRows.length} positions, ${tsaRows.length} subject assignments`
    );
  }

  // Reconcile role-from-position for the current year, exactly as
  // `setCurrentYear` does, so the staff-position-based Deputy/Assistant
  // Principal's `user.role` matches their seat (distinct from the seeded
  // `principal`/`deputy-principal` institutional accounts, which stay role
  // "principal"/"vicePrincipal" by their own seeded role, not by position).
  await reconcilePositionDerivedRoles(currentYear.id);
  log("Reconciled position-derived roles for the current year");

  // ─── Homeroom assignment + audit trail (current year, ~70% coverage) ──────
  for (const ctx of yearContexts) {
    const pool = faker.helpers.shuffle(activeTeachers);
    let cursor = 0;
    for (const cls of ctx.classes) {
      if (faker.number.int({ min: 1, max: 10 }) > 7) {
        // ~30% of classes deliberately left without a homeroom teacher.
        continue;
      }
      const homeroom = pool[cursor % pool.length];
      cursor += 1;
      if (!homeroom) {
        continue;
      }
      await db
        .update(class_)
        .set({ homeroomTeacherId: homeroom.id })
        .where(sql`${class_.id} = ${cls.id}`);
      await db.insert(classTeacherAssignmentHistory).values({
        id: newId(),
        classId: cls.id,
        academicYearId: ctx.year.id,
        previousTeacherId: null,
        newTeacherId: homeroom.id,
        changeType: "assigned",
        reason: null,
        note: "Initial homeroom assignment",
      });
    }
  }
  // One mid-year replacement in the current year, to exercise the audit trail's
  // "replaced" branch with a required reason.
  const currentCtx = yearContexts.find((c) => c.year.year === 2026);
  const [firstPlainTeacher, secondPlainTeacher] = plainTeachers;
  const [firstCurrentClass] = currentCtx?.classes ?? [];
  if (
    currentCtx &&
    firstCurrentClass &&
    firstPlainTeacher &&
    secondPlainTeacher
  ) {
    const cls = firstCurrentClass;
    await db
      .update(class_)
      .set({ homeroomTeacherId: secondPlainTeacher.id })
      .where(sql`${class_.id} = ${cls.id}`);
    await db.insert(classTeacherAssignmentHistory).values({
      id: newId(),
      classId: cls.id,
      academicYearId: currentCtx.year.id,
      previousTeacherId: firstPlainTeacher.id,
      newTeacherId: secondPlainTeacher.id,
      changeType: "replaced",
      reason: "transferred",
      note: "Previous homeroom teacher transferred to another school mid-term",
    });
    log("Recorded one mid-year homeroom replacement");
  }

  // ─── Timetable (subject-first, then teacher) ──────────────────────────────
  const buildTimetableForClass = async (
    ctx: YearContext,
    cls: SeededClass,
    teacherBySubject: Map<string, SeededStaff[]>,
    daysCount: number,
    periodsPerDay: number
  ) => {
    const subjects = ctx.gradeSubjects.get(cls.gradeLevel) ?? [];
    if (subjects.length === 0) {
      return;
    }
    let subjectCursor = 0;
    for (let day = 1; day <= daysCount; day += 1) {
      for (let period = 1; period <= periodsPerDay; period += 1) {
        const subjectKey =
          subjects[subjectCursor % subjects.length] ?? subjects[0];
        subjectCursor += 1;
        if (!subjectKey) {
          continue;
        }
        const subjectId = newId();
        await db.insert(classPeriodSubject).values({
          id: subjectId,
          academicYearId: ctx.year.id,
          classId: cls.id,
          dayOfWeek: day,
          periodNumber: period,
          subjectKey,
        });
        const candidates = teacherBySubject.get(subjectKey) ?? [];
        const [chosen] = candidates;
        if (chosen) {
          await db.insert(classPeriodTeacher).values({
            id: newId(),
            classPeriodSubjectId: subjectId,
            staffId: chosen.id,
            isCombinedSession: false,
          });
        }
      }
    }
  };

  for (const ctx of yearContexts) {
    const teacherBySubject = new Map<string, SeededStaff[]>();
    const tsaRows = await db
      .select({
        staffId: teacherSubjectAssignment.staffId,
        subjectKey: teacherSubjectAssignment.subjectKey,
      })
      .from(teacherSubjectAssignment)
      .where(sql`${teacherSubjectAssignment.academicYearId} = ${ctx.year.id}`);
    const staffById = new Map(ctx.teachers.map((t) => [t.id, t]));
    for (const row of tsaRows) {
      const t = staffById.get(row.staffId);
      if (!t) {
        continue;
      }
      const list = teacherBySubject.get(row.subjectKey) ?? [];
      list.push(t);
      teacherBySubject.set(row.subjectKey, list);
    }

    const isCurrent = ctx.year.year === 2026;
    const sampleGrades = isCurrent ? [1, 3, 6, 8, 10, 11, 12] : [1, 6, 10];
    const sampleClasses = ctx.classes.filter((c) =>
      sampleGrades.includes(c.gradeLevel)
    );
    const daysCount = isCurrent ? 5 : 3;
    const periodsPerDay = isCurrent ? CODE_DEFINED_PERIODS.length : 4;

    for (const cls of sampleClasses) {
      await buildTimetableForClass(
        ctx,
        cls,
        teacherBySubject,
        daysCount,
        periodsPerDay
      );
    }

    if (isCurrent) {
      // Deliberate double-booking: the same teacher in two different classes,
      // same day/period, `isCombinedSession` left false — `listPeriodConflicts`
      // must flag this.
      //
      // Reuses the day-1/period-1 slots `buildTimetableForClass` already
      // created for two different classes, rather than inserting new
      // `classPeriodSubject` rows: every (day, period) in the sampled range
      // is already filled by the main loop above, so a second insert at the
      // same slot would collide with `class_period_subject_slot_subject_unique`
      // if it landed on the same subject. Attaching a second
      // `classPeriodTeacher` row to an existing slot is both simpler and a
      // more realistic shape for the scenario: the same teacher genuinely
      // double-booked across two classes' first periods.
      const [classA, classB, classC, classD] = sampleClasses;
      const [anyTeacher, secondTeacher] = ctx.teachers;
      const findSlot = async (classId: string, day: number, period: number) => {
        const [row] = await db
          .select({ id: classPeriodSubject.id })
          .from(classPeriodSubject)
          .where(
            sql`${classPeriodSubject.academicYearId} = ${ctx.year.id} and ${classPeriodSubject.classId} = ${classId} and ${classPeriodSubject.dayOfWeek} = ${day} and ${classPeriodSubject.periodNumber} = ${period}`
          )
          .limit(1);
        return row?.id;
      };
      const tryInsertTeacher = async (values: {
        id: string;
        classPeriodSubjectId: string;
        staffId: string;
        isCombinedSession: boolean;
      }) => {
        try {
          await db.insert(classPeriodTeacher).values(values);
        } catch {
          // Already assigned to this slot (e.g. the regular timetable build
          // coincidentally picked the same teacher) - nothing to demonstrate
          // twice.
        }
      };
      if (classA && classB && anyTeacher) {
        const slotA = await findSlot(classA.id, 1, 1);
        const slotB = await findSlot(classB.id, 1, 1);
        if (slotA) {
          await tryInsertTeacher({
            id: newId(),
            classPeriodSubjectId: slotA,
            staffId: anyTeacher.id,
            isCombinedSession: false,
          });
        }
        if (slotB) {
          await tryInsertTeacher({
            id: newId(),
            classPeriodSubjectId: slotB,
            staffId: anyTeacher.id,
            isCombinedSession: false,
          });
        }
      }

      // Legitimate combined session: a second teacher across two more
      // classes' day-2/period-1 slots — must NOT be flagged by
      // `listPeriodConflicts` because `isCombinedSession` is true on both.
      if (secondTeacher && classC && classD) {
        const slotC = await findSlot(classC.id, 2, 1);
        const slotD = await findSlot(classD.id, 2, 1);
        for (const slotId of [slotC, slotD]) {
          if (!slotId) {
            continue;
          }
          await tryInsertTeacher({
            id: newId(),
            classPeriodSubjectId: slotId,
            staffId: secondTeacher.id,
            isCombinedSession: true,
          });
        }
      }
    }

    log(
      `Year ${ctx.year.year}: timetable built for ${sampleClasses.length} classes`
    );
  }

  // ─── Leave: every status/quota/overlap permutation, per year ──────────────
  const leaveSubjects = faker.helpers.shuffle(activeTeachers).slice(0, 14);
  const femaleLeaveSubject = leaveSubjects.find((t) => t.gender === "female");

  const insertLeave = async (row: {
    staffId: string;
    academicYearId: string;
    type: string;
    startDate: string;
    endDate: string;
    dayPart?: "full" | "morning" | "afternoon";
    paymentStatus?: string;
    reason?: string;
    status: "pending" | "recommended" | "approved" | "rejected" | "cancelled";
    deputyStatus: "pending" | "recommended" | "rejected";
    deputyStaffId?: string | null;
    deputyActedAt?: Date | null;
    deputyComment?: string | null;
    finalStatus: "pending" | "approved" | "rejected";
    principalStaffId?: string | null;
    principalActedAt?: Date | null;
    principalComment?: string | null;
    finalizedAt?: Date | null;
  }) => {
    const id = newId();
    await db.insert(leaveRequest).values({
      id,
      staffId: row.staffId,
      academicYearId: row.academicYearId,
      type: row.type,
      startDate: row.startDate,
      endDate: row.endDate,
      dayPart: row.dayPart ?? "full",
      paymentStatus: row.paymentStatus ?? "notApplicable",
      reason: row.reason ?? faker.lorem.sentence(),
      status: row.status,
      deputyStatus: row.deputyStatus,
      deputyStaffId: row.deputyStaffId ?? null,
      deputyActedAt: row.deputyActedAt ?? null,
      deputyComment: row.deputyComment ?? null,
      finalStatus: row.finalStatus,
      principalStaffId: row.principalStaffId ?? null,
      principalActedAt: row.principalActedAt ?? null,
      principalComment: row.principalComment ?? null,
      finalizedAt: row.finalizedAt ?? null,
    });
    return id;
  };

  let leaveCount = 0;
  for (const ctx of yearContexts) {
    const y = ctx.year.year;
    const [t0, t1, t2, t3, t4, t5, t6] = leaveSubjects;

    // 1. Pending, freshly submitted.
    if (t0) {
      await insertLeave({
        staffId: t0.id,
        academicYearId: ctx.year.id,
        type: "casual",
        startDate: dayRange(`${y}-03-10`, 1)[0],
        endDate: dayRange(`${y}-03-10`, 1)[1],
        status: "pending",
        deputyStatus: "pending",
        finalStatus: "pending",
      });
      leaveCount += 1;
    }
    // 2. Deputy recommended, awaiting Principal.
    if (t1) {
      const [s, e] = dayRange(`${y}-04-02`, 2);
      await insertLeave({
        staffId: t1.id,
        academicYearId: ctx.year.id,
        type: "annual",
        startDate: s,
        endDate: e,
        status: "recommended",
        deputyStatus: "recommended",
        deputyStaffId: staffVicePrincipal?.id ?? null,
        deputyActedAt: new Date(`${y}-03-28T09:00:00Z`),
        deputyComment: "Recommended — no timetable clash",
        finalStatus: "pending",
      });
      leaveCount += 1;
    }
    // 3. Deputy rejected — chain stops there.
    if (t2) {
      const [s, e] = dayRange(`${y}-05-12`, 3);
      await insertLeave({
        staffId: t2.id,
        academicYearId: ctx.year.id,
        type: "annual",
        startDate: s,
        endDate: e,
        status: "rejected",
        deputyStatus: "rejected",
        deputyStaffId: null,
        deputyActedAt: new Date(`${y}-05-08T09:00:00Z`),
        deputyComment: "Clashes with the mid-term exam schedule",
        finalStatus: "pending",
      });
      leaveCount += 1;
    }
    // 4. Approved end to end.
    if (t3) {
      const [s, e] = dayRange(`${y}-06-01`, 2);
      await insertLeave({
        staffId: t3.id,
        academicYearId: ctx.year.id,
        type: "medical",
        startDate: s,
        endDate: e,
        status: "approved",
        deputyStatus: "recommended",
        deputyStaffId: staffVicePrincipal?.id ?? null,
        deputyActedAt: new Date(`${y}-05-30T09:00:00Z`),
        deputyComment: "Medical certificate on file",
        finalStatus: "approved",
        principalStaffId: null,
        principalActedAt: new Date(`${y}-05-31T09:00:00Z`),
        principalComment: "Approved",
        finalizedAt: new Date(`${y}-05-31T09:00:00Z`),
      });
      leaveCount += 1;
    }
    // 5. Principal rejected after Deputy recommended.
    if (t4) {
      const [s, e] = dayRange(`${y}-07-14`, 4);
      await insertLeave({
        staffId: t4.id,
        academicYearId: ctx.year.id,
        type: "duty",
        startDate: s,
        endDate: e,
        status: "rejected",
        deputyStatus: "recommended",
        deputyStaffId: staffVicePrincipal?.id ?? null,
        deputyActedAt: new Date(`${y}-07-10T09:00:00Z`),
        deputyComment: "Recommended",
        finalStatus: "rejected",
        principalStaffId: null,
        principalActedAt: new Date(`${y}-07-11T09:00:00Z`),
        principalComment:
          "Duty leave quota already committed elsewhere this term",
        finalizedAt: new Date(`${y}-07-11T09:00:00Z`),
      });
      leaveCount += 1;
    }
    // 6. Cancelled by the owner before any decision.
    if (t5) {
      const [s, e] = dayRange(`${y}-08-05`, 1);
      await insertLeave({
        staffId: t5.id,
        academicYearId: ctx.year.id,
        type: "other",
        startDate: s,
        endDate: e,
        reason: "Personal — withdrawn",
        status: "cancelled",
        deputyStatus: "pending",
        finalStatus: "pending",
      });
      leaveCount += 1;
    }
    // 7. Half-day (morning), approved.
    if (t6) {
      const [s] = dayRange(`${y}-09-09`, 1);
      await insertLeave({
        staffId: t6.id,
        academicYearId: ctx.year.id,
        type: "casual",
        startDate: s,
        endDate: s,
        dayPart: "morning",
        status: "approved",
        deputyStatus: "recommended",
        deputyStaffId: staffVicePrincipal?.id ?? null,
        deputyActedAt: new Date(`${y}-09-08T09:00:00Z`),
        finalStatus: "approved",
        principalActedAt: new Date(`${y}-09-08T10:00:00Z`),
        finalizedAt: new Date(`${y}-09-08T10:00:00Z`),
      });
      leaveCount += 1;
    }
    // 8. At-quota-boundary: 4 approved casual requests of 5 days each = 20,
    // exactly `DEFAULT_LEAVE_ENTITLEMENTS`'s casual maxDays.
    if (t0) {
      for (let block = 0; block < 4; block += 1) {
        const [s, e] = dayRange(`${y}-01-${6 + block * 7}`, 5);
        await insertLeave({
          staffId: t0.id,
          academicYearId: ctx.year.id,
          type: "casual",
          startDate: s,
          endDate: e,
          status: "approved",
          deputyStatus: "recommended",
          deputyStaffId: staffVicePrincipal?.id ?? null,
          deputyActedAt: new Date(`${y}-01-01T09:00:00Z`),
          finalStatus: "approved",
          principalActedAt: new Date(`${y}-01-02T09:00:00Z`),
          finalizedAt: new Date(`${y}-01-02T09:00:00Z`),
        });
        leaveCount += 1;
      }
    }
    // 9. Over-quota history (only in the closed past year, since the live
    // `applyLeave` flow would now refuse this — it exists to show the UI
    // correctly surfaces an already-over-quota teacher from before the rule
    // was enforced as strictly).
    if (y === 2024 && t1) {
      const [s, e] = dayRange(`${y}-02-01`, 25);
      await insertLeave({
        staffId: t1.id,
        academicYearId: ctx.year.id,
        type: "annual",
        startDate: s,
        endDate: e,
        reason: "Extended leave, pre-dates the current quota enforcement",
        status: "approved",
        deputyStatus: "recommended",
        deputyStaffId: staffVicePrincipal?.id ?? null,
        deputyActedAt: new Date(`${y}-01-28T09:00:00Z`),
        finalStatus: "approved",
        principalActedAt: new Date(`${y}-01-29T09:00:00Z`),
        finalizedAt: new Date(`${y}-01-29T09:00:00Z`),
      });
      leaveCount += 1;
    }
    // 10. Overlapping pending + approved pair (the live flow refuses this
    // combination going forward; existing history must still render).
    if (t2) {
      const [s1, e1] = dayRange(`${y}-10-05`, 3);
      const [s2, e2] = dayRange(`${y}-10-06`, 3);
      await insertLeave({
        staffId: t2.id,
        academicYearId: ctx.year.id,
        type: "annual",
        startDate: s1,
        endDate: e1,
        status: "approved",
        deputyStatus: "recommended",
        deputyStaffId: staffVicePrincipal?.id ?? null,
        deputyActedAt: new Date(`${y}-10-01T09:00:00Z`),
        finalStatus: "approved",
        principalActedAt: new Date(`${y}-10-02T09:00:00Z`),
        finalizedAt: new Date(`${y}-10-02T09:00:00Z`),
      });
      await insertLeave({
        staffId: t2.id,
        academicYearId: ctx.year.id,
        type: "casual",
        startDate: s2,
        endDate: e2,
        status: "pending",
        deputyStatus: "pending",
        finalStatus: "pending",
      });
      leaveCount += 2;
    }
    // 11. Maternity — paid tier then half-pay tier, female staff only.
    const maternitySubject = femaleLeaveSubject;
    if (maternitySubject) {
      const [s1, e1] = dayRange(`${y}-02-01`, 84);
      await insertLeave({
        staffId: maternitySubject.id,
        academicYearId: ctx.year.id,
        type: "maternity",
        startDate: s1,
        endDate: e1,
        paymentStatus: "paid",
        status: "approved",
        deputyStatus: "recommended",
        deputyStaffId: staffVicePrincipal?.id ?? null,
        deputyActedAt: new Date(`${y}-01-25T09:00:00Z`),
        finalStatus: "approved",
        principalActedAt: new Date(`${y}-01-26T09:00:00Z`),
        finalizedAt: new Date(`${y}-01-26T09:00:00Z`),
      });
      const [s2, e2] = dayRange(`${y}-04-26`, 84);
      await insertLeave({
        staffId: maternitySubject.id,
        academicYearId: ctx.year.id,
        type: "maternity",
        startDate: s2,
        endDate: e2,
        paymentStatus: "halfPay",
        status: "approved",
        deputyStatus: "recommended",
        deputyStaffId: staffVicePrincipal?.id ?? null,
        deputyActedAt: new Date(`${y}-01-25T09:00:00Z`),
        finalStatus: "approved",
        principalActedAt: new Date(`${y}-01-26T09:00:00Z`),
        finalizedAt: new Date(`${y}-01-26T09:00:00Z`),
      });
      leaveCount += 2;
    }
  }
  log(
    `Created ${leaveCount} leave requests across ${yearContexts.length} academic years`
  );

  // ─── Attendance: daily register + leave-derived, current year only ───────
  const currentCtxForAttendance = yearContexts.find(
    (c) => c.year.year === 2026
  );
  if (currentCtxForAttendance) {
    const attendanceStatuses = [
      "present",
      "present",
      "present",
      "present",
      "partial",
      "absent",
      "lateShortLeave",
      "halfDay",
    ] as const;
    const today = new Date("2026-09-30T00:00:00Z");
    const days: Date[] = [];
    for (let offset = -15; offset <= 10; offset += 1) {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      if (isWeekday(d)) {
        days.push(d);
      }
    }
    const attendanceSubjects = faker.helpers
      .shuffle(activeTeachers)
      .slice(0, 10);
    let attendanceRows = 0;
    for (const t of attendanceSubjects) {
      for (const day of days) {
        const dateStr = day.toISOString().slice(0, 10);
        const status = faker.helpers.arrayElement(attendanceStatuses);
        const attendanceId = newId();
        await db.insert(teacherAttendance).values({
          id: attendanceId,
          staffId: t.id,
          academicYearId: currentCtxForAttendance.year.id,
          date: dateStr,
          status,
          reason:
            status === "absent"
              ? faker.helpers.arrayElement([
                  "Sick",
                  "Personal emergency",
                  "Family function",
                ])
              : null,
        });
        attendanceRows += 1;
        if (status === "partial") {
          await db.insert(teacherPeriodAbsence).values({
            id: newId(),
            teacherAttendanceId: attendanceId,
            periodNumber: faker.number.int({ min: 5, max: 8 }),
            reason: "Left early — medical appointment",
          });
        }
      }
    }
    const shortLeaveRows = [
      attendanceSubjects[0]
        ? { staffId: attendanceSubjects[0].id, shortLeavesUsed: 1 }
        : null,
      attendanceSubjects[1]
        ? { staffId: attendanceSubjects[1].id, shortLeavesUsed: 2 }
        : null,
    ].filter(
      (row): row is { staffId: string; shortLeavesUsed: number } => row !== null
    );
    if (shortLeaveRows.length > 0) {
      await db.insert(shortLeaveUsage).values(
        shortLeaveRows.map((row) => ({
          id: newId(),
          staffId: row.staffId,
          academicYearId: currentCtxForAttendance.year.id,
          yearMonth: "2026-09",
          shortLeavesUsed: row.shortLeavesUsed,
        }))
      );
    }
    log(
      `Created ${attendanceRows} daily attendance rows + short-leave usage counters`
    );
  }

  // ─── Inventory ─────────────────────────────────────────────────────────
  // `ensureBootstrapUsers` (called above, in step 1) already seeded the eight
  // default categories via its own `ensureInventoryCategories` - read them
  // back rather than inserting a second time, which would collide with
  // `inventory_category_normalized_name_unique`.
  const categoryRows = await db
    .select({ id: inventoryCategory.id, name: inventoryCategory.name })
    .from(inventoryCategory);
  const categoryByName = new Map(categoryRows.map((c) => [c.name, c.id]));
  log(`Read ${categoryRows.length} existing inventory categories`);

  const custodianPool = faker.helpers.shuffle([
    ...activeTeachers,
    ...officeStaff,
  ]);
  const managerPool = faker.helpers.shuffle([
    ...activeTeachers,
    ...officeStaff,
  ]);

  interface SeededItem {
    id: string;
    sku: string;
    name: string;
    borrowable: boolean;
    custodianStaffId: string;
    managerStaffId: string;
  }

  const items: SeededItem[] = [];
  const ITEM_DEFS: {
    name: string;
    category: string;
    qty: number;
    borrowable: boolean;
    condition: string;
  }[] = [
    {
      name: "Digital Camera",
      category: "Audio Visual",
      qty: 1,
      borrowable: true,
      condition: "Good",
    },
    {
      name: "LCD Projector",
      category: "Audio Visual",
      qty: 3,
      borrowable: true,
      condition: "Good",
    },
    {
      name: "PA Speaker Set",
      category: "Audio Visual",
      qty: 2,
      borrowable: true,
      condition: "Fair",
    },
    {
      name: "Laptop — Dell Latitude",
      category: "IT Equipment",
      qty: 8,
      borrowable: true,
      condition: "Good",
    },
    {
      name: "Desktop PC",
      category: "IT Equipment",
      qty: 20,
      borrowable: false,
      condition: "Good",
    },
    {
      name: "Wireless Router",
      category: "IT Equipment",
      qty: 4,
      borrowable: false,
      condition: "Fair",
    },
    {
      name: "Microscope",
      category: "Lab Equipment",
      qty: 12,
      borrowable: true,
      condition: "Good",
    },
    {
      name: "Bunsen Burner",
      category: "Lab Equipment",
      qty: 25,
      borrowable: false,
      condition: "Good",
    },
    {
      name: "Football Set",
      category: "Sports Equipment",
      qty: 6,
      borrowable: true,
      condition: "Fair",
    },
    {
      name: "Cricket Kit",
      category: "Sports Equipment",
      qty: 3,
      borrowable: true,
      condition: "Good",
    },
    {
      name: "Office Chair",
      category: "Furniture",
      qty: 40,
      borrowable: false,
      condition: "Good",
    },
    {
      name: "Whiteboard",
      category: "Furniture",
      qty: 15,
      borrowable: false,
      condition: "Damaged",
    },
    {
      name: "Vacuum Cleaner",
      category: "Cleaning",
      qty: 2,
      borrowable: false,
      condition: "Under Repair",
    },
    {
      name: "Industrial Fan",
      category: "Cleaning",
      qty: 5,
      borrowable: false,
      condition: "Good",
    },
    {
      name: "Rice Cooker",
      category: "Kitchen",
      qty: 3,
      borrowable: false,
      condition: "Good",
    },
    {
      name: "Refrigerator",
      category: "Kitchen",
      qty: 1,
      borrowable: false,
      condition: "Fair",
    },
    {
      name: "Photocopier",
      category: "Other",
      qty: 2,
      borrowable: false,
      condition: "Good",
    },
    {
      name: "Generator",
      category: "Other",
      qty: 1,
      borrowable: false,
      condition: "Good",
    },
  ];
  let skuCounter = 90_001;
  for (const def of ITEM_DEFS) {
    const custodian = faker.helpers.arrayElement(custodianPool);
    const manager = faker.helpers.arrayElement(managerPool);
    const id = newId();
    const sku = `INV-${skuCounter}`;
    skuCounter += 1;
    const categoryId = categoryByName.get(def.category);
    if (!categoryId) {
      continue;
    }
    await db.insert(inventoryItem).values({
      id,
      sku,
      categoryId,
      name: def.name,
      description: faker.commerce.productDescription(),
      unit: "unit",
      qty: def.qty,
      borrowable: def.borrowable,
      condition: def.condition,
      minQty: Math.max(1, Math.floor(def.qty / 10)),
      purchaseValue: faker.commerce.price({ min: 5000, max: 250_000, dec: 2 }),
      currentValue: faker.commerce.price({ min: 2000, max: 200_000, dec: 2 }),
      purchaseDate: faker.date.past({ years: 4 }),
      depreciationRatePercent: "10.00",
      managerStaffId: manager.id,
      custodianStaffId: custodian.id,
    });
    items.push({
      id,
      sku,
      name: def.name,
      borrowable: def.borrowable,
      custodianStaffId: custodian.id,
      managerStaffId: manager.id,
    });
    await db.insert(inventoryTransaction).values({
      id: newId(),
      actorStaffId: manager.id,
      action: "created",
      itemId: id,
      qtyBefore: 0,
      qtyAfter: def.qty,
      meta: { actorName: manager.name },
    });
    await db.insert(inventoryAuditLog).values({
      id: newId(),
      actorStaffId: manager.id,
      actorName: manager.name,
      action: "item.create",
      entityType: "inventory_item",
      entityId: id,
      before: null,
      after: { name: def.name, qty: def.qty },
    });
    await db.insert(inventoryCustodyHistory).values({
      id: newId(),
      itemId: id,
      previousCustodianStaffId: null,
      newCustodianStaffId: custodian.id,
      previousManagerStaffId: null,
      newManagerStaffId: manager.id,
      changeType: "manager_assigned",
      reason: null,
      changedByStaffId: manager.id,
    });
  }
  log(`Seeded ${items.length} inventory items`);

  // One voided item.
  const voidedTarget = items.at(-1);
  if (voidedTarget) {
    await db
      .update(inventoryItem)
      .set({
        voidedAt: new Date(),
        voidReason: "Duplicate entry, superseded by a corrected line",
        voidedByStaffId: voidedTarget.managerStaffId,
      })
      .where(sql`${inventoryItem.id} = ${voidedTarget.id}`);
  }

  // Units: three tagged units each for the first three borrowable items.
  const trackedItems = items.filter((i) => i.borrowable).slice(0, 4);
  const unitsByItem = new Map<
    string,
    { id: string; uniqueNo: string; status: string }[]
  >();
  const unitStatusCycle = [
    "available",
    "issued",
    "disposed",
    "removed",
  ] as const;
  let unitCursor = 0;
  for (const item of trackedItems) {
    const units: { id: string; uniqueNo: string; status: string }[] = [];
    for (let i = 0; i < 3; i += 1) {
      const status =
        unitStatusCycle[unitCursor % unitStatusCycle.length] ?? "available";
      unitCursor += 1;
      const uniqueNo = `AT-${faker.string.alphanumeric(6).toUpperCase()}`;
      const id = newId();
      await db.insert(inventoryUnit).values({
        id,
        itemId: item.id,
        uniqueNo,
        normalizedUniqueNo: uniqueNo.toLowerCase(),
        status,
        condition: "Good",
        location: faker.commerce.department(),
      });
      units.push({ id, uniqueNo, status });
    }
    unitsByItem.set(item.id, units);
  }
  log(`Seeded tagged units for ${trackedItems.length} items`);

  // Issues: a permanent hand-over out of the store, free-text receiver.
  const issuableItem = items.find((i) => !i.borrowable) ?? items[0];
  if (issuableItem) {
    const issueId = newId();
    await db.insert(inventoryIssue).values({
      id: issueId,
      itemId: issuableItem.id,
      qty: 2,
      receiverName: faker.person.fullName(),
      receiverDepartment: "Provincial Education Office",
      receiverPhone: "0712345678",
      purpose: "Transferred to a sister school under the same zonal office",
      approvedBy: staffVicePrincipal?.name ?? "Deputy Principal",
      issuedByStaffId: issuableItem.managerStaffId,
    });
    log("Seeded one inventory issue (permanent hand-over)");
    const issuedUnitEntry = [...unitsByItem.entries()].find(
      ([itemId]) => itemId === issuableItem.id
    );
    const issuedUnit = issuedUnitEntry?.[1].find((u) => u.status === "issued");
    if (issuedUnit) {
      await db.insert(inventoryIssueUnit).values({
        issueId,
        unitId: issuedUnit.id,
      });
    }
  }

  // Disposals: every status in the state machine.
  const [firstManager, secondManager] = managerPool;
  const disposalStaff = firstManager;
  const disposalSecond = secondManager ?? firstManager;
  if (disposalStaff && disposalSecond) {
    const disposalDefs: {
      itemIndex: number;
      status: string;
      finalStatus?: string;
    }[] = [
      { itemIndex: 0, status: "pending_approval" },
      { itemIndex: 1, status: "approved" },
      { itemIndex: 2, status: "disposed", finalStatus: "disposed" },
      { itemIndex: 3, status: "recycled", finalStatus: "recycled" },
      { itemIndex: 4, status: "auctioned", finalStatus: "auctioned" },
      { itemIndex: 5, status: "written_off", finalStatus: "written_off" },
      { itemIndex: 6, status: "donated", finalStatus: "donated" },
      {
        itemIndex: 7,
        status: "returned_to_supplier",
        finalStatus: "returned_to_supplier",
      },
      { itemIndex: 8, status: "cancelled" },
    ];
    const methodFor: Record<string, string> = {
      disposed: "Disposal",
      recycled: "Recycling",
      auctioned: "Auction",
      written_off: "Write-Off",
      donated: "Donation",
      returned_to_supplier: "Return to Supplier",
      pending_approval: "Disposal",
      approved: "Disposal",
      cancelled: "Disposal",
    };
    let disposalsSeeded = 0;
    for (const def of disposalDefs) {
      const item = items[def.itemIndex % items.length];
      if (!item) {
        continue;
      }
      const disposalId = newId();
      const requestedAt = new Date("2026-05-01T09:00:00Z");
      const approvedAt =
        def.status === "pending_approval"
          ? null
          : new Date("2026-05-03T09:00:00Z");
      const isFinal = Boolean(def.finalStatus);
      const isCancelled = def.status === "cancelled";
      await db.insert(inventoryDisposal).values({
        id: disposalId,
        itemId: item.id,
        qty: 1,
        reason: "End of service life",
        method: methodFor[def.status] ?? "Disposal",
        status: def.status,
        estimatedValue: "1500.00",
        requestedByStaffId: disposalStaff.id,
        requestedAt,
        approvedByStaffId:
          def.status === "pending_approval" ? null : disposalSecond.id,
        approvedAt: def.status === "pending_approval" ? null : approvedAt,
        finalizedByStaffId: isFinal ? disposalStaff.id : null,
        finalizedAt: isFinal ? new Date("2026-05-10T09:00:00Z") : null,
        cancelledByStaffId: isCancelled ? disposalStaff.id : null,
        cancelledAt: isCancelled ? new Date("2026-05-05T09:00:00Z") : null,
        cancellationReason: isCancelled
          ? "Item repaired instead, no longer needs write-off"
          : null,
      });
      await db.insert(inventoryDisposalStatusHistory).values({
        id: newId(),
        disposalId,
        fromStatus: null,
        toStatus: "pending_approval",
        changedByStaffId: disposalStaff.id,
      });
      if (def.status !== "pending_approval") {
        await db.insert(inventoryDisposalStatusHistory).values({
          id: newId(),
          disposalId,
          fromStatus: "pending_approval",
          toStatus: def.status === "cancelled" ? "cancelled" : "approved",
          changedByStaffId: disposalSecond.id,
        });
      }
      if (isFinal) {
        await db.insert(inventoryDisposalStatusHistory).values({
          id: newId(),
          disposalId,
          fromStatus: "approved",
          toStatus: def.status,
          changedByStaffId: disposalStaff.id,
        });
        await db.insert(inventoryTransaction).values({
          id: newId(),
          actorStaffId: disposalStaff.id,
          action: "disposal_finalized",
          itemId: item.id,
          qtyBefore: 1,
          qtyAfter: 0,
          meta: { actorName: disposalStaff.name, disposalId },
        });
      }
      disposalsSeeded += 1;
    }
    log(
      `Seeded ${disposalsSeeded} disposals covering every state-machine status`
    );
  }

  // Custody transfer + notice recipients (manager/previous_custodian/sub_manager, one acknowledged, one disputed).
  const [transferItem] = items;
  if (transferItem && custodianPool[1] && custodianPool[2]) {
    const historyId = newId();
    await db.insert(inventoryCustodyHistory).values({
      id: historyId,
      itemId: transferItem.id,
      previousCustodianStaffId: transferItem.custodianStaffId,
      newCustodianStaffId: custodianPool[1].id,
      previousManagerStaffId: null,
      newManagerStaffId: null,
      changeType: "custody_transferred",
      reason: faker.helpers.arrayElement(INVENTORY_TRANSFER_REASON_KEYS),
      note: "Handed over at the term's staff meeting",
      changedByStaffId: transferItem.managerStaffId,
    });
    await db.insert(inventoryCustodyNoticeRecipient).values([
      {
        id: newId(),
        custodyHistoryId: historyId,
        staffId: transferItem.managerStaffId,
        role: "manager",
        acknowledgedAt: new Date(),
      },
      {
        id: newId(),
        custodyHistoryId: historyId,
        staffId: transferItem.custodianStaffId,
        role: "previous_custodian",
        acknowledgedAt: new Date(),
        disputedAt: new Date(),
        disputeNote:
          "Item was already handed back to the store before this transfer was logged",
      },
      {
        id: newId(),
        custodyHistoryId: historyId,
        staffId: custodianPool[2].id,
        role: "sub_manager",
      },
    ]);
    log(
      "Seeded one custody transfer with three notice recipients (one disputed, one unacknowledged)"
    );
  }

  log("Done.");
  log(
    `Sign in as any generated teacher with username "<their NIC, lowercased>" / password "${SEED_PASSWORD}". Institutional accounts use the usernames/passwords already in apps/web/.env.`
  );
};

await run();
process.exit(0);
