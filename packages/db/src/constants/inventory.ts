/**
 * Inventory vocabulary: the closed sets the inventory tables store as `text`,
 * the wording the UI shows for them, and the valibot picklists that keep the
 * two in step.
 *
 * The source inventory app declared conditions, unit statuses and transaction
 * actions as PostgreSQL enums. This repo does not use `pgEnum` anywhere — a
 * closed set is a `text` column with a `v.picklist` beside it, so adding a
 * value is a code change plus a migration rather than an `ALTER TYPE` that no
 * ORM can express cleanly. These lists are therefore the single definition for
 * the column picklists in `schema/inventory.ts` and for the API and web layers,
 * which is why the valibot schemas are exported from here rather than
 * re-declared per caller: a value a form accepts is by construction a value the
 * column refinement accepts.
 *
 * The labels live beside the keys for the same reason they do in
 * `constants/display.ts` — the server generates the CSV/print/export output
 * too, and an export that prints `custody_taken` next to a screen that says
 * "Custody taken" is the same bug in a different file.
 */
import * as v from "valibot";

// ─── Item / unit condition ──────────────────────────────────────────────────

/**
 * Condition of an item or a single physical unit. These are the values the
 * source app stored in its `item_condition` enum; "Under Repair" is kept
 * because a broken item in a school store is a real, trackable state and not
 * the same as "Damaged" — a repaired item comes back into service.
 */
export const ITEM_CONDITIONS = [
  "Good",
  "Fair",
  "Damaged",
  "Under Repair",
] as const;
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

/** How each stored condition reads on a form, a table and a printout. */
export const ITEM_CONDITION_LABELS: Record<string, string> = {
  Good: "Good",
  Fair: "Fair",
  Damaged: "Damaged",
  "Under Repair": "Under repair",
};

export const itemConditionSchema = v.picklist(ITEM_CONDITIONS);

// ─── Physical unit status ───────────────────────────────────────────────────

/**
 * State of one tagged physical unit (one laptop, one projector, one microscope).
 *
 * `available` and `borrowed` are the two a unit spends its life in; `issued`
 * means it left the school permanently (see `inventoryIssue`), `disposed` and
 * `removed` are the two ways a unit stops existing without its `inventory_item`
 * row going away. The source app also had `reserved`; it is deliberately not
 * ported, because a school has no reservation workflow that outlives the
 * request that created it.
 */
export const UNIT_STATUSES = [
  "available",
  "borrowed",
  "issued",
  "disposed",
  "removed",
] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const UNIT_STATUS_LABELS: Record<string, string> = {
  available: "Available",
  borrowed: "Borrowed",
  issued: "Issued",
  disposed: "Disposed",
  removed: "Removed",
};

export const unitStatusSchema = v.picklist(UNIT_STATUSES);

// ─── Transfer / custody reasons ─────────────────────────────────────────────

/**
 * Why an item's custodian or manager changed. Required by the API whenever an
 * existing holder is replaced or cleared — the same contract as
 * `TEACHER_REASSIGNMENT_REASONS` for a homeroom teacher, and for the same
 * reason: a mid-year change of hands is the thing an audit is asked about, and
 * it is the one change a storekeeper can make in three clicks.
 *
 * `other` is a real member of this set, not a hole in it: a storekeeper who
 * cannot pick any of the seven named reasons still has to record the change,
 * and a recorded "Other" is auditable where a refused transfer is not.
 */
export const INVENTORY_TRANSFER_REASONS = {
  teacher_transfer: { label: "Teacher transfer" },
  staff_departure: { label: "Staff departure" },
  damage_repair: { label: "Damage / repair" },
  class_reallocation: { label: "Class reallocation" },
  long_absence: { label: "Long absence" },
  returned_to_store: { label: "Returned to store" },
  misassignment: { label: "Misassignment" },
  other: { label: "Other" },
} as const;

export type InventoryTransferReason = keyof typeof INVENTORY_TRANSFER_REASONS;

export const INVENTORY_TRANSFER_REASON_KEYS = Object.keys(
  INVENTORY_TRANSFER_REASONS
) as [InventoryTransferReason, ...InventoryTransferReason[]];

export const INVENTORY_TRANSFER_REASON_LABELS: Record<string, string> =
  Object.fromEntries(
    Object.entries(INVENTORY_TRANSFER_REASONS).map(([key, value]) => [
      key,
      value.label,
    ])
  );

export const inventoryTransferReasonSchema = v.picklist(
  INVENTORY_TRANSFER_REASON_KEYS
);

// ─── Custody / manager change types ─────────────────────────────────────────

/**
 * What actually happened to a holder, recorded one row per change in
 * `inventoryCustodyHistory`.
 *
 * The three custody values and the three manager values are kept apart because
 * they are answered by different questions: a custody change is "who is holding
 * this today", a manager change is "who is accountable for it". Collapsing
 * them into one `transferred` value would make a report that lists who took
 * what impossible to write, since a manager change never moves the item.
 */
