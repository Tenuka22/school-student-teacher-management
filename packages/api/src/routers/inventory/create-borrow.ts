/**
 * Lend stock to a member of staff **or a student**. It comes back.
 *
 * A borrow is the one inventory movement that is *not* a movement: nothing
 * leaves the school, so `inventoryItem.qty` does not change. What changes is
 * `borrowedQty` — the count of units sitting in somebody's bag — and the pair
 * `(qty, borrowedQty)` is what "how much do we have" and "how much is out" mean
 * everywhere else in this module. See the comment on the `update` below; it is
 * the line most likely to be "fixed" by somebody who has just read the issue
 * flow next door.
 *
 * ## A student is a recorded borrower, never an actor
 *
 * A Grade 9 class is lent calculators, a sports set goes to a house, and a
 * laptop goes home with a pupil at the end of term, so the loan has to be able
 * to name a person who is not on the payroll. `inventoryBorrow` therefore
 * carries **two** borrower columns — `borrower_staff_id` and
 * `borrower_student_id`, each a real `restrict` foreign key to the table it
 * names — and `inventory_borrow_borrower_exclusive` refuses both-set and
 * neither-set. The database holds "exactly one borrower of exactly one type";
 * this file turns that into a request shape with a `v.variant`, so a caller
 * cannot send a half-populated borrower either.
 *
 * **What a student is not is an actor, and there is no missing screen here.**
 * The `student` table has no `userId` link, so a student can never sign in: a
 * student loan is created by a member of staff and closed by a member of staff,
 * through this procedure and `returnBorrow`. If you are looking for the
 * student-facing version of this page, it does not exist and must not be built
 * on this table — a student is a subject of a loan, never a party to one. The
 * `borrowedByStaffId` / `returnedByStaffId` columns are the actors, and they
 * are what the audit trail answers "who did this" with.
 *
 * What this file is really for, on both sides of that, is attribution. Both
 * borrower columns are `restrict` — the person is the reason the row exists,
 * and the database will not let them be deleted while a loan is open. So unlike
 * every other write in the inventory service layer, a caller with **no staff
 * record** cannot perform one: there would be nobody to ask for the laptop
 * back, and the row would say "an administrator with no name" until the next
 * audit. That refusal is a `BAD_REQUEST` and not a `FORBIDDEN` because the
 * caller has passed `requireInventoryPermission("create")` — the authority is
 * theirs; what is missing is a fact about the account, which is a bad request,
 * not a denied one.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryBorrow,
  inventoryBorrowInsertSchema,
  inventoryBorrowUnit,
  inventoryItem,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import { studentIdSchema } from "@school-student-teacher-management/db/schema/marking";
import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { eq, inArray } from "drizzle-orm";
import {
  array,
  literal,
  object,
  optional,
  pick,
  string,
  variant,
} from "valibot";

import { requireInventoryPermission } from "../../index";
import { calculateAvailableQuantity } from "./inventory-calculations";
import {
  assertSufficientAvailableQuantity,
  assertUnitsNotPendingDisposal,
  claimLifecycleUnits,
  claimedUnitTags,
  countersOf,
  describeBorrower,
  getBorrower,
  getInventoryActor,
  getLockedItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  iso,
} from "./inventory-database";
import type { InventoryBorrower } from "./inventory-database";

type BorrowRow = typeof inventoryBorrow.$inferSelect;

/**
 * A `23505` from anywhere in the error chain.
 *
 * node-postgres raises a `pg` `DatabaseError` for a unique violation and
 * drizzle wraps query errors in its own `DrizzleQueryError`, so the code lives
 * either on the thrown value or on its `cause` depending on which layer the
 * statement was issued from. Both are checked so this guard cannot quietly stop
 * matching and let a raw driver error reach the user. Nothing else is treated
 * as a unique violation: swallowing a `23503` (foreign key) or a `23514` (CHECK)
 * here would replace a real bug with a message about a race.
 */
