import { ORPCError } from "@orpc/server";
import { leadershipRoleForPosition } from "@school-student-teacher-management/auth";

/**
 * Which positions a `positionManagerProcedure` caller may hand out or take
 * away.
 *
 * A position that implies a leadership role (`principal`, `vicePrincipal`,
 * `assistantPrincipal`, per `leadershipRoleForPosition` — the same mapping
 * `reconcilePositionDerivedRoles` writes roles from) promotes the holder
 * into `ADMIN_ROLES`: the leadership workspace, every `adminProcedure`, and
 * the permission bypass in `requirePermission`. That is more authority than
 * the Academic Administrator holds, and since the academic desk also creates
 * staff and receives their initial password, letting it appoint a Deputy was
 * a working escalation (Z2): create a staff member, appoint them Deputy, sign
 * in as them. So the academic desk manages the teaching and sectional
 * positions only; leadership appointments are the Administrator's or the
 * Principal's.
 */
export const assertMayManagePosition = (
  callerRole: string | null | undefined,
  position: string,
  verb: "assign" | "remove"
): void => {
  const isLeadershipPosition = leadershipRoleForPosition(position) !== null;
  if (
    isLeadershipPosition &&
    callerRole !== "admin" &&
    callerRole !== "principal"
  ) {
    throw new ORPCError("FORBIDDEN", {
      message: `Only the Administrator or Principal may ${verb} a leadership position.`,
    });
  }
};
