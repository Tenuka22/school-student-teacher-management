# Period/Timetable Schema Design Plan

## Overview
This document specifies the database schema design for the period/timetable management system. The system manages:
1. **Period Configuration**: Daily school schedule (8 periods, 7:40 AM–1:30 PM with breaks).
2. **Class Period Assignments**: Mapping class × day × period → teacher + subject.
3. **Conflict Prevention**: Unique constraints to prevent double-booking.

---

## Tables

### `period_config`
Stores the configurable daily schedule (period times). One record per period per academic year.

**Columns:**
- `id: UUID` (PK) — Unique identifier
- `academicYearId: UUID` (FK → `academicYear.id`) — Academic year this period belongs to
- `periodNumber: integer` (1–8) — Period sequence number
- `startTime: string` (HH:MM, 24-hour) — Period start time (e.g., "07:40")
- `endTime: string` (HH:MM, 24-hour) — Period end time (e.g., "08:20")
- `type: string` ("PERIOD" | "BREAK") — Whether this is a teaching period or tea/lunch break
- `createdAt: timestamp` — Record creation timestamp
- `updatedAt: timestamp` — Last update timestamp

**Unique Constraints:**
- `UNIQUE(academicYearId, periodNumber)` — One config per year+period

**Indexes:**
- `academicYearId` — For fetching all periods in a year

**Notes:**
- `type = "BREAK"` disables subject/teacher assignment in the UI; these slots are supervisory only.
- Times are immutable once created; if changes needed, create new academic year.
- Total duration across 8 periods + breaks should be ~5:40–6:00 (no DB validation, UI warning only).

---

### `class_period_assignment`
Core timetable table. Maps class + day + period → teacher + subject per academic year.

**Columns:**
- `id: UUID` (PK) — Unique identifier
- `academicYearId: UUID` (FK → `academicYear.id`) — Academic year scope
- `classId: UUID` (FK → `class_.id`) — Class being assigned
- `dayOfWeek: integer` (1–5) — Monday=1, Tuesday=2, ..., Friday=5
- `periodNumber: integer` (1–8) — Period number (must exist in `period_config` for same academicYear)
- `subjectKey: string` — Subject code (from `packages/db/src/constants/structureVersions/` subjectKeys); validates against curriculum structure for that grade/year
- `staffId: UUID` (FK → `staff.id`) — Teacher assigned to teach this slot
- `status: string` ("CONFIRMED" | "TENTATIVE") — Assignment finality (confirmed = locked, tentative = draft)
- `createdAt: timestamp` — Record creation timestamp
- `updatedAt: timestamp` — Last update timestamp

**Unique Constraints:**
- `UNIQUE(academicYearId, classId, dayOfWeek, periodNumber)` — **No duplicate class slots**: A class cannot have two subjects/teachers in the same day+period
- `UNIQUE(academicYearId, staffId, dayOfWeek, periodNumber)` — **No teacher double-booking**: A teacher cannot be assigned to two classes in the same day+period

**Indexes:**
- Composite index on `(academicYearId, classId)` — Fast lookup of class's full weekly schedule
- Composite index on `(academicYearId, staffId)` — Fast lookup of teacher's full weekly schedule
- Index on `academicYearId` — For bulk queries (all assignments for a year)

**Foreign Key Constraints:**
- `FK academicYearId` → `academicYear.id` ON DELETE CASCADE
- `FK classId` → `class_.id` ON DELETE CASCADE (if class deleted, assignments cleared)
- `FK staffId` → `staff.id` ON DELETE SET NULL (if teacher deleted, assignment nullified; UI shows warning)

**Notes:**
- `status` field supports tentative assignments during planning (not finalized until admin confirms).
- Cascading deletes on year change; if a new year is created, old year's assignments remain for historical queries.
- `subjectKey` must be validated at API layer (not in DB) against the curriculum structure version for that grade+year.
- Staff must have `subjectAssignment` record for that subject+year (enforced at API layer).

---

## Valibot Schemas

These schemas live in `packages/db/src/schema/periods.ts` and follow the naming/branding conventions of existing schemas.

### Branded Types
```typescript
export type PeriodConfigId = Brand<string, "PeriodConfigId">;
export type ClassPeriodAssignmentId = Brand<string, "ClassPeriodAssignmentId">;
```

### Base Schemas
```typescript
// Time validation: HH:MM format, 00:00–23:59
export const timeSchema = v.pipe(
  v.string(),
  v.regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
  v.check(
    (val) => {
      const [h, m] = val.split(":").map(Number);
      return h >= 0 && h <= 23 && m >= 0 && m <= 59;
    },
    "Must be valid 24-hour time"
  )
);

// Period type enum
export const periodTypeSchema = v.picklist(["PERIOD", "BREAK"]);

// Assignment status enum
export const assignmentStatusSchema = v.picklist(["CONFIRMED", "TENTATIVE"]);

// Day of week: 1–5 (Mon–Fri)
export const dayOfWeekSchema = v.pipe(
  v.number(),
  v.minValue(1),
  v.maxValue(5)
);

// Period number: 1–8
export const periodNumberSchema = v.pipe(
  v.number(),
  v.minValue(1),
  v.maxValue(8)
);
```

