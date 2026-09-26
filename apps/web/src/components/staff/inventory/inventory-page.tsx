"use client";

import type { InferRouterInputs } from "@orpc/server";
import type { AppRouter } from "@school-student-teacher-management/api/routers/index";
import {
  inventoryTransferReasonSchema,
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
import { IconCategory, IconPlus, IconUserOff } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { CategoryPanel } from "@/components/staff/inventory/category-panel";
import type { CustodyHoldMode } from "@/components/staff/inventory/custody-dialogs";
import { CustodyDialogs } from "@/components/staff/inventory/custody-dialogs";
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
import { InventoryLifecycleTabs } from "@/components/staff/inventory/lifecycle-tabs";
import {
  invalidateInventory,
  InventoryFilterBar,
  InventoryInlineNotice,
  InventoryStatCards,
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
const MAX_OPEN_BORROWS = 500;

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
 * ## Why there is no `managerStaffId` term here
 *
 * `listItems` does accept a `managerStaffId` (`list-items.ts:114`, applied at
 * `:177`), but only as a **staff id** — a "no manager" filter has no wire
 * representation, and a sentinel string such as `"none"` would fail
 * `staffIdSchema` on the way in rather than select the null rows. So the register's
 * "no manager" filter is applied to the loaded page instead (in `useRegisterRows`,
 * below), and the count beside it is a count of the page too. The server-side fix is
 * one input — an `unassignedOnly: v.optional(v.boolean())` beside `lowStockOnly`,
 * filtered with `isNull(inventoryItem.managerStaffId)` — after which the same card
 * could be lifted to its own `limit: 1` count the way `lowStockQuery` is, and this
 * function would carry the term like every other filter.
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
 * The register's filters plus the one that has no server-side equivalent.
 *
 * A local extension rather than a change to `InventoryFilters` in
 * `inventory-types.ts`, and the reason is the sentence above: the field has no
 * representation in the wire input, so the type that describes the wire has no
 * business carrying it. `InventoryFilters` is the *request* — the search term and
 * the server-side filters — and `unassignedOnly` is a predicate this page applies to
 * what came back. Folding the second into the first would have been the tidier-looking
 * change and it would have put a browser-side filter in the middle of a translation
 * function whose whole job is describing the request.
 *
 * `hasActiveInventoryFilters` cannot see this key either, which is why the page ORs
 * it into its own `isFiltered` rather than trusting the shared predicate to notice.
 */
interface RegisterFilters extends InventoryFilters {
  /** Client-side: keep only the rows whose `managerStaffId` is null. */
  unassignedOnly: boolean;
}

const DEFAULT_REGISTER_FILTERS: RegisterFilters = {
  ...DEFAULT_INVENTORY_FILTERS,
  unassignedOnly: false,
};

/**
 * The rows the table actually renders, and the "no manager" filter over them.
 *
 * One memo, because the count and the list have to be derived from the same array:
 * a card that counted the page before it was filtered, beside a table showing the
 * page after, would be two numbers about the same question.
 */
const useRegisterRows = (
  items: InventoryItemView[] | undefined,
  unassignedOnly: boolean
) => {
  const rows = useMemo(() => {
    const list = items ?? [];
    if (!unassignedOnly) {
      return list;
    }

    return list.filter((row) => row.managerStaffId === null);
  }, [items, unassignedOnly]);

  /**
   * The count the "No manager" card shows, and it is a count of the **loaded page**.
   *
   * `totalItems` and `lowStockItems` beside it are server totals, so this figure
   * used to read as the same kind of number while being a different kind entirely:
   * apply a filter and the card silently became "unassigned items matching your
   * filter" with nothing on screen saying so. The card's own copy is in
   * `shared/inventory-stats.tsx` and cannot be corrected from this file, so the
   * scope is stated where the user acts on it instead — in the sentence beside the
   * "No manager only" toggle, and in the name of the filter itself.
   */
  const unassignedCount = useMemo(
    () => (items ?? []).filter((row) => row.managerStaffId === null).length,
    [items]
  );

  return { rows, unassignedCount };
};

/**
 * The scope of the client-side "no manager" filter, stated in the user's terms.
 *
 * The card's own hint ("Nobody is accountable for the item") is in
 * `shared/inventory-stats.tsx` and cannot be qualified from this file, and the
 * "showing N of M" line beside it is deliberately kept true (both of its numbers are
 * the filtered set's own). So the one sentence that says *what the number covers* has
 * to live with the control that produced it — and it has to be a sentence rather than
 * a footnote, because the alternative is a store administrator acting on a figure that
 * is a count of the visible page and believing it is a count of the school.
 *
 * The truncation clause is conditional rather than always-present because it is only
 * true when the register is actually truncated, and a warning that is always on is a
 * warning nobody reads.
 */
const buildUnassignedScopeNote = (
  shownCount: number,
  isTruncated: boolean
): string => {
  const subject =
    shownCount === 1
      ? "The 1 item in these results has"
      : `All ${shownCount} items in these results have`;

  const truncation = isTruncated
    ? " The register is also showing only the first page of the store, so the real number can be higher."
    : "";

  return `${subject} no manager. This filter runs in your browser over the rows already loaded, so it is a subset of what the register returned rather than a count of the whole school.${truncation}`;
};

/**
 * What an `assignManager` call did, in one sentence.
 *
 * Three outcomes and three sentences, because the questions they answer are three:
 * who was appointed, who replaced one, and who decided an item no longer has anybody
 * accountable for it. The clearing outcome is the one this whole feature exists to
 * surface, so it gets the longest sentence of the three rather than a shrug.
 */
const managerChangeMessage = (result: {
  managerName: string | null;
  previousManagerName: string | null;
}): string => {
  if (result.managerName) {
    return `${result.managerName} is now in charge of this item`;
  }

  if (result.previousManagerName) {
    return `${result.previousManagerName} is no longer in charge — this item has no manager until somebody is assigned`;
  }

  return "The manager slot is empty";
};

/**
 * Everything the inventory register does, apart from drawing it.
 *
 * The split is the one `use-classes-page.ts` and `use-teachers-page.ts` already set
 * for this app: queries, mutations, dialog state and every handler live in a hook,
 * and the page component below is markup. It lives in this file rather than in a
 * sixth `use-inventory-page.ts` because the file set for this feature was fixed in
 * advance, and where a hook is filed is a file-count preference rather than an
 * architectural one.
 */
export const useInventoryPage = () => {
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<RegisterFilters>(
    DEFAULT_REGISTER_FILTERS
  );
  const [selectedItem, setSelectedItem] = useState<InventoryItemView | null>(
    null
  );

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
  const borrowsQuery = useQuery(
    orpc.inventory.borrows.list.queryOptions({
      input: { status: "borrowed", limit: MAX_OPEN_BORROWS },
    })
  );

  const items = itemsQuery.data?.items;
  const totalCount = itemsQuery.data?.total;

  /**
   * The rows the table draws, and the count the "No manager" card shows.
   *
   * Split out of the stats memo because the two answer different questions: the table
   * shows the page with this browser's predicate applied, while the card counts the
   * page exactly as the server returned it — so turning the filter on does not make
   * the number above the table jump, and the number does not depend on which rows
   * the filter happens to be keeping.
   */
  const { rows: visibleItems, unassignedCount } = useRegisterRows(
    items,
    filters.unassignedOnly
  );

  /**
   * The seven figures, and the honest statement of what each one counts.
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
  const { stats, isStatsLoading } = useMemo(() => {
    const rows = items ?? [];

    return {
      stats: {
        totalItems: totalCount ?? rows.length,
        totalUnits: rows.reduce((sum, row) => sum + row.qty, 0),
        availableUnits: rows.reduce((sum, row) => sum + row.availableQty, 0),
        borrowedUnits: (borrowsQuery.data?.borrows ?? []).reduce(
          (sum, borrow) => sum + borrow.qty,
          0
        ),
        outOfStockItems: rows.filter((row) => row.status === "out_of_stock")
          .length,
        lowStockItems: lowStockQuery.data?.total ?? 0,
        unassignedItems: unassignedCount,
      } satisfies InventoryStats,
      isStatsLoading:
        itemsQuery.isLoading ||
        borrowsQuery.isLoading ||
        lowStockQuery.isLoading,
    };
  }, [
    borrowsQuery.data,
    borrowsQuery.isLoading,
    items,
    itemsQuery.isLoading,
    lowStockQuery.data,
    lowStockQuery.isLoading,
    totalCount,
    unassignedCount,
  ]);

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
          selectedItem
            ? `"${selectedItem.name}" retired — its ledger and custody history are still on file`
            : "Item retired"
        );
        setSelectedItem(null);
        await invalidate("item");
      },
      onError: (error) => {
        toast.error(formatApiErrorMessage(error, "Could not retire this item"));
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

  // ─── Filters ─────────────────────────────────────────────────────────────

  const handleFiltersChange = useCallback(
    (patch: Partial<InventoryFilters>) => {
      setFilters((previous) => ({ ...previous, ...patch }));
    },
    []
  );

  /**
   * The "No manager" toggle, as a patch like every other filter change.
   *
   * A patch rather than a boolean so the toggle and the five `<Select>`s and the
   * search box all reach the register through one setter — which is what lets the
   * filter bar's `onChange` prop type stay the shape it is, and what stops this one
   * filter from acquiring its own `useState` and its own reset path.
   */
  const handleUnassignedOnlyChange = useCallback((unassignedOnly: boolean) => {
    setFilters((previous) => ({ ...previous, unassignedOnly }));
  }, []);

  /**
   * Clearing everything, `unassignedOnly` included.
   *
   * `hasActiveInventoryFilters` cannot see that key — it is not on `InventoryFilters`
   * — so a reset that left it on would have produced a register the user believed
   * they had just cleared filters on and had not. It is a reset; it resets.
   */
  const handleFiltersReset = useCallback(() => {
    setFilters(DEFAULT_REGISTER_FILTERS);
  }, []);

  const handleRetryItems = useCallback(() => {
    void itemsQuery.refetch();
  }, [itemsQuery]);

  const handleRetryCategories = useCallback(() => {
    void categoriesQuery.refetch();
  }, [categoriesQuery]);

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
      newManagerStaffId: string | null;
      reason: string;
      note?: string;
    }) => {
      await assignManagerMutation.mutateAsync({
        itemId: v.parse(inventoryItemIdSchema, values.itemId),
        newManagerStaffId: values.newManagerStaffId
          ? v.parse(staffIdSchema, values.newManagerStaffId)
          : null,
        reason: v.parse(inventoryTransferReasonSchema, values.reason),
        ...(values.note ? { note: values.note } : {}),
      } as AssignManagerInput);
    },
    [assignManagerMutation]
  );

  const handleHoldSubmit = useCallback(
    async (values: { itemId: string; note?: string }) => {
      const payload = {
        itemId: v.parse(inventoryItemIdSchema, values.itemId),
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
   * `use-teachers-page.ts` established this and the reason holds: the page below is
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
     * The rows the table draws — the loaded page, with the client-side "no manager"
     * filter already applied. The table must never be handed the unfiltered page
     * while the filter is on, or the toggle would appear to do nothing.
     */
    items: visibleItems,
    totalCount,
    itemsError: itemsQuery.error,
    isItemsLoading: itemsQuery.isLoading,
    stats,
    isStatsLoading,
    /**
     * The same predicate the filter bar's own "Clear filters" button uses, plus the
     * one filter the predicate cannot see. They must be one predicate: the button
     * appears on the bar and the table picks between its two empty states on this
     * flag, so a register that cleared its filters and still said "nothing matches
     * these filters" would be telling the reader to do something they had already
     * done.
     */
    isFiltered: hasActiveInventoryFilters(filters) || filters.unassignedOnly,

    // Filters
    filters,
    handleFiltersChange,
    handleUnassignedOnlyChange,
    handleFiltersReset,
    handleRetryItems,
    handleRetryCategories,
    /**
     * The two numbers the "showing N of M" line needs, and **both are the filtered
     * set's own figures while the client-side filter is on**.
     *
     * `totalCount` is the server's count of the rows it matched, which knows nothing
     * about a predicate this browser applied afterwards. Handing the bar
     * `resultCount = 12` beside `totalCount = 340` would print "Showing 12 of 340
     * items", which is a sentence about nothing. So the moment `unassignedOnly` is
     * active, both numbers are the filtered page: the line reads "Showing 12 of 12",
     * which is true, and the sentence beside the toggle
     * (`buildUnassignedScopeNote`) is what says the twelve are the ones *in the
     * results on screen* rather than the whole store. The table's own `aria-label`
     * and truncation check read the same pair, so the sighted and the non-visual
     * reading cannot disagree either.
     */
    resultCount: filters.unassignedOnly ? visibleItems.length : items?.length,
    registerTotal: filters.unassignedOnly ? visibleItems.length : totalCount,
    /**
     * The page the server returned, before the client-side predicate. It is the only
     * one of the three counts that can answer "is the register truncated?", because
     * `registerTotal` collapses to `resultCount` the moment that predicate is on.
     */
    loadedCount: items?.length,

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
  | "loans"
  | "issues"
  | "write-offs"
  | "asset-register"
  | "ledger";

/** Which of `InventoryLifecycleTabs`' four `Tabs` values a section maps to. */
const LIFECYCLE_SUBTAB_OF: Record<
  Exclude<InventorySection, "register">,
  "loans" | "issues" | "write-offs" | "register"
> = {
  loans: "loans",
  issues: "issues",
  "write-offs": "write-offs",
  "asset-register": "register",
  // The ledger section sits at the foot of the Records pane regardless of
  // which lifecycle tab is active above it, so `/ledger` lands on Records
  // with Loans (the pane's own default) underneath and scrolls to the
  // ledger heading — see `scrollToLedger` on `InventoryLifecycleTabs`.
  ledger: "loans",
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
 * The Register pane — the catalog, its filters, its table and every dialog the
 * table's row actions open.
 *
 * Split out of `InventoryPage` because it is one self-contained half of that
 * page: it reads the hook's result and nothing else, and the page above it adds
 * only the tab bar, the heading and the Records pane. It is a component and not
 * a chunk of markup inlined in the parent for the same reason the two panes are
 * two components — a 300-line function is a page and its half at once, and
 * neither can be read without the other in the way.
 */
const InventoryRegisterPane = ({ page }: { page: InventoryPageState }) => (
  <section
    aria-labelledby="inventory-register-heading"
    className="flex flex-col gap-4"
  >
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
        <p className="text-muted-foreground mt-1">
          Every item the school owns, who is responsible for it, and who is
          holding it
        </p>
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

    {/*
      The one standing condition this screen can be in, stated as a rule rather
      than as a failure. A store with no categories cannot have an item created
      at all — `createItem` requires a `categoryId` behind a `restrict` foreign
      key — so this is not decoration: it names the blocker, and it disappears
      on its own once the categories exist rather than needing to be dismissed.
    */}
    {page.categories.length === 0 && !page.isCategoriesLoading ? (
      <InventoryInlineNotice
        tone="warning"
        title="This store has no categories yet"
        description="Nothing can be added to the register until at least one category exists, because every item has to belong to one. The eight starter categories are the fastest way to get there, and running it again is safe — it skips anything already there. Open Categories to use it."
      />
    ) : null}

    <InventoryStatCards stats={page.stats} isLoading={page.isStatsLoading} />

    {/*
      The "No manager" card's way in — see the note beside the button.

      It is a toggle rather than a one-shot "show me" for the same reason the
      filter bar's "Low stock only" is a toggle: it is a *filter*, so it needs
      an off that the user can see and press, and `aria-pressed` states that
      without borrowing a checkbox for the state. The icon is the card's own
      (`IconUserOff` in `shared/inventory-stats.tsx`), so the association
      between this control and the figure above it is by picture as well as by
      position.
    */}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button
        type="button"
        variant={page.filters.unassignedOnly ? "default" : "outline"}
        aria-pressed={page.filters.unassignedOnly}
        onClick={() =>
          page.handleUnassignedOnlyChange(!page.filters.unassignedOnly)
        }
        data-icon="inline-start"
      >
        <IconUserOff data-icon="inline-start" />
        No manager only
      </Button>
      {page.filters.unassignedOnly ? (
        <p className="text-muted-foreground text-sm">
          {buildUnassignedScopeNote(
            page.resultCount ?? 0,
            page.loadedCount !== undefined &&
              page.totalCount !== undefined &&
              page.loadedCount < page.totalCount
          )}
        </p>
      ) : null}
    </div>

    <InventoryFilterBar
      {...page.filters}
      onChange={page.handleFiltersChange}
      onReset={page.handleFiltersReset}
      categories={page.categories}
      resultCount={page.resultCount}
      totalCount={page.registerTotal}
    />

    <InventoryTable
      items={page.items}
      totalCount={page.registerTotal}
      isLoading={page.isItemsLoading}
      isFiltered={page.isFiltered}
      error={page.itemsError}
      onRetry={page.handleRetryItems}
      onClearFilters={page.handleFiltersReset}
      hasCategories={page.categories.length > 0}
      isSeedPending={page.isSeedPending}
      onSeedCategories={page.handleSeedCategories}
      onCreateItem={page.handleCreateItem}
      onOpenItem={page.handleOpenItem}
      onViewCustody={page.handleOpenItem}
      onTransferCustody={page.handleTransferCustody}
      onAssignManager={page.handleAssignManager}
      onTransferOwnership={page.handleTransferOwnership}
      onReclaimCustody={page.handleReclaimCustody}
      onTakeItem={page.handleTakeItem}
      onReleaseCustody={page.handleReleaseCustody}
      onEditItem={page.handleEditItem}
      onRetireItem={page.handleRetireItem}
      isRetirePending={page.isRetirePending}
      onRestoreItem={page.handleRestoreItem}
      isRestorePending={page.isRestorePending}
    />

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
      isFiltered={page.isFiltered}
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
  </section>
);

export const InventoryPage = ({ section }: { section: InventorySection }) => {
  const navigate = useNavigate();
  const year = useActiveYear();
  const tab = section === "register" ? "register" : "records";
  const page = useInventoryPage();

  const goToTab = useCallback(
    (next: unknown) => {
      if (next === tab) {
        return;
      }

      void navigate({
        to:
          next === "register"
            ? yearPath("/admin", year, "staff", "inventory")
            : yearPath("/admin", year, "staff", "inventory", "loans"),
      });
    },
    [navigate, tab, year]
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
          holding it — with the movements, issues, write-offs and change log
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
        <InventoryRegisterPane page={page} />
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
       * `aria-label` rather than `aria-labelledby`: the pane's own heading is "Stock
       * movements" and it is rendered by `lifecycle-tabs.tsx`, one layer down and
       * in a file this wave does not own. Labelling the section by string keeps the
       * landmark name correct today; the day that heading is demoted from `<h1>` to
       * `<h2>` (which is the other half of the heading fix, and the same edit) the
       * label should point at its id instead.
       */}
      <TabsContent value="records" className="text-base/relaxed">
        <section aria-label="Records">
          <InventoryLifecycleTabs
            activeSubtab={
              section === "register" ? "loans" : LIFECYCLE_SUBTAB_OF[section]
            }
            onSubtabChange={(next) => {
              // `InventoryLifecycleTabs`' own "register" tab value (its asset
              // register) is a different word from this page's "register" pane
              // (the catalog), so the URL segment is spelled out in full
              // rather than reusing the ambiguous short name.
              const segment = next === "register" ? "asset-register" : next;
              void navigate({
                to: yearPath("/admin", year, "staff", "inventory", segment),
              });
            }}
            scrollToLedger={section === "ledger"}
          />
        </section>
      </TabsContent>
    </Tabs>
  );
};
