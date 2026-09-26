/**
 * Receiving new stock into the store.
 *
 * This is the **only** procedure in the inventory that invents asset tags.
 * Everything else that touches a unit — borrowing, issuing, disposal
 * finalisation, a manual status edit — acts on a tag that already exists, so if
 * a unit row can be created anywhere it should be created here, inside one
 * transaction that also moves the item's `qty` by the same amount. A tag that
 * exists without a matching increment, or an increment without tags, is the
 * whole way an asset register starts lying.
 */
import { ORPCError } from "@orpc/server";
import {
  itemConditionSchema,
  normalizeInventoryKey,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryItem,
  inventoryItemIdSchema,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import { eq, inArray } from "drizzle-orm";
import * as v from "valibot";

import { requireInventoryPermission } from "../../index";
import type { Executor } from "./inventory-database";
import {
  countersOf,
  getInventoryActor,
  getLockedItem,
  insertInventoryAuditLog,
  insertInventoryTransaction,
} from "./inventory-database";

/**
 * Upper bound on one delivery, and it exists for a reason a school can feel: a
 * paste of two thousand asset tags into one dialog is a spreadsheet export
 * being used as an import, and it will be wrong somewhere. The store receives
 * stock in batches.
 */
const MAX_STOCK_IN_QTY = 1000;

/** One supplied tag, in both the form the register shows and the form it keys on. */
interface RequestedTag {
  uniqueNo: string;
  normalizedUniqueNo: string;
}

/**
 * Trim and whitespace-collapse a tag for display, and lower-case it for the
 * key. Two columns, because the two jobs are different: the register prints
 * `LT-0042` exactly as the school wrote it on the label, while the unique index
 * is written against `lt-0042` so a retyped tag cannot become a second device.
 */
const toRequestedTag = (raw: string): RequestedTag => {
  const uniqueNo = raw.trim().replaceAll(/\s+/gu, " ");
  return { uniqueNo, normalizedUniqueNo: normalizeInventoryKey(raw) };
};

/**
 * The tags a stock-in actually creates.
 *
 * The count is checked against `qty` **twice**, and the second check is the
 * one that matters. `input.uniqueIds.length` is what the caller typed; what
 * gets stored is what survived `normalizeInventoryKey` and the blank filter. A
 * request for five units whose sixth entry is `"   "` has five tags, not six,
 * and receiving five units while claiming six — or claiming five and creating
 * four — is precisely the disagreement this procedure exists to refuse. The
 * intra-request duplicate check is here rather than left to the
 * `inventory_unit_normalized_unique_no_unique` index for the same reason
 * `getAvailableUnits` does its own: the usual cause is one tag pasted into two
 * fields, and the user is told that rather than shown a constraint violation.
 */
const resolveRequestedTags = (
  rawTags: string[],
  qty: number
): RequestedTag[] => {
  if (rawTags.length !== qty) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Supply exactly ${qty} asset tag(s) for the ${qty} unit(s) being received`,
    });
  }

  const tags: RequestedTag[] = [];
  for (const raw of rawTags) {
    const tag = toRequestedTag(raw);
    if (tag.normalizedUniqueNo.length > 0) {
      tags.push(tag);
    }
  }

  if (tags.length !== qty) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Supply exactly ${qty} asset tag(s) for the ${qty} unit(s) being received — blank tags are not counted`,
    });
  }

  const keys = tags.map((tag) => tag.normalizedUniqueNo);
  if (new Set(keys).size !== keys.length) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The same asset tag was supplied more than once",
    });
  }

  return tags;
};

/**
 * A tag already on file, anywhere in the store.
 *
 * The `inventory_unit_normalized_unique_no_unique` index is global on purpose —
 * an asset tag that is only unique inside one item cannot be found with one
 * lookup, and a printer tagged "LT-0042" in the lab and "LT-0042" in IT is two
 * physical devices sharing one label. Probing it first turns a rare index
 * violation into a message that names the tag, which is the only useful thing
 * to tell a storekeeper who has just delivered a tray of new equipment.
 */
const assertTagsNotAlreadyRegistered = async (
  tx: Executor,
  tags: RequestedTag[]
): Promise<void> => {
  const [taken] = await tx
    .select({ normalizedUniqueNo: inventoryUnit.normalizedUniqueNo })
    .from(inventoryUnit)
    .where(
      inArray(
        inventoryUnit.normalizedUniqueNo,
        tags.map((tag) => tag.normalizedUniqueNo)
      )
    )
    .limit(1);

  if (taken) {
    throw new ORPCError("CONFLICT", {
      message: `Asset tag ${taken.normalizedUniqueNo} is already on file — check the label against the register before receiving it again`,
    });
  }
};

