"use client";

import type { InferRouterInputs } from "@orpc/server";
import type { SessionUser } from "@school-student-teacher-management/api/context";
import type { AppRouter } from "@school-student-teacher-management/api/routers/index";
import { canSelfServeInventory } from "@school-student-teacher-management/auth/roles";
import {
  inventoryTransferReasonSchema,
  itemConditionLabel,
  itemConditionSchema,
} from "@school-student-teacher-management/db/constants/inventory";
import { inventoryItemIdSchema } from "@school-student-teacher-management/db/schema/inventory";
import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@school-student-teacher-management/ui/components/tabs";
import { IconCategory, IconPlus, IconRefresh } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { CategoryPanel } from "@/components/staff/inventory/category-panel";
import type { CustodyHoldMode } from "@/components/staff/inventory/custody-dialogs";
import { CustodyDialogs } from "@/components/staff/inventory/custody-dialogs";
import { RegisterSelectionBar } from "@/components/staff/inventory/inventory-register-states";
import { InventoryTable } from "@/components/staff/inventory/inventory-table";
import type {
  CategoryOption,
  InventoryFilters,
  InventoryItemView,
} from "@/components/staff/inventory/inventory-types";
import {
  DEFAULT_INVENTORY_FILTERS,
  hasActiveInventoryFilters,
} from "@/components/staff/inventory/inventory-types";
import { InventoryItemDialogs } from "@/components/staff/inventory/item-dialogs";
import {
  InventoryLifecycleTabs,
  LIFECYCLE_HEADING_ID,
} from "@/components/staff/inventory/lifecycle-tabs";
import type { QrSheetSelection } from "@/components/staff/inventory/qr-sheet-dialog";
import { QrSheetDialog } from "@/components/staff/inventory/qr-sheet-dialog";
import {
  invalidateInventory,
  InventoryFilterBar,
  InventoryInlineNotice,
  InventoryStatCards,
  itemStatusLabel,
} from "@/components/staff/inventory/shared";
import type {
  InventoryMutationScope,
  InventoryStats,
} from "@/components/staff/inventory/shared";
import {
  formatDateTime,
  StockInDialog,
  StockOutDialog,
} from "@/components/staff/inventory/stock-dialogs";
import { formatApiErrorMessage } from "@/lib/api-error";
import { downloadExportFile } from "@/lib/download-export";
import type { InventoryWorkspaceBase } from "@/lib/paths";
import { useActiveYear, yearPath } from "@/lib/paths";
import { orpc } from "@/utils/orpc";

/**
 * The register's page size — `listItems`' own `DEFAULT_LIMIT`, restated because
 * that constant is module-private inside its procedure.
 *
 * Two things depend on this agreeing with the server's, and both are stated where
 * they matter: the table's client-side sort is a sort of the whole result set rather
 * than of an arbitrary slice, and the "showing N of M" line is only meaningful
 * because `listItems` counts `total` against the filter set *before* the limit.
 */
const REGISTER_PAGE_SIZE = 200;

/**
 * `listBorrows`' own `limit` ceiling, and therefore the most open loans this page
 * will ever add up. The ceiling is stated on the card's own comment below rather
 * than pretended away.
 */

/**
 * The mutation inputs, projected from the router.
 *
 * `inventory-types.ts` projects the *outputs*; the inputs are read here because this
 * file is the only one that calls the mutations, and a hand-written copy of seven
 * input shapes is seven more things to keep in step. The benefit is concrete rather
 * than decorative: it is what lets each submit handler cast once, to a named target
 * type, instead of the `as never` the older hooks in this app reach for — so a
 * renamed input field is a compile error at that line rather than a runtime
 * rejection.
 */
type InventoryInputs = InferRouterInputs<AppRouter>["inventory"];
type CreateItemInput = InventoryInputs["items"]["create"];
type UpdateItemInput = InventoryInputs["items"]["update"];
type RemoveItemInput = InventoryInputs["items"]["remove"];
type RestoreItemInput = InventoryInputs["items"]["restore"];
type TransferCustodyInput = InventoryInputs["custody"]["transfer"];
type AssignManagerInput = InventoryInputs["custody"]["assignManager"];
type TakeItemInput = InventoryInputs["custody"]["take"];
type ReleaseCustodyInput = InventoryInputs["custody"]["release"];

/**
 * Every invalidation in this file goes through `invalidateInventory` in
 * `shared/inventory-query-keys.ts`, and the reason it is not a local helper is the
 * defect that helper was written to end.
 *
 * The hand-rolled key block this replaces listed five procedures and every one of
 * the eleven mutation handlers across this feature wrote an `inventory_audit_log`
 * row **without invalidating `ledger.auditLogs`** — so a clerk who raised a
 * write-off, switched to the Change log and found no row had been told the truth
 * about a screen whose own header promises the log is complete. The shared module
 * carries the per-scope key table, `ledger.auditLogs` in **every** scope, and the
 * explanation of why the keys are built with an empty `input: {}` (so a partial deep
 * match reaches every input a procedure has ever been called with, not just the
 * page currently on screen). Read that comment before adding a key here; the answer
 * will be a scope, not a query.
 */

/**
 * The filter state, translated to the router's own `optional` inputs.
 *
 * `InventoryFilters` carries two sentinels the wire does not: `status: "all"` and
 * the empty string for every id. Both are *choices* rather than absences, and both
 * are dropped here so a request never carries a meaningless parameter. Dropping them
 * is also what keeps the query key stable: a filter the user explicitly cleared and
 * one they never set have to produce the same request, or the list refetches for
 * nothing.
 *
 * `condition` is the one filter that has to be **parsed** rather than passed through,
 * because `InventoryFilters` types it as a plain `string` (it is a `<Select>` value,
 * and the filter bar offers the four stored keys) while `listItems` validates it
 * against `itemConditionSchema`. Parsing it here means a value the server would
 * refuse is dropped instead of sent, and the narrowing is what lets the object go
 * straight into `queryOptions` with no cast at all.
 *
 * ## And there is no "no manager" term, because it is not a state
 *
 * `listItems` does still accept a `managerStaffId` (`list-items.ts:114`, applied at
 * `:177`), and the register's filter bar does not offer it, because the column it
 * would filter on is `NOT NULL`: every item is answerable to a named person from
 * the moment it is registered. A filter for rows where the manager is null would
 * match nothing while looking like a real choice, so the control is gone rather
 * than left permanently empty — a button called "No manager only" that empties the
 * whole table is worse than no button, and a card reading "0 items with nobody in
 * charge" tells a storekeeper a question has been closed rather than that the
 * feature was switched off.
 */
const toItemsInput = (filters: InventoryFilters) => {
  const condition = filters.condition
    ? v.safeParse(itemConditionSchema, filters.condition)
    : null;

  return {
    search: filters.search.trim() || undefined,
    status: filters.status === "all" ? undefined : filters.status,
    categoryId: filters.categoryId || undefined,
    condition: condition?.success === true ? condition.output : undefined,
    custodianStaffId: filters.custodianStaffId || undefined,
    lowStockOnly: filters.lowStockOnly || undefined,
    /**
     * `includeDeleted` is passed through as a real server filter and **not** folded
     * into a client-side predicate, for the reason `InventoryFilters` gives: retired
     * rows are not in the response at all unless the request asks for them, so a
     * browser-side filter could only ever say "none of this store's items are
     * retired" — which is false, and false in a way that reads as a fact about the
     * store rather than about the query.
     *
     * `|| undefined` rather than the boolean, so a register with the toggle off
     * sends exactly the request it sent before the filter existed. That keeps the
     * query key stable and means switching the filter off returns the user to a
     * cached page rather than refetching one that has not changed.
     */
    includeDeleted: filters.includeDeleted || undefined,
    limit: REGISTER_PAGE_SIZE,
  };
};

/**
 * The rows the table draws: the page `listItems` returned, unchanged.
 *
 * **Nothing filters this array in the browser any more, and the name is what it
 * is because of what it used to do.** There was a client-side "no manager"
 * predicate here and a card counting its output, and both went with the owner
 * column's `NOT NULL`: with no item able to have a null `managerStaffId` the
 * predicate could match nothing while reading as a real choice.
 *
 * ## `undefined` until a request has answered, and that is the point
 *
 * This used to coalesce "the request has never come back" into `[]`, and the two
 * are not the same fact: one is *we do not know* and the other is *there is
 * nothing there*. Coalescing them is what made a failed first load reachable as an
 * empty register — the table's "no items in the register yet" state, with its
 * "Register the first item" button, printed to a storekeeper whose request had
 * simply timed out. The table branches on `items === undefined` to tell the
 * skeleton, the error panel and the two empty states apart, and that branch is
 * only as good as what it is handed.
 */
const useRegisterRows = (items: InventoryItemView[] | undefined) => items;

