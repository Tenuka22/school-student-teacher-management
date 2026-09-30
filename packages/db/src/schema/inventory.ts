import { sql } from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-valibot";
import * as v from "valibot";

import {
  CUSTODY_CHANGE_TYPES,
  CUSTODY_NOTICE_RECIPIENT_ROLES,
  DISPOSAL_FINAL_STATUSES,
  DISPOSAL_METHODS,
  DISPOSAL_STATUSES,
  INVENTORY_CATEGORY_ICON_KEYS,
  INVENTORY_TRANSACTION_ACTIONS,
  INVENTORY_TRANSFER_REASON_KEYS,
  ITEM_CONDITIONS,
  UNIT_STATUSES,
  custodyChangeTypeSchema,
  custodyNoticeRecipientRoleSchema,
  disposalMethodSchema,
  disposalStatusSchema,
  inventoryActionSchema,
  inventoryCategoryIconSchema,
  inventoryTransferReasonSchema,
  itemConditionSchema,
  unitStatusSchema,
} from "../constants/inventory";
import { brand } from "./brand";
import type { Brand } from "./brand";
import { fileIdSchema, files } from "./files";
import { isoDateSchema, optionalNullable, slPhoneSchema } from "./primitives";
import { staff } from "./staff";

/**
 * Every "who did this / who holds this / who manages this" column in this
 * module points at `staff.id` — the person on the school roll — because the
 * register is accountable for people rather than for logins: a storekeeper who
 * leaves must still be findable by name when the equipment they issued comes
 * up missing. `delete-staff.ts` probes every column below before it deletes
 * anybody, and it deletes the linked `user` row in the same transaction, so a
 * login never outlives the person it belongs to.
 *
 * Unbranded, matching `staff.ts`'s own treatment of its `userId` column —
 * this module collects these ids from a picker, and the check that decides
 * whether one names a real, employed person lives in `assertStaffIsAssignable`
 * where it can produce a message, not in a brand that would only make the
 * type system assume it.
 */
export const staffRefSchema = v.pipe(v.string(), v.minLength(1));

// ─── House rule for closed sets ──────────────────────────────────────────────

/**
 * Every closed set in this module is enforced **twice**, and both halves read
 * the same list out of `constants/inventory.ts`:
 *
 * 1. at the type layer, as a `v.picklist` refined onto the column (so a form
 *    and an oRPC input cannot offer a value the column refuses), and
 * 2. at the database layer, as a `check (...)` built from the same constant
 *    through the `sqlIn` helper below.
 *
 * Importing the lists from one place is what makes the two halves unable to
 * drift: adding a value to `UNIT_STATUSES` without a migration is impossible,
 * because the CHECK names the values, and a hand-inlined list in a CHECK that
 * no longer matches the picklist is exactly the bug this rule exists to prevent.
 * A column that is *not* a closed set (`inventoryAuditLog.action`,
 * `inventoryCategory.name`, every free-text `reason` that is not the transfer
 * vocabulary) has no CHECK, and says so in its own comment.
 */

// ─── Branded IDs ────────────────────────────────────────────────────────────

export type InventoryCategoryId = Brand<string, "InventoryCategoryId">;
export const inventoryCategoryIdSchema = v.pipe(
  v.string(),
  brand<string, "InventoryCategoryId">()
);

export type InventoryItemId = Brand<string, "InventoryItemId">;
export const inventoryItemIdSchema = v.pipe(
  v.string(),
  brand<string, "InventoryItemId">()
);

export type InventoryUnitId = Brand<string, "InventoryUnitId">;
export const inventoryUnitIdSchema = v.pipe(
  v.string(),
  brand<string, "InventoryUnitId">()
);

export type InventoryIssueId = Brand<string, "InventoryIssueId">;
export const inventoryIssueIdSchema = v.pipe(
  v.string(),
  brand<string, "InventoryIssueId">()
);

export type InventoryItemReplacementId = Brand<
  string,
  "InventoryItemReplacementId"
>;
export const inventoryItemReplacementIdSchema = v.pipe(
  v.string(),
  brand<string, "InventoryItemReplacementId">()
);

export type InventoryDisposalId = Brand<string, "InventoryDisposalId">;
export const inventoryDisposalIdSchema = v.pipe(
  v.string(),
  brand<string, "InventoryDisposalId">()
);

export type InventoryDisposalStatusHistoryId = Brand<
  string,
  "InventoryDisposalStatusHistoryId"
>;
export const inventoryDisposalStatusHistoryIdSchema = v.pipe(
  v.string(),
  brand<string, "InventoryDisposalStatusHistoryId">()
);

export type InventoryCustodyHistoryId = Brand<
  string,
  "InventoryCustodyHistoryId"
>;
export const inventoryCustodyHistoryIdSchema = v.pipe(
  v.string(),
  brand<string, "InventoryCustodyHistoryId">()
);

export type InventoryCustodyNoticeRecipientId = Brand<
  string,
  "InventoryCustodyNoticeRecipientId"
>;
export const inventoryCustodyNoticeRecipientIdSchema = v.pipe(
  v.string(),
  brand<string, "InventoryCustodyNoticeRecipientId">()
);

export type InventoryTransactionId = Brand<string, "InventoryTransactionId">;
export const inventoryTransactionIdSchema = v.pipe(
  v.string(),
  brand<string, "InventoryTransactionId">()
);

export type InventoryAuditLogId = Brand<string, "InventoryAuditLogId">;
export const inventoryAuditLogIdSchema = v.pipe(
  v.string(),
  brand<string, "InventoryAuditLogId">()
);

/**
 * SQL literal list for a CHECK constraint.
 *
 * `sql` parameters would be illegal here — PostgreSQL requires a CHECK
 * expression to be immutable, so a bound `$1` cannot appear in one. The values
 * are compile-time constants from `constants/inventory`, never user input; the
 * quote doubling below is belt-and-braces for the day that stops being true.
 */
const sqlLiteralList = (values: readonly string[]): SQL =>
  sql.join(
    values.map((value) => sql.raw(`'${value.replaceAll("'", "''")}'`)),
    sql`, `
  );

/** SQL boolean expression `column in ('a', 'b', ...)`. */
const sqlIn = (column: SQLWrapper, values: readonly string[]): SQL =>
  sql`${column} in (${sqlLiteralList(values)})`;

/**
 * The nullable sibling of `sqlIn`: `column is null or column in (...)`.
 *
 * Nullable `text` columns that hold a closed-set value need this rather than
 * `sqlIn` alone, because SQL's `null in (...)` is `null` — not `false` — and a
 * CHECK that evaluates to `null` **passes**. Writing `sqlIn` on a nullable
 * column would therefore let every value outside the list through on the
 * strength of being null-adjacent, which is the whole failure the check exists
 * to prevent.
 */
const sqlInOrNull = (column: SQLWrapper, values: readonly string[]): SQL =>
  sql`(${column} is null or ${column} in (${sqlLiteralList(values)}))`;

/**
 * Money, as the string drizzle's `mode: "string"` hands back.
 *
 * `numeric` has no valibot refinement of its own, so without this a generated
 * insert schema accepts `"abc"` and hands the database a string it will reject
 * with a driver error instead of a validation message. The column is
 * `numeric(14,2)`, so the string has to parse to at most 12 integer digits and
 * 2 decimals — the pattern is the column's own precision and scale written out,
 * and a sign is not accepted because every money column here is
 * `>= 0` at the database level.
 *
 * Exported for the API layer: a report total or an Excel export that has to
 * validate a money string it read back out of the database should refine it
 * with this rather than declaring a second, looser pattern.
 */
export const moneyStringSchema = () =>
  v.pipe(v.string(), v.regex(/^\d{1,12}(?:\.\d{1,2})?$/u));

// ─── Categories ─────────────────────────────────────────────────────────────

