import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { InventoryItemView } from "@/components/staff/inventory/inventory-types";
import { orpc } from "@/utils/orpc";

/**
 * The one search param this page owns.
 *
 * **There is no `status` param, and that is a decision rather than an omission.**
 * `item.status` is derived from `qty`, `borrowedQty` and `condition` — all of
 * them properties of a *register line* — and `custodianStaffId` is not an input
 * to the derivation. So "Available" on the register is a fact about the stock
 * system, not about the laptop in the teacher's hands, and filtering this page
 * by it answered a question about the school rather than about their own
 * property. The two sections already *are* the state this page owns. With the
 * param gone, a `?status=` left in a bookmark or a shared link has nothing to
 * resolve against and nothing to send: the picklist behind `listMyItems`'s
 * `input.status` can no longer be handed a value the page did not choose.
 *
 * Read untyped and written through a functional `search` update rather than a
 * `validateSearch` contract, because the route file belongs to the feature
 * integration rather than to this component: a spread of the previous params
 * keeps every other param on the URL whatever the route declares, and a param
 * the route happens to strip degrades to "the filter did not persist" rather
 * than to a page that throws.
 */
const SEARCH_PARAM = "search";

/** Matches `teacher-combobox.tsx` and the shared item picker. */
const DEBOUNCE_MS = 250;