/**
 * The filters in force, as one clause a caption and an empty state can both read.
 *
 * ## Why the register says this out loud
 *
 * A filtered register is a *different table* from an unfiltered one: the same
 * columns over a subset of the school. Nothing on screen said so. The "Showing N
 * of M" line in the filter bar reports two numbers, and a number is not a
 * statement about which filters produced it — so a screen-reader user reading
 * "3 items" in the table's caption had no way to know that a search for
 * "projector" was the reason, and a sighted user had to read back up the page to
 * find out. The caption is where a table names itself, and this is that sentence.
 *
 * **Every label is read from the server's own vocabulary** — `itemStatusLabel` for
 * the derived status, `itemConditionLabel` for the condition, the category's own
 * `name` — for the reason `UI.md` gives for every other label in this feature: a
 * component that spelled one of them out would be a second place for the same
 * words to drift, and a printed report that says `damaged` beside a screen that
 * says "Damaged" is the same bug in a different file.
 *
 * **The custodian is the one filter named rather than spelled**, and the wording is
 * deliberate. The resolved person's name lives in `InventoryFilterBar`'s combobox,
 * which owns `useAssignableStaffOptions`; this builder holds a `staffId` and
 * nothing else, and a raw uuid in a caption is noise rather than information. So
 * it says *one custodian's items*, which is true, is the fact a reader needs, and
 * does not pretend to a resolution this file does not have. The name is one line
 * above on screen, in the filter bar, for a reader who wants it.
 */
const describeRegisterFilters = (
  filters: InventoryFilters,
  categories: CategoryOption[]
): string => {
  const parts: string[] = [];

  if (filters.search.trim()) {
    parts.push(`search “${filters.search.trim()}”`);
  }

  if (filters.status !== "all") {
    parts.push(`status ${itemStatusLabel(filters.status)}`);
  }

  if (filters.categoryId) {
    const name = categories.find(
      (category) => category.id === filters.categoryId
    )?.name;
    parts.push(name ? `category ${name}` : "a category");
  }

  if (filters.condition) {
    parts.push(`condition ${itemConditionLabel(filters.condition)}`);
  }

  if (filters.custodianStaffId) {
    parts.push("one custodian's items");
  }

  if (filters.lowStockOnly) {
    parts.push("at or below the reorder level");
  }

  if (filters.includeDeleted) {
    parts.push("including retired items");
  }

  return parts.length === 0
    ? "No filters are applied."
    : `Filtered by ${parts.join(", ")}.`;
};

/**
 * What an `assignManager` call did, in one sentence.
 *
 * Two outcomes, because the owner column is `NOT NULL` and an item can no longer
 * be left without somebody answerable for it: a first appointment, and a
 * replacement. The second names who was replaced, because that is the question the
 * person clicking the button is actually asking — a toast saying only "B is now in
 * charge" leaves the clerk who just replaced A unsure whether the write landed.
 *
 * There used to be a third sentence for the clearing outcome, and the feature used
 * to argue at length that it was the one worth surfacing. `assignManager` no longer
 * has that outcome: `manager_staff_id` is `NOT NULL`, `custody-manager-dialog.tsx`
 * has no clear state left, and `manager_cleared` survives only on historical rows
 * written before that.
 */
const managerChangeMessage = (result: {
  managerName: string | null;
  previousManagerName: string | null;
}): string => {
  if (result.managerName && result.previousManagerName) {
    return `${result.managerName} has taken over from ${result.previousManagerName} as the person in charge of this item`;
  }

  return result.managerName
    ? `${result.managerName} is now in charge of this item`
    : "The person in charge was changed";
};

/**
 * Everything the inventory register does, apart from drawing it.
 *
 * The split is the one `use-classes-page.ts` and `use-teachers-register.ts`
 * already set for this app: queries, mutations, dialog state and every handler
 * live in a hook, and the page component below is markup. It lives in this
 * file rather than in a sixth `use-inventory-page.ts` because the file set for
 * this feature was fixed in advance, and where a hook is filed is a
 * file-count preference rather than an architectural one.
 */
