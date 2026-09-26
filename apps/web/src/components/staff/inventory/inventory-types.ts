/**
 * Every inventory type the web layer uses, derived from the router.
 *
 * **Nothing in this file is hand-written, and nothing in it may become
 * hand-written.** Each name is a projection of `InferRouterOutputs<AppRouter>` /
 * `InferRouterInputs<AppRouter>` at the path the client actually calls, so a
 * server-side change — a renamed column, a dropped field, a new status arm —
 * surfaces here as a compile error in the component that reads it, rather than
 * as a runtime `undefined` on a screen that has already shipped. The repo's
 * convention is that types follow the API automatically; this file is the single
 * place that happens for the inventory feature.
 *
 * Two consequences worth stating:
 *
 * - The projections are **indexed from the output side wherever the value is a
 *   response body** (`BorrowRecord`, `DisposalRecord`, …) and from the input
 *   side only where the wire has no output to read it from — a picklist the UI
 *   must offer but that no list returns (`ItemCondition`, `UnitStatus`,
 *   `TransferReason`).
 * - `InventoryCounters` is `Pick<InventoryItemView, "qty" | "borrowedQty">`
 *   rather than a copy of the interface in
 *   `packages/api/src/routers/inventory/inventory-calculations.ts`. The server
 *   is the authority for that shape, but it is not re-exported through the
 *   router, and a second literal declaration of two fields is exactly the kind
 *   of copy that outlives the thing it copied.
 */
import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import type { AppRouter } from "@school-student-teacher-management/api/routers/index";

type RouterOutputs = InferRouterOutputs<AppRouter>;
type RouterInputs = InferRouterInputs<AppRouter>;

/** Output side of the whole `orpc.inventory.*` tree. */
type InventoryOutput = RouterOutputs["inventory"];
/** Input side of the whole `orpc.inventory.*` tree. */
type InventoryInput = RouterInputs["inventory"];

/** Element type of a response array, without naming the container. */
type ElementOf<T> = T extends readonly (infer U)[] ? U : never;

/**
 * The wire shape of one item, and the row type every list in this feature
 * renders. The same shape comes back from `items.list`, `items.get`,
 * `items.create` and `items.update`, which is what makes one table component
 * correct on the register, on a detail page and on a teacher's own holdings.
 */
export type InventoryItemView = ElementOf<
  InventoryOutput["items"]["list"]["items"]
>;

/**
 * The four derived statuses, read off the view rather than re-listed.
 * `calculateItemStatus` owns this union; a fifth arm is a type error here.
 */
export type InventoryItemStatus = InventoryItemView["status"];

/**
 * The two counters and nothing else. `availableQty` is deliberately absent: it
 * is derived on the server from these two, and a client that recomputed it
 * would be a third implementation of the same subtraction.
 */
export type InventoryCounters = Pick<InventoryItemView, "qty" | "borrowedQty">;

/** `packages/db/src/constants/inventory.ts` `ITEM_CONDITIONS`. */
export type ItemCondition = NonNullable<
  InventoryInput["items"]["update"]["condition"]
>;

/** `packages/db/src/constants/inventory.ts` `UNIT_STATUSES`. */
export type UnitStatus = NonNullable<
  InventoryInput["units"]["update"]["status"]
>;

/**
 * `INVENTORY_TRANSFER_REASONS`. Read off `custody.transfer.reason` because
 * `assignManager.reason` is the same picklist and a change to either has to
 * change both — the DB CHECK behind them is one.
 */
export type TransferReason = InventoryInput["custody"]["transfer"]["reason"];

/** One row of `orpc.inventory.categories.list`. */
export type CategoryOption = ElementOf<InventoryOutput["categories"]["list"]>;

/**
 * One row of `orpc.inventory.options.assignableStaff`.
 *
 * **Every member of staff whose employment is `active` or unset** — teaching and
 * office staff alike, since the `staffCategory = "teacher"` restriction is gone —
 * and the only people a school property may be assigned to: the list holds the
 * identical predicate to `assertStaffIsAssignable`, so the two cannot disagree
 * about who may be handed a school laptop. The three seeded leadership accounts
 * are absent because they are users with no staff row at all, so no predicate on
 * `staff` can reach them.
 */