const isUniqueViolation = (error: unknown): boolean => {
  const candidates: unknown[] = [
    error,
    (error as { cause?: unknown } | null | undefined)?.cause,
  ];

  return candidates.some(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      (candidate as { code?: unknown }).code === "23505"
  );
};

/**
 * The borrower as `jsonb` should hold it: the resolved person, not the pointer.
 *
 * The two pointer columns are recorded too, because this snapshot is the record
 * of what the row *was*, and a reader comparing two versions of a loan wants to
 * see that the borrower changed rather than to infer it from a name. The
 * resolved fields sit beside them on purpose — see `insertInventoryTransaction`'s
 * note on denormalising names onto the ledger: a departure must not blank the
 * history, and a history that can only say "the staff row this pointed at is
 * gone" is not a history.
 */
const borrowAuditSnapshot = (
  row: BorrowRow,
  borrower: InventoryBorrower
): Record<string, unknown> => ({
  id: row.id,
  itemId: row.itemId,
  qty: row.qty,
  borrowerStaffId: row.borrowerStaffId,
  borrowerStudentId: row.borrowerStudentId,
  borrower: {
    type: borrower.type,
    id: borrower.id,
    name: borrower.name,
    reference: borrower.reference,
    className: borrower.className,
  },
  purpose: row.purpose,
  expectedReturnDate: row.expectedReturnDate,
  approvedBy: row.approvedBy,
  note: row.note,
  status: row.status,
  borrowedByStaffId: row.borrowedByStaffId,
  borrowedAt: iso(row.borrowedAt),
  returnedAt: row.returnedAt ? iso(row.returnedAt) : null,
  returnedByStaffId: row.returnedByStaffId,
  returnCondition: row.returnCondition,
  returnNote: row.returnNote,
});

/**
 * The borrower, as a **discriminated union** rather than two optional columns.
 *
 * Two independent optionals would let a request carry both ids, or neither, or
 * an id of the wrong kind, and every one of those is a row the database CHECK
 * would reject after the request had been accepted — or, worse, a row that
 * names the wrong person. `v.variant` keys the payload off `type`, so exactly
 * one of the two shapes is constructible and the id that comes with it is the
 * id of the table `type` names. The two columns on the row are then written
 * from this one object and the case cannot be lost between the two.
 */
const borrowerSchema = variant("type", [
  object({ type: literal("staff"), staffId: staffIdSchema }),
  object({ type: literal("student"), studentId: studentIdSchema }),
]);