export const useInventoryPage = () => {
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<InventoryFilters>(
    DEFAULT_INVENTORY_FILTERS
  );
  const [selectedItem, setSelectedItem] = useState<InventoryItemView | null>(
    null
  );

  /**
   * The name of the row the current retirement is about, and **it is not
   * `selectedItem`.**
   *
   * The retire confirm is raised from the register's own row menu, which keeps its
   * own target (`useRegisterDialogs` in `inventory-table.tsx`) rather than going
   * through the page's selection — deliberately, because a dialog opened from a row
   * has to be about *that* row. So the success toast used to read `selectedItem`,
   * which any other row action can change in between: open the history for the
   * projector, then retire a laptop from its own menu, and the toast congratulated
   * the reader on retiring the projector. A confirmation whose outcome names the
   * wrong row is worse than one that names no row at all.
   *
   * A piece of state rather than a ref because it is written in a handler and read
   * in a mutation observer, and both are on the same tick as the write — a ref
   * would work and would make the "why not `selectedItem`" argument a question
   * about hooks rather than about the bug.
   */
  const [retiringItemName, setRetiringItemName] = useState<string | null>(null);

  /**
   * Which live rows are ticked, for the one bulk action this register offers:
   * printing their QR labels. This is deliberately not the bulk-selection the
   * table's own doc comment refuses — that comment is about a checkbox
   * column inviting a bulk *write* ("delete everything ticked"), and a label
   * sheet writes nothing at all. Keyed by id rather than by row reference so a
   * refetch (a new array of otherwise-identical rows) does not silently
   * un-tick everything the reader just selected.
   */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [holdMode, setHoldMode] = useState<CustodyHoldMode>("take");
  const [isHoldOpen, setIsHoldOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isStockInOpen, setIsStockInOpen] = useState(false);
  const [isStockOutOpen, setIsStockOutOpen] = useState(false);
  const [isQrSheetOpen, setIsQrSheetOpen] = useState(false);

  // ─── Reads ───────────────────────────────────────────────────────────────

  const categoriesQuery = useQuery(
    orpc.inventory.categories.list.queryOptions()
  );
  const categories: CategoryOption[] = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data]
  );

  const itemsInput = useMemo(() => toItemsInput(filters), [filters]);
  const itemsQuery = useQuery(
    orpc.inventory.items.list.queryOptions({ input: itemsInput })
  );

  /**
   * The low-stock count, as its own query rather than a client-side filter.
   *
   * `listItems` counts `total` against the filter set *before* the limit, so asking
   * for one row with `lowStockOnly: true` costs one row plus one count and returns
   * the register-wide figure. Deriving it from the loaded page instead would be
   * wrong the moment any filter is active, and "low stock" is exactly the card
   * somebody applies a filter and then checks.
   */
  const lowStockQuery = useQuery(
    orpc.inventory.items.list.queryOptions({
      input: { lowStockOnly: true, limit: 1 },
    })
  );

  /**
   * The on-loan figure, and the one number on this page that cannot come off the
   * item rows.
   *
   * `borrowedQty` is a *per-item* counter, so summing the loaded page would produce
   * a total of the filtered page rather than of the school. `borrows.list` with
   * `status: "borrowed"` is school-wide and each row carries the quantity it moved,
   * so the sum of `qty` over open loans is what the card means. Past
   * `MAX_OPEN_BORROWS` open loans it would under-report — a limit of the endpoint
   * rather than of this arithmetic, and stated here rather than hidden.
   *
   * **These are separate round trips because the server has no aggregate endpoint,
   * and adding one is out of scope for this screen.** The register needs totals, the
   * on-hand and on-loan figures come from different tables behind different joins,
   * and a new `inventory.stats` procedure is a fourth file in a package this page
   * only reads. Three cached queries on a desktop-first admin screen is a fair price
   * for not creating a second place that decides what "low stock" means.
   */

  const items = itemsQuery.data?.items;
  const totalCount = itemsQuery.data?.total;

  /**
   * The rows the table draws — the loaded page, unfiltered, and `undefined` until a
   * request has answered. `useRegisterRows` above is the whole of that decision and
   * this alias is the name its callers have always used.
   */
  const visibleItems = useRegisterRows(items);

  /**
   * The six figures, and the honest statement of what each one counts.
   *
   * `totalItems` is the matched total rather than the page length, because
   * `listItems` returns both and only the former is right for a register with more
   * lines than fit on one page. The rest are summed over the **loaded page**, so
   * with no filter active and fewer than 200 rows they are the store's figures, and
   * with a filter active they describe the filtered set — which is the more useful
   * reading anyway, since the table below them is showing the same set. When the
   * page *is* truncated, a summed figure is a floor rather than a total, and the
   * "showing N of M" line above the table is what tells the reader so.
   *
   * **The loading flag is built here, beside the figures, rather than as its own
   * expression in the return object.** It is the union of three separate queries'
   * `isLoading`, and a memo that computed the numbers without it left the two free to
   * describe different render passes: `borrowedUnits` is `0` for the whole duration of
   * the borrows request, and the only thing standing between that `0` and a card
   * reading "Borrowed: 0" was the flag, computed three lines away from the sum it
   * qualifies. One memo, one set of dependencies — so the dependency on
   * `borrowsQuery.isLoading` is load-bearing, and adding a fourth query to this row
   * of figures cannot be half-remembered.
   */
  const { stats, isStatsLoading, statsProblem } = useMemo(() => {
    const rows = items ?? [];

    /**
     * Which of the six figures could not be read, and why that is not a `0`.
     *
     * `borrowedUnits` and `lowStockItems` are the two figures that come from their
     * own query rather than from the loaded page, and a failed query left them at
     * `0` — printed as a confident figure on a card whose whole job is to be acted
     * on. "Borrowed: 0" and "Low stock: 0" are not neutral readings of a failure;
     * they are the two numbers a storekeeper would most believe, and the two most
     * expensive to be wrong about. So the figures are **not** rendered at all when
     * their query failed, and a notice names which ones are missing and why.
     *
     * Both of them are named in one string rather than one notice each: they fail
     * together on a dropped connection, and two stacked banners over a card row is a
     * worse read than one that lists both.
     */
    const missing: string[] = [];
    if (lowStockQuery.isError) {
      missing.push("Low stock");
    }
    if (itemsQuery.isError) {
      missing.push("Items, Units, Available and Out of stock");
    }

    return {
      stats: {
        totalItems: totalCount ?? rows.length,
        totalUnits: rows.reduce((sum, row) => sum + row.qty, 0),
        availableUnits: rows.reduce((sum, row) => sum + row.availableQty, 0),
        outOfStockItems: rows.filter((row) => row.status === "out_of_stock")
          .length,
        lowStockItems: lowStockQuery.data?.total ?? 0,
      } satisfies InventoryStats,
      /**
       * A query that has failed keeps `isLoading` false forever, so a card row
       * would sit at its last value for the rest of the session. Treating an error
       * as "not a figure yet" puts the skeleton back — which is why `statsProblem`
       * below is what actually decides whether a `0` is a fact or a hole.
       */
      isStatsLoading:
        itemsQuery.isLoading || lowStockQuery.isLoading || missing.length > 0,
      /** The figures the cards must not print a number for, or `null`. */
      statsProblem: missing.length > 0 ? missing.join(" and ") : null,
    };
  }, [
    items,
    itemsQuery.isError,
    itemsQuery.isLoading,
    lowStockQuery.data,
    lowStockQuery.isError,
    lowStockQuery.isLoading,
    totalCount,
  ]);

  /**
   * The server's own sentence for whichever of the three stat queries failed, and
   * a retry for all three — they are independent round trips and a retry that
   * re-requests only one of them would leave the notice naming figures the reader
   * still cannot see.
   */
  const statsError = useMemo(() => {
    const failures = [lowStockQuery.error, itemsQuery.error].filter(
      (failure): failure is NonNullable<typeof failure> => Boolean(failure)
    );

    return failures.length > 0
      ? formatApiErrorMessage(
          failures[0],
          "The register's summary figures could not be read"
        )
      : null;
  }, [itemsQuery.error, lowStockQuery.error]);

  const handleRetryStats = useCallback(() => {
    void lowStockQuery.refetch();
    void itemsQuery.refetch();
  }, [itemsQuery, lowStockQuery]);

  // ─── Invalidation ────────────────────────────────────────────────────────

  /**
   * One invalidation entry point for every write on this page, and it is a **scope**
   * rather than a procedure name.
   *
   * The five-key hand-rolled set this replaces was written for the item mutations
   * and then reused for the four custody ones, which is how it ended up invalidating
   * `borrows.list` after a manager change that never touched a loan. The per-scope
   * table in `shared/inventory-query-keys.ts` says what each write actually dirties,
   * and it carries `ledger.auditLogs` in **every** scope — the omission that made the
   * Change log miss a row the screen had just created.
   *
   * The per-item `invalidateCustodyHistory` helper is gone with it, and deliberately:
   * the `custody` scope's `custodyHistory` key is built with `.key({ input: {} })`,
   * which partial-matches **every** item's history query, so a second targeted
   * invalidation would have been a narrower duplicate of work the scope already did.
   */
  const invalidate = useCallback(
    async (scope: InventoryMutationScope) => {
      await invalidateInventory(queryClient, scope);
    },
    [queryClient]
  );

  // ─── Writes ──────────────────────────────────────────────────────────────

  const createItemMutation = useMutation(
    orpc.inventory.items.create.mutationOptions({
      onSuccess: async (created) => {
        toast.success(
          `"${created.name}" registered as ${created.sku}${
            created.uniqueIdCount > 0
              ? ` with ${created.uniqueIdCount} asset tag(s)`
              : ""
          }`
        );
        setIsCreateOpen(false);
        await invalidate("item");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not register this item")
        );
      },
    })
  );

  const updateItemMutation = useMutation(
    orpc.inventory.items.update.mutationOptions({
      onSuccess: async (updated) => {
        toast.success(`"${updated.name}" updated`);
        setIsEditOpen(false);
        await invalidate("item");
      },
      onError: (error) => {
        toast.error(formatApiErrorMessage(error, "Could not save this item"));
      },
    })
  );

  const removeItemMutation = useMutation(
    orpc.inventory.items.remove.mutationOptions({
      onSuccess: async () => {
        toast.success(
          retiringItemName
            ? `"${retiringItemName}" retired — its ledger and custody history are still on file`
            : "Item retired"
        );
        setRetiringItemName(null);
        setSelectedItem(null);
        await invalidate("item");
      },
      onError: (error) => {
        toast.error(formatApiErrorMessage(error, "Could not retire this item"));
        setRetiringItemName(null);
      },
    })
  );

  /**
   * The inverse, and it is a separate mutation rather than a branch on
   * `removeItemMutation` for one concrete reason: **the two have different
   * consequences for the screen they are on.** A retirement removes a row from
   * the register the user is looking at, so the natural next move is to leave it
   * there. A restore *adds* the row back — and it adds it to whichever list the
   * reader is currently looking at, which is the filtered list they turned on
   * "Show retired" to get. The success toast below says which of the two things
   * just happened (the row is back, and it carries the same name, SKU and count it
   * had), because from the reader's side a row appearing after a confirm is
   * otherwise unexplained.
   *
   * The gate is `inventory:update` and the write is one nullable column, so this is
   * an edit in the sense `updateItem` is an edit — see `restore-item.ts` for why it
   * is deliberately not behind `delete`.
   */
  const restoreItemMutation = useMutation(
    orpc.inventory.items.restore.mutationOptions({
      onSuccess: async (restored) => {
        toast.success(
          restored.wasRetiredAt
            ? `"${restored.name}" is back on the register — it was retired on ${formatDateTime(
                restored.wasRetiredAt
              )}`
            : `"${restored.name}" is back on the register`
        );
        await invalidate("item");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not restore this item")
        );
      },
    })
  );

  const transferMutation = useMutation(
    orpc.inventory.custody.transfer.mutationOptions({
      onSuccess: async (result) => {
        /*
         * The server returns both names precisely so this toast can be the whole
         * confirmation. "Custody moved to S. Fernando" tells the user the change
         * landed *and* who holds it now, which is the one fact a transfer's outcome
         * is about — and building the sentence from the form's selection would print
         * whatever the client guessed the name to be.
         */
        toast.success(`Custody of this item moved to ${result.custodianName}`);
        setIsTransferOpen(false);
        setSelectedItem(null);
        await invalidate("custody");
      },
      onError: (error) => {
        toast.error(formatApiErrorMessage(error, "Could not move this item"));
      },
    })
  );

  const assignManagerMutation = useMutation(
    orpc.inventory.custody.assignManager.mutationOptions({
      onSuccess: async (result) => {
        toast.success(managerChangeMessage(result));
        setIsManagerOpen(false);
        setSelectedItem(null);
        await invalidate("custody");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(
            error,
            "Could not change who is in charge of this item"
          )
        );
      },
    })
  );

  const takeItemMutation = useMutation(
    orpc.inventory.custody.take.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          result.changeType === "custody_taken"
            ? "This item is now recorded as yours"
            : "This item is now recorded as yours — the change is logged as a transfer"
        );
        setIsHoldOpen(false);
        setSelectedItem(null);
        await invalidate("custody");
      },
      onError: (error) => {
        toast.error(formatApiErrorMessage(error, "Could not take this item"));
      },
    })
  );

  const releaseMutation = useMutation(
    orpc.inventory.custody.release.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `${result.previousCustodianName ?? "The custodian"} handed this item back to the store`
        );
        setIsHoldOpen(false);
        setSelectedItem(null);
        await invalidate("custody");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(
            error,
            "Could not return this item to the store"
          )
        );
      },
    })
  );

  const seedCategoriesMutation = useMutation(
    orpc.inventory.categories.seed.mutationOptions({
      onSuccess: async (result) => {
        /*
         * The `created` / `skipped` split the procedure returns, because "8
         * categories ready" and "nothing to do" are very different sentences to
         * somebody standing in front of an empty picker — and the skipped half is
         * also the reassurance that a school which has already renamed or recoloured
         * one of the eight has just been told it was left alone.
         */
        toast.success(
          result.created > 0
            ? `Added ${result.created} starter categor${result.created === 1 ? "y" : "ies"} (${result.skipped} already existed)`
            : "Every starter category is already there — nothing was changed"
        );
        await invalidate("category");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not seed the starter categories")
        );
      },
    })
  );

  const exportQrSheetMutation = useMutation(
    orpc.inventory.items.exportQrSheet.mutationOptions({
      onSuccess: (file, variables) => {
        downloadExportFile(file);
        const labelCount = variables.items.reduce(
          (sum, entry) => sum + entry.copies,
          0
        );
        toast.success(
          `Downloaded ${labelCount} QR label${labelCount === 1 ? "" : "s"}`
        );
        setIsQrSheetOpen(false);
        setSelectedIds(new Set());
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not build the QR label sheet")
        );
      },
    })
  );

  const handleToggleSelect = useCallback((itemId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  /**
   * The ids the table's "select all" may tick, and the three numbers the selection
   * bar has to be honest about — one pass over `visibleItems`, because every answer
   * is about the same page of rows and a second pass would only recompute it.
   *
   * ## The reconciliation, and why a tick is allowed to stop counting
   *
   * `selectedIds` is keyed by id, so a refetch that replaces the array does not
   * un-tick anything the reader just selected — which is the property the
   * selection has to have. But "the selection survives" is not the same as "the
   * selection is still meaningful", and two things quietly break it:
   *
   * - **A filter narrows the page.** Ticking five rows, then typing `projector`,
   *   moves four of them out of `visibleItems`. The bar still said "5 items
   *   selected", the button still said "Download QR sheet", and the sheet came back
   *   with one label on it. A short QR sheet is a physical job somebody has to
   *   notice and finish by hand, so the button now carries the number it will
   *   produce and the bar names where the rest went.
   * - **A row is retired** — by this register's own retire dialog, or by another
   *   clerk on another machine. Its checkbox is disabled, `selectableIds` has
   *   dropped it, and the old `selectedItemsForQrSheet` was still collecting it
   *   because it only tested `selectedIds.has(...)`. A label for a retired item is
   *   a label for a row that is not on the register, and `UI.md` records why retired
   *   rows are excluded from selection in the first place: there is nothing left to
   *   scan into them.
   *
   * Both are *reported* rather than silently corrected. Dropping a tick the reader
   * did not ask to drop is its own kind of lie — the count would go down without
   * anybody having done anything — so the tick stays held, the button's number is
   * the number that will actually be labelled, and the two reasons are named
   * separately because they need different fixes: a retired row is never labelable
   * again, a hidden one only needs the filter widened.
   *
   * `selectedIds.size` is the number the *reader* chose, so it is the number the
   * bar leads with; `labelableCount` is the number the *action* will touch, so it
   * is the number on the button. The two are equal whenever the reader has not
   * narrowed anything, and the bar says so rather than staying silent about it.
   *
   * ## Two buckets now, and the third was a browser-side filter's doing
   *
   * There used to be a `hiddenCount` here — ticks held whose row a client-side
   * predicate had filtered out, printed as "N are hidden by the current filters".
   * The only filter that could hide a row this way was the "no manager" one, so
   * with it gone `onScreenSelected` is the whole loaded page and
   * `onPageSelected` is the same set: the difference is arithmetic on equal
   * numbers, and a bar that can only ever print "0 hidden" is a control narrating
   * a state that cannot exist. What remains is a bucket that is genuinely
   * different: a tick whose row is not in the loaded results at all, because
   * another clerk retired it or the refetch brought a different page.
   */
  const { selectableIds, selectedItemsForQrSheet, selection } = useMemo(() => {
    const ids: string[] = [];
    const onScreenSelected: InventoryItemView[] = [];
    for (const item of visibleItems ?? []) {
      if (!item.deletedAt) {
        ids.push(item.id);
      }
      if (selectedIds.has(item.id)) {
        onScreenSelected.push(item);
      }
    }

    const labelable = onScreenSelected.filter((item) => !item.deletedAt);
    const retired = onScreenSelected.filter((item) => item.deletedAt);
    const onPageCount = (items ?? []).filter((item) =>
      selectedIds.has(item.id)
    ).length;
    const missing = Math.max(selectedIds.size - onPageCount, 0);

    return {
      selectableIds: ids,
      selectedItemsForQrSheet: labelable,
      selection: {
        selectedCount: selectedIds.size,
        labelableCount: labelable.length,
        retiredCount: retired.length,
        missingCount: missing,
      },
    };
  }, [visibleItems, items, selectedIds]);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedIds((previous) =>
      selectableIds.every((id) => previous.has(id))
        ? new Set()
        : new Set(selectableIds)
    );
  }, [selectableIds]);

  const handleDownloadQrSheet = useCallback(() => {
    if (selection.labelableCount === 0) {
      return;
    }
    setIsQrSheetOpen(true);
  }, [selection.labelableCount]);

  const handleQrSheetOpenChange = useCallback((open: boolean) => {
    setIsQrSheetOpen(open);
  }, []);

  const handleQrSheetSubmit = useCallback(
    (labelPlan: QrSheetSelection[]) => {
      exportQrSheetMutation.mutate({
        items: labelPlan as never,
        origin: window.location.origin,
      });
    },
    [exportQrSheetMutation]
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ─── Filters ─────────────────────────────────────────────────────────────

  const handleFiltersChange = useCallback(
    (patch: Partial<InventoryFilters>) => {
      setFilters((previous) => ({ ...previous, ...patch }));
    },
    []
  );

  /**
   * Clearing everything, which is now a reset of the one filters object.
   *
   * There was a client-side "no manager" key on top of `InventoryFilters` once, and
   * this handler had to reach past `hasActiveInventoryFilters` to clear it — a reset
   * that left a filter on produces a register the user believes they have just
   * cleared filters on and have not. With that key gone the shared defaults are the
   * whole of the reset, and the predicate the filter bar uses to show its own
   * "Clear filters" button is looking at the same object this handler replaces.
   */
  const handleFiltersReset = useCallback(() => {
    setFilters(DEFAULT_INVENTORY_FILTERS);
  }, []);

  const handleRetryItems = useCallback(
    () =>
      /**
       * The promise is returned rather than swallowed, and that is what makes
       * `QueryErrorPanel`'s retry button honest: it awaits the caller's return and
       * holds its own busy state for the length of the request. A handler that
       * returns `void` gives the button a microtask of "Trying again…" and then
       * lets the reader click again while the first request is still in flight.
       */
      itemsQuery.refetch(),
    [itemsQuery]
  );

  const handleRetryCategories = useCallback(
    () => categoriesQuery.refetch(),
    [categoriesQuery]
  );

  // ─── Row actions ─────────────────────────────────────────────────────────

  /**
   * Opening any action on a row sets the selected item *first*.
   *
   * Every dialog and the history panel read the item from this one piece of state
   * rather than each taking their own copy, so there is exactly one answer to "which
   * item is this about" at any moment. That matters because the dialogs do not own
   * their subject: closing one must not leave a stale row behind for the next to
   * open on, and the mutations above clear the selection on success for the same
   * reason.
   */
  const selectItem = useCallback((item: InventoryItemView) => {
    setSelectedItem(item);
  }, []);

  /**
   * The row's click target *is* the custody panel.
   *
   * That is a decision rather than a gap: the register's own detail surface on this
   * screen is the history, because the history is what makes the row's two most
   * important columns — manager and custodian — auditable rather than merely
   * asserted. So clicking a row and choosing "View custody history" from its menu
   * arrive at the same place, deliberately, and the menu entry exists to make that
   * discoverable rather than to offer a second destination.
   */
  const handleOpenItem = useCallback(
    (item: InventoryItemView) => {
      selectItem(item);
      setIsHistoryOpen(true);
    },
    [selectItem]
  );

  const handleTransferCustody = useCallback(
    (item: InventoryItemView) => {
      setIsHistoryOpen(false);
      selectItem(item);
      setIsTransferOpen(true);
    },
    [selectItem]
  );

  const handleAssignManager = useCallback(
    (item: InventoryItemView) => {
      setIsHistoryOpen(false);
      selectItem(item);
      setIsManagerOpen(true);
    },
    [selectItem]
  );

  /**
   * The two owner verbs, reached from the register's row menu.
   *
   * **The page adds the selected item and nothing else.** Both dialogs own their
   * mutation, their toast and their invalidation — that is the stated reason
   * `CustodyDialogs`' own banner gives for keeping them out of this page's dialog
   * list — and they take their item as a prop, so the only thing missing was somebody
   * to open them. `setIsHistoryOpen(false)` is absent on purpose: the custody sheet
   * is a modal panel, so a row menu is not reachable while it is open, and closing a
   * sheet that is not open would be a statement about a state the user cannot be in.
   *
   * `selectItem` is still called, so the register keeps exactly one answer to "which
   * item is this about" — the invariant every other row action above upholds, and the
   * reason closing one of these dialogs cannot leave a stale row behind for the next
   * one to open on. The *dialog* itself is given the table's own target rather than
   * this one, for the same reason `retireTarget` is: it is the row the menu was
   * opened from, and a second copy of it would be a second answer.
   */
  const handleTransferOwnership = useCallback(
    (item: InventoryItemView) => {
      selectItem(item);
    },
    [selectItem]
  );

  const handleReclaimCustody = useCallback(
    (item: InventoryItemView) => {
      selectItem(item);
    },
    [selectItem]
  );

  const handleTakeItem = useCallback(
    (item: InventoryItemView) => {
      setHoldMode("take");
      selectItem(item);
      setIsHoldOpen(true);
    },
    [selectItem]
  );

  const handleReleaseCustody = useCallback(
    (item: InventoryItemView) => {
      setHoldMode("release");
      selectItem(item);
      setIsHoldOpen(true);
    },
    [selectItem]
  );

  const handleEditItem = useCallback(
    (item: InventoryItemView) => {
      selectItem(item);
      setIsEditOpen(true);
    },
    [selectItem]
  );

  const handleCreateItem = useCallback(() => {
    setSelectedItem(null);
    setIsCreateOpen(true);
  }, []);

  /**
   * The edit form's four "you cannot change this here" buttons.
   *
   * The custody pair closes the edit dialog on the way, because a modal stacked on a
   * modal is a dialog the reader has to dismiss twice to get back to the row they
   * were on. The two stock movements belong to `stock-dialogs.tsx` and are rendered
   * by this page so the buttons are wired to real dialogs rather than being
   * decoration — a button on a form that does nothing is worse than no button,
   * because it teaches the reader that this form's footer is decorative.
   */
  const handleEditTransferCustody = useCallback(() => {
    setIsEditOpen(false);
    setIsTransferOpen(true);
  }, []);

  const handleEditAssignManager = useCallback(() => {
    setIsEditOpen(false);
    setIsManagerOpen(true);
  }, []);

  const handleRecordStockIn = useCallback(() => {
    setIsEditOpen(false);
    setIsStockInOpen(true);
  }, []);

  const handleWriteOffStock = useCallback(() => {
    setIsEditOpen(false);
    setIsStockOutOpen(true);
  }, []);

  // ─── Submits ─────────────────────────────────────────────────────────────

  /**
   * Each submit casts once, to a named input type projected from the router.
   *
   * The cast is needed because the forms build a plain object and hand it over as
   * `Record<string, unknown>` — the same shape `ClassDialogs` and `TeacherDialogs`
   * use, so the dialog components stay free of API types. The difference is the
   * target: naming `CreateItemInput` means a field the server stops accepting is a
   * compile error at this line, where `as never` would have been silence. The ids
   * inside are parsed through the repository's own schemas rather than asserted,
   * because the wire carries them as plain strings and a malformed one should be
   * caught here rather than becoming a foreign-key violation from the driver.
   */
  const handleCreateSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      await createItemMutation.mutateAsync(values as CreateItemInput);
    },
    [createItemMutation]
  );

  const handleEditSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (!selectedItem) {
        return;
      }

      await updateItemMutation.mutateAsync({
        itemId: v.parse(inventoryItemIdSchema, selectedItem.id),
        ...values,
      } as UpdateItemInput);
    },
    [selectedItem, updateItemMutation]
  );

  const handleRetireItem = useCallback(
    async (item: InventoryItemView) => {
      // Named before the write, so the toast is about this row and not about
      // whatever else the reader has touched since the menu was opened.
      setRetiringItemName(item.name);
      await removeItemMutation.mutateAsync({
        itemId: v.parse(inventoryItemIdSchema, item.id),
      } as RemoveItemInput);
    },
    [removeItemMutation]
  );

  const handleRestoreItem = useCallback(
    async (item: InventoryItemView) => {
      await restoreItemMutation.mutateAsync({
        itemId: v.parse(inventoryItemIdSchema, item.id),
      } as RestoreItemInput);
    },
    [restoreItemMutation]
  );

  const handleTransferSubmit = useCallback(
    async (values: {
      itemId: string;
      newCustodianStaffId: string;
      reason: string;
      note?: string;
    }) => {
      await transferMutation.mutateAsync({
        itemId: v.parse(inventoryItemIdSchema, values.itemId),
        newCustodianStaffId: v.parse(staffIdSchema, values.newCustodianStaffId),
        reason: v.parse(inventoryTransferReasonSchema, values.reason),
        ...(values.note ? { note: values.note } : {}),
      } as TransferCustodyInput);
    },
    [transferMutation]
  );

  const handleManagerSubmit = useCallback(
    async (values: {
      itemId: string;
      newManagerStaffId: string;
      reason: string;
      note?: string;
    }) => {
      await assignManagerMutation.mutateAsync({
        itemId: v.parse(inventoryItemIdSchema, values.itemId),
        newManagerStaffId: v.parse(staffIdSchema, values.newManagerStaffId),
        reason: v.parse(inventoryTransferReasonSchema, values.reason),
        ...(values.note ? { note: values.note } : {}),
      } as AssignManagerInput);
    },
    [assignManagerMutation]
  );

  const handleHoldSubmit = useCallback(
    async (values: {
      itemId: string;
      note?: string;
      newCustodianStaffId?: string;
    }) => {
      const payload = {
        itemId: v.parse(inventoryItemIdSchema, values.itemId),
        ...(values.newCustodianStaffId
          ? {
              newCustodianStaffId: v.parse(
                staffIdSchema,
                values.newCustodianStaffId
              ),
            }
          : {}),
        ...(values.note ? { note: values.note } : {}),
      };

      if (holdMode === "take") {
        await takeItemMutation.mutateAsync(payload as TakeItemInput);
        return;
      }

      await releaseMutation.mutateAsync(payload as ReleaseCustodyInput);
    },
    [holdMode, releaseMutation, takeItemMutation]
  );

  const handleSeedCategories = useCallback(() => {
    seedCategoriesMutation.mutate();
  }, [seedCategoriesMutation]);

  /**
   * Dialog visibility, as `handle*` actions rather than raw setters.
   *
   * `teachers-page.tsx` does the same and the reason holds: the page below is
   * markup, and `onCreateOpenChange={setIsCreateOpen}` reads as a raw store setter
   * wired into a prop rather than as "this page opens the create dialog". It also
   * keeps every `set*` out of the returned object, so the page cannot accidentally
   * hand a setter to something that is not a dialog.
   */
  const handleCreateOpenChange = useCallback((open: boolean) => {
    setIsCreateOpen(open);
  }, []);
  const handleEditOpenChange = useCallback((open: boolean) => {
    setIsEditOpen(open);
  }, []);
  const handleTransferOpenChange = useCallback((open: boolean) => {
    setIsTransferOpen(open);
  }, []);
  const handleManagerOpenChange = useCallback((open: boolean) => {
    setIsManagerOpen(open);
  }, []);
  const handleHoldOpenChange = useCallback((open: boolean) => {
    setIsHoldOpen(open);
  }, []);
  const handleHistoryOpenChange = useCallback((open: boolean) => {
    setIsHistoryOpen(open);
  }, []);
  const handleCategoriesOpenChange = useCallback((open: boolean) => {
    setIsCategoriesOpen(open);
  }, []);
  const handleStockInOpenChange = useCallback((open: boolean) => {
    setIsStockInOpen(open);
  }, []);
  const handleStockOutOpenChange = useCallback((open: boolean) => {
    setIsStockOutOpen(open);
  }, []);

  return {
    // Reads
    categories,
    categoriesError: categoriesQuery.error,
    isCategoriesLoading: categoriesQuery.isLoading,
    /**
     * The rows the table draws — the loaded page, unfiltered, and `undefined` until
     * a request has answered so the table can tell a skeleton from an empty store.
     */
    items: visibleItems,
    totalCount,
    itemsError: itemsQuery.error,
    isItemsLoading: itemsQuery.isLoading,
    /**
     * Whether a retry of the register's own read is in flight, so the table's
     * error panel and its stale-rows notice can both report progress rather than
     * inviting a second click on a request that is already running.
     */
    isItemsRetrying: itemsQuery.isFetching && items !== undefined,
    stats,
    isStatsLoading,
    /** The figures the cards must not print a number for, or `null`. */
    statsProblem,
    /** The server's sentence for the stat failure, or `null`. */
    statsError,
    /** Retries all three stat reads, because any of them can be the one that failed. */
    handleRetryStats,
    /**
     * The same predicate the filter bar's own "Clear filters" button uses, which is
     * now also the whole of it: every filter the register has is a server-side one on
     * `InventoryFilters`. They must be one predicate, because the button appears on
     * the bar and the table picks between its two empty states on this flag, so a
     * register that cleared its filters and still said "nothing matches these
     * filters" would be telling the reader to do something they had already done.
     */
    isFiltered: hasActiveInventoryFilters(filters),
    /**
     * The filters in force, as one clause, for the table's `<caption>` and its
     * no-results state. Built here because this is the only place that holds both
     * the filter state and the category list needed to name a category.
     */
    filterSummary: describeRegisterFilters(filters, categories),

    // Filters
    filters,
    handleFiltersChange,
    handleFiltersReset,
    handleRetryItems,
    handleRetryCategories,
    /**
     * The two numbers the "showing N of M" line needs: the rows the server matched
     * on this page, and its own count of the rows it matched in total.
     *
     * Both are the server's figures, which is what they always were once the
     * browser-side filter went: `totalCount` is the count of the rows behind the
     * search term and the selects, and `resultCount` is how many of them fit in the
     * 200-row page. The table's own `aria-label` and truncation check read the same
     * pair, so the sighted and the non-visual reading cannot disagree. Handing the
     * bar a `resultCount` that had been filtered again in the browser would print
     * "Showing 12 of 340" — a sentence about nothing — so this is deliberately the
     * page length, unmodified.
     */
    resultCount: items?.length,

    // Item dialogs
    selectedItem,
    isCreateOpen,
    handleCreateOpenChange,
    isEditOpen,
    handleEditOpenChange,
    isCreatePending: createItemMutation.isPending,
    isEditPending: updateItemMutation.isPending,
    isRetirePending: removeItemMutation.isPending,
    isRestorePending: restoreItemMutation.isPending,
    handleCreateItem,
    handleCreateSubmit,
    handleEditSubmit,
    handleRetireItem,
    handleRestoreItem,

    // Custody dialogs
    isTransferOpen,
    handleTransferOpenChange,
    isTransferPending: transferMutation.isPending,
    handleTransferSubmit,
    isManagerOpen,
    handleManagerOpenChange,
    isManagerPending: assignManagerMutation.isPending,
    handleManagerSubmit,
    holdMode,
    isHoldOpen,
    handleHoldOpenChange,
    isHoldPending: takeItemMutation.isPending || releaseMutation.isPending,
    handleHoldSubmit,
    isHistoryOpen,
    handleHistoryOpenChange,

    // Categories
    isCategoriesOpen,
    handleCategoriesOpenChange,
    isSeedPending: seedCategoriesMutation.isPending,
    handleSeedCategories,

    // Selection — QR labels only, see the state's own doc comment
    selectedIds,
    selectableIds,
    handleToggleSelect,
    handleToggleSelectAll,
    handleClearSelection,
    handleDownloadQrSheet,
    isExportingQrSheet: exportQrSheetMutation.isPending,
    isQrSheetOpen,
    handleQrSheetOpenChange,
    handleQrSheetSubmit,
    selectedItemsForQrSheet,
    /** The four numbers the selection bar is built from. */
    selection,

    // The two stock movements, owned by `stock-dialogs.tsx` and opened from the edit
    // form's note about what it cannot change.
    isStockInOpen,
    handleStockInOpenChange,
    isStockOutOpen,
    handleStockOutOpenChange,

    // Row actions
    handleOpenItem,
    handleTransferCustody,
    handleAssignManager,
    handleTransferOwnership,
    handleReclaimCustody,
    handleTakeItem,
    handleReleaseCustody,
    handleEditItem,
    handleEditTransferCustody,
    handleEditAssignManager,
    handleRecordStockIn,
    handleWriteOffStock,
  };
};

