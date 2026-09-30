/**
 * A borrower's punctuality score — one number, computed from their loan
 * history, never stored.
 *
 * The rule is deliberately simple, the same reasoning as `overdueDaysExpression`
 * in `list-borrows.ts`: everyone starts at 100, and **each whole day a loan
 * spent late costs 10 points** — a loan returned one day after its due date
 * costs 10, three days late costs 30, and a loan still open and three days
 * overdue right now also costs 30, recomputed fresh every time the score is
 * asked for rather than the moment the loan closes. The floor is 0: nothing
 * about a person's history can push the number negative, because a negative
 * "score" reads as a debt rather than a rating and this is meant to be read at
 * a glance on a home page, not audited like a ledger.
 *
 * **Every day late costs the same 10 points, whichever loan it belongs to** —
 * a five-day-late loan and five one-day-late loans both cost 50. This is a
 * choice, not an oversight: counting *loans* returned late rather than *days*
 * late would let somebody who is one day late fifty times in a row keep a
 * perfect-looking record, and the number this screen shows is meant to answer
 * "how reliably does equipment come back on time", not "how many separate
 * incidents were there".
 *
 * **Computed, not stored,** for the same reason `availableQty` is: a stored
 * score can drift from the loans it is supposed to summarise the moment a loan
 * record is corrected, and a school's trust in the number depends on it always
 * agreeing with the loans a clerk can actually go and look at.
 *
 * Callers: `staffId` defaults to the caller's own staff row (the home-page case).
 * An explicit `staffId` is how the same number is shown on somebody else's page
 * — an administrator or leadership reading a colleague's profile — and it is
 * not narrowed further, because a punctuality score is the same kind of fact
 * as a name: something everyone in the school can already see about a
 * colleague from the loans list itself, not private information a permission
 * needs to hide.
 *
 * **The input and the output are `staffId`, not `userId`,** and the rename is
 * not cosmetic: every loan column this file filters on is
 * `inventory_borrow.borrower_staff_id` / `borrowed_by_staff_id` and the default
 * is `actor.staffId` from `getInventoryActor`. A procedure that called a staff
 * id a `userId` was a name from the account layer that survived the rest of the
 * inventory router's move onto `staff`, and it is the kind of wrong that hides
 * a bug: `user.id` and `staff.id` are different keys, so a caller passing a
 * real `userId` here would be silently compared against staff ids rather than
 * refused.
 */
import {
  inventoryBorrow,
  staffRefSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { object, optional } from "valibot";

import { requireInventoryPermission } from "../../index";
import { getInventoryActor } from "./inventory-database";

/** Every account starts here; only lateness ever moves the number, and only downward. */
const STARTING_SCORE = 100;
/** Flat cost per whole day a loan spent (or is still) late. */
const POINTS_LOST_PER_LATE_DAY = 10;
/**
 * The loan chain's second link: whoever checked an item out to somebody else
 * (`inventoryBorrow.borrowedByStaffId`) vouched for that loan, the same way a
 * `sub_manager` in the custody chain vouched for a further hand-over — see
 * `insertCustodyNoticeRecipients` in `inventory-database.ts`. They are not the
 * one holding the item, so their share of the blame is half the borrower's:
 * enough that a clerk who repeatedly lends to unreliable borrowers sees it in
 * their own number, not so much that processing a checkout counts as heavily
 * as being the one who kept the equipment.
 */
const POINTS_LOST_PER_VOUCHED_LATE_DAY = 5;

/**
 * Total days-late across every loan this person has ever borrowed, summed in
 * SQL for the same reason `overdueDaysExpression` is: the definition of "late"
 * must be one expression, not a TypeScript re-derivation that can drift from
 * the loans list's own badge.
 *
 * A returned loan contributes `returnedAt::date - expectedReturnDate::date`
 * when positive, zero otherwise. A still-open loan contributes
 * `current_date - expectedReturnDate::date` when positive — it is still
 * accruing lateness every day it stays out, exactly like the `isOverdue` badge
 * on the loans list.
 */
const totalLateDaysExpression = sql<number>`coalesce(sum(
  case
    when ${inventoryBorrow.status} = 'returned' and ${inventoryBorrow.returnedAt} is not null
      then greatest(0, (${inventoryBorrow.returnedAt}::date - ${inventoryBorrow.expectedReturnDate}::date))
    when ${inventoryBorrow.status} = 'borrowed'
      then greatest(0, (current_date - ${inventoryBorrow.expectedReturnDate}::date))
    else 0
  end
), 0)`;

/**
 * The same day-lateness sum as `totalLateDaysExpression`, over the loans this
 * person **processed for someone else** rather than borrowed themselves —
 * `borrowedByStaffId = targetStaffId` and `borrowerStaffId` naming somebody
 * different, so a clerk is never blamed twice for their own loan.
 */
const totalVouchedLateDaysExpression = sql<number>`coalesce(sum(
  case
    when ${inventoryBorrow.status} = 'returned' and ${inventoryBorrow.returnedAt} is not null
      then greatest(0, (${inventoryBorrow.returnedAt}::date - ${inventoryBorrow.expectedReturnDate}::date))
    when ${inventoryBorrow.status} = 'borrowed'
      then greatest(0, (current_date - ${inventoryBorrow.expectedReturnDate}::date))
    else 0
  end
), 0)`;

export const getPunctualityScore = requireInventoryPermission("read")
  .input(object({ staffId: optional(staffRefSchema) }))
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);
    const targetStaffId = input.staffId ?? actor.staffId;

    const [row, vouchedRow] = await Promise.all([
      context.db
        .select({
          totalLateDays: totalLateDaysExpression,
          loanCount: sql<number>`count(*)`.mapWith(Number),
          lateLoanCount: sql<number>`count(*) filter (where (
          ${inventoryBorrow.status} = 'returned'
          and ${inventoryBorrow.returnedAt} is not null
          and ${inventoryBorrow.returnedAt}::date > ${inventoryBorrow.expectedReturnDate}::date
        ) or (
          ${inventoryBorrow.status} = 'borrowed'
          and ${inventoryBorrow.expectedReturnDate}::date < current_date
        ))`.mapWith(Number),
        })
        .from(inventoryBorrow)
        .where(eq(inventoryBorrow.borrowerStaffId, targetStaffId))
        .then((rows) => rows[0]),
      context.db
        .select({ totalVouchedLateDays: totalVouchedLateDaysExpression })
        .from(inventoryBorrow)
        .where(
          and(
            eq(inventoryBorrow.borrowedByStaffId, targetStaffId),
            or(
              isNull(inventoryBorrow.borrowerStaffId),
              ne(inventoryBorrow.borrowerStaffId, targetStaffId)
            )
          )
        )
        .then((rows) => rows[0]),
    ]);

    const totalLateDays = row?.totalLateDays ?? 0;
    const totalVouchedLateDays = vouchedRow?.totalVouchedLateDays ?? 0;
    const score = Math.max(
      0,
      STARTING_SCORE -
        totalLateDays * POINTS_LOST_PER_LATE_DAY -
        totalVouchedLateDays * POINTS_LOST_PER_VOUCHED_LATE_DAY
    );

    return {
      staffId: targetStaffId,
      score,
      totalLateDays,
      totalVouchedLateDays,
      loanCount: row?.loanCount ?? 0,
      lateLoanCount: row?.lateLoanCount ?? 0,
    };
  });
