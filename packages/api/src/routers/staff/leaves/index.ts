import { applyLeave } from "./apply-leave";
import { cancelLeave } from "./cancel-leave";
import { listLeaveRequests } from "./list-leave-requests";
import { listMyLeaves } from "./list-my-leaves";
import { reviewLeave } from "./review-leave";

/**
 * Leave management: teachers apply for leave from their portal; admins
 * review (approve/reject) the requests from the staff dashboard.
 */
export const leavesRouter = {
  // Teacher self-service
  applyLeave,
  listMyLeaves,
  cancelLeave,

  // Admin review
  listLeaveRequests,
  reviewLeave,
};