export const CUSTODY_CHANGE_TYPES = [
  "custody_taken",
  "custody_transferred",
  "custody_released",
  "manager_assigned",
  "manager_changed",
  "manager_cleared",
] as const;
export type CustodyChangeType = (typeof CUSTODY_CHANGE_TYPES)[number];

export const CUSTODY_CHANGE_TYPE_LABELS: Record<string, string> = {
  custody_taken: "Custody taken",
  custody_transferred: "Custody transferred",
  custody_released: "Custody released",
  manager_assigned: "Manager assigned",
  manager_changed: "Manager changed",
  manager_cleared: "Manager cleared",
};

export const custodyChangeTypeSchema = v.picklist(CUSTODY_CHANGE_TYPES);

// ─── Borrow status ──────────────────────────────────────────────────────────

export const BORROW_STATUSES = ["borrowed", "returned"] as const;
export type InventoryBorrowStatus = (typeof BORROW_STATUSES)[number];

export const BORROW_STATUS_LABELS: Record<string, string> = {
  borrowed: "Borrowed",
  returned: "Returned",
};

export const inventoryBorrowStatusSchema = v.picklist(BORROW_STATUSES);

// ─── Disposal ───────────────────────────────────────────────────────────────

/**
 * How a disposed quantity left the school's books. These are display strings,
 * not keys, because the method is never a foreign key and never joins
 * anything — it is read straight back onto a disposal certificate.
 */
export const DISPOSAL_METHODS = [
  "Disposal",
  "Recycling",
  "Auction",
  "Write-Off",
  "Donation",
  "Return to Supplier",
] as const;
export type DisposalMethod = (typeof DISPOSAL_METHODS)[number];

export const DISPOSAL_METHOD_LABELS: Record<string, string> = {
  Disposal: "Disposal",
  Recycling: "Recycling",
  Auction: "Auction",
  "Write-Off": "Write-off",
  Donation: "Donation",
  "Return to Supplier": "Return to supplier",
};

export const disposalMethodSchema = v.picklist(DISPOSAL_METHODS);

/**
 * The two-stage write-off lifecycle. `pending_approval` → `approved` → one of
 * the six final statuses, or `cancelled` from either end.
 *
 * The six final statuses are one per `DISPOSAL_METHODS` entry, and the
 * `inventoryDisposal` CHECK constraint pairs them: a final status is a
 * finalized row that was never cancelled. Keeping them as separate constants
 * rather than one "final" flag is what lets the API refuse `disposed` without
 * an `approvedAt` instead of discovering the mistake at audit time.
 */
export const DISPOSAL_STATUSES = [
  "pending_approval",
  "approved",
  "disposed",
  "recycled",
  "auctioned",
  "written_off",
  "donated",
  "returned_to_supplier",
  "cancelled",
] as const;
export type DisposalStatus = (typeof DISPOSAL_STATUSES)[number];

export const DISPOSAL_STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending approval",
  approved: "Approved",
  disposed: "Disposed",
  recycled: "Recycled",
  auctioned: "Auctioned",
  written_off: "Written off",
  donated: "Donated",
  returned_to_supplier: "Returned to supplier",
  cancelled: "Cancelled",
};

export const disposalStatusSchema = v.picklist(DISPOSAL_STATUSES);

/** The six terminal outcomes — every one implies a `finalizedAt`. */
export const DISPOSAL_FINAL_STATUSES = [
  "disposed",
  "recycled",
  "auctioned",
  "written_off",
  "donated",
  "returned_to_supplier",
] as const;
export type DisposalFinalStatus = (typeof DISPOSAL_FINAL_STATUSES)[number];

export const DISPOSAL_FINAL_STATUS_LABELS: Record<string, string> = {
  disposed: "Disposed",
  recycled: "Recycled",
  auctioned: "Auctioned",
  written_off: "Written off",
  donated: "Donated",
  returned_to_supplier: "Returned to supplier",
};

export const disposalFinalStatusSchema = v.picklist(DISPOSAL_FINAL_STATUSES);

// ─── Counter ledger actions ─────────────────────────────────────────────────

/**
 * Every action that writes a before/after counter row to
 * `inventoryTransaction`.
 *
 * The `custody_*` and `manager_*` values are new in this port. The source app
 * had no transfer concept at all — it tracked a counter and a set of tagged
 * units, and nothing about who was responsible for an item. Transfer is a
 * first-class requirement here (`inventoryCustodyHistory`), so the ledger has
 * to carry the same six events; a transfer that is invisible in the counter
 * ledger is the first thing anyone asks for when the two histories disagree.
 */
export const INVENTORY_TRANSACTION_ACTIONS = [
  "created",
  "edited",
  "deleted",
  "stock_in",
  "stock_out",
  "issued",
  "borrowed",
  "returned",
  "custody_taken",
  "custody_transferred",
  "custody_released",
  "manager_assigned",
  "manager_changed",
  "manager_cleared",
  "disposal_requested",
  "disposal_approved",
  "disposal_finalized",
] as const;
export type InventoryAction = (typeof INVENTORY_TRANSACTION_ACTIONS)[number];