export const createBorrow = requireInventoryPermission("create")
  .input(
    object({
      // Everything the caller supplies about the loan itself, straight off the
      // generated insert schema: `purpose` and `expectedReturnDate` are
      // `notNull` on the table (a loan with no stated reason and no date to be
      // late against is not a loan), and `expectedReturnDate` is refined by
      // `isoDateSchema` so the `inventory_borrow_expected_return_date_iso`
      // CHECK is satisfied before the write rather than by it. Neither borrower
      // column appears in this pick, and that is the point: they are nullable on
      // the table, so a generated schema would hand back two independent
      // optionals and the exclusivity CHECK would be doing the validation the
      // request should have done. `borrower` replaces them below.
      ...pick(inventoryBorrowInsertSchema, [
        "itemId",
        "qty",
        "purpose",
        "expectedReturnDate",
        "approvedBy",
        "note",
      ]).entries,
      /**
       * Who the loan is to: a member of staff, or a student on the register.
       * Exactly one of the two shapes, and the discriminator is the thing that
       * decides which column is written — see `borrowerSchema`.
       */
      borrower: borrowerSchema,
      /**
       * Asset tags for the units being lent, as written on the device, or the
       * primary keys of the rows holding them.
       *
       * Omitted (or an empty array, which is what an untouched multi-select sends)
       * means "take whatever the server says is free": the oldest `qty` available
       * units for a tagged item, and **nothing to claim at all for a bulk one**.
       * Supplied means the storekeeper is handing over specific machines, and
       * `getAvailableUnits` is then the only thing consulted.
       *
       * **The comment this replaces claimed that omitting the tags is "what a bulk
       * item with no tags at all needs" — which described the intent and not the
       * behaviour.** The code below called `getAvailableUnits` unconditionally, so
       * a bulk item was answered "Only 0 unit(s) are available" and a store with
       * 200 chairs could never lend them. The distinction is now drawn where it can
       * be, in `claimLifecycleUnits`, which asks whether the item *is* a bulk line
       * rather than inferring it from the absence of tags — because "no tags named"
       * is also what a clerk sending a request for a tagged item sends, and reading
       * that as a bulk movement would manufacture exactly the counter-with-no-units
       * drift that `returnBorrow` refuses to close.
       *
       * ## A bulk line is lendable, and that is a decision
       *
       * `borrowable` is the item's own statement about whether it is the kind of
       * thing a person carries off-site, and a school lends bulk stock constantly:
       * a stack of chairs to the hall for assembly, a box of calculators to a class,
       * a set of bibs to a house. Refusing on "there are no asset tags" grounds
       * would also be incoherent against its sibling — after the same fix a bulk
       * line *can* be issued out and written off, and an issue and a borrow are the
       * same shape of fact (a count moves; an issue takes it off `qty`, a borrow
       * raises `borrowedQty`). Allowing one and refusing the other on the grounds
       * that the item has no rows would be a rule about the data shape posing as a
       * rule about the business.
       *
       * What is given up is per-device custody, and the price is paid in the record
       * rather than in a refusal: `meta.bulkItem` is `true` on the ledger row, so a
       * loan of "40 chairs to the hall" is never mistaken for a loan of forty
       * identified chairs, and the response's `units` is `null` rather than `[]` so
       * the toast can say the line is counted in bulk instead of rendering an empty
       * tag list as though a device had been chosen and found blank.
       */
      uniqueItemIds: optional(array(string())),
    })
  )
  .handler(({ input, context }) =>
    context.db.transaction(async (tx) => {
      const actor = await getInventoryActor(context);

      // A loan has to be attributable to somebody who can be asked for the
      // thing. `InventoryActor.staffId` is nullable *by design* — the seeded
      // admin / principal / deputy-principal accounts are users with no staff
      // identity on purpose, and no other inventory write is refused for that.
      // This one is different: both borrower columns are `restrict`, and a
      // borrow whose holder is "an account with no staff row" cannot be chased
      // up at the end of term. BAD_REQUEST, not FORBIDDEN — the caller holds
      // the `create` permission; what they lack is a staff record to attach to.
      if (!actor.staffId) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "This is a personal login with no staff record, so there is nobody to attach a loan to — ask an administrator to add your staff record before borrowing",
        });
      }

      // FOR UPDATE. Two clerks borrowing from the same item at the same moment
      // both read `borrowedQty = 1` and both decide two units are free; only
      // the lock makes the second one see the first one's write.
      const existing = await getLockedItem(tx, input.itemId);

      // `borrowable` is the item's own statement about whether it is the kind
      // of thing a person carries off-site. A fixed projector in the hall, a
      // bolt-down set of benches, the school server: none of them is on loan,
      // they are issued or written off. The flag exists so the storekeeper does
      // not have to remember which of those each one is.
      if (existing.borrowable === false) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "This item is not on loan — it can only be issued or written off",
        });
      }

      assertSufficientAvailableQuantity(
        countersOf(existing),
        input.qty,
        "borrow"
      );

      /**
       * FIFO when no tags were named, and exact-match when they were. Either way
       * this throws rather than returning a short list, so `units.length` is
       * `input.qty` from here on and every `values([...])` below is built from what
       * the counter is about to be set to.
       *
       * **`units` is `null` for a bulk item and that is not an empty list.** See
       * `claimLifecycleUnits` for the three arms; the short version is that a
       * counted line has no per-device rows to claim, and everything below that
       * writes a unit status, a `inventory_borrow_unit` row or a tag list is
       * conditional on there being units to write about.
       */
      const claim = await claimLifecycleUnits(
        tx,
        existing.id,
        input.qty,
        input.uniqueItemIds
      );
      const { units } = claim;

      if (units) {
        await assertUnitsNotPendingDisposal(
          tx,
          units.map((unit) => unit.id)
        );
      }

      /**
       * The person the loan is owed back to, resolved **before** the insert and
       * through `getBorrower` like every other read in the feature. Two reasons
       * for the ordering: an id that names nobody is refused with a message
       * about the person rather than surfacing as a `23503` from the foreign key
       * halfway down the transaction, and the resolved name and type are then
       * available to be denormalised onto the ledger and the audit row, which
       * is the whole reason the ledger keeps names at all.
       *
       * Both pointers are derived here from the one discriminated union, and
       * each from a test of the *same* `type`, so "exactly one of the two" is
       * true by construction rather than by a pair of conditions agreeing. This
       * is the only place the choice is made, and the insert below writes the
       * columns from these two values — never a fresh test of its own.
       */
      const borrowerStaffId =
        input.borrower.type === "staff" ? input.borrower.staffId : null;
      const borrowerStudentId =
        input.borrower.type === "student" ? input.borrower.studentId : null;

      const borrower = await getBorrower(tx, {
        borrowerStaffId,
        borrowerStudentId,
      });

      const borrowId = crypto.randomUUID();
      const borrowedAt = new Date();

      const [borrow] = await tx
        .insert(inventoryBorrow)
        .values({
          id: borrowId,
          itemId: existing.id,
          qty: input.qty,
          // Exactly one of the two, and never both — they are the two values
          // derived above, which is the reason there is no third decision to
          // get wrong here. `inventory_borrow_borrower_exclusive` would refuse
          // the other three combinations, but reaching a constraint for
          // something the request shape already decided would be a bug reported
          // as a server error.
          borrowerStaffId,
          borrowerStudentId,
          purpose: input.purpose,
          expectedReturnDate: input.expectedReturnDate,
          approvedBy: input.approvedBy ?? null,
          note: input.note ?? null,
          status: "borrowed",
          borrowedByStaffId: actor.staffId,
          borrowedAt,
          // The four return fields are written `null` explicitly rather than
          // omitted. `inventory_borrow_return_state` requires all four to be
          // NULL on a `borrowed` row, and a defaulted column that happened to
          // differ would surface as a constraint violation instead of as this
          // reviewable line.
          returnedAt: null,
          returnedByStaffId: null,
          returnCondition: null,
          returnNote: null,
        })
        .returning();

      if (!borrow) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      /**
       * `borrowedQty` rises by the lent quantity. **`qty` does not change**, and
       * it must not be "fixed" to match the issue flow next door.
       *
       * A borrowed unit is still the school's property, sitting in a teacher's
       * bag — or, since this procedure also lends to students, in a student's.
       * It is on the books at `qty` and separately counted at `borrowedQty`, and
       * `calculateAvailableQuantity` reads "free to lend" as
       * `max(0, qty - borrowedQty)`. The issue flow is the opposite case: an
       * issued unit has left the school, so it *does* come off `qty`
       * (`qty: existing.qty - input.qty`). Both are correct; they are correct
       * because the two movements are different facts, and making them look
       * alike is how a storebook starts reporting stock it does not have — or,
       * worse, reporting stock it gave away twice.
       */
      const [updatedItem] = await tx
        .update(inventoryItem)
        .set({ borrowedQty: existing.borrowedQty + input.qty })
        .where(eq(inventoryItem.id, existing.id))
        .returning();

      if (!updatedItem) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }

      if (units) {
        await tx
          .update(inventoryUnit)
          .set({ status: "borrowed" })
          .where(
            inArray(
              inventoryUnit.id,
              units.map((unit) => unit.id)
            )
          );
      }

      // One statement for the whole page of units. A loop here would be N
      // round trips inside a transaction that is already holding a row lock.
      const claimedTags = units?.map((unit) => unit.uniqueNo).join(", ") ?? "";

      // `inventory_borrow_unit_active_unique` is a **partial** unique index on
      // `unit_id` where `released_at is null`, and it is the database's
      // guarantee that a unit is in at most one *active* loan — while still
      // allowing the same projector to be borrowed again as many times as the
      // school likes once this row is released.
      //
      // It is deliberately not pre-checked in application code. A
      // check-then-insert has the same race as any other read-then-write: the
      // other transaction can commit between the two statements, so the
      // pre-check could only make the failure rarer, never impossible, and the
      // index is the thing that actually holds. The race is handled here
      // instead of being pretended away there.
      //
      // **Skipped entirely for a bulk line**, and that is the point rather than an
      // oversight: there are no rows to claim, so there is no index to race and no
      // race to lose. The counter write above is unconditional and is the whole of
      // what a bulk loan does.
      if (units) {
        try {
          await tx.insert(inventoryBorrowUnit).values(
            units.map((unit) => ({
              borrowId,
              unitId: unit.id,
              releasedAt: null,
            }))
          );
        } catch (error) {
          if (!isUniqueViolation(error)) {
            throw error;
          }

          throw new ORPCError("CONFLICT", {
            message: `Asset ${claimedTags} went out on another loan a moment ago — reload the item and try again`,
          });
        }
      }

      await insertInventoryTransaction(tx, {
        actor,
        action: "borrowed",
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(updatedItem),
        note: `Lent ${input.qty} unit(s) to ${describeBorrower(borrower)}, due back ${input.expectedReturnDate}`,
        // The normalized tags, not the row ids: the audit trail is read years
        // later by somebody holding a clipboard with `LT-0042` written on it,
        // and `lt-0042` is what that lookup would have to be spelled as.
        //
        // The borrower's **resolved name and type** go in beside the id, and
        // that is the same denormalisation `itemName` and `actorName` get
        // below them: this row is read long after the person has been dealt
        // with, and a ledger that says only "student STU/2025/001" has thrown
        // away the fact a reader is looking for. The id is kept as well — it is
        // the join key for anybody who still needs one.
        meta: {
          borrowerType: borrower.type,
          borrowerId: borrower.id,
          borrowerName: borrower.name,
          borrowerReference: borrower.reference,
          purpose: input.purpose,
          expectedReturnDate: input.expectedReturnDate,
          uniqueUnitIds: claimedUnitTags(claim),
          /**
           * `true` only for a counted line, and it is **the** statement that this
           * loan has no per-device custody behind it. `uniqueUnitIds: []` above is
           * ambiguous on its own — a tagged item with a zero-quantity movement
           * cannot happen, but a reader of the `meta` blob has no way to know that
           * — so the flag is written explicitly rather than inferred downstream.
           */
          bulkItem: claim.isBulk,
        },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "borrow.create",
        entityType: "inventory_borrow",
        entityId: borrowId,
        before: null,
        after: borrowAuditSnapshot(borrow, borrower),
      });

      return {
        id: borrow.id,
        itemId: existing.id,
        itemName: existing.name,
        itemSku: existing.sku,
        qty: borrow.qty,
        // The resolved person, not the id the client sent. The caller gets
        // back the name it is about to render on the toast it is about to
        // raise, so it never has to keep a second directory of staff and
        // students in the client to label a row it just created.
        borrower,
        expectedReturnDate: borrow.expectedReturnDate,
        borrowedAt: iso(borrow.borrowedAt),
        /**
         * `null`, not `[]`, for a bulk line. The difference is the same one
         * `createDisposal` returns its own `units` for: an empty array renders as a
         * tag list somebody filled in and could not read, whereas `null` is the
         * only value that says "this item is counted, not tagged" — and the client
         * already knows which it was from `uniqueIdCount`, so an empty array would
         * be the one response shape that cannot be rendered honestly.
         */
        units:
          units?.map((unit) => ({ id: unit.id, uniqueNo: unit.uniqueNo })) ??
          null,
        item: {
          qty: updatedItem.qty,
          borrowedQty: updatedItem.borrowedQty,
          availableQty: calculateAvailableQuantity(countersOf(updatedItem)),
        },
      };
    })
  );
