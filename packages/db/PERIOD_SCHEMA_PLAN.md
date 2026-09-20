# Period/Timetable Schema Design

## Overview

This document outlines the database schema design for the school period/timetable system. The system models:
- Fixed daily periods (school day structure: 8 periods + breaks)
- Weekly timetable assignments (mapping classes/teachers to period slots)
- Year-scoped period assignment history
- Double-booking prevention constraints

## Daily Period Structure (Configurable)

**Sri Lankan School Day: 7:40 AM – 1:30 PM (350 minutes)**

The school day consists of 8 fixed periods, configurable via a database constant. Current default schedule:

| Period | Start   | End     | Duration | Notes                  |
|--------|---------|---------|----------|------------------------|
| 1      | 7:40    | 8:20    | 40 min   |                        |
| 2      | 8:20    | 9:00    | 40 min   |                        |
| 3      | 9:00    | 9:40    | 40 min   |                        |
| —      | 9:40    | 9:55    | 15 min   | Tea break (not a period slot) |
| 4      | 9:55    | 10:35   | 40 min   |                        |
| 5      | 10:35   | 11:15   | 40 min   |                        |
| 6      | 11:15   | 11:55   | 40 min   |                        |
| —      | 11:55   | 12:10   | 15 min   | Lunch break (not a period slot) |
| 7      | 12:10   | 12:50   | 40 min   |                        |
| 8      | 12:50   | 1:30    | 40 min   |                        |

**Constraint:** This is school-wide and non-negotiable for a given academic year (may differ year-to-year if school policy changes, but is fixed within a year). Stored as a configuration constant or referenced separately, not duplicated in every assignment row.

---

## Database Tables

### 1. `period_config`
Stores the school's daily period schedule (configurable per academic year, allowing schools to change periods between years).

**Columns:**
- `id` (text, PK): Unique identifier
- `academicYearId` (text, FK → `academic_year.id`, NOT NULL): Required; cascading delete
- `periodNumber` (integer, NOT NULL): 1–8
- `startTime` (text, NOT NULL): ISO time string (HH:MM), e.g., "07:40"
- `endTime` (text, NOT NULL): ISO time string (HH:MM), e.g., "08:20"
- `createdAt` (timestamp): Metadata
- `updatedAt` (timestamp): Metadata

**Indexes:**
- `(academicYearId, periodNumber)` UNIQUE — only one config per year+period
- `academicYearId` — quick lookup all periods for a year

**Notes:**
- Immutable once created (no `updatePeriodConfig` procedure; if the school changes periods, create a new academic year)
- All 8 periods must exist for an academic year before assignments can be made
- Time validation: non-overlapping, in ascending order, etc. happens at API layer

**Valibot Schema Pattern (following `staff.ts` convention):**
```typescript
export type PeriodConfigId = Brand<string, "PeriodConfigId">;
export const periodConfigIdSchema = v.pipe(v.string(), brand<string, "PeriodConfigId">());

// Time string (HH:MM)
const periodTimeSchema = v.pipe(
  v.string(),
  v.regex(/^\d{2}:\d{2}$/, "Time must be HH:MM format")
);

const periodConfigColumnRefinements = {
  id: () => periodConfigIdSchema,
  academicYearId: () => academicYearIdSchema,
  periodNumber: () => v.pipe(v.number(), v.minValue(1), v.maxValue(8)),
  startTime: () => periodTimeSchema,
  endTime: () => periodTimeSchema,
};

export const periodConfigSelectSchema = createSelectSchema(periodConfig, periodConfigColumnRefinements);
export const periodConfigInsertSchema = createInsertSchema(periodConfig, periodConfigColumnRefinements);
// Note: no `periodConfigUpdateSchema` — periods are immutable
```

---

### 2. `class_period_assignment`
Maps a class + day-of-week + period to a subject + teacher for a given academic year. This is the core timetable assignment table.

**Columns:**
- `id` (text, PK): Unique identifier
- `academicYearId` (text, FK → `academic_year.id`, NOT NULL): Cascading delete
- `classId` (text, FK → `class_.id`, NOT NULL): Cascading delete
- `dayOfWeek` (integer, NOT NULL): 1–5 (Monday–Friday)
- `periodNumber` (integer, NOT NULL): 1–8
- `subjectKey` (text, NOT NULL): Must match a key from `ALL_KNOWN_SUBJECT_KEYS` (validated at API layer)
- `staffId` (text, FK → `staff.id`, NOT NULL): The teacher assigned to this slot; cascading delete
- `createdAt` (timestamp): Metadata
- `updatedAt` (timestamp): Metadata

**Indexes:**
- `(academicYearId, classId, dayOfWeek, periodNumber)` UNIQUE — prevent duplicate slots for same class
- `(academicYearId, staffId, dayOfWeek, periodNumber)` UNIQUE — prevent teacher double-booking
- `(academicYearId, classId)` — quick lookup class's full weekly schedule
- `(academicYearId, staffId)` — quick lookup teacher's full weekly schedule
- `subjectKey` — enable subject-scoped filtering