export type AssignableStaffOption = ElementOf<
  InventoryOutput["options"]["assignableStaff"]
>;

/** One row of `orpc.inventory.units.list` — a single tagged physical unit. */
export type UnitOption = ElementOf<InventoryOutput["units"]["list"]["units"]>;

/** One row of `orpc.inventory.custody.history`, newest first. Carries both `*Label` fields, generated server-side. */
export type CustodyHistoryEntry = ElementOf<
  InventoryOutput["custody"]["history"]
>;

/** One row of `orpc.inventory.custody.myItems`' sibling, `orpc.inventory.borrows.list`. */
export type BorrowRecord = ElementOf<
  InventoryOutput["borrows"]["list"]["borrows"]
>;

/** One row of `orpc.inventory.issues.list`. */
export type IssueRecord = ElementOf<
  InventoryOutput["issues"]["list"]["issues"]
>;

/** One row of `orpc.inventory.disposals.list`. `history` is present only when the caller asked for it. */
export type DisposalRecord = ElementOf<
  InventoryOutput["disposals"]["list"]["disposals"]
>;

/** One row of `orpc.inventory.ledger.transactions` — a before/after counter pair. */
export type TransactionRecord = ElementOf<
  InventoryOutput["ledger"]["transactions"]["transactions"]
>;

/** One row of `orpc.inventory.ledger.auditLogs` — a before/after entity snapshot. */
export type AuditLogRecord = ElementOf<
  InventoryOutput["ledger"]["auditLogs"]["auditLogs"]
>;

/**
 * The filter state the register and the asset-tag register share.
 *
 * The two sentinels — `status: "all"` and the empty string for every id — are
 * part of the state rather than an absence of state, because both are
 * meaningfully different from any real value: `"all"` is a choice the user made
 * and can undo, and `""` is how the UI says "not filtered" without a second
 * boolean per filter. `InventoryFilterBar` maps them to the router's
 * `optional` inputs by dropping the empties, so the URL never carries a
 * meaningless parameter.
 *
 * `includeDeleted` is in this interface and not alongside it, unlike the
 * browser-side "no manager" filter in `inventory-page.tsx`, because **it does
 * have a wire representation**: `listItems` has taken `includeDeleted` since it
 * was written, and it is gated to the three leadership seats. The reason it
 * belongs on the *request* rather than being a predicate over what came back is
 * the opposite reason to the other one — retired rows are not in the response at
 * all unless the request asked for them, so a client-side filter could only ever
 * answer "you have none", which is a sentence that reads as "this store has never
 * retired anything".
 */
export interface InventoryFilters {
  search: string;
  status: InventoryItemStatus | "all";
  categoryId: string;
  condition: string;
  custodianStaffId: string;
  lowStockOnly: boolean;
  /** Un-hide retired items. `listItems` calls this `includeDeleted`. */
  includeDeleted: boolean;
}

/** The unfiltered state, and what `onReset` restores every field to. */
export const DEFAULT_INVENTORY_FILTERS: InventoryFilters = {
  search: "",
  status: "all",
  categoryId: "",
  condition: "",
  custodianStaffId: "",
  lowStockOnly: false,
  includeDeleted: false,
};

/** True when anything at all is narrowing the list. Drives the "Clear filters" affordance. */
export const hasActiveInventoryFilters = (filters: InventoryFilters): boolean =>
  filters.search !== DEFAULT_INVENTORY_FILTERS.search ||
  filters.status !== DEFAULT_INVENTORY_FILTERS.status ||
  filters.categoryId !== DEFAULT_INVENTORY_FILTERS.categoryId ||
  filters.condition !== DEFAULT_INVENTORY_FILTERS.condition ||
  filters.custodianStaffId !== DEFAULT_INVENTORY_FILTERS.custodianStaffId ||
  filters.lowStockOnly !== DEFAULT_INVENTORY_FILTERS.lowStockOnly ||
  filters.includeDeleted !== DEFAULT_INVENTORY_FILTERS.includeDeleted;