/**
 * The Records pane's five sub-views — the four lifecycle tabs
 * (`lifecycle-tabs.tsx`) plus the ledger section at their foot — as real path
 * segments rather than `?tab=`/`?subtab=` query state. Each is its own route
 * file (`inventory.loans.tsx`, `inventory.issues.tsx`, `inventory.write-offs.tsx`,
 * `inventory.asset-register.tsx`, `inventory.ledger.tsx`, mirroring the
 * dot-notation convention `teacher-timetable.$staffId.tsx` already sets in this
 * app), so every one of these six views is bookmarkable, shareable and gets its
 * own browser-history entry — the same reasoning the equipment pages' own
 * `equipment.in-charge.tsx` etc. give for the identical change there.
 */
export type InventorySection =
  | "register"
  | "issues"
  | "write-offs"
  | "asset-register"
  | "ledger";

/** Which of `InventoryLifecycleTabs`' four `Tabs` values a section maps to. */
const LIFECYCLE_SUBTAB_OF: Record<
  Exclude<InventorySection, "register">,
  "issues" | "write-offs" | "register"
> = {
  issues: "issues",
  "write-offs": "write-offs",
  "asset-register": "register",
  // The ledger section sits at the foot of the Records pane regardless of
  // which lifecycle tab is active above it, so `/ledger` lands on Records
  // with Issues (the pane's default for records) underneath and scrolls to the
  // ledger heading — see `scrollToLedger` on `InventoryLifecycleTabs`.
  ledger: "issues",
};
/**
 * The administrator's inventory page: two panes over one URL.
 *
 * The two panes below sit around a page that is still markup only: the queries,
 * the mutations, the dialog state and every handler live in `useInventoryPage`,
 * and the wrapper adds nothing but the tab state above.
 *
 * ## Why this order, and why two
 *
 * **1. Register.** The question a clerk opens this page with is "what does the
 * school owns, who is responsible for it, and what can I hand out right now", and
 * the register is the only pane that answers all three in one screen. It goes
 * first so the first paint answers the primary question.
 *
 * **2. Records.** Loans, issues, write-offs, the asset register and the two ledgers.
 * Evidence and outstanding work — the queue that needs chasing, the certificate an
 * audit will ask for, and the forensic tail you read when something is wrong. Second
 * because it is consulted deliberately, and because `lifecycle-tabs.tsx` has already
 * made its own internal ordering argument: the one row that is *wrong right now* (an
 * overdue loan) sorts to the top of its own list.
 *
 * **The third pane, "Ledger", was removed rather than renamed.** The two ledgers are
 * still on the page — at the foot of Records, where `lifecycle-tabs.tsx` heads them
 * and explains what each is for — so nothing became unreachable; what went away is the
 * second mount of the same component. Three panes' worth of meaning, two panes'
 * worth of tabs, and the rule applied is the one worth stating: a component that is
 * rendered in two places on one screen is two components, and the one that is
 * canonical has to be the one that carries the heading.
 *
 * ## The heading structure, because there used to be three names for one screen
 *
 * The sidebar says "Equipment", the register panel carried an `<h1>Inventory</h1>`,
 * and the Records pane carried an `<h1>Stock movements</h1>` — the page's own name
 * vanishing the moment the user left the register, and two `h1`s inside one document.
 * So: **one `h1`, and it names the page**, above the tab bar where it cannot be
 * unmounted by switching panes. Each pane is a `<section>` with an accessible name —
 * the register's own visible `<h2>`, and an `aria-label` on the Records pane, whose
 * heading belongs to `lifecycle-tabs.tsx`. That last one is the remaining half of
 * this fix and it is not in this file: `lifecycle-tabs.tsx:110` renders its "Stock
 * movements" as an `<h1>`, and it should be an `<h2>` for the outline to be correct.
 */
