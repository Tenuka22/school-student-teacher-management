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
  inventoryBorrow,
  inventoryCustodyHistory,
  inventoryDisposalStatusHistory,
  inventoryItem,
} from "@school-student-teacher-management/db/schema/inventory";
import { leaveRequest } from "@school-student-teacher-management/db/schema/leaves";
import { subjectMark } from "@school-student-teacher-management/db/schema/marking";
import { classPeriodAssignment } from "@school-student-teacher-management/db/schema/periods";
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
import { eq, or } from "drizzle-orm";
import * as v from "valibot";

import { requireStaffPermission } from "../../index";

export const deleteStaff = requireStaffPermission("delete")
  .input(v.object({ id: staffIdSchema }))
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(staff)
      .where(eq(staff.id, input.id));

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Staff member not found" });
    }

    const historyChecks = await Promise.all([
      context.db
        .select({ id: staffPosition.id })
        .from(staffPosition)
        .where(eq(staffPosition.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: class_.id })
        .from(class_)
        .where(
          or(
            eq(class_.homeroomTeacherId, input.id),
            eq(class_.subHomeroomTeacherId, input.id)
          )
        )
        .limit(1),
      context.db
        .select({ id: classTeacherAssignmentHistory.id })
        .from(classTeacherAssignmentHistory)
        .where(
          or(
            eq(classTeacherAssignmentHistory.previousTeacherId, input.id),
            eq(classTeacherAssignmentHistory.newTeacherId, input.id)
          )
        )
        .limit(1),
      context.db
        .select({ id: leaveRequest.id })
        .from(leaveRequest)
        .where(eq(leaveRequest.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: teacherAttendance.id })
        .from(teacherAttendance)
        .where(eq(teacherAttendance.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: teacherPeriodAbsence.id })
        .from(teacherPeriodAbsence)
        .where(eq(teacherPeriodAbsence.substituteStaffId, input.id))
        .limit(1),
      context.db
        .select({ id: shortLeaveUsage.id })
        .from(shortLeaveUsage)
        .where(eq(shortLeaveUsage.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: classPeriodAssignment.id })
        .from(classPeriodAssignment)
        .where(eq(classPeriodAssignment.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: teacherSubjectAssignment.id })
        .from(teacherSubjectAssignment)
        .where(eq(teacherSubjectAssignment.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: teacherQualification.id })
        .from(teacherQualification)
        .where(eq(teacherQualification.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: employmentVerification.id })
        .from(employmentVerification)
        .where(eq(employmentVerification.staffId, input.id))
        .limit(1),
      context.db
        .select({ id: passwordRotationHistory.id })
        .from(passwordRotationHistory)
        .where(eq(passwordRotationHistory.staffId, input.id))
        .limit(1),
      context.db
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
      context.db
        .select({ id: inventoryItem.id })
        .from(inventoryItem)
        .where(
          or(
            eq(inventoryItem.managerStaffId, input.id),
            eq(inventoryItem.custodianStaffId, input.id)
          )
        )
        .limit(1),
      context.db
        .select({ id: inventoryCustodyHistory.id })
        .from(inventoryCustodyHistory)
        .where(
          or(
            eq(inventoryCustodyHistory.previousCustodianStaffId, input.id),
            eq(inventoryCustodyHistory.newCustodianStaffId, input.id),
            eq(inventoryCustodyHistory.previousManagerStaffId, input.id),
            eq(inventoryCustodyHistory.newManagerStaffId, input.id),
            eq(inventoryCustodyHistory.changedByStaffId, input.id)
          )
        )
        .limit(1),
      context.db
        .select({ id: inventoryBorrow.id })
        .from(inventoryBorrow)
        .where(eq(inventoryBorrow.borrowerStaffId, input.id))
        .limit(1),
      context.db
        .select({ id: inventoryDisposalStatusHistory.id })
        .from(inventoryDisposalStatusHistory)
        .where(eq(inventoryDisposalStatusHistory.changedByStaffId, input.id))
        .limit(1),
    ]);

    if (historyChecks.some((rows) => rows.length > 0)) {
      throw new ORPCError("CONFLICT", {
        message:
          "Staff member has historical records, current assignments or inventory custody and cannot be deleted; transfer inventory custody and management to another teacher, or set the employment status to terminated instead",
      });
    }

    await context.db.transaction(async (tx) => {
      await tx.delete(staff).where(eq(staff.id, input.id));

      if (existing.userId) {
        await tx.delete(user).where(eq(user.id, existing.userId));
      }
    });

    return { success: true };
  });
