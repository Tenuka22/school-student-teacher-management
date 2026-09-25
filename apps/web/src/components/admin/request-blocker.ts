import { EMPLOYMENT_STATUSES } from "@school-student-teacher-management/db/constants/teachers";
import type { EmploymentStatus } from "@school-student-teacher-management/db/constants/teachers";

import type { TeacherRequest } from "./approve-teacher-dialog";

/**
 * A stored employment status as a word. A status this build does not know is
 * shown as it is stored rather than as a blank, so a future value is visible
 * instead of silently missing.
 */
export const employmentStatusLabel = (status: string): string =>
  EMPLOYMENT_STATUSES[status as EmploymentStatus]?.label ?? status;

/**
 * Why an account cannot be approved yet, or `null` when it can.
 *
 * The queue used to show a "REVIEW & APPROVE" button beside every verified
 * account, including ones the server always refused — a plain `user` with no
 * staff record, an office-staff record, or a record marked suspended. The
 * refusal was real, but it only surfaced after the click. The same rules the
 * server applies are stated here, so the list says which accounts are ready and
 * which are not, and why.
 */
export const describeBlocker = (request: TeacherRequest): string | null => {
  if (!request.emailVerified) {
    return "Email address not confirmed yet.";
  }

  const record = request.staffRecord;

  if (!record) {
    return "No staff record is linked to this account. Add them under Teachers, then approve here.";
  }

  if (record.staffCategory !== "teacher") {
    return "This is an office staff record. Office staff accounts are issued by the administrator, not approved here.";
  }

  if (record.employmentStatus && record.employmentStatus !== "active") {
    const label = employmentStatusLabel(record.employmentStatus);

    return `The staff record is marked "${label}". Correct it under Teachers before approving.`;
  }

  return null;
};