/**
 * The one object the Register pane renders from: everything `useInventoryPage`
 * returns.
 *
 * Named here rather than written out as a prop list, so the pane and the hook
 * cannot drift apart — a handler the hook stops returning is a type error at
 * the pane instead of a silently dead button.
 */
type InventoryPageState = ReturnType<typeof useInventoryPage>;

/**
 * The pane's name and its two page actions.
 *
 * Its own component because the pane is a stack of five concerns and this is the
 * one that is not a filter, a notice or a dialog: it is the pane's identity, and
 * it is the only place on the page that names what the reader is looking at.
 */
const RegisterPaneHeader = ({ page }: { page: InventoryPageState }) => (
  <div className="flex flex-wrap items-start justify-between gap-2">
    <div>
      {/*
        The pane's name, and an `h2` rather than the `h1` this used to be.
        The page's own `h1` sits above the tab bar, so it survives a change
        of pane, and the heading a screen-reader user hears on entering this
        pane is "Register" — which is what the tab they just activated is
        called, rather than the name of a sibling screen.
      */}
      <h2
        id="inventory-register-heading"
        className="font-heading text-2xl font-semibold"
      >
        Register
      </h2>
    </div>
    <div className="flex flex-wrap gap-2">
      {/*
        "Categories", not "Store categories". The empty-state copy below tells
        the user to look for "Seed categories", and the button beside it used
        to be called "Store categories" — a fourth name for the same thing,
        and a verb phrase that reads as an action on the categories rather
        than a way in to them. This opens the panel that seeds, renames and
        removes them; the seed action inside it says what it does.
      */}
      <Button
        variant="outline"
        onClick={() => page.handleCategoriesOpenChange(true)}
        data-icon="inline-start"
      >
        <IconCategory data-icon="inline-start" />
        Categories
      </Button>
      <Button onClick={page.handleCreateItem} data-icon="inline-start">
        <IconPlus data-icon="inline-start" />
        Register item
      </Button>
    </div>
  </div>
);

