import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type {
  InventoryItemView,
  TransferReason,
} from "@/components/staff/inventory/inventory-types";
import { invalidateInventory } from "@/components/staff/inventory/shared";
import { formatApiErrorMessage } from "@/lib/api-error";
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

/**
 * Everything the "My Equipment" page does, apart from drawing it.
 *
 * ## The four reads, and the one that is not on this page
 *
 * A `teacher` holds `inventory: ["read", "take", "manageOwn"]`, which says
 * nothing about *which rows* any of those reach; every read below is scoped to
 * the caller in its own query, and that scoping is the whole of its security. The
 * page makes four of them:
 *
 * - `custody.myItems` — `managerStaffId = me OR custodianStaffId = me`.
 * - `custody.lent` — `managerStaffId = me AND custodianStaffId IS NOT NULL AND
 *   custodianStaffId <> me`. The third section, and the only read here that names
 *   a colleague; unavoidable, because you cannot act on a colleague's custody of
 *   your own equipment without knowing whose custody it is.
 * - `custody.history` — one item at a time, and only once the teacher has asked.
 * - `custody.takeable` — the shelf, and **no person at all**: nine fields, none
 *   of them a name, a valuation or somebody's holding.
 *
 * **`items.list` is the school-wide register and is not called from here**, by
 * any of them. It is `adminProcedure`, and a picker built on it would hand a
 * teacher the whole storebook — every item with every manager's and custodian's
 * name beside it — through a search box. `inventory.options.teachers` is
 * `adminProcedure` for the same reason and is **not** called from here either;
 * see the note on the hand-on dialog for what that costs and what the honest
 * alternative is.
 *
 * The takeable query lives in `take-item-dialog.tsx` rather than here, because
 * the catalogue is only wanted while that dialog is open — asking for it on page
 * load would be a request the page makes before the teacher has expressed any
 * interest in it.
 */