/**
 * A store category. **Closed**, not free text: the only categories that will
 * ever exist are the ones seeded from `DEFAULT_INVENTORY_CATEGORIES`, and
 * there is deliberately no `createCategory`/`removeCategory` procedure any
 * more. A school that types its own taxonomy ends up with "IT", "I.T" and
 * "Computers" as three unrelated rows within a term; a fixed list with a
 * fixed icon per entry is a register that cannot drift, and "Other" is the
 * honest escape hatch for anything that does not fit the seven named ones.
 * `seedCategories` is now the *only* writer of this table, and it is still
 * safe to re-run — see its own doc comment.
 *
 * `normalizedName` is what the unique index is written against, because
 * "IT Equipment" and "it equipment" are one category to a storekeeper and two
 * rows to a `unique` index. Same reason the source app kept it, and the same
 * reason it must be written with `normalizeInventoryKey`.
 *
 * `icon` is a closed set too (`INVENTORY_CATEGORY_ICON_KEYS`), read by the web
 * app as a Tabler icon component name. It is looked up through
 * `CategoryIcon`'s table in
 * `apps/web/src/components/staff/inventory/category-icon.tsx`, which always has
 * a fallback for a key it does not recognise — an icon rename in a future
 * release degrades to a generic glyph instead of a blank space or a crash.
 */
