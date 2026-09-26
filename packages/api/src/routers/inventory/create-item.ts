/**
 * Registering a new line in the store.
 *
 * This is the only procedure in the inventory feature that writes more than one
 * table for one user action, and that is because the three things it writes —
 * the item, its custody trail and its tagged units — are not three optional
 * extras but one fact each: an item with a count of 4 and three unit rows is a
 * record the store cannot reconcile, and an item whose first custodian left no
 * trail row has a history that starts one change late. They belong in one
 * transaction so a failure cannot leave any of them behind.
 */
import { ORPCError } from "@orpc/server";
import { normalizeInventoryKey } from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryCustodyHistory,
  inventoryItem,
  inventoryItemInsertSchema,
  inventoryUnit,
} from "@school-student-teacher-management/db/schema/inventory";
import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { eq, inArray } from "drizzle-orm";
import * as v from "valibot";

import { requireInventoryPermission } from "../../index";
import { generateSku, normalizeLabel } from "./inventory-calculations";
import type { Executor, InventoryItemRow } from "./inventory-database";
import {
  assertCategoryExists,
  assertStaffIsAssignable,
  countersOf,
  getInventoryActor,
  insertInventoryAuditLog,
  insertInventoryTransaction,
  iso,
  isoOrNull,
  itemViewJoins,
  toItemView,
} from "./inventory-database";

/** The shape `inventory_item_sku_format` enforces, written out for the message. */
const INV_SKU_RE = /^INV-\d{5}$/u;

/**
 * How many candidates are rolled and probed in one go when the caller does not
 * type a SKU. Ten is the same order as `generateSku`'s own retry budget, so the
 * batch covers the same space its internal loop would have.
 */
const SKU_CANDIDATE_BATCH = 10;

/**
 * An asset tag: the number the school wrote on the device itself.
 *
 * This is the identifier a teacher will actually type, which is why it — and not
 * the row's primary key — is the primary way tagged units are selected
 * everywhere in this feature: the borrow, issue and disposal procedures all
 * accept either, and `getAvailableUnits` resolves a tag to a row for the caller.
 * A tag is trimmed and whitespace-collapsed before it is stored, so the string
 * that ends up in `normalizedUniqueNo` is the same one the global unique index
 * is written against, and a blank one is refused here rather than becoming a
 * row that matches every other blank tag.
 */
const itemUniqueNoSchema = v.pipe(
  v.string(),
  v.maxLength(64),
  v.transform(normalizeLabel),
  v.minLength(1, "Asset tag cannot be blank")
);

/**
 * A hand-typed SKU, normalised before it is checked.
 *
 * `inventory_item_sku_format` and `inventory_item_sku_upper` are two CHECKs on
 * one column, and without this a storekeeper typing `inv-00042` would get a
 * constraint violation naming a constraint. Uppercasing first is what makes the
 * second CHECK unreachable rather than merely unlikely, and it is also what the
 * store's existing `INV-#####` spreadsheets assume.
 */
const skuInputSchema = v.pipe(
  v.string(),
  v.maxLength(20),
  v.transform((value) => value.trim().toUpperCase()),
  v.regex(INV_SKU_RE, "A SKU must look like INV-12345")
);

/**
 * A SKU that is free right now.
 *
 * `generateSku`'s `exists` probe is typed `(candidate: string) => boolean`, and
 * that is the whole reason this exists as a separate function: the probe is
 * **synchronous**, so it cannot await a database round trip, and a probe that
 * answered "I don't know" would silently defeat the collision check it is there
 * to perform. So the same ten candidates are rolled up front and probed in a
 * single `inArray` query — one round trip, the same ten rolls the internal loop
 * would have considered, and an exact answer for each. The tenth is returned
 * even if every candidate is taken, because at that point the unique index is
 * the authority and `insertItem` below converts its violation into guidance.
 */
const resolveAvailableSku = async (db: Executor): Promise<string> => {
  const candidates = Array.from({ length: SKU_CANDIDATE_BATCH }, () =>
    generateSku()
  );

  const taken = await db
    .select({ sku: inventoryItem.sku })
    .from(inventoryItem)
    .where(inArray(inventoryItem.sku, candidates));

  const takenSkus = new Set(taken.map((record) => record.sku));
  return (
    candidates.find((candidate) => !takenSkus.has(candidate)) ?? generateSku()
  );
};