export const useMyEquipment = () => {
  const queryClient = useQueryClient();
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

  const hasActiveFilters = committedSearch !== "";

  const clearFilters = useCallback(() => {
    writeSearchParams({ [SEARCH_PARAM]: undefined });
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

  const myItemsQueryKey = orpc.inventory.custody.myItems.queryOptions({
    input: myItemsInput,
  }).queryKey;

  const items = useMemo(
    () => myItemsQuery.data?.items ?? [],
    [myItemsQuery.data]
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
    () => items.filter((item) => item.managerStaffId === staffId),
    [items, staffId]
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
          item.custodianStaffId === staffId && item.managerStaffId !== staffId
      ),
    [items, staffId]
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

  const lentOut = useMemo(() => lentQuery.data?.items ?? [], [lentQuery.data]);

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
   * for the admin screens — so it is invalidated by hand here, for the same
   * stated reason the takeable catalogue is invalidated by hand below.
   */
  const lentQueryKey = orpc.inventory.custody.lent.queryOptions({
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

  // ─── Calling an item back off a colleague ─────────────────────────────────

  /**
   * The owner's authority, and a different act from a hand-back.
   *
   * `releaseCustody` is the holder's own voluntary act and it sits on the `take`
   * grant, narrowed to the caller's own custody. This is somebody who is *not*
   * holding the item using their standing as the person answerable for it to take
   * it back off somebody who is, so it is a different verb, a different gate
   * (`manageOwn`), and — the reason it is the only act on this page behind a
   * confirm — it removes a colleague's possession without their consent.
   *
   * The state is reset on open rather than surviving the dialog, so a reclaim
   * reason is never a copy of the last one's and the next call-back is not made
   * with yesterday's words still in the box.
   */
  const [reclaimItem, setReclaimItem] = useState<InventoryItemView | null>(
    null
  );
  const [reclaimReason, setReclaimReason] = useState("");
  const [reclaimNote, setReclaimNote] = useState("");

  const openReclaim = useCallback(
    (item: InventoryItemView) => {
      setReclaimItem(item);
      setReclaimReason("");
      setReclaimNote("");
    },
    [setReclaimItem, setReclaimNote, setReclaimReason]
  );

  const closeReclaim = useCallback(() => {
    setReclaimItem(null);
    setReclaimReason("");
    setReclaimNote("");
  }, [setReclaimItem, setReclaimNote, setReclaimReason]);

  const reclaimMutation = useMutation(
    orpc.inventory.custody.reclaimCustody.mutationOptions({
      onSuccess: async (result, variables) => {
        /*
         * The toast names the person it was taken from and repeats the half that
         * owners most often get wrong: the item did not change owner. The server
         * clears `custodianStaffId` and leaves `managerStaffId` exactly as it
         * was — the whole difference between "call it back" and "hand it on" —
         * and a teacher who has just reached into a colleague's hands deserves to
         * be told that they are still the one answerable for it.
         */
        toast.success(
          result.previousCustodianName
            ? `Called back from ${result.previousCustodianName} — you are still in charge of it`
            : "Called back — you are still in charge of it"
        );
        setReclaimItem(null);
        setReclaimReason("");
        setReclaimNote("");

        await invalidateInventory(queryClient, "custody");

        /*
         * `custody.lent` is not in the `custody` scope's key set — that table was
         * written for the admin screens, whose `custody` scope is a register and
         * a detail read — so the section's own read is invalidated by hand. It
         * is the one key this write must reach: the row leaving `lent` **is** the
         * visible consequence of the reclaim, and a page that still shows it after
         * the colleague's name has been cleared is describing a possession that no
         * longer exists.
         */
        await queryClient.invalidateQueries({ queryKey: lentQueryKey });

        // The trail has a row on it, for the same reason the hand-back re-reads it.
        await queryClient.invalidateQueries({
          queryKey: orpc.inventory.custody.history.queryOptions({
            input: { itemId: variables.itemId },
          }).queryKey,
        });
      },
      onError: (error) => {
        /**
         * The server's own sentence, and there are three distinct ones that send
         * the reader to three different places: the item is not in anybody's
         * custody (a CONFLICT, and the holder handed it back in the meantime), the
         * item is out on a dated loan and has to come back through the borrow
         * return flow (a CONFLICT, and a process, not a permission), and the
         * caller is not in charge of it (a FORBIDDEN naming the owner who is).
         * Guessing at one of them would be the UI inventing a policy the server
         * already states, so the confirm stays open on failure and the refusal is
         * shown as written.
         */
        toast.error(
          formatApiErrorMessage(error, "Could not call this item back")
        );
      },
    })
  );

  /**
   * The write, with the note the confirm collected, and **trimmed and dropped
   * when empty** for the reason the hand-back does it: the server declares
   * `note` as `optional(pipe(string(), minLength(1)))`, so an empty string is not
   * "no note", it is a validation failure on a call-back that otherwise worked.
   * Omitting the key is how "no note" is spelled on this wire.
   *
   * `mutateAsync`, not `mutate`, because the dialog is a *form* and has to be
   * able to keep its reason, its note and its item on a refusal. The rejection
   * arrives after `onError` has toasted the server's sentence, so the dialog's
   * `catch` swallowing it swallows nothing that would otherwise be reported —
   * and the outcome is still toasted exactly once, from the one place that owns
   * the mutation.
   */
  const confirmReclaim = useCallback(
    async (values: { reason: TransferReason; note?: string }) => {
      await reclaimMutation.mutateAsync({
        itemId: reclaimItem?.id ?? "",
        ...values,
      });
    },
    [reclaimItem, reclaimMutation]
  );

  const handleReclaimOpenChange = useCallback(
    (open: boolean) => {
      // A pending reclaim is not dismissable: this confirm is the only thing on
      // screen that says a colleague is about to lose school property, and
      // closing it mid-write would leave the outcome unknown.
      if (!open && !reclaimMutation.isPending) {
        closeReclaim();
      }
    },
    [closeReclaim, reclaimMutation.isPending]
  );

  // ─── Handing the whole thing on ───────────────────────────────────────────

  /**
   * Only the *item* is lifted. The reason and the note are not, and the reason for
   * that is the difference between this and the call-back above: that one is an
   * `AlertDialog` with no `<form>`, so its fields have nowhere to live except here,
   * whereas `TransferOwnershipDialog` is a `Dialog` with a real form, and a form
   * that owns its own fields and resets them on success is the folder's own
   * arrangement (`TransferCustodyDialog` does exactly this). Lifting two more
   * pieces of state for a form that can hold them would be the only state on this
   * page with no consumer.
   */
  const [transferItem, setTransferItem] = useState<InventoryItemView | null>(
    null
  );

  const openTransfer = useCallback((item: InventoryItemView) => {
    setTransferItem(item);
  }, []);

  const closeTransfer = useCallback(() => {
    setTransferItem(null);
  }, []);

  const transferMutation = useMutation(
    orpc.inventory.custody.transferOwnership.mutationOptions({
      onSuccess: async (result, variables) => {
        /*
         * "Moved on", and not "moved": the item is in the same cupboard it was
         * in. `transferOwnership` writes `managerStaffId` and clears
         * `custodianStaffId` — no counter, no unit, no loan — and a toast that said
         * the item had been handed over would be describing a movement that did not
         * happen. The second half is the half the owner needs: the successor is
         * named, because the next time anybody asks where it is, that is the name
         * they will be given.
         */
        toast.success(
          `${result.managerName} is now in charge of it — the item has not moved`
        );
        setTransferItem(null);

        await invalidateInventory(queryClient, "custody");

        /*
         * `custody.lent` again, and for a **double** reason here: the row leaves
         * this section because the holder is cleared, and the same write also ends
         * the caller's own row in `myItems` — which the `custody` scope does cover.
         * The section left holding a row the caller no longer owns anything about
         * is the one the scope table forgot.
         */
        await queryClient.invalidateQueries({ queryKey: lentQueryKey });

        // Two history rows, not one: the change of who is in charge, and the
        // release of the holder. Both land on the same item's trail, and a teacher
        // who reopens History within `staleTime` must not read a trail that
        // predates the change they just made.
        await queryClient.invalidateQueries({
          queryKey: orpc.inventory.custody.history.queryOptions({
            input: { itemId: variables.itemId },
          }).queryKey,
        });
      },
      onError: (error) => {
        /**
         * `transferOwnership` has two refusals worth naming and both are
         * consequential enough that a paraphrase would lose the point: the item
         * is out on a dated loan and the loan has to be closed through the borrow
         * return flow first (a CONFLICT, and a *process*), and the named successor
         * is not somebody school property may be given to — a terminated or
         * office-category staff record, which is `assertStaffIsAssignable`
         * refusing. Both are shown as written.
         */
        toast.error(
          formatApiErrorMessage(error, "Could not hand this item on")
        );
      },
    })
  );

  /**
   * The write.
   *
   * `newOwnerStaffId` arrives from the dialog rather than being read here, and
   * that is the point rather than convenience: the successor is the row's own
   * `custodianStaffId`, the dialog is the thing that *names* it in the preview and
   * the notice above it, and a page that went looking for it separately would be
   * trusting a second copy of the same row. It is also the field the server cannot
   * do without — `newOwnerStaffId` is non-nullable, and this verb has no way to
   * say "nobody" (that is `assignManager`, and it is `update`).
   */
  const confirmTransfer = useCallback(
    async (values: {
      newOwnerStaffId: string;
      reason: TransferReason;
      note?: string;
    }) => {
      await transferMutation.mutateAsync({
        itemId: transferItem?.id ?? "",
        ...values,
      });
    },
    [transferItem, transferMutation]
  );

  const handleTransferOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !transferMutation.isPending) {
        closeTransfer();
      }
    },
    [closeTransfer, transferMutation.isPending]
  );

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

  // ─── Handing an item back ─────────────────────────────────────────────────

  const [releaseItem, setReleaseItem] = useState<InventoryItemView | null>(
    null
  );

  /**
   * The one piece of free text a teacher can attach to a self-service write.
   *
   * `releaseCustody` has collected an optional `note` since it shipped, and it
   * lands in two permanent places: the `inventory_custody_history` row and the
   * ledger transaction. Nothing on this page collected it, so the field existed
   * only for the administrator's dialog — and the one person who actually knows
   * why a projector went back to the store early is the teacher returning it.
   *
   * Reset on open and on close rather than surviving the dialog, so the next
   * hand-back is never a copy of the last one's note.
   */
  const [releaseNote, setReleaseNote] = useState("");

  const openRelease = useCallback(
    (item: InventoryItemView) => {
      setReleaseItem(item);
      setReleaseNote("");
    },
    [setReleaseItem, setReleaseNote]
  );

  const releaseMutation = useMutation(
    orpc.inventory.custody.release.mutationOptions({
      onSuccess: async (_released, variables) => {
        toast.success("Handed back to the store");
        setReleaseItem(null);
        await queryClient.invalidateQueries({ queryKey: myItemsQueryKey });
        // The trail for this item now has a row on it. Leaving the cached read
        // alone would let a teacher who reopens History within `staleTime` read
        // a history that predates the change they just made.
        await queryClient.invalidateQueries({
          queryKey: orpc.inventory.custody.history.queryOptions({
            input: { itemId: variables.itemId },
          }).queryKey,
        });
      },
      onError: (error) => {
        /**
         * The server's own sentence, not a paraphrase.
         *
         * `releaseCustody` distinguishes "it is on loan, close the borrow
         * record first" (a CONFLICT) from "you are not the holder" (a
         * FORBIDDEN) from "it is not in anyone's custody", and those three send
         * a teacher to three different places. Guessing at one of them here
         * would be the UI inventing a policy the server already states, so the
         * dialog stays open on failure and the refusal is shown as written.
         */
        toast.error(
          formatApiErrorMessage(error, "Could not hand this item back")
        );
      },
    })
  );

  /**
   * The write, with the note the dialog collected.
   *
   * Trimmed here and dropped when empty, because the server declares the field
   * `optional(pipe(string(), minLength(1)))`: an empty string is not "no note",
   * it is a validation failure, and a teacher who typed a space would be shown
   * one for a hand-back that otherwise worked. Omitting the key is how "no note"
   * is spelled on this wire.
   */
  const confirmRelease = useCallback(() => {
    if (!releaseItem) {
      return;
    }
    const note = releaseNote.trim();
    releaseMutation.mutate({
      itemId: releaseItem.id,
      ...(note ? { note } : {}),
    });
  }, [releaseItem, releaseNote, releaseMutation]);

  const handleReleaseOpenChange = useCallback(
    (open: boolean) => {
      // A pending release is not dismissable: the dialog is the only thing
      // telling the teacher what is about to happen to school property, and
      // closing it mid-write would leave the outcome unknown.
      if (!open && !releaseMutation.isPending) {
        setReleaseItem(null);
        setReleaseNote("");
      }
    },
    [releaseMutation, setReleaseItem, setReleaseNote]
  );

  // ─── Taking an item off the shelf ─────────────────────────────────────────

  /**
   * The fourth verb, and a page-level action rather than a section one.
   *
   * "In my charge", "In my hands" and "Lent out by me" are the three relationships
   * the page is built to teach, and all three are statements about a tie that
   * **already exists**. Taking something is the opposite: it is how a tie starts.
   * So the state lives here, at the page level, and the catalogue lives in the
   * dialog — the page never holds a list of things the teacher does not have, and
   * putting the action under "In my charge" would teach the wrong taxonomy before
   * the teacher had even chosen an item.
   */
  /**
   * Named `takeOpen` rather than `isTakeOpen`, which is a rename with a reason and
   * not a style preference: the repo's `hook-use-state` rule is `[thing, setThing]`,
   * and `isTakeOpen` / `setTakeOpen` is the one shape that does not satisfy it. The
   * boolean is a plain flag, and the `is` was carrying no information the name
   * `takeOpen` does not.
   */
  const [takeOpen, setTakeOpen] = useState(false);

  const openTake = useCallback(() => {
    setTakeOpen(true);
  }, []);

  const closeTake = useCallback(() => {
    setTakeOpen(false);
  }, []);

  const takeMutation = useMutation(
    orpc.inventory.custody.take.mutationOptions({
      onSuccess: async () => {
        /*
         * The toast is a possession, not a transfer. The register's dialog says
         * "Custody moved to S. Fernando"; there is nobody to name here but the
         * reader, and the useful half of the sentence is the obligation — this
         * is the one row that will now be under "In my hands" with a **Hand
         * back** button beside it, and saying so is what turns a confirmation
         * into an instruction.
         */
        toast.success("It is yours to hold — hand it back when you are done");
        setTakeOpen(false);

        /**
         * By scope, like every other inventory write in this app. `custody`
         * covers the register, the detail read, `myItems`, `custodyHistory` and
         * both ledger tabs, which is the whole of what `takeItem` dirties.
         */
        await invalidateInventory(queryClient, "custody");

        /*
         * The catalogue is the one key the scope does not carry, and it is
         * invalidated by hand for a stated reason rather than left stale.
         *
         * `inventoryQueryKeys` has no entry for `custody.takeable`, because that
         * key was written before this catalogue existed and its table is
         * documented as the exact set a *screen* dirties — the teacher portal is
         * not one of the screens it was built for. Leaving it out is a real
         * omission though: the query carries the app's 60-second `staleTime`, so
         * a teacher who took the projector and reopened the dialog inside a
         * minute would be shown the projector again, and the server would refuse
         * it with "This item is already assigned to you" — the guaranteed failure
         * this feature was built to remove, arriving through the cache instead of
         * through a missing filter. `input: {}` for the same partial-match reason
         * `inventoryQueryKeys` documents, so every search and category is
         * covered, not just the one that happened to be on screen.
         */
        await queryClient.invalidateQueries({
          queryKey:
            orpc.inventory.custody.takeable.listTakeableItems.queryOptions({
              input: {},
            }).queryKey,
        });

        /*
         * **`custody.lent` is deliberately *not* invalidated here, and the reason
         * is that no row can enter or leave it.** Its predicate needs
         * `managerStaffId = me` and a `custodianStaffId` that is not me, and
         * `takeItem` writes exactly one thing: `custodianStaffId = me`. A write
         * that can only produce the one predicate the section excludes cannot
         * change its result, and invalidating it anyway would be a request whose
         * response is known to be identical.
         */
      },
      onError: (error) => {
        /**
         * The server's own sentence, for the same reason as the hand-back, and
         * for a sharper reason here. Between the catalogue read and the click, an
         * item can be taken by somebody else, or go out on loan, and
         * `takeItem` refuses both with a message that names which. "This item is
         * already out on loan, so it cannot be taken from the store" tells the
         * teacher the shelf changed under them; "Could not take this item" tells
         * them nothing and leaves the catalogue on screen looking wrong.
         */
        toast.error(formatApiErrorMessage(error, "Could not take this item"));
      },
    })
  );

  /**
   * The write, as a promise, for the same reason the call-back's is.
   *
   * The catalogue is a form with a selection in it, and a selection is what the
   * teacher has to change after reading the server's sentence — the shelf moved
   * under them, the item went out on loan, somebody else got there first. So the
   * dialog has to be able to keep the list, the term and the row it had chosen,
   * which means it has to be able to await the outcome. `mutateAsync` rejects
   * *after* `onError` has toasted the refusal, so the dialog's `catch` swallows a
   * rejection whose report has already been given exactly once.
   */
  const confirmTake = useCallback(
    async (itemId: string) => {
      await takeMutation.mutateAsync({ itemId });
    },
    [takeMutation]
  );

  const handleTakeOpenChange = useCallback(
    (open: boolean) => {
      // A pending take is not dismissable for the same reason a pending
      // hand-back is: the dialog is the only thing on screen that says what is
      // about to happen to school property, and closing it mid-write would leave
      // the outcome unknown.
      if (!open && !takeMutation.isPending) {
        setTakeOpen(false);
      }
    },
    [takeMutation]
  );

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

    // Hand-back dialog
    releaseItem,
    releaseNote,
    setReleaseNote,
    openRelease,
    handleReleaseOpenChange,
    confirmRelease,
    isReleasePending: releaseMutation.isPending,

    // Call-back dialog
    reclaimItem,
    reclaimReason,
    setReclaimReason,
    reclaimNote,
    setReclaimNote,
    openReclaim,
    handleReclaimOpenChange,
    confirmReclaim,
    isReclaimPending: reclaimMutation.isPending,

    // Hand-on dialog. Only the item, and the reason for that is on the state.
    transferItem,
    openTransfer,
    handleTransferOpenChange,
    confirmTransfer,
    isTransferPending: transferMutation.isPending,

    // Take dialog
    //
    // `isStaffRecordMissing` is the gate the page uses and it is deliberately
    // not duplicated as a `staffId` boolean here: `listMyItems` answers a
    // successful read with `staffId: null` for an account with no staff row, and
    // `takeItem` refuses that account outright ("Your account has no staff record,
    // so equipment cannot be assigned to you"). A button shown in that state is a
    // button that always fails, so the page does not render it — and the catalogue
    // answers `{ items: [], total: 0 }` for the same caller, so the two guards
    // agree rather than one contradicting the other.
    takeOpen,
    openTake,
    closeTake,
    handleTakeOpenChange,
    confirmTake,
    isTakePending: takeMutation.isPending,
  };
};

export type MyEquipmentApi = ReturnType<typeof useMyEquipment>;