### ORM-Generated Schemas
```typescript
// Auto-generated via createSelectSchema (read from DB)
export const periodConfigSelectSchema = createSelectSchema(periodConfigTable);

// Auto-generated via createInsertSchema (for INSERT mutations)
export const periodConfigInsertSchema = createInsertSchema(periodConfigTable).pick({
  academicYearId: true,
  periodNumber: true,
  startTime: true,
  endTime: true,
  type: true,
});

// Auto-generated via createUpdateSchema (for UPDATE mutations)
export const periodConfigUpdateSchema = createUpdateSchema(periodConfigTable).pick({
  startTime: true,
  endTime: true,
  // type is immutable once created
});

// Auto-generated: class_period_assignment schemas
export const classPeriodAssignmentSelectSchema = createSelectSchema(classPeriodAssignmentTable);

export const classPeriodAssignmentInsertSchema = createInsertSchema(classPeriodAssignmentTable).pick({
  academicYearId: true,
  classId: true,
  dayOfWeek: true,
  periodNumber: true,
  subjectKey: true,
  staffId: true,
  status: true,
});

export const classPeriodAssignmentUpdateSchema = createUpdateSchema(classPeriodAssignmentTable).pick({
  subjectKey: true,
  staffId: true,
  status: true,
});
```

### Custom Validation Schemas
```typescript
// For conflict checking (not a table schema, used in oRPC)
export const periodConflictCheckSchema = v.object({
  academicYearId: academicYearIdSchema,
  staffId: staffIdSchema,
  dayOfWeek: dayOfWeekSchema,
  periodNumber: periodNumberSchema,
  excludeClassId: v.optional(classIdSchema), // If updating, exclude current class
});

// For bulk import (CSV/Excel upload)
export const periodImportRowSchema = v.object({
  day: v.picklist(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]),
  period: periodNumberSchema,
  class: v.string(), // Class name (will be resolved to classId)
  subject: v.string(), // Subject key
  teacher: v.string(), // Teacher name (will be resolved to staffId)
});
```

---

## API Procedures (oRPC)

These are implemented in `packages/api/src/routers/staff/periods/` (folder per file):

### Configuration Management

**`create-period-config.ts`**
- Input: `periodConfigInsertSchema`
- Output: `periodConfigSelectSchema`
- Error: If period already exists for year+number, or if times overlap
- Access: `assignment: "create"`

**`list-period-config.ts`**
- Input: `{ academicYearId: AcademicYearId }`
- Output: `periodConfigSelectSchema[]` (sorted by periodNumber)
- Access: `assignment: "read"`

**`update-period-config.ts`** (optional, for time adjustments)
- Input: `{ periodConfigId: PeriodConfigId, ...periodConfigUpdateSchema }`
- Output: `periodConfigSelectSchema`
- Error: Cannot update periodNumber or type; cannot create overlaps
- Access: `assignment: "update"`

### Timetable Assignment

**`assign-class-period.ts`**
- Input: `classPeriodAssignmentInsertSchema`
- Output: `classPeriodAssignmentSelectSchema`
- Validation:
  - Check conflict with `check-conflict` before inserting
  - Verify teacher has `subjectAssignment` for that subject+year
  - Verify subject is valid for that class's grade (from curriculum structure)
- Error: Conflict detected, invalid subject, teacher not assigned to subject
- Access: `assignment: "create"`

**`list-class-timetable.ts`**
- Input: `{ classId: ClassId, academicYearId: AcademicYearId }`
- Output: `classPeriodAssignmentSelectSchema[]` (ordered by dayOfWeek, periodNumber)
- Format: Provides data for 5×8 grid
- Access: `assignment: "read"`

**`list-teacher-timetable.ts`**
- Input: `{ staffId: StaffId, academicYearId: AcademicYearId }`
- Output: `classPeriodAssignmentSelectSchema[]` with classId/className included
- Format: Teacher's full weekly schedule across all assigned classes
- Access: `assignment: "read"`

**`list-unassigned-slots.ts`**
- Input: `{ academicYearId: AcademicYearId }`
- Output: `{ classId, dayOfWeek, periodNumber }[]` (slots with no subject assigned)
- Excludes break periods automatically
- Access: `assignment: "read"`

**`check-conflict.ts`** (utility procedure)
- Input: `periodConflictCheckSchema`
- Output: `{ hasConflict: boolean, conflictingAssignment?: classPeriodAssignmentSelectSchema }`
- Used internally and in UI for live validation
- Access: `assignment: "read"`

**`update-class-period.ts`**
- Input: `{ classPeriodAssignmentId, ...classPeriodAssignmentUpdateSchema }`
- Output: `classPeriodAssignmentSelectSchema`
- Checks conflict before updating
- Access: `assignment: "update"`