/**
 * The audit snapshot of a row.
 *
 * `inventory_audit_log.before` / `.after` are `jsonb`, and a drizzle row carries
 * three `Date` columns that would be serialised by whatever the driver's
 * encoder happens to do with them. Flattening them to ISO here is what keeps the
 * house rule — every value this API writes is JSON-safe — a fact about the write
 * path rather than a hope about the driver.
 */
const toAuditSnapshot = (row: InventoryItemRow): Record<string, unknown> => ({
  ...row,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  deletedAt: isoOrNull(row.deletedAt),
});

/** One asset tag as the request wrote it and as the unique index will see it. */
interface AssetTag {
  tag: string;
  key: string;
}

/**
 * Normalise the request's tags, and refuse the two ways a tag list can be wrong.
 *
 * The duplicate check is a request-level guard, not a database one: the global
 * unique index would reject the second row, but only after the caller had been
 * told its list was fine. More usefully, two identical entries are almost always
 * one pasted into two boxes, and the user deserves to be told that rather than
 * shown a constraint name. The count check is the other one — see the module
 * comment on why the tag count and `qty` have to agree.
 */
const resolveAssetTags = (uniqueIds: string[], qty: number): AssetTag[] => {
  const tags = uniqueIds.map((tag) => ({
    tag,
    key: normalizeInventoryKey(tag),
  }));
  const keys = tags.map((entry) => entry.key);

  if (new Set(keys).size !== keys.length) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The same asset tag was supplied more than once",
    });
  }

  if (keys.length > 0 && keys.length !== qty) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Enter one asset tag for each of the ${qty} unit(s), or clear the tags to record a counted bulk quantity`,
    });
  }

  return tags;
};

/**
 * No tag may already exist anywhere in the register.
 *
 * The unique index on `normalized_unique_no` is **global across every item**,
 * and that is the point: an asset tag that is only unique inside its own
 * category is meaningless, because the tag is how a device is found — one lookup,
 * not a scan of every category. So the collision is settled here, at creation,
 * rather than discovered by whoever next tries to register the same device. One
 * query for the whole list, because a 200-tag line is a realistic thing to type.
 */
const assertTagsNotOnFile = async (
  db: Executor,
  keys: string[]
): Promise<void> => {
  if (keys.length === 0) {
    return;
  }

  const [clash] = await db
    .select({ uniqueNo: inventoryUnit.uniqueNo })
    .from(inventoryUnit)
    .where(inArray(inventoryUnit.normalizedUniqueNo, keys))
    .limit(1);

  if (clash) {
    throw new ORPCError("CONFLICT", {
      message: `Asset tag ${clash.uniqueNo} is already on file — check the label and use the tag as written on the device`,
    });
  }
};

/**
 * `inventory_item_name_not_blank` tests the *trimmed* name, and the generated
 * schema only tests `minLength(1)` — a name of three spaces passes validation
 * and is refused by the database. Normalising first is also what keeps
 * " Projector " and "Projector" from being two items in the register.
 */
const resolveItemName = (raw: string): string => {
  const name = normalizeLabel(raw);
  if (!name) {
    throw new ORPCError("BAD_REQUEST", { message: "Give the item a name" });
  }

  return name;
};

/**
 * The item insert, with the unique-index violation translated.
 *
 * This is the second of the two defences against a duplicate SKU, and the one
 * that is actually race-free. The batched probe in `resolveAvailableSku` cannot
 * see a transaction that committed between its query and this insert, and a
 * storekeeper who *typed* a SKU is far more likely to pick one somebody else
 * already has than to collide by chance at random. Surfacing the constraint name
 * would put `inventory_item_sku_unique` in front of a user; asking for a
 * different SKU is what they can do about it.
 */
const insertItem = async (
  db: Executor,
  values: typeof inventoryItem.$inferInsert
): Promise<InventoryItemRow> => {
  let created: InventoryItemRow | undefined;

  try {
    [created] = await db.insert(inventoryItem).values(values).returning();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("inventory_item_sku_unique")
    ) {
      throw new ORPCError("CONFLICT", {
        message: `SKU ${values.sku} is already in use — enter a different one`,
      });
    }

    throw error;
  }

  if (!created) {
    throw new ORPCError("INTERNAL_SERVER_ERROR");
  }

  return created;
};

/**
 * The very first assignment is on the record rather than a gap in it.
 *
 * `inventoryCustodyHistory` is the trail that answers "who has had this, and
 * since when", and a trail that begins at the *second* change cannot answer it
 * for the first holder. Two rows rather than one when both columns are supplied
 * is forced by the schema: `changeType` names one kind of change, and a
 * `manager_assigned` row carrying a custodian would fail
 * `inventory_custody_history_manager_columns`. This is also the only place in the
 * feature where the two changes share a transaction — afterwards custody moves
 * only through `takeItem` / `transferCustody` / `releaseCustody` and the manager
 * only through `assignManager`, each writing its own trail row and its own ledger
 * action. `reason` is null on both rows, which
 * `inventory_custody_history_reason_required` allows precisely for a first
 * assignment onto an empty slot.
 */
const buildInitialCustodyRows = (
  itemId: string,
  managerStaffId: string | null,
  custodianStaffId: string | null,
  changedByStaffId: string | null
): (typeof inventoryCustodyHistory.$inferInsert)[] => {
  const rows: (typeof inventoryCustodyHistory.$inferInsert)[] = [];

  if (managerStaffId) {
    rows.push({
      id: crypto.randomUUID(),
      itemId,
      previousCustodianStaffId: null,
      newCustodianStaffId: null,
      previousManagerStaffId: null,
      newManagerStaffId: managerStaffId,
      changeType: "manager_assigned",
      reason: null,
      note: null,
      changedByStaffId,
    });
  }

  if (custodianStaffId) {
    rows.push({
      id: crypto.randomUUID(),
      itemId,
      previousCustodianStaffId: null,
      newCustodianStaffId: custodianStaffId,
      previousManagerStaffId: null,
      newManagerStaffId: null,
      changeType: "custody_taken",
      reason: null,
      note: null,
      changedByStaffId,
    });
  }

  return rows;
};

/**
 * One row per asset tag, in a single statement.
 *
 * A two-hundred-tag line is a real thing to type — a school issuing a set of
 * tablets or chairs — and a loop would make it two hundred round trips inside a
 * transaction that is holding locks. Condition, location and money are inherited
 * from the item: a tagged unit is the same thing as its line until a movement
 * says otherwise, and copying four fields at creation is cheaper than having the
 * first borrow discover they were blank.
 *
 * The `normalized_unique_no` violation is translated for the same reason the SKU
 * one is: `assertTagsNotOnFile` cannot see a row committed between its query and
 * this insert, and a double-submitted form is not even a race — it is the second
 * request reaching the database microseconds after the first. A multi-row insert
 * does not say *which* tag collided, so the message points at the tags rather
 * than inventing one.
 */
const insertUnits = async (
  db: Executor,
  tags: AssetTag[],
  values: {
    itemId: string;
    condition: string;
    location: string;
    purchaseValue: string | null;
    currentValue: string | null;
  }
): Promise<void> => {
  if (tags.length === 0) {
    return;
  }

  try {
    await db.insert(inventoryUnit).values(
      tags.map((entry) => ({
        id: crypto.randomUUID(),
        itemId: values.itemId,
        uniqueNo: entry.tag,
        normalizedUniqueNo: entry.key,
        status: "available" as const,
        condition: values.condition,
        location: values.location,
        purchaseValue: values.purchaseValue,
        currentValue: values.currentValue,
      }))
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("inventory_unit_normalized_unique_no_unique")
    ) {
      throw new ORPCError("CONFLICT", {
        message:
          "One of those asset tags was registered a moment ago — reload the item and check the tags against the labels",
      });
    }

    throw error;
  }
};

/**
 * Create an item, its tagged units, and the first row of its custody trail.
 *
 * **The count and the tags must agree.** `qty` is required and `uniqueIds` may
 * be empty, but the moment the caller supplies even one tag the number of tags
 * has to equal `qty`. A row of N tagged units and a counter of N are one fact
 * seen from two directions, and a store that disagrees with itself is the thing
 * this whole feature exists to prevent: the counter is what every list, badge
 * and low-stock warning reads, and the unit rows are what every borrow and
 * disposal actually moves. If they are allowed to start out unequal there is no
 * point at which the discrepancy is visible — the ledger would be born wrong. An
 * empty tag list is still legitimate: a bulk line ("200 chairs") is counted, not
 * tagged, and only a tagged item has unit rows.
 *
 * Note what is *not* checked here: `minQty` may exceed `qty` at creation
 * without complaint, because a store registering a line it is already short of
 * is a real state, and the low-stock filter exists precisely to surface it.
 * `updateItem` refuses to *set* a threshold above the on-hand count, which is a
 * different question — changing a warning line on an established record is a
 * decision about the future, not a record of the past. The database permits
 * both; its only CHECK is `min_qty >= 0`.
 */
export const createItem = requireInventoryPermission("create")
  .input(
    v.object({
      ...v.pick(inventoryItemInsertSchema, [
        "categoryId",
        "name",
        "description",
        "unit",
        "minQty",
        "condition",
        "borrowable",
        "location",
        "purchaseValue",
        "currentValue",
      ]).entries,
      /** Absent means "generate one for me" — see `resolveAvailableSku`. */
      sku: v.optional(skuInputSchema),
      /**
       * The counted quantity on hand. Required, unlike the source app: it is
       * what the tag list is checked against, and an item created with no count
       * has nothing for the ledger's `after` column to record.
       */
      qty: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000)),
      /** Both are plain fields here. On an update they are not — see `updateItem`. */
      managerStaffId: v.optional(v.nullable(staffIdSchema)),
      custodianStaffId: v.optional(v.nullable(staffIdSchema)),
      uniqueIds: v.array(itemUniqueNoSchema),
    })
  )
  .handler(({ input, context }) =>
    context.db.transaction(async (tx) => {
      const actor = await getInventoryActor(context);
      const itemId = crypto.randomUUID();

      // A person who could never be assigned custody must not be assignable on
      // day zero either, or the item sits in the register with a holder no later
      // procedure would ever have allowed. Three independent reads, so they are
      // issued together rather than as a waterfall of round trips.
      await Promise.all([
        assertCategoryExists(tx, input.categoryId),
        ...(input.managerStaffId
          ? [
              assertStaffIsAssignable(
                tx,
                input.managerStaffId,
                "staff member in charge of the item"
              ),
            ]
          : []),
        ...(input.custodianStaffId
          ? [
              assertStaffIsAssignable(
                tx,
                input.custodianStaffId,
                "staff member holding the item"
              ),
            ]
          : []),
      ]);

      const tags = resolveAssetTags(input.uniqueIds, input.qty);
      await assertTagsNotOnFile(
        tx,
        tags.map((entry) => entry.key)
      );

      const name = resolveItemName(input.name);
      const sku = input.sku ?? (await resolveAvailableSku(tx));
      const condition = input.condition ?? "Good";
      const location = input.location ?? "";
      const purchaseValue = input.purchaseValue ?? null;
      const currentValue = input.currentValue ?? null;
      const managerStaffId = input.managerStaffId ?? null;
      const custodianStaffId = input.custodianStaffId ?? null;

      const created = await insertItem(tx, {
        id: itemId,
        sku,
        categoryId: input.categoryId,
        name,
        description: input.description ?? "",
        unit: input.unit ?? "unit",
        minQty: input.minQty ?? 0,
        qty: input.qty,
        borrowedQty: 0,
        borrowable: input.borrowable ?? false,
        condition,
        location,
        purchaseValue,
        currentValue,
        createdByStaffId: actor.staffId,
        managerStaffId,
        custodianStaffId,
      });

      const custodyRows = buildInitialCustodyRows(
        itemId,
        managerStaffId,
        custodianStaffId,
        actor.staffId
      );
      if (custodyRows.length > 0) {
        await tx.insert(inventoryCustodyHistory).values(custodyRows);
      }

      // One statement, not a loop — see `insertUnits`.
      await insertUnits(tx, tags, {
        itemId,
        condition,
        location,
        purchaseValue,
        currentValue,
      });

      await insertInventoryTransaction(tx, {
        actor,
        action: "created",
        item: { id: itemId, name: created.name, sku: created.sku },
        before: { qty: 0, borrowedQty: 0 },
        after: countersOf(created),
        note: "Item created",
        meta: { uniqueIds: tags.map((entry) => entry.tag) },
      });

      await insertInventoryAuditLog(tx, {
        actor,
        action: "item.create",
        entityType: "inventory_item",
        entityId: itemId,
        before: null,
        after: toAuditSnapshot(created),
      });

      // Re-read through the view rather than assembling the view from `created`
      // by hand. `itemViewJoins` is typed to consume a *joined* row, so a bare
      // `inventory_item` row is deliberately not assignable to it — that is the
      // type-level statement that the category name, both staff names and the
      // two unit counts cannot be derived from the row alone, and hand-mapping
      // around the check would be how this shape starts drifting from the list's.
      const [viewRow] = await itemViewJoins(tx)
        .where(eq(inventoryItem.id, itemId))
        .limit(1);

      if (!viewRow) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      return toItemView(viewRow);
    })
  );