interface RouteSearch {
  search?: unknown;
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

/** The unpicked state of the category and condition selects below. */
export const ANY_EQUIPMENT_FILTER = "all";

/**
 * Everything the "My Equipment" page does, apart from drawing it.
 *
 * ## The three reads, and the one that is not on this page
 *
 * A `teacher` holds `inventory: ["read", "acknowledge"]` — read-only, plus the
 * narrow notice-acknowledgement action. Custody itself — who holds what, when
 * it moves, when it comes back — is set exclusively by the seeded Inventory
 * Administrator account (`packages/auth/src/permissions.ts`); this page has no
 * mutation of its own left in it. `read`, on its own, says
 * nothing about *which rows* any of those reach; every read below is scoped to
 * the caller in its own query, and that scoping is the whole of its security. The
 * page makes three of them:
 *
 * - `custody.myItems` — `managerStaffId = me OR custodianStaffId = me`.
 * - `custody.lent` — `managerStaffId = me AND custodianStaffId IS NOT NULL AND
 *   custodianStaffId <> me`. The third section, and the only read here that names
 *   a colleague; unavoidable, because you cannot act on a colleague's custody of
 *   your own equipment without knowing whose custody it is.
 * - `custody.history` — one item at a time, and only once the teacher has asked.
 *
 * **`items.list` is the school-wide register and is not called from here**, by
 * any of them. It is `adminProcedure`, and a picker built on it would hand a
 * teacher the whole storebook — every item with every manager's and custodian's
 * name beside it — through a search box. `inventory.options.teachers` is
 * `adminProcedure` for the same reason and is **not** called from here either;
 * a teacher has no reason to see it now that assignment is the Inventory
 * Administrator's job, not theirs.
 */
export const useMyEquipment = () => {
  const navigate = useNavigate();
  const routeSearch = useSearch({ strict: false }) as RouteSearch;

  /**
   * One place that writes the URL.
   *
   * The cast is because this component does not own its route file, so
   * `navigate` resolves to the root route's search type rather than to
   * whatever the teacher equipment route declares. The functional form is what
   * keeps every other param on the URL whatever that route says, and it is also
   * the form that cannot be wrong about which params exist — the alternative,
   * a literal object, would silently drop the rest of the query string.
   *
   * If the route turns out to strip unknown params, the degradation is
   * "the filter does not persist", not "the search box stops working": the
   * local term is the source of truth for the input and only the committed
   * value is read back off the URL.
   */
  const writeSearchParams = useCallback(
    (next: RouteSearch) => {
      void navigate({
        search: ((previous: RouteSearch) => ({
          ...previous,
          ...next,
        })) as never,
        replace: true,
      });
    },
    [navigate]
  );

  // The committed value: what the server was actually asked for. Only this
  // reaches the query, which is what makes a keystroke-per-keystroke request
  // impossible.
  const committedSearch = asString(routeSearch[SEARCH_PARAM]);

  /**
   * What is in the input box, which is not the same thing as what was searched.
   *
   * Seeded from the URL and re-seeded whenever the URL changes underneath it
   * (a bookmark, a shared link, Back), using the repo's existing
   * "adjust state during render" idiom — the alternative is an effect, and an
   * effect here would show one frame of the previous term.
   */
  const [search, setSearch] = useState(committedSearch);
  const [syncedSearch, setSyncedSearch] = useState(committedSearch);
  if (committedSearch !== syncedSearch) {
    setSyncedSearch(committedSearch);
    setSearch(committedSearch);
  }

  // Debounced commit to the URL. `replace` keeps a filtered list from filling
  // the Back button with one entry per letter, and the guard stops the write
  // that adopted a URL value from bouncing straight back off it.
  useEffect(() => {
    if (search === syncedSearch) {
      return;
    }
    const timeout = setTimeout(() => {
      writeSearchParams({ [SEARCH_PARAM]: search || undefined });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search, syncedSearch, writeSearchParams]);

  /**
   * Category and condition, unlike the search term, are never sent to the
   * server and never reach the URL. Both are per-item facts already present on
   * every row `listMyItems` and `custody.lent` return, so filtering on them is
   * a client-side narrowing of a list already in hand — the same tier the
   * attendance register's qualification and band filters sit at, and for the
   * same reason: a second request would not answer a question the first
   * response cannot already answer.
   */
  const [categoryFilter, setCategoryFilter] = useState(ANY_EQUIPMENT_FILTER);
  const [conditionFilter, setConditionFilter] = useState(ANY_EQUIPMENT_FILTER);

  const hasActiveFilters =
    committedSearch !== "" ||
    categoryFilter !== ANY_EQUIPMENT_FILTER ||
    conditionFilter !== ANY_EQUIPMENT_FILTER;

  const clearFilters = useCallback(() => {
    writeSearchParams({ [SEARCH_PARAM]: undefined });
    setCategoryFilter(ANY_EQUIPMENT_FILTER);
    setConditionFilter(ANY_EQUIPMENT_FILTER);
  }, [writeSearchParams]);

  /**
   * The only input this page sends.
   *
   * `search` is `optional(string())` on the wire — `list-my-items.ts` escapes
   * `%` and `_` and wraps the term in `ilike` — so a hand-edited or stale term
   * is a query that finds nothing rather than a `BAD_REQUEST` that empties the
   * page. That asymmetry is the reason the status filter is gone rather than
   * resolved: a free string cannot fail its schema, a picklist can.
   */
  const myItemsInput = useMemo(
    () => ({ search: committedSearch || undefined }),
    [committedSearch]
  );

  const myItemsQuery = useQuery(
    orpc.inventory.custody.myItems.queryOptions({ input: myItemsInput })
  );

  const items = useMemo(
    () => myItemsQuery.data?.items ?? [],
    [myItemsQuery.data]
  );

  /**
   * Category and condition are per-item facts, so one predicate over one row
   * is all three sections need — unlike the split below, which is about
   * *whose* row this is, this is about *what kind* of row it is, and every
   * section asks the same question of it.
   */
  const matchesFilters = useCallback(
    (item: InventoryItemView) => {
      if (
        categoryFilter !== ANY_EQUIPMENT_FILTER &&
        item.categoryName !== categoryFilter
      ) {
        return false;
      }
      if (
        conditionFilter !== ANY_EQUIPMENT_FILTER &&
        item.condition !== conditionFilter
      ) {
        return false;
      }
      return true;
    },
    [categoryFilter, conditionFilter]
  );

  /**
   * An account with no staff record is a legitimate account, not a failure.
   *
   * The seeded admin, principal and deputy-principal seats are users with no
   * staff identity by design, and `listMyItems` answers that case with
   * `staffId: null` and an empty list rather than a throw. So this is a state
   * the page has to *name*, and it is not the same state as holding nothing:
   * one means "you are not a person in the staff register yet", the other means
   * "you are on the roll and you have nothing". Gated on `isSuccess` so the
   * first render, where there is no data yet, is not mistaken for the answer.
   */
  const staffId = myItemsQuery.data?.staffId ?? null;
  const isStaffRecordMissing =
    myItemsQuery.isSuccess && myItemsQuery.data?.staffId === null;

  /**
   * The first of the three splits this page exists to make.
   *
   * Being the **manager** of an item is an obligation — you are the one asked
   * where it is, whether or not you have ever touched it — and being the
   * **custodian** is a possession: you signed for the thing and have to hand it
   * back. A teacher who is both is listed **once, under "In my charge"**: being
   * in charge is the stronger claim, and a second identical row under "In my
   * hands" would read as a second thing to return.
   *
   * **An item you are in charge of and have lent to a colleague is in this list as
   * well as in the third one, and that is not a duplicate — it is the same fact
   * read at two altitudes.** Here it is one line of your property, and the actions
   * are the ones a person has over a thing they answer for (see where it is, say
   * it is broken, hand it back if it is in your own hands). In "Lent out by me" it
   * is a colleague's possession, and the actions are the owner's two verbs over
   * that. Nothing in this filter is aware of the third section, and it must not
   * be: the row belongs here whatever else is true of it, and the third section is
   * the only place that says *who has it*.
   *
   * One merged table with a `CustodyBadge` would show the same rows and teach
   * the teacher nothing, which is the whole cost of not splitting.
   */
  const inCharge = useMemo(
    () =>
      items.filter(
        (item) => item.managerStaffId === staffId && matchesFilters(item)
      ),
    [items, staffId, matchesFilters]
  );

  /**
   * The dedupe, and the reason the affordance cannot come from the section.
   *
   * The teacher who is handed a departmental set and then takes it — the
   * manager *and* the custodian on one row — is the common case, not the exotic
   * one, and this filter is what removes that row from here. It must not also
   * remove their way of handing it back: `releaseCustody` authorises on
   * `custodianStaffId !== actor.staffId` alone and never reads the manager
   * column, so the server allows exactly what the filter hides. The row that
   * survives in "In my charge" therefore has to carry the hand-back itself, and
   * it gets it from `holdsItem` below rather than from which list it is in.
   */
  const inHands = useMemo(
    () =>
      items.filter(
        (item) =>
          item.custodianStaffId === staffId &&
          item.managerStaffId !== staffId &&
          matchesFilters(item)
      ),
    [items, staffId, matchesFilters]
  );

  /**
   * The one predicate every row affordance on this page is derived from.
   *
   * "Are you holding this?" is a fact about the row, never about the section it
   * was rendered in, and it is the same fact the server asks: `actor.staffId`
   * against `custodianStaffId`. Guarding on `staffId !== null` is not paranoia —
   * with no staff record `listMyItems` answers with an empty list, and a
   * comparison of two nulls would otherwise report "you are holding this" on a
   * page that is not showing the teacher anything.
   *
   * Deliberately *not* `managerStaffId`-aware. The manager column decides which
   * list a row is on; it says nothing about whether the teacher may release it.
   */
  const holdsItem = useCallback(
    (item: InventoryItemView) =>
      staffId !== null && item.custodianStaffId === staffId,
    [staffId]
  );

  // ─── What is out with somebody else ───────────────────────────────────────

  /**
   * The third section, and **a separate read because a separate read is the only
   * way to get the pair.**
   *
   * `listMyItems` is `managerStaffId = me OR custodianStaffId = me`, so an item
   * the caller owns and has lent to a colleague *is* already in `items` — and
   * arrives carrying both facts, one of which (`custodianStaffId` pointing at
   * somebody else) the page was not splitting on. Lumping such a row into "In my
   * charge" is what the section description used to paper over, and the
   * consequence is the specific failure this page is built to prevent: the owner
   * of a projector that is in S. Fernando's classroom reads a list of their
   * property on which nothing says it is not on the shelf.
   *
   * `custody.lent` states the pair in its own query:
   * `managerStaffId = me AND custodianStaffId IS NOT NULL AND custodianStaffId <> me`.
   * The gate is `requireInventoryPermission("read")`, a grant the `teacher` role
   * already holds, and that permission says nothing about which rows come back —
   * **the predicate is the whole of this procedure's security boundary**, and it
   * lives in the query. So the read discloses the caller's own property and
   * one unavoidable fact about a colleague, which is their name: a teacher cannot
   * act on a colleague's custody of their own equipment without knowing whose
   * custody it is, and `custody.history` already discloses the same name to the
   * same caller.
   *
   * The two `ne`-safe arms are not redundant and neither subsumes the other —
   * `custodianStaffId <> me` alone evaluates to `null` for an item sitting
   * unheld, which would silently drop every such item the school owns. Written
   * as two terms it cannot, and that is the server's arrangement rather than mine
   * to simplify.
   *
   * The search term is the page's, committed the same way and at the same
   * cadence as `myItems`, so a teacher typing a colleague's name into the one
   * search box on the page finds the item they lent them.
   */
  const lentQuery = useQuery(
    orpc.inventory.custody.lent.queryOptions({ input: myItemsInput })
  );

  const lentOut = useMemo(
    () => (lentQuery.data?.items ?? []).filter(matchesFilters),
    [lentQuery.data, matchesFilters]
  );

  /**
   * The category and condition selects' own options, read off the rows the
   * teacher actually has rather than off the school-wide category list —
   * `categories.list` and `options.assignableStaff` are both `adminProcedure`
   * and this page calls neither (see the note above on the three reads this
   * page makes and no more), so a picklist of every category the College owns
   * would offer a teacher choices that filter their own three sections down to
   * nothing. Built from `items` and `lentQuery.data`, unfiltered by the
   * selects themselves — an option a teacher just picked must stay in its own
   * list, or picking it would empty the very control that picked it.
   */
  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) {
      names.add(item.categoryName);
    }
    for (const item of lentQuery.data?.items ?? []) {
      names.add(item.categoryName);
    }
    return [...names].toSorted((a, b) => a.localeCompare(b));
  }, [items, lentQuery.data]);