**`delete-class-period.ts`**
- Input: `{ classPeriodAssignmentId: ClassPeriodAssignmentId }`
- Output: `{ success: boolean }`
- Soft-delete or hard delete (TBD; recommend hard delete for periods)
- Access: `assignment: "delete"`

**`import-timetable.ts`** (bulk import)
- Input: `{ academicYearId, rows: periodImportRowSchema[] }`
- Output: `{ imported: number, errors: { row: number, message: string }[] }`
- Parses CSV/Excel, validates each row, inserts non-conflicting assignments
- Transaction: All-or-nothing import (optional; can be partial with error report)
- Access: `assignment: "create"`

**`export-timetables.ts`** (bulk export)
- Input: `{ academicYearId, format: "EXCEL" | "PDF", scope: "ALL_CLASSES" | "CLASS" | "TEACHER", classId?: ClassId, staffId?: StaffId }`
- Output: Streams file (binary)
- Formats:
  - **EXCEL**: One sheet per class/teacher; columns: Day, Period, Time, Subject, Teacher, Status
  - **PDF**: Printable timetables, one page per class/teacher, with school name, year, date
- Access: `assignment: "read"`

---

## Constraints & Validation (Summary)

| Constraint | Level | Enforced | Notes |
|------------|-------|----------|-------|
| Unique (academicYearId, classId, dayOfWeek, periodNumber) | DB | YES | Prevents duplicate class slots |
| Unique (academicYearId, staffId, dayOfWeek, periodNumber) | DB | YES | Prevents teacher double-booking |
| Unique (academicYearId, periodNumber) in period_config | DB | YES | One config per period per year |
| startTime < endTime | API | YES | Validated in procedure |
| No period overlaps | API | YES | Checked during period creation |
| Teacher has subjectAssignment | API | YES | Checked before assignment creation |
| Subject valid for class grade | API | YES | Validated against curriculum structure |
| Day 1–5, Period 1–8 | DB/Schema | YES | Enums in valibot, check constraints in DB |
| Period exists for year | API | YES | FK constraint + check in procedure |

---

## Indexed Queries (Performance)

All queries are optimized for common access patterns:

| Query Pattern | Index | Complexity |
|---------------|-------|------------|
| Get class's weekly timetable | (academicYearId, classId) | O(40) constant |
| Get teacher's weekly timetable | (academicYearId, staffId) | O(40) constant (same teacher may teach 2–3 classes) |
| Check conflict for (teacher, day, period) | (academicYearId, staffId) + (dayOfWeek, periodNumber) | O(1) lookup |
| Check conflict for (class, day, period) | (academicYearId, classId) + (dayOfWeek, periodNumber) | O(1) lookup |
| Get all unassigned slots | Scan + filter by `staffId IS NULL` | O(N) where N = total slots |
| Get all assignments for year | (academicYearId) | O(N) full scan |

For large schools (1000+ classes), consider additional indexes on `(academicYearId, staffId, dayOfWeek, periodNumber)` if conflict checks slow down.

---

## Historical Data (Time-Based Queries)

Past years' timetables are queried by:
1. Selecting a different `academicYearId` (via dropdown in UI).
2. Running the same `list-class-timetable` / `list-teacher-timetable` queries.
3. Results automatically filtered by year; no need for archiving or soft-deletes.

**Immutability:** Once an academic year is finalized (via `academicYear.isCurrent = false`), its assignments become read-only (UI enforces this, not DB constraints).

---

## Migration & Rollout

1. **Create tables:** Run Drizzle migration `01_create_periods_schema.sql` (auto-generated by Drizzle).
2. **Seed initial data:** For current academic year, create `period_config` records (8 periods).
3. **Run procedures:** Test procedures with sample data.
4. **Deploy:** Roll out to production with new routes.

---

## Notes & Decisions

- **No soft-deletes:** Period assignments are hard-deleted; historical view uses past `academicYearId`.
- **No archival table:** Assignments are per-year; switching years provides "historical" view automatically.
- **Breaks are explicit:** `type = "BREAK"` disables subject assignment in UI; DB doesn't enforce (UI responsibility).
- **Time format:** HH:MM strings stored as-is (no time zones; school-local time assumed).
- **Conflict resolution:** Left to UI; procedures return conflict info, UI shows options (swap, move, etc.).
- **Bulk operations:** Import/Export as separate procedures; streaming for large exports.

---

## Future Extensions

- **Recurring patterns:** Copy timetable across similar classes (e.g., all 10A+ classes).
- **Substitute teachers:** Temporary period-level staff reassignment (create new "substitute" staffId).
- **Teacher preferences:** Weight subjects/slots by teacher availability (prep for AI scheduling).
- **Capacity planning:** Warn if class exceeds student:teacher ratio during certain periods.
- **Mobile sync:** REST/GraphQL endpoint for offline timetable access (separate from oRPC).
