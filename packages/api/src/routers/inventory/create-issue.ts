/**
 * Hand stock out of the store permanently.
 *
 * Three things look alike at a school counter and only one of them is this:
 *
 * 1. **A borrow** (`create-borrow.ts`) — a teacher takes a device and brings it
 *    back. `qty` is untouched and `borrowedQty` rises, so the store still owns
 *    the thing.
 * 2. **A disposal** (`finalize-disposal.ts`) — the school writes the thing off
 *    because it is broken, lost or obsolete. It never comes back either, but
 *    nobody receives it and it usually needs a signature before it is final.
 * 3. **An issue** (this file) — the school gives the thing away *to somebody*:
 *    a student who is graduating, a contractor, a feeder school, the Provincial
 *    Education Office. It is not coming back, and the point of recording it is
 *    that the school no longer has it.
 *
 * The issue is the **terminal** one of the three, and that is what shapes this
 * whole handler. There is no `returnIssue`, no `cancelIssue` and no
 * `status` column: `inventory_issue` has no `updatedAt` and its foreign keys
 * are `restrict`, because an issue is a finished fact. A mistake is corrected
 * by a new row plus an `inventoryAuditLog` entry, never by editing this one —
 * see the `inventoryIssue` doc comment in the schema. The single line that
 * makes it terminal rather than a loan is the `qty` decrement in step 7, and it
 * is commented there.
 *
 * The receiver is **free text**, not a `staff` foreign key, and a later reader
 * should not "fix" that either. Stock leaves this school to people who are not
 * on its staff roll; inventing a `staff` row for a graduating student is the
 * same fake row that makes a staff list untrustworthy two years later. A borrow
 * is the opposite case and does use a staff FK, because a borrow is always by
 * someone the school employs.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryIssue,
  inventoryIssueInsertSchema,
  inventoryIssueUnit,
  inventoryItem,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import { eq, inArray } from "drizzle-orm";
import {
  array,
  minLength,
  object,
  optional,
  pick,
  pipe,
  string,
} from "valibot";

import { adminOnlyProcedure } from "../../index";
import {
  assertSufficientAvailableQuantity,
  assertUnitsNotPendingDisposal,
  claimLifecycleUnits,
  claimedUnitTags,
  countersOf,
  getInventoryActor,
  getLockedItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  iso,
} from "./inventory-database";

/**
 * The name of the `unique` index on `inventory_issue_unit.unit_id`, matched by
 * string in the `catch` below the way `create-staff.ts` matches
 * `staff_nic_unique`.
 *
 * This constraint — not a `select` in this file — is the guarantee that a unit
 * is issued out of the store **once, ever**. That is why nothing here
 * pre-checks it: a pre-check would be a second answer to a question the
 * database answers authoritatively, it would be wrong the instant two clerks
 * pressed the button at the same moment, and it would still have to be backed
 * by the constraint anyway. The composite primary key on
 * `(issue_id, unit_id)` only stops a unit being listed twice on *one* issue;
 * this is the stronger statement and it is what the business actually means.
 */
const ISSUE_UNIT_UNIQUE_CONSTRAINT = "inventory_issue_unit_unit_unique";

const createIssueInput = object({
  ...pick(inventoryIssueInsertSchema, [
    "itemId",
    "qty",
    "receiverName",
    "receiverDepartment",
    "receiverPhone",
    "purpose",
    "approvedBy",
    "expectedReturnDate",
    "note",
  ]).entries,
  /**
   * Which tagged units to hand over — **unit ids or the asset tags written on
   * the devices**, both accepted, and that dual match is `getAvailableUnits`'
   * rule rather than this file's.
   *
   * It is deliberate because the two callers of this screen know different
   * things: a teacher reading a number off a projector knows the tag and not the
   * primary key, while a bulk picker in the web app holds ids. Forcing one of
   * the two would mean a tag-to-id round trip for the person at the counter, on
   * a helper this handler already calls.
   *
   * Omitted entirely means "take whatever the server says is free": the oldest
   * `qty` available units for a tagged item, and **nothing to claim at all for a
   * bulk one** — `claimLifecycleUnits` asks whether the item is counted rather
   * than inferring it from the absence of tags, so "no tags named" on a tagged
   * item still claims its devices FIFO. That distinction is the whole of the
   * bulk path, and it is made in the shared helper because three other write
   * procedures have to make the identical one.
   *
   * An **empty** array is refused by the schema rather than being read as an
   * omitted one, because `getAvailableUnits` would treat it as a request for
   * zero specific units and answer "Only 0 unit(s) are available", which tells
   * the storekeeper nothing about the tag sitting in their hand. A bulk line is
   * not reached that way: the client sends `undefined`, not `[]`, when the
   * picker is empty (`unitTags.length > 0 ? unitTags : undefined`).
   */
  uniqueItemIds: optional(
    pipe(
      array(
        pipe(
          string(),
          minLength(
            1,
            "Enter the asset tag exactly as it is printed on the device"
          )
        )
      ),
      minLength(
        1,
        "Select at least one asset tag, or leave the list empty to issue any available units"
      )
    )
  ),
});