**Constraints:**
- Foreign keys: `classId` must exist and be valid for the `academicYearId` (verified at API level)
- Foreign keys: `staffId` must be a valid teacher (exists and has "teacher" role or similar)
- Business rule: `dayOfWeek` ∈ [1,5] (Monday–Friday only; no weekends)
- Business rule: `periodNumber` ∈ [1,8] (valid periods for the school day)
- The two UNIQUE constraints prevent:
  1. A class from having two different subjects/teachers in the same slot
  2. A teacher from being assigned to two different classes in the same slot

**Valibot Schema Pattern:**
```typescript
export type ClassPeriodAssignmentId = Brand<string, "ClassPeriodAssignmentId">;
export const classPeriodAssignmentIdSchema = v.pipe(
  v.string(),
  brand<string, "ClassPeriodAssignmentId">()
);

const dayOfWeekSchema = v.pipe(
  v.number(),
  v.minValue(1),
  v.maxValue(5),
  v.check((v) => Number.isInteger(v), "Must be an integer")
);
const periodNumberSchema = v.pipe(
  v.number(),
  v.minValue(1),
  v.maxValue(8),
  v.check((v) => Number.isInteger(v), "Must be an integer")
);

const classPeriodsColumnRefinements = {
  id: () => classPeriodAssignmentIdSchema,
  academicYearId: () => academicYearIdSchema,
  classId: () => classIdSchema,
  dayOfWeek: () => dayOfWeekSchema,
  periodNumber: () => periodNumberSchema,
  subjectKey: () => subjectKeySchema,
  staffId: () => staffIdSchema,
};

export const classPeriodAssignmentSelectSchema = createSelectSchema(
  classPeriodAssignment,
  classPeriodsColumnRefinements
);
export const classPeriodAssignmentInsertSchema = createInsertSchema(
  classPeriodAssignment,
  classPeriodsColumnRefinements
);
export const classPeriodAssignmentUpdateSchema = createUpdateSchema(
  classPeriodAssignment,
  classPeriodsColumnRefinements
);
```

---

### 3. `teacher_period_assignment` (Optional — Redundant Cache)
**Decision:** Do NOT create a separate table. Instead, compute teacher timetables via queries joining `classPeriodsAssignment` with `staff`. A teacher's weekly timetable is simply all rows where `staffId` matches. The database constraints already prevent double-booking at the DB level.

---

## Permissions

The existing `assignment: ["create", "read", "update", "delete"]` resource in `packages/auth/src/permissions.ts` already covers period/timetable assignments. No new permission resource needed.

---

## API Procedures (oRPC Routers)

The `packages/api/src/routers/staff/` folder will gain new period-related procedures (list here for completeness; implement during build phase):

1. **`createPeriodConfig`** — Admin-only: initialize period structure for a new academic year
2. **`listPeriodConfig`** — Read: fetch school day period times for a given year
3. **`assignClassPeriod`** — Create a `class_period_assignment` row; validate no double-booking
4. **`updateClassPeriodAssignment`** — Update the subject/teacher for a slot (if constraints still satisfied)
5. **`deleteClassPeriodAssignment`** — Remove an assignment
6. **`listClassTimetable`** — Read: fetch full week (Mon–Fri × 8 periods) for a given class+year
7. **`listTeacherTimetable`** — Read: fetch full week for a given teacher+year
8. **`listUnassignedClassSlots`** — Read: list class period slots with no teacher yet
9. **`checkConflict`** — Read: before assigning, check if teacher/class is already booked
10. **`exportTeachersTimetable`** — Generate Excel with all teachers' timetables for a year
11. **`exportClassesTimetable`** — Generate Excel with all classes' timetables for a year
12. **`exportTeacherTimetablePDF`** — Generate PDF for one teacher's full timetable

---

## Historical Data & Year-Scoping

Because `academicYearId` is a foreign key on every assignment, changing years automatically isolates timetables. To view a past year's timetable, the UI queries with that year's ID. No archiving needed.

---

## Design Rationale

1. **Two-column day+period indexing:** Makes weekly-view queries efficient (get all slots Mon–Fri × 8 periods for a class in one or two queries).

2. **Unique constraints at the DB level:** Prevents data corruption if the API layer has a bug. Double-booking errors fail hard, not silently.

3. **No separate `teacher_period_assignment` table:** Teacher timetables are computed on-read via joins. Fewer moving parts, single source of truth.

4. **Immutable `period_config`:** The school day structure is a policy decision. Once set for a year, it doesn't change mid-year (if it does, create a new year). Avoids cascading re-bookings.

5. **Valibot (not Zod):** Consistent with the entire repo; `drizzle-valibot` generates schemas automatically.

6. **Brand types for IDs:** Consistent with existing `StaffId`, `ClassId`, etc.

---

## Migration Notes

When implementing, you'll need to:
1. Write a Drizzle migration creating `period_config` and `class_period_assignment` tables
2. Add the new types and schemas to `packages/db/src/schema/periods.ts` (new file)
3. Export them from `packages/db/src/schema/index.ts`
4. Add the new router procedures to `packages/api/src/routers/staff/periods/` (new subfolder)
5. Compose them into `staffRouter` in `packages/api/src/routers/staff/index.ts`
6. Frontend: Build routes, components, and export logic as per `UI.md` files