/**
 * The two things this screen can know and not know, side by side.
 *
 * They are one component because they are one pair of questions, and the answer to
 * each is the *absence* of the other: a store with no categories cannot have an
 * item created, and a store whose categories could not be read is in a completely
 * different position from one that has none. Rendering them in one place is what
 * makes it obvious that the first is a rule and the second is a failure, and it is
 * why the first is suppressed when the second is true.
 */
const RegisterPaneNotices = ({ page }: { page: InventoryPageState }) => (
  <>
    {/*
      The one standing condition this screen can be in, stated as a rule rather
      than as a failure. A store with no categories cannot have an item created
      at all — `createItem` requires a `categoryId` behind a `restrict` foreign
      key — so this is not decoration: it names the blocker, and it disappears
      on its own once the categories exist rather than needing to be dismissed.

      **And it is not shown when the categories could not be *read*.** An empty
      response and a failed response are the same `[]` in this component's hands,
      and this notice is a confident sentence about the school: "this store has
      no categories yet". Printing it because a request timed out tells a
      storekeeper with a full taxonomy to open a panel and seed eight categories
      that are already there. The failure gets its own notice below, which says
      what it does not know rather than what it does.
    */}
    {page.categories.length === 0 &&
    !page.isCategoriesLoading &&
    !page.categoriesError ? (
      <InventoryInlineNotice
        tone="warning"
        title="This store has no categories yet"
        description="Nothing can be added to the register until at least one category exists, because every item has to belong to one. The eight starter categories are the fastest way to get there, and running it again is safe — it skips anything already there. Open Categories to use it."
      />
    ) : null}

    {/*
      The partial case, and it is the one this screen can be in that is not a
      *state* of the store. `categories.list` failed while the register itself
      loaded perfectly, so the table below is complete and correct while every
      category picker, the category filter and the item form's category field are
      reading an empty list. A notice that names the failure and says what is
      affected is the difference between "the register is broken" and "the filter
      above the table is not showing you its options".
    */}
    {page.categoriesError ? (
      <InventoryInlineNotice
        tone="danger"
        title="The store's categories could not be read"
        description={`${formatApiErrorMessage(page.categoriesError, "The category list could not be loaded")} The items below are unaffected, but the category filter, the Categories panel and the category field on the item form have nothing to show until this is retried.`}
      />
    ) : null}

    {/*
      The summary row's holes, named. `InventoryStatCards` takes one `isLoading`
      for seven figures, so a single failed query blanks all seven rather than
      printing a `0` for the two it could not read — and this notice is what says
      **which** figures are missing, so a skeleton is never mistaken for a
      register that is merely busy. The retry re-requests all three, because
      `Borrowed` and `Low stock` come from their own round trips and either can
      be the one that failed.
    */}
    {page.statsProblem ? (
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <InventoryInlineNotice
            tone="danger"
            title={`The register's summary could not be read: ${page.statsProblem}`}
            description={`${page.statsError ?? ""} Those figures are left blank rather than shown as zero. The items in the table below are unaffected.`}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={page.handleRetryStats}
          data-icon="inline-start"
        >
          <IconRefresh data-icon="inline-start" />
          Try the summary again
        </Button>
      </div>
    ) : null}
  </>
);

