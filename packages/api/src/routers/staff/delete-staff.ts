import { ORPCError } from "@orpc/server";
import {
  class_,
  classTeacherAssignmentHistory,
} from "@school-student-teacher-management/db/schema/academics";
import {
  teacherAttendance,
  teacherPeriodAbsence,
  shortLeaveUsage,
} from "@school-student-teacher-management/db/schema/attendance";
import { user } from "@school-student-teacher-management/db/schema/auth";
import {
  inventoryCustodyHistory,
  inventoryCustodyNoticeRecipient,
  inventoryDisposalStatusHistory,
  inventoryItem,
} from "@school-student-teacher-management/db/schema/inventory";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import { subjectMark } from "@school-student-teacher-management/db/schema/marking";
import { classPeriodTeacher } from "@school-student-teacher-management/db/schema/periods";
import {
  employmentVerification,
  passwordRotationHistory,
  teacherQualification,
} from "@school-student-teacher-management/db/schema/qualifications";
import {
  staff,
  staffIdSchema,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { teacherSubjectAssignment } from "@school-student-teacher-management/db/schema/teacher-subjects";
import { and, eq, ne, or } from "drizzle-orm";
import * as v from "valibot";

import { requireStaffPermission } from "../../index";
import { staffProtectionOf } from "../../lib/staff-protection";

export const deleteStaff = requireStaffPermission("delete")
  .input(v.object({ id: staffIdSchema }))
  .handler(async ({ input, context }) => {
    /**
     * Probe, then delete, under a row lock in one transaction (F-32, F-35).
     *
     * The probes used to run as nineteen parallel queries on the shared pool
     * (more than its ten connections), and the delete followed with no lock —
     * so a leave request filed between the probe and the delete was removed
     * by `ON DELETE CASCADE` without anyone being told. `FOR UPDATE` on the
     * staff row blocks every insert that references it (they take
     * `FOR KEY SHARE`) until this decision commits.
     */
    await context.db.transaction(async (db) => {
      const [existing] = await db
        .select()
        .from(staff)
        .where(eq(staff.id, input.id))
        .for("update");

      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "Staff member not found" });
      }

      // The seeded seats are configuration, not people: deleting one removes
      // the login it is linked to, including the top administrator's (F-15).
      const protection = await staffProtectionOf(db, existing);
      if (protection.isSeededSeat) {
        throw new ORPCError("FORBIDDEN", {
          message: "The seeded institutional accounts cannot be deleted",
        });
      }
      if (protection.holdsAdministrativeLogin) {
        throw new ORPCError("FORBIDDEN", {
          message:
            "This staff member holds an administrative login; remove the role before deleting the record",
        });
      }

      const probes = [
        // The `teacher` position `createStaff` writes for the current year is
        // bookkeeping, not history: counting it made every staff member created
        // while a year was current undeletable, including one entered by
        // mistake a minute ago (F-15). It cascades with the row. Any other
        // position — a leadership seat, a head of department — still blocks.
        db
          .select({ id: staffPosition.id })
          .from(staffPosition)
          .where(
            and(
              eq(staffPosition.staffId, input.id),
              ne(staffPosition.position, "teacher")
            )
          )
          .limit(1),
        db
          .select({ id: class_.id })
          .from(class_)
          .where(
            or(
              eq(class_.homeroomTeacherId, input.id),
              eq(class_.subHomeroomTeacherId, input.id)
            )
          )
          .limit(1),
        db
          .select({ id: classTeacherAssignmentHistory.id })
          .from(classTeacherAssignmentHistory)
          .where(
            or(
              eq(classTeacherAssignmentHistory.previousTeacherId, input.id),
              eq(classTeacherAssignmentHistory.newTeacherId, input.id)
            )
          )
          .limit(1),
        db
          .select({ id: leaveRequest.id })
          .from(leaveRequest)
          .where(eq(leaveRequest.staffId, input.id))
          .limit(1),
        db
          .select({ id: teacherAttendance.id })
          .from(teacherAttendance)
          .where(eq(teacherAttendance.staffId, input.id))
          .limit(1),
        db
          .select({ id: teacherPeriodAbsence.id })
          .from(teacherPeriodAbsence)
          .where(eq(teacherPeriodAbsence.substituteStaffId, input.id))
          .limit(1),
        db
          .select({ id: shortLeaveUsage.id })
          .from(shortLeaveUsage)
          .where(eq(shortLeaveUsage.staffId, input.id))
          .limit(1),
        db
          .select({ id: classPeriodTeacher.id })
          .from(classPeriodTeacher)
          .where(eq(classPeriodTeacher.staffId, input.id))
          .limit(1),
        db
          .select({ id: teacherSubjectAssignment.id })
          .from(teacherSubjectAssignment)
          .where(eq(teacherSubjectAssignment.staffId, input.id))
          .limit(1),
        db
          .select({ id: teacherQualification.id })
          .from(teacherQualification)
          .where(eq(teacherQualification.staffId, input.id))
          .limit(1),
        db
          .select({ id: employmentVerification.id })
          .from(employmentVerification)
          .where(eq(employmentVerification.staffId, input.id))
          .limit(1),
        db
          .select({ id: passwordRotationHistory.id })
          .from(passwordRotationHistory)
          .where(eq(passwordRotationHistory.staffId, input.id))
          .limit(1),
        db
          .select({ id: subjectMark.id })
          .from(subjectMark)
          .where(eq(subjectMark.enteredByStaffId, input.id))
          .limit(1),
        // ─── Inventory ───────────────────────────────────────────────────────
        // The inventory staff pointers are all `onDelete: "set null"` on purpose,
        // and that is not a reason to let a delete walk over them. `set null` is
        // how the schema permits a person to leave; it is not permission for the
        // delete to destroy the answer to "who had this, and who signed for it".
        // `inventoryCustodyHistory` is the audit trail itself, and a hard delete
        // would leave rows still reading `custody_taken` while naming nobody.
        // So every inventory probe is here to refuse the delete and name the way
        // out: hand the item to another teacher, or terminate the record.
        //
        // Every one of these columns stores a `staff.id` — custody and management
        // identity is the staff record, the same id the rest of the feature
        // writes (see `packages/db/src/schema/inventory.ts`'s `staffRefSchema`
        // doc comment). So every probe below matches against `existing.id`, the
        // staff record being deleted itself, and the whole group runs
        // unconditionally: a staff row always exists at this point (`NOT_FOUND`
        // above), so there is no state in which the probes could be skipped.
        //
        // Deliberately NOT probed: `inventoryTransaction.actorStaffId` and
        // `inventoryAuditLog.actorStaffId`. Those two denormalise the actor's name
        // into the row precisely so the ledger and the change log stay readable
        // after the storekeeper who wrote them has gone, which is why they are
        // `set null` rather than `restrict`. Probing them would make both tables
        // undeletable for every person who has ever touched stock — a school would
        // be unable to remove its first inventory clerk — and the cure for that
        // would be worse than the disease: hard-deleting the audit trail to keep
        // staff deletion working. A missing actor on a ledger row is a fact about
        // a departed person; a missing ledger row is a hole in the school's
        // accounts. Do not "fix" this by adding the two probes back.
        db
          .select({ id: inventoryItem.id })
          .from(inventoryItem)
          .where(
            or(
              eq(inventoryItem.managerStaffId, existing.id),
              eq(inventoryItem.custodianStaffId, existing.id),
              eq(inventoryItem.voidedByStaffId, existing.id)
            )
          )
          .limit(1),
        db
          .select({ id: inventoryCustodyHistory.id })
          .from(inventoryCustodyHistory)
          .where(
            or(
              eq(inventoryCustodyHistory.previousCustodianStaffId, existing.id),
              eq(inventoryCustodyHistory.newCustodianStaffId, existing.id),
              eq(inventoryCustodyHistory.previousManagerStaffId, existing.id),
              eq(inventoryCustodyHistory.newManagerStaffId, existing.id),
              eq(inventoryCustodyHistory.changedByStaffId, existing.id)
            )
          )
          .limit(1),
        // A notice recipient row is evidence that this person was told
        // about a custody change, same reasoning as the history row
        // itself: `set null` on `staffId` is the schema's answer to "a
        // person may leave", not permission for a delete to blank out
        // who was notified.
        db
          .select({ id: inventoryCustodyNoticeRecipient.id })
          .from(inventoryCustodyNoticeRecipient)
          .where(eq(inventoryCustodyNoticeRecipient.staffId, existing.id))
          .limit(1),
        db
          .select({ id: inventoryDisposalStatusHistory.id })
          .from(inventoryDisposalStatusHistory)
          .where(
            eq(inventoryDisposalStatusHistory.changedByStaffId, existing.id)
          )
          .limit(1),
      ];

      // Sequential: one transaction is one connection.
      for (const probe of probes) {
        // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- one transaction is one connection; see above
        const found = await probe;
        if (found.length > 0) {
          throw new ORPCError("CONFLICT", {
            message:
              "Staff member has historical records, current assignments or inventory custody and cannot be deleted; transfer inventory custody and management to another teacher, or set the employment status to terminated instead",
          });
        }
      }

      await db.delete(staff).where(eq(staff.id, input.id));

      if (existing.userId) {
        await db.delete(user).where(eq(user.id, existing.userId));
      }
    });

    return { success: true };
  });