/**
 * Which tag to name when `inventory_issue_unit_unit_unique` fires.
 *
 * The constraint says that *one* row of the bulk insert already carries an
 * issue; it does not say which, and this code cannot work it out — by the time
 * Postgres refuses, the other transaction has committed. So the tag named is
 * the first one the **caller** asked for, read back in the casing they typed
 * it, because that is the one string in the error the person at the counter can
 * act on: it is on the label in their hand. When they named none (the FIFO
 * auto-pick) the first claimed tag is named instead, since "one of the assets"
 * gives them nothing to search the cupboard for.
 */
const contestedTag = (
  requestedTags: string[] | undefined,
  claimedTags: string[]
): string => requestedTags?.[0] ?? claimedTags[0] ?? "The selected asset";

export const createIssue = adminOnlyProcedure.input(createIssueInput).handler(
  async ({ input, context }) =>
    // The whole hand-over is one transaction: the item's `FOR UPDATE` lock, the
    // counter decrement, the unit status change, the `inventory_issue_unit`
    // rows and both ledger writes either all land or none of them do. A partial
    // issue would leave the store's `qty` reduced with no record of where the
    // stock went, which is the one outcome worse than refusing the request.
    await context.db.transaction(async (tx) => {
      const actor = await getInventoryActor(context);
      const issueId = crypto.randomUUID();
      const issuedAt = new Date();

      // FOR UPDATE. `before` and the new `qty` are both computed from this row,
      // never from the numbers the client sent, and two clerks issuing the same
      // item at once must not both read `qty = 3` and both take three.
      const existing = await getLockedItem(tx, input.itemId);
      const before = countersOf(existing);

      // Checked against the counters rather than against the unit rows, so the
      // message names the shortfall the clerk can act on ("only 2 available to
      // issue") instead of arriving as a failure to find tagged units.
      assertSufficientAvailableQuantity(before, input.qty, "issue");

      /**
       * FIFO when no tags were named, exact-match when they were, and **nothing
       * at all when the item is counted in bulk** — `units` is `null` in that case
       * and the `qty` decrement below is the whole of the movement. The helper
       * keeps the ways a claim can fail in separate messages because they mean
       * different things to the person at the counter; none of it is
       * re-implemented here, and the empty-list refusal lives in this file's own
       * schema above rather than in the helper, because only an issue can answer
       * it with "leave the list empty to issue any available units".
       */
      const claim = await claimLifecycleUnits(
        tx,
        existing.id,
        input.qty,
        input.uniqueItemIds
      );
      const { units } = claim;

      /**
       * **A unit spoken for on paper by an open disposal must not leave on an
       * issue**, or the certificate awaiting a signature would describe a device
       * nobody can find. Skipped for a bulk line, which has no units to pin and
       * therefore nothing a certificate could name wrongly.
       */
      if (units) {
        await assertUnitsNotPendingDisposal(
          tx,
          units.map((unit) => unit.id)
        );
      }

      const [issue] = await tx
        .insert(inventoryIssue)
        .values({
          id: issueId,
          itemId: existing.id,
          qty: input.qty,
          receiverName: input.receiverName,
          receiverDepartment: input.receiverDepartment ?? null,
          // Already normalised to `+94…` by `slPhoneSchema` on the way in, which
          // is why this is passed through rather than re-validated.
          receiverPhone: input.receiverPhone ?? null,
          purpose: input.purpose,
          approvedBy: input.approvedBy ?? null,
          expectedReturnDate: input.expectedReturnDate ?? null,
          note: input.note ?? null,
          // Null for a leadership account with no staff row, which is a
          // legitimate actor by design — the ledger and the audit log both
          // carry `actor.name`, so the trail survives the missing id.
          issuedByStaffId: actor.staffId,
          issuedAt,
        })
        .returning();

      if (!issue) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      /**
       * THE DEFINING LINE. `qty` is what the school *has*; `borrowedQty` is
       * what is out on loan and expected back. An issue decrements `qty`
       * because the stock has left the school and the books must stop
       * claiming it, and it leaves `borrowedQty` alone because nothing here is
       * coming back.
       *
       * A borrow does the exact opposite — it leaves `qty` alone and raises
       * `borrowedQty`. Do not "fix" this line to match the borrow pattern: the
       * two are the same shape of code and opposite meanings, and a borrow
       * modelled as an issue would shrink the store's stock every time a
       * teacher took a tripod for the weekend.
       */
      const [updated] = await tx
        .update(inventoryItem)
        .set({ qty: existing.qty - input.qty })
        .where(eq(inventoryItem.id, existing.id))
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }

      /**
       * The units follow the item's counter: `issued` is the terminal unit
       * status, and it is what stops `getAvailableUnits` handing the same
       * device to the next request even if the counters were wrong.
       *
       * **Skipped for a bulk line**, and that is the only difference the absence
       * of tags makes here: the counter above has already fallen, so "the school
       * no longer has these" is recorded in full; what there is not, and could
       * not be, is a per-device status for stock that was never per-device.
       */
      if (units) {
        await tx
          .update(inventoryUnit)
          .set({ status: "issued" })
          .where(
            inArray(
              inventoryUnit.id,
              units.map((unit) => unit.id)
            )
          );
      }

      const claimedTags = units?.map((unit) => unit.uniqueNo) ?? [];

      /**
       * ONE bulk insert, never a loop: `qty` is bounded by the available
       * count, and a per-row insert turns a hand-over of twenty laptops into
       * twenty round trips inside a transaction that is holding a row lock on
       * the item the whole time.
       *
       * Skipped for a bulk line — `inventory_issue_unit_unit_unique` is the
       * database's guarantee that a *device* is issued out once, ever, and a
       * counted line has no device for it to be true of. Writing no rows is not a
       * weaker version of the guarantee; it is the whole of the guarantee.
       */
      if (units) {
        try {
          await tx
            .insert(inventoryIssueUnit)
            .values(units.map((unit) => ({ issueId, unitId: unit.id })));
        } catch (error) {
          // The window between `getAvailableUnits` reading `status = "available"`
          // and this insert is real, and it is exactly the race the unique
          // constraint exists to lose safely: another transaction issued one of
          // these devices between the two statements. Both transactions' unit
          // updates roll back with the failed insert, so the ledger and the
          // counters are untouched and the clerk can simply retry. The whole
          // transaction aborts here — there is no partial issue.
          if (
            error instanceof Error &&
            error.message.includes(ISSUE_UNIT_UNIQUE_CONSTRAINT)
          ) {
            throw new ORPCError("CONFLICT", {
              message: `Asset ${contestedTag(input.uniqueItemIds, claimedTags)} has already been issued to somebody else. Reload the item and issue the units that are still available`,
            });
          }

          throw error;
        }
      }

      const after = countersOf(updated);

      await insertInventoryTransaction(tx, {
        actor,
        action: "issued",
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before,
        after,
        // The count and the receiver, because that is the sentence a store
        // ledger is read out loud for. `borrowedQty` is identical on both
        // sides, which is itself the fact worth recording: an issue does not
        // touch what is out on loan.
        note: `Issued ${input.qty} unit(s) to ${input.receiverName}`,
        meta: {
          receiverName: input.receiverName,
          purpose: input.purpose,
          // The *normalized* tags rather than the row ids, because this is the
          // payload an auditor reads a year later and a storekeeper searching
          // for `proj-014` types the tag, not a uuid. Empty — never absent — for
          // a bulk line, so a reader of this blob can tell "counted, not tagged"
          // from "written before tags existed" without a null check.
          uniqueUnitIds: claimedUnitTags(claim),
          bulkItem: claim.isBulk,
        },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "issue.create",
        entityType: "inventory_issue",
        entityId: issueId,
        // `before` is null rather than a zeroed row: nothing existed here a
        // moment ago, and inventing a placeholder would put a fiction in the
        // audit trail — the one table whose whole job is to say what was and
        // what is.
        before: null,
        // The row as written, including the `issuedAt` the caller is told about
        // below, so the audit entry and the list row cannot disagree about when
        // the hand-over happened.
        after: {
          id: issue.id,
          itemId: issue.itemId,
          qty: issue.qty,
          receiverName: issue.receiverName,
          receiverDepartment: issue.receiverDepartment,
          receiverPhone: issue.receiverPhone,
          purpose: issue.purpose,
          approvedBy: issue.approvedBy,
          expectedReturnDate: issue.expectedReturnDate,
          note: issue.note,
          issuedByStaffId: issue.issuedByStaffId,
          issuedAt: iso(issue.issuedAt),
        },
      });

      return {
        id: issue.id,
        itemId: existing.id,
        itemName: existing.name,
        itemSku: existing.sku,
        qty: input.qty,
        receiverName: issue.receiverName,
        issuedAt: iso(issue.issuedAt),
        // The tags as printed on the devices, because the success toast and the
        // printed receipt both quote them and neither has a lookup step.
        //
        // `null` for a counted line, and the reason is the same one
        // `createDisposal` gives: `[]` renders as a tag list the clerk filled in
        // and could not read, and this is the printed receipt an auditor reads
        // to find out *which* devices left the school. "No tags — this line is
        // counted in bulk" is the true sentence; an empty table is not.
        units:
          units?.map((unit) => ({
            id: unit.id,
            uniqueNo: unit.uniqueNo,
          })) ?? null,
        // On hand after the hand-over, i.e. the item's new `qty` — not its
        // `availableQty`. The two differ whenever something is out on loan, and
        // a success message that quoted the wrong one would be read as the
        // store having lost track of its own borrowings.
        remainingQty: updated.qty,
      };
    })
);
