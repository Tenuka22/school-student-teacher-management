/**
 * Put a retired item back on the working register — the exact inverse of
 * `deleteItem`, and the other half of what makes a soft delete soft.
 *
 * ## Why this exists rather than "a hard delete is the escape hatch"
 *
 * `deleteItem` stamps `deleted_at` and the row drops out of `listItems`,
 * `getItem`, `listCustodyHistory`, `listDisposals`, `listIssues` and
 * `listUnits` — every read in the feature treats a retired item as a
 * non-existent one, which is the correct default and also the reason the write
 * was, in practice, **irreversible**. The toast says the ledger and the custody
 * history are still on file, which is true, and then the row is gone from every
 * screen that can act on it: no toggle, no row, no route back. A storekeeper who
 * retired the wrong line, or who retired a line an audit asked to see back on the
 * books, had no way to undo it and no way to find it.
 *
 * This is that way back, and it is deliberately as small as `deleteItem`:
 *
 * - **`deleted_at` is the only column it writes.** No counter moves, no unit
 *   status changes, no custody row is written and no history is rewritten.
 *   `qty` and `borrowedQty` are snapshotted onto the ledger row exactly as
 *   `deleteItem` snapshots them, because the ledger's two sides are the figures
 *   every other row either side of this one refers to.
 * - **The gate is `requireInventoryPermission("update")`, not `"delete"`.** This
 *   is a one-column `update`, it is what the *edit* of a record looks like
 *   elsewhere in this feature (`updateItem` moves a category, a valuation, a
 *   threshold), and reaching for `delete` would say the caller needs authority to
 *   destroy school property in order to un-destroy it. `deleteItem` keeps `delete`
 *   because it is the write that takes a row out of the register's working set.
 * - **Its own `getLockedRetiredItem`, not `getLockedItem`.** `getLockedItem`
 *   filters `isNull(deletedAt)` — it treats a retired row as non-existent by
 *   design — so reusing it would make this procedure unable to find its own
 *   subject. The mirror predicate is `isNotNull`, and the two functions sit side
 *   by side in `inventory-database.ts` so the difference is one line to read rather
 *   than an optional argument somebody could set the wrong way round.
 *
 * ## Why a restore takes no reason
 *
 * **A decision, and the argument is that the record already holds it.**
 *
 * `deleteItem` requires no reason either, and the symmetry is the point: this
 * write is "put the row back where it was", and the two ledger rows it now sits
 * between — `action = "deleted"` written by the retirement, and this one — say who
 * did each, when, and (in this file's `meta`) how long the row was out. The
 * `inventory_audit_log` pair carries the full before/after snapshots, so the
 * retired interval is reconstructible without anybody having typed a word about
 * it.
 *
 * The alternative was considered and rejected: a required free-text reason on a
 * write whose entire effect is to clear a nullable timestamp would be a field
 * whose value is "restored" on every single invocation. A field that is always the
 * same string is a field nobody reads, and it is worse than absent because it
 * makes the form look as though the operation needed justifying when it did not.
 * Where somebody *does* have a reason ("the audit asked for it back"), it belongs
 * in the change log and the note the operator can type there — not in a field this
 * procedure would have to police.
 *
 * ## The `CONFLICT` below is, today, unreachable — and is still here
 *
 * `inventory_item_sku_unique` is a **plain** unique index over `sku`, so it
 * covers soft-deleted rows too, and `resolveAvailableSku`'s candidate probe in
 * `create-item.ts` filters on nothing at all — it looks at every row, retired ones
 * included. A live item therefore cannot be holding a retired item's SKU while
 * the retired row exists, which means the check is defensive rather than
 * reachable today.
 *
 * It is written anyway, for the same reason every other race guard in this feature
 * is written: the restore is the one write that turns a soft-deleted row back into
 * a working-register row, so it is the one place where a change to the SKU
 * invariant would first show up as **two live lines with the same code** — and a
 * register that shows two `INV-00042` rows is a register nobody can reconcile.
 * If `inventory_item_sku_unique` ever becomes partial on `deleted_at IS NULL`, or
 * a bulk-import path starts writing SKUs around the index, this refuses with a
 * sentence naming the row in the way instead of surfacing a raw `23505` — or, worse,
 * succeeding and leaving a duplicate.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryItem,
  inventoryItemIdSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { and, eq, isNull } from "drizzle-orm";
import * as v from "valibot";

import { requireInventoryPermission } from "../../index";
import type { InventoryItemRow } from "./inventory-database";
import {
  countersOf,
  getInventoryActor,
  getLockedRetiredItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  itemViewJoins,
  iso,
  isoOrNull,
  toItemView,
} from "./inventory-database";

/**
 * The audit snapshot of a row — see the identical helper in `delete-item.ts` and
 * `update-item.ts`. `jsonb` cannot be trusted with a `Date`, and these three
 * columns are the only ones on the row that carry one.
 *
 * It is duplicated rather than exported from `delete-item.ts` for the same reason
 * those three files each carry it: the helper is five lines, its name says what it
 * is, and a fourth copy of it cannot drift from the first three because there is
 * nothing in it to drift. The alternative — one exported `toAuditSnapshot` — would
 * have every item write in the feature import from whichever of the three a reader
 * happened to find first.
 */
const toAuditSnapshot = (row: InventoryItemRow): Record<string, unknown> => ({
  ...row,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  deletedAt: isoOrNull(row.deletedAt),
});

/**
 * Restore a retired item to the working register.
 *
 * `getLockedRetiredItem` is the only place the subject is read, and it refuses an
 * id that names a *live* item with a message that says so — because the honest
 * answer to "restore this" on a row that is already on the register is not "nothing
 * happened" but "it was never retired". The two states are the same `UPDATE` and
 * they are told apart here, before the write, where the sentence can be aimed at
 * the person who clicked.
 */