export const INVENTORY_ACTION_LABELS: Record<string, string> = {
  created: "Item created",
  edited: "Item edited",
  deleted: "Item deleted",
  stock_in: "Stock in",
  stock_out: "Stock out",
  issued: "Issued",
  borrowed: "Borrowed",
  returned: "Returned",
  custody_taken: "Custody taken",
  custody_transferred: "Custody transferred",
  custody_released: "Custody released",
  manager_assigned: "Manager assigned",
  manager_changed: "Manager changed",
  manager_cleared: "Manager cleared",
  disposal_requested: "Disposal requested",
  disposal_approved: "Disposal approved",
  disposal_finalized: "Disposal finalized",
};

export const inventoryActionSchema = v.picklist(INVENTORY_TRANSACTION_ACTIONS);

// ─── Seeded categories ──────────────────────────────────────────────────────

/**
 * The categories a new store is seeded with, so a school never starts with an
 * empty category picker. `normalizedName` is pre-computed because the
 * `inventoryCategory.normalizedName` unique index is what enforces
 * case-insensitive dedupe — a seeder that lowercases differently from
 * `normalizeInventoryKey` writes a category the API will then refuse to
 * re-create.
 */
export const DEFAULT_INVENTORY_CATEGORIES = [
  { name: "IT Equipment", normalizedName: "it equipment", color: "#0EA5E9" },
  { name: "Lab Equipment", normalizedName: "lab equipment", color: "#8B5CF6" },
  {
    name: "Sports Equipment",
    normalizedName: "sports equipment",
    color: "#22C55E",
  },
  {
    name: "Audio Visual",
    normalizedName: "audio visual",
    color: "#EC4899",
  },
  { name: "Furniture", normalizedName: "furniture", color: "#C79A2B" },
  { name: "Cleaning", normalizedName: "cleaning", color: "#14B8A6" },
  { name: "Kitchen", normalizedName: "kitchen", color: "#F97316" },
  { name: "Other", normalizedName: "other", color: "#6366F1" },
] as const;

export type DefaultInventoryCategory =
  (typeof DEFAULT_INVENTORY_CATEGORIES)[number];

// ─── Normalization + labels ─────────────────────────────────────────────────

/**
 * The one normalization the `normalizedName` / `normalizedUniqueNo` unique
 * indexes are written against. Both columns exist because the school types the
 * same category as "IT Equipment" and "it equipment" and means one category,
 * and because asset tags are read off a label by hand and retyped with
 * different casing. Whitespace is collapsed too, so a trailing space in a
 * paste cannot smuggle a duplicate past the index.
 */
export const normalizeInventoryKey = (value: string): string =>
  value.trim().replaceAll(/\s+/gu, " ").toLowerCase();

/**
 * Splits a stored key into words, so an unrecognised value degrades to a
 * readable phrase rather than leaking `custody_taken` into a printed sheet.
 * The snake_case pass is the one `display.ts` does not need and this module
 * does — every inventory key except the condition values is snake_case.
 */
const humanizeInventoryKey = (key: string): string => {
  const spaced = key
    .replaceAll(/(?<lower>[a-z\d])[_.-](?<word>[a-z])/gu, "$<lower> $<word>")
    .replaceAll(/(?<lower>[a-z\d])(?<upper>[A-Z])/gu, "$<lower> $<upper>")
    .trim();

  if (spaced.length === 0) {
    return key;
  }

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** Shared lookup with a humanizing fallback, as in `display.ts`. */
const storedKeyLabel = (
  value: string | null | undefined,
  labels: Record<string, string>
): string => {
  if (!value) {
    return "Not set";
  }

  return labels[value] ?? humanizeInventoryKey(value);
};

export const itemConditionLabel = (value: string | null | undefined): string =>
  storedKeyLabel(value, ITEM_CONDITION_LABELS);

export const unitStatusLabel = (value: string | null | undefined): string =>
  storedKeyLabel(value, UNIT_STATUS_LABELS);

export const borrowStatusLabel = (value: string | null | undefined): string =>
  storedKeyLabel(value, BORROW_STATUS_LABELS);

export const custodyChangeTypeLabel = (
  value: string | null | undefined
): string => storedKeyLabel(value, CUSTODY_CHANGE_TYPE_LABELS);

export const disposalMethodLabel = (value: string | null | undefined): string =>
  storedKeyLabel(value, DISPOSAL_METHOD_LABELS);

export const disposalStatusLabel = (value: string | null | undefined): string =>
  storedKeyLabel(value, DISPOSAL_STATUS_LABELS);

export const inventoryActionLabel = (
  value: string | null | undefined
): string => storedKeyLabel(value, INVENTORY_ACTION_LABELS);

export const inventoryTransferReasonLabel = (
  value: string | null | undefined
): string => storedKeyLabel(value, INVENTORY_TRANSFER_REASON_LABELS);