  const conditionOptions = useMemo(() => {
    const conditions = new Set<string>();
    for (const item of items) {
      conditions.add(item.condition);
    }
    for (const item of lentQuery.data?.items ?? []) {
      conditions.add(item.condition);
    }
    return [...conditions].toSorted((a, b) => a.localeCompare(b));
  }, [items, lentQuery.data]);

  /**
   * A partial key covering **every** input this procedure has been called with,
   * for the reason `inventoryQueryKeys` documents at length: TanStack's
   * `invalidateQueries` does a partial deep match in which the *filter* is the
   * subset, so an empty `input: {}` declares no required keys and therefore
   * matches the filtered read on screen and any other. Building it from
   * `myItemsInput` would leave a teacher who reclaimed an item and then changed
   * the search term looking at a lent list that still contains it.
   *
   * `custody.lent` has no entry in `inventoryQueryKeys` — that table was written
    input: {},
  }).queryKey;

  // ─── Reading the page as one thing ────────────────────────────────────────

  /**
   * The page now has two reads and **one error state**, and that is the honest
   * join rather than a convenience.
   *
   * A failed `custody.lent` cannot be rendered as "you have lent nothing": the
   * section is defined by its absence, so a request that failed and a request
   * that returned zero rows look identical on screen, and a teacher who has lent
   * three things would be told nothing at all while the register says otherwise.
   * Folding the failure into the page's existing `InventoryErrorState` is the
   * only answer that keeps the section's own rule intact, and the sentence that
   * comes out of it ("Could not load the inventory register") is the same
   * sentence that is true of the first read.
   */
  const isError = myItemsQuery.isError || lentQuery.isError;