export const stockIn = requireInventoryPermission("create")
  .input(
    v.object({
      itemId: inventoryItemIdSchema,
      qty: v.pipe(
        v.number(),
        v.integer(),
        v.minValue(1),
        v.maxValue(MAX_STOCK_IN_QTY)
      ),
      /**
       * The item's own condition, when omitted. **A mixed delivery is two
       * stock-ins, not one stock-in with a lie in it.** The item row carries a
       * single `condition`, so receiving forty chairs when ten are cracked
       * either brands all forty as cracked or all forty as sound, and the
       * store's condition column stops meaning anything. Batches with
       * different conditions are separate deliveries, and the UI should say so.
       */
      condition: v.optional(itemConditionSchema),
      /** The item's own location when omitted, for the same reason. */
      location: v.optional(v.string()),
      /**
       * Exactly `qty` asset tags. Required rather than optional because this
       * procedure is the only place a tag is minted, and a tracked unit with
       * an invented tag is a device nobody can find.
       */
      uniqueIds: v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
      supplier: v.optional(v.string()),
      purchaseDate: v.optional(v.string()),
      invoiceNo: v.optional(v.string()),
      note: v.optional(v.string()),
    })
  )
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);
    const tags = resolveRequestedTags(input.uniqueIds, input.qty);

    return context.db.transaction(async (tx) => {
      // `FOR UPDATE` on the item, so two deliveries landing at the same moment
      // both increment from the same `qty` instead of one overwriting the other.
      const existing = await getLockedItem(tx, input.itemId);

      await assertTagsNotAlreadyRegistered(tx, tags);

      const condition = input.condition ?? existing.condition;
      const location = input.location ?? existing.location;

      // One `values([...])`, never a loop: a two-hundred-tag delivery is two
      // hundred round trips otherwise, and the transaction holds the item lock
      // for the whole of it.
      const created = tags.map((tag) => ({
        id: crypto.randomUUID(),
        itemId: existing.id,
        uniqueNo: tag.uniqueNo,
        normalizedUniqueNo: tag.normalizedUniqueNo,
        // Always available. Nothing is borrowed, issued or disposed by the act
        // of arriving, and a unit created in any other state would be one the
        // ledger has no movement row for.
        status: "available",
        condition,
        location,
        // Money is inherited per-unit rather than invented: the item's
        // valuation is the only figure on file, and a fresh tag with a null
        // value is honest where a guessed one is not.
        purchaseValue: existing.purchaseValue,
        currentValue: existing.currentValue,
      }));

      await tx.insert(inventoryUnit).values(created);

      const newQty = existing.qty + input.qty;
      const [updated] = await tx
        .update(inventoryItem)
        .set({ qty: newQty })
        .where(eq(inventoryItem.id, existing.id))
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "Item not found" });
      }

      /**
       * `borrowedQty` is deliberately absent from the `set`. Receiving stock and
       * lending stock are two different facts about two different subjects —
       * what is on the shelf, and what is out on loan — and they are counted
       * separately on purpose so a storekeeper can answer "what have we got?"
       * and "what has Mr Perera got?" without subtracting one from the other.
       * Touching `borrowedQty` here would quietly forgive a loan.
       */
      await insertInventoryTransaction(tx, {
        actor,
        action: "stock_in",
        item: { id: existing.id, name: existing.name, sku: existing.sku },
        before: countersOf(existing),
        after: countersOf(updated),
        note: `Received ${input.qty} unit(s)`,
        meta: {
          supplier: input.supplier ?? null,
          purchaseDate: input.purchaseDate ?? null,
          invoiceNo: input.invoiceNo ?? null,
          note: input.note ?? null,
          uniqueIds: tags.map((tag) => tag.uniqueNo),
        },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "item.stock_in",
        entityType: "inventory_item",
        entityId: existing.id,
        before: { qty: existing.qty, borrowedQty: existing.borrowedQty },
        after: { qty: updated.qty, borrowedQty: updated.borrowedQty },
      });

      return {
        itemId: existing.id,
        qty: updated.qty,
        added: input.qty,
        // The tags the register now holds, so the UI can show the clerk exactly
        // which labels were created rather than a count they have to trust.
        units: created.map((unit) => ({
          id: unit.id,
          uniqueNo: unit.uniqueNo,
        })),
      };
    });
  });