/**
 * Every dialog the register's row actions open, in one place.
 *
 * Its own component for the same reason the table mounts its four dialogs beside
 * itself: a dialog is state, state is not markup, and a pane whose body is half
 * dialog props cannot be read as a layout. It reads the hook's result and nothing
 * else, exactly like the pane.
 */
const RegisterPaneDialogs = ({ page }: { page: InventoryPageState }) => (
  <>
    <InventoryItemDialogs
      categories={page.categories}
      selectedItem={page.selectedItem}
      isCreateOpen={page.isCreateOpen}
      onCreateOpenChange={page.handleCreateOpenChange}
      isEditOpen={page.isEditOpen}
      onEditOpenChange={page.handleEditOpenChange}
      isCreatePending={page.isCreatePending}
      isEditPending={page.isEditPending}
      onCreateSubmit={page.handleCreateSubmit}
      onEditSubmit={page.handleEditSubmit}
      editActions={{
        isLoading: page.isEditPending,
        handleTransferCustody: page.handleEditTransferCustody,
        handleAssignManager: page.handleEditAssignManager,
        handleRecordStockIn: page.handleRecordStockIn,
        handleWriteOffStock: page.handleWriteOffStock,
      }}
    />

    <CustodyDialogs
      item={page.selectedItem}
      isTransferOpen={page.isTransferOpen}
      onTransferOpenChange={page.handleTransferOpenChange}
      isTransferPending={page.isTransferPending}
      onTransferSubmit={page.handleTransferSubmit}
      isManagerOpen={page.isManagerOpen}
      onManagerOpenChange={page.handleManagerOpenChange}
      isManagerPending={page.isManagerPending}
      onManagerSubmit={page.handleManagerSubmit}
      holdMode={page.holdMode}
      isHoldOpen={page.isHoldOpen}
      onHoldOpenChange={page.handleHoldOpenChange}
      isHoldPending={page.isHoldPending}
      onHoldSubmit={page.handleHoldSubmit}
      isHistoryOpen={page.isHistoryOpen}
      onHistoryOpenChange={page.handleHistoryOpenChange}
    />

    <CategoryPanel
      open={page.isCategoriesOpen}
      onOpenChange={page.handleCategoriesOpenChange}
      categories={page.categories}
      isLoading={page.isCategoriesLoading}
      error={page.categoriesError}
      onRetry={page.handleRetryCategories}
      onSeed={page.handleSeedCategories}
      isSeedPending={page.isSeedPending}
    />

    <StockInDialog
      open={page.isStockInOpen}
      onOpenChange={page.handleStockInOpenChange}
    />
    <StockOutDialog
      open={page.isStockOutOpen}
      onOpenChange={page.handleStockOutOpenChange}
    />

    <QrSheetDialog
      open={page.isQrSheetOpen}
      onOpenChange={page.handleQrSheetOpenChange}
      items={page.selectedItemsForQrSheet}
      isSubmitting={page.isExportingQrSheet}
      onSubmit={page.handleQrSheetSubmit}
    />
  </>
);

/**
 * The Register pane — the catalog, its filters, its table and every dialog the
 * table's row actions open.
 *
 * Split out of `InventoryPage` because it is one self-contained half of that
 * page: it reads the hook's result and nothing else, and the page above it adds
 * only the tab bar, the heading and the Records pane. It is a component and not
 * a chunk of markup inlined in the parent for the same reason the two panes are
 * two components — a 300-line function is a page and its half at once, and
 * neither can be read without the other in the way.
 *
 * **And it is four components, because it grew to one too many.** The header, the
 * notices, the filter row and the dialogs are four different reasons for markup to
 * exist on this page, and a reader looking for "which query failed" should not have
 * to read past a form's prop list to find it. `registerLabel` comes in as a prop
 * rather than being built from the hook because it needs the academic year, which
 * `InventoryPage` reads from the route and `useInventoryPage` does not: the year is
 * the spine of this app's navigation and a hook that reached for it would be a
 * second address for the same fact.
 */
