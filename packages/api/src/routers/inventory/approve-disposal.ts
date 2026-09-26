/**
 * Sign off that a proposed write-off *should* happen. **Still nothing moves.**
 *
 * The second of the two stages, and the one that needs the stronger gate. The
 * source app used `adminProcedure` here and `managementProcedure` on the create
 * side, and this port keeps that split rather than reaching for
 * `requireInventoryPermission("approve")` — see the note on the export below for
 * why the two are not as different as they look today, stated plainly rather
 * than dressed up.
 *
 * The stock counters are untouched here exactly as they are in
 * `createDisposal`. What this write does is set `status`, stamp the approver
 * and the moment of approval **together**, and append a status-history row. The
 * pairing is not a style choice: `inventory_disposal_approval_state` refuses a
 * row where `approvedByStaffId` and `approvedAt` disagree about being null, and
 * the `approved` arm of `inventory_disposal_status_state` refuses an `approved`
 * row with no approver, no approval date, or anything finalized or cancelled.
 * Setting the actor and the timestamp in one `set()` is what makes that
 * constraint impossible to trip.
 *
 * The `getLockedDisposal` helper below is duplicated verbatim in
 * `finalize-disposal.ts` and `cancel-disposal.ts`. A shared version belongs in
 * `inventory-database.ts` next to `getLockedItem` — this flow does not own that
 * file, and three near-identical five-line reads are a smaller cost than
 * importing a helper across three sibling router files that a composition agent
 * is entitled to read independently.
 */
import { ORPCError } from "@orpc/server";
import { disposalStatusLabel } from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryDisposal,
  inventoryDisposalIdSchema,
  inventoryDisposalStatusHistory,
  inventoryItem,
} from "@school-student-teacher-management/db/schema/inventory";
import { eq } from "drizzle-orm";
import { object, optional, string } from "valibot";

import { adminProcedure } from "../../index";
import type { Executor } from "./inventory-database";
import {
  countersOf,
  getInventoryActor,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  iso,
} from "./inventory-database";

/**
 * Read one disposal **under a row lock**.
 *
 * The lock is what makes this procedure safe against the double-click: two
 * approvals both read `status = "pending_approval"`, and without `FOR UPDATE`
 * the second one would stamp a second approver over the first. The same lock
 * also serialises this against `finalizeDisposal` and `cancelDisposal`, so the
 * three cannot interleave a read of `approved` with a write of `cancelled`.
 */
const getLockedDisposal = async (db: Executor, disposalId: string) => {
  const [record] = await db
    .select()
    .from(inventoryDisposal)
    .where(eq(inventoryDisposal.id, disposalId))
    .limit(1)
    .for("update");

  if (!record) {
    throw new ORPCError("NOT_FOUND", { message: "Disposal request not found" });
  }

  return record;
};

/**
 * **`adminProcedure`, not `requireInventoryPermission("approve")` — and it does
 * not, on its own, buy separation of duties.**
 *
 * A write-off is a financial certificate: it removes real money from the
 * school's books. The person who notices a projector is broken and the person
 * who says "yes, take it off the books" must not be the same person, so the
 * approval gate has to be tighter than the creation gate.
 *
 * Read honestly against this repo, the two candidate gates are **currently
 * equivalent**. `requireInventoryPermission("approve")` consults
 * `requirePermission("inventory", "approve")`, and the only roles in
 * `packages/auth/src/permissions.ts` holding `inventory: ["approve"]` are
 * `admin`, `principal` and `vicePrincipal` — every one of which
 * `requirePermission` short-circuits through the `ADMIN_ROLES` bypass before it
 * ever looks at the grant. So neither gate is tighter than the other *by role*,
 * and claiming otherwise would be dressing up a permissions-table coincidence as
 * a security control. A `teacher` account reaches neither, which is the only
 * thing both gates actually guarantee today.
 *
 * `adminProcedure` is chosen anyway, for the property that survives the next
 * change to the grants table: it admits the three leadership seats **by
 * construction**, as a literal role list, and it keeps admitting them if a
 * future storekeeper or clerk role is granted `inventory: ["approve"]` — which is
 * the change that would silently turn a write-off into something a storekeeper
 * can sign. A permission string does not have that property: widening the grant
 * widens the gate with no code change and no reviewer.
 *
 * **The actual separation of duties is the check in the handler below**, not this
 * procedure level, and it is also not airtight — see the comment there.
 */