export const restoreItem = requireInventoryPermission("update")
  .input(v.object({ itemId: inventoryItemIdSchema }))
  .handler(({ input, context }) =>
    context.db.transaction(async (tx) => {
      // Two independent reads — who is acting, and the retired row under a lock.
      // The lock is what makes this the exact inverse of `deleteItem`: the two
      // procedures take the same row in the same way, so a retirement and a
      // restore racing each other resolve to one of the two, never to a row that
      // is both stamped and unstamped in some order nobody chose.
      const [actor, existing] = await Promise.all([
        getInventoryActor(context),
        getLockedRetiredItem(tx, input.itemId),
      ]);

      /**
       * The SKU guard. See the module comment for why it cannot fire today — the
       * unique index spans retired rows, so the SKU is still held by the row being
       * restored and by nothing else.
       *
       * The predicate is `isNull(deletedAt)` on the *other* row, so the restore
       * target is excluded by its own `deletedAt` being non-null and this can only
       * ever match a second, live item. Written as a positive lookup rather than as
       * a count so the refusal can name the other row, which is the fact the
       * caller needs: "this code is on the register" is a question about a specific
       * line, and a count of zero-versus-one is not a sentence.
       */
      const [skuHolder] = await tx
        .select({ id: inventoryItem.id, name: inventoryItem.name })
        .from(inventoryItem)
        .where(
          and(
            eq(inventoryItem.sku, existing.sku),
            isNull(inventoryItem.deletedAt)
          )
        )
        .limit(1);

      if (skuHolder) {
        throw new ORPCError("CONFLICT", {
          message: `"${existing.sku}" is now on the register as "${skuHolder.name}", so this retired line cannot come back under the same code — restore it under a different SKU, or retire ${skuHolder.name} first`,
        });
      }

      const [restored] = await tx
        .update(inventoryItem)
        .set({ deletedAt: null })
        .where(eq(inventoryItem.id, existing.id))
        .returning();

      if (!restored) {
        throw new ORPCError("NOT_FOUND", {
          message:
            "No retired item with this id — it may already be back on the register",
        });
      }

      /**
       * The counter ledger row, and the two things about it that are decisions.
       *
       * **`action: "edited"`, not a new verb.** `inventory_transaction.action` is
       * held to `INVENTORY_TRANSACTION_ACTIONS` by
       * `inventory_transaction_action_check`, and that vocabulary is
       * `packages/db`'s to change — not this router's. Of the seventeen existing
       * values, `edited` is the one that is *true* here: the item record changed and
       * no counter moved. `deleted` would be a lie (nothing was deleted just now),
       * `created` would be a lie (the row is older than this call), and
       * `stock_in` / `stock_out` would be a lie about a movement. The label
       * `INVENTORY_ACTION_LABELS` renders for it is "Item edited", and the `note`
       * below — which is the sentence the ledger row is read for — says what the
       * edit was.
       *
       * **Identical `before` and `after` counters**, for the same reason
       * `createDisposal`'s proposal row has them: nothing about the stock moved, and
       * a reader who sums the deltas of this feed gets the store's real movements.
       * A row claiming `qty` changed when it did not would make that sum wrong.
       *
       * `previouslyDeletedAt` is in `meta` rather than in the note because it is
       * the one fact about a restore that is not recoverable from anywhere else:
       * `deleted_at` is null on both the row before and the row after, so the
       * duration this line spent off the register is gone from the table and would
       * be gone from the audit log's `before` snapshot only as a string.
       */
      await insertInventoryTransaction(tx, {
        actor,
        action: "edited",
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(restored),
        note: `Restored to the working register (retired ${isoOrNull(existing.deletedAt) ?? "at an unrecorded time"})`,
        meta: {
          restored: true,
          previouslyDeletedAt: isoOrNull(existing.deletedAt),
        },
      });

      /**
       * The audit row, and it is the *substantive* half of this write. Unlike the
       * counter ledger, `inventory_audit_log.action` is free text — the schema says
       * so explicitly — so this is where the verb the feature actually wants lives:
       * `item.restore` beside `item.delete`, and the `before` / `after` pair
       * carries the whole of the change (`deleted_at` set, then null) with the
       * retired timestamp intact on the `before` side.
       *
       * So the exact sequence an auditor asks about — who retired this, when, who
       * put it back, and what was on the row in between — is answerable from the
       * log alone, and does not depend on the counter ledger's action vocabulary
       * having a word for it.
       */
      await insertInventoryAuditLog(tx, {
        actor,
        action: "item.restore",
        entityType: "inventory_item",
        entityId: existing.id,
        before: toAuditSnapshot(existing),
        after: toAuditSnapshot(restored),
      });

      /**
       * Re-read through the view, exactly as `createItem` and `updateItem` do, so
       * the row the caller gets back is the same shape the register renders. That
       * is what lets the web app write the restored row into the list it is already
       * showing instead of refetching to learn a `categoryName` and a manager's
       * name it did not have.
       *
       * The join cannot miss: `inventoryItem.categoryId` is a `restrict` foreign
       * key, so the category is still there by the time this runs, and a retired
       * row is not filtered by `itemViewJoins` — which is the whole reason the
       * list has to pass `includeDeleted` to see this item a moment ago.
       */
      const [viewRow] = await itemViewJoins(tx)
        .where(eq(inventoryItem.id, existing.id))
        .limit(1);

      if (!viewRow) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The restored item could not be read back",
        });
      }

      return {
        ...toItemView(viewRow),
        /** When it was retired, for the toast — the item view's own `deletedAt` is
         *  already `null` by now, so the only place that fact survives is here. */
        wasRetiredAt: isoOrNull(existing.deletedAt),
      };
    })
  );