const InventoryRegisterPane = ({
  page,
  registerLabel,
  canSelfServe,
}: {
  page: InventoryPageState;
  registerLabel: string;
  /**
   * Passed rather than read here, because the session is the page's to read and
   * the pane's to draw: this component is the register's markup, and the one
   * thing it must not decide for itself is who is allowed to press which button.
   */
  canSelfServe: boolean;
}) => (
  <section
    aria-labelledby="inventory-register-heading"
    className="flex flex-col gap-4"
  >
    <RegisterPaneHeader page={page} />

    <RegisterPaneNotices page={page} />

    <InventoryStatCards stats={page.stats} isLoading={page.isStatsLoading} />

    <InventoryFilterBar
      {...page.filters}
      onChange={page.handleFiltersChange}
      onReset={page.handleFiltersReset}
      categories={page.categories}
      resultCount={page.resultCount}
      totalCount={page.totalCount}
    />

    {/*
      The one bulk action a ticked row offers, and it only appears once something is
      ticked — an always-visible download button that does nothing until a row is
      selected is a control offered to somebody who has not yet done the thing it
      needs.

      **It is its own component, and it states the number of rows the action will
      touch.** The markup that was here said "5 items selected" beside a button that
      said "Download QR sheet", and both numbers were the reader's *ticks* — so a
      filter that had moved four of them off the page, or a row that another clerk
      had retired, produced a sheet with fewer labels than the count beside the
      button promised. See `RegisterSelectionBar` for the full reconciliation; the
      short form is that the button's label is the number of labels that will be on
      the sheet, and it cannot be read past.
    */}
    {page.selectedIds.size > 0 ? (
      <RegisterSelectionBar
        selectedCount={page.selection.selectedCount}
        labelableCount={page.selection.labelableCount}
        retiredCount={page.selection.retiredCount}
        missingCount={page.selection.missingCount}
        isPending={page.isExportingQrSheet}
        onDownload={page.handleDownloadQrSheet}
        onClear={page.handleClearSelection}
      />
    ) : null}

    {/*
      Whether the store *has* categories is the only question the seeder needs, and
      a failed `categories.list` must not be read as "it has none": seeding on top
      of a timed-out read is a write offered because a read failed, and the
      register's own empty state would be explaining a first-run problem to a school
      that has been running for years.
    */}
    <InventoryTable
      items={page.items}
      totalCount={page.totalCount}
      isLoading={page.isItemsLoading}
      isFiltered={page.isFiltered}
      error={page.itemsError}
      isRetrying={page.isItemsRetrying}
      onRetry={page.handleRetryItems}
      onClearFilters={page.handleFiltersReset}
      hasCategories={
        page.categories.length > 0 || Boolean(page.categoriesError)
      }
      isSeedPending={page.isSeedPending}
      onSeedCategories={page.handleSeedCategories}
      onCreateItem={page.handleCreateItem}
      registerLabel={registerLabel}
      filterSummary={page.filterSummary}
      onOpenItem={page.handleOpenItem}
      onViewCustody={page.handleOpenItem}
      onTransferCustody={page.handleTransferCustody}
      onAssignManager={page.handleAssignManager}
      onTransferOwnership={page.handleTransferOwnership}
      onReclaimCustody={page.handleReclaimCustody}
      onTakeItem={page.handleTakeItem}
      onReleaseCustody={page.handleReleaseCustody}
      canSelfServe={canSelfServe}
      onEditItem={page.handleEditItem}
      onRetireItem={page.handleRetireItem}
      isRetirePending={page.isRetirePending}
      onRestoreItem={page.handleRestoreItem}
      isRestorePending={page.isRestorePending}
      selectedIds={page.selectedIds}
      selectableIds={page.selectableIds}
      onToggleSelect={page.handleToggleSelect}
      onToggleSelectAll={page.handleToggleSelectAll}
    />

    <RegisterPaneDialogs page={page} />
  </section>
);

export const InventoryPage = ({
  section,
  base = "/admin",
}: {
  section: InventorySection;
  /**
   * Which workspace's addresses this copy of the register builds. The same
   * six routes exist under `/admin/$year/staff/inventory` and
   * `/inventory-admin/$year/staff/inventory`, and every pane switch navigates,
   * so a base that stayed hard-coded would drag an Inventory Administrator
   * back into the administrator's workspace on the first tab click.
   */
  base?: InventoryWorkspaceBase;
}) => {
  const navigate = useNavigate();
  const year = useActiveYear();
  const tab = section === "register" ? "register" : "records";
  const page = useInventoryPage();

  /**
   * Whether the register should offer the self-service claim and hand-back to
   * the person looking at it.
   *
   * Both verbs sit on `requireInventoryPermission("take")`, and the Inventory
   * Administrator's grant is the register's minus those two — so without this the
   * one seat whose workspace *is* the register was shown two menu entries on every
   * row that answered `Forbidden` for both. `canSelfServeInventory` is the
   * client-safe copy of that grant (see its comment for why the copy exists and
   * why the server still decides), and the session's role is the only input it
   * needs; nothing here is asked of the server per row.
   *
   * The `take` grant is held by the three leadership seats, so this is true for
   * every reader of `/admin/$year/staff/inventory` and false for every reader of
   * `/inventory-admin/$year/staff/inventory` — which is the same division the
   * register's own verbs already make: the store's seat moves items with
   * **Transfer custody** and **Call it back**, both of which it can use.
   */
  const { session } = useRouteContext({ from: "/_auth" });
  const canSelfServe = canSelfServeInventory(
    (session?.user as SessionUser | undefined)?.role
  );

  /**
   * The table's own name, and it carries the year.
   *
   * The page's `<h1>` says "Inventory" and the pane's `<h2>` says "Register", and
   * neither of them is available to a screen reader reading the table cell by cell —
   * both are outside the table, and both are landmarks rather than names. This is
   * the string the table's `<caption>` is built from, and the year is in it because
   * the academic year is the spine of this app's navigation: two registers, two
   * years, one route, and a table whose name does not say which one it is.
   */
  const registerLabel = `Inventory register, academic year ${year}`;

  const goToTab = useCallback(
    (next: unknown) => {
      if (next === tab) {
        return;
      }

      void navigate({
        to:
          next === "register"
            ? yearPath(base, year, "staff", "inventory")
            : yearPath(base, year, "staff", "inventory", "issues"),
      });
    },
    [navigate, tab, year, base]
  );

  return (
    <Tabs value={tab} onValueChange={goToTab} className="gap-4">
      {/*
        The page's own name, above the tab bar rather than inside the register pane.
        An `h1` inside a tab is an `h1` that disappears when the user reads a loan
        queue, which is the same as having no page title at all.
      */}
      <header className="space-y-2">
        <h1 className="font-heading text-4xl font-semibold">Inventory</h1>
        <p className="text-muted-foreground max-w-3xl">
          Every item the school owns, who is responsible for it, and who is
          holding it — with the movements, transfers, disposals and change log
          behind it
        </p>
      </header>

      {/**
       * The line variant at full width, matching the tab set *inside* the Records
       * pane, so the page reads as one tabbed surface rather than a tab bar with
       * unrelated controls below it.
       */}
      <TabsList
        variant="line"
        className="border-primary/18 h-auto w-full justify-start gap-0.5 rounded-none border-b p-0"
      >
        <TabsTrigger
          value="register"
          className="rounded-none border border-b-0 border-transparent px-4 py-2.5 font-semibold after:hidden"
        >
          Register
        </TabsTrigger>
        <TabsTrigger
          value="records"
          className="rounded-none border border-b-0 border-transparent px-4 py-2.5 font-semibold after:hidden"
        >
          Records
        </TabsTrigger>
      </TabsList>

      {/*
        `text-base/relaxed` restores the app's default type size, which
        `TabsContent`'s own base class (`text-xs/relaxed`) would otherwise shrink
        for every element below that does not set a size of its own. It is the one
        class added here, and it is here so the register renders at the same size
        it did before it was mounted inside a tab.
      */}
      <TabsContent value="register" className="text-base/relaxed">
        <InventoryRegisterPane
          page={page}
          registerLabel={registerLabel}
          canSelfServe={canSelfServe}
        />
      </TabsContent>

      {/**
       * The other pane. `InventoryLifecycleTabs` still owns every query,
       * filter and empty state — the three props below are only which of its
       * four `Tabs` values is active and where a tab switch navigates to, now
       * that those live in the URL path rather than in the pane's own state.
       * Base UI unmounts an inactive panel, so the loans, issues, write-off,
       * asset-tag and ledger queries only run once this tab is actually
       * opened — which is also why the register's first paint is not paying
       * for them.
       *
       * `aria-labelledby`, pointing at the pane's own heading, and this is the
       * other half of a fix that used to be split across two files. The heading was
       * an `<h1>` and the section was labelled by the string "Records", so a
       * screen reader was given a landmark called "Records" containing a
       * level-one heading called "Stock movements", inside a page whose own
       * level-one heading is "Inventory": two `h1`s and a landmark name that
       * matched neither. The heading is now an `<h2>` (see the outline argument in
       * `lifecycle-tabs.tsx`) and carries an id, so the section can be named by the
       * element that names itself and the string can go.
       */}
      <TabsContent value="records" className="text-base/relaxed">
        <section aria-labelledby={LIFECYCLE_HEADING_ID}>
          <InventoryLifecycleTabs
            activeSubtab={
              section === "register" ? "issues" : LIFECYCLE_SUBTAB_OF[section]
            }
            onSubtabChange={(next) => {
              // `InventoryLifecycleTabs`' own "register" tab value (its asset
              // register) is a different word from this page's "register" pane
              // (the catalog), so the URL segment is spelled out in full
              // rather than reusing the ambiguous short name.
              const segment = next === "register" ? "asset-register" : next;
              void navigate({
                to: yearPath(base, year, "staff", "inventory", segment),
              });
            }}
            scrollToLedger={section === "ledger"}
          />
        </section>
      </TabsContent>
    </Tabs>
  );
};
