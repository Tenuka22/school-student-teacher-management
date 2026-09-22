import { user as userTable } from "@school-student-teacher-management/db/schema/auth";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";

import { teacherProcedure } from "../../index";

/**
 * The signed-in teacher's own staff profile — the backbone of the
 * teacher portal (profile card, leave history, "my" pages). Resolved
 * strictly from the session user id; an account without a linked
 * staff row reports that fact so the UI can show a friendly notice.
 */
export const getMyStaff = teacherProcedure.handler(async ({ context }) => {
  const [row] = await context.db
    .select({
      id: staff.id,
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      nic: staff.nic,
      gender: staff.gender,
      birthDate: staff.birthDate,
      appointmentType: staff.appointmentType,
      employmentStatus: staff.employmentStatus,
      teacherServiceNo: staff.teacherServiceNo,
      portraitFileId: staff.portraitFileId,
    })
    .from(staff)
    .where(eq(staff.userId, context.session.user.id))
    .limit(1);

  if (!row) {
    return { profile: null, username: context.session.user.username ?? null };
  }

  // Badge number doubles as the login username; fall back to the
  // user row's stored username for accounts created before linking.
  const [account] = await context.db
    .select({ username: userTable.username })
    .from(userTable)
    .where(eq(userTable.id, context.session.user.id))
    .limit(1);

  return {
    profile: {
      ...row,
    },
    username: row.teacherServiceNo
      ? row.teacherServiceNo.toLowerCase()
      : (account?.username ?? null),
  };
});