export const approveDisposal = adminProcedure
  .input(
    object({
      disposalId: inventoryDisposalIdSchema,
      note: optional(string()),
    })
  )
  .handler(async ({ input, context }) => {
    /**
     * Resolved before the transaction opens. `getInventoryActor` takes the
     * `Context` and reads `staff` through `context.db`, so it is on a different
     * connection from the transaction whether it is called inside the callback or
     * before it — calling it inside only makes the two reads look sequential when
     * they are not, and the disposal lock must be taken before anything reads the
     * certificate. Every *check* on the actor still happens inside, after the
     * record has been read, so `NOT_FOUND` keeps precedence over a bad actor.
     */
    const actor = await getInventoryActor(context);

    return context.db.transaction(async (tx) => {
      const existing = await getLockedDisposal(tx, input.disposalId);

      // Names the status the request is actually in, because "only pending
      // requests can be approved" leaves a user who double-clicked — or who is
      // looking at a request somebody else already signed — with nothing to act
      // on. The two live cases are an approval replayed after success and a
      // finalisation that arrived first.
      if (existing.status !== "pending_approval") {
        throw new ORPCError("CONFLICT", {
          message: `This request is ${disposalStatusLabel(existing.status)} — only a request that is still awaiting approval can be signed off`,
        });
      }

      /**
       * A signature the schema cannot record is refused here rather than at the
       * database.
       *
       * `InventoryActor.staffId` is null for the seeded `admin` / `principal` /
       * `deputy-principal` seats — leadership accounts seeded as users with no
       * staff identity on purpose. The `approved` arm of
       * `inventory_disposal_status_state` requires `approved_by_staff_id IS NOT
       * NULL` (and so does each of the six final arms), so a write from an actor
       * with no staff row is refused by PostgreSQL no matter how it is
       * composed. The alternative to this guard is a raw constraint violation
       * reaching the user as a toast, and there is no legitimate way round the
       * CHECK: the only value that would satisfy it is a `staff` row invented for
       * an account that is not on the teaching roll, which is the fake row
       * `InventoryActor`'s own doc comment exists to avoid.
       *
       * **BAD_REQUEST, not FORBIDDEN.** The caller has already passed the
       * `adminProcedure` role gate, so their *authority* to approve is not in
       * question; what is missing is an identity the certificate can name. That
       * is the same distinction `take-item.ts` draws for the same situation —
       * "a refusal that follows a successful authorization check is a bug, not a
       * policy" — and the message says what to do about it (get the account
       * linked to a staff profile) rather than reporting a permission failure.
       * `createDisposal` needs no such guard: `pending_approval` is the one arm
       * of the ladder that does not name anybody.
       */
      if (actor.staffId === null) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Your account has no staff record, so it cannot sign a disposal certificate. Ask an administrator to link your account to your staff profile",
        });
      }

      /**
       * Refuse the requester signing their own request.
       *
       * This runs after the null-identity guard above, so both sides are known
       * non-null and the comparison cannot be a false match against a missing
       * value. `existing.requestedByStaffId` is null when the request was raised
       * by a leadership account, and that is *not* an exemption: such a request
       * could not have been approved in the first place, because the requester
       * would have been refused here, so reaching this point with a null
       * requester means nobody identifiable raised it.
       *
       * What the check achieves is real: a storekeeper, a clerk or any account
       * that *does* have a staff row cannot certify their own request. What it
       * cannot achieve is airtightness for the two leadership seats that are the
       * school's signing authority by role — see the note on the export below
       * and in the report: the same pair of hands can raise and sign where the
       * requester has no staff identity to compare against.
       */
      if (
        existing.requestedByStaffId !== null &&
        actor.staffId === existing.requestedByStaffId
      ) {
        throw new ORPCError("FORBIDDEN", {
          message:
            "You raised this request, so it has to be signed off by someone other than you",
        });
      }

      const approvedAt = new Date();

      /**
       * `approvedByStaffId` and `approvedAt` are written in the same statement
       * with `status`, and `finalized_*` / `cancelled_*` are left alone. That is
       * the whole contract: the `approved` arm of
       * `inventory_disposal_status_state` wants an approver, an approval date,
       * and nothing else set, and the guard above is what makes "an approver"
       * satisfiable rather than a coin flip on whether the caller has a staff
       * row.
       */
      const [updated] = await tx
        .update(inventoryDisposal)
        .set({
          status: "approved",
          approvedByStaffId: actor.staffId,
          approvedAt,
        })
        .where(eq(inventoryDisposal.id, existing.id))
        .returning();

      if (!updated) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      /**
       * The first row in this table for this disposal. The source app declared
       * `disposalStatusHistory` and never wrote to it, which meant a certificate
       * could say `approved` with no record of the moment it became so; this
       * write, and the two sibling procedures, are what give the table a writer.
       */
      await tx.insert(inventoryDisposalStatusHistory).values({
        id: crypto.randomUUID(),
        disposalId: existing.id,
        fromStatus: existing.status,
        toStatus: "approved",
        note: input.note ?? "Disposal approved",
        changedByStaffId: actor.staffId,
      });

      // The item is read (not locked) for its name, SKU and counters: the ledger
      // row has to say *which* item was signed off, and it has to carry the
      // item's real numbers on both sides. The row lock belongs to the disposal
      // above and to `finalizeDisposal`, which is the procedure that actually
      // writes `qty` — nothing here changes a counter.
      const [item] = await tx
        .select({
          id: inventoryItem.id,
          name: inventoryItem.name,
          sku: inventoryItem.sku,
          qty: inventoryItem.qty,
          borrowedQty: inventoryItem.borrowedQty,
        })
        .from(inventoryItem)
        .where(eq(inventoryItem.id, existing.itemId))
        .limit(1);

      if (!item) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }

      /**
       * Real counters on both sides, and they are equal: a signature is not a
       * movement. The ledger records the *intent* here, exactly as it does in
       * `createDisposal`, and the numbers move once — in `finalizeDisposal`.
       * A reader who wants to know what a write-off cost the store reads the
       * `disposal_finalized` row; this one says who signed, and on what.
       */
      await insertInventoryTransaction(tx, {
        actor,
        action: "disposal_approved",
        item: { id: item.id, name: item.name, sku: item.sku },
        before: countersOf(item),
        after: countersOf(item),
        note: input.note ?? "Disposal approved",
        meta: { disposalId: existing.id, reason: existing.reason },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "disposal.approve",
        entityType: "inventory_disposal",
        entityId: existing.id,
        before: { status: existing.status, approvedAt: null },
        after: { status: updated.status, approvedByStaffId: actor.staffId },
      });

      return {
        id: updated.id,
        status: updated.status,
        approvedAt: iso(approvedAt),
        // The name beside the signature. The guard in this handler has already
        // established that `actor.staffId` is non-null, so this is the `staff`
        // row's own name — the same string the ledger and the audit log
        // denormalise, so the toast, the certificate and the trail cannot
        // disagree about who signed.
        approvedByName: actor.name,
      };
    });
  });
