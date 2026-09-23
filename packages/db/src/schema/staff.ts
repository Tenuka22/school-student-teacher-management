import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-valibot";
import * as v from "valibot";

import {
  BLOOD_GROUPS,
  GENDERS,
  MARITAL_STATUSES,
} from "../constants/demographics";
import type {
  BloodGroup,
  Gender,
  MaritalStatus,
} from "../constants/demographics";
import { SRI_LANKA_DISTRICTS } from "../constants/geography";
import type { SriLankaDistrict } from "../constants/geography";
import { MOTHER_TONGUE_OPTIONS } from "../constants/languages";
import { RELIGION_OPTIONS } from "../constants/religions";
import { APPOINTMENT_TYPES, EMPLOYMENT_STATUSES } from "../constants/teachers";
import type { AppointmentType, EmploymentStatus } from "../constants/teachers";
import { user } from "./auth";
import { brand } from "./brand";
import type { Brand } from "./brand";
import { fileIdSchema, files } from "./files";
import {
  emailSchema,
  isoDateSchema as isoDatePrimitive,
  nicSchema as nicPrimitive,
  optionalNullable,
  postalCodeSchema,
  slPhoneSchema,
} from "./primitives";

export type StaffCategory = (typeof STAFF_CATEGORIES)[number];

export const STAFF_CATEGORIES = ["teacher", "officeStaff"] as const;

export type StaffId = Brand<string, "StaffId">;
export const staffIdSchema = v.pipe(v.string(), brand<string, "StaffId">());

export type AcademicYearId = Brand<string, "AcademicYearId">;
export const academicYearIdSchema = v.pipe(
  v.string(),
  brand<string, "AcademicYearId">()
);

export type StaffPositionId = Brand<string, "StaffPositionId">;
export const staffPositionIdSchema = v.pipe(
  v.string(),
  brand<string, "StaffPositionId">()
);

const phoneSchema = optionalNullable(slPhoneSchema);
const nicSchema = optionalNullable(nicPrimitive);
const isoDateSchema = optionalNullable(isoDatePrimitive);

/** Permanent staff record (not year-dependent). */
export const staff = pgTable(
  "staff",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // Not unique: schools may legitimately reuse a family/shared email across
    // staff, or re-add a former teacher whose email was already recorded on
    // an unrelated record. NIC (below) is the real unique identity.
    email: text("email"),

    // Personal information (optional - teacher can fill or skip)
    nic: text("nic").unique(),
    phone: text("phone"),
    /** ISO date string */
    birthDate: text("birth_date"),
    gender: text("gender").$type<Gender>(),
    religion: text("religion"),
    motherTongue: text("mother_tongue"),
    bloodGroup: text("blood_group").$type<BloodGroup>(),
    maritalStatus: text("marital_status").$type<MaritalStatus>(),
    spouseName: text("spouse_name"),

    // Address (optional)
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    city: text("city"),
    district: text("district").$type<SriLankaDistrict>(),
    gramaNiladhariDivision: text("grama_niladhari_division"),
    postalCode: text("postal_code"),

    // Emergency contact (optional)
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),

    /**
     * Broad category of staff. Teachers and office staff share the same
     * record shape but differ in UI (portal features) and leave defaults.
     */
    staffCategory: text("staff_category")
      .notNull()
      .default("teacher")
      .$type<StaffCategory>(),

    // Employment information (admin verifies)
    appointmentType: text("appointment_type").$type<AppointmentType>(),
    /** ISO date string */
    appointmentDate: text("appointment_date"),
    /**
     * Badge / service number. Internal employment reference only — the
     * login username is the NIC (see `createStaffCredential` in the auth
     * package).
     */
    teacherServiceNo: text("teacher_service_no").unique(),
    employmentStatus: text("employment_status").$type<EmploymentStatus>(),

    /**
     * Login account for this staff member (staff sign in with their NIC
     * as the username). Null for staff without an account.
     */
    userId: text("user_id")
      .unique()
      .references(() => user.id, {
        onDelete: "set null",
      }),

    // Profile
    portraitFileId: text("portrait_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    nationalIdentityCardFileId: text(
      "national_identity_card_file_id"
    ).references(() => files.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("staff_email_idx").on(table.email),
    index("staff_nic_idx").on(table.nic),
    index("staff_appointment_type_idx").on(table.appointmentType),
    index("staff_employment_status_idx").on(table.employmentStatus),
    index("staff_teacher_service_no_idx").on(table.teacherServiceNo),
  ]
);