export const inventoryCategory = pgTable(
  "inventory_category",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** lowercased + whitespace-collapsed `name`; the case-insensitive key */
    normalizedName: text("normalized_name").notNull(),
    color: text("color").notNull().default("#6366F1"),
    /** Tabler icon name; one of `INVENTORY_CATEGORY_ICON_KEYS`. */
    icon: text("icon").notNull().default("category"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("inventory_category_normalized_name_unique").on(
      table.normalizedName
    ),
    check(
      "inventory_category_name_not_blank",
      sql`length(trim(${table.name})) > 0`
    ),
    check(
      "inventory_category_color_hex",
      sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`
    ),
    check(
      "inventory_category_icon_check",
      sqlIn(table.icon, INVENTORY_CATEGORY_ICON_KEYS)
    ),
  ]
);

// ─── Items ──────────────────────────────────────────────────────────────────

/**
 * The central inventory row: one kind of thing ("Projector, 3000 lumen"), with
 * a counted `qty` and optional tagged `inventoryUnit` rows beneath it.
 *
 * `managerStaffId` is the teacher **in charge of** the item and
 * `custodianStaffId` is the teacher who has **physically taken** it. Both are
 * **required**: a line in the register that nobody is answerable for is the
 * defect this feature exists to prevent, so there is no state in which an item
 * has an empty slot in either column — `createItem` demands both, and the three
 * procedures that used to clear a pointer (`releaseCustody`,
 * `reclaimCustody`, `transferOwnership`) now name the person who ends up
 * holding it instead of nobody. Both are plain pointers on the row, exactly
 * like `class.homeroomTeacherId` — the current answer, overwritten in place —
 * and deliberately **not** year-scoped. Equipment is permanent, like `staff`
 * and `student`: a projector bought in 2026 is still the same projector, and
 * still the same custodian's responsibility, in 2027. A year-scoped custody
 * pointer would mean an item silently has no holder every January, and the
 * audit question "who has had this since it was bought" would need a join
 * across a year boundary that the transfer history already answers in order.
 *
 * The consequence is that neither pointer has a foreign-key cascade: both are
 * `restrict`, so a login cannot be deleted out from under an item it is
 * answerable for. `delete-staff` refuses the delete beforehand and names the
 * way out (transfer custody and management to another teacher), and the
 * constraint is what makes that refusal a fact rather than a promise — a
 * `set null` here would both contradict the columns' own NOT NULL and blank
 * out the answer to "who had this". A teacher who leaves the school is marked
 * terminated instead, and `inventoryCustodyHistory` — not the row itself — is
 * the record of how the item got here.
 *
 * The counters are denormalized on the item rather than derived from the units
 * table because the two disagree by design: an item may be counted in bulk
 * ("200 chairs") with no tags at all, and only tagged items have unit rows.
 * `inventoryTransaction` is the before/after ledger that keeps the denormalized
 * numbers honest.
 *
 * There is exactly one counter, `qty`. The source app also carried a
 * `reservedQty` and a `borrowedQty`, and this port drops both: this school's
 * register has no dated-loan workflow, so neither counter ever described a
 * state the store could reach — every unit an item holds is either on hand
 * (`qty`) or permanently gone (issued or disposed), never "out and expected
 * back".
 */
export const inventoryItem = pgTable(
  "inventory_item",
  {
    id: text("id").primaryKey(),
    sku: text("sku").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => inventoryCategory.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    unit: text("unit").notNull().default("unit"),
    /** Reorder threshold — the number below which the store must be warned. */
    minQty: integer("min_qty").notNull().default(0),
    qty: integer("qty").notNull().default(0),
    borrowable: boolean("borrowable").notNull().default(false),
    condition: text("condition").notNull().default("Good"),
    location: text("location").notNull().default(""),
    purchaseValue: numeric("purchase_value", { precision: 14, scale: 2 }),
    /**
     * The hand-entered valuation, kept as the answer whenever the item cannot
     * be depreciated — no `purchaseDate`, no `depreciationRatePercent`, or
     * neither. Once both of those are set, `toItemView` overrides what is
     * shown with a computed straight-line figure instead of trusting this
     * column to have been kept up to date by hand; see
     * `computeDepreciatedValue` in `inventory-database.ts`. The column itself
     * is left in place rather than dropped, because an item with no purchase
     * date still needs somewhere to record a valuation a storekeeper simply
     * knows.
     */
    currentValue: numeric("current_value", { precision: 14, scale: 2 }),
    /** When the item was bought — the depreciation clock's start. Required
     *  alongside `depreciationRatePercent` for `currentValue` to be computed
     *  rather than hand-entered. */
    purchaseDate: timestamp("purchase_date"),
    /**
     * Straight-line depreciation, percent of `purchaseValue` lost per full
     * year since `purchaseDate` — `10.00` means a laptop is worth 10% less
     * for every year that has passed. Straight-line rather than compound on
     * purpose: it is the method a school's own paper asset register already
     * uses, and it is checkable by hand on a printed report without a
     * calculator, unlike a compounding formula.
     */
    depreciationRatePercent: numeric("depreciation_rate_percent", {
      precision: 5,
      scale: 2,
    }),
    createdByStaffId: text("created_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    /**
     * Teacher in charge of this item. Required on every line, forever — see
     * the class-level comment for why the slot can never be empty.
     */
    managerStaffId: text("manager_staff_id")
      .notNull()
      .references(() => staff.id, {
        onDelete: "restrict",
      }),
    /**
     * Teacher who has physically taken this item. Required on every line as
     * well: there is no "nobody is holding it" state, because an item with no
     * holder is an item nobody can be asked to bring back.
     */
    custodianStaffId: text("custodian_staff_id")
      .notNull()
      .references(() => staff.id, {
        onDelete: "restrict",
      }),
    /**
     * A photograph of the item, optional. Nullable FK rather than a raw URL
     * column for the same reason `teacherQualification.documentFileId` is
     * one: `files` is the one place a stored object's name, size, MIME type
     * and storage key are kept together, and a second `imageUrl` string
     * column here would be a second, driver-specific way to say the same
     * thing. `set null` rather than `restrict`: deleting the file row
     * un-pictures the item rather than blocking the deletion or taking the
     * item down with it — a photo is decoration, not a fact the register
     * depends on the way `categoryId` is.
     */
    imageFileId: text("image_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    /** Soft delete. An item with unit rows cannot be hard-deleted (restrict). */
    deletedAt: timestamp("deleted_at"),
    /**
     * A second, distinct soft delete — for a row that should never have
     * existed at all (a duplicate creation, a data-entry slip), not for an
     * item that genuinely served the school and is now out of service.
     * `deletedAt` (retirement) and `voidedAt` are mutually exclusive
     * (`inventory_item_retirement_or_void`): an item is live, retired, or
     * voided, never two of those at once. Both hide the row from the working
     * register the same way; only the label and the reason differ, which is
     * the whole point of keeping them apart — a report asking "how much
     * did we retire" should not be answered by rows that were mistakes and
     * never real stock.
     */
    voidedAt: timestamp("voided_at"),
    /** Required whenever `voidedAt` is set — the same reasoning as
     *  `stockOut.reason`: the first line an auditor reads. */
    voidReason: text("void_reason"),
    voidedByStaffId: text("voided_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("inventory_item_sku_unique").on(table.sku),
    index("inventory_item_category_idx").on(table.categoryId),
    index("inventory_item_manager_staff_idx").on(table.managerStaffId),
    index("inventory_item_custodian_staff_idx").on(table.custodianStaffId),
    index("inventory_item_deleted_at_idx").on(table.deletedAt),
    index("inventory_item_voided_at_idx").on(table.voidedAt),
    index("inventory_item_name_lower_idx").on(sql`lower(${table.name})`),
    check(
      "inventory_item_name_not_blank",
      sql`length(trim(${table.name})) > 0`
    ),
    // The source app carried `sku ~ '^SPPS-[0-9]{5}$'`. The prefix changed with
    // the port, not the rule: a storebook whose SKUs are `INV-00001`… is a
    // storebook a school can reconcile against its existing spreadsheets, and a
    // format check is what stops a hand-typed `INV-1` from quietly becoming a
    // second numbering scheme.
    check("inventory_item_sku_format", sql`${table.sku} ~ '^INV-[0-9]{5}$'`),
    // This is what makes the plain, case-sensitive `inventory_item_sku_unique`
    // index above behave case-insensitively. Because every stored SKU is
    // already upper-case, `INV-00001` and `inv-00001` cannot both exist, so the
    // unique index needs no separate normalized column to do the work `sku` /
    // `normalizedName` do elsewhere in this file. A generated SKU is
    // upper-case already; this check exists for the one that is typed by hand.
    check("inventory_item_sku_upper", sql`${table.sku} = upper(${table.sku})`),
    check(
      "inventory_item_condition_check",
      sqlIn(table.condition, ITEM_CONDITIONS)
    ),
    check("inventory_item_counters_nonneg", sql`${table.qty} >= 0`),
    // `minQty` is a reorder threshold, not a stock floor. A DB-level
    // `min_qty <= qty` would make every write-off, issue and disposal fail the
    // moment on-hand reached the reorder line — which is precisely when those
    // operations are the ones you most need to run. The threshold is reported
    // to the user as a low-stock warning; it constrains nothing.
    check("inventory_item_min_qty", sql`${table.minQty} >= 0`),
    check(
      "inventory_item_values_nonneg",
      sql`(${table.purchaseValue} is null or ${table.purchaseValue} >= 0) and (${table.currentValue} is null or ${table.currentValue} >= 0)`
    ),
    check(
      "inventory_item_depreciation_rate_range",
      sql`${table.depreciationRatePercent} is null or (${table.depreciationRatePercent} >= 0 and ${table.depreciationRatePercent} <= 100)`
    ),
    check(
      "inventory_item_retirement_or_void",
      sql`not (${table.deletedAt} is not null and ${table.voidedAt} is not null)`
    ),
    check(
      "inventory_item_void_reason_required",
      sql`${table.voidedAt} is null or ${table.voidReason} is not null`
    ),
  ]
);

// ─── Item replacement (a new line standing in for a retired one) ──────────

/**
 * "This is the item that replaces that one" — a pure reference link, written
 * once when the replacement item is created, never touched again and never
 * moving a counter on its own.
 *
 * The motivating case: a school retires 12 worn office chairs and buys 6 new
 * ones. The 6 new chairs are their own `inventoryItem` row with their own
 * count — nothing about the 12 old ones changes, and the register does not
 * pretend the school still has 12 chairs' worth of seating. What this table
 * adds is the fact a plain register cannot otherwise state: *these 6 are what
 * replaced those 12*, so a later reader can see the succession instead of two
 * unrelated rows that happen to both be about chairs. There is deliberately no
 * quantity reconciliation here (no "6 of 12 replaced" arithmetic) — that was
 * considered and rejected: it would need a school-wide "how many of this do we
 * need" figure this register does not keep, and a shortfall number nobody
 * asked for is worse than no number at all.
 *
 * `retiredItemId` is `restrict`, not `set null`: the whole reason this row
 * exists is to name which item was replaced, and a link to nothing is not a
 * fact worth keeping. It is not required that the referenced item currently
 * *be* retired at read time — only that it existed and was retired the
 * moment the link was written; `createItem` enforces that at write time, and
 * a later `restoreItem` on the old row does not retroactively invalidate the
 * history of what replaced it.
 */
export const inventoryItemReplacement = pgTable(
  "inventory_item_replacement",
  {
    id: text("id").primaryKey(),
    newItemId: text("new_item_id")
      .notNull()
      .references(() => inventoryItem.id, { onDelete: "restrict" }),
    retiredItemId: text("retired_item_id")
      .notNull()
      .references(() => inventoryItem.id, { onDelete: "restrict" }),
    note: text("note"),
    createdByStaffId: text("created_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("inventory_item_replacement_new_item_idx").on(table.newItemId),
    index("inventory_item_replacement_retired_item_idx").on(
      table.retiredItemId
    ),
    uniqueIndex("inventory_item_replacement_unique").on(
      table.newItemId,
      table.retiredItemId
    ),
    check(
      "inventory_item_replacement_distinct",
      sql`${table.newItemId} <> ${table.retiredItemId}`
    ),
  ]
);

// ─── Physical units ─────────────────────────────────────────────────────────

/**
 * One tagged physical unit of an item — the device with the asset tag the
 * school actually wrote on it. Only tracked items have these rows; a bulk item
 * ("200 chairs") has none.
 *
 * `normalizedUniqueNo` is unique **across every item**, not per item, because
 * an asset tag is globally meaningless if it is only unique inside its own
 * category: a printer tagged "LT-0042" in Lab and "LT-0042" in IT is two
 * physical devices sharing one label, and finding a device by its tag has to
 * be one lookup, not a scan of every category.
 */
export const inventoryUnit = pgTable(
  "inventory_unit",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItem.id, { onDelete: "restrict" }),
    uniqueNo: text("unique_no").notNull(),
    /** lowercased + trimmed `uniqueNo`; the globally unique asset tag */
    normalizedUniqueNo: text("normalized_unique_no").notNull(),
    status: text("status").notNull().default("available"),
    condition: text("condition").notNull().default("Good"),
    location: text("location").notNull().default(""),
    note: text("note"),
    purchaseValue: numeric("purchase_value", { precision: 14, scale: 2 }),
    currentValue: numeric("current_value", { precision: 14, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("inventory_unit_normalized_unique_no_unique").on(
      table.normalizedUniqueNo
    ),
    index("inventory_unit_item_id_idx").on(table.itemId),
    // A single-column index on a low-cardinality status forces a sort for every
    // "newest first, filtered by status" feed, and those feeds are the whole UI
    // - the store's unit list, the disposal queue and the transaction history
    // are all "order by created_at, where status = X".
    // The composite index answers each of them from the index alone.
    index("inventory_unit_status_created_at_idx").on(
      table.status,
      table.createdAt
    ),
    check(
      "inventory_unit_unique_no_not_blank",
      sql`length(trim(${table.uniqueNo})) > 0`
    ),
    check("inventory_unit_status_check", sqlIn(table.status, UNIT_STATUSES)),
    check(
      "inventory_unit_condition_check",
      sqlIn(table.condition, ITEM_CONDITIONS)
    ),
    check(
      "inventory_unit_values_nonneg",
      sql`(${table.purchaseValue} is null or ${table.purchaseValue} >= 0) and (${table.currentValue} is null or ${table.currentValue} >= 0)`
    ),
  ]
);

// ─── Issues (permanent hand-over out of the store) ──────────────────────────

/**
 * A permanent hand-over of stock out of the store: the item leaves and is not
 * expected back.
 *
 * The receiver here is deliberately **free text** — `receiverName`,
 * `receiverDepartment`, `receiverPhone` — and not a `staff` foreign key. An
 * issue is not always to a person on the staff roll: stock goes to students, to
 * a contractor repairing a window, to another school, to the Provincial
 * Education Office. Forcing an FK here would mean inventing a staff record for
 * a body that is not staff, which is exactly the kind of fake row that makes a
 * staff list untrustworthy two years later. Custody (`inventoryItem.custodianStaffId`,
 * moved by `transferCustody`/`takeItem`/`releaseCustody`) is the opposite case:
 * it always names a real `staff` row, because custody is accountability inside
 * the school, never a hand-over to somebody outside it. This school's register
 * has no dated-loan workflow, so unlike custody an issue's receiver is never
 * forced to be a real row - it is genuinely a one-way departure.
 *
 * `issuedAt` is the moment of hand-over and is set once; there is no
 * `updatedAt` because an issue is a finished fact, not a record under
 * revision. Corrections are a new row plus an `inventoryAuditLog` entry.
 */
export const inventoryIssue = pgTable(
  "inventory_issue",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItem.id, { onDelete: "restrict" }),
    qty: integer("qty").notNull(),
    receiverName: text("receiver_name").notNull(),
    receiverDepartment: text("receiver_department"),
    receiverPhone: text("receiver_phone"),
    purpose: text("purpose").notNull(),
    approvedBy: text("approved_by"),
    /** ISO date string — when it was expected back, if ever. */
    expectedReturnDate: text("expected_return_date"),
    note: text("note"),
    issuedByStaffId: text("issued_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    issuedAt: timestamp("issued_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("inventory_issue_item_id_idx").on(table.itemId),
    index("inventory_issue_issued_at_idx").on(table.issuedAt),
    check("inventory_issue_qty_positive", sql`${table.qty} > 0`),
    check(
      "inventory_issue_receiver_not_blank",
      sql`length(trim(${table.receiverName})) > 0`
    ),
    // `expected_return_date` is `text`, not `date`, and the API compares it
    // lexically — which is only sound while the stored form is canonical
    // `YYYY-MM-DD`. A `date` column rejected garbage for free; a `text` column
    // does not, so the format has to be part of the contract. The shape is
    // checked and not the calendar: `2026-02-31` is a value Postgres would take
    // as text and that no other table in this repo would produce.
    check(
      "inventory_issue_expected_return_date_iso",
      sql`(${table.expectedReturnDate} is null or ${table.expectedReturnDate} ~ '^\\d{4}-\\d{2}-\\d{2}$')`
    ),
  ]
);

/**
 * Which tagged units left on which issue.
 *
 * The composite primary key stops a unit being listed twice on one issue; the
 * `unique` on `unitId` alone is the stronger statement and is what the
 * business actually requires — a unit is issued out **once, ever**. A projector
 * that is issued to a school in 2026 cannot be issued again in 2027, and that
 * has to be a database fact, not an API convention, because the two write paths
 * (a bulk issue and a unit issue) are different procedures.
 *
 * Both foreign keys are `restrict`, so this join cannot be used to erase a
 * record: deleting an `inventoryIssue` row would leave the item's `qty` claiming
 * stock that left the school, and deleting an `inventoryUnit` row would silently
 * drop a device that was already issued somewhere else. A mistake in an issue is
 * corrected by a new row plus an `inventoryAuditLog` entry, which is the same
 * rule the issue table's own comment states.
 */
export const inventoryIssueUnit = pgTable(
  "inventory_issue_unit",
  {
    issueId: text("issue_id")
      .notNull()
      .references(() => inventoryIssue.id, { onDelete: "restrict" }),
    unitId: text("unit_id")
      .notNull()
      .references(() => inventoryUnit.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      name: "inventory_issue_unit_pk",
      columns: [table.issueId, table.unitId],
    }),
    unique("inventory_issue_unit_unit_unique").on(table.unitId),
  ]
);

// ─── Disposals (two-stage write-off) ────────────────────────────────────────

/**
 * A two-stage write-off: request, then approval, then one of six final
 * outcomes (or a cancellation from either end). The three actor/timestamp
 * pairs are stored flat rather than as an approval table because a disposal is
 * short, bounded, and read as a single certificate — the status history table
 * carries the multi-step detail if it is ever needed.
 *
 * `inventory_disposal_status_state` is the invariant the whole table exists to
 * hold: `pending_approval` has nothing approved, finalized or cancelled,
 * `approved` has an approver and nothing further, each of the six final outcomes
 * has both approver and finalizer and nothing cancelled, and `cancelled` has
 * nothing finalized but **does** name who cancelled it and when. A school loses
 * real money on disposals, and a row that says `disposed` with no approver is
 * unfalsifiable at audit — so the database refuses to hold one rather than
 * trusting every write path to remember the sequence.
 *
 * That last clause is why the `cancelled` arm is as tight as the final arm. A
 * disposal certificate that says "cancelled", names nobody and happened at no
 * time is exactly the unfalsifiable row this table exists to prevent: it is
 * indistinguishable from a request that was never looked at, and it releases the
 * units on the disposal without leaving a single person answerable for having
 * released them. Cancellation is a decision somebody makes, so it has to record
 * the somebody.
 *
 * The three pairing CHECKs alongside the ladder are the other half of the same
 * argument, and they exist independently of it: each says a lifecycle actor and
 * the moment they acted are both present or both absent, so no write path can
 * record half a step.
 */
export const inventoryDisposal = pgTable(
  "inventory_disposal",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItem.id, { onDelete: "restrict" }),
    qty: integer("qty").notNull(),
    reason: text("reason").notNull(),
    method: text("method").notNull(),
    status: text("status").notNull().default("pending_approval"),
    notes: text("notes"),
    estimatedValue: numeric("estimated_value", { precision: 14, scale: 2 }),
    requestedByStaffId: text("requested_by_staff_id").references(
      () => staff.id,
      { onDelete: "set null" }
    ),
    requestedAt: timestamp("requested_at").defaultNow().notNull(),
    approvedByStaffId: text("approved_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at"),
    finalizedByStaffId: text("finalized_by_staff_id").references(
      () => staff.id,
      { onDelete: "set null" }
    ),
    finalizedAt: timestamp("finalized_at"),
    cancelledByStaffId: text("cancelled_by_staff_id").references(
      () => staff.id,
      { onDelete: "set null" }
    ),
    cancelledAt: timestamp("cancelled_at"),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("inventory_disposal_item_id_idx").on(table.itemId),
    // Same composite reasoning as `inventory_unit_status_created_at_idx`: the
    // disposal queue and the certificate list are both "newest first, where
    // status = X", which a single-column status index can only half-answer.
    index("inventory_disposal_status_created_at_idx").on(
      table.status,
      table.createdAt
    ),
    index("inventory_disposal_requested_at_idx").on(table.requestedAt),
    check("inventory_disposal_qty_positive", sql`${table.qty} > 0`),
    check(
      "inventory_disposal_method_check",
      sqlIn(table.method, DISPOSAL_METHODS)
    ),
    check(
      "inventory_disposal_status_check",
      sqlIn(table.status, DISPOSAL_STATUSES)
    ),
    check(
      "inventory_disposal_estimated_value_nonneg",
      sql`${table.estimatedValue} is null or ${table.estimatedValue} >= 0`
    ),
    // The three pairing checks. Each says that a lifecycle actor and the moment
    // they acted are both present or both absent, so no write path can record
    // half a step: "approved at 09:14" with nobody who approved it, or an
    // approver with no date, which is a signature on a certificate with no date
    // beside it. The source app carried all three; a port that kept the state
    // ladder below but dropped these kept the half of the contract that only
    // matters when something goes wrong.
    check(
      "inventory_disposal_approval_state",
      sql`(${table.approvedByStaffId} is null) = (${table.approvedAt} is null)`
    ),
    check(
      "inventory_disposal_finalization_state",
      sql`(${table.finalizedByStaffId} is null) = (${table.finalizedAt} is null)`
    ),
    check(
      "inventory_disposal_cancellation_state",
      sql`(${table.cancelledByStaffId} is null) = (${table.cancelledAt} is null)`
    ),
    check(
      "inventory_disposal_status_state",
      sql`(
        ${table.status} = 'pending_approval'
        and ${table.approvedByStaffId} is null
        and ${table.approvedAt} is null
        and ${table.finalizedByStaffId} is null
        and ${table.finalizedAt} is null
        and ${table.cancelledByStaffId} is null
        and ${table.cancelledAt} is null
      ) or (
        ${table.status} = 'approved'
        and ${table.approvedByStaffId} is not null
        and ${table.approvedAt} is not null
        and ${table.finalizedByStaffId} is null
        and ${table.finalizedAt} is null
        and ${table.cancelledByStaffId} is null
        and ${table.cancelledAt} is null
      ) or (
        ${sqlIn(table.status, DISPOSAL_FINAL_STATUSES)}
        and ${table.approvedByStaffId} is not null
        and ${table.approvedAt} is not null
        and ${table.finalizedByStaffId} is not null
        and ${table.finalizedAt} is not null
        and ${table.cancelledByStaffId} is null
        and ${table.cancelledAt} is null
      ) or (
        ${table.status} = 'cancelled'
        and ${table.finalizedByStaffId} is null
        and ${table.finalizedAt} is null
        and ${table.cancelledByStaffId} is not null
        and ${table.cancelledAt} is not null
      )`
    ),
  ]
);

/**
 * Which tagged units are written off by which disposal.
 *
 * `releasedAt` is stamped when the certificate is **cancelled**, and that is
 * what makes the partial unique index below possible rather than optional.
 * A pin is a claim, not a verdict: while a request is live the device is spoken
 * for on paper, but once the request is withdrawn nobody may claim it. The index
 * is therefore partial — `where released_at is null` — precisely so a cancelled
 * certificate does not block a future write-off of the same device. Cancelling a
 * write-off and later writing off the very same broken laptop is an ordinary
 * sequence, not an edge case, and a plain unique index refuses it with a raw
 * driver error at the moment a clerk FIFO-picks the tag.
 *
 * A **finalised** certificate still blocks, and that is the point. Finalising
 * writes `disposed` on the unit and decrements the item's `qty`, so the device
 * is gone for good and can never be written off twice — its depreciation history
 * is only worth something because it ends once.
 *
 * `cancelDisposal` stamps `releasedAt` and nothing else: a cancelled request
 * never moved a device, so `inventoryUnit.status` is still `available` and the
 * pin row stays on file as the record of which certificate once claimed it.
 *
 * `disposalId` is `restrict` for the same reason `inventoryIssueUnit.issueId`
 * is: a disposal is never deleted, it is finalized or cancelled, and both of
 * those leave the row standing. A cascade would have let a mistaken `DELETE`
 * free a unit that a certificate still names, and would have taken the
 * certificate's own status history with it.
 */
export const inventoryDisposalUnit = pgTable(
  "inventory_disposal_unit",
  {
    disposalId: text("disposal_id")
      .notNull()
      .references(() => inventoryDisposal.id, { onDelete: "restrict" }),
    unitId: text("unit_id")
      .notNull()
      .references(() => inventoryUnit.id, { onDelete: "restrict" }),
    releasedAt: timestamp("released_at"),
  },
  (table) => [
    primaryKey({
      name: "inventory_disposal_unit_pk",
      columns: [table.disposalId, table.unitId],
    }),
    index("inventory_disposal_unit_unit_id_idx").on(table.unitId),
    uniqueIndex("inventory_disposal_unit_active_unique")
      .on(table.unitId)
      .where(sql`${table.releasedAt} is null`),
  ]
);

/**
 * One row per disposal status change, append-only. `fromStatus` is null for
 * the first transition off `pending_approval`; nothing else about the
 * lifecycle is recoverable without it.
 *
 * `disposalId` is `restrict`: this table is the certificate's own evidence of
 * how it got where it is, so it must not be removable by deleting the thing it
 * is evidence about.
 */
export const inventoryDisposalStatusHistory = pgTable(
  "inventory_disposal_status_history",
  {
    id: text("id").primaryKey(),
    disposalId: text("disposal_id")
      .notNull()
      .references(() => inventoryDisposal.id, { onDelete: "restrict" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    note: text("note"),
    changedByStaffId: text("changed_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("inventory_disposal_status_history_disposal_id_idx").on(
      table.disposalId
    ),
    index("inventory_disposal_status_history_created_at_idx").on(
      table.createdAt
    ),
    check(
      "inventory_disposal_status_history_from_status_check",
      sqlInOrNull(table.fromStatus, DISPOSAL_STATUSES)
    ),
    check(
      "inventory_disposal_status_history_to_status_check",
      sqlIn(table.toStatus, DISPOSAL_STATUSES)
    ),
  ]
);

// ─── Custody audit trail ────────────────────────────────────────────────────

/**
 * The transfer audit trail for `inventoryItem.custodianStaffId` and
 * `inventoryItem.managerStaffId` — the same contract, for the same reason, as
 * `classTeacherAssignmentHistory`: one row per change, append-only, independent
 * of the current pointer value on the row, and `reason` required by the API for
 * any change that **replaces or clears an existing holder** and optional only
 * for the first assignment onto an empty slot.
 *
 * Both pairs are kept on one row because a single transfer action can move
 * custody and change the manager at the same time, and two rows for one
 * hand-over would let the trail disagree with itself about what happened when.
 * A row that changes only custody leaves both manager columns null, which is
 * how `changeType` disambiguates the two.
 *
 * `reason` is a closed set rather than free text, refined to
 * `inventoryTransferReasonSchema`. The vocabulary exists so a report can group
 * transfers by cause — "how much equipment changed hands after a teacher
 * transfer, and how much after a departure" is the question a principal asks
 * about a school of this size, and it is unanswerable against a column of
 * free-text notes. It has a `other` member precisely so a real change is
 * recorded as "Other" rather than refused or mis-filed under a wrong cause.
 *
 * The four staff columns are nullable `set null` rather than cascade, so
 * deleting a staff record retires the name from the trail instead of deleting
 * the trail. An audit that vanishes with the person it audits is not an audit.
 */
export const inventoryCustodyHistory = pgTable(
  "inventory_custody_history",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      // Same rule as the four staff columns below, one level up: the custody
      // trail is evidence, and evidence must never be removed by a cascading
      // parent delete. Deleting the item it describes is a decision a person
      // makes explicitly (and `delete-staff` / the item procedure refuse it
      // while rows like these exist), not something a foreign key may do on
      // their behalf.
      .references(() => inventoryItem.id, { onDelete: "restrict" }),
    previousCustodianStaffId: text("previous_custodian_staff_id").references(
      () => staff.id,
      { onDelete: "set null" }
    ),
    newCustodianStaffId: text("new_custodian_staff_id").references(
      () => staff.id,
      { onDelete: "set null" }
    ),
    previousManagerStaffId: text("previous_manager_staff_id").references(
      () => staff.id,
      { onDelete: "set null" }
    ),
    newManagerStaffId: text("new_manager_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    changeType: text("change_type").notNull(),
    reason: text("reason"),
    note: text("note"),
    changedByStaffId: text("changed_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (table) => [
    index("inventory_custody_history_item_id_idx").on(table.itemId),
    index("inventory_custody_history_changed_at_idx").on(table.changedAt),
    check(
      "inventory_custody_history_change_type_check",
      sqlIn(table.changeType, CUSTODY_CHANGE_TYPES)
    ),
    // Contract (a) from the doc comment, made a database fact: a custody-only
    // change leaves both manager columns null, and a manager change fills them.
    // Written as an equivalence rather than two implications so that a
    // `custody_taken` row quietly carrying a manager is refused, not merely a
    // `manager_*` row missing one.
    check(
      "inventory_custody_history_manager_columns",
      sql`(${table.changeType} in ('custody_taken','custody_transferred','custody_released')) = (${table.previousManagerStaffId} is null and ${table.newManagerStaffId} is null)`
    ),
    // Contract (b): a reason is required for anything that replaces or clears
    // an existing holder — which is every `manager_*` change, since by (a) the
    // custody types never touch those columns — and optional for the first
    // assignment onto an empty slot.
    check(
      "inventory_custody_history_reason_required",
      sql`${table.changeType} in ('custody_taken','manager_assigned') or ${table.reason} is not null`
    ),
    check(
      "inventory_custody_history_reason_check",
      sqlInOrNull(table.reason, INVENTORY_TRANSFER_REASON_KEYS)
    ),
  ]
);

// ─── Custody notices (one row per person a custody-history row concerns) ───

/**
 * Who a single `inventoryCustodyHistory` row concerns, and what each of them
 * has done about it — the recipient half of "notified" that the history row
 * itself used to carry as two shared columns (`acknowledgedAt`/`disputedAt`)
 * before a hand-over could have more than two people worth telling.
 *
 * A custody change concerns up to three kinds of person, given by
 * `custodyNoticeRecipientRoleSchema`: the item's current `manager`, the
 * `previous_custodian` who just lost the item, and every `sub_manager` —
 * everyone else who held the item earlier in the same unbroken chain of
 * hand-overs since it was last back in the store. A lends to B, B lends to C:
 * when C lends on to D, B is a `sub_manager` on that row. The chain resets
 * every time the item comes back to the store (`custody_released`), so a
 * fresh loan never drags in names from an unrelated, already-closed loan.
 *
 * One row per (history row, staff member) — never two roles for the same
 * person on the same event — so each person's own acknowledgement and
 * dispute are theirs alone, unlike the old shared columns where one
 * recipient's acknowledgement silently closed the notice for the other one
 * too. `changedByStaffId` on the parent row is never a recipient of its own
 * row: nobody needs telling about the change they themselves made.
 */
export const inventoryCustodyNoticeRecipient = pgTable(
  "inventory_custody_notice_recipient",
  {
    id: text("id").primaryKey(),
    custodyHistoryId: text("custody_history_id")
      .notNull()
      // Same reasoning as `inventoryCustodyHistory.itemId`: this table is
      // evidence about who was told what, and a cascading delete of the
      // history row it names would silently erase that evidence.
      .references(() => inventoryCustodyHistory.id, { onDelete: "restrict" }),
    staffId: text("staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    role: text("role").notNull(),
    /** See `inventoryCustodyHistory`'s old doc comment for the shape of this
     *  contract — unchanged, just per-recipient now. */
    acknowledgedAt: timestamp("acknowledged_at"),
    disputedAt: timestamp("disputed_at"),
    disputeNote: text("dispute_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("inventory_custody_notice_recipient_history_idx").on(
      table.custodyHistoryId
    ),
    // The one read a recipient's own equipment page runs on every visit:
    // "which rows name me and are not yet acknowledged".
    index("inventory_custody_notice_recipient_unacknowledged_idx")
      .on(table.staffId, table.createdAt)
      .where(sql`${table.acknowledgedAt} is null`),
    // A person appears at most once per event, in a single role — the
    // precedence rule (manager over previous_custodian over sub_manager) is
    // enforced by the inserting code, and this is the database's half of
    // that promise: it cannot be double-inserted into two rows by accident.
    uniqueIndex("inventory_custody_notice_recipient_unique").on(
      table.custodyHistoryId,
      table.staffId
    ),
    check(
      "inventory_custody_notice_recipient_role_check",
      sqlIn(table.role, CUSTODY_NOTICE_RECIPIENT_ROLES)
    ),
    check(
      "inventory_custody_notice_recipient_dispute_note_required",
      sql`${table.disputedAt} is null or ${table.disputeNote} is not null`
    ),
    check(
      "inventory_custody_notice_recipient_dispute_implies_ack",
      sql`${table.disputedAt} is null or ${table.acknowledgedAt} is not null`
    ),
  ]
);

// ─── Counter ledger ─────────────────────────────────────────────────────────

/**
 * The before/after counter ledger: one row per action, holding the item's
 * `qty` as it was and as it became.
 *
 * This is what makes the denormalized counters on `inventoryItem` defensible.
 * `inventoryItem` answers "how many are there"; this answers "how did it get
 * that way", which is the question an auditor asks after a shortfall and the
 * question the source app could not answer once a counter was edited by hand.
 * Storing both sides of every counter — not just the delta — is deliberate: a
 * delta cannot be sanity-checked, and a ledger that can be checked is one a
 * school will keep.
 *
 * **Where the depreciation history went.** The source app had a separate
 * `item_value_history` table: one row per valuation change, holding the old
 * `purchase_value` / `current_value` and the new ones. Nothing in this port
 * replaced it, and nothing needs to: a valuation change is a mutation of the
 * item row and not a counter movement, so it is recorded the same way every
 * other field change is — as a `before` / `after` pair in `inventoryAuditLog`
 * with `action = "item.update"`. That is also why the audit log needs its
 * `entity_type` + `entity_id` index: "what was this item's value in March" is a
 * scan of one entity's audit rows, and without the composite index it is a scan
 * of the whole log. The dedicated table is what this port dropped; the
 * `before` / `after` pair in the audit log is where it lives now.
 *
 * `actorStaffId` is `set null` rather than `restrict`: the ledger has to
 * survive the departure of the storekeeper who wrote it. The name is
 * denormalized into `meta.actorName` for the same reason, and `staffId` being
 * nullable there too is what makes a write by a seeded administrator — who has
 * no staff record — survivable rather than a foreign-key violation.
 */
export const inventoryTransaction = pgTable(
  "inventory_transaction",
  {
    id: text("id").primaryKey(),
    actorStaffId: text("actor_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItem.id, { onDelete: "restrict" }),
    qtyBefore: integer("qty_before").notNull(),
    qtyAfter: integer("qty_after").notNull(),
    note: text("note"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("inventory_transaction_item_id_idx").on(table.itemId),
    // Same composite reasoning as `inventory_unit_status_created_at_idx`. The
    // transactions screen is a feed of "what happened, newest first, of this
    // kind of thing", and it is one of the four the pattern exists for.
    index("inventory_transaction_action_created_at_idx").on(
      table.action,
      table.createdAt
    ),
    index("inventory_transaction_created_at_idx").on(table.createdAt),
    check(
      "inventory_transaction_action_check",
      sqlIn(table.action, INVENTORY_TRANSACTION_ACTIONS)
    ),
    check(
      "inventory_transaction_counters_nonneg",
      sql`${table.qtyBefore} >= 0
        and ${table.qtyAfter} >= 0`
    ),
  ]
);

// ─── Entity audit log ───────────────────────────────────────────────────────

/**
 * Entity-level before/after, one row per mutation of any inventory entity —
 * not just items. `inventoryTransaction` answers "what happened to the
 * counters"; this answers "what did the row look like before and after", which
 * is the only way to reconstruct a renamed category or a corrected
 * `expectedReturnDate` after the fact.
 *
 * `entityType` and `action` are free text on purpose. `entityType` names a
 * table, and adding a table must not require adding an enum value; `action`
 * here is a CRUD verb, not one of the counter-ledger actions, so reusing
 * `inventoryActionSchema` would be a category error. `before` / `after` are
 * where the source app's `item_value_history` went — see the note on
 * `inventoryTransaction`.
 *
 * `actorName` exists because this table's whole job is to answer "who did this",
 * and `actorStaffId` is nullable by design (`set null`, so the log survives the
 * departure of the person who wrote it) and was already null for any write by an
 * account with no staff record. Without the denormalised name, one teacher
 * deletion anonymises every row that person ever touched, and the log's answer
 * to the only question it exists for is "somebody who no longer works here".
 * `inventoryTransaction` denormalises the same way, into `meta.actorName`; this
 * table gets a real column because the log is read row-by-row by people rather
 * than rendered from a `meta` blob.
 *
 * `actorName` is `notNull` rather than nullable. It could be nullable, with a
 * CHECK accepting either column, and that version is a trap: Postgres evaluates
 * CHECK constraints during the `UPDATE` a `set null` FK action performs, so a
 * single name-less row would make every subsequent `delete from staff` fail with
 * a constraint violation — wedging staff deletion for a row the application can
 * no longer produce. Making the name mandatory removes the wedge at the source:
 * a row that reaches this table always names somebody, so the `set null` on
 * `actorStaffId` can never leave the log anonymous.
 */
export const inventoryAuditLog = pgTable(
  "inventory_audit_log",
  {
    id: text("id").primaryKey(),
    actorStaffId: text("actor_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    /** Denormalised from the `staff` row at write time; see the comment above. */
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("inventory_audit_log_entity_type_idx").on(table.entityType),
    // Every read of this table is "the history of *this* entity", and the
    // composite is what answers it: `entity_type` alone is a low-cardinality
    // filter over a table that grows without bound.
    index("inventory_audit_log_entity_idx").on(
      table.entityType,
      table.entityId
    ),
    // "Everything this member of staff changed" is the other standard read, and
    // it is the one that has to keep working after the person leaves — which it
    // does, because the index and the name are both independent of the row.
    index("inventory_audit_log_actor_staff_idx").on(table.actorStaffId),
    index("inventory_audit_log_created_at_idx").on(table.createdAt),
    check(
      "inventory_audit_log_entity_not_blank",
      sql`length(trim(${table.entityId})) > 0`
    ),
    // `actor_name` is `notNull`, so the remaining hole is a blank name rather
    // than a missing one — and a blank name is worse than `null`, because it
    // looks attributed in the UI while answering nothing. This is also the
    // constraint's second job: Postgres evaluates CHECKs during the `UPDATE` a
    // `set null` FK action performs, and a row that somehow carried a blank name
    // would make the teacher's `delete from staff` fail. `notNull` plus this
    // check together make that unreachable rather than merely unlikely.
    check(
      "inventory_audit_log_actor_name_not_blank",
      sql`length(trim(${table.actorName})) > 0`
    ),
  ]
);

// ─── Generated valibot schemas ──────────────────────────────────────────────

const inventoryCategoryColumnRefinements = {
  id: () => inventoryCategoryIdSchema,
  name: () => v.pipe(v.string(), v.minLength(1)),
  normalizedName: () => v.pipe(v.string(), v.minLength(1)),
  icon: () => inventoryCategoryIconSchema,
};

export const inventoryCategorySelectSchema = createSelectSchema(
  inventoryCategory,
  inventoryCategoryColumnRefinements
);
export const inventoryCategoryInsertSchema = createInsertSchema(
  inventoryCategory,
  inventoryCategoryColumnRefinements
);
export const inventoryCategoryUpdateSchema = createUpdateSchema(
  inventoryCategory,
  inventoryCategoryColumnRefinements
);

const inventoryItemColumnRefinements = {
  id: () => inventoryItemIdSchema,
  categoryId: () => inventoryCategoryIdSchema,
  name: () => v.pipe(v.string(), v.minLength(1)),
  // Mirrors `inventory_item_sku_format` + `inventory_item_sku_upper` at the
  // type layer, so a bad SKU is a validation message rather than a CHECK
  // violation: "INV-0001" and "inv-00001" are both caught before the insert.
  sku: () => v.pipe(v.string(), v.regex(/^INV-\d{5}$/u)),
  condition: () => itemConditionSchema,
  createdByStaffId: () => staffRefSchema,
  managerStaffId: () => staffRefSchema,
  custodianStaffId: () => staffRefSchema,
  voidedByStaffId: () => staffRefSchema,
  imageFileId: () => fileIdSchema,
  minQty: () => v.pipe(v.number(), v.integer(), v.minValue(0)),
  qty: () => v.pipe(v.number(), v.integer(), v.minValue(0)),
  purchaseValue: () => moneyStringSchema(),
  currentValue: () => moneyStringSchema(),
  // Percent, not a fraction: "10.00" means 10%/year, matching how a
  // storekeeper would fill in a paper form. Same digit shape as money, just a
  // narrower range enforced by `inventory_item_depreciation_rate_range`.
  depreciationRatePercent: () =>
    optionalNullable(v.pipe(v.string(), v.regex(/^\d{1,3}(?:\.\d{1,2})?$/u))),
  purchaseDate: () => optionalNullable(isoDateSchema),
};

export const inventoryItemSelectSchema = createSelectSchema(
  inventoryItem,
  inventoryItemColumnRefinements
);
export const inventoryItemInsertSchema = createInsertSchema(
  inventoryItem,
  inventoryItemColumnRefinements
);
export const inventoryItemUpdateSchema = createUpdateSchema(
  inventoryItem,
  inventoryItemColumnRefinements
);

const inventoryItemReplacementColumnRefinements = {
  id: () => inventoryItemReplacementIdSchema,
  newItemId: () => inventoryItemIdSchema,
  retiredItemId: () => inventoryItemIdSchema,
  createdByStaffId: () => staffRefSchema,
};

export const inventoryItemReplacementSelectSchema = createSelectSchema(
  inventoryItemReplacement,
  inventoryItemReplacementColumnRefinements
);
export const inventoryItemReplacementInsertSchema = createInsertSchema(
  inventoryItemReplacement,
  inventoryItemReplacementColumnRefinements
);
export const inventoryItemReplacementUpdateSchema = createUpdateSchema(
  inventoryItemReplacement,
  inventoryItemReplacementColumnRefinements
);

const inventoryUnitColumnRefinements = {
  id: () => inventoryUnitIdSchema,
  itemId: () => inventoryItemIdSchema,
  uniqueNo: () => v.pipe(v.string(), v.minLength(1)),
  normalizedUniqueNo: () => v.pipe(v.string(), v.minLength(1)),
  status: () => unitStatusSchema,
  condition: () => itemConditionSchema,
  purchaseValue: () => moneyStringSchema(),
  currentValue: () => moneyStringSchema(),
};

export const inventoryUnitSelectSchema = createSelectSchema(
  inventoryUnit,
  inventoryUnitColumnRefinements
);
export const inventoryUnitInsertSchema = createInsertSchema(
  inventoryUnit,
  inventoryUnitColumnRefinements
);
export const inventoryUnitUpdateSchema = createUpdateSchema(
  inventoryUnit,
  inventoryUnitColumnRefinements
);

const inventoryIssueColumnRefinements = {
  id: () => inventoryIssueIdSchema,
  itemId: () => inventoryItemIdSchema,
  qty: () => v.pipe(v.number(), v.integer(), v.minValue(1)),
  receiverName: () => v.pipe(v.string(), v.minLength(1)),
  // Free text for *who* the receiver is; a real phone number when there is one.
  // `slPhoneSchema` is the same refinement the staff phone column uses, so a
  // Sri Lankan school types `0771234567` and it normalises to `+94771234567`
  // rather than being stored as typed, and a number that is not a mobile number
  // is refused before it reaches the column.
  receiverPhone: () => optionalNullable(slPhoneSchema),
  purpose: () => v.pipe(v.string(), v.minLength(1)),
  expectedReturnDate: () => isoDateSchema,
  issuedByStaffId: () => staffRefSchema,
};

export const inventoryIssueSelectSchema = createSelectSchema(
  inventoryIssue,
  inventoryIssueColumnRefinements
);
export const inventoryIssueInsertSchema = createInsertSchema(
  inventoryIssue,
  inventoryIssueColumnRefinements
);
export const inventoryIssueUpdateSchema = createUpdateSchema(
  inventoryIssue,
  inventoryIssueColumnRefinements
);

const inventoryIssueUnitColumnRefinements = {
  issueId: () => inventoryIssueIdSchema,
  unitId: () => inventoryUnitIdSchema,
};

export const inventoryIssueUnitSelectSchema = createSelectSchema(
  inventoryIssueUnit,
  inventoryIssueUnitColumnRefinements
);
export const inventoryIssueUnitInsertSchema = createInsertSchema(
  inventoryIssueUnit,
  inventoryIssueUnitColumnRefinements
);
export const inventoryIssueUnitUpdateSchema = createUpdateSchema(
  inventoryIssueUnit,
  inventoryIssueUnitColumnRefinements
);

const inventoryDisposalColumnRefinements = {
  id: () => inventoryDisposalIdSchema,
  itemId: () => inventoryItemIdSchema,
  qty: () => v.pipe(v.number(), v.integer(), v.minValue(1)),
  reason: () => v.pipe(v.string(), v.minLength(1)),
  method: () => disposalMethodSchema,
  status: () => disposalStatusSchema,
  estimatedValue: () => moneyStringSchema(),
  requestedByStaffId: () => staffRefSchema,
  approvedByStaffId: () => staffRefSchema,
  finalizedByStaffId: () => staffRefSchema,
  cancelledByStaffId: () => staffRefSchema,
};

export const inventoryDisposalSelectSchema = createSelectSchema(
  inventoryDisposal,
  inventoryDisposalColumnRefinements
);
export const inventoryDisposalInsertSchema = createInsertSchema(
  inventoryDisposal,
  inventoryDisposalColumnRefinements
);
export const inventoryDisposalUpdateSchema = createUpdateSchema(
  inventoryDisposal,
  inventoryDisposalColumnRefinements
);

const inventoryDisposalUnitColumnRefinements = {
  disposalId: () => inventoryDisposalIdSchema,
  unitId: () => inventoryUnitIdSchema,
};

export const inventoryDisposalUnitSelectSchema = createSelectSchema(
  inventoryDisposalUnit,
  inventoryDisposalUnitColumnRefinements
);
export const inventoryDisposalUnitInsertSchema = createInsertSchema(
  inventoryDisposalUnit,
  inventoryDisposalUnitColumnRefinements
);
export const inventoryDisposalUnitUpdateSchema = createUpdateSchema(
  inventoryDisposalUnit,
  inventoryDisposalUnitColumnRefinements
);

const inventoryDisposalStatusHistoryColumnRefinements = {
  id: () => inventoryDisposalStatusHistoryIdSchema,
  disposalId: () => inventoryDisposalIdSchema,
  fromStatus: () => disposalStatusSchema,
  toStatus: () => disposalStatusSchema,
  changedByStaffId: () => staffRefSchema,
};

export const inventoryDisposalStatusHistorySelectSchema = createSelectSchema(
  inventoryDisposalStatusHistory,
  inventoryDisposalStatusHistoryColumnRefinements
);
export const inventoryDisposalStatusHistoryInsertSchema = createInsertSchema(
  inventoryDisposalStatusHistory,
  inventoryDisposalStatusHistoryColumnRefinements
);
export const inventoryDisposalStatusHistoryUpdateSchema = createUpdateSchema(
  inventoryDisposalStatusHistory,
  inventoryDisposalStatusHistoryColumnRefinements
);

const inventoryCustodyHistoryColumnRefinements = {
  id: () => inventoryCustodyHistoryIdSchema,
  itemId: () => inventoryItemIdSchema,
  previousCustodianStaffId: () => staffRefSchema,
  newCustodianStaffId: () => staffRefSchema,
  previousManagerStaffId: () => staffRefSchema,
  newManagerStaffId: () => staffRefSchema,
  changeType: () => custodyChangeTypeSchema,
  // The transfer vocabulary, enforced here so a row cannot be written with a
  // cause that is not in the list a report groups by — see the table comment.
  reason: () => optionalNullable(inventoryTransferReasonSchema),
  changedByStaffId: () => staffRefSchema,
};

export const inventoryCustodyHistorySelectSchema = createSelectSchema(
  inventoryCustodyHistory,
  inventoryCustodyHistoryColumnRefinements
);
export const inventoryCustodyHistoryInsertSchema = createInsertSchema(
  inventoryCustodyHistory,
  inventoryCustodyHistoryColumnRefinements
);
export const inventoryCustodyHistoryUpdateSchema = createUpdateSchema(
  inventoryCustodyHistory,
  inventoryCustodyHistoryColumnRefinements
);

const inventoryCustodyNoticeRecipientColumnRefinements = {
  id: () => inventoryCustodyNoticeRecipientIdSchema,
  custodyHistoryId: () => inventoryCustodyHistoryIdSchema,
  staffId: () => optionalNullable(staffRefSchema),
  role: () => custodyNoticeRecipientRoleSchema,
};

export const inventoryCustodyNoticeRecipientSelectSchema = createSelectSchema(
  inventoryCustodyNoticeRecipient,
  inventoryCustodyNoticeRecipientColumnRefinements
);
export const inventoryCustodyNoticeRecipientInsertSchema = createInsertSchema(
  inventoryCustodyNoticeRecipient,
  inventoryCustodyNoticeRecipientColumnRefinements
);
export const inventoryCustodyNoticeRecipientUpdateSchema = createUpdateSchema(
  inventoryCustodyNoticeRecipient,
  inventoryCustodyNoticeRecipientColumnRefinements
);

const inventoryTransactionColumnRefinements = {
  id: () => inventoryTransactionIdSchema,
  actorStaffId: () => staffRefSchema,
  action: () => inventoryActionSchema,
  itemId: () => inventoryItemIdSchema,
  qtyBefore: () => v.pipe(v.number(), v.integer(), v.minValue(0)),
  qtyAfter: () => v.pipe(v.number(), v.integer(), v.minValue(0)),
};

export const inventoryTransactionSelectSchema = createSelectSchema(
  inventoryTransaction,
  inventoryTransactionColumnRefinements
);
export const inventoryTransactionInsertSchema = createInsertSchema(
  inventoryTransaction,
  inventoryTransactionColumnRefinements
);
export const inventoryTransactionUpdateSchema = createUpdateSchema(
  inventoryTransaction,
  inventoryTransactionColumnRefinements
);

const inventoryAuditLogColumnRefinements = {
  id: () => inventoryAuditLogIdSchema,
  actorStaffId: () => staffRefSchema,
  // `action` and `entityType` are free text by design (see the table comment);
  // `actorName` is not a closed set either, but it is not allowed to be blank,
  // because the CHECK pairs it with `actorStaffId` and a row of spaces would
  // satisfy neither half of that pair honestly.
  actorName: () => optionalNullable(v.pipe(v.string(), v.minLength(1))),
  entityId: () => v.pipe(v.string(), v.minLength(1)),
};

export const inventoryAuditLogSelectSchema = createSelectSchema(
  inventoryAuditLog,
  inventoryAuditLogColumnRefinements
);
export const inventoryAuditLogInsertSchema = createInsertSchema(
  inventoryAuditLog,
  inventoryAuditLogColumnRefinements
);
export const inventoryAuditLogUpdateSchema = createUpdateSchema(
  inventoryAuditLog,
  inventoryAuditLogColumnRefinements
);