  /**
   * Named `readError` and not `error`, which is a rename with a reason: this hook
   * has four `onError: (error) =>` callbacks and shadowing a hook-scoped `error`
   * inside all four of them is the kind of thing that reads as "the error from
   * *this* mutation" right up until somebody uses it. The public key stays
   * `error`, because that is what the page's error state is called.
   */
  const readError = myItemsQuery.error ?? lentQuery.error;

  const { refetch: refetchMyItems } = myItemsQuery;
  const { refetch: refetchLent } = lentQuery;

  /**
   * A retry that retries both, because a retry button that fixes one of two
   * reads and leaves the other stale is a control that reports success on a page
   * that is still lying.
   */
  const refetch = useCallback(async () => {
    await Promise.all([refetchMyItems(), refetchLent()]);
  }, [refetchLent, refetchMyItems]);

  // ─── Custody history ──────────────────────────────────────────────────────

  const [historyItem, setHistoryItem] = useState<InventoryItemView | null>(
    null
  );

  const openHistory = useCallback((item: InventoryItemView) => {
    setHistoryItem(item);
  }, []);

  const closeHistory = useCallback(() => {
    setHistoryItem(null);
  }, []);

  const historyQuery = useQuery({
    ...orpc.inventory.custody.history.queryOptions({
      input: { itemId: historyItem?.id ?? "" },
    }),
    enabled: Boolean(historyItem),
  });

  // ─── The no-staff-record ask ──────────────────────────────────────────────

  const accountName = myItemsQuery.data?.staffName ?? null;

  /**
   * The one useful thing a teacher without a staff record can do: hand the
   * office a sentence naming the account, so the administrator knows which
   * login to open. It is a clipboard write rather than a link because there is
   * no page to link to — the fix is a record in the staff register, made by
   * somebody else.
   */
  const copyLinkRequest = useCallback(async () => {
    const request = `Please link the account signed in as "${accountName ?? "this user"}" to my staff record, so that the equipment I am responsible for and the equipment I am holding appear on My Equipment.`;
    try {
      await navigator.clipboard.writeText(request);
      toast.success("Copied — send it to an administrator");
    } catch {
      toast.error("Could not copy it — write the request out instead");
    }
  }, [accountName]);

