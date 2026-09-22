import { applyLeave } from "./apply-leave";
import { cancelLeave } from "./cancel-leave";
import {
  getMyLeaveBalance,
  listLeaveEntitlements,
  seedLeaveEntitlements,
  upsertLeaveEntitlement,
} from "./entitlements";
import { finalizeLeave, recommendLeave } from "./leadership-review";
import { listLeaveRequests } from "./list-leave-requests";
import { listMyLeaves } from "./list-my-leaves";
import { reviewLeave } from "./review-leave";

/**
 * Leave management: staff apply for leave; the Deputy Principal
 * recommends and the Principal finalises (two-step chain). Quotas are
 * dynamic per-year rows in `leave_entitlement`.
 */
export const leavesRouter = {
  // Staff self-service
  applyLeave,
  listMyLeaves,
  cancelLeave,
  getMyLeaveBalance,

  // Leadership review chain
  recommendLeave,
  finalizeLeave,

  // Dynamic quotas
  listLeaveEntitlements,
  upsertLeaveEntitlement,
  seedLeaveEntitlements,

  // Admin queue (full list, single-step legacy review kept for admins
  // without a leadership position row)
  listLeaveRequests,
  reviewLeave,
};
