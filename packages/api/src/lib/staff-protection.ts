import {
  isPrivilegedRole,
  isSeededAccount,
  isSeededStaffId,
} from "@school-student-teacher-management/auth/roles";
import type { Database } from "@school-student-teacher-management/db";
import { user } from "@school-student-teacher-management/db/schema/auth";
import { eq } from "drizzle-orm";

/** Anything that can run a query: the pool or an open transaction. */
type Executor = Pick<Database, "select">;

export interface StaffProtection {
  /** A seeded seat's own `staff` row (`seed-staff-*`). */
  isSeededSeat: boolean;
  /** Linked to a seeded login or to a login holding a privileged role. */
  holdsAdministrativeLogin: boolean;
}

/**
 * Whether a staff record belongs to an account only `admin` may administer.
 *
 * The same target rule `adminEndpointGuard` applies to better-auth's admin
 * plugin, applied to the staff procedures that reach the login through the
 * staff row: editing a staff record rewrites the linked username when the NIC
 * changes, so "may edit this staff record" is "may change this login".
 */
export const staffProtectionOf = async (
  db: Executor,
  record: { id: string; userId: string | null }
): Promise<StaffProtection> => {
  const isSeededSeat = isSeededStaffId(record.id);
  if (!record.userId) {
    return { isSeededSeat, holdsAdministrativeLogin: isSeededSeat };
  }
  const [login] = await db
    .select({ role: user.role, username: user.username })
    .from(user)
    .where(eq(user.id, record.userId))
    .limit(1);
  return {
    isSeededSeat,
    holdsAdministrativeLogin:
      isSeededSeat ||
      isPrivilegedRole(login?.role) ||
      isSeededAccount(login?.username),
  };
};