  // ─── Reporting a problem with an item in your charge ───────────────────────

  /**
   * The duty the "In my charge" empty state raises, discharged.
   *
   * "Knowing where it is, and reporting it if it breaks or goes missing" is the
   * obligation the page promises, and until now the only live write on it was
   * `custody.release` — which is a teacher handing something back, not a teacher
   * saying something is wrong. So the common case (something you are in charge
   * of is broken) had no path, while the rare one (an account with no staff
   * record) got a full escape hatch below.
   *
   * **A clipboard handoff, not a form, and that is the right instrument rather
   * than a shortcut.** The school runs no ticketing system and no mail queue
   * this page could post into — `issues.list` is an administrator's read over
   * requests raised in the app by someone else, and the wiring for a teacher to
   * raise one does not exist. What does exist, on every machine a teacher in
   * this school has, is a clipboard and an office that already takes a message.
   * A teacher needs this in under five seconds: find the row, copy the sentence,
   * send it. A form would take longer than the repair and would be filled in
   * worse.
   *
   * The three facts a storekeeper cannot do without are in the clipboard, not
   * left to the typist: **what** it is (`name`), **which one** it is (`sku`,
   * the tag this page already calls a tag), and **who is saying so** — and the
   * sentence ends on an unfinished clause, because the half only the teacher
   * knows is the half worth having.
   *
   * The toast is the whole of the feedback, exactly as in `copyLinkRequest`:
   * this is a one-shot act with no server round trip and no state left behind,
   * so a `toast` is the only honest report of it. No second `aria-live` region
   * is added on top — sonner already announces in one, and two regions saying
   * the same thing is the double-announcement problem, not an accessibility
   * fix.
   */
  const copyProblemReport = useCallback(
    async (item: InventoryItemView) => {
      const report = `I am reporting a problem with ${item.name} (asset tag ${item.sku}), which I am in charge of. Reported by: ${accountName ?? "a teacher"}. What is wrong with it: `;
      try {
        await navigator.clipboard.writeText(report);
        toast.success("Copied — send it to the store");
      } catch {
        toast.error("Could not copy it — write the message out instead");
      }
    },
    [accountName]
  );

  return {
    // Read state, across both reads. See the note on `isError`: a page with two
    // reads and one error state is the honest join, not a convenience.
    isLoading: myItemsQuery.isLoading,
    isError,
    error: readError,
    refetch,
    total: myItemsQuery.data?.total ?? 0,
    accountName,

    // The three sections
    inCharge,
    inHands,
    /**
     * `custody.lent`'s own rows, and the section renders **only** when this is
     * non-empty. It is deliberately not given a loading skeleton and not given an
     * empty state: "you have lent nothing" is good news, and a heading with a 0
     * beside it is a worse answer than no heading at all — so the absence of the
     * section *is* the message. The cost of that choice is that this read has no
     * placeholder of its own while it is in flight, which is acceptable only
     * because the two sections above it are showing theirs and the page has
     * already said it is loading.
     */
    lentOut,
    /**
     * And `lentTotal` is deliberately **not** handed out. `custody.lent` is
     * `managerStaffId = me AND custodianStaffId IS NOT NULL AND custodianStaffId <>
     * me`, and `listMyItems` is `managerStaffId = me OR custodianStaffId = me`, so
     * every row this read matches is already inside the first read's `total` — the
     * two are a subset and a superset, not two populations, and a caller that
     * added the two would count the same items twice. `total` is the one number
     * that counts this teacher's property, and it is what the page's "Showing X
     * of Y" line is built from.
     */
    isStaffRecordMissing,
    copyLinkRequest,
    copyProblemReport,
    // `staffId` itself is deliberately not handed out. A caller that compared
    // `item.custodianStaffId` to it would be re-deriving `holdsItem` — and the
    // one derivation of that comparison is the thing Fix 1 is about.
    holdsItem,

    // Filters
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    categoryOptions,
    conditionFilter,
    setConditionFilter,
    conditionOptions,
    hasActiveFilters,
    clearFilters,

    // History sheet
    historyItem,
    openHistory,
    closeHistory,
    isHistoryLoading: historyQuery.isLoading,
    isHistoryError: historyQuery.isError,
    historyError: historyQuery.error,
    history: historyQuery.data ?? [],
    refetchHistory: historyQuery.refetch,
  };
};

export type MyEquipmentApi = ReturnType<typeof useMyEquipment>;