/** Academic year entity with explicit date range. */
export const academicYear = pgTable("academic_year", {
  id: text("id").primaryKey(),
  year: integer("year").notNull().unique(),
  /** ISO date string — start of academic year (e.g. "2027-01-01") */
  startDate: text("start_date"),
  /** ISO date string — end of academic year (e.g. "2027-12-31") */
  endDate: text("end_date"),
  /**
   * Key of the `StructureVersion` (see `constants/structureVersions`) this
   * academic year's `gradeSubjectConfig` rows were materialized from.
   * Nullable at the DB level only to keep pre-existing rows migratable;
   * required and validated against the code registry at the API layer for
   * every new academic year.
   */
  structureVersionKey: text("structure_version_key"),
  /**
   * Subversion number within the structure version (e.g. 1 = v1.1, 2 = v1.2).
   * Combined with `structureVersionKey`, pins the exact curriculum snapshot
   * that was materialized into `gradeSubjectConfig`.
   */
  structureSubversionKey: integer("structure_subversion_key"),
  isCurrent: boolean("is_current").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Staff role assignment for a given academic year.
 * `position` stores the enum key (e.g., "principal", "sectionalHead").
 * `sectionalScope` stores the enum key for sectional heads (e.g., "grade8_9").
 */
export const staffPosition = pgTable(
  "staff_position",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYear.id, { onDelete: "cascade" }),
    position: text("position").notNull(),
    sectionalScope: text("sectional_scope"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("staff_position_staff_idx").on(table.staffId),
    index("staff_position_year_idx").on(table.academicYearId),
    unique("staff_position_unique").on(
      table.staffId,
      table.academicYearId,
      table.position,
      table.sectionalScope
    ),
  ]
);

const staffColumnRefinements = {
  id: () => staffIdSchema,
  email: () => optionalNullable(emailSchema),
  nic: () => nicSchema,
  phone: () => phoneSchema,
  birthDate: () => isoDateSchema,
  gender: () => v.optional(v.picklist(GENDERS)),
  religion: () => v.optional(v.picklist(RELIGION_OPTIONS)),
  motherTongue: () => v.optional(v.picklist(MOTHER_TONGUE_OPTIONS)),
  bloodGroup: () => v.optional(v.picklist(BLOOD_GROUPS)),
  maritalStatus: () => v.optional(v.picklist(MARITAL_STATUSES)),
  district: () => v.optional(v.picklist(SRI_LANKA_DISTRICTS)),
  postalCode: () => optionalNullable(postalCodeSchema),
  emergencyContactPhone: () => phoneSchema,
  appointmentType: () =>
    v.optional(
      v.picklist(
        Object.keys(APPOINTMENT_TYPES) as [
          AppointmentType,
          ...AppointmentType[],
        ]
      )
    ),
  appointmentDate: () => isoDateSchema,
  employmentStatus: () =>
    v.optional(
      v.picklist(
        Object.keys(EMPLOYMENT_STATUSES) as [
          EmploymentStatus,
          ...EmploymentStatus[],
        ]
      )
    ),
  portraitFileId: () => optionalNullable(fileIdSchema),
  nationalIdentityCardFileId: () => optionalNullable(fileIdSchema),
  staffCategory: () => v.optional(v.picklist(STAFF_CATEGORIES)),
  userId: () => v.optional(v.nullable(v.string())),
};

export const staffSelectSchema = createSelectSchema(
  staff,
  staffColumnRefinements
);
export const staffInsertSchema = createInsertSchema(
  staff,
  staffColumnRefinements
);
export const staffUpdateSchema = createUpdateSchema(
  staff,
  staffColumnRefinements
);

export const academicYearSelectSchema = createSelectSchema(academicYear, {
  id: () => academicYearIdSchema,
  startDate: () => v.optional(v.nullable(isoDatePrimitive)),
  endDate: () => v.optional(v.nullable(isoDatePrimitive)),
  structureVersionKey: () => v.optional(v.nullable(v.string())),
  structureSubversionKey: () => v.optional(v.nullable(v.number())),
});
export const academicYearInsertSchema = createInsertSchema(academicYear, {
  year: () =>
    v.pipe(v.number(), v.integer(), v.minValue(2000), v.maxValue(2100)),
  startDate: () => v.optional(isoDatePrimitive),
  endDate: () => v.optional(isoDatePrimitive),
  structureVersionKey: () => v.pipe(v.string(), v.minLength(1)),
  structureSubversionKey: () =>
    v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});
export const academicYearUpdateSchema = createUpdateSchema(academicYear, {
  id: () => academicYearIdSchema,
  startDate: () => v.optional(v.nullable(isoDatePrimitive)),
  endDate: () => v.optional(v.nullable(isoDatePrimitive)),
  structureVersionKey: () => v.optional(v.nullable(v.string())),
  structureSubversionKey: () => v.optional(v.nullable(v.number())),
});

const staffPositionColumnRefinements = {
  id: () => staffPositionIdSchema,
  staffId: () => staffIdSchema,
  academicYearId: () => academicYearIdSchema,
};

export const staffPositionSelectSchema = createSelectSchema(
  staffPosition,
  staffPositionColumnRefinements
);
export const staffPositionInsertSchema = createInsertSchema(
  staffPosition,
  staffPositionColumnRefinements
);
export const staffPositionUpdateSchema = createUpdateSchema(
  staffPosition,
  staffPositionColumnRefinements
);
